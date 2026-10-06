<template>
  <section v-if="slides.length" class="home-hero relative w-full overflow-hidden select-none" :style="{ height: heroHeight }" @mouseenter="paused = true" @mouseleave="paused = false" aria-roledescription="carousel">
    <!-- Backdrops (cross-fade) -->
    <transition-group name="hero-fade" tag="div" class="absolute inset-0">
      <div v-for="(slide, i) in slides" v-show="i === index" :key="slide.key" class="absolute inset-0">
        <div class="absolute -inset-16 bg-cover bg-center hero-backdrop-img" :style="{ backgroundImage: `url(${slide.cover})` }" />
      </div>
    </transition-group>
    <div class="absolute inset-0 hero-overlay" />

    <!-- Content -->
    <div class="relative h-full max-w-7xl mx-auto px-6 md:px-12 flex items-center gap-8 md:gap-12">
      <transition name="hero-slide" mode="out-in">
        <div :key="current.key" class="flex-1 min-w-0 max-w-2xl">
          <p class="flex items-center gap-2 text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-brand mb-3">
            <span class="material-symbols text-base fill">{{ current.kind === 'resume' ? 'history' : 'auto_awesome' }}</span>
            {{ current.eyebrow }}
          </p>
          <h1 class="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight leading-[1.05] line-clamp-2 drop-shadow-[0_4px_24px_rgba(0,0,0,0.6)]">{{ current.title }}</h1>
          <p v-if="current.author" class="mt-2 text-base md:text-lg text-gray-200">{{ $getString('LabelByAuthor', [current.author]) }}</p>
          <div v-if="current.meta && current.meta.length" class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-300">
            <span v-for="m in current.meta" :key="m" class="flex items-center">{{ m }}</span>
          </div>
          <p v-if="current.description" class="hidden sm:block mt-4 text-sm md:text-[0.95rem] leading-relaxed text-gray-300 line-clamp-3 max-w-xl">{{ current.description }}</p>

          <div v-if="current.kind === 'resume' && current.progress" class="mt-4 max-w-sm">
            <div class="h-1.5 rounded-full bg-white/15 overflow-hidden"><div class="h-full rounded-full bg-linear-to-r from-brand to-brand-strong" :style="{ width: Math.round(current.progress * 100) + '%' }" /></div>
            <p class="text-xs text-gray-400 mt-1">{{ Math.round(current.progress * 100) }}% complete</p>
          </div>

          <div class="mt-6 flex flex-wrap items-center gap-3">
            <template v-if="current.kind === 'resume'">
              <button type="button" class="hero-btn btn-brand" @click="$emit('resume', current.libraryItem)">
                <span class="material-symbols fill text-2xl">{{ current.isEbook ? 'auto_stories' : 'play_arrow' }}</span
                >{{ current.isEbook ? $strings.ButtonRead : $strings.ButtonPlay }}
              </button>
              <nuxt-link :to="`/item/${current.libraryItem.id}`" class="hero-btn hero-btn-glass"> <span class="material-symbols text-xl">info</span>{{ $strings.ButtonDiscoveryViewDetails }} </nuxt-link>
            </template>
            <template v-else>
              <button type="button" class="hero-btn btn-brand" @click="$emit('open-book', current.book)"><span class="material-symbols fill text-xl">info</span>{{ $strings.ButtonDiscoveryViewDetails }}</button>
              <button type="button" class="hero-btn hero-btn-glass" :aria-pressed="inWishlist(current.book)" @click="$emit('toggle-wishlist', current.book)">
                <span class="material-symbols text-xl" :class="{ fill: inWishlist(current.book) }">{{ inWishlist(current.book) ? 'bookmark_added' : 'bookmark_add' }}</span
                >{{ inWishlist(current.book) ? $strings.LabelOnWantToRead : $strings.ButtonWantToRead }}
              </button>
            </template>
          </div>
        </div>
      </transition>

      <!-- Cover art -->
      <transition name="hero-cover" mode="out-in">
        <div :key="current.key + '-cover'" class="hidden md:block shrink-0 hero-cover-wrap">
          <img :src="current.cover" :alt="current.title" class="w-56 lg:w-72 aspect-square object-cover rounded-xl shadow-[0_40px_80px_-20px_rgba(0,0,0,0.9)] ring-1 ring-white/15" />
        </div>
      </transition>
    </div>

    <!-- Controls -->
    <div v-if="slides.length > 1" class="absolute bottom-5 left-0 right-0 flex items-center justify-center gap-2 z-10">
      <button v-for="(slide, i) in slides" :key="slide.key + '-dot'" type="button" :aria-label="`Slide ${i + 1}`" class="h-1.5 rounded-full transition-all duration-300" :class="i === index ? 'w-8 bg-brand' : 'w-3 bg-white/30 hover:bg-white/60'" @click="go(i)" />
    </div>
    <button v-if="slides.length > 1" type="button" class="hero-arrow left-3" aria-label="Previous" @click="go(index - 1)"><span class="material-symbols text-3xl">chevron_left</span></button>
    <button v-if="slides.length > 1" type="button" class="hero-arrow right-3" aria-label="Next" @click="go(index + 1)"><span class="material-symbols text-3xl">chevron_right</span></button>
  </section>
