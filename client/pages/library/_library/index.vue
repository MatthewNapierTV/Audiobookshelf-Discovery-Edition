<template>
  <div class="page" :class="streamLibraryItem ? 'streaming' : ''">
    <app-book-shelf-toolbar is-home />

    <!-- Book libraries: Netflix / Audible style home -->
    <app-book-shelf-categorized v-if="isBookLibrary" home-feed>
      <template #top>
        <div v-if="!storefrontLoaded" class="home-hero-skeleton" />
      </template>

      <template #before-shelves="{ shelves }">
        <home-hero :slides="heroSlides(shelves)" @resume="resume" @open-book="openBook" @toggle-wishlist="toggleWishlist" />

        <!-- Today: daily goal + genre shortcuts -->
        <div class="home-today relative z-10 pl-8e pr-8e mt-6e flex flex-col lg:flex-row gap-5">
          <home-goal-card />
          <div v-if="genres.length" class="surface-card bg-surface-2/70 flex-1 min-w-0 p-5">
            <p class="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-gray-400 mb-3">{{ $strings.HeaderBrowseGenres }}</p>
            <div class="flex flex-wrap gap-2">
              <nuxt-link v-for="genre in genres" :key="genre.id" :to="genreLink(genre)" class="px-3.5 py-1.5 rounded-full bg-white/5 hover:bg-brand/15 hover:text-brand border border-white/10 text-sm text-gray-200 transition-colors">{{ genre.name }}</nuxt-link>
            </div>
          </div>
        </div>

        <home-store-row v-for="row in rowsAt(-1, shelves)" :key="row.key" :row="row" :card-width="storeCardWidth" @select="openBook" @see-all="seeAll" />
      </template>

      <template #after-shelf="{ index, shelves }">
        <home-store-row v-for="row in rowsAt(index, shelves)" :key="row.key" :row="row" :card-width="storeCardWidth" @select="openBook" @see-all="seeAll" />
      </template>

      <template #bottom="{ shelves }">
        <home-store-row v-for="row in rowsAt('bottom', shelves)" :key="row.key" :row="row" :card-width="storeCardWidth" @select="openBook" @see-all="seeAll" />
        <p v-if="storefrontLoaded && !storeShelves.length && !top10" class="pl-8e pr-8e text-sm text-gray-500 py-6">{{ $strings.MessageDiscoveryStorefrontUnavailable }}</p>
        <p v-if="storeShelves.length" class="pl-8e pr-8e pt-2 pb-6 text-[0.7rem] text-gray-500">{{ $strings.MessageCatalogSources }}</p>
      </template>
    </app-book-shelf-categorized>

    <!-- Podcast libraries keep the classic home -->
    <app-book-shelf-categorized v-else />

    <discovery-book-details-modal v-model="showBookModal" :book="modalBook" :library-id="libraryId" :can-download="canDownload" :can-request="canRequest" :downloads-disabled="!downloadsEnabled" @status="onBookStatus" @choose-release="chooseRelease" />
  </div>
</template>

