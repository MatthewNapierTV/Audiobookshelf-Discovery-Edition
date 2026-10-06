<template>
  <div class="">
    <div class="w-full relative sm:w-80">
      <form role="search" @submit.prevent="submitSearch">
        <ui-text-input ref="input" v-model="search" :placeholder="$strings.PlaceholderSearch" @input="inputUpdate" @focus="focussed" @blur="blurred" class="w-full h-9 text-sm global-search-input" />
      </form>
      <button :aria-hidden="!search" class="absolute top-0 right-0 bottom-0 h-full flex items-center px-2 text-gray-400 cursor-pointer" @click="clickClear">
        <span v-if="!search" class="material-symbols" style="font-size: 1.2rem">&#xe8b6;</span>
        <span v-else class="material-symbols" style="font-size: 1.2rem">close</span>
      </button>
    </div>
    <div v-show="showMenu && (lastSearch || isTyping)" class="absolute z-40 mt-2 w-full max-w-64 sm:max-w-96 sm:w-96 bg-surface-2/95 glass-strong border border-white/10 shadow-2xl rounded-xl py-2 px-2 text-base ring-1 ring-black/5 overflow-auto focus:outline-hidden sm:text-sm globalSearchMenu" @mousedown.stop.prevent>
      <ul class="h-full w-full" role="listbox" aria-labelledby="listbox-label">
        <li v-if="isTyping" class="py-2 px-2">
          <p>{{ $strings.MessageThinking }}</p>
        </li>
        <li v-else-if="isFetching" class="py-2 px-2">
          <p>{{ $strings.MessageFetching }}</p>
        </li>
        <li v-else-if="!totalResults && !storeResults.length && !storeFetching" class="py-2 px-2">
          <p>{{ $strings.MessageNoResults }}</p>
        </li>
        <template v-else>
          <p v-if="bookResults.length" class="uppercase text-xs text-gray-400 my-1 px-1 font-semibold">{{ $strings.LabelBooks }}</p>
          <template v-for="item in bookResults">
            <li :key="item.libraryItem.id" class="text-gray-50 select-none relative cursor-pointer hover:bg-white/10 py-1" role="option" @click="clickOption">
              <nuxt-link :to="`/item/${item.libraryItem.id}`">
                <cards-item-search-card :library-item="item.libraryItem" />
              </nuxt-link>
            </li>
          </template>

          <p v-if="podcastResults.length" class="uppercase text-xs text-gray-400 my-1 px-1 font-semibold">{{ $strings.LabelPodcasts }}</p>
          <template v-for="item in podcastResults">
            <li :key="item.libraryItem.id" class="text-gray-50 select-none relative cursor-pointer hover:bg-white/10 py-1" role="option" @click="clickOption">
              <nuxt-link :to="`/item/${item.libraryItem.id}`">
                <cards-item-search-card :library-item="item.libraryItem" />
              </nuxt-link>
            </li>
          </template>

          <p v-if="episodeResults.length" class="uppercase text-xs text-gray-400 my-1 px-1 font-semibold">{{ $strings.LabelEpisodes }}</p>
          <template v-for="item in episodeResults">
            <li :key="item.libraryItem.recentEpisode.id" class="text-gray-50 select-none relative cursor-pointer hover:bg-white/10 py-1" role="option" @click="clickOption">
              <nuxt-link :to="`/item/${item.libraryItem.id}`">
                <cards-episode-search-card :episode="item.libraryItem.recentEpisode" :library-item="item.libraryItem" />
              </nuxt-link>
            </li>
          </template>

          <p v-if="authorResults.length" class="uppercase text-xs text-gray-400 mb-1 mt-3 px-1 font-semibold">{{ $strings.LabelAuthors }}</p>
          <template v-for="item in authorResults">
            <li :key="item.id" class="text-gray-50 select-none relative cursor-pointer hover:bg-white/10 py-1" role="option" @click="clickOption">
              <nuxt-link :to="`/author/${item.id}`">
                <cards-author-search-card :author="item" />
              </nuxt-link>
            </li>
          </template>

          <p v-if="seriesResults.length" class="uppercase text-xs text-gray-400 mb-1 mt-3 px-1 font-semibold">{{ $strings.LabelSeries }}</p>
          <template v-for="item in seriesResults">
            <li :key="item.series.id" class="text-gray-50 select-none relative cursor-pointer hover:bg-white/10 py-1" role="option" @click="clickOption">
              <nuxt-link :to="`/library/${currentLibraryId}/series/${item.series.id}`">
                <cards-series-search-card :series="item.series" :book-items="item.books" />
              </nuxt-link>
            </li>
          </template>

          <p v-if="tagResults.length" class="uppercase text-xs text-gray-400 mb-1 mt-3 px-1 font-semibold">{{ $strings.LabelTags }}</p>
          <template v-for="item in tagResults">
            <li :key="`tag.${item.name}`" class="text-gray-50 select-none relative cursor-pointer hover:bg-white/10 py-1" role="option" @click="clickOption">
              <nuxt-link :to="`/library/${currentLibraryId}/bookshelf?filter=tags.${$encode(item.name)}`">
                <cards-tag-search-card :tag="item.name" :num-items="item.numItems" />
              </nuxt-link>
            </li>
          </template>

          <p v-if="genreResults.length" class="uppercase text-xs text-gray-400 mb-1 mt-3 px-1 font-semibold">{{ $strings.LabelGenres }}</p>
          <template v-for="item in genreResults">
            <li :key="`genre.${item.name}`" class="text-gray-50 select-none relative cursor-pointer hover:bg-white/10 py-1" role="option" @click="clickOption">
              <nuxt-link :to="`/library/${currentLibraryId}/bookshelf?filter=genres.${$encode(item.name)}`">
                <cards-genre-search-card :genre="item.name" :num-items="item.numItems" />
              </nuxt-link>
            </li>
          </template>

          <p v-if="narratorResults.length" class="uppercase text-xs text-gray-400 mb-1 mt-3 px-1 font-semibold">{{ $strings.LabelNarrators }}</p>
          <template v-for="narrator in narratorResults">
            <li :key="narrator.name" class="text-gray-50 select-none relative cursor-pointer hover:bg-white/10 py-1" role="option" @click="clickOption">
              <nuxt-link :to="`/library/${currentLibraryId}/bookshelf?filter=narrators.${$encode(narrator.name)}`">
                <cards-narrator-search-card :narrator="narrator.name" :num-books="narrator.numBooks" />
              </nuxt-link>
            </li>
          </template>

          <!-- Books you don't own yet, from the online catalog -->
          <template v-if="showStore">
            <div class="flex items-center mb-1 mt-3 px-1" :class="{ 'mt-1!': !totalResults }">
              <p class="uppercase text-xs text-brand font-semibold">{{ $strings.HeaderNotInYourLibrary }}</p>
              <span v-if="storeFetching" class="material-symbols text-sm text-gray-400 animate-spin ml-2">progress_activity</span>
            </div>
            <li v-if="storeFetching && !storeResults.length" class="py-1.5 px-2 text-xs text-gray-400">{{ $strings.MessageSearchingStore }}</li>
            <li v-else-if="!storeResults.length" class="py-1.5 px-2 text-xs text-gray-400">{{ $strings.MessageNoStoreResults }}</li>
            <li v-for="book in storeResults" :key="'store.' + (book.asin || book.id)" class="text-gray-50 select-none relative cursor-pointer hover:bg-white/10 rounded-lg py-1 px-1" role="option" @click="openStoreBook(book)">
              <div class="flex items-center gap-3">
                <div class="w-11 h-11 shrink-0 rounded-md overflow-hidden bg-surface-3">
                  <img v-if="book.cover" :src="book.cover" loading="lazy" class="w-full h-full object-cover" alt="" />
                </div>
                <div class="min-w-0 grow">
                  <p class="text-sm truncate">{{ book.title }}</p>
                  <p class="text-xs text-gray-400 truncate">{{ book.author }}</p>
                </div>
                <span v-if="book.status === 'downloading' || book.status === 'requested'" class="material-symbols text-base text-info shrink-0">{{ book.status === 'downloading' ? 'downloading' : 'schedule' }}</span>
                <span v-else class="material-symbols text-lg text-gray-400 shrink-0">add_circle</span>
              </div>
            </li>
            <li v-if="storeResults.length" class="select-none cursor-pointer text-xs text-brand hover:text-white px-2 pt-2 pb-1 flex items-center" role="option" @click="seeAllInStore">{{ $strings.ButtonSeeAllInDiscover }}<span class="material-symbols text-sm">chevron_right</span></li>
          </template>
        </template>
      </ul>
    </div>
  </div>
