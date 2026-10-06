<template>
  <modals-modal v-model="show" name="discovery-book" :width="760" :height="'unset'" :processing="processing">
    <div v-if="book" class="w-full rounded-2xl bg-surface-2 shadow-[0_40px_80px_-20px_rgba(0,0,0,0.8)] border border-white/10 overflow-y-auto overflow-x-hidden" style="max-height: 85vh">
      <!-- Blurred cover backdrop, Audible product page style -->
      <div class="relative">
        <div v-if="book.cover" class="absolute inset-0 overflow-hidden">
          <img :src="book.cover" class="w-full h-full object-cover blur-2xl opacity-30 scale-125" alt="" />
        </div>
        <div class="relative flex flex-col sm:flex-row p-6 gap-6">
          <div class="w-40 h-40 sm:w-48 sm:h-48 shrink-0 mx-auto sm:mx-0 rounded-md overflow-hidden shadow-xl bg-primary/40">
            <img v-if="book.cover" :src="book.cover" class="w-full h-full object-cover" :alt="book.title" />
          </div>
          <div class="min-w-0 grow">
            <h2 class="text-2xl font-semibold leading-tight">{{ book.title }}</h2>
            <p v-if="book.subtitle" class="text-sm text-gray-300 mt-0.5">{{ book.subtitle }}</p>
            <p class="text-sm text-gray-200 mt-2">{{ $getString('LabelByAuthor', [book.author || $strings.LabelUnknown]) }}</p>
            <p v-if="book.narrator" class="text-xs text-gray-400">{{ $strings.LabelNarrators }}: {{ book.narrator }}</p>
            <p v-if="seriesText" class="text-xs text-gray-400">{{ $strings.LabelSeries }}: {{ seriesText }}</p>

            <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-300 mt-3">
              <span v-if="book.rating" class="flex items-center"
                ><span class="material-symbols fill text-sm text-yellow-400 mr-0.5">star</span>{{ book.rating.toFixed(1) }}<span v-if="book.numRatings" class="text-gray-500 ml-1">({{ book.numRatings.toLocaleString() }})</span></span
              >
              <span v-if="book.duration" class="flex items-center"><span class="material-symbols text-sm mr-0.5">schedule</span>{{ $elapsedPrettyExtended(book.duration * 60, false, false) }}</span>
              <span v-if="book.releaseDate" class="flex items-center"><span class="material-symbols text-sm mr-0.5">event</span>{{ book.releaseDate }}</span>
              <span v-if="book.language">{{ book.language }}</span>
            </div>
            <div v-if="book.genres && book.genres.length" class="flex flex-wrap gap-1 mt-2">
              <span v-for="genre in book.genres" :key="genre" class="px-2 py-0.5 rounded-full bg-white/10 text-xxs text-gray-300">{{ genre }}</span>
            </div>

            <!-- Actions -->
            <div class="mt-5">
              <div v-if="book.status === 'owned'" class="flex items-center text-success text-sm"><span class="material-symbols mr-1">check_circle</span>{{ $strings.MessageDiscoveryAlreadyInLibrary }}</div>
              <div v-else-if="book.status === 'downloading' || book.status === 'requested'" class="flex items-center text-info text-sm mb-3">
                <span class="material-symbols mr-1">{{ book.status === 'downloading' ? 'downloading' : 'schedule' }}</span
                >{{ book.status === 'downloading' ? $strings.LabelDiscoveryDownloading : $strings.LabelDiscoveryRequested }}
              </div>

              <div v-if="book.status !== 'owned' && (canDownload || canRequest)" class="flex flex-wrap items-center gap-2">
                <ui-btn color="brand" :disabled="processing" @click="grab('audiobook')"> <span class="material-symbols text-lg align-middle mr-1">headphones</span>{{ canDownload ? $strings.ButtonDiscoveryGetAudiobook : $strings.ButtonDiscoveryRequestAudiobook }} </ui-btn>
                <ui-btn :disabled="processing" @click="grab('ebook')"> <span class="material-symbols text-lg align-middle mr-1">menu_book</span>{{ canDownload ? $strings.ButtonDiscoveryGetEbook : $strings.ButtonDiscoveryRequestEbook }} </ui-btn>
                <button type="button" class="text-xs text-gray-400 hover:text-white underline ml-1" :disabled="processing" @click="chooseManually">{{ $strings.ButtonDiscoveryChooseRelease }}</button>
              </div>
              <p v-else-if="book.status !== 'owned'" class="text-xs text-gray-400">{{ $strings.MessageDiscoveryNoPermission }}</p>

              <p v-if="lastError" class="text-xs text-error mt-2">{{ lastError }}</p>
              <p v-if="processing" class="text-xs text-gray-400 mt-2">{{ $strings.MessageDiscoverySearchingIndexers }}</p>
            </div>
          </div>
        </div>
      </div>

      <div v-if="book.description" class="px-6 pb-6">
        <h3 class="text-sm font-semibold text-gray-200 mb-1">{{ $strings.LabelDescription }}</h3>
        <p class="text-sm text-gray-300 whitespace-pre-line leading-relaxed">{{ book.description }}</p>
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
    canRequest: Boolean
  },
  data() {
    return {
      processing: false,
      lastError: null
    }
  },
  watch: {
    book() {
      this.lastError = null
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
    seriesText() {
      return (this.book?.series || []).map((s) => (s.sequence ? `${s.series} #${s.sequence}` : s.series)).join(', ')
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
    chooseManually() {
      this.$emit('choose-release', this.book)
      this.show = false
    }
  }
}
</script>
