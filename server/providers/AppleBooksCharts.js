const { cachedGetJson } = require('../utils/catalogHttp')

const REGIONS = ['us', 'ca', 'gb', 'au', 'fr', 'de', 'jp', 'it', 'in', 'es']
// Our settings use Audible marketplace codes; Apple uses ISO country codes
const REGION_ALIASES = { uk: 'gb' }

// Chart names differ per media type; try them in order until one returns results
const CHARTS = {
  'audio-books': ['top', 'top-paid'],
  books: ['top-paid', 'top-free']
}

// Category labels that describe the store section rather than a genre
const GENERIC_GENRES = new Set(['Books', 'Audiobooks', 'Audio Books'])

/**
 * Apple Books top charts via Apple's public marketing feed generator
 * (https://rss.applemarketingtools.com). No key required; updated daily by Apple.
 */
class AppleBooksCharts {
  /**
   * @param {string} [region]
   */
  constructor(region = 'us') {
    const r = REGION_ALIASES[region] || region
    this.region = REGIONS.includes(r) ? r : 'us'
  }

  /**
   * @param {'audio-books'|'books'} type
   * @param {number} [limit] - max 100
   * @returns {Promise<Object[]>} storefront book cards
   */
  async getTop(type = 'audio-books', limit = 25) {
    const n = Math.min(100, Math.max(1, limit))
    for (const chart of CHARTS[type] || CHARTS.books) {
      const url = `https://rss.applemarketingtools.com/api/v2/${this.region}/${type}/${chart}/${n}/${type}.json`
      const data = await cachedGetJson(url, { label: 'AppleBooks' })
      const results = data?.feed?.results
      if (Array.isArray(results) && results.length) {
        return results.map((r) => AppleBooksCharts.toBookCard(r, type === 'audio-books' ? 'audiobook' : 'ebook')).filter(Boolean)
      }
    }
    return []
  }

  /**
   * @param {Object} r - feed result
   * @param {'audiobook'|'ebook'} format
   * @returns {Object|null}
   */
  static toBookCard(r, format) {
    if (!r?.id || !r?.name) return null
    const artwork = r.artworkUrl100 ? r.artworkUrl100.replace(/\/\d+x\d+(bb)?\.(jpg|png|webp)$/i, '/600x600bb.$2') : null
    const genres = (r.genres || []).map((g) => (typeof g === 'string' ? g : g?.name)).filter((g) => g && !GENERIC_GENRES.has(g))
    return {
      id: `apple:${r.id}`,
      asin: null,
      title: r.name,
      subtitle: null,
      author: r.artistName || null,
      narrator: null,
      cover: artwork,
      coverLarge: artwork ? artwork.replace('/600x600bb.', '/1200x1200bb.') : null,
      description: null,
      releaseDate: r.releaseDate || null,
      publishedYear: (r.releaseDate || '').split('-')[0] || null,
      duration: 0,
      rating: null,
      numRatings: 0,
      series: [],
      genres,
      format,
      url: r.url || null,
      source: 'apple'
    }
  }
}

module.exports = AppleBooksCharts
