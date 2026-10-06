<template>
  <!-- App-wide store details sheet, opened from anywhere with $eventBus.$emit('open-store-book', book) -->
  <discovery-book-details-modal v-model="show" :book="book" :library-id="libraryId" :can-download="canDownload" :can-request="canRequest" :downloads-disabled="!downloadsEnabled" @status="onStatus" @choose-release="chooseRelease" />
</template>

<script>
export default {
  data() {
    return {
      show: false,
      book: null,
      config: null
    }
  },
  computed: {
    libraryId() {
      return this.$store.state.libraries.currentLibraryId
    },
    downloadsEnabled() {
      return !!this.config?.enabled
    },
    canDownload() {
      return !!(this.config?.enabled && this.config?.canDownload)
    },
    canRequest() {
      return !!(this.config?.enabled && this.config?.canRequest)
    }
  },
  methods: {
    async open(book) {
      if (!book) return
      this.book = book
      this.show = true
      if (!this.config) this.config = await this.$axios.$get('/api/discovery/downloads').catch(() => ({ enabled: false }))
    },
    onStatus({ book, status }) {
      this.$set(book, 'status', status)
    },
    chooseRelease(book) {
      this.$router.push({ path: `/library/${this.libraryId}/discovery`, query: { q: book.title, author: book.author || '' } })
    }
  },
  mounted() {
    this.$eventBus.$on('open-store-book', this.open)
  },
  beforeDestroy() {
    this.$eventBus.$off('open-store-book', this.open)
  }
}
</script>
