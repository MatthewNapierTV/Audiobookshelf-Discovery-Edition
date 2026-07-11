const axios = require('axios')
const Logger = require('../Logger')

/**
 * Client for a Prowlarr instance.
 *
 * Prowlarr aggregates torrent/usenet indexers and exposes a unified search API.
 * It only *finds* releases - the actual download is handed off to a download client (qBittorrent).
 *
 * API reference: https://prowlarr.com/docs/api/
 */
class Prowlarr {
  /**
   * @param {string} host - e.g. http://localhost:9696
   * @param {string} apiKey
   */
  constructor(host, apiKey) {
    this.host = (host || '').replace(/\/+$/, '')
    this.apiKey = apiKey
  }

  get isConfigured() {
    return !!(this.host && this.apiKey)
  }

  getClient(timeout = 20000) {
    return axios.create({
      baseURL: `${this.host}/api/v1`,
      timeout,
      headers: {
        'X-Api-Key': this.apiKey
      }
    })
  }

  /**
   * Verify the host/apiKey are valid by hitting the system status endpoint
   * @returns {Promise<{success:boolean, error?:string, version?:string}>}
   */
  async testConnection() {
    if (!this.isConfigured) {
      return { success: false, error: 'Prowlarr host and API key are required' }
    }
    try {
      const response = await this.getClient(10000).get('/system/status')
      return { success: true, version: response.data?.version }
    } catch (error) {
      const status = error.response?.status
      let message = status === 401 ? 'Invalid API key' : error.message
      if (error.message?.includes('wrong version number')) {
        message = 'SSL error - the host looks like it speaks http, not https. Try an http:// URL.'
      }
      Logger.error(`[Prowlarr] testConnection failed: ${message}`)
      return { success: false, error: message }
    }
  }

  /**
   * Search indexers for audiobook releases
   *
   * @param {string} query
   * @param {number[]} [categories] - Newznab/Torznab category ids. Defaults to 3030 (Audiobook).
   * @returns {Promise<Object[]>} normalized releases
   */
  async search(query, categories = [3030]) {
    if (!this.isConfigured) {
      Logger.error('[Prowlarr] search called but not configured')
      return []
    }
    if (!query) return []

    try {
      // Prowlarr fans a query out to every enabled indexer; with many indexers (and FlareSolverr in
      // the mix) this can take well over the default 20s. Use a generous timeout so slow indexers
      // don't cause an empty result that the user has to retry several times.
      const response = await this.getClient(90000).get('/search', {
        params: {
          query,
          type: 'search',
          limit: 100,
          categories
        },
        // axios 0.27 serializes arrays as categories[]=; Prowlarr expects repeated categories=
        paramsSerializer: (params) => {
          const parts = []
          for (const key in params) {
            const value = params[key]
            if (Array.isArray(value)) value.forEach((v) => parts.push(`${key}=${encodeURIComponent(v)}`))
            else parts.push(`${key}=${encodeURIComponent(value)}`)
          }
          return parts.join('&')
        }
      })

      if (!Array.isArray(response.data)) {
        Logger.warn('[Prowlarr] search returned unexpected payload')
        return []
      }

      return response.data.map((r) => this.normalizeRelease(r)).filter((r) => r.downloadUrl || r.magnetUrl)
    } catch (error) {
      Logger.error(`[Prowlarr] search failed for "${query}": ${error.message}`)
      return []
    }
  }

  /**
   * Normalize a Prowlarr release into the shape the client & download flow expect
   * @param {Object} r
   */
  normalizeRelease(r) {
    const catObjs = Array.isArray(r.categories) ? r.categories : []
    const categoryIds = catObjs.map((c) => (typeof c === 'object' ? c.id : c)).map(Number).filter((n) => !isNaN(n))
    const categoryNames = catObjs.map((c) => (typeof c === 'object' ? c.name : c)).filter(Boolean)

    return {
      guid: r.guid,
      title: r.title,
      indexer: r.indexer,
      indexerId: r.indexerId,
      size: typeof r.size === 'number' ? r.size : 0,
      seeders: typeof r.seeders === 'number' ? r.seeders : null,
      leechers: typeof r.leechers === 'number' ? r.leechers : null,
      protocol: r.protocol || 'torrent',
      publishDate: r.publishDate || null,
      downloadUrl: r.downloadUrl || null,
      magnetUrl: r.magnetUrl || null,
      infoUrl: r.infoUrl || null,
      categories: categoryNames,
      mediaType: Prowlarr.classifyMediaType(categoryIds, r.title)
    }
  }

  /**
   * Classify a release as an audiobook or ebook using Torznab/Newznab categories, with a
   * filename/keyword fallback when categories are ambiguous.
   *
   * Torznab categories: 3000-3999 = Audio (3030 = Audiobook), 7000-7999 = Books (7020 = EBook)
   *
   * @param {number[]} categoryIds
   * @param {string} title
   * @returns {'audiobook'|'ebook'|'other'}
   */
  static classifyMediaType(categoryIds = [], title = '') {
    const t = (title || '').toLowerCase()

    // Explicit signals in the title are the most reliable (and match what the user actually sees).
    // Audio file formats / the word "audiobook" are unambiguous.
    if (/\b(m4b|m4a|mp3|flac)\b/.test(t) || /audio ?book/.test(t)) return 'audiobook'
    // Ebook/comic file formats or the word "ebook"
    if (/\b(epub|mobi|azw3|azw|pdf|cbz|cbr)\b/.test(t) || /e-?book/.test(t)) return 'ebook'

    // Fall back to the indexer's Torznab categories when the title gives no hint.
    if (categoryIds.some((id) => id >= 3000 && id < 4000)) return 'audiobook'
    if (categoryIds.some((id) => id >= 7000 && id < 8000)) return 'ebook'
    return 'other'
  }
}
module.exports = Prowlarr
