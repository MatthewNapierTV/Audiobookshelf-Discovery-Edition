const Logger = require('../Logger')
const Database = require('../Database')
const AudibleCatalog = require('../providers/AudibleCatalog')
const { normalize, cleanTitle, primaryAuthorSurname } = require('../utils/discoveryReleaseScorer')

// Genre shelves shown on the storefront, matched by name against the marketplace's top level
// Audible categories. If a category can't be resolved the shelf falls back to a keyword search.
const FEATURED_GENRES = [
  { key: 'scifi-fantasy', match: ['science fiction', 'fantasy'], keywords: 'science fiction fantasy' },
  { key: 'mystery', match: ['mystery', 'thriller'], keywords: 'thriller' },
  { key: 'literature', match: ['literature', 'fiction'], keywords: 'literary fiction' },
  { key: 'romance', match: ['romance'], keywords: 'romance' },
  { key: 'biography', match: ['biograph', 'memoir'], keywords: 'memoir' },
  { key: 'history', match: ['history'], keywords: 'history' },
  { key: 'self-development', match: ['self development', 'personal development', 'self-help'], keywords: 'self help' },
  { key: 'business', match: ['business', 'money'], keywords: 'business' },
  { key: 'teen', match: ['teen', 'young adult'], keywords: 'young adult' }
]

const NEW_RELEASE_WINDOW_MS = 180 * 24 * 60 * 60 * 1000
const MAX_AUTHOR_SHELVES = 3
const MAX_SERIES_LOOKUPS = 8

/**
 * Builds the Audible-style storefront for the Discovery page: curated shelves of books that are
 * not yet in your library, annotated with whether they're already owned/downloading/requested.
 */
class DiscoveryStorefront {
  get settings() {
    return Database.discoverySettings
  }

  get catalog() {
    return new AudibleCatalog(this.settings.catalogRegion || 'us')
  }

  /**
   * Snapshot of what's already in the libraries the user can access, used to hide/flag owned
   * books and to personalize shelves.
   *
   * @param {import('../models/User')} user
   */
  async getLibrarySnapshot(user) {
    const libraryIds = (await Database.libraryModel.getAllLibraryIds()).filter((id) => user.checkCanAccessLibrary(id))
    const snapshot = { asins: new Set(), titleKeys: new Set(), titles: new Set(), authors: [], series: [], genres: [] }
    if (!libraryIds.length) return snapshot

    const replacements = { libraryIds }
    const [books] = await Database.sequelize.query(
      `SELECT b.id, b.title, b.asin, b.genres, li.createdAt,
        (SELECT group_concat(a.name, '|') FROM bookAuthors ba JOIN authors a ON a.id = ba.authorId WHERE ba.bookId = b.id) AS authors
       FROM books b JOIN libraryItems li ON li.mediaId = b.id
       WHERE li.mediaType = 'book' AND li.libraryId IN (:libraryIds)`,
      { replacements }
    )
    const [seriesRows] = await Database.sequelize.query(
      `SELECT s.name, bs.sequence, li.createdAt FROM bookSeries bs
       JOIN series s ON s.id = bs.seriesId
       JOIN libraryItems li ON li.mediaId = bs.bookId
       WHERE li.libraryId IN (:libraryIds)`,
      { replacements }
    )

    const authorCounts = {}
    const genreCounts = {}
    for (const b of books) {
      if (b.asin) snapshot.asins.add(String(b.asin).toUpperCase())
      const titleNorm = normalize(cleanTitle(b.title))
      if (titleNorm) {
        snapshot.titles.add(titleNorm)
        const authors = (b.authors || '').split('|').filter(Boolean)
        for (const author of authors) {
          snapshot.titleKeys.add(`${titleNorm}|${primaryAuthorSurname(author)}`)
          authorCounts[author] = authorCounts[author] || { name: author, count: 0, latest: 0 }
          authorCounts[author].count++
          authorCounts[author].latest = Math.max(authorCounts[author].latest, new Date(b.createdAt).valueOf() || 0)
        }
      }
      let genres = b.genres
      if (typeof genres === 'string') {
        try {
          genres = JSON.parse(genres)
        } catch {
          genres = []
        }
      }
      for (const g of Array.isArray(genres) ? genres : []) genreCounts[g] = (genreCounts[g] || 0) + 1
    }

    // Most collected authors first, recency as tie breaker
    snapshot.authors = Object.values(authorCounts).sort((a, b) => b.count - a.count || b.latest - a.latest)
    snapshot.genres = Object.entries(genreCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([g]) => g)

    // Highest owned sequence per series, most recently added series first
    const seriesMap = {}
    for (const row of seriesRows) {
      const seq = parseFloat(row.sequence)
      const entry = (seriesMap[row.name] = seriesMap[row.name] || { name: row.name, maxSequence: 0, latest: 0, sequences: new Set() })
      if (!isNaN(seq)) {
        entry.maxSequence = Math.max(entry.maxSequence, seq)
        entry.sequences.add(seq)
      }
      entry.latest = Math.max(entry.latest, new Date(row.createdAt).valueOf() || 0)
    }
    snapshot.series = Object.values(seriesMap)
      .filter((s) => s.maxSequence > 0)
      .sort((a, b) => b.latest - a.latest)

    return snapshot
  }

