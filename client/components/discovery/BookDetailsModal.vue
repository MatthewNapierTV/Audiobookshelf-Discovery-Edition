<template>
  <modals-modal v-model="show" name="discovery-book" :width="760" :height="'unset'" :processing="processing">
    <div v-if="book" class="w-full rounded-2xl bg-surface-2 shadow-[0_40px_80px_-20px_rgba(0,0,0,0.8)] border border-white/10 overflow-y-auto overflow-x-hidden" style="max-height: 85vh">
      <!-- Blurred cover backdrop, Audible product page style -->
      <div class="relative">
        <div v-if="display.cover" class="absolute inset-0 overflow-hidden">
          <img :src="display.cover" class="w-full h-full object-cover blur-2xl opacity-30 scale-125" alt="" />
        </div>
        <div class="relative flex flex-col sm:flex-row p-6 gap-6">
          <div class="w-40 h-40 sm:w-48 sm:h-48 shrink-0 mx-auto sm:mx-0 rounded-md overflow-hidden shadow-xl bg-primary/40">
            <img v-if="display.cover" :src="display.cover" class="w-full h-full object-cover" :alt="display.title" />
          </div>
          <div class="min-w-0 grow">
            <p v-if="sourceLabel" class="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-brand mb-1">{{ sourceLabel }}</p>
            <h2 class="text-2xl font-bold tracking-tight leading-tight">{{ display.title }}</h2>
            <p v-if="display.subtitle" class="text-sm text-gray-300 mt-0.5">{{ display.subtitle }}</p>
            <p class="text-sm text-gray-200 mt-2">{{ $getString('LabelByAuthor', [display.author || $strings.LabelUnknown]) }}</p>
            <p v-if="display.narrator" class="text-xs text-gray-400">{{ $strings.LabelNarrators }}: {{ display.narrator }}</p>
            <p v-if="seriesText" class="text-xs text-gray-400">{{ $strings.LabelSeries }}: {{ seriesText }}</p>

            <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-300 mt-3">
              <span v-if="display.rating" class="flex items-center"
                ><span class="material-symbols fill text-sm text-yellow-400 mr-0.5">star</span>{{ display.rating.toFixed(1) }}<span v-if="display.numRatings" class="text-gray-500 ml-1">({{ display.numRatings.toLocaleString() }})</span></span
              >
              <span v-if="display.duration" class="flex items-center"><span class="material-symbols text-sm mr-0.5">schedule</span>{{ $elapsedPrettyExtended(display.duration * 60, false, false) }}</span>
              <span v-if="display.releaseDate" class="flex items-center"><span class="material-symbols text-sm mr-0.5">event</span>{{ display.releaseDate }}</span>
              <span v-if="display.language">{{ display.language }}</span>
            </div>
            <div v-if="display.genres && display.genres.length" class="flex flex-wrap gap-1 mt-2">
              <span v-for="genre in display.genres" :key="genre" class="px-2 py-0.5 rounded-full bg-white/10 text-xxs text-gray-300">{{ genre }}</span>
            </div>

            <!-- Actions -->
            <div class="mt-5">
              <div v-if="book.status === 'owned'" class="flex items-center text-success text-sm"><span class="material-symbols mr-1">check_circle</span>{{ $strings.MessageDiscoveryAlreadyInLibrary }}</div>
              <div v-else-if="book.status === 'downloading' || book.status === 'requested'" class="flex items-center text-info text-sm mb-3">
                <span class="material-symbols mr-1">{{ book.status === 'downloading' ? 'downloading' : 'schedule' }}</span
                >{{ book.status === 'downloading' ? $strings.LabelDiscoveryDownloading : $strings.LabelDiscoveryRequested }}
              </div>

              <div v-if="book.status !== 'owned' && (canDownload || canRequest)" class="flex flex-wrap items-center gap-2">
                <ui-btn :color="preferEbook ? 'bg-white/10' : 'brand'" :disabled="processing" class="rounded-full!" @click="grab('audiobook')"> <span class="material-symbols text-lg align-middle mr-1">headphones</span>{{ canDownload ? $strings.ButtonDiscoveryGetAudiobook : $strings.ButtonDiscoveryRequestAudiobook }} </ui-btn>
                <ui-btn :color="preferEbook ? 'brand' : 'bg-white/10'" :disabled="processing" class="rounded-full!" @click="grab('ebook')"> <span class="material-symbols text-lg align-middle mr-1">menu_book</span>{{ canDownload ? $strings.ButtonDiscoveryGetEbook : $strings.ButtonDiscoveryRequestEbook }} </ui-btn>
              </div>
              <p v-else-if="book.status !== 'owned'" class="text-xs text-gray-400">{{ downloadsDisabled ? $strings.MessageDownloadsNotSetUp : $strings.MessageDiscoveryNoPermission }}</p>

              <!-- Secondary actions: Want to Read, sample, manual release pick -->
              <div class="flex flex-wrap items-center gap-2 mt-3">
                <button type="button" class="details-chip" :class="{ 'is-on': inWishlist }" :aria-pressed="inWishlist" @click="toggleWishlist">
                  <span class="material-symbols text-lg" :class="{ fill: inWishlist }">{{ inWishlist ? 'bookmark_added' : 'bookmark_add' }}</span
                  >{{ inWishlist ? $strings.LabelOnWantToRead : $strings.ButtonWantToRead }}
                </button>
                <button v-if="display.sampleUrl" type="button" class="details-chip" :class="{ 'is-on': samplePlaying }" @click="toggleSample">
                  <span class="material-symbols text-lg fill">{{ samplePlaying ? 'pause_circle' : 'play_circle' }}</span
                  >{{ samplePlaying ? $strings.ButtonPause : $strings.ButtonListenToSample }}
                </button>
                <button v-if="book.status !== 'owned' && (canDownload || canRequest)" type="button" class="text-xs text-gray-400 hover:text-white underline ml-1" :disabled="processing" @click="chooseManually">{{ $strings.ButtonDiscoveryChooseRelease }}</button>
              </div>
              <audio v-if="display.sampleUrl" ref="sample" :src="display.sampleUrl" preload="none" @ended="samplePlaying = false" @pause="samplePlaying = false" @play="samplePlaying = true" />

              <p v-if="lastError" class="text-xs text-error mt-2">{{ lastError }}</p>
              <p v-if="processing" class="text-xs text-gray-400 mt-2">{{ $strings.MessageDiscoverySearchingIndexers }}</p>
            </div>
          </div>
        </div>
      </div>

      <div v-if="loadingDetails && !display.description" class="px-6 pb-6 text-sm text-gray-500">{{ $strings.MessageLoading || 'Loading…' }}</div>
      <div v-if="display.description" class="px-6 pb-6">
        <h3 class="text-sm font-semibold text-gray-200 mb-1">{{ $strings.LabelDescription }}</h3>
        <p class="text-sm text-gray-300 whitespace-pre-line leading-relaxed">{{ display.description }}</p>
      </div>
    </div>
  </modals-modal>
