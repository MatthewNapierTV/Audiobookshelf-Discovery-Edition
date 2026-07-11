const { Request, Response, NextFunction } = require('express')
const Logger = require('../Logger')
const Database = require('../Database')
const { getQueryParamAsString } = require('../utils')

const Prowlarr = require('../providers/Prowlarr')
const QBittorrentClient = require('../utils/qbittorrent')

/**
 * @typedef RequestUserObject
 * @property {import('../models/User')} user
 *
 * @typedef {Request & RequestUserObject} RequestWithUser
 */

class DiscoveryController {
  constructor() {}

  /**
   * GET: /api/discovery/settings
   * @param {RequestWithUser} req
   * @param {Response} res
   */
  getSettings(req, res) {
    res.json({
      settings: Database.discoverySettings
    })
  }

  /**
   * PATCH: /api/discovery/settings
   * @param {RequestWithUser} req
   * @param {Response} res
   */
  async updateSettings(req, res) {
    const updated = Database.discoverySettings.update(req.body)
    if (updated) {
      await Database.updateSetting(Database.discoverySettings)
    }
    res.json({
      settings: Database.discoverySettings
    })
  }

  /**
   * POST: /api/discovery/test
   * Validate Prowlarr + qBittorrent connectivity. Uses values from the request body if provided,
   * otherwise falls back to the saved settings.
   *
   * @param {RequestWithUser} req
   * @param {Response} res
   */
  async testConnections(req, res) {
    const body = req.body || {}
    const settings = Database.discoverySettings

    const prowlarr = new Prowlarr(body.prowlarrHost ?? settings.prowlarrHost, body.prowlarrApiKey ?? settings.prowlarrApiKey)
    const qb = new QBittorrentClient(body.qbittorrentHost ?? settings.qbittorrentHost, body.qbittorrentUsername ?? settings.qbittorrentUsername, body.qbittorrentPassword ?? settings.qbittorrentPassword)

    const [prowlarrResult, qbittorrentResult] = await Promise.all([prowlarr.testConnection(), qb.testConnection()])

    res.json({
      prowlarr: prowlarrResult,
      qbittorrent: qbittorrentResult
    })
  }

  /**
   * GET: /api/discovery/releases?query=...
   * @this {import('../routers/ApiRouter')}
   * @param {RequestWithUser} req
   * @param {Response} res
   */
  async searchReleases(req, res) {
    const query = getQueryParamAsString(req.query, 'query', '', true)
    if (!query) {
      return res.status(400).json({ error: 'Query is required' })
    }

    // Map requested media types to Torznab category ids. "types" is a comma-separated list.
    const typeCategories = { audiobook: [3030], ebook: [7020] }
    const typesParam = getQueryParamAsString(req.query, 'types', 'audiobook')
    const categories = []
    typesParam
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .forEach((t) => {
        if (typeCategories[t]) categories.push(...typeCategories[t])
      })
    if (!categories.length) categories.push(...typeCategories.audiobook)

    try {
      const releases = await this.discoveryManager.searchReleases(query, categories)
      res.json({ releases })
    } catch (error) {
      Logger.error(`[DiscoveryController] searchReleases failed: ${error.message}`)
      res.status(500).json({ error: error.message })
    }
  }

  /**
   * POST: /api/discovery/download
   * Body: { release, title, author, cover, libraryId }
   *
   * @this {import('../routers/ApiRouter')}
   * @param {RequestWithUser} req
   * @param {Response} res
   */
  async download(req, res) {
    const { release, title, author, cover, libraryId } = req.body || {}
    if (!release) {
      return res.status(400).json({ error: 'release is required' })
    }

    // Validate the target library exists and the user can access it
    const targetLibraryId = libraryId || Database.discoverySettings.defaultLibraryId
    if (!targetLibraryId) {
      return res.status(400).json({ error: 'No target library configured' })
    }
    if (!req.user.checkCanAccessLibrary(targetLibraryId)) {
      return res.sendStatus(403)
    }
    // Direct download requires the discovery-download permission; others must request instead
    if (!req.user.canDiscoveryDownload) {
      return res.status(403).json({ error: 'You do not have permission to download directly. Submit a request instead.' })
    }

    try {
      const job = await this.discoveryManager.submitDownload({ release, title, author, cover, mediaType: release.mediaType, libraryId: targetLibraryId, userId: req.user.id })
      Logger.info(`[DiscoveryController] User "${req.user.username}" started download "${job.title}"`)
      res.json({ download: job })
    } catch (error) {
      Logger.error(`[DiscoveryController] download failed: ${error.message}`)
      res.status(500).json({ error: error.message })
    }
  }

