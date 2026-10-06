const Path = require('path')

const Logger = require('../Logger')
const Database = require('../Database')
const SocketAuthority = require('../SocketAuthority')
const fs = require('../libs/fsExtra')

const Prowlarr = require('../providers/Prowlarr')
const QBittorrentClient = require('../utils/qbittorrent')
const { getInfoHashFromMagnet } = require('../utils/qbittorrent')
const LibraryScanner = require('../scanner/LibraryScanner')
const TaskManager = require('./TaskManager')
const DiscoveryStorefront = require('./DiscoveryStorefront')
const { rankReleases, cleanTitle, primaryAuthorSurname } = require('../utils/discoveryReleaseScorer')

const { sanitizeFilename, filePathToPOSIX } = require('../utils/fileUtils')

const POLL_INTERVAL_MS = 10000
const PRUNE_INTERVAL_MS = 60 * 60 * 1000 // hourly
// How often open ("searching") requests are re-checked against the indexers, *arr "wanted" style
const WANTED_SEARCH_INTERVAL_MS = 6 * 60 * 60 * 1000
// Gap between individual wanted searches so a long wanted list doesn't hammer the trackers
const WANTED_SEARCH_GAP_MS = 15 * 1000
// How long finished/failed downloads are kept before being pruned from history
const RETENTION_MS = 24 * 60 * 60 * 1000 // 24 hours
// Consecutive polls a torrent can be missing from qBittorrent before we mark the download failed
const MAX_MISSES = 6

/**
 * Orchestrates the "Discovery" flow: search Prowlarr for releases, hand a chosen release to
 * qBittorrent, watch it to completion, copy the files into a library folder and scan them in.
 *
 * Downloads are persisted (DiscoveryDownload model) so history survives restarts and in-progress
 * jobs resume tracking/import. Transient per-process state (task handle, pre-add hash snapshot,
 * miss counter) is kept in-memory only.
 */
class DiscoveryManager {
  constructor() {
    this.pollTimer = null
    this.pruneTimer = null
    /** @type {Record<string, {preAddHashes: Set<string>|null, task: any, misses: number}>} */
    this.transient = {}
    /** @type {Set<string>} download ids currently importing (in-process re-entry guard) */
    this.importing = new Set()
    this.storefront = new DiscoveryStorefront()
  }

  get settings() {
    return Database.discoverySettings
  }

  getProwlarrClient() {
    return new Prowlarr(this.settings.prowlarrHost, this.settings.prowlarrApiKey)
  }

  getQbClient() {
    return new QBittorrentClient(this.settings.qbittorrentHost, this.settings.qbittorrentUsername, this.settings.qbittorrentPassword)
  }

  getTransient(id) {
    if (!this.transient[id]) this.transient[id] = { preAddHashes: null, task: null, misses: 0 }
    return this.transient[id]
  }

  /**
   * Called on server start: resume tracking of unfinished downloads and start the retention prune loop.
   */
  async init() {
    this.pruneTimer = setInterval(() => this.pruneOld(), PRUNE_INTERVAL_MS)
    void this.pruneOld()

    // Keep looking for requested books that weren't available yet
    this.wantedTimer = setInterval(() => {
      this.searchWanted().catch((error) => Logger.error(`[DiscoveryManager] wanted search failed`, error))
    }, WANTED_SEARCH_INTERVAL_MS)

    try {
      const active = await Database.discoveryDownloadModel.getActive()
      if (active.length) {
        Logger.info(`[DiscoveryManager] Resuming ${active.length} unfinished download(s) after restart`)
        this.ensurePolling()
      }
    } catch (error) {
      Logger.error(`[DiscoveryManager] Failed to resume downloads`, error)
    }
  }

  /**
   * Search indexers for a query string
   * @param {string} query
   * @param {number[]} [categories] - Torznab category ids to search (defaults to audiobook)
   * @returns {Promise<Object[]>}
   */
  async searchReleases(query, categories) {
    if (!this.settings.prowlarrHost || !this.settings.prowlarrApiKey) {
      throw new Error('Prowlarr is not configured')
    }
    return this.getProwlarrClient().search(query, categories?.length ? categories : undefined, this.settings.indexerIds)
  }