</template>

<script>
export default {
  props: {
    slides: {
      type: Array,
      default: () => []
    }
  },
  data() {
    return {
      index: 0,
      paused: false,
      timer: null
    }
  },
  computed: {
    current() {
      return this.slides[this.index] || this.slides[0] || {}
    },
    heroHeight() {
      return 'clamp(22rem, 52vh, 34rem)'
    }
  },
  watch: {
    slides() {
      if (this.index >= this.slides.length) this.index = 0
    }
  },
  methods: {
    inWishlist(book) {
      return this.$store.getters['wishlist/has'](book)
    },
    go(i) {
      const n = this.slides.length
      if (!n) return
      this.index = (i + n) % n
      this.restart()
    },
    restart() {
      clearInterval(this.timer)
      this.timer = setInterval(() => {
        if (this.paused || document.visibilityState !== 'visible') return
        if (this.slides.length > 1) this.index = (this.index + 1) % this.slides.length
      }, 8000)
    }
  },
  mounted() {
    this.restart()
  },
  beforeDestroy() {
    clearInterval(this.timer)
  }
}
</script>

<style scoped>
.hero-backdrop-img {
  filter: blur(48px) saturate(150%);
  opacity: 0.55;
  transform: scale(1.1);
}
.hero-overlay {
  background: linear-gradient(90deg, rgba(13, 15, 19, 0.95) 0%, rgba(13, 15, 19, 0.75) 40%, rgba(13, 15, 19, 0.2) 100%), linear-gradient(180deg, rgba(13, 15, 19, 0) 55%, #111317 100%);
}
.hero-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  height: 2.9rem;
  padding: 0 1.4rem 0 1.1rem;
  border-radius: 999px;
  font-weight: 600;
  font-size: 0.95rem;
  transition:
    transform 0.15s ease,
    background-color 0.2s ease;
}
.hero-btn:hover {
  transform: translateY(-1px);
}
.hero-btn-glass {
  background-color: rgba(255, 255, 255, 0.12);
  border: 1px solid rgba(255, 255, 255, 0.18);
  backdrop-filter: blur(12px);
  color: #fff;
}
.hero-btn-glass:hover {
  background-color: rgba(255, 255, 255, 0.2);
}
.hero-arrow {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 2.75rem;
  height: 2.75rem;
  border-radius: 999px;
  display: none;
  align-items: center;
  justify-content: center;
  color: #fff;
  background: rgba(0, 0, 0, 0.35);
  border: 1px solid rgba(255, 255, 255, 0.12);
  opacity: 0;
  transition: opacity 0.2s ease;
  z-index: 10;
}
@media (min-width: 768px) {
  .hero-arrow {
    display: flex;
  }
}
.home-hero:hover .hero-arrow {
  opacity: 1;
}
.hero-fade-enter-active,
.hero-fade-leave-active {
  transition: opacity 0.8s ease;
}
.hero-fade-enter,
.hero-fade-leave-to {
  opacity: 0;
}
.hero-slide-enter-active,
.hero-slide-leave-active,
.hero-cover-enter-active,
.hero-cover-leave-active {
  transition:
    opacity 0.4s ease,
    transform 0.4s cubic-bezier(0.2, 0.8, 0.2, 1);
}
.hero-slide-enter,
.hero-cover-enter {
  opacity: 0;
  transform: translateY(12px);
}
.hero-slide-leave-to,
.hero-cover-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
@media (prefers-reduced-motion: reduce) {
  .hero-slide-enter-active,
  .hero-slide-leave-active,
  .hero-cover-enter-active,
  .hero-cover-leave-active,
  .hero-fade-enter-active,
  .hero-fade-leave-active {
    transition: none;
  }
}
</style>