</template>

<script>
export default {
  data() {
    return {
      showMenu: false,
      isFocused: false,
      focusTimeout: null,
      isTyping: false,
      isFetching: false,
      search: null,
      podcastResults: [],
      episodeResults: [],
      bookResults: [],
      authorResults: [],
      seriesResults: [],
      tagResults: [],
      genreResults: [],
      narratorResults: [],
      searchTimeout: null,
      lastSearch: null,
      storeResults: [],
      storeFetching: false
    }
  },
  computed: {
    currentLibraryId() {
      return this.$store.state.libraries.currentLibraryId
    },
    /** Only book libraries get store results (the catalogs are book catalogs) */
    showStore() {
      return this.$store.getters['libraries/getCurrentLibraryMediaType'] === 'book' && !!this.lastSearch
    },
    totalResults() {
      return this.bookResults.length + this.seriesResults.length + this.authorResults.length + this.tagResults.length + this.genreResults.length + this.podcastResults.length + this.narratorResults.length + this.episodeResults.length
    }
  },
  methods: {
    clickOption() {
      this.clearResults()
    },
    openStoreBook(book) {
      this.clearResults()
      this.$eventBus.$emit('open-store-book', book)
    },
    seeAllInStore() {
      const keywords = this.lastSearch
      this.clearResults()
      this.$router.push({ path: `/library/${this.currentLibraryId}/discovery`, query: { keywords, sortBy: 'Relevance', title: this.$getString('HeaderStoreResultsFor', [keywords]) } })
    },
    async runStoreSearch(value) {
      this.storeResults = []
      if (this.$store.getters['libraries/getCurrentLibraryMediaType'] !== 'book') return
      this.storeFetching = true
      const data = await this.$axios.$get(`/api/discovery/browse?${new URLSearchParams({ keywords: value, sortBy: 'Relevance', limit: '12' }).toString()}`).catch((error) => {
        console.error('Store search error', error)
        return null
      })
      // A newer search (or a clear) replaced this one
      if (this.lastSearch !== value) return
      this.storeResults = (data?.books || []).filter((b) => b.status !== 'owned').slice(0, 5)
      this.storeFetching = false
    },
    submitSearch() {
      if (!this.search) return
      var search = this.search
      this.clearResults()
      this.$router.push(`/library/${this.currentLibraryId}/search?q=${encodeURIComponent(search)}`)
    },
    clearResults() {
      this.search = null
      this.lastSearch = null
      this.podcastResults = []
      this.episodeResults = []
      this.bookResults = []
      this.authorResults = []
      this.seriesResults = []
      this.tagResults = []
      this.genreResults = []
      this.narratorResults = []
      this.storeResults = []
      this.storeFetching = false
      this.showMenu = false
      this.isFetching = false
      this.isTyping = false
      clearTimeout(this.searchTimeout)
      this.$nextTick(() => {
        if (this.$refs.input) {
          this.$refs.input.blur()
        }
      })
    },
    focussed() {
      this.isFocused = true
      this.showMenu = true
    },
    blurred() {
      this.isFocused = false
      clearTimeout(this.focusTimeout)
      this.focusTimeout = setTimeout(() => {
        this.showMenu = false
      }, 100)
    },
    async runSearch(value) {
      this.lastSearch = value
      if (!this.lastSearch) {
        return
      }
      this.isFetching = true
      this.runStoreSearch(value)

      const searchResults = await this.$axios.$get(`/api/libraries/${this.currentLibraryId}/search?q=${encodeURIComponent(value)}&limit=3`).catch((error) => {
        console.error('Search error', error)
        return []
      })

      // Search was canceled
      if (!this.isFetching) return

      this.podcastResults = searchResults.podcast || []
      this.episodeResults = searchResults.episodes || []
      this.bookResults = searchResults.book || []
      this.authorResults = searchResults.authors || []
      this.seriesResults = searchResults.series || []
      this.tagResults = searchResults.tags || []
      this.genreResults = searchResults.genres || []
      this.narratorResults = searchResults.narrators || []

      this.isFetching = false
      if (!this.showMenu) {
        return
      }
    },
    inputUpdate(val) {
      clearTimeout(this.searchTimeout)
      if (!val) {
        this.lastSearch = ''
        this.isTyping = false
        return
      }
      this.isTyping = true
      this.searchTimeout = setTimeout(() => {
        // Canceled search
        if (!this.isTyping) return

        this.isTyping = false
        this.runSearch(val)
      }, 750)
    },
    clickClear() {
      this.clearResults()
    }
  },
  mounted() {}
}
</script>

<style scoped>
.globalSearchMenu {
  max-height: calc(100vh - 75px);
}
</style>
