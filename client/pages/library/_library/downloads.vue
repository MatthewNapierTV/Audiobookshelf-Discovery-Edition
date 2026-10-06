<template>
  <div class="page" :class="streamLibraryItem ? 'streaming' : ''">
    <app-book-shelf-toolbar is-home />

    <div id="bookshelf" class="w-full overflow-y-auto px-2 py-6 sm:px-4 md:p-12 relative">
      <div class="w-full max-w-4xl mx-auto">
        <div class="flex items-center mb-4">
          <span class="material-symbols text-3xl text-white/70 mr-2">download</span>
          <h1 class="text-xl">{{ $strings.HeaderDownloads }}</h1>
          <div class="grow" />
          <ui-btn v-if="hasFinished" small @click="clearAllFinished">{{ $strings.ButtonClearFinished }}</ui-btn>
        </div>

        <!-- Requests (admins see the approval queue; users see their own) -->
        <div v-if="requests.length" class="mb-6">
          <p class="text-sm text-gray-300 mb-2 font-semibold">{{ isAdmin ? $strings.HeaderRequestQueue : $strings.HeaderYourRequests }}</p>
          <div v-for="rq in requests" :key="rq.id" class="flex items-center py-2 border-b border-white/5">
            <div class="w-10 min-w-10 h-10 bg-primary/40 rounded mr-3 overflow-hidden">
              <img v-if="rq.cover" :src="rq.cover" class="h-full w-full object-contain" />
            </div>
            <div class="grow min-w-0 pr-3">
              <div class="flex items-center">
                <span :class="mediaTypeBadgeClass(rq.mediaType)" class="px-1.5 py-0.5 rounded text-xxs mr-2 whitespace-nowrap">{{ mediaTypeLabel(rq.mediaType) }}</span>
                <p class="text-sm text-gray-100 truncate">{{ rq.title }}</p>
              </div>
              <p class="text-xxs text-gray-500 truncate"><span v-if="isAdmin && rq.username" class="text-gray-400">{{ rq.username }} · </span><span v-if="isAdmin">{{ rq.release && rq.release.indexer }}</span><span v-else class="italic">{{ $strings.LabelAdminOnly }}</span></p>
            </div>
            <div v-if="rq.status === 'pending' && isAdmin" class="flex items-center gap-2">
              <ui-btn small color="bg-success" :disabled="rq._busy" @click="resolveRequest(rq, 'approve')">{{ $strings.ButtonApprove }}</ui-btn>
              <ui-btn small color="bg-error" :disabled="rq._busy" @click="resolveRequest(rq, 'deny')">{{ $strings.ButtonDeny }}</ui-btn>
            </div>
            <div v-else class="text-xs w-24 text-right" :class="requestStatusColor(rq)">{{ requestStatusLabel(rq) }}</div>
          </div>
        </div>

        <div v-if="loading" class="w-full flex justify-center py-8">
          <ui-loading-indicator />
        </div>

        <p v-else-if="!downloads.length" class="text-center text-gray-400 py-12">{{ $strings.MessageNoDownloads }}</p>

        <div v-else>
          <div v-for="dl in downloads" :key="dl.id" class="flex items-center py-3 border-b border-white/5">
            <div class="w-12 min-w-12 h-12 bg-primary/40 rounded mr-3 overflow-hidden">
              <img v-if="dl.cover" :src="dl.cover" class="h-full w-full object-contain" />
            </div>
            <div class="grow pr-4 min-w-0">
              <div class="flex items-center">
                <span :class="mediaTypeBadgeClass(dl.mediaType)" class="px-1.5 py-0.5 rounded text-xxs mr-2 whitespace-nowrap">{{ mediaTypeLabel(dl.mediaType) }}</span>
                <p class="text-sm text-gray-100 truncate">{{ dl.title }}</p>
              </div>
              <p class="text-xxs text-gray-500 truncate"><span v-if="isAdmin">{{ dl.release && dl.release.indexer }}</span><span v-else class="italic">{{ $strings.LabelAdminOnly }}</span> · {{ $bytesPretty(dl.size) }}</p>
              <div class="w-full bg-primary/30 rounded h-2 mt-1 overflow-hidden">
                <div class="h-full transition-all" :class="downloadBarClass(dl)" :style="{ width: Math.round((dl.progress || 0) * 100) + '%' }" />
              </div>
              <p v-if="dl.error" class="text-xs text-error mt-0.5">{{ dl.error }}</p>
            </div>
            <div class="w-24 text-right text-xs" :class="statusColor(dl)">{{ downloadStatusLabel(dl) }}</div>
            <button v-if="isTerminal(dl)" type="button" class="ml-2 text-gray-400 hover:text-white" :title="$strings.ButtonClear" @click="clearDownload(dl)">
              <span class="material-symbols text-lg">close</span>
            </button>
            <div v-else class="ml-2 w-6" />
          </div>
        </div>
      </div>
    </div>
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
    if (libraryData.library.mediaType !== 'book') {
      return redirect(`/library/${libraryId}`)
    }
    return { libraryId }
  },
  data() {
    return {
      loading: true,
      downloads: [],
      requests: [],
      isAdmin: false
    }
  },
  computed: {
    currentLibraryId() {
      return this.$store.state.libraries.currentLibraryId
    },
    streamLibraryItem() {
      return this.$store.state.streamLibraryItem
    },
    hasFinished() {
      return this.downloads.some((d) => this.isTerminal(d))
    }
  },
  methods: {
    isTerminal(dl) {
      return dl.status === 'completed' || dl.status === 'failed'
    },
    async fetchDownloads() {
      const data = await this.$axios.$get(`/api/discovery/downloads`).catch((error) => {
        console.error('Failed to fetch downloads', error)
        return null
      })
      this.downloads = data?.downloads || []
      this.isAdmin = !!data?.isAdmin
      this.loading = false
    },
    async fetchRequests() {
      const data = await this.$axios.$get(`/api/discovery/requests`).catch((error) => {
        console.error('Failed to fetch requests', error)
        return null
      })
      this.requests = data?.requests || []
    },
    async resolveRequest(rq, action) {
      this.$set(rq, '_busy', true)
      const data = await this.$axios.$post(`/api/discovery/requests/${rq.id}/${action}`).catch((error) => {
        console.error('Failed to resolve request', error)
        this.$toast.error(error.response?.data?.error || this.$strings.ToastFailedToUpdate)
        return null
      })
      if (data?.request) this.upsertRequest(data.request)
      this.$set(rq, '_busy', false)
    },
    upsertRequest(rq) {
      const index = this.requests.findIndex((r) => r.id === rq.id)
      if (index >= 0) this.$set(this.requests, index, rq)
      else this.requests.unshift(rq)
    },
    requestStatusLabel(rq) {
      const map = {
        pending: this.$strings.LabelPending,
        searching: this.$strings.LabelSearching,
        approved: this.$strings.LabelApproved,
        denied: this.$strings.LabelDenied,
        completed: this.$strings.LabelComplete,
        failed: this.$strings.LabelFailed
      }
      return map[rq.status] || rq.status
    },
    requestStatusColor(rq) {
      if (rq.status === 'denied' || rq.status === 'failed') return 'text-error'
      if (rq.status === 'approved' || rq.status === 'completed') return 'text-success'
      if (rq.status === 'searching') return 'text-info'
      return 'text-gray-300'
    },
    upsertDownload(dl) {
      const index = this.downloads.findIndex((d) => d.id === dl.id)
      if (index >= 0) this.$set(this.downloads, index, dl)
      else this.downloads.unshift(dl)
    },
    async clearDownload(dl) {
      await this.$axios.$delete(`/api/discovery/downloads/${dl.id}`).catch((error) => {
        console.error('Failed to clear download', error)
        this.$toast.error(this.$strings.ToastRemoveFailed)
        throw error
      })
      this.downloads = this.downloads.filter((d) => d.id !== dl.id)
    },
    async clearAllFinished() {
      await this.$axios.$delete(`/api/discovery/downloads`).catch((error) => {
        console.error('Failed to clear finished downloads', error)
        this.$toast.error(this.$strings.ToastRemoveFailed)
        return null
      })
      this.downloads = this.downloads.filter((d) => !this.isTerminal(d))
    },
    downloadStatusLabel(dl) {
      const map = {
        pending: this.$strings.LabelPending,
        searching: this.$strings.LabelSearching,
        downloading: Math.round((dl.progress || 0) * 100) + '%',
        stalled: this.$strings.LabelStalled,
        importing: this.$strings.LabelImporting,
        completed: this.$strings.LabelComplete,
        failed: this.$strings.LabelFailed
      }
      return map[dl.status] || dl.status
    },
    statusColor(dl) {
      if (dl.status === 'failed') return 'text-error'
      if (dl.status === 'completed') return 'text-success'
      if (dl.status === 'stalled') return 'text-warning'
      return 'text-gray-300'
    },
    downloadBarClass(dl) {
      if (dl.status === 'failed') return 'bg-error'
      if (dl.status === 'completed') return 'bg-success'
      if (dl.status === 'stalled') return 'bg-warning'
      return 'bg-yellow-400'
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
    onDownloadEvent(dl) {
      this.upsertDownload(dl)
    },
    onRequestEvent(rq) {
      this.upsertRequest(rq)
    }
  },
  mounted() {
    this.fetchDownloads()
    this.fetchRequests()
    if (this.$root.socket) {
      this.$root.socket.on('audiobook_download_started', this.onDownloadEvent)
      this.$root.socket.on('audiobook_download_progress', this.onDownloadEvent)
      this.$root.socket.on('audiobook_download_finished', this.onDownloadEvent)
      this.$root.socket.on('discovery_request_updated', this.onRequestEvent)
    }
  },
  beforeDestroy() {
    if (this.$root.socket) {
      this.$root.socket.off('audiobook_download_started', this.onDownloadEvent)
      this.$root.socket.off('audiobook_download_progress', this.onDownloadEvent)
      this.$root.socket.off('audiobook_download_finished', this.onDownloadEvent)
      this.$root.socket.off('discovery_request_updated', this.onRequestEvent)
    }
  }
}
</script>
