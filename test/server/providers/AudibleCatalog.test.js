const { expect } = require('chai')
const AudibleCatalog = require('../../../server/providers/AudibleCatalog')

describe('AudibleCatalog', () => {
  describe('toBookCard', () => {
    it('normalizes a catalog product', () => {
      const card = AudibleCatalog.toBookCard({
        asin: 'B08G9PRS1K',
        title: 'Project Hail Mary',
        authors: [{ name: 'Andy Weir' }],
        narrators: [{ name: 'Ray Porter' }],
        product_images: { 500: 'https://example.com/cover.jpg' },
        merchandising_summary: '<p>A lone astronaut &amp; a mission.</p>',
        release_date: '2021-05-04',
        runtime_length_min: 970,
        rating: { overall_distribution: { display_average_rating: '4.8', num_ratings: 1000 } },
        series: [{ title: 'Some Series', sequence: '1' }],
        category_ladders: [{ ladder: [{ name: 'Science Fiction & Fantasy' }, { name: 'Science Fiction' }] }]
      })
      expect(card).to.include({ asin: 'B08G9PRS1K', title: 'Project Hail Mary', author: 'Andy Weir', narrator: 'Ray Porter', cover: 'https://example.com/cover.jpg', duration: 970, rating: 4.8, publishedYear: '2021' })
      expect(card.description).to.equal('A lone astronaut & a mission.')
      expect(card.series).to.deep.equal([{ series: 'Some Series', sequence: '1' }])
      expect(card.genres).to.deep.equal(['Science Fiction & Fantasy'])
    })

    it('skips podcasts and products without a title', () => {
      expect(AudibleCatalog.toBookCard({ asin: 'X', title: 'Pod', content_delivery_type: 'PodcastParent' })).to.be.null
      expect(AudibleCatalog.toBookCard({ asin: 'X' })).to.be.null
    })
  })
})
