/**
 * Picks the best indexer release for a book so Discovery can do a one-click "Get" (Audible-style)
 * without the user having to look at a table of torrents.
 *
 * Scoring is deliberately conservative: a release is only eligible when the book title clearly
 * matches, it's the requested media type and it has seeders. Anything that doesn't clear the bar
 * is left for the user to pick manually.
 */

const STOP_WORDS = new Set(['the', 'a', 'an', 'of', 'and', 'in', 'on', 'to', 'for', 'at', 'by', 'with', 'from', 'book', 'novel', 'unabridged'])

const AUDIO_FORMAT_SCORES = { m4b: 25, m4a: 15, mp3: 10, flac: 5, opus: 5 }
const EBOOK_FORMAT_SCORES = { epub: 25, azw3: 15, mobi: 10, azw: 8, pdf: 0 }

/**
 * Lowercase, strip accents & punctuation
 * @param {string} str
 * @returns {string}
 */
function normalize(str) {
  return (str || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * Significant words of a string (no stop words)
 * @param {string} str
 * @returns {string[]}
 */
function significantTokens(str) {
  return normalize(str)
    .split(' ')
    .filter((t) => t && !STOP_WORDS.has(t))
}

/**
 * Title used for indexer queries & matching: drops subtitles after ":" and parentheticals like "(Book 1)"
 * @param {string} title
 * @returns {string}
 */
function cleanTitle(title) {
  if (!title) return ''
  let t = title.split(/[:]/)[0]
  t = t.replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
  return t.replace(/\s+/g, ' ').trim()
}

/**
 * Surname of the first author (indexers usually include it in the release name)
 * @param {string} author - may be a comma separated list
 * @returns {string}
 */
function primaryAuthorSurname(author) {
  const first = (author || '').split(/,|&| and /)[0].trim()
  const parts = significantTokens(first)
  return parts.length ? parts[parts.length - 1] : ''
}

/**
 * @param {Object} release - normalized Prowlarr release
 * @param {{ title: string, author?: string }} book
 * @param {{ mediaType?: 'audiobook'|'ebook', minSeeders?: number, preferFreeleech?: boolean }} [options]
 * @returns {{ score: number, eligible: boolean, reasons: string[] }}
 */
function scoreRelease(release, book, options = {}) {
  const mediaType = options.mediaType || 'audiobook'
  const minSeeders = options.minSeeders ?? 1
  const reasons = []
  let eligible = true
  let score = 0

  const releaseNorm = ` ${normalize(release.title)} `
  const releaseTokens = new Set(releaseNorm.trim().split(' '))

  // --- Title match (required) ---
  const titleTokens = significantTokens(cleanTitle(book.title))
  if (!titleTokens.length) {
    eligible = false
    reasons.push('no title')
  } else {
    const matched = titleTokens.filter((t) => releaseTokens.has(t)).length
    const ratio = matched / titleTokens.length
    if (ratio < 1 && !(titleTokens.length >= 4 && ratio >= 0.75)) {
      eligible = false
      reasons.push(`title mismatch (${matched}/${titleTokens.length})`)
    }
    score += Math.round(ratio * 40)
    // Exact phrase is a strong signal
    if (releaseNorm.includes(` ${normalize(cleanTitle(book.title))} `)) score += 15
  }

  // --- Author ---
  const surname = primaryAuthorSurname(book.author)
  if (surname && releaseTokens.has(surname)) {
    score += 20
  } else if (surname) {
    score -= 10
    reasons.push('author not in release name')
  }

  // --- Media type ---
  if (release.mediaType === mediaType) {
    score += 20
  } else if (release.mediaType === 'other') {
    score -= 15
  } else {
    eligible = false
    reasons.push(`wrong media type (${release.mediaType})`)
  }

  // --- Protocol: only torrents can be handed to qBittorrent ---
  if (release.protocol && release.protocol !== 'torrent') {
    eligible = false
    reasons.push(`unsupported protocol (${release.protocol})`)
  }

  // --- Availability ---
  if (typeof release.seeders === 'number') {
    if (release.seeders < minSeeders) {
      eligible = false
      reasons.push(`not enough seeders (${release.seeders})`)
    }
    score += Math.min(25, Math.round(Math.log2(release.seeders + 1) * 4))
  }

  // --- Preferred file formats ---
  const formatScores = mediaType === 'ebook' ? EBOOK_FORMAT_SCORES : AUDIO_FORMAT_SCORES
  let bestFormat = 0
  for (const fmt in formatScores) {
    if (releaseTokens.has(fmt)) bestFormat = Math.max(bestFormat, formatScores[fmt])
  }
  score += bestFormat

  // --- Freeleech (e.g. MyAnonamouse "FL"/VIP torrents) doesn't count against ratio ---
  const flags = (release.indexerFlags || []).map((f) => String(f).toLowerCase())
  if (options.preferFreeleech !== false && flags.some((f) => f.includes('freeleech'))) {
    score += 15
  }

  // --- Things the user almost never wants ---
  if (/\b(sample|preview|excerpt)\b/.test(releaseNorm)) score -= 40
  if (/\babridged\b/.test(releaseNorm) && !/\bunabridged\b/.test(releaseNorm)) score -= 15
  if (/\b(dramati[sz]ed|bbc radio|full cast)\b/.test(releaseNorm)) score -= 5

  // --- Size sanity ---
  const mb = (release.size || 0) / (1024 * 1024)
  if (mb) {
    if (mediaType === 'audiobook' && mb < 15) score -= 20
    if (mediaType === 'ebook' && mb > 300) score -= 15
  }

  return { score, eligible, reasons }
}

/**
 * Rank releases for a book, best first. Ineligible releases are excluded.
 *
 * @param {Object[]} releases
 * @param {{ title: string, author?: string }} book
 * @param {Object} [options] - see scoreRelease
 * @returns {Object[]} releases with a `score` property
 */
function rankReleases(releases, book, options = {}) {
  return (releases || [])
    .map((release) => ({ release, ...scoreRelease(release, book, options) }))
    .filter((r) => r.eligible)
    .sort((a, b) => b.score - a.score)
    .map((r) => ({ ...r.release, score: r.score }))
}

module.exports = {
  normalize,
  significantTokens,
  cleanTitle,
  primaryAuthorSurname,
  scoreRelease,
  rankReleases
}
