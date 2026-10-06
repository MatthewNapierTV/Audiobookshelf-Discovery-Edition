const Logger = require('../Logger')
const Database = require('../Database')
const AudibleCatalog = require('../providers/AudibleCatalog')
const AppleBooksCharts = require('../providers/AppleBooksCharts')
const OpenLibraryCatalog = require('../providers/OpenLibraryCatalog')
const { normalize, cleanTitle, primaryAuthorSurname } = require('../utils/discoveryReleaseScorer')

// Genre shelves shown on the storefront, matched by name against the marketplace's top level
// Audible categories. If a category can't be resolved the shelf falls back to a keyword search.
const FEATURED_GENRES = [
  { key: 'faith', match: ['religion', 'spirituality', 'christian'], keywords: 'christian' },
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
      const key = book.asin || book.id
      if (seen.has(key)) continue
      seen.add(key)
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
   * Build the home/storefront feed - Netflix/Audible style:
   *  - hero: a handful of featured new & popular titles with artwork and blurbs
   *  - top10: today's best-seller chart (rendered with big rank numerals)
   *  - shelves: personalized rows interleaved with charts from several sources and genre rows
   *
   * Sources: Audible catalog (charts, genres, series/author lookups), Apple Books top charts
   * (audiobooks + ebooks) and Open Library trending. Each source fails independently.
   *
   * @param {import('../models/User')} user
   * @returns {Promise<{hero: Object[], top10: Object|null, shelves: Object[], genres: {id:string,name:string}[]}>}
   */
  async getStorefront(user) {
    const catalog = this.catalog
    const apple = new AppleBooksCharts(this.settings.catalogRegion || 'us')
    const openLibrary = new OpenLibraryCatalog()
    const [snapshot, inFlight, categories] = await Promise.all([this.getLibrarySnapshot(user), this.getInFlight(), catalog.getCategories()])

    const make = (id, title, subtitle, promise, opts = {}) =>
      promise
        .then((books) => ({ id, title, subtitle, ...opts, books: books || [] }))
        .catch((error) => {
          Logger.error(`[DiscoveryStorefront] Shelf "${id}" failed: ${error.message}`)
          return { id, title, subtitle, ...opts, books: [] }
        })

    // --- Personalized ---
    const personal = []
    if (snapshot.series.length) {
      personal.push(make('next-in-series', 'Continue your series', 'The next book in series you already have', this.getNextInSeries(snapshot)))
    }
    const authorShelves = snapshot.authors.slice(0, MAX_AUTHOR_SHELVES).map((author) =>
      make(`author-${normalize(author.name).replace(/ /g, '-')}`, `Because you have ${author.name}`, `More from an author you collect`, catalog.getProducts({ author: author.name, sortBy: 'BestSellers', num: 25 }), {
        browse: { author: author.name, sortBy: 'BestSellers' }
      })
    )

    // --- Charts from several sources ---
    const bestSellers = make('best-sellers', 'Top 10 audiobooks today', 'The Audible best-seller chart', catalog.getProducts({ sortBy: 'BestSellers', num: 30 }), { browse: { sortBy: 'BestSellers' }, ranked: true })
    const newReleases = make('new-releases', 'New & noteworthy', 'Popular releases from the last few months', this.getNewReleases(catalog), { browse: { sortBy: '-ReleaseDate' } })
    const topRated = make('top-rated', 'Top rated', 'Highest rated by listeners', catalog.getProducts({ sortBy: 'AvgRating', num: 30 }), { browse: { sortBy: 'AvgRating' } })
    const appleAudio = make('apple-audiobooks', 'Top audiobooks on Apple Books', 'Updated daily from the Apple Books charts', apple.getTop('audio-books', 30), { source: 'apple' })
    const appleEbooks = make('apple-ebooks', 'Top ebooks on Apple Books', 'Best-selling ebooks right now', apple.getTop('books', 30), { source: 'apple' })
    const trending = make('trending', 'Trending with readers this week', 'What readers are adding on Open Library', openLibrary.getTrending('weekly', 30), { source: 'openlibrary' })

    // --- Genres (ordered by what's most common in your library) ---
    const genres = this.resolveGenres(categories)
    const libraryGenres = snapshot.genres.map((g) => g.toLowerCase())
    const genreRank = (g) => {
      const idx = libraryGenres.findIndex((lg) => g.match.some((m) => lg.includes(m)))
      return idx === -1 ? Number.MAX_SAFE_INTEGER : idx
    }
    const genreShelves = [...genres]
      .sort((a, b) => genreRank(a) - genreRank(b))
      .map((genre) => {
        const opts = genre.categoryId ? { categoryId: genre.categoryId } : { keywords: genre.keywords }
        return make(`genre-${genre.key}`, genre.name || genre.keywords.replace(/\b\w/g, (c) => c.toUpperCase()), null, catalog.getProducts({ ...opts, sortBy: 'BestSellers', num: 25 }), {
          browse: { ...opts, sortBy: 'BestSellers' },
          genre: true
        })
      })

    // Interleave like a streaming home screen: personal -> fresh -> charts -> genres, with the
    // remaining personal rows sprinkled between genres so the page doesn't feel like one long list
    const ordered = [...personal, newReleases, authorShelves[0], trending, appleAudio, genreShelves[0], genreShelves[1], authorShelves[1], appleEbooks, genreShelves[2], topRated, authorShelves[2], ...genreShelves.slice(3)].filter(Boolean)

    const [top10Raw, ...resolved] = await Promise.all([bestSellers, ...ordered])
    const annotateShelf = (shelf) => {
      const books = this.annotate(shelf.books, snapshot, inFlight)
      // Personalized shelves only make sense for books you don't have yet
      const filtered = shelf.id.startsWith('author-') || shelf.id === 'next-in-series' ? books.filter((b) => b.status !== 'owned') : books
      return { ...shelf, books: filtered }
    }
    const shelves = resolved.map(annotateShelf).filter((shelf) => shelf.books.length)
    const top10 = annotateShelf(top10Raw)
    top10.books = top10.books.slice(0, 10)

    const hero = this.buildShowcase({
      newReleases: shelves.find((sh) => sh.id === 'new-releases')?.books || [],
      topRated: shelves.find((sh) => sh.id === 'top-rated')?.books || [],
      bestSellers: top10.books
    })

    return { hero, top10: top10.books.length ? top10 : null, shelves, genres: categories }
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
    // Newest-first listing includes pre-orders; only keep books that are actually out
    const newest = await catalog.getProducts({ sortBy: '-ReleaseDate', num: 50 })
    return newest.filter((b) => !b.releaseDate || new Date(b.releaseDate).valueOf() <= Date.now()).slice(0, 30)
  }

  /**
   * Showcase reel for the home banner: the most highly rated and newest books (plus best
   * sellers), interleaved so the reel feels varied. Only released titles with art and a blurb make
   * the cut - pre-orders aren't useful here since books are requested, not bought.
   *
   * @param {{ newReleases: Object[], topRated: Object[], bestSellers: Object[] }} pools
   * @returns {Object[]} cards tagged with showcase: 'new' | 'top' | 'popular'
   */
  buildShowcase(pools) {
    const now = Date.now()
    const released = (b) => !b.releaseDate || new Date(b.releaseDate).valueOf() <= now
    const usable = (b) => b.cover && b.description && b.status !== 'owned' && released(b)
    const topRated = pools.topRated.filter((b) => usable(b) && (b.rating || 0) >= 4.5)
    // Prefer well-reviewed titles (many ratings) so the reel isn't full of obscure 5-star books
    topRated.sort((a, b) => (b.numRatings >= 500) - (a.numRatings >= 500) || (b.rating || 0) - (a.rating || 0))
    const lanes = [pools.newReleases.filter(usable).map((b) => ({ ...b, showcase: 'new' })), topRated.map((b) => ({ ...b, showcase: 'top' })), pools.bestSellers.filter(usable).map((b) => ({ ...b, showcase: 'popular' }))]
    const seen = new Set()
    const reel = []
    for (let round = 0; reel.length < 8 && lanes.some((l) => l.length); round++) {
      for (const lane of lanes) {
        while (lane.length) {
          const book = lane.shift()
          const key = book.asin || book.id
          if (seen.has(key)) continue
          seen.add(key)
          reel.push(book)
          break
        }
        if (reel.length >= 8) break
      }
    }
    return reel
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
   * Fill in blurb / narrator / length / sample for a card that came from a source without them
   * (Apple charts, Open Library) by matching it against the Audible catalog, then Open Library.
   *
   * @param {{ title: string, author?: string, olKey?: string }} book
   * @returns {Promise<Object|null>} partial card fields to merge
   */
  async getDetails(book) {
    const titleNorm = normalize(cleanTitle(book.title))
    const surname = primaryAuthorSurname(book.author)
    if (titleNorm) {
      const results = await this.catalog.getProducts({ title: cleanTitle(book.title), author: book.author || undefined, sortBy: 'Relevance', num: 5 })
      const match = results.find((r) => normalize(cleanTitle(r.title)) === titleNorm && (!surname || normalize(r.author || '').includes(surname)))
      if (match) {
        const { asin, description, narrator, duration, sampleUrl, rating, numRatings, series, publisher, releaseDate } = match
        return { asin, description, narrator, duration, sampleUrl, rating, numRatings, series, publisher, releaseDate, audibleMatch: true }
      }
    }
    if (book.olKey) {
      const work = await new OpenLibraryCatalog().getWork(book.olKey)
      if (work) return work
    }
    return null
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
