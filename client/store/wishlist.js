// "Want to Read" list (Audible wishlist / Apple Books "Want to Read"), persisted per user on the server

export const state = () => ({
  items: [],
  loaded: false
})

export const getters = {
  /** Is a storefront card on the list? Matches by id, then title + author */
  has: (state) => (book) => {
    if (!book) return false
    const id = book.id || book.asin
    const key = `${(book.title || '').toLowerCase()}|${(book.author || '').toLowerCase()}`
    return state.items.some((b) => (id && b.id === id) || `${(b.title || '').toLowerCase()}|${(b.author || '').toLowerCase()}` === key)
  }
}

export const actions = {
  async load({ commit, state }, force = false) {
    if (state.loaded && !force) return state.items
    const data = await this.$axios.$get('/api/me/wishlist').catch((error) => {
      console.error('Failed to load wishlist', error)
      return null
    })
    if (data) commit('setItems', data.wishlist || [])
    return state.items
  },
  async add({ commit }, book) {
    const data = await this.$axios.$post('/api/me/wishlist', book)
    commit('setItems', data.wishlist || [])
  },
  async remove({ commit, state }, book) {
    const id = book.id || book.asin
    const key = `${(book.title || '').toLowerCase()}|${(book.author || '').toLowerCase()}`
    const existing = state.items.find((b) => b.id === id || `${(b.title || '').toLowerCase()}|${(b.author || '').toLowerCase()}` === key)
    if (!existing) return
    const data = await this.$axios.$delete(`/api/me/wishlist/${encodeURIComponent(existing.id)}`)
    commit('setItems', data.wishlist || [])
  },
  async toggle({ getters, dispatch }, book) {
    if (getters.has(book)) {
      await dispatch('remove', book)
      return false
    }
    await dispatch('add', book)
    return true
  }
}

export const mutations = {
  setItems(state, items) {
    state.items = items
    state.loaded = true
  }
}
