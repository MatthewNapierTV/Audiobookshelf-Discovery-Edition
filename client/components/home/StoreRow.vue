<template>
  <div class="home-store-row bookshelf-row pl-8e my-6e">
    <home-top10-row v-if="row.kind === 'top10'" :shelf="row.shelf" :cover="Math.round(cardWidth * 1.05)" @select="(b) => $emit('select', b)" @see-all="(s) => $emit('see-all', s)" />
    <div v-else class="pr-8e">
      <discovery-shelf :shelf="row.shelf" :card-width="cardWidth" class="mb-0!" @select="(b) => $emit('select', b)" @see-all="(s) => $emit('see-all', s)" />
    </div>
  </div>
</template>

<script>
export default {
  props: {
    row: {
      type: Object,
      required: true
    },
    cardWidth: {
      type: Number,
      default: 176
    }
  }
}
</script>