  /**
   * GET: /api/discovery/downloads
   * @this {import('../routers/ApiRouter')}
   * @param {RequestWithUser} req
   * @param {Response} res
   */
  async getDownloads(req, res) {
    res.json({
      enabled: Database.discoverySettings.isValid,
      canDownload: req.user.canDiscoveryDownload,
      canRequest: req.user.canDiscoveryRequest,
      isAdmin: req.user.isAdminOrUp,
      downloads: await this.discoveryManager.getDownloadsForClient(null, req.user.isAdminOrUp)
    })
  }

  /**
   * POST: /api/discovery/requests
   * Body: { release, title, author, cover, libraryId }
   *
   * @this {import('../routers/ApiRouter')}
   * @param {RequestWithUser} req
   * @param {Response} res
   */
  async createRequest(req, res) {
    if (!req.user.canDiscoveryRequest) {
      return res.status(403).json({ error: 'You do not have permission to request downloads' })
    }
    const { release, title, author, cover, libraryId } = req.body || {}
    if (!release) return res.status(400).json({ error: 'release is required' })

    const targetLibraryId = libraryId || Database.discoverySettings.defaultLibraryId
    if (!targetLibraryId || !req.user.checkCanAccessLibrary(targetLibraryId)) {
      return res.sendStatus(403)
    }

    try {
      const request = await this.discoveryManager.createRequest({ user: req.user, release, title, author, cover, mediaType: release.mediaType, libraryId: targetLibraryId })
      Logger.info(`[DiscoveryController] User "${req.user.username}" requested "${request.title}" (status: ${request.status})`)
      res.json({ request })
    } catch (error) {
      Logger.error(`[DiscoveryController] createRequest failed: ${error.message}`)
      res.status(500).json({ error: error.message })
    }
  }

  /**
   * GET: /api/discovery/requests
   * Admins see all recent requests; users see their own.
   *
   * @this {import('../routers/ApiRouter')}
   * @param {RequestWithUser} req
   * @param {Response} res
   */
  async getRequests(req, res) {
    res.json({ requests: await this.discoveryManager.getRequestsForClient(req.user) })
  }

  /**
   * POST: /api/discovery/requests/:id/approve  (admin)
   *
   * @this {import('../routers/ApiRouter')}
   * @param {RequestWithUser} req
   * @param {Response} res
   */
  async approveRequest(req, res) {
    try {
      const request = await this.discoveryManager.approveRequest(req.params.id, req.user)
      res.json({ request: request.toClientJSON() })
    } catch (error) {
      Logger.error(`[DiscoveryController] approveRequest failed: ${error.message}`)
      res.status(500).json({ error: error.message })
    }
  }

  /**
   * POST: /api/discovery/requests/:id/deny  (admin)
   *
   * @this {import('../routers/ApiRouter')}
   * @param {RequestWithUser} req
   * @param {Response} res
   */
  async denyRequest(req, res) {
    try {
      const request = await this.discoveryManager.denyRequest(req.params.id, req.user)
      res.json({ request })
    } catch (error) {
      Logger.error(`[DiscoveryController] denyRequest failed: ${error.message}`)
      res.status(500).json({ error: error.message })
    }
  }

  /**
   * DELETE: /api/discovery/downloads/:id
   * Clear a single download from history
   *
   * @this {import('../routers/ApiRouter')}
   * @param {RequestWithUser} req
   * @param {Response} res
   */
  async clearDownload(req, res) {
    const removed = await this.discoveryManager.clearDownload(req.params.id)
    if (!removed) return res.sendStatus(404)
    res.sendStatus(200)
  }

  /**
   * DELETE: /api/discovery/downloads
   * Clear all finished/failed downloads (optionally scoped to ?libraryId=)
   *
   * @this {import('../routers/ApiRouter')}
   * @param {RequestWithUser} req
   * @param {Response} res
   */
  async clearFinishedDownloads(req, res) {
    const libraryId = getQueryParamAsString(req.query, 'libraryId', '') || null
    const removed = await this.discoveryManager.clearFinished(libraryId)
    res.json({ removed })
  }

  /**
   * GET: /api/discovery/stats/:userId?
   * Per-user activity stats. Users can view their own; admins can view anyone's.
   *
   * @this {import('../routers/ApiRouter')}
   * @param {RequestWithUser} req
   * @param {Response} res
   */
  async getUserStats(req, res) {
    const userId = req.params.userId || req.user.id
    if (userId !== req.user.id && !req.user.isAdminOrUp) {
      return res.sendStatus(403)
    }
    try {
      const stats = await this.discoveryManager.getUserStats(userId)
      res.json({ stats })
    } catch (error) {
      Logger.error(`[DiscoveryController] getUserStats failed: ${error.message}`)
      res.status(500).json({ error: error.message })
    }
  }

  /**
   * @param {RequestWithUser} req
   * @param {Response} res
   * @param {NextFunction} next
   */
  adminMiddleware(req, res, next) {
    if (!req.user.isAdminOrUp) {
      return res.sendStatus(403)
    }
    next()
  }
}
module.exports = new DiscoveryController()