  /**
   * Find the best release for a book without user interaction (storefront one-click "Get").
   * Tries "title author-surname" first (tighter), then the title alone, since indexers match on
   * the whole phrase and some releases don't carry the author name.
   *
   * @param {{ title: string, author?: string }} book
   * @param {'audiobook'|'ebook'} mediaType
   * @returns {Promise<{ best: Object|null, candidates: Object[] }>}
   */
  async findBestRelease(book, mediaType = 'audiobook') {
    const categories = mediaType === 'ebook' ? [7020] : [3030]
    const title = cleanTitle(book.title)
    const surname = primaryAuthorSurname(book.author)
    const queries = [...new Set([surname ? `${title} ${surname}` : null, title].filter(Boolean))]
    const options = { mediaType, minSeeders: this.settings.autoGrabMinSeeders, preferFreeleech: this.settings.preferFreeleech }

    let candidates = []
    for (const query of queries) {
      const releases = await this.searchReleases(query, categories)
      candidates = rankReleases(releases, book, options)
      if (candidates.length) break
    }
    return { best: candidates[0] || null, candidates: candidates.slice(0, 10) }
  }

  /**
   * Storefront one-click: pick the best release and either download it (if permitted) or file a
   * request for it.
   *
   * @param {{ user: import('../models/User'), book: Object, mediaType?: 'audiobook'|'ebook', libraryId?: string }} payload
   * @returns {Promise<{ download?: Object, request?: Object, release?: Object }>}
   */
  async grab(payload) {
    const { user, book } = payload
    const mediaType = payload.mediaType === 'ebook' ? 'ebook' : 'audiobook'
    if (!book?.title) throw new Error('A book title is required')

    if (!user.canDiscoveryDownload && !user.canDiscoveryRequest) {
      throw new Error('You do not have permission to download or request books')
    }

    const { best } = await this.findBestRelease(book, mediaType)
    if (!best) {
      // Not on the indexers (yet): file an open request that keeps searching and downloads the
      // book as soon as it shows up, instead of making the user come back and retry
      const request = await this.createRequest({ user, title: book.title, author: book.author, cover: book.cover, mediaType, libraryId: payload.libraryId, release: null })
      return { request, searching: true }
    }
    Logger.info(`[DiscoveryManager] Auto-selected "${best.title}" (score ${best.score}) for "${book.title}"`)

    const common = { release: best, title: book.title, author: book.author, cover: book.cover, mediaType, libraryId: payload.libraryId }
    const release = { ...best, indexer: user.isAdminOrUp ? best.indexer : null }
    if (user.canDiscoveryDownload) {
      return { download: await this.submitDownload({ ...common, userId: user.id }), release }
    }
    if (user.canDiscoveryRequest) {
      return { request: await this.createRequest({ ...common, user }), release }
    }
    throw new Error('You do not have permission to download or request books')
  }

  /**
   * Queue a release for download
   *
   * @param {{ release: Object, title?: string, author?: string, cover?: string, mediaType?: string, libraryId?: string, userId?: string }} payload
   * @returns {Promise<Object>} the created download (client JSON)
   */
  async submitDownload(payload) {
    const { release } = payload
    if (!release || (!release.magnetUrl && !release.downloadUrl)) {
      throw new Error('Release is missing a download link')
    }
    if (!this.settings.isValid) {
      throw new Error('Discovery is not fully configured')
    }

    const libraryId = payload.libraryId || this.settings.defaultLibraryId

    const qb = this.getQbClient()
    if (!(await qb.login())) {
      throw new Error('Failed to authenticate with qBittorrent')
    }

    // Snapshot existing torrents in the category so we can identify the one we add
    const category = this.settings.qbittorrentCategory
    const existing = await qb.getTorrents(category)
    const preAddHashes = new Set(existing.map((t) => t.hash?.toLowerCase()).filter(Boolean))

    // Prefer magnet (works without an extra fetch); fall back to the (Prowlarr-proxied) download url
    const link = release.magnetUrl || release.downloadUrl
    const magnetHash = release.magnetUrl ? getInfoHashFromMagnet(release.magnetUrl) : null

    const added = await qb.addTorrent(link, { category })
    if (!added) {
      throw new Error('qBittorrent rejected the torrent')
    }

    const download = await Database.discoveryDownloadModel.create({
      userId: payload.userId || null,
      libraryId,
      title: payload.title || release.title,
      author: payload.author || '',
      cover: payload.cover || null,
      releaseTitle: release.title,
      indexer: release.indexer || '',
      protocol: release.protocol || 'torrent',
      size: release.size || 0,
      mediaType: payload.mediaType || release.mediaType || 'audiobook',
      torrentHash: magnetHash,
      status: 'downloading',
      progress: 0,
      startedAt: new Date()
    })

    // Create a task for the global task list (transient - not restored after restart)
    const task = TaskManager.createAndAddTask('download-audiobook', { text: 'Downloading audiobook', key: 'MessageDownloadingAudiobook' }, { text: `Downloading "${download.title}".`, key: 'MessageTaskDownloadingAudiobookDescription', subs: [download.title] }, false, { libraryId })

    const t = this.getTransient(download.id)
    t.preAddHashes = preAddHashes
    t.task = task

    SocketAuthority.emitter('audiobook_download_started', download.toClientJSON())
    this.ensurePolling()

    return download.toClientJSON()
  }