  /**
   * Titles currently downloading or awaiting approval, keyed by normalized title
   * @returns {Promise<Map<string, 'downloading'|'requested'>>}
   */
  async getInFlight() {
    const inFlight = new Map()
    const [downloads, requests] = await Promise.all([Database.discoveryDownloadModel.getActive(), Database.discoveryRequestModel.getPending()])
    for (const r of requests) inFlight.set(normalize(cleanTitle(r.title)), 'requested')
    for (const d of downloads) inFlight.set(normalize(cleanTitle(d.title)), 'downloading')
    return inFlight
  }

  /**
   * @param {Object} book - storefront card
   * @param {Object} snapshot
   * @returns {boolean}
   */
  isOwned(book, snapshot) {
    if (book.asin && snapshot.asins.has(String(book.asin).toUpperCase())) return true
    const titleNorm = normalize(cleanTitle(book.title))
    if (!titleNorm) return false
    const surname = primaryAuthorSurname(book.author)
    return surname ? snapshot.titleKeys.has(`${titleNorm}|${surname}`) : snapshot.titles.has(titleNorm)
  }

  /**
   * Flag each card with its library status and drop duplicates
   * @param {Object[]} books
   * @param {Object} snapshot
   * @param {Map<string,string>} inFlight
   */
  annotate(books, snapshot, inFlight) {
    const seen = new Set()
    const out = []
    for (const book of books) {
      if (seen.has(book.asin)) continue
      seen.add(book.asin)
      let status = null
      if (this.isOwned(book, snapshot)) status = 'owned'
      else status = inFlight.get(normalize(cleanTitle(book.title))) || null
      out.push({ ...book, status })
    }
    return out
  }

  /**
   * Resolve the featured genre shelves to marketplace category ids
   * @param {{id:string,name:string}[]} categories
   */
  resolveGenres(categories) {
    const used = new Set()
    return FEATURED_GENRES.map((g) => {
      const category = categories.find((c) => !used.has(c.id) && g.match.some((m) => c.name.toLowerCase().includes(m)))
      if (category) used.add(category.id)
      return { ...g, categoryId: category?.id || null, name: category?.name || null }
    })
  }

