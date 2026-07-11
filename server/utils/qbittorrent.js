const axios = require('axios')
const Logger = require('../Logger')

/**
 * Minimal client for the qBittorrent WebUI API (v2).
 *
 * Handles cookie-based auth manually (axios does not persist cookies in Node) and exposes
 * just what the Discovery download flow needs: login, add a torrent, and poll torrent state.
 *
 * API reference: https://github.com/qbittorrent/qBittorrent/wiki/WebUI-API-(qBittorrent-4.1)
 */
class QBittorrentClient {
  /**
   * @param {string} host - e.g. http://localhost:8080
   * @param {string} username
   * @param {string} password
   */
  constructor(host, username, password) {
    this.host = (host || '').replace(/\/+$/, '')
    this.username = username
    this.password = password
    this.cookie = null
    this.lastError = null
  }

  get isConfigured() {
    return !!this.host
  }

  getClient(timeout = 20000) {
    const headers = {
      // qBittorrent CSRF protection validates the Referer/Origin against the WebUI host
      Referer: this.host,
      Origin: this.host
    }
    if (this.cookie) headers.Cookie = this.cookie
    return axios.create({
      baseURL: `${this.host}/api/v2`,
      timeout,
      headers
    })
  }

  /**
   * Authenticate and cache the SID cookie
   * @returns {Promise<boolean>}
   */
  async login() {
    if (!this.isConfigured) return false
    this.lastError = null
    try {
      const params = new URLSearchParams()
      params.append('username', this.username || '')
      params.append('password', this.password || '')

      const response = await this.getClient(10000).post('/auth/login', params.toString(), {
        // Do not throw on 4xx so we can read qBittorrent's own error body (e.g. ban message)
        validateStatus: () => true,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      })

      const body = typeof response.data === 'string' ? response.data.trim() : ''
      const setCookie = response.headers?.['set-cookie'] || []
      const isOk = response.status >= 200 && response.status < 300

      // Success if qBittorrent established a session (set any cookie) on a 2xx response, or returned
      // the canonical "Ok." body. Different qBittorrent/proxy versions vary: some reply 200 "Ok.",
      // others 204 No Content, and the session cookie name/attributes are not guaranteed to be "SID=".
      // A subsequent authenticated call (e.g. /app/version) validates the cookie is actually good.
      if (isOk && (setCookie.length || body === 'Ok.')) {
        this.cookie = setCookie.map((c) => c.split(';')[0]).join('; ')
        return true
      }

      Logger.error(`[qBittorrent] Login failed - status: ${response.status}, body: "${body}", set-cookie present: ${!!setCookie.length}`)
      if (response.status === 403 || /ban/i.test(body)) {
        this.lastError = 'qBittorrent refused the login (banned IP after failed attempts, or Host-header/CSRF protection). Wait a minute and check WebUI security options.'
      } else if (body === 'Fails.') {
        this.lastError = 'Invalid username or password'
      } else {
        this.lastError = `Unexpected login response (status ${response.status}${body ? `: "${body}"` : ''})`
      }
      return false
    } catch (error) {
      Logger.error(`[qBittorrent] Login request failed: ${error.message}`)
      // Surface a hint for the most common misconfiguration: https URL pointing at an http service
      if (error.message?.includes('wrong version number')) {
        this.lastError = 'SSL error - the host looks like it speaks http, not https. Try an http:// URL.'
      } else {
        this.lastError = error.message
      }
      return false
    }
  }

  /**
   * @returns {Promise<{success:boolean, error?:string, version?:string}>}
   */
  async testConnection() {
    if (!this.isConfigured) {
      return { success: false, error: 'qBittorrent host is required' }
    }
    const loggedIn = await this.login()
    if (!loggedIn) {
      return { success: false, error: this.lastError || 'Failed to authenticate with qBittorrent' }
    }
    try {
      const response = await this.getClient(10000).get('/app/version')
      return { success: true, version: typeof response.data === 'string' ? response.data : undefined }
    } catch (error) {
      Logger.error(`[qBittorrent] version check failed: ${error.message}`)
      return { success: false, error: error.message }
    }
  }

  /**
   * Add a torrent by magnet link or .torrent URL
   *
   * @param {string} urlOrMagnet
   * @param {{category?:string}} [options]
   * @returns {Promise<boolean>}
   */
  async addTorrent(urlOrMagnet, options = {}) {
    if (!this.cookie && !(await this.login())) return false
    try {
      const params = new URLSearchParams()
      params.append('urls', urlOrMagnet)
      if (options.category) params.append('category', options.category)

      const response = await this.getClient().post('/torrents/add', params.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      })
      // qBittorrent returns "Ok." on success, "Fails." on failure
      if (typeof response.data === 'string' && response.data.trim() === 'Fails.') {
        Logger.error('[qBittorrent] addTorrent rejected by qBittorrent')
        return false
      }
      return true
    } catch (error) {
      Logger.error(`[qBittorrent] addTorrent failed: ${error.message}`)
      return false
    }
  }

  /**
   * List torrents, optionally filtered by category
   *
   * @param {string} [category]
   * @returns {Promise<Object[]>} array of torrent info objects (hash, name, progress, state, content_path, save_path)
   */
  async getTorrents(category = null) {
    if (!this.cookie && !(await this.login())) return []
    try {
      const params = {}
      if (category) params.category = category
      const response = await this.getClient().get('/torrents/info', { params })
      return Array.isArray(response.data) ? response.data : []
    } catch (error) {
      Logger.error(`[qBittorrent] getTorrents failed: ${error.message}`)
      return []
    }
  }

  /**
   * Get a single torrent's info by hash
   * @param {string} hash
   * @returns {Promise<Object|null>}
   */
  async getTorrent(hash) {
    if (!hash) return null
    const torrents = await this.getTorrents()
    return torrents.find((t) => t.hash?.toLowerCase() === hash.toLowerCase()) || null
  }
}

/**
 * Extract the BitTorrent v1 info hash from a magnet URI, if present
 * @param {string} magnet
 * @returns {string|null}
 */
function getInfoHashFromMagnet(magnet) {
  if (typeof magnet !== 'string') return null
  const match = magnet.match(/xt=urn:btih:([a-zA-Z0-9]+)/)
  return match ? match[1].toLowerCase() : null
}

module.exports = QBittorrentClient
module.exports.getInfoHashFromMagnet = getInfoHashFromMagnet
