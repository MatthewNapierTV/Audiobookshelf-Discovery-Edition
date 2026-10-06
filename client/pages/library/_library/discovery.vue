<template>
  <div class="page" :class="streamLibraryItem ? 'streaming' : ''">
    <app-book-shelf-toolbar is-home />

    <div id="bookshelf" ref="scrollContainer" class="w-full overflow-y-auto px-2 py-6 sm:px-4 md:px-12 md:py-8 relative">
      <div class="w-full mx-auto" :class="isSearchActive ? 'max-w-4xl' : 'max-w-7xl'">
        <div class="flex flex-wrap items-center gap-3 mb-4">
          <div class="flex items-center mr-auto">
            <span class="material-symbols text-3xl text-white/70 mr-2">travel_explore</span>
            <h1 class="text-xl">{{ $strings.HeaderDiscovery }}</h1>
          </div>
          <button v-if="isSearchActive || browseShelf" type="button" class="text-sm text-gray-300 hover:text-white flex items-center" @click="backToStorefront"><span class="material-symbols text-lg mr-0.5">arrow_back</span>{{ $strings.ButtonDiscoveryBackToBrowse }}</button>
        </div>

        <!-- Not configured notice -->
        <div v-if="!configuredKnown" class="w-full flex justify-center py-8">
          <ui-loading-indicator />
        </div>
        <div v-else-if="!isEnabled" class="w-full bg-warning/20 border border-warning/40 rounded p-4 text-center">
          <p class="text-base">{{ $strings.MessageDiscoveryNotConfigured }}</p>
          <nuxt-link v-if="userIsAdminOrUp" to="/config/discovery" class="text-warning underline text-sm">{{ $strings.HeaderDiscoverySettings }}</nuxt-link>
        </div>

        <template v-else>
          <!-- Search (always available) -->
          <form @submit.prevent="submitSearch" class="flex flex-wrap items-center gap-2">
            <div class="w-40">
              <ui-dropdown v-model="bookProvider" :items="providers" :disabled="searching" />
            </div>
            <ui-text-input v-model="searchInput" type="search" :disabled="searching" :placeholder="$strings.PlaceholderSearchAudiobook" class="grow text-sm md:text-base" style="min-width: 160px" />
            <ui-btn type="submit" :disabled="searching">{{ $strings.ButtonSearch }}</ui-btn>
          </form>
          <div class="mt-1 mb-4">
            <button type="button" class="text-xs text-gray-400 hover:text-white underline disabled:opacity-40 disabled:no-underline" :disabled="!searchInput || searching || searchingReleases" @click="searchIndexersDirect"><span class="material-symbols text-sm mr-1 align-middle">manage_search</span>{{ $strings.ButtonSearchIndexersDirect }}</button>
          </div>

          <!-- ============ Storefront (Audible-style browse) ============ -->
          <template v-if="!isSearchActive">
            <!-- "See all" / genre grid -->
            <div v-if="browseShelf">
              <h2 class="text-2xl font-semibold mb-1">{{ browseShelf.title }}</h2>
              <p v-if="browseShelf.subtitle" class="text-sm text-gray-400 mb-4">{{ browseShelf.subtitle }}</p>
              <div class="flex items-center gap-2 mb-4">
                <span class="text-xs text-gray-400">{{ $strings.LabelSortBy }}:</span>
                <button v-for="opt in sortOptions" :key="opt.value" type="button" :class="formatBtnClass(browseSort === opt.value)" @click="changeBrowseSort(opt.value)">{{ opt.text }}</button>
              </div>
              <div v-if="browseLoading" class="w-full flex justify-center py-12"><ui-loading-indicator /></div>
              <div v-else-if="browseBooks.length" class="grid gap-x-4 gap-y-6" style="grid-template-columns: repeat(auto-fill, minmax(150px, 1fr))">
                <discovery-book-card v-for="(book, index) in browseBooks" :key="book.asin || index" :book="book" :width="150" :rank="browseSort === 'BestSellers' ? index + 1 : null" @select="openBook" />
              </div>
              <p v-else class="text-center text-gray-400 py-8">{{ $strings.MessageNoResults }}</p>
            </div>

            <template v-else>
              <div v-if="storefrontLoading" class="w-full flex flex-col items-center justify-center py-16">
                <ui-loading-indicator />
                <p class="text-xs text-gray-400 mt-2">{{ $strings.MessageDiscoveryLoadingStorefront }}</p>
              </div>
              <div v-else-if="!shelves.length" class="w-full bg-primary/20 rounded p-6 text-center text-sm text-gray-300">
                {{ $strings.MessageDiscoveryStorefrontUnavailable }}
              </div>
              <template v-else>
                <!-- Hero: #1 best seller you don't have -->
                <div v-if="heroBook" class="relative rounded-xl overflow-hidden mb-6 cursor-pointer group" @click="openBook(heroBook)">
                  <img v-if="heroBook.cover" :src="heroBook.cover" class="absolute inset-0 w-full h-full object-cover blur-2xl opacity-40 scale-125" alt="" />
                  <div class="absolute inset-0 bg-linear-to-r from-black/80 via-black/50 to-transparent" />
                  <div class="relative flex items-center gap-6 p-6 md:p-8">
                    <img v-if="heroBook.cover" :src="heroBook.cover" class="w-32 h-32 md:w-48 md:h-48 rounded-md shadow-2xl object-cover shrink-0 group-hover:scale-[1.02] transition-transform" :alt="heroBook.title" />
                    <div class="min-w-0">
                      <p class="text-xs uppercase tracking-widest text-yellow-400 font-semibold mb-1">{{ heroShelfTitle }}</p>
                      <h2 class="text-2xl md:text-4xl font-bold leading-tight line-clamp-2">{{ heroBook.title }}</h2>
                      <p class="text-sm md:text-base text-gray-200 mt-1">{{ $getString('LabelByAuthor', [heroBook.author || $strings.LabelUnknown]) }}</p>
                      <p v-if="heroBook.description" class="hidden md:block text-sm text-gray-300 mt-3 max-w-2xl line-clamp-3">{{ heroBook.description }}</p>
                      <ui-btn color="bg-yellow-500" class="text-black! font-semibold mt-4" small>{{ $strings.ButtonDiscoveryViewDetails }}</ui-btn>
                    </div>
                  </div>
                </div>

                <!-- Genre chips -->
                <div v-if="genres.length" class="flex gap-2 overflow-x-auto pb-2 mb-6">
                  <button v-for="genre in genres" :key="genre.id" type="button" class="shrink-0 px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-sm text-gray-200 whitespace-nowrap" @click="openGenre(genre)">{{ genre.name }}</button>
                </div>

                <discovery-shelf v-for="shelf in shelves" :key="shelf.id" :shelf="shelf" @select="openBook" @see-all="openShelf" />
              </template>
            </template>
          </template>

          <!-- ============ Search / manual release selection ============ -->
          <template v-else>
            <!-- Book results -->
            <div v-if="bookResults.length" class="py-4">
              <p v-if="!selectedBook" class="text-sm text-gray-400 mb-2">{{ $strings.LabelSelectBook }}</p>
              <template v-for="(book, index) in bookResults">
                <div v-if="!selectedBook || selectedBook === book" :key="index" class="flex p-1 rounded" :class="selectedBook === book ? 'bg-primary/40' : 'hover:bg-primary/25 cursor-pointer'" @click="selectedBook ? null : openBook(book)">
                  <div class="w-16 min-w-16 h-16 bg-primary/50">
                    <img v-if="book.cover" :src="book.cover" class="h-full w-full object-contain" />
                  </div>
                  <div class="grow pl-4">
                    <p class="text-base text-gray-100">{{ book.title }}</p>
                    <p v-if="book.subtitle" class="text-xs text-gray-400">{{ book.subtitle }}</p>
                    <p class="text-sm text-gray-300">{{ $getString('LabelByAuthor', [book.author || $strings.LabelUnknown]) }}</p>
                    <p v-if="book.narrator" class="text-xs text-gray-400">{{ $strings.LabelNarrators }}: {{ book.narrator }}</p>
                  </div>
                  <div v-if="selectedBook === book" class="flex items-center">
                    <ui-btn small @click.stop="clearSelectedBook">{{ $strings.ButtonClear }}</ui-btn>
                  </div>
                </div>
              </template>
            </div>
            <p v-else-if="searchedTerm && !searching" class="text-center text-gray-400 py-4">{{ $strings.MessageNoResults }}</p>

            <!-- Step 2: Choose a download -->
            <div v-if="selectedBook || directMode" class="py-2 mt-2 border-t border-white/10">
              <div class="flex items-center mt-3 mb-2">
                <p class="text-xs uppercase tracking-wide text-gray-400 font-semibold">{{ $strings.LabelDiscoveryStepChooseDownload }}</p>
                <p v-if="directMode" class="text-xs text-gray-500 ml-2 truncate">— {{ $strings.LabelDiscoveryDirectSearch }}: "{{ releaseQuery }}"</p>
                <ui-btn v-if="directMode" x-small class="ml-auto" @click="clearSelectedBook">{{ $strings.ButtonClear }}</ui-btn>
              </div>

              <!-- Format toggle: audiobook / ebook (either or both) -->
              <div class="flex items-center flex-wrap gap-2 mb-3">
                <span class="text-xs text-gray-400 mr-1">{{ $strings.LabelFormat }}:</span>
                <button type="button" :class="formatBtnClass(formats.audiobook)" @click="toggleFormat('audiobook')"><span class="material-symbols text-sm mr-1 align-middle">headphones</span>{{ $strings.LabelAudiobook }}</button>
                <button type="button" :class="formatBtnClass(formats.ebook)" @click="toggleFormat('ebook')"><span class="material-symbols text-sm mr-1 align-middle">menu_book</span>{{ $strings.LabelEbook }}</button>
                <button type="button" class="ml-auto text-xs text-gray-400 hover:text-white underline flex items-center" @click="showRefine = !showRefine">
                  {{ $strings.LabelDiscoveryRefineSearch }}<span class="material-symbols text-sm ml-0.5">{{ showRefine ? 'expand_less' : 'expand_more' }}</span>
                </button>
              </div>

              <!-- Indexer search (what we actually query the trackers for) - hidden behind "Refine" -->
              <div v-if="showRefine" class="mb-3 p-2 rounded bg-primary/10">
                <label class="text-xs text-gray-400">{{ $strings.LabelDiscoveryIndexerSearch }}</label>
                <form @submit.prevent="fetchReleases" class="flex mt-1">
                  <ui-text-input v-model="releaseQuery" type="search" :disabled="searchingReleases" :placeholder="$strings.PlaceholderReleaseSearch" class="grow mr-2 text-sm" />
                  <ui-btn type="submit" small :disabled="searchingReleases || !releaseQuery">{{ $strings.ButtonSearch }}</ui-btn>
                </form>
                <p class="text-xxs text-gray-500 mt-1">{{ $strings.LabelDiscoveryIndexerSearchHelp }}</p>
              </div>

              <div v-if="searchingReleases" class="w-full flex justify-center py-6">
                <ui-loading-indicator />
              </div>
              <template v-else>
                <p v-if="!releases.length && releaseSearched" class="text-center text-gray-400 py-4">{{ $strings.MessageNoReleasesFound }}</p>
                <table v-else-if="releases.length" class="w-full text-sm">
                  <thead>
                    <tr class="text-left text-gray-400 border-b border-white/10">
                      <th class="py-1 pr-2 font-normal whitespace-nowrap">{{ $strings.LabelType }}</th>
                      <th class="py-1 px-2 font-normal">{{ $strings.LabelTitle }}</th>
                      <th class="py-1 px-2 font-normal whitespace-nowrap">{{ $strings.LabelIndexer }}</th>
                      <th class="py-1 px-2 font-normal whitespace-nowrap">{{ $strings.LabelSize }}</th>
                      <th class="py-1 px-2 font-normal whitespace-nowrap">{{ $strings.LabelSeeders }}</th>
                      <th class="py-1 pl-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(release, index) in releases" :key="index" class="border-b border-white/5 hover:bg-primary/10">
                      <td class="py-1.5 pr-2 whitespace-nowrap">
                        <span :class="mediaTypeBadgeClass(release.mediaType)" class="px-1.5 py-0.5 rounded text-xxs whitespace-nowrap">{{ mediaTypeLabel(release.mediaType) }}</span>
                      </td>
                      <td class="py-1.5 px-2 max-w-xs truncate" :title="release.title">{{ release.title }}</td>
                      <td class="py-1.5 px-2 whitespace-nowrap" :class="isAdmin ? 'text-gray-300' : 'text-gray-500 italic'">{{ isAdmin ? release.indexer : $strings.LabelAdminOnly }}</td>
                      <td class="py-1.5 px-2 whitespace-nowrap text-gray-300">{{ $bytesPretty(release.size) }}</td>
                      <td class="py-1.5 px-2 whitespace-nowrap text-gray-300">{{ release.seeders != null ? release.seeders : '-' }}</td>
                      <td class="py-1.5 pl-2 text-right">
                        <ui-btn v-if="canDownload" small :disabled="downloadingGuids.includes(release.guid)" @click="downloadRelease(release)">{{ $strings.ButtonDownload }}</ui-btn>
                        <ui-btn v-else-if="canRequest" small color="bg-info" :disabled="downloadingGuids.includes(release.guid)" @click="requestRelease(release)">{{ $strings.ButtonRequest }}</ui-btn>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </template>
            </div>
          </template>
        </template>
      </div>

      <div v-show="searching" class="absolute top-0 left-0 w-full h-full flex items-center justify-center bg-black/25 z-40">
        <ui-loading-indicator />
      </div>
    </div>

    <discovery-book-details-modal v-model="showBookModal" :book="modalBook" :library-id="currentLibraryId" :can-download="canDownload" :can-request="canRequest" @status="onBookStatus" @choose-release="chooseRelease" />
  </div>
