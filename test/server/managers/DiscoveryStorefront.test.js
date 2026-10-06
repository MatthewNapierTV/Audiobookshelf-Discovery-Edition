const { expect } = require('chai')
const DiscoveryStorefront = require('../../../server/managers/DiscoveryStorefront')

describe('DiscoveryStorefront.buildShowcase', () => {
  const card = (asin, extra = {}) => ({ asin, cover: 'c', description: 'd', ...extra })

  it('interleaves new, top rated, coming soon and popular titles without duplicates', () => {
    const reel = new DiscoveryStorefront().buildShowcase({
      newReleases: [card('n1'), card('n2')],
      topRated: [card('t1', { rating: 4.9, numRatings: 10 }), card('t2', { rating: 4.6, numRatings: 900 }), card('n1', { rating: 4.8 })],
      comingSoon: [card('s1')],
      bestSellers: [card('b1'), card('n2')]
    })
    expect(reel.map((b) => `${b.asin}:${b.showcase}`)).to.deep.equal(['n1:new', 't2:top', 's1:soon', 'b1:popular', 'n2:new', 't1:top'])
  })

  it('skips owned books, low ratings and cards without art or a blurb', () => {
    const reel = new DiscoveryStorefront().buildShowcase({
      newReleases: [card('owned', { status: 'owned' }), { asin: 'noart', description: 'd' }],
      topRated: [card('meh', { rating: 4.1 })],
      comingSoon: [],
      bestSellers: []
    })
    expect(reel).to.be.empty
  })

  it('caps the reel at 8 slides', () => {
    const many = (p) => Array.from({ length: 10 }, (_, i) => card(`${p}${i}`, { rating: 4.8 }))
    const reel = new DiscoveryStorefront().buildShowcase({ newReleases: many('n'), topRated: many('t'), comingSoon: many('s'), bestSellers: many('b') })
    expect(reel).to.have.length(8)
  })
})
