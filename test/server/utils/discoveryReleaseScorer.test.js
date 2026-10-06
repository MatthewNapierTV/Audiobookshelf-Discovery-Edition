const { expect } = require('chai')
const { scoreRelease, rankReleases, cleanTitle, primaryAuthorSurname } = require('../../../server/utils/discoveryReleaseScorer')

const MB = 1024 * 1024

function release(title, extra = {}) {
  return { title, mediaType: 'audiobook', protocol: 'torrent', seeders: 10, size: 500 * MB, indexerFlags: [], ...extra }
}

describe('discoveryReleaseScorer', () => {
  const book = { title: 'Project Hail Mary', author: 'Andy Weir' }

  describe('cleanTitle', () => {
    it('drops subtitles and parentheticals', () => {
      expect(cleanTitle('Dungeon Crawler Carl: A LitRPG Adventure (Book 1)')).to.equal('Dungeon Crawler Carl')
    })
  })

  describe('primaryAuthorSurname', () => {
    it('returns the surname of the first author', () => {
      expect(primaryAuthorSurname('Andy Weir, Ray Porter')).to.equal('weir')
      expect(primaryAuthorSurname('')).to.equal('')
    })
  })

  describe('scoreRelease', () => {
    it('accepts a matching release', () => {
      const result = scoreRelease(release('Andy Weir - Project Hail Mary [M4B]'), book)
      expect(result.eligible).to.be.true
    })

    it('rejects a release for a different book', () => {
      const result = scoreRelease(release('Andy Weir - The Martian'), book)
      expect(result.eligible).to.be.false
    })

    it('rejects the wrong media type', () => {
      const result = scoreRelease(release('Andy Weir - Project Hail Mary (epub)', { mediaType: 'ebook' }), book)
      expect(result.eligible).to.be.false
    })

    it('rejects releases without enough seeders', () => {
      const result = scoreRelease(release('Andy Weir - Project Hail Mary', { seeders: 0 }), book, { minSeeders: 1 })
      expect(result.eligible).to.be.false
    })

    it('rejects a different book that merely contains a short title word', () => {
      const contend = { title: 'Contend', author: 'Philip Anthony Mitchell' }
      const wrong = scoreRelease(release('Sasaki and Peeps, Vol. 6: Contend with the Otherworld [M4B]'), contend)
      expect(wrong.eligible).to.equal(false)
      expect(wrong.reasons).to.include('author mismatch')
      expect(scoreRelease(release('Contend by Philip Anthony Mitchell [ENG / M4B]'), contend).eligible).to.equal(true)
    })

    it('needs the author for short titles, but not for a long title matched word for word', () => {
      expect(scoreRelease(release('Atomic Habits [M4B]'), { title: 'Atomic Habits', author: 'James Clear' }).eligible).to.equal(false)
      expect(scoreRelease(release('A Court of Thorns and Roses Unabridged [M4B]'), { title: 'A Court of Thorns and Roses', author: 'Sarah J. Maas' }).eligible).to.equal(true)
      // Any listed author counts
      expect(scoreRelease(release('Good Omens - Neil Gaiman [M4B]'), { title: 'Good Omens', author: 'Terry Pratchett, Neil Gaiman' }).eligible).to.equal(true)
    })

    it('rejects usenet releases (qBittorrent only)', () => {
      const result = scoreRelease(release('Andy Weir - Project Hail Mary', { protocol: 'usenet' }), book)
      expect(result.eligible).to.be.false
    })
  })

  describe('rankReleases', () => {
    it('prefers m4b, freeleech and author matches; excludes non-matches', () => {
      const releases = [release('Project Hail Mary mp3', { seeders: 50 }), release('Andy Weir - Project Hail Mary [M4B]', { seeders: 20, indexerFlags: ['freeleech'] }), release('Andy Weir - The Martian [M4B]', { seeders: 200 }), release('Project Hail Mary (sample)', { seeders: 100 })]
      const ranked = rankReleases(releases, book)
      expect(ranked[0].title).to.equal('Andy Weir - Project Hail Mary [M4B]')
      expect(ranked.map((r) => r.title)).to.not.include('Andy Weir - The Martian [M4B]')
      expect(ranked[ranked.length - 1].title).to.equal('Project Hail Mary (sample)')
    })
  })
})