  /**
   * Build the storefront: personalized shelves first, then charts and genres.
   *
   * @param {import('../models/User')} user
   * @returns {Promise<{shelves: Object[], genres: {id:string,name:string}[]}>}
   */
  async getStorefront(user) {
    const catalog = this.catalog
    const [snapshot, inFlight, categories] = await Promise.all([this.getLibrarySnapshot(user), this.getInFlight(), catalog.getCategories()])

    const shelfPromises = []
    const addShelf = (id, title, subtitle, promise, opts = {}) => {
      shelfPromises.push(
        promise
          .then((books) => ({ id, title, subtitle, ...opts, books: books || [] }))
          .catch((error) => {
            Logger.error(`[DiscoveryStorefront] Shelf "${id}" failed: ${error.message}`)
            return { id, title, subtitle, ...opts, books: [] }
          })
      )
    }

    // --- Personalized ---
    if (snapshot.series.length) {
      addShelf('next-in-series', 'Continue your series', 'The next book in series you already have', this.getNextInSeries(snapshot))
    }
    for (const author of snapshot.authors.slice(0, MAX_AUTHOR_SHELVES)) {
      addShelf(`author-${normalize(author.name).replace(/ /g, '-')}`, `More from ${author.name}`, `Because you have ${author.count} of their book${author.count === 1 ? '' : 's'}`, catalog.getProducts({ author: author.name, sortBy: 'BestSellers', num: 25 }), {
        browse: { author: author.name, sortBy: 'BestSellers' }
      })
    }

    // --- Charts ---
    addShelf('best-sellers', 'Best sellers', 'What everyone is listening to right now', catalog.getProducts({ sortBy: 'BestSellers', num: 30 }), { browse: { sortBy: 'BestSellers' }, hero: true, ranked: true })
    addShelf('new-releases', 'New & noteworthy', 'Popular releases from the last few months', this.getNewReleases(catalog), { browse: { sortBy: '-ReleaseDate' } })
    addShelf('top-rated', 'Top rated', 'Highest rated by listeners', catalog.getProducts({ sortBy: 'AvgRating', num: 30 }), { browse: { sortBy: 'AvgRating' } })

    // --- Genres (ordered by what's most common in your library) ---
    const genres = this.resolveGenres(categories)
    const libraryGenres = snapshot.genres.map((g) => g.toLowerCase())
    const genreRank = (g) => {
      const idx = libraryGenres.findIndex((lg) => g.match.some((m) => lg.includes(m)))
      return idx === -1 ? Number.MAX_SAFE_INTEGER : idx
    }
    for (const genre of [...genres].sort((a, b) => genreRank(a) - genreRank(b))) {
      const opts = genre.categoryId ? { categoryId: genre.categoryId } : { keywords: genre.keywords }
      addShelf(`genre-${genre.key}`, genre.name || genre.keywords.replace(/\b\w/g, (c) => c.toUpperCase()), null, catalog.getProducts({ ...opts, sortBy: 'BestSellers', num: 25 }), {
        browse: { ...opts, sortBy: 'BestSellers' }
      })
    }

    const shelves = (await Promise.all(shelfPromises))
      .map((shelf) => {
        const books = this.annotate(shelf.books, snapshot, inFlight)
        // Personalized shelves only make sense for books you don't have yet
        const filtered = shelf.id.startsWith('author-') || shelf.id === 'next-in-series' ? books.filter((b) => b.status !== 'owned') : books
        return { ...shelf, books: filtered }
      })
      .filter((shelf) => shelf.books.length)

    return { shelves, genres: categories }
  }

  /**
   * Popular recent releases: best sellers released in the last ~6 months, newest first.
   * Falls back to the raw "newest" sort when the chart has too few recent titles.
   *
   * @param {AudibleCatalog} catalog
   */
  async getNewReleases(catalog) {
    const best = await catalog.getProducts({ sortBy: 'BestSellers', num: 50 })
    const cutoff = Date.now() - NEW_RELEASE_WINDOW_MS
    const recent = best.filter((b) => b.releaseDate && new Date(b.releaseDate).valueOf() >= cutoff && new Date(b.releaseDate).valueOf() <= Date.now())
    if (recent.length >= 6) {
      return recent.sort((a, b) => new Date(b.releaseDate) - new Date(a.releaseDate))
    }
    return catalog.getProducts({ sortBy: '-ReleaseDate', num: 30 })
  }

  /**
   * For series in the library, find the next book you don't have yet
   * @param {Object} snapshot
   */
  async getNextInSeries(snapshot) {
    const catalog = this.catalog
    const lookups = snapshot.series.slice(0, MAX_SERIES_LOOKUPS).map(async (series) => {
      const results = await catalog.getProducts({ keywords: series.name, sortBy: 'Relevance', num: 30 })
      const seriesNorm = normalize(series.name)
      const candidates = []
      for (const book of results) {
        const match = book.series.find((s) => normalize(s.series) === seriesNorm)
        const seq = parseFloat(match?.sequence)
        if (!match || isNaN(seq) || seq <= series.maxSequence || series.sequences.has(seq)) continue
        if (this.isOwned(book, snapshot)) continue
        candidates.push({ book, seq })
      }
      candidates.sort((a, b) => a.seq - b.seq)
      return candidates[0] ? { ...candidates[0].book, reason: `Book ${candidates[0].book.series.find((s) => normalize(s.series) === seriesNorm).sequence} of ${series.name}` } : null
    })
    return (await Promise.all(lookups)).filter(Boolean)
  }

  /**
   * "See all" for a shelf or a genre: up to 50 books
   *
   * @param {import('../models/User')} user
   * @param {{ categoryId?: string, keywords?: string, author?: string, sortBy?: string }} opts
   */
  async browse(user, opts) {
    const allowedSorts = ['BestSellers', '-ReleaseDate', 'AvgRating', 'Relevance']
    const sortBy = allowedSorts.includes(opts.sortBy) ? opts.sortBy : 'BestSellers'
    const [snapshot, inFlight, books] = await Promise.all([this.getLibrarySnapshot(user), this.getInFlight(), this.catalog.getProducts({ categoryId: opts.categoryId, keywords: opts.keywords, author: opts.author, sortBy, num: 50 })])
    return this.annotate(books, snapshot, inFlight)
  }
}

module.exports = DiscoveryStorefront