<script>
export default {
  async asyncData({ store, params, redirect }) {
    const libraryId = params.library
    const library = await store.dispatch('libraries/fetch', libraryId)
    if (!library) {
      return redirect(`/oops?message=Library "${libraryId}" not found`)
    }
    return {
      library,
      libraryId
    }
  },
  data() {
    return {
      storefrontLoaded: false,
      hero: [],
      top10: null,
      storeShelves: [],
      genres: [],
      canDownload: false,
      canRequest: false,
      downloadsEnabled: true,
      showBookModal: false,
      modalBook: null
    }
  },
  computed: {
    streamLibraryItem() {
      return this.$store.state.streamLibraryItem
    },
    isBookLibrary() {
      return this.$store.getters['libraries/getCurrentLibraryMediaType'] === 'book'
    },
    storeCardWidth() {
      const coverSize = this.$store.getters['user/getUserSetting']('bookshelfCoverSize') || 120
      return Math.round(coverSize * 1.45)
    },
    wishlistShelf() {
      const items = this.$store.state.wishlist.items
      if (!items.length) return null
      return { id: 'want-to-read', title: this.$strings.HeaderWantToRead, subtitle: this.$strings.MessageWantToReadSubtitle, books: items }
    },
    /** Online rows in display order (Top 10 and Want to Read lead, then the storefront shelves) */
    storeRows() {
      const rows = []
      if (this.top10) rows.push({ key: 'top10', kind: 'top10', shelf: this.top10 })
      if (this.wishlistShelf) rows.push({ key: 'want-to-read', kind: 'shelf', shelf: this.wishlistShelf })
      for (const shelf of this.storeShelves) rows.push({ key: shelf.id, kind: 'shelf', shelf })
      return rows
    }
  },
  methods: {
    /**
     * Interleave online rows with the library's own rows, streaming-app style:
     * Continue Listening/Reading stay on top, then Top 10 + Want to Read, then two online rows
     * after each remaining library row; anything left goes at the bottom.
     */
    rowsAt(position, shelves) {
      const rows = this.storeRows
      if (!rows.length) return []
      let anchor = -1
      shelves.forEach((s, i) => {
        if (s.id.startsWith('continue-')) anchor = i
      })
      const lead = rows.slice(0, rows.findIndex((r) => r.kind === 'shelf' && r.key !== 'want-to-read') === -1 ? rows.length : rows.findIndex((r) => r.kind === 'shelf' && r.key !== 'want-to-read'))
      const rest = rows.slice(lead.length)
      if (position === anchor) return lead
      if (position === 'bottom') {
        const slots = Math.max(0, shelves.length - 1 - anchor)
        return rest.slice(slots * 2)
      }
      if (typeof position === 'number' && position > anchor) {
        const slot = position - anchor - 1
        return rest.slice(slot * 2, slot * 2 + 2)
      }
      return []
    },
    heroSlides(shelves) {
      const slides = []
      for (const id of ['continue-listening', 'continue-reading']) {
        const libraryItem = shelves.find((s) => s.id === id)?.entities?.[0]
        if (!libraryItem || slides.some((s) => s.libraryItem?.id === libraryItem.id)) continue
        const metadata = libraryItem.media?.metadata || {}
        const progress = this.$store.getters['user/getUserMediaProgress'](libraryItem.id)
        slides.push({
          key: `resume-${libraryItem.id}`,
          kind: 'resume',
          eyebrow: id === 'continue-reading' ? this.$strings.LabelContinueReading : this.$strings.LabelContinueListening,
          title: metadata.title,
          author: metadata.authorName || (metadata.authors || []).map((a) => a.name).join(', '),
          cover: this.$store.getters['globals/getLibraryItemCoverSrc'](libraryItem),
          description: (metadata.description || '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim(),
          progress: progress ? progress.ebookProgress || progress.progress || 0 : 0,
          isEbook: id === 'continue-reading',
          libraryItem
        })
      }
      for (const book of this.hero) {
        slides.push({
          key: `store-${book.asin || book.id}`,
          kind: 'store',
          eyebrow: this.$strings.LabelFeaturedNewRelease,
          title: book.title,
          author: book.author,
          cover: book.cover,
          description: book.description,
          meta: [book.narrator ? `${this.$strings.LabelNarrators}: ${book.narrator}` : null, book.duration ? this.$elapsedPrettyExtended(book.duration * 60, false, false) : null, book.rating ? `★ ${book.rating.toFixed(1)}` : null].filter(Boolean),
          book
        })
      }
      return slides.slice(0, 7)
    },
    async resume(libraryItem) {
      if (!libraryItem) return
      const hasAudio = libraryItem.media?.numTracks || libraryItem.media?.tracks?.length || libraryItem.media?.duration
      if (!hasAudio && libraryItem.media?.ebookFormat) {
        const expanded = await this.$axios.$get(`/api/items/${libraryItem.id}?expanded=1`).catch(() => null)
        if (expanded) this.$store.commit('showEReader', { libraryItem: expanded, keepProgress: true })
        return
      }
      const metadata = libraryItem.media?.metadata || {}
      this.$eventBus.$emit('play-item', {
        libraryItemId: libraryItem.id,
        episodeId: null,
        queueItems: [{ libraryItemId: libraryItem.id, libraryId: libraryItem.libraryId, episodeId: null, title: metadata.title, subtitle: metadata.authorName, caption: '', duration: libraryItem.media?.duration || null, coverPath: libraryItem.media?.coverPath || null }]
      })
    },
    openBook(book) {
      this.modalBook = book
      this.showBookModal = true
    },
    async toggleWishlist(book) {
      try {
        const added = await this.$store.dispatch('wishlist/toggle', book)
        this.$toast.success(added ? this.$strings.ToastAddedToWantToRead : this.$strings.ToastRemovedFromWantToRead)
      } catch (error) {
        console.error('Wishlist update failed', error)
        this.$toast.error(this.$strings.ToastFailedToUpdate)
      }
    },
    onBookStatus({ book, status }) {
      const lists = [...this.storeShelves.map((s) => s.books), this.top10?.books || [], this.hero]
      for (const list of lists) {
        for (const b of list) {
          if (b === book || (book.asin && b.asin === book.asin) || (book.id && b.id === book.id)) this.$set(b, 'status', status)
        }
      }
    },
    chooseRelease(book) {
      this.$router.push({ path: `/library/${this.libraryId}/discovery`, query: { q: book.title, author: book.author || '' } })
    },
    genreLink(genre) {
      return { path: `/library/${this.libraryId}/discovery`, query: { categoryId: genre.id, title: genre.name } }
    },
    seeAll(shelf) {
      if (!shelf.browse) return
      this.$router.push({ path: `/library/${this.libraryId}/discovery`, query: { ...shelf.browse, title: shelf.title } })
    },
    async loadStorefront() {
      const [storefront, config] = await Promise.all([
        this.$axios.$get('/api/discovery/storefront').catch((error) => {
          console.error('Failed to load storefront', error)
          return null
        }),
        this.$axios.$get('/api/discovery/downloads').catch(() => null)
      ])
      this.hero = storefront?.hero || []
      this.top10 = storefront?.top10 || null
      this.storeShelves = storefront?.shelves || []
      this.genres = storefront?.genres || []
      this.downloadsEnabled = !!config?.enabled
      this.canDownload = !!(config?.enabled && config?.canDownload)
      this.canRequest = !!(config?.enabled && config?.canRequest)
      this.storefrontLoaded = true
    }
  },
  mounted() {
    if (this.isBookLibrary) {
      this.$store.dispatch('wishlist/load')
      this.loadStorefront()
    }
  }
}
</script>

<style>
.home-hero-skeleton {
  height: clamp(22rem, 52vh, 34rem);
  background: linear-gradient(110deg, rgba(255, 255, 255, 0.02) 30%, rgba(255, 255, 255, 0.05) 50%, rgba(255, 255, 255, 0.02) 70%);
  background-size: 200% 100%;
  animation: home-shimmer 1.6s linear infinite;
}
@keyframes home-shimmer {
  to {
    background-position: -200% 0;
  }
}
</style>
