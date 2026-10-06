<template>
  <section v-if="books.length" class="showcase relative w-full overflow-hidden select-none" :class="{ 'is-compact': compact }" aria-roledescription="carousel" :aria-label="$strings.HeaderShowcase" @mouseenter="paused = true" @mouseleave="paused = false" @touchstart.passive="touchStart" @touchend="touchEnd" @touchcancel="touch = null">
    <!-- Art: blurred full-bleed fill + sharp artwork fading in from the right -->
    <transition-group name="showcase-fade" tag="div" class="absolute inset-0">
      <div v-for="(book, i) in books" v-show="i === index" :key="keyFor(book)" class="absolute inset-0">
        <div class="showcase-fill" :style="{ backgroundImage: `url(&quot;${artFor(book)}&quot;)` }" />
        <img :src="artFor(book)" alt="" class="showcase-art" :class="{ 'is-active': i === index }" />
      </div>
    </transition-group>
    <div class="showcase-shade absolute inset-0" />

    <!-- Copy -->
    <div class="showcase-body relative h-full flex items-end pl-8e pr-8e">
      <transition name="showcase-copy" mode="out-in">
        <div :key="keyFor(current)" class="w-full max-w-[44rem]">
          <p class="showcase-tag" :class="`is-${current.showcase || 'new'}`">
            <span class="material-symbols fill text-[1.05em]">{{ tagIcon }}</span
            >{{ tagText }}
          </p>
          <h1 class="showcase-title">{{ current.title }}</h1>
          <p v-if="current.author" class="mt-1.5 text-[1.05rem] md:text-lg text-gray-200">
            {{ $getString('LabelByAuthor', [current.author]) }}<span v-if="current.narrator" class="text-gray-400"> · {{ $strings.LabelNarrators }}: {{ current.narrator }}</span>
          </p>

          <div class="showcase-rule" />
          <div class="showcase-meta">
            <span v-for="(m, i) in meta" :key="i" class="showcase-meta-item" :class="{ 'is-wide': m.wide }">
              <span v-if="m.icon" class="material-symbols fill text-[1.1em] text-yellow-400 -mt-px">{{ m.icon }}</span
              >{{ m.text }}
            </span>
          </div>
          <p v-if="current.description" class="showcase-desc">{{ current.description }}</p>

          <div class="mt-5 flex items-center gap-3">
            <!-- Primary: request it (or get it directly if you're allowed to download) -->
            <button v-if="primaryAction === 'pending'" type="button" class="showcase-primary is-done" disabled>
              <span class="material-symbols fill text-2xl">{{ current.status === 'downloading' ? 'downloading' : 'schedule' }}</span
              >{{ current.status === 'downloading' ? $strings.LabelDiscoveryDownloading : $strings.LabelDiscoveryRequested }}
            </button>
            <button v-else-if="primaryAction === 'request'" type="button" class="showcase-primary" :disabled="busy" @click="$emit('request', current)">
              <span class="material-symbols fill text-2xl" :class="{ 'animate-spin': busy }">{{ busy ? 'progress_activity' : canDownload ? 'download' : 'add_circle' }}</span
              >{{ canDownload ? $strings.ButtonGet : $strings.ButtonRequest }}
            </button>
            <button v-else type="button" class="showcase-primary" @click="$emit('open-book', current)"><span class="material-symbols fill text-2xl">menu_book</span>{{ $strings.ButtonDiscoveryViewDetails }}</button>

            <button v-if="current.sampleUrl" type="button" class="showcase-round" :class="{ 'is-on': samplePlaying }" :aria-label="samplePlaying ? $strings.ButtonPause : $strings.ButtonListenToSample" :title="$strings.ButtonListenToSample" @click="toggleSample">
              <span class="material-symbols fill text-[1.6rem]">{{ samplePlaying ? 'pause' : 'headphones' }}</span>
            </button>
            <button type="button" class="showcase-round" :aria-label="$strings.ButtonDiscoveryViewDetails" @click="$emit('open-book', current)">
              <span class="material-symbols text-[1.6rem]">info</span>
            </button>
            <button type="button" class="showcase-round" :class="{ 'is-on': inWishlist }" :aria-pressed="inWishlist" :aria-label="$strings.ButtonWantToRead" @click="$emit('toggle-wishlist', current)">
              <span class="material-symbols text-[1.6rem]" :class="{ fill: inWishlist }">favorite</span>
            </button>
          </div>
        </div>
      </transition>
    </div>

    <!-- Progress dots (the active one fills while the slide is on screen) -->
    <div v-if="books.length > 1" class="showcase-dots absolute left-0 pl-8e flex items-center gap-1.5 z-10">
      <button v-for="(book, i) in books" :key="keyFor(book) + '-dot'" type="button" class="showcase-dot" :class="{ 'is-active': i === index, 'is-paused': paused }" :aria-label="`${i + 1} / ${books.length}: ${book.title}`" @click="go(i)">
        <span v-if="i === index" :key="cycle" class="showcase-dot-fill" :style="{ animationDuration: interval + 'ms' }" @animationend="next" />
      </button>
    </div>
    <div v-if="books.length > 1" class="showcase-pager absolute right-0 pr-8e flex items-center gap-2 z-10">
      <span class="text-xs tabular-nums text-gray-300 mr-1">{{ index + 1 }} / {{ books.length }}</span>
      <button type="button" class="showcase-arrow" :aria-label="$strings.ButtonPrevious" @click="go(index - 1)"><span class="material-symbols text-2xl">chevron_left</span></button>
      <button type="button" class="showcase-arrow" :aria-label="$strings.ButtonNext" @click="go(index + 1)"><span class="material-symbols text-2xl">chevron_right</span></button>
    </div>

    <audio v-if="current.sampleUrl" ref="sample" :src="current.sampleUrl" preload="none" @play="samplePlaying = true" @pause="sampleStopped" @ended="sampleStopped" />
  </section>
</template>

<script>
export default {
  props: {
    books: {
      type: Array,
      default: () => []
    },
    interval: {
      type: Number,
      default: 9000
    },
    // Shorter banner for embedding inside a page (e.g. the Discovery page)
    compact: Boolean,
    canDownload: Boolean,
    canRequest: Boolean,
    // key (asin/id) of a book whose request is in flight
    busyKey: String
  },
  data() {
    return {
      index: 0,
      cycle: 0,
      paused: false,
      samplePlaying: false,
      touch: null
    }
  },
  computed: {
    current() {
      return this.books[this.index] || this.books[0] || {}
    },
    inWishlist() {
      return this.$store.getters['wishlist/has'](this.current)
    },
    busy() {
      return !!this.busyKey && this.busyKey === this.keyFor(this.current)
    },
    primaryAction() {
      if (this.current.status === 'requested' || this.current.status === 'downloading') return 'pending'
      if (this.canDownload || this.canRequest) return 'request'
      return 'details'
    },
    tagIcon() {
      return { new: 'new_releases', top: 'workspace_premium', popular: 'trending_up' }[this.current.showcase] || 'auto_awesome'
    },
    tagText() {
      const s = this.current.showcase
      if (s === 'top') return this.$strings.LabelTopRated
      if (s === 'popular') return this.$strings.LabelBestSeller
      return this.$strings.LabelNewRelease
    },
    meta() {
      const b = this.current
      const out = []
      if (b.publishedYear) out.push({ text: b.publishedYear })
      if (b.rating) out.push({ icon: 'star', text: b.rating.toFixed(1) })
      if (b.duration) out.push({ text: this.$elapsedPrettyExtended(b.duration * 60, false, false) })
      if (b.genres?.length) out.push({ text: b.genres.slice(0, 2).join(' · '), wide: true })
      if (b.format === 'ebook') out.push({ text: this.$strings.LabelEbook })
      return out
    }
  },
  watch: {
    books() {
      if (this.index >= this.books.length) this.index = 0
    }
  },
  methods: {
    keyFor(book) {
      return book.asin || book.id || book.title
    },
    artFor(book) {
      return book.coverLarge || book.cover
    },
    stopSample() {
      const audio = this.$refs.sample
      if (audio && !audio.paused) audio.pause()
      this.samplePlaying = false
    },
    toggleSample() {
      const audio = this.$refs.sample
      if (!audio) return
      if (audio.paused) {
        audio.play().catch((error) => console.error('Sample playback failed', error))
      } else {
        audio.pause()
      }
    },
    go(i) {
      const n = this.books.length
      if (!n) return
      this.stopSample()
      this.index = (i + n) % n
      this.cycle++
    },
    /** Swipe left/right on phones and tablets to move between slides */
    touchStart(e) {
      const t = e.touches?.[0]
      this.touch = t && e.touches.length === 1 ? { x: t.clientX, y: t.clientY, at: Date.now() } : null
    },
    touchEnd(e) {
      const start = this.touch
      this.touch = null
      const t = e.changedTouches?.[0]
      if (!start || !t || this.books.length < 2) return
      const dx = t.clientX - start.x
      const dy = t.clientY - start.y
      if (Math.abs(dx) < 45 || Math.abs(dx) < Math.abs(dy) * 1.4 || Date.now() - start.at > 800) return
      this.go(this.index + (dx < 0 ? 1 : -1))
    },
    sampleStopped() {
      this.samplePlaying = false
      this.cycle++ // restart this slide's timer after a sample
    },
    next() {
      if (this.paused || this.samplePlaying || document.visibilityState !== 'visible') {
        // Not a good moment to advance (hovered, sample playing, tab hidden): run the timer again
        this.cycle++
        return
      }
      this.go(this.index + 1)
    }
  },
  beforeDestroy() {
    this.stopSample()
  }
}
</script>

<style scoped>
.showcase {
  touch-action: pan-y;
  height: clamp(30rem, 74vh, 46rem);
  font-size: 1rem;
}
.showcase-body {
  padding-bottom: clamp(8rem, 17vh, 10.5rem);
}
.showcase-dots {
  bottom: clamp(6rem, 12.5vh, 8rem);
}
.showcase-pager {
  bottom: clamp(5.6rem, 12vh, 7.6rem);
}
.showcase.is-compact .showcase-body {
  padding-bottom: clamp(4.5rem, 10vh, 6rem);
}
.showcase.is-compact .showcase-dots {
  bottom: clamp(2.25rem, 5vh, 3rem);
}
.showcase.is-compact .showcase-pager {
  bottom: clamp(1.9rem, 4.5vh, 2.6rem);
}
.showcase.is-compact {
  height: clamp(24rem, 58vh, 34rem);
  border-radius: 1rem;
}
.showcase.is-compact .showcase-title {
  font-size: clamp(1.8rem, 3.4vw, 3rem);
}
.showcase-fill {
  position: absolute;
  inset: -80px;
  background-size: cover;
  background-position: center;
  filter: blur(70px) saturate(160%) brightness(0.75);
  transform: scale(1.15);
}
/* Square book art can't fill a wide banner, so it's anchored right at full height and faded into the fill */
.showcase-art {
  position: absolute;
  top: 0;
  right: 0;
  height: 100%;
  width: min(72%, 100vh);
  object-fit: cover;
  object-position: center 30%;
  -webkit-mask-image: linear-gradient(to left, #000 55%, transparent 100%), linear-gradient(to top, transparent 0%, #000 35%);
  -webkit-mask-composite: source-in;
  mask-image: linear-gradient(to left, #000 55%, transparent 100%), linear-gradient(to top, transparent 0%, #000 35%);
  mask-composite: intersect;
  transform: scale(1.06);
}
.showcase-art.is-active {
  animation: showcase-kenburns 14s ease-out forwards;
}
@keyframes showcase-kenburns {
  from {
    transform: scale(1.06);
  }
  to {
    transform: scale(1);
  }
}
.showcase-shade {
  background: linear-gradient(90deg, rgba(13, 15, 19, 0.92) 0%, rgba(13, 15, 19, 0.7) 32%, rgba(13, 15, 19, 0.15) 62%, rgba(13, 15, 19, 0) 100%), linear-gradient(180deg, rgba(13, 15, 19, 0.35) 0%, rgba(13, 15, 19, 0) 25%, rgba(13, 15, 19, 0) 55%, #111317 100%);
}
.showcase-tag {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  margin-bottom: 0.75rem;
  color: #7fe3ff;
  text-shadow: 0 1px 10px rgba(0, 0, 0, 0.6);
}
.showcase-tag.is-top {
  color: #fde68a;
}
.showcase-tag.is-popular {
  color: #fca5a5;
}
.showcase-title {
  font-size: clamp(2.1rem, 4.6vw, 4rem);
  font-weight: 800;
  letter-spacing: -0.025em;
  line-height: 1.02;
  text-shadow: 0 4px 30px rgba(0, 0, 0, 0.55);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.showcase-rule {
  width: min(32rem, 100%);
  height: 1px;
  margin: 1.1rem 0 0.8rem;
  background: linear-gradient(90deg, rgba(255, 255, 255, 0.45), rgba(255, 255, 255, 0));
}
.showcase-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  font-size: 0.78rem;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #e5e7eb;
}
.showcase-meta-item {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
}
@media (max-width: 639px) {
  .showcase-meta-item.is-wide {
    display: none;
  }
}
.showcase-meta-item + .showcase-meta-item::before {
  content: '';
  width: 1px;
  height: 0.95rem;
  margin: 0 0.8rem;
  background: rgba(255, 255, 255, 0.35);
}
.showcase-desc {
  margin-top: 0.85rem;
  max-width: 40rem;
  font-size: 0.98rem;
  line-height: 1.55;
  color: #d1d5db;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-shadow: 0 1px 12px rgba(0, 0, 0, 0.5);
}
.showcase-primary {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  height: 3.1rem;
  padding: 0 1.6rem 0 1.15rem;
  border-radius: 999px;
  background: #fff;
  color: #0b0d11;
  font-weight: 700;
  font-size: 1.05rem;
  box-shadow: 0 10px 30px -10px rgba(0, 0, 0, 0.7);
  transition:
    transform 0.15s ease,
    background-color 0.2s ease;
}
.showcase-primary:disabled {
  cursor: default;
}
.showcase-primary.is-done {
  background: rgba(255, 255, 255, 0.85);
}
.showcase-primary:hover:not(:disabled) {
  transform: translateY(-1px);
  background: #e9f9ff;
}
.showcase-round {
  width: 3.1rem;
  height: 3.1rem;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  background: rgba(20, 22, 28, 0.45);
  border: 2px solid rgba(255, 255, 255, 0.55);
  backdrop-filter: blur(10px);
  transition:
    border-color 0.2s ease,
    background-color 0.2s ease,
    color 0.2s ease;
}
.showcase-round:hover {
  border-color: #fff;
  background: rgba(255, 255, 255, 0.12);
}
.showcase-round.is-on {
  color: #ff5a7a;
  border-color: #ff5a7a;
}
.showcase-dot {
  position: relative;
  height: 0.3rem;
  width: 0.55rem;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.35);
  overflow: hidden;
  transition:
    width 0.3s ease,
    background-color 0.2s ease;
}
.showcase-dot:hover {
  background: rgba(255, 255, 255, 0.6);
}
.showcase-dot.is-active {
  width: 2.25rem;
  background: rgba(255, 255, 255, 0.25);
}
.showcase-dot-fill {
  position: absolute;
  inset: 0;
  background: #fff;
  transform-origin: left;
  animation-name: showcase-progress;
  animation-timing-function: linear;
  animation-fill-mode: forwards;
}
.showcase-dot.is-paused .showcase-dot-fill {
  animation-play-state: paused;
}
@keyframes showcase-progress {
  from {
    transform: scaleX(0);
  }
  to {
    transform: scaleX(1);
  }
}
.showcase-arrow {
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 999px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  background: rgba(20, 22, 28, 0.45);
  border: 1px solid rgba(255, 255, 255, 0.25);
  backdrop-filter: blur(10px);
  transition:
    background-color 0.2s ease,
    border-color 0.2s ease;
}
.showcase-arrow:hover {
  background: rgba(255, 255, 255, 0.15);
  border-color: rgba(255, 255, 255, 0.6);
}
.showcase-pager {
  opacity: 0.85;
  transition: opacity 0.2s ease;
}
.showcase:hover .showcase-pager {
  opacity: 1;
}
@media (max-width: 767px) {
  .showcase-pager {
    display: none;
  }
}
/* Portrait screens (phones, tablets held upright): the cover fills the whole banner, text over a fade at the bottom */
@media (max-width: 767px), (max-aspect-ratio: 1/1) {
  .showcase-art {
    width: 100%;
    height: 84%;
    object-position: center top;
    /* fade into the blurred copy of the same cover, so the book fills the banner without cropping it away */
    -webkit-mask-image: linear-gradient(to bottom, #000 70%, transparent 100%);
    mask-image: linear-gradient(to bottom, #000 70%, transparent 100%);
  }
  .showcase-fill {
    filter: blur(50px) saturate(150%) brightness(0.8);
  }
  .showcase-shade {
    background: linear-gradient(180deg, rgba(13, 15, 19, 0.35) 0%, rgba(13, 15, 19, 0) 18%, rgba(13, 15, 19, 0.15) 38%, rgba(13, 15, 19, 0.82) 62%, #111317 100%);
  }
}
.showcase-fade-enter-active,
.showcase-fade-leave-active {
  transition: opacity 0.9s ease;
}
.showcase-fade-enter,
.showcase-fade-leave-to {
  opacity: 0;
}
.showcase-copy-enter-active,
.showcase-copy-leave-active {
  transition:
    opacity 0.45s ease,
    transform 0.45s cubic-bezier(0.2, 0.8, 0.2, 1);
}
.showcase-copy-enter {
  opacity: 0;
  transform: translateY(14px);
}
.showcase-copy-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}
@media (prefers-reduced-motion: reduce) {
  .showcase-art.is-active {
    animation: none;
  }
  .showcase-copy-enter-active,
  .showcase-copy-leave-active,
  .showcase-fade-enter-active,
  .showcase-fade-leave-active {
    transition: none;
  }
}
</style>
