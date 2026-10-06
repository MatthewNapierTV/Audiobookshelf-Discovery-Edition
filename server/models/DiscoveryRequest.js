const { DataTypes, Model, Op } = require('sequelize')

/**
 * A Discovery request: a user asks for a release to be downloaded. Admins approve/deny a queue,
 * unless the requester has the auto-approve permission (then it converts to a download immediately).
 */
class DiscoveryRequest extends Model {
  constructor(values, options) {
    super(values, options)

    /** @type {string} */
    this.id
    /** @type {string} */
    this.userId
    /** @type {string} */
    this.libraryId
    /** @type {string} */
    this.title
    /** @type {string} */
    this.author
    /** @type {string} */
    this.cover
    /** @type {string} */
    this.mediaType
    /** @type {Object} full chosen release (magnet/download url, indexer, size, etc.) */
    this.release
    /** @type {string} pending | searching | approved | denied | completed | failed  (searching = approved, waiting for a release to appear on the indexers) */
    this.status
    /** @type {string} */
    this.approvedByUserId
    /** @type {string} */
    this.downloadId
    /** @type {Date} */
    this.resolvedAt
    /** @type {Date} */
    this.createdAt
    /** @type {Date} */
    this.updatedAt
  }

  static PENDING = 'pending'
  static SEARCHING = 'searching'

  /**
   * @param {Object} [where]
   * @returns {Promise<DiscoveryRequest[]>}
   */
  static getPending(where = {}) {
    return this.findAll({
      where: { status: [DiscoveryRequest.PENDING, DiscoveryRequest.SEARCHING], ...where },
      include: { model: this.sequelize.models.user, attributes: ['id', 'username'] },
      order: [['createdAt', 'ASC']]
    })
  }

  /**
   * Recent requests (pending always, resolved within window)
   * @param {number} retentionMs
   * @param {Object} [where]
   */
  static getRecent(retentionMs, where = {}) {
    const cutoff = new Date(Date.now() - retentionMs)
    return this.findAll({
      where: {
        ...where,
        [Op.or]: [{ status: [DiscoveryRequest.PENDING, DiscoveryRequest.SEARCHING] }, { resolvedAt: { [Op.gte]: cutoff } }]
      },
      include: { model: this.sequelize.models.user, attributes: ['id', 'username'] },
      order: [['createdAt', 'DESC']]
    })
  }

  /**
   * Initialize model
   * @param {import('../Database').sequelize} sequelize
   */
  static init(sequelize) {
    super.init(
      {
        id: {
          type: DataTypes.UUID,
          defaultValue: DataTypes.UUIDV4,
          primaryKey: true
        },
        libraryId: DataTypes.UUID,
        title: DataTypes.STRING,
        author: DataTypes.STRING,
        cover: DataTypes.STRING,
        mediaType: DataTypes.STRING,
        release: DataTypes.JSON,
        status: DataTypes.STRING,
        approvedByUserId: DataTypes.UUID,
        downloadId: DataTypes.UUID,
        resolvedAt: DataTypes.DATE
      },
      {
        sequelize,
        modelName: 'discoveryRequest'
      }
    )

    const { user } = sequelize.models
    user.hasMany(DiscoveryRequest, { onDelete: 'SET NULL' })
    DiscoveryRequest.belongsTo(user)
  }

  toClientJSON() {
    return {
      id: this.id,
      userId: this.userId,
      username: this.user?.username || null,
      libraryId: this.libraryId,
      title: this.title,
      author: this.author,
      cover: this.cover,
      mediaType: this.mediaType,
      release: this.release
        ? {
            title: this.release?.title,
            indexer: this.release?.indexer,
            protocol: this.release?.protocol,
            size: this.release?.size || 0,
            seeders: this.release?.seeders ?? null
          }
        : null,
      status: this.status,
      downloadId: this.downloadId,
      createdAt: this.createdAt ? this.createdAt.valueOf() : null,
      resolvedAt: this.resolvedAt ? this.resolvedAt.valueOf() : null
    }
  }
}

module.exports = DiscoveryRequest
