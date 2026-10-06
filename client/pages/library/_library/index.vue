<template>
  <div class="page" :class="streamLibraryItem ? 'streaming' : ''">
    <app-book-shelf-toolbar is-home />

    <!-- Book libraries: Netflix / Audible style home -->
    <app-book-shelf-categorized v-if="isBookLibrary" home-feed>
      <template #top>
        <!-- Showcase reel: highly rated, new and upcoming books -->
        <div v-if="!storefrontLoaded" class="home-hero-skeleton" />
        <home-hero v-else :books="hero" :can-download="canDownload" :can-request="canRequest" :busy-key="requestingKey" @request="requestBook" @open-book="openBook" @toggle-wishlist="toggleWishlist" />
      </template>

      <template #before-shelves="{ shelves }">
        <!-- Rows start right under the reel, the first one tucked up over its bottom edge -->
        <div v-if="hero.length || !storefrontLoaded" class="home-reel-overlap" aria-hidden="true" />
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
      requestingKey: null,
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
    /** Get (download) or Request a book straight from the showcase reel */
    async requestBook(book) {
      const key = book.asin || book.id
      this.requestingKey = key
      try {
        const data = await this.$axios.$post('/api/discovery/grab', { book: { title: book.title, author: book.author, cover: book.cover }, mediaType: book.format === 'ebook' ? 'ebook' : 'audiobook', libraryId: this.libraryId })
        let status = 'requested'
        if (data.download) {
          status = 'downloading'
          this.$toast.success(this.$strings.ToastDownloadStartedSeeDownloads)
        } else if (data.searching) {
          this.$toast.info(this.$strings.ToastRequestSearching)
        } else if (data.request?.status === 'approved') {
          status = 'downloading'
          this.$toast.success(this.$strings.ToastRequestApproved)
        } else {
          this.$toast.success(this.$strings.ToastRequestSubmitted)
        }
        this.onBookStatus({ book, status })
      } catch (error) {
        console.error('Request failed', error)
        this.$toast.error(error.response?.data?.error || this.$strings.ToastRequestFailed)
      } finally {
        this.requestingKey = null
      }
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
.home-reel-overlap {
  margin-top: calc(-1 * clamp(4.5rem, 10vh, 6.5rem));
}
.home-hero-skeleton {
  height: clamp(30rem, 74vh, 46rem);
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
