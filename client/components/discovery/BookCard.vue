<template>
  <button type="button" class="discovery-book-card abs-card group text-left shrink-0 focus:outline-hidden pt-1" :style="{ width: width + 'px' }" @click="$emit('select', book)">
    <div class="abs-card-cover relative w-full rounded-[0.6em] overflow-hidden bg-surface-3" :style="{ height: coverHeight + 'px' }">
      <img v-if="book.cover" :src="book.cover" loading="lazy" class="w-full h-full object-cover" :alt="book.title" />
      <div v-else class="w-full h-full flex items-center justify-center p-2 text-center text-sm text-gray-300">{{ book.title }}</div>

      <div v-if="statusLabel" class="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded text-xxs font-semibold flex items-center shadow" :class="statusClass">
        <span class="material-symbols text-xs mr-0.5">{{ statusIcon }}</span
        >{{ statusLabel }}
      </div>
      <div v-if="rank" class="absolute bottom-0 left-0 px-2 py-0.5 bg-black/70 text-white text-sm font-bold rounded-tr">#{{ rank }}</div>
    </div>
    <p class="text-sm text-gray-100 mt-1.5 leading-tight line-clamp-2 group-hover:underline" :title="book.title">{{ book.title }}</p>
    <p v-if="book.reason" class="text-xxs text-yellow-400/90 truncate">{{ book.reason }}</p>
    <p class="text-xs text-gray-400 truncate">{{ book.author }}</p>
    <div v-if="book.rating" class="flex items-center text-xs text-gray-400">
      <span class="material-symbols fill text-xs text-yellow-400 mr-0.5">star</span>{{ book.rating.toFixed(1) }}<span v-if="book.numRatings" class="ml-1 text-gray-500">({{ numRatingsPretty }})</span>
    </div>
  </button>
</template>

<script>
export default {
  props: {
    book: {
      type: Object,
      required: true
    },
    width: {
      type: Number,
      default: 150
    },
    rank: Number
  },
  computed: {
    /** Book-shaped like the library's own cards (1.6 tall unless the library is set to square covers) */
    coverHeight() {
      return Math.round(this.width * (this.$store.getters['libraries/getBookCoverAspectRatio'] || 1.6))
    },
    statusLabel() {
      if (this.book.status === 'owned') return this.$strings.LabelDiscoveryInLibrary
      if (this.book.status === 'downloading') return this.$strings.LabelDiscoveryDownloading
      if (this.book.status === 'requested') return this.$strings.LabelDiscoveryRequested
      return null
    },
    statusIcon() {
      if (this.book.status === 'owned') return 'check_circle'
      if (this.book.status === 'downloading') return 'downloading'
      return 'schedule'
    },
    statusClass() {
      if (this.book.status === 'owned') return 'bg-success text-white'
      if (this.book.status === 'downloading') return 'bg-info text-white'
      return 'bg-warning text-black'
    },
    numRatingsPretty() {
      const n = this.book.numRatings || 0
      return n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n)
    }
  }
}
</script>