</template>

<script>
export default {
  async asyncData({ params, store, redirect }) {
    const libraryId = params.library
    const libraryData = await store.dispatch('libraries/fetch', libraryId)
    if (!libraryData) {
      return redirect('/oops?message=Library not found')
    }
    // Discovery is for book libraries only
    if (libraryData.library.mediaType !== 'book') {
      return redirect(`/library/${libraryId}`)
    }
    return {
      libraryId
    }
  },
  data() {
    return {
      configuredKnown: false,
      isEnabled: false,
      isAdmin: false,
      canDownload: false,
      canRequest: false,
      searchInput: '',
      searchedTerm: '',
      searching: false,
      bookProvider: 'audible',
      providers: [
        { text: 'Audible', value: 'audible' },
        { text: 'Google Books', value: 'google' },
        { text: 'Open Library', value: 'openlibrary' },
        { text: 'iTunes', value: 'itunes' },
        { text: 'FantLab', value: 'fantlab' }
      ],
      bookResults: [],
      selectedBook: null,
      directMode: false,
      releaseQuery: '',
      showRefine: false,
      formats: { audiobook: true, ebook: false },
      searchingReleases: false,
      releaseSearched: false,
      releases: [],
      downloadingGuids: [],
      // Storefront
      storefrontLoading: false,
      shelves: [],
      genres: [],
      browseShelf: null,
      browseBooks: [],
      browseLoading: false,
      browseSort: 'BestSellers',
      showBookModal: false,
      modalBook: null
    }
  },
  computed: {
    currentLibraryId() {
      return this.$store.state.libraries.currentLibraryId
    },
    streamLibraryItem() {
      return this.$store.state.streamLibraryItem
    },
    userIsAdminOrUp() {
      return this.$store.getters['user/getIsAdminOrUp']
    },
    isSearchActive() {
      return !!(this.bookResults.length || this.selectedBook || this.directMode || this.searchedTerm)
    },
    heroShelf() {
      return this.shelves.find((s) => s.hero) || null
    },
    heroBook() {
      return this.heroShelf?.books.find((b) => b.status !== 'owned') || null
    },
    heroShelfTitle() {
      if (!this.heroShelf || !this.heroBook) return ''
      return `#${this.heroShelf.books.indexOf(this.heroBook) + 1} in ${this.heroShelf.title}`
    },
    sortOptions() {
      return [
        { text: this.$strings.LabelDiscoverySortBestSellers, value: 'BestSellers' },
        { text: this.$strings.LabelDiscoverySortNewest, value: '-ReleaseDate' },
        { text: this.$strings.LabelDiscoverySortTopRated, value: 'AvgRating' }
      ]
    }
  },
  methods: {
    async fetchStorefront() {
      this.storefrontLoading = true
      const data = await this.$axios.$get('/api/discovery/storefront').catch((error) => {
        console.error('Failed to load storefront', error)
        return null
      })
      this.shelves = data?.shelves || []
      this.genres = data?.genres || []
      this.storefrontLoading = false
    },
    openBook(book) {
      this.modalBook = book
      this.showBookModal = true
    },
    openShelf(shelf) {
      this.browseShelf = { title: shelf.title, subtitle: shelf.subtitle, browse: { ...shelf.browse } }
      this.browseSort = shelf.browse?.sortBy || 'BestSellers'
      this.fetchBrowse()
    },
    openGenre(genre) {
      this.browseShelf = { title: genre.name, subtitle: null, browse: { categoryId: genre.id } }
      this.browseSort = 'BestSellers'
      this.fetchBrowse()
    },
    changeBrowseSort(sortBy) {
      if (this.browseSort === sortBy) return
      this.browseSort = sortBy
      this.fetchBrowse()
    },
    async fetchBrowse() {
      if (!this.browseShelf) return
      this.browseLoading = true
      this.browseBooks = []
      if (this.$refs.scrollContainer) this.$refs.scrollContainer.scrollTop = 0
      const { categoryId, keywords, author } = this.browseShelf.browse
      const params = new URLSearchParams({ sortBy: this.browseSort })
      if (categoryId) params.set('categoryId', categoryId)
      if (keywords) params.set('keywords', keywords)
      if (author) params.set('author', author)
      const data = await this.$axios.$get(`/api/discovery/browse?${params.toString()}`).catch((error) => {
        console.error('Failed to browse', error)
        this.$toast.error(this.$strings.ToastFailedToLoadData)
        return null
      })
      this.browseBooks = data?.books || []
      this.browseLoading = false
    },
    backToStorefront() {
      this.browseShelf = null
      this.browseBooks = []
      this.bookResults = []
      this.searchedTerm = ''
      this.clearSelectedBook()
    },
    // A grab from the details modal changed a book's status - reflect it on every shelf it appears on
    onBookStatus({ book, status }) {
      const lists = [...this.shelves.map((s) => s.books), this.browseBooks, this.bookResults]
      for (const list of lists) {
        for (const b of list) {
          if (b === book || (book.asin && b.asin === book.asin)) this.$set(b, 'status', status)
        }
      }
    },
    // "Choose release manually" from the details modal: jump into the indexer release picker
    chooseRelease(book) {
      this.browseShelf = null
      this.bookResults = [book]
      this.searchedTerm = book.title
      this.selectBook(book)
    },
    async submitSearch() {
      if (!this.searchInput) return
      this.searching = true
      this.selectedBook = null
      this.directMode = false
      this.releases = []

      const params = new URLSearchParams({ provider: this.bookProvider || 'audible', title: this.searchInput })
      const results = await this.$axios.$get(`/api/search/books?${params.toString()}`).catch((error) => {
        console.error('Book search failed', error)
        this.$toast.error(this.$strings.ToastSearchFailed || 'Search failed')
        return []
      })
      this.bookResults = Array.isArray(results) ? results : []
      this.searchedTerm = this.searchInput
      this.searching = false
    },
    // Skip the book-metadata step and query the indexers directly with the typed text
    async searchIndexersDirect() {
      if (!this.searchInput) return
      this.selectedBook = null
      this.bookResults = []
      this.searchedTerm = ''
      this.directMode = true
      this.releaseQuery = this.searchInput
      await this.fetchReleases()
    },
    clearSelectedBook() {
      this.selectedBook = null
      this.directMode = false
      this.releases = []
      this.releaseQuery = ''
      this.releaseSearched = false
    },
    // Indexers match on the whole phrase, so an Audible title+author query returns almost nothing.
    // Default the release search to the title with subtitle/series/parentheticals stripped off.
    cleanReleaseQuery(title) {
      if (!title) return ''
      let t = title.split(/[:,]/)[0] // drop subtitle after ":" or ","
      t = t.replace(/\([^)]*\)/g, ' ') // drop parentheticals like "(Book 1)"
      return t.replace(/\s+/g, ' ').trim()
    },
    async selectBook(book) {
      if (this.selectedBook === book) return
      this.selectedBook = book
      this.releases = []
      this.releaseSearched = false
      this.releaseQuery = this.cleanReleaseQuery(book.title)
      await this.fetchReleases()
    },
    selectedTypes() {
      return Object.keys(this.formats).filter((k) => this.formats[k])
    },
    toggleFormat(key) {
      const next = !this.formats[key]
      // Keep at least one format selected
      if (!next && this.selectedTypes().length === 1) return
      this.formats[key] = next
      if (this.selectedBook) this.fetchReleases()
    },
    formatBtnClass(on) {
      return ['px-3 py-1 rounded text-xs transition-colors', on ? 'bg-primary text-white' : 'bg-primary/20 text-gray-400 hover:bg-primary/30']
    },
    mediaTypeLabel(mt) {
      if (mt === 'audiobook') return this.$strings.LabelAudiobook
      if (mt === 'ebook') return this.$strings.LabelEbook
      return this.$strings.LabelUnknown
    },
    mediaTypeBadgeClass(mt) {
      if (mt === 'audiobook') return 'bg-blue-500/30 text-blue-200'
      if (mt === 'ebook') return 'bg-green-500/30 text-green-200'
      return 'bg-white/10 text-gray-300'
    },
    async fetchReleases() {
      if (!this.releaseQuery) return
      this.searchingReleases = true
      const params = new URLSearchParams({ query: this.releaseQuery, types: this.selectedTypes().join(',') })
      const data = await this.$axios.$get(`/api/discovery/releases?${params.toString()}`).catch((error) => {
        console.error('Release search failed', error)
        this.$toast.error(this.$strings.ToastReleaseSearchFailed || 'Failed to search releases')
        return { releases: [] }
      })
      // Sort by seeders desc
      this.releases = (data.releases || []).sort((a, b) => (b.seeders || 0) - (a.seeders || 0))
      this.releaseSearched = true
      this.searchingReleases = false
    },
    async downloadRelease(release) {
      this.downloadingGuids.push(release.guid)
      const payload = {
        release,
        title: this.selectedBook?.title,
        author: this.selectedBook?.author,
        cover: this.selectedBook?.cover,
        libraryId: this.currentLibraryId
      }
      const data = await this.$axios.$post(`/api/discovery/download`, payload).catch((error) => {
        console.error('Download failed', error)
        const message = error.response?.data?.error || this.$strings.ToastDownloadFailed || 'Download failed'
        this.$toast.error(message)
        return null
      })
      if (data?.download) {
        this.$toast.success(this.$strings.ToastDownloadStartedSeeDownloads || 'Download started — see the Downloads tab')
      }
      this.downloadingGuids = this.downloadingGuids.filter((g) => g !== release.guid)
    },
    async requestRelease(release) {
      this.downloadingGuids.push(release.guid)
      const payload = {
        release,
        title: this.selectedBook?.title,
        author: this.selectedBook?.author,
        cover: this.selectedBook?.cover,
        libraryId: this.currentLibraryId
      }
      const data = await this.$axios.$post(`/api/discovery/requests`, payload).catch((error) => {
        console.error('Request failed', error)
        this.$toast.error(error.response?.data?.error || this.$strings.ToastRequestFailed || 'Request failed')
        return null
      })
      if (data?.request) {
        if (data.request.status === 'approved') {
          this.$toast.success(this.$strings.ToastRequestApproved || 'Request approved — downloading')
        } else {
          this.$toast.success(this.$strings.ToastRequestSubmitted || 'Request submitted for approval')
        }
      }
      this.downloadingGuids = this.downloadingGuids.filter((g) => g !== release.guid)
    },
    async fetchConfig() {
      // The downloads endpoint is available to any authenticated user and reports whether discovery
      // is configured plus the current user's effective permissions.
      const data = await this.$axios.$get(`/api/discovery/downloads`).catch((error) => {
        console.error('Failed to fetch discovery config', error)
        return null
      })
      this.isEnabled = !!data?.enabled
      this.isAdmin = !!data?.isAdmin
      this.canDownload = !!data?.canDownload
      this.canRequest = !!data?.canRequest
      this.configuredKnown = true
    },
    async fetchProviders() {
      // Pull the full provider list (incl. custom providers); fall back to the built-in defaults
      const data = await this.$axios.$get(`/api/search/providers`).catch(() => null)
      const books = data?.providers?.books?.filter((p) => p.value !== 'audiobookcovers')
      if (books?.length) {
        this.providers = books
        if (!this.providers.some((p) => p.value === this.bookProvider)) {
          this.bookProvider = this.providers.find((p) => p.value === 'audible')?.value || this.providers[0].value
        }
      }
    }
  },
  async mounted() {
    this.fetchProviders()
    await this.fetchConfig()
    if (this.isEnabled) this.fetchStorefront()
  }
}
</script>
