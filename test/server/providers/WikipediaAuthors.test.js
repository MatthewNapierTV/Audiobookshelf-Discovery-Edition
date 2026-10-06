const { expect } = require('chai')
const { normalizeName, namesMatch, pickAuthorPage } = require('../../../server/providers/WikipediaAuthors')

describe('WikipediaAuthors', () => {
  describe('normalizeName', () => {
    it('ignores accents, punctuation, case and parentheticals', () => {
      expect(normalizeName('J.R.R. Tolkien')).to.equal('j r r tolkien')
      expect(normalizeName('Gabriel García Márquez')).to.equal('gabriel garcia marquez')
      expect(normalizeName('Andy Weir (author)')).to.equal('andy weir')
    })
  })

  describe('namesMatch', () => {
    it('matches the same person written differently', () => {
      expect(namesMatch('J. R. R. Tolkien', 'J.R.R. Tolkien')).to.equal(true)
      expect(namesMatch('JRR Tolkien', 'J. R. R. Tolkien')).to.equal(true)
      expect(namesMatch('C.S. Lewis', 'C. S. Lewis')).to.equal(true)
      expect(namesMatch('Kristin Hannah', 'Kristin Hannah')).to.equal(true)
      expect(namesMatch('Max Lucado', 'Max Lucado (pastor)')).to.equal(true)
    })
    it('allows a missing middle name', () => {
      expect(namesMatch('Stephen King', 'Stephen Edwin King')).to.equal(true)
    })
    it('rejects different people', () => {
      expect(namesMatch('Andy Weir', 'Peter Weir')).to.equal(false)
      expect(namesMatch('Weir', 'Andy Weir')).to.equal(false)
      expect(namesMatch('', 'Andy Weir')).to.equal(false)
    })
  })

  describe('pickAuthorPage', () => {
    const photo = { source: 'https://upload.wikimedia.org/x.jpg' }
    it('picks the writer page with a free photo', () => {
      const pages = [
        { index: 1, title: 'Project Hail Mary', description: '2021 novel by Andy Weir', thumbnail: photo },
        { index: 2, title: 'Andy Weir', description: 'American novelist (born 1972)', thumbnail: photo, extract: 'Andrew Taylor Weir is an American novelist.' },
        { index: 3, title: 'Peter Weir', description: 'Australian film director', thumbnail: photo }
      ]
      expect(pickAuthorPage('Andy Weir', pages).title).to.equal('Andy Weir')
    })
    it('ignores namesakes who are not writers', () => {
      const pages = [{ index: 1, title: 'John Smith', description: 'English footballer', thumbnail: photo }]
      expect(pickAuthorPage('John Smith', pages)).to.equal(null)
    })
    it('needs a photo', () => {
      const pages = [{ index: 1, title: 'Andy Weir', description: 'American novelist' }]
      expect(pickAuthorPage('Andy Weir', pages)).to.equal(null)
    })
    it('accepts pastors and theologians', () => {
      const pages = [{ index: 1, title: 'Timothy Keller', description: 'American pastor and theologian (1950–2023)', thumbnail: photo }]
      expect(pickAuthorPage('Timothy Keller', pages).title).to.equal('Timothy Keller')
    })
  })
})
