<template>
  <div class="page" :class="streamLibraryItem ? 'streaming' : ''">
    <app-book-shelf-toolbar is-home page="search" :search-query="query" />
    <app-book-shelf-categorized v-if="hasResults" ref="bookshelf" search :results="results" />
    <div v-else class="w-full" :class="isBookLibrary ? 'pt-10 pb-4' : 'py-16'">
      <p class="text-xl text-center">{{ $getString('MessageNoSearchResultsFor', [query]) }}</p>
    </div>

    <!-- Books you don't own yet, from the online catalog -->
    <div v-if="isBookLibrary && (storeLoading || storeShelf.books.length)" class="pl-8e pr-8e pb-24e" :class="{ 'pt-4e': !hasResults }">
      <div v-if="storeLoading" class="flex items-center gap-2 text-sm text-gray-400 py-4"><span class="material-symbols animate-spin text-base">progress_activity</span>{{ $strings.MessageSearchingStore }}</div>
      <discovery-shelf v-else :shelf="storeShelf" :card-width="150" @select="openStoreBook" @see-all="seeAllInStore" />
    </div>
  </div>
</template>

<script>
export default {
  async asyncData({ store, params, redirect, query, app }) {
    const libraryId = params.library
    const library = await store.dispatch('libraries/fetch', libraryId)
    if (!library) {
      return redirect('/oops?message=Library not found')
    }
    let results = await app.$axios.$get(`/api/libraries/${libraryId}/search?q=${encodeURIComponent(query.q)}`).catch((error) => {
      console.error('Failed to search library', error)
      return null
    })
    results = {
      podcasts: results?.podcast || [],
      episodes: results?.episodes || [],
      books: results?.book || [],
      authors: results?.authors || [],
      series: results?.series || [],
      tags: results?.tags || [],
      narrators: results?.narrators || []
    }
    return {
      libraryId,
      results,
      query: query.q
    }
  },
  data() {
    return {
      storeBooks: [],
      storeLoading: false
    }
  },
  watch: {
    '$route.query'(newVal, oldVal) {
      if (newVal && newVal.q && newVal.q !== this.query) {
        this.query = newVal.q
        this.search()
      }
    }
  },
  computed: {
    streamLibraryItem() {
      return this.$store.state.streamLibraryItem
    },
    isBookLibrary() {
      return this.$store.getters['libraries/getCurrentLibraryMediaType'] === 'book'
    },
    storeShelf() {
      return { id: 'store-search', title: this.$strings.HeaderNotInYourLibrary, subtitle: this.$getString('HeaderStoreResultsFor', [this.query]), books: this.storeBooks, browse: { keywords: this.query, sortBy: 'Relevance' } }
    },
    hasResults() {
      return Object.values(this.results).find((r) => !!r && r.length)
    }
  },
  methods: {
    async search() {
      const results = await this.$axios.$get(`/api/libraries/${this.libraryId}/search?q=${encodeURIComponent(this.query)}`).catch((error) => {
        console.error('Failed to search library', error)
        return null
      })
      this.results = {
        podcasts: results?.podcast || [],
        episodes: results?.episodes || [],
        books: results?.book || [],
        authors: results?.authors || [],
        series: results?.series || [],
        tags: results?.tags || [],
        narrators: results?.narrators || []
      }
      this.$nextTick(() => {
        if (this.$refs.bookshelf) {
          this.$refs.bookshelf.setShelvesFromSearch()
        }
      })
      this.searchStore()
    },
    async searchStore() {
      if (!this.isBookLibrary || !this.query) return
      const query = this.query
      this.storeLoading = true
      const data = await this.$axios.$get(`/api/discovery/browse?${new URLSearchParams({ keywords: query, sortBy: 'Relevance', limit: '30' }).toString()}`).catch(() => null)
      if (query !== this.query) return
      this.storeBooks = (data?.books || []).filter((b) => b.status !== 'owned')
      this.storeLoading = false
    },
    openStoreBook(book) {
      this.$eventBus.$emit('open-store-book', book)
    },
    seeAllInStore(shelf) {
      this.$router.push({ path: `/library/${this.libraryId}/discovery`, query: { ...shelf.browse, title: shelf.subtitle } })
    }
  },
  mounted() {
    this.searchStore()
  },
  beforeDestroy() {}
}
</script>
