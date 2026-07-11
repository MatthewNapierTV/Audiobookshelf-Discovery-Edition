const { areEquivalent, copyValue } = require('../../utils')

/**
 * Settings for the "Discovery" feature: searching indexers via Prowlarr and
 * downloading audiobook releases through a qBittorrent instance.
 *
 * Stored as a single settings row (id "discovery-settings"), mirroring EmailSettings.
 */
class DiscoverySettings {
  constructor(settings = null) {
    this.id = 'discovery-settings'

    this.enabled = false

    // Prowlarr (indexer aggregator - finds releases)
    this.prowlarrHost = null
    this.prowlarrApiKey = null

    // qBittorrent (download client - fetches the release)
    this.qbittorrentHost = null
    this.qbittorrentUsername = null
    this.qbittorrentPassword = null
    this.qbittorrentCategory = 'audiobookshelf'

    // Completed-download directory of qBittorrent as seen by the abs server (used to import files)
    this.downloadPath = null

    // Target book library that downloads are imported into
    this.defaultLibraryId = null

    if (settings) {
      this.construct(settings)
    }
  }

  construct(settings) {
    this.enabled = !!settings.enabled
    this.prowlarrHost = settings.prowlarrHost || null
    this.prowlarrApiKey = settings.prowlarrApiKey || null
    this.qbittorrentHost = settings.qbittorrentHost || null
    this.qbittorrentUsername = settings.qbittorrentUsername || null
    this.qbittorrentPassword = settings.qbittorrentPassword || null
    this.qbittorrentCategory = settings.qbittorrentCategory || 'audiobookshelf'
    this.downloadPath = settings.downloadPath || null
    this.defaultLibraryId = settings.defaultLibraryId || null
  }

  toJSON() {
    return {
      id: this.id,
      enabled: this.enabled,
      prowlarrHost: this.prowlarrHost,
      prowlarrApiKey: this.prowlarrApiKey,
      qbittorrentHost: this.qbittorrentHost,
      qbittorrentUsername: this.qbittorrentUsername,
      qbittorrentPassword: this.qbittorrentPassword,
      qbittorrentCategory: this.qbittorrentCategory,
      downloadPath: this.downloadPath,
      defaultLibraryId: this.defaultLibraryId
    }
  }

  /**
   * True if the minimum configuration required to search & download is present
   * @returns {boolean}
   */
  get isValid() {
    return !!(this.enabled && this.prowlarrHost && this.prowlarrApiKey && this.qbittorrentHost && this.downloadPath && this.defaultLibraryId)
  }

  update(payload) {
    if (!payload) return false

    if (payload.enabled !== undefined) payload.enabled = !!payload.enabled

    // Normalize hosts by stripping a trailing slash
    for (const key of ['prowlarrHost', 'qbittorrentHost']) {
      if (typeof payload[key] === 'string') payload[key] = payload[key].trim().replace(/\/+$/, '')
    }

    let hasUpdates = false

    const json = this.toJSON()
    for (const key in json) {
      if (key === 'id') continue

      if (payload[key] !== undefined && !areEquivalent(payload[key], json[key])) {
        this[key] = copyValue(payload[key])
        hasUpdates = true
      }
    }

    return hasUpdates
  }
}
module.exports = DiscoverySettings
