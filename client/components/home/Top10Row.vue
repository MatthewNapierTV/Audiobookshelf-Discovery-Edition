<template>
  <section v-if="shelf && shelf.books.length" class="top10">
    <div class="flex items-end mb-2 pr-8e">
      <div class="min-w-0">
        <h2 class="section-title text-white flex items-center gap-2" :style="{ fontSize: 1.35 + 'em' }">
          <span class="top10-badge">TOP<br />10</span>{{ shelf.title }}
        </h2>
        <p v-if="shelf.subtitle" class="text-gray-400" :style="{ fontSize: 0.75 + 'em' }">{{ shelf.subtitle }}</p>
      </div>
      <button v-if="shelf.browse" type="button" class="ml-auto shrink-0 text-gray-300 hover:text-white flex items-center" :style="{ fontSize: 0.85 + 'em' }" @click="$emit('see-all', shelf)">{{ $strings.ButtonDiscoverySeeAll }}<span class="material-symbols text-base">chevron_right</span></button>
    </div>
    <div v-drag-scroll class="flex overflow-x-auto no-scroll pb-2 pt-2 pr-8e scroll-smooth snap-x">
      <button v-for="(book, i) in shelf.books" :key="book.asin || book.id" type="button" class="top10-item abs-card group shrink-0 flex items-end snap-start text-left" :style="{ height: cover + 'px' }" @click="$emit('select', book)">
        <span class="top10-rank" :class="{ 'top10-rank-wide': i === 9 }" :style="{ fontSize: cover * 0.95 + 'px' }" aria-hidden="true">{{ i + 1 }}</span>
        <div class="abs-card-cover relative overflow-hidden rounded-[0.6em] bg-surface-3 -ml-[0.18em]" :style="{ width: cover * 0.82 + 'px', height: cover + 'px' }">
          <img :src="book.cover" :alt="book.title" loading="lazy" class="w-full h-full object-cover" />
          <span v-if="book.status === 'owned'" class="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded text-[0.6rem] font-semibold bg-success text-white">{{ $strings.LabelDiscoveryInLibrary }}</span>
        </div>
      </button>
    </div>
  </section>
</template>

<script>
export default {
  props: {
    shelf: Object,
    cover: {
      type: Number,
      default: 180
    }
  }
}
</script>

<style scoped>
.top10-badge {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  font-size: 0.42em;
  line-height: 0.95;
  font-weight: 900;
  letter-spacing: 0.02em;
  padding: 0.35em 0.4em;
  border-radius: 0.3em;
  background: linear-gradient(180deg, #7fe3ff, #19c8f5);
  color: #03202b;
}
.top10-item {
  margin-right: 0.6em;
}
.top10-rank {
  font-weight: 900;
  line-height: 0.8;
  letter-spacing: -0.08em;
  color: #111317;
  -webkit-text-stroke: 3px rgba(255, 255, 255, 0.55);
  paint-order: stroke fill;
  font-family: var(--font-sans);
  transition: -webkit-text-stroke-color 0.25s ease;
  user-select: none;
}
.top10-item:hover .top10-rank {
  -webkit-text-stroke-color: #19c8f5;
}
.top10-rank-wide {
  letter-spacing: -0.14em;
}
</style>
