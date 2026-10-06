const Path = require('path')
const fs = require('../libs/fsExtra')
const Logger = require('../Logger')
const Database = require('../Database')
const SocketAuthority = require('../SocketAuthority')
const CacheManager = require('./CacheManager')
const AuthorFinder = require('../finders/AuthorFinder')
const WikipediaAuthors = require('../providers/WikipediaAuthors')
const { downloadImageFile, filePathToPOSIX } = require('../utils/fileUtils')

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Gives books fetched through Discovery the same look they had in the store:
 *  - the store's cover art is saved as the item's cover.jpg before the library scan
 *  - after the scan, authors without a photo get one (Wikipedia/Wikimedia Commons first, then Audible's author page)
 */
class DiscoveryArtwork {
  constructor() {
    this.wikipedia = new WikipediaAuthors()
  }

  /**
   * Save the catalog cover into the imported folder as cover.<ext> so the scanner picks it as the item cover.
   * A cover that came with the download is kept as cover-original.<ext>.
   *
   * @param {string} coverUrl
   * @param {string} destFolder
   * @returns {Promise<string|null>} path of the saved cover
   */
  async saveCatalogCover(coverUrl, destFolder) {
    if (!coverUrl || !/^https?:\/\//i.test(coverUrl)) return null
    const ext = /\.png(\?|$)/i.test(coverUrl) ? 'png' : 'jpg'
    const target = filePathToPOSIX(Path.join(destFolder, `cover.${ext}`))
    const tmp = filePathToPOSIX(Path.join(destFolder, `.cover-download.${ext}`))
    try {
      await downloadImageFile(coverUrl, tmp)
      const entries = await fs.readdir(destFolder)
      for (const entry of entries) {
        if (!/^cover\.[^.]+$/i.test(entry)) continue
        const { name, ext: oldExt } = Path.parse(entry)
        await fs.move(Path.join(destFolder, entry), Path.join(destFolder, `${name}-original${oldExt}`), { overwrite: true })
      }
      await fs.move(tmp, target, { overwrite: true })
      Logger.info(`[DiscoveryArtwork] Saved store cover to "${target}"`)
      return target
    } catch (error) {
      Logger.warn(`[DiscoveryArtwork] Could not save store cover "${coverUrl}": ${error.message}`)
      await fs.remove(tmp).catch(() => {})
      return null
    }
  }

  /**
   * Find an author photo + bio. Wikipedia first (free-licensed Commons images), then Audible's author page via Audnexus.
   * @param {string} name
   * @param {string} [region]
   */
  async findAuthor(name, region = 'us') {
    const wiki = await this.wikipedia.findAuthor(name)
    if (wiki?.image) return wiki
    const audible = await AuthorFinder.findAuthorByName(name, region).catch(() => null)
    if (audible?.image) return { ...audible, source: 'audible' }
    return null
  }

  /**
   * Fill in missing author photos (and bios) for a library item's authors
   * @param {string} libraryItemId
   * @param {string} [region]
   * @returns {Promise<number>} number of authors updated
   */
  async fillAuthorPhotos(libraryItemId, region) {
    const item = await Database.libraryItemModel.findByPk(libraryItemId, { attributes: ['id', 'mediaId', 'mediaType'] })
    if (!item || item.mediaType !== 'book') return 0
    const book = await Database.bookModel.findByPk(item.mediaId, { include: { model: Database.authorModel, through: { attributes: [] } } })
    let updated = 0
    for (const author of book?.authors || []) {
      if (author.imagePath && author.description) continue
      const found = await this.findAuthor(author.name, region)
      if (!found) {
        Logger.debug(`[DiscoveryArtwork] No photo found for author "${author.name}"`)
        continue
      }
      let changed = false
      if (!author.imagePath && found.image) {
        await CacheManager.purgeImageCache(author.id)
        const saved = await AuthorFinder.saveAuthorImage(author.id, found.image)
        if (saved?.path) {
          author.imagePath = saved.path
          changed = true
        }
      }
      if (!author.description && found.description) {
        author.description = found.description
        changed = true
      }
      if (!author.asin && found.asin) {
        author.asin = found.asin
        changed = true
      }
      if (changed) {
        await author.save()
        const numBooks = await Database.bookAuthorModel.getCountForAuthor(author.id)
        SocketAuthority.emitter('author_updated', author.toOldJSONExpanded(numBooks))
        Logger.info(`[DiscoveryArtwork] Added ${found.source} photo/bio for author "${author.name}"`)
        updated++
      }
    }
    return updated
  }

  /**
   * Wait for the scan to bring the imported folder into the library, then fill in author photos.
   * @param {{ scan: (library:Object) => Promise<any>, isLibraryScanning: (id:string) => boolean }} scanner
   * @param {Object} library
   * @param {string} destFolder
   * @param {{ pollMs?: number, attempts?: number }} [options]
   */
  async afterImport(scanner, library, destFolder, options = {}) {
    const pollMs = options.pollMs ?? 15000
    const attempts = options.attempts ?? 40

    // A scan that was already running may have walked the folder before the files landed: wait and scan again
    for (let i = 0; i < attempts && scanner.isLibraryScanning(library.id); i++) await wait(pollMs)
    await scanner.scan(library)

    let item = null
    for (let i = 0; i < attempts && !item; i++) {
      item = await Database.libraryItemModel.findOne({ where: { libraryId: library.id, path: destFolder }, attributes: ['id'] })
      if (!item) await wait(pollMs)
    }
    if (!item) {
      Logger.warn(`[DiscoveryArtwork] Imported folder "${destFolder}" never showed up in the library - skipping author photos`)
      return
    }
    await this.fillAuthorPhotos(item.id, Database.discoverySettings?.catalogRegion || 'us')
  }
}

module.exports = DiscoveryArtwork
