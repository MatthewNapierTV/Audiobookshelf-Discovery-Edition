const { DataTypes, Model, Op } = require('sequelize')

/**
 * A Discovery download job (audiobook/ebook fetched via Prowlarr + qBittorrent).
 * Persisted so history survives restarts and in-progress jobs can resume tracking/import.
 */
class DiscoveryDownload extends Model {
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
    this.releaseTitle
    /** @type {string} */
    this.indexer
    /** @type {string} */
    this.protocol
    /** @type {number} */
    this.size
    /** @type {string} */
    this.mediaType
    /** @type {string} */
    this.torrentHash
    /** @type {string} */
    this.status
    /** @type {number} */
    this.progress
    /** @type {string} */
    this.errorMsg
    /** @type {Object} */
    this.extraData
    /** @type {Date} */
    this.startedAt
    /** @type {Date} */
    this.finishedAt
    /** @type {Date} */
    this.createdAt
    /** @type {Date} */
    this.updatedAt
  }

  static TERMINAL_STATUSES = ['completed', 'failed']

  /**
   * Non-terminal downloads (still being worked on)
   * @returns {Promise<DiscoveryDownload[]>}
   */
  static getActive() {
    return this.findAll({
      where: {
        status: { [Op.notIn]: DiscoveryDownload.TERMINAL_STATUSES }
      }
    })
  }

  /**
   * Active downloads + terminal downloads finished within the retention window
   * @param {number} retentionMs
   * @returns {Promise<DiscoveryDownload[]>}
   */
  static getForClient(retentionMs) {
    const cutoff = new Date(Date.now() - retentionMs)
    return this.findAll({
      where: {
        [Op.or]: [{ status: { [Op.notIn]: DiscoveryDownload.TERMINAL_STATUSES } }, { finishedAt: { [Op.gte]: cutoff } }]
      },
      order: [['startedAt', 'DESC']]
    })
  }

  /**
   * Delete terminal downloads older than the retention window
   * @param {number} retentionMs
   * @returns {Promise<number>} number of rows removed
   */
  static pruneOld(retentionMs) {
    const cutoff = new Date(Date.now() - retentionMs)
    return this.destroy({
      where: {
        status: { [Op.in]: DiscoveryDownload.TERMINAL_STATUSES },
        finishedAt: { [Op.lt]: cutoff }
      }
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
        releaseTitle: DataTypes.STRING,
        indexer: DataTypes.STRING,
        protocol: DataTypes.STRING,
        size: DataTypes.BIGINT,
        mediaType: DataTypes.STRING,
        torrentHash: DataTypes.STRING,
        status: DataTypes.STRING, // pending | downloading | stalled | importing | completed | failed
        progress: DataTypes.FLOAT,
        errorMsg: DataTypes.TEXT,
        extraData: DataTypes.JSON,
        startedAt: DataTypes.DATE,
        finishedAt: DataTypes.DATE
      },
      {
        sequelize,
        modelName: 'discoveryDownload'
      }
    )

    const { user } = sequelize.models
    user.hasMany(DiscoveryDownload, { onDelete: 'SET NULL' })
    DiscoveryDownload.belongsTo(user)
  }

  toClientJSON() {
    return {
      id: this.id,
      userId: this.userId,
      libraryId: this.libraryId,
      title: this.title,
      author: this.author,
      cover: this.cover,
      release: {
        title: this.releaseTitle,
        indexer: this.indexer,
        protocol: this.protocol,
        size: this.size ? Number(this.size) : 0
      },
      mediaType: this.mediaType,
      status: this.status,
      progress: this.progress || 0,
      size: this.size ? Number(this.size) : 0,
      error: this.errorMsg || null,
      startedAt: this.startedAt ? this.startedAt.valueOf() : null,
      finishedAt: this.finishedAt ? this.finishedAt.valueOf() : null
    }
  }
}

module.exports = DiscoveryDownload
