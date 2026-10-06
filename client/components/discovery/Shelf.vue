<template>
  <section class="mb-8">
    <div class="flex items-end mb-2 px-1">
      <div class="min-w-0">
        <h2 class="text-lg md:text-xl font-semibold text-gray-100 truncate">{{ shelf.title }}</h2>
        <p v-if="shelf.subtitle" class="text-xs text-gray-400 truncate">{{ shelf.subtitle }}</p>
      </div>
      <button v-if="shelf.browse" type="button" class="ml-auto shrink-0 text-sm text-gray-300 hover:text-white flex items-center" @click="$emit('see-all', shelf)">{{ $strings.ButtonDiscoverySeeAll }}<span class="material-symbols text-base">chevron_right</span></button>
    </div>

    <div class="relative group/shelf">
      <button
        v-show="canScrollLeft"
        type="button"
        class="hidden md:flex absolute left-0 top-0 z-10 items-center justify-center w-10 bg-linear-to-r from-bg to-transparent opacity-0 group-hover/shelf:opacity-100 transition-opacity"
        :style="{ height: Math.round(cardWidth * ($store.getters['libraries/getBookCoverAspectRatio'] || 1.6)) + 'px' }"
        :aria-label="$strings.ButtonPrevious"
        @click="scrollBy(-1)"
      >
        <span class="material-symbols text-4xl">chevron_left</span>
      </button>
      <div ref="scroller" v-drag-scroll class="flex gap-4 overflow-x-auto pb-2 px-1 scroll-smooth snap-x discovery-shelf-scroller" @scroll="updateArrows">
        <discovery-book-card v-for="(book, index) in shelf.books" :key="book.asin || book.id || index" :book="book" :width="cardWidth" :rank="shelf.ranked ? index + 1 : null" class="snap-start" @select="(b) => $emit('select', b)" />
      </div>
      <button
        v-show="canScrollRight"
        type="button"
        class="hidden md:flex absolute right-0 top-0 z-10 items-center justify-center w-10 bg-linear-to-l from-bg to-transparent opacity-0 group-hover/shelf:opacity-100 transition-opacity"
        :style="{ height: Math.round(cardWidth * ($store.getters['libraries/getBookCoverAspectRatio'] || 1.6)) + 'px' }"
        :aria-label="$strings.ButtonNext"
        @click="scrollBy(1)"
      >
        <span class="material-symbols text-4xl">chevron_right</span>
      </button>
    </div>
  </section>
</template>

<script>
export default {
  props: {
    shelf: {
      type: Object,
      required: true
    },
    cardWidth: {
      type: Number,
      default: 150
    }
  },
  data() {
    return {
      canScrollLeft: false,
      canScrollRight: false
    }
  },
  methods: {
    scrollBy(dir) {
      const el = this.$refs.scroller
      if (!el) return
      el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: 'smooth' })
    },
    updateArrows() {
      const el = this.$refs.scroller
      if (!el) return
      this.canScrollLeft = el.scrollLeft > 4
      this.canScrollRight = el.scrollLeft + el.clientWidth < el.scrollWidth - 4
    }
  },
  mounted() {
    this.$nextTick(this.updateArrows)
    window.addEventListener('resize', this.updateArrows)
  },
  beforeDestroy() {
    window.removeEventListener('resize', this.updateArrows)
  }
}
</script>

<style scoped>
.discovery-shelf-scroller {
  scrollbar-width: thin;
}
</style>
