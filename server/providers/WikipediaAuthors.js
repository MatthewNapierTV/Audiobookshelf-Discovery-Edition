const axios = require('axios').default
const Logger = require('../Logger')

// Wikimedia asks API clients to identify themselves: https://meta.wikimedia.org/wiki/User-Agent_policy
const USER_AGENT = 'FaithnetReads/1.0 (self-hosted audiobookshelf; author photo lookup)'

// The page's short description has to say the person writes (or preaches/teaches) for us to trust the match
const WRITER_RE = /\b(author|writer|novelist|poet|playwright|essayist|journalist|screenwriter|columnist|biographer|memoirist|historian|theologian|pastor|preacher|evangelist|minister|priest|bishop|rabbi|philosopher|scholar|professor|illustrator|cartoonist|storyteller|broadcaster|podcaster|speaker)\b/i

/**
 * Lower-case, strip accents/punctuation and parentheticals: "J. R. R. Tolkien" and "J.R.R. Tolkien" both become "j r r tolkien"
 * @param {string} name
 */
function normalizeName(name) {
  return (name || '')
    .replace(/\([^)]*\)/g, ' ')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * Same person? Exact name match, or same first + last name when one side carries a middle name/initial
 * @param {string} wanted
 * @param {string} pageTitle
 */
function namesMatch(wanted, pageTitle) {
  const a = normalizeName(wanted)
  const b = normalizeName(pageTitle)
  if (!a || !b) return false
  if (a === b || a.replace(/ /g, '') === b.replace(/ /g, '')) return true
  const at = a.split(' ')
  const bt = b.split(' ')
  if (at.length < 2 || bt.length < 2) return false
  return at[0] === bt[0] && at[at.length - 1] === bt[bt.length - 1]
}

/**
 * Pick the best search result: a page about this person whose description says they're a writer, with a free photo
 * @param {string} name
 * @param {Object[]} pages - MediaWiki formatversion=2 pages (title, description, thumbnail, extract, index)
 * @returns {Object|null}
 */
function pickAuthorPage(name, pages) {
  const candidates = (pages || []).filter((p) => p && !p.missing && namesMatch(name, p.title) && WRITER_RE.test(p.description || ''))
  candidates.sort((a, b) => (a.index || 0) - (b.index || 0))
  return candidates.find((p) => p.thumbnail?.source) || null
}

class WikipediaAuthors {
  constructor() {
    this.endpoint = 'https://en.wikipedia.org/w/api.php'
  }

  /**
   * Look up an author's photo and short bio on Wikipedia. Page images come from Wikimedia Commons and
   * the PageImages API only returns freely licensed ones.
   *
   * @param {string} name
   * @returns {Promise<{name:string, image:string, description:string, source:string, pageUrl:string}|null>}
   */
  async findAuthor(name) {
    if (!name?.trim()) return null
    const params = {
      action: 'query',
      format: 'json',
      formatversion: 2,
      redirects: 1,
      generator: 'search',
      gsrsearch: name.trim(),
      gsrlimit: 6,
      gsrnamespace: 0,
      prop: 'pageimages|description|extracts|info',
      piprop: 'thumbnail',
      pithumbsize: 800,
      pilicense: 'free',
      exintro: 1,
      explaintext: 1,
      exlimit: 6,
      inprop: 'url'
    }
    try {
      const { data } = await axios.get(this.endpoint, { params, timeout: 12000, headers: { 'User-Agent': USER_AGENT, 'Api-User-Agent': USER_AGENT } })
      const page = pickAuthorPage(name, data?.query?.pages)
      if (!page) return null
      return {
        name: page.title,
        image: page.thumbnail.source,
        description: (page.extract || '').trim(),
        source: 'wikipedia',
        pageUrl: page.fullurl || `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, '_'))}`
      }
    } catch (error) {
      Logger.error(`[WikipediaAuthors] Lookup failed for "${name}": ${error.message}`)
      return null
    }
  }
}

module.exports = WikipediaAuthors
module.exports.normalizeName = normalizeName
module.exports.namesMatch = namesMatch
module.exports.pickAuthorPage = pickAuthorPage