</template>

<script>
export default {
  props: {
    value: Boolean,
    book: Object,
    libraryId: String,
    canDownload: Boolean,
    canRequest: Boolean,
    // Prowlarr/qBittorrent aren't configured: browsing & Want to Read still work
    downloadsDisabled: Boolean
  },
  data() {
    return {
      processing: false,
      lastError: null,
      details: null,
      loadingDetails: false,
      samplePlaying: false
    }
  },
  watch: {
    book() {
      this.lastError = null
      this.details = null
      this.stopSample()
      if (this.value) this.loadDetails()
    },
    value(open) {
      if (open) this.loadDetails()
      else this.stopSample()
    }
  },
  computed: {
    show: {
      get() {
        return this.value
      },
      set(val) {
        this.$emit('input', val)
      }
    },
    /** The card merged with any enrichment fetched for it (blurb, narrator, sample...) */
    display() {
      if (!this.book) return {}
      const merged = { ...this.book }
      for (const key in this.details || {}) {
        if (merged[key] === null || merged[key] === undefined || merged[key] === '' || merged[key] === 0 || (Array.isArray(merged[key]) && !merged[key].length)) merged[key] = this.details[key]
      }
      return merged
    },
    seriesText() {
      return (this.display?.series || []).map((s) => (s.sequence ? `${s.series} #${s.sequence}` : s.series)).join(', ')
    },
    sourceLabel() {
      const labels = { audible: 'Audible', apple: 'Apple Books', openlibrary: 'Open Library' }
      return labels[this.book?.source] ? this.$getString('LabelViaSource', [labels[this.book.source]]) : ''
    },
    preferEbook() {
      return this.book?.format === 'ebook'
    },
    inWishlist() {
      return this.$store.getters['wishlist/has'](this.book)
    }
  },
  methods: {
    async grab(mediaType) {
      this.processing = true
      this.lastError = null
      const payload = {
        book: { title: this.book.title, author: this.book.author, cover: this.book.cover },
        mediaType,
        libraryId: this.libraryId
      }
      try {
        const data = await this.$axios.$post('/api/discovery/grab', payload)
        if (data.download) {
          this.$toast.success(this.$strings.ToastDownloadStartedSeeDownloads || 'Download started')
          this.$emit('status', { book: this.book, status: 'downloading' })
        } else if (data.searching) {
          this.$toast.info(this.$strings.ToastRequestSearching)
          this.$emit('status', { book: this.book, status: 'requested' })
        } else if (data.request) {
          const approved = data.request.status === 'approved'
          this.$toast.success(approved ? this.$strings.ToastRequestApproved : this.$strings.ToastRequestSubmitted)
          this.$emit('status', { book: this.book, status: approved ? 'downloading' : 'requested' })
        }
        this.show = false
      } catch (error) {
        console.error('Grab failed', error)
        this.lastError = error.response?.data?.error || this.$strings.ToastDownloadFailed || 'Download failed'
        if (error.response?.data?.code === 'NO_MATCH') {
          this.$toast.warning(this.lastError)
        } else {
          this.$toast.error(this.lastError)
        }
      } finally {
        this.processing = false
      }
    },
    async loadDetails() {
      const book = this.book
      // Audible cards already carry blurb + sample; other sources get enriched
      if (!book || book.description) return
      this.loadingDetails = true
      const params = new URLSearchParams({ title: book.title, author: book.author || '' })
      if (book.olKey) params.set('olKey', book.olKey)
      const data = await this.$axios.$get(`/api/discovery/details?${params.toString()}`).catch(() => null)
      if (this.book === book) this.details = data?.details || null
      this.loadingDetails = false
    },
    async toggleWishlist() {
      try {
        const added = await this.$store.dispatch('wishlist/toggle', { ...this.display, id: this.book.id || this.book.asin })
        this.$toast.success(added ? this.$strings.ToastAddedToWantToRead : this.$strings.ToastRemovedFromWantToRead)
      } catch (error) {
        console.error('Wishlist update failed', error)
        this.$toast.error(this.$strings.ToastFailedToUpdate)
      }
    },
    toggleSample() {
      const audio = this.$refs.sample
      if (!audio) return
      if (audio.paused) audio.play().catch((error) => console.error('Sample playback failed', error))
      else audio.pause()
    },
    stopSample() {
      const audio = this.$refs.sample
      if (audio && !audio.paused) audio.pause()
      this.samplePlaying = false
    },
    chooseManually() {
      this.$emit('choose-release', this.book)
      this.show = false
    }
  }
}
</script>

<style scoped>
.details-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  height: 2.25rem;
  padding: 0 0.9rem 0 0.7rem;
  border-radius: 999px;
  font-size: 0.85rem;
  font-weight: 500;
  color: #e5e7eb;
  background-color: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.12);
  transition:
    background-color 0.2s ease,
    border-color 0.2s ease,
    color 0.2s ease;
}
.details-chip:hover {
  background-color: rgba(255, 255, 255, 0.12);
}
.details-chip.is-on {
  color: #19c8f5;
  border-color: rgba(25, 200, 245, 0.5);
}
</style>
