const axios = require('axios').default
const { LRUCache } = require('lru-cache')
const Logger = require('../Logger')

const REGION_TLDS = {
  us: '.com',
  ca: '.ca',
  uk: '.co.uk',
  au: '.com.au',
  fr: '.fr',
  de: '.de',
  jp: '.co.jp',
  it: '.it',
  in: '.in',
  es: '.es'
}

const RESPONSE_GROUPS = ['contributors', 'media', 'product_attrs', 'product_desc', 'series', 'rating', 'category_ladders'].join(',')

// Audible "products" that are not books
const NON_BOOK_DELIVERY_TYPES = new Set(['PodcastParent', 'PodcastEpisode', 'PodcastSeason', 'Periodical', 'Subscription'])

/**
 * Read-only client for the public Audible catalog API, used to build the Discovery storefront
 * (best sellers, new releases, genres, author/series lookups). No Audible account is needed.
 *
 * Responses are cached in-memory so the storefront is fast and we stay polite to Audible.
 */
class AudibleCatalog {
  static cache = new LRUCache({ max: 500, ttl: 6 * 60 * 60 * 1000 })

  /**
   * @param {string} [region]
   * @param {number} [timeout]
   */
  constructor(region = 'us', timeout = 15000) {
    this.region = REGION_TLDS[region] ? region : 'us'
    this.timeout = timeout
  }

  get baseUrl() {
    return `https://api.audible${REGION_TLDS[this.region]}/1.0/catalog`
  }

  /**
   * GET with caching. Errors are logged and resolve to null so one failing shelf doesn't break the page.
   * @param {string} path
   * @param {Object} params
   * @returns {Promise<Object|null>}
   */
  async get(path, params = {}) {
    const query = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')).toString()
    const url = `${this.baseUrl}${path}${query ? `?${query}` : ''}`

    const cached = AudibleCatalog.cache.get(url)
    if (cached) return cached

    try {
      Logger.debug(`[AudibleCatalog] GET ${url}`)
      const response = await axios.get(url, { timeout: this.timeout })
      if (response.data) AudibleCatalog.cache.set(url, response.data)
      return response.data || null
    } catch (error) {
      Logger.error(`[AudibleCatalog] Request failed "${url}": ${error.message}`)
      return null
    }
  }

  /**
   * Top level genres for the marketplace
   * @returns {Promise<{id:string, name:string}[]>}
   */
  async getCategories() {
    const data = await this.get('/categories', { categories_num_levels: 1 })
    const list = data?.categories || data?.category?.children || []
    return list
      .filter((c) => c?.id && c?.name)
      .map((c) => ({ id: String(c.id), name: c.name }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }

  /**
   * Search/browse catalog products
   *
   * @param {Object} opts
   * @param {string} [opts.sortBy] - BestSellers | -ReleaseDate | AvgRating | Relevance
   * @param {string} [opts.categoryId]
   * @param {string} [opts.keywords]
   * @param {string} [opts.author]
   * @param {string} [opts.title]
   * @param {number} [opts.num] - max 50
   * @returns {Promise<Object[]>} storefront book cards
   */
  async getProducts(opts = {}) {
    const data = await this.get('/products', {
      response_groups: RESPONSE_GROUPS,
      image_sizes: '500',
      num_results: Math.min(50, Math.max(1, opts.num || 20)),
      products_sort_by: opts.sortBy || 'BestSellers',
      category_id: opts.categoryId,
      keywords: opts.keywords,
      author: opts.author,
      title: opts.title
    })
    const products = Array.isArray(data?.products) ? data.products : []
    return products.map((p) => AudibleCatalog.toBookCard(p, this.region)).filter(Boolean)
  }

  /**
   * Normalize an Audible catalog product into the card shape used by the Discovery storefront.
   * Shape intentionally matches the metadata search results (title/author/cover/...) so the
   * existing "choose a download" flow can take either.
   *
   * @param {Object} p
   * @param {string} region
   * @returns {Object|null}
   */
  static toBookCard(p, region = 'us') {
    if (!p?.asin || !p?.title) return null
    if (NON_BOOK_DELIVERY_TYPES.has(p.content_delivery_type) || p.content_type === 'Podcast') return null

    const images = p.product_images || {}
    const cover = images['500'] || Object.values(images)[0] || null

    const rating = p.rating?.overall_distribution
    const seriesList = Array.isArray(p.series) ? p.series : []

    const genres = []
    for (const ladder of p.category_ladders || []) {
      const root = ladder?.ladder?.[0]?.name
      if (root && !genres.includes(root)) genres.push(root)
    }

    return {
      id: `audible:${p.asin}`,
      asin: p.asin,
      title: p.title,
      subtitle: p.subtitle || null,
      author:
        (p.authors || [])
          .map((a) => a.name)
          .filter(Boolean)
          .join(', ') || null,
      narrator:
        (p.narrators || [])
          .map((n) => n.name)
          .filter(Boolean)
          .join(', ') || null,
      cover,
      description: AudibleCatalog.stripHtml(p.merchandising_summary || p.publisher_summary || ''),
      publisher: p.publisher_name || null,
      releaseDate: p.release_date || p.issue_date || null,
      publishedYear: (p.release_date || '').split('-')[0] || null,
      duration: Number(p.runtime_length_min) || 0,
      language: p.language || null,
      rating: rating?.display_average_rating ? Number(rating.display_average_rating) : null,
      numRatings: rating?.num_ratings || 0,
      series: seriesList.map((s) => ({ series: s.title, sequence: s.sequence || '' })).filter((s) => s.series),
      genres,
      region,
      // Short narrator sample (Audible's "Listen to sample") when the catalog provides one
      sampleUrl: typeof p.sample_url === 'string' && /^https:\/\//.test(p.sample_url) ? p.sample_url : null,
      format: 'audiobook',
      source: 'audible'
    }
  }

  /**
   * @param {string} html
   * @returns {string}
   */
  static stripHtml(html) {
    return (html || '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;|&apos;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  }
}

module.exports = AudibleCatalog