  ensurePolling() {
    if (this.pollTimer) return
    this.pollTimer = setInterval(() => {
      this.poll().catch((error) => Logger.error(`[DiscoveryManager] poll error`, error))
    }, POLL_INTERVAL_MS)
  }

  stopPolling() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer)
      this.pollTimer = null
    }
  }

  async poll() {
    const active = await Database.discoveryDownloadModel.getActive()
    // Only poll rows that map to a torrent; 'importing' rows are re-checked in case an import was interrupted
    const pollable = active.filter((d) => ['pending', 'downloading', 'stalled', 'importing'].includes(d.status))
    if (!pollable.length) {
      this.stopPolling()
      return
    }

    const qb = this.getQbClient()
    if (!(await qb.login())) return // qBittorrent unreachable - retry next tick

    const torrents = await qb.getTorrents(this.settings.qbittorrentCategory)

    for (const d of pollable) {
      if (this.importing.has(d.id)) continue
      const t = this.getTransient(d.id)

      // Resolve the torrent hash for downloads added via .torrent url (no magnet infohash)
      if (!d.torrentHash && t.preAddHashes) {
        const newTorrent = torrents.find((tor) => !t.preAddHashes.has(tor.hash?.toLowerCase()))
        if (newTorrent) {
          d.torrentHash = newTorrent.hash?.toLowerCase()
          await d.save()
        }
      }

      const torrent = d.torrentHash ? torrents.find((tor) => tor.hash?.toLowerCase() === d.torrentHash) : null
      if (!torrent) {
        t.misses++
        // If we knew the hash (or exhausted resolution) and it's gone, the torrent was removed
        if (t.misses >= MAX_MISSES) {
          await this.failDownload(d, 'Torrent not found in qBittorrent (removed?)')
        }
        continue
      }
      t.misses = 0

      const progress = typeof torrent.progress === 'number' ? torrent.progress : d.progress || 0
      const size = torrent.size ? Number(torrent.size) : d.size

      if (progress >= 1) {
        await this.importDownload(d, torrent)
        continue
      }

      // Update in-flight status
      const newStatus = this.mapTorrentStatus(torrent.state)
      if (newStatus === 'failed') {
        await this.failDownload(d, `qBittorrent reported "${torrent.state}"`)
        continue
      }
      d.progress = progress
      d.size = size
      d.status = newStatus
      await d.save()
      SocketAuthority.emitter('audiobook_download_progress', d.toClientJSON())
    }

    // Stop the loop if nothing is left to watch
    const stillActive = await Database.discoveryDownloadModel.getActive()
    if (!stillActive.some((d) => ['pending', 'downloading', 'stalled', 'importing'].includes(d.status))) {
      this.stopPolling()
    }
  }

  /**
   * Map a qBittorrent torrent state to our download status
   * @param {string} state
   * @returns {'downloading'|'stalled'|'failed'}
   */
  mapTorrentStatus(state) {
    if (state === 'error' || state === 'missingFiles') return 'failed'
    if (['stalledDL', 'queuedDL', 'metaDL', 'pausedDL', 'checkingResumeData'].includes(state)) return 'stalled'
    return 'downloading'
  }

  /**
   * Copy the completed download into a library folder and trigger a scan
   * @param {import('../models/DiscoveryDownload')} d
   * @param {Object} torrent - qBittorrent torrent info
   */
  async importDownload(d, torrent) {
    if (this.importing.has(d.id)) return
    this.importing.add(d.id)

    const t = this.getTransient(d.id)
    try {
      d.status = 'importing'
      await d.save()

      const library = await Database.libraryModel.findByIdWithFolders(d.libraryId)
      if (!library) throw new Error(`Library "${d.libraryId}" not found`)
      const folder = library.libraryFolders?.[0]
      if (!folder) throw new Error(`Library "${library.name}" has no folders`)

      // The download client's paths may not match the abs filesystem (e.g. Docker), so resolve the
      // completed content relative to the admin-provided downloadPath.
      // qBittorrent's reported "name" (often the magnet display name from the indexer) can differ
      // from the actual folder it wrote, so prefer the basename of "content_path" (the real path to
      // the saved content), then fall back to name/save_path.
      const candidates = []
      if (torrent.content_path) candidates.push(Path.basename(torrent.content_path))
      if (torrent.name) candidates.push(torrent.name)
      // Some qB versions expose the real save dir; its basename can also be the content folder
      if (torrent.save_path) candidates.push(Path.basename(torrent.save_path.replace(/[\\/]+$/, '')))

      let sourcePath = null
      for (const candidate of [...new Set(candidates.filter(Boolean))]) {
        const p = filePathToPOSIX(Path.join(this.settings.downloadPath, candidate))
        if (await fs.pathExists(p)) {
          sourcePath = p
          break
        }
      }
      if (!sourcePath) {
        throw new Error(`Completed download not found under "${this.settings.downloadPath}" (looked for: ${candidates.join(' | ')}) - check the configured download path`)
      }

      const folderName = sanitizeFilename(d.author ? `${d.author} - ${d.title}` : d.title) || sanitizeFilename(Path.basename(sourcePath))
      const destFolder = filePathToPOSIX(Path.join(folder.path, folderName))
      await fs.ensureDir(destFolder)

      const stat = await fs.stat(sourcePath)
      if (stat.isDirectory()) {
        await fs.copy(sourcePath, destFolder, { overwrite: false, errorOnExist: false })
      } else {
        await fs.copy(sourcePath, filePathToPOSIX(Path.join(destFolder, Path.basename(sourcePath))), { overwrite: false, errorOnExist: false })
      }

      Logger.info(`[DiscoveryManager] Imported "${d.title}" into "${destFolder}" - scanning library`)

      // Scan the library so the new item enters the catalogue (independent of the watcher)
      LibraryScanner.scan(library).catch((error) => {
        Logger.error(`[DiscoveryManager] Library scan after import failed`, error)
      })

      d.progress = 1
      d.status = 'completed'
      d.finishedAt = new Date()
      await d.save()

      if (t.task) {
        t.task.setFinished()
        TaskManager.taskFinished(t.task)
      }
      SocketAuthority.emitter('audiobook_download_finished', d.toClientJSON())
    } catch (error) {
      Logger.error(`[DiscoveryManager] Failed to import "${d.title}"`, error)
      await this.failDownload(d, error.message)
    } finally {
      this.importing.delete(d.id)
    }
  }

  /**
   * Mark a download failed and emit
   * @param {import('../models/DiscoveryDownload')} d
   * @param {string} message
   */
  async failDownload(d, message) {
    d.status = 'failed'
    d.errorMsg = message
    d.finishedAt = new Date()
    await d.save()

    const t = this.getTransient(d.id)
    if (t.task) {
      t.task.setFailed({ text: 'Failed', key: 'MessageTaskFailed' })
      TaskManager.taskFinished(t.task)
    }
    SocketAuthority.emitter('audiobook_download_finished', d.toClientJSON())
  }

  /**
   * Remove a single download from history
   * @param {string} id
   * @returns {Promise<boolean>}
   */
  async clearDownload(id) {
    const removed = await Database.discoveryDownloadModel.destroy({ where: { id } })
    delete this.transient[id]
    return removed > 0
  }

  /**
   * Remove all finished/failed downloads (optionally scoped to a library)
   * @param {string} [libraryId]
   * @returns {Promise<number>}
   */
  async clearFinished(libraryId = null) {
    const where = { status: ['completed', 'failed'] }
    if (libraryId) where.libraryId = libraryId
    return Database.discoveryDownloadModel.destroy({ where })
  }

  async pruneOld() {
    try {
      const removed = await Database.discoveryDownloadModel.pruneOld(RETENTION_MS)
      if (removed) Logger.debug(`[DiscoveryManager] Pruned ${removed} download(s) older than 24h`)
    } catch (error) {
      Logger.error(`[DiscoveryManager] pruneOld failed`, error)
    }
  }

  async getDownloadsForClient(libraryId = null, isAdmin = false) {
    void this.pruneOld()
    const rows = await Database.discoveryDownloadModel.getForClient(RETENTION_MS)
    return rows
      .filter((r) => !libraryId || r.libraryId === libraryId)
      .map((r) => {
        const json = r.toClientJSON()
        // The release source (indexer) is admin-only
        if (!isAdmin && json.release) json.release.indexer = null
        return json
      })
  }

  // ---- Requests ----------------------------------------------------------------------------

  /**
   * Create a download request. Auto-approved (immediately downloaded) if the requester has the
   * autoApprove permission, otherwise queued for admin approval.
   *
   * @param {{ user: import('../models/User'), release: Object, title?: string, author?: string, cover?: string, mediaType?: string, libraryId?: string }} payload
   * @returns {Promise<Object>} request client JSON
   */
  async createRequest(payload) {
    const { user, release } = payload
    // A request may name a specific release, or just a book ("wanted") that we search for
    if (release && !release.magnetUrl && !release.downloadUrl) {
      throw new Error('Release is missing a download link')
    }
    if (!release && !payload.title) {
      throw new Error('A book title is required')
    }
    const libraryId = payload.libraryId || this.settings.defaultLibraryId

    // Don't stack duplicate open requests for the same book
    if (!release) {
      const open = await Database.discoveryRequestModel.getPending()
      const duplicate = open.find((r) => r.title?.toLowerCase() === payload.title.toLowerCase() && (r.mediaType || 'audiobook') === (payload.mediaType || 'audiobook'))
      if (duplicate) return duplicate.toClientJSON()
    }

    let request = await Database.discoveryRequestModel.create({
      userId: user.id,
      libraryId,
      title: payload.title || release.title,
      author: payload.author || '',
      cover: payload.cover || null,
      mediaType: payload.mediaType || release?.mediaType || 'audiobook',
      release: release || null,
      status: 'pending'
    })

    // Users who can download directly don't need an approval step for their own requests
    if (user.discoveryAutoApprove || user.canDiscoveryDownload) {
      request = await this.approveRequest(request.id, user)
    } else {
      request = await this.reloadRequest(request.id)
      SocketAuthority.adminEmitter('discovery_request_updated', request.toClientJSON())
    }
    return request.toClientJSON()
  }

  reloadRequest(id) {
    return Database.discoveryRequestModel.findByPk(id, {
      include: { model: Database.userModel, attributes: ['id', 'username'] }
    })
  }

  /**
   * Approve a pending request: start the download (attributed to the original requester).
   * @param {string} requestId
   * @param {import('../models/User')} adminUser
   * @returns {Promise<import('../models/DiscoveryRequest')>}
   */
  async approveRequest(requestId, adminUser) {
    const request = await Database.discoveryRequestModel.findByPk(requestId)
    if (!request) throw new Error('Request not found')
    if (request.status !== 'pending') throw new Error('Request is not pending')

    request.approvedByUserId = adminUser?.id || null
    if (!request.release) {
      // Book-only request: search now; if nothing's out there yet, keep it open and keep looking
      const fulfilled = await this.fulfillWanted(request)
      if (!fulfilled) {
        request.status = 'searching'
        await request.save()
      }
      const reloaded = await this.reloadRequest(request.id)
      SocketAuthority.adminEmitter('discovery_request_updated', reloaded.toClientJSON())
      return reloaded
    }

    const download = await this.submitDownload({
      release: request.release,
      title: request.title,
      author: request.author,
      cover: request.cover,
      mediaType: request.mediaType,
      libraryId: request.libraryId,
      userId: request.userId
    })

    request.status = 'approved'
    request.downloadId = download.id
    request.resolvedAt = new Date()
    await request.save()

    const reloaded = await this.reloadRequest(request.id)
    SocketAuthority.adminEmitter('discovery_request_updated', reloaded.toClientJSON())
    return reloaded
  }

  /**
   * Try to find and download a release for a book-only request.
   * @param {import('../models/DiscoveryRequest')} request
   * @returns {Promise<boolean>} true if a download was started
   */
  async fulfillWanted(request) {
    if (!this.settings.isValid) return false
    let best = null
    try {
      ;({ best } = await this.findBestRelease({ title: request.title, author: request.author }, request.mediaType === 'ebook' ? 'ebook' : 'audiobook'))
    } catch (error) {
      Logger.error(`[DiscoveryManager] Wanted search for "${request.title}" failed: ${error.message}`)
      return false
    }
    if (!best) {
      Logger.debug(`[DiscoveryManager] "${request.title}" not available yet - will keep looking`)
      return false
    }

    const download = await this.submitDownload({
      release: best,
      title: request.title,
      author: request.author,
      cover: request.cover,
      mediaType: request.mediaType,
      libraryId: request.libraryId,
      userId: request.userId
    })
    Logger.info(`[DiscoveryManager] Requested book "${request.title}" is now available - downloading "${best.title}"`)
    request.release = best
    request.status = 'approved'
    request.downloadId = download.id
    request.resolvedAt = new Date()
    await request.save()
    return true
  }

  /**
   * Re-check every open ("searching") request against the indexers.
   */
  async searchWanted() {
    if (this.searchingWanted || !this.settings.isValid) return
    this.searchingWanted = true
    try {
      const wanted = await Database.discoveryRequestModel.findAll({ where: { status: 'searching' }, order: [['createdAt', 'ASC']] })
      if (wanted.length) Logger.info(`[DiscoveryManager] Checking ${wanted.length} requested book(s) for new releases`)
      for (const [i, request] of wanted.entries()) {
        if (i > 0) await new Promise((resolve) => setTimeout(resolve, WANTED_SEARCH_GAP_MS))
        if (await this.fulfillWanted(request)) {
          const reloaded = await this.reloadRequest(request.id)
          SocketAuthority.adminEmitter('discovery_request_updated', reloaded.toClientJSON())
        }
      }
    } finally {
      this.searchingWanted = false
    }
  }

  /**
   * Deny a pending request
   * @param {string} requestId
   * @param {import('../models/User')} adminUser
   * @returns {Promise<Object>} request client JSON
   */
  async denyRequest(requestId, adminUser) {
    const request = await Database.discoveryRequestModel.findByPk(requestId)
    if (!request) throw new Error('Request not found')
    if (!['pending', 'searching'].includes(request.status)) throw new Error('Request is not open')

    request.status = 'denied'
    request.approvedByUserId = adminUser?.id || null
    request.resolvedAt = new Date()
    await request.save()

    const reloaded = await this.reloadRequest(request.id)
    SocketAuthority.adminEmitter('discovery_request_updated', reloaded.toClientJSON())
    return reloaded.toClientJSON()
  }

  /**
   * @param {import('../models/User')} user
   * @returns {Promise<Object[]>}
   */
  async getRequestsForClient(user) {
    const where = user.isAdminOrUp ? {} : { userId: user.id }
    const rows = await Database.discoveryRequestModel.getRecent(RETENTION_MS, where)
    return rows.map((r) => {
      const json = r.toClientJSON()
      // The release source (indexer) is admin-only
      if (!user.isAdminOrUp && json.release) json.release.indexer = null
      return json
    })
  }

  /**
   * Aggregate per-user activity stats: downloads, requests, listen time, read time.
   * @param {string} userId
   * @returns {Promise<Object>}
   */
  async getUserStats(userId) {
    const [downloadsTotal, downloadsCompleted, requestsTotal, timeListening, readingRows] = await Promise.all([
      Database.discoveryDownloadModel.count({ where: { userId } }),
      Database.discoveryDownloadModel.count({ where: { userId, status: 'completed' } }),
      Database.discoveryRequestModel.count({ where: { userId } }),
      Database.playbackSessionModel.sum('timeListening', { where: { userId } }),
      // timeReading lives in mediaProgress.extraData JSON, so sum it in JS
      Database.mediaProgressModel.findAll({ where: { userId }, attributes: ['extraData'] })
    ])

    let timeReading = 0
    for (const mp of readingRows) timeReading += Number(mp.extraData?.timeReading) || 0

    return {
      downloads: { total: downloadsTotal, completed: downloadsCompleted },
      requests: { total: requestsTotal },
      timeListening: timeListening || 0,
      timeReading: Math.round(timeReading)
    }
  }
}
module.exports = DiscoveryManager
