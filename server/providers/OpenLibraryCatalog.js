const { cachedGetJson } = require('../utils/catalogHttp')

const BASE = 'https://openlibrary.org'
const COVERS = 'https://covers.openlibrary.org/b/id'

/**
 * Open Library (Internet Archive) - trending books and subject lists. Free, no key, community
 * maintained; great for ebooks and backlist titles the audio charts don't cover.
 */
class OpenLibraryCatalog {
  /**
   * What readers are adding on Open Library right now
   * @param {'daily'|'weekly'|'monthly'|'yearly'} [period]
   * @param {number} [limit]
   */
  async getTrending(period = 'weekly', limit = 30) {
    const p = ['daily', 'weekly', 'monthly', 'yearly'].includes(period) ? period : 'weekly'
    const data = await cachedGetJson(`${BASE}/trending/${p}.json?limit=${Math.min(100, limit)}`, { label: 'OpenLibrary', ttl: 3 * 60 * 60 * 1000 })
    return (data?.works || []).map((w) => OpenLibraryCatalog.toBookCard(w)).filter(Boolean)
  }

  /**
   * Popular works for a subject (e.g. "fantasy", "christian_life", "thrillers")
   * @param {string} subject
   * @param {number} [limit]
   */
  async getSubject(subject, limit = 30) {
    const slug = String(subject || '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
    if (!slug) return []
    const data = await cachedGetJson(`${BASE}/subjects/${slug}.json?limit=${Math.min(100, limit)}`, { label: 'OpenLibrary', ttl: 12 * 60 * 60 * 1000 })
    return (data?.works || []).map((w) => OpenLibraryCatalog.toBookCard(w)).filter(Boolean)
  }

  /**
   * Description/subjects for a single work (used by the details sheet)
   * @param {string} key - "/works/OL123W" or "OL123W"
   */
  async getWork(key) {
    const id = String(key || '').replace(/^\/?works\//, '')
    if (!/^OL\d+W$/.test(id)) return null
    const data = await cachedGetJson(`${BASE}/works/${id}.json`, { label: 'OpenLibrary', ttl: 24 * 60 * 60 * 1000 })
    if (!data) return null
    const description = typeof data.description === 'string' ? data.description : data.description?.value || null
    return {
      description: description ? description.replace(/\r\n/g, '\n').trim() : null,
      genres: (data.subjects || []).slice(0, 6)
    }
  }

  /**
   * Normalize a work from the trending (author_name/cover_i) or subjects (authors/cover_id) APIs
   * @param {Object} w
   * @returns {Object|null}
   */
  static toBookCard(w) {
    if (!w?.key || !w?.title) return null
    const coverId = w.cover_i || w.cover_id
    if (!coverId) return null // a storefront without covers looks broken; skip those
    const authors = Array.isArray(w.author_name) ? w.author_name : (w.authors || []).map((a) => a?.name).filter(Boolean)
    const year = w.first_publish_year || null
    return {
      id: `ol:${w.key.replace(/^\/works\//, '')}`,
      asin: null,
      olKey: w.key,
      title: w.title,
      subtitle: null,
      author: authors.slice(0, 2).join(', ') || null,
      narrator: null,
      cover: `${COVERS}/${coverId}-L.jpg`,
      description: null,
      releaseDate: null,
      publishedYear: year ? String(year) : null,
      duration: 0,
      rating: null,
      numRatings: 0,
      series: [],
      genres: (w.subject || []).slice(0, 3),
      format: 'ebook',
      source: 'openlibrary'
    }
  }
}

module.exports = OpenLibraryCatalog
