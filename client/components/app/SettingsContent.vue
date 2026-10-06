<template>
  <div class="surface-card bg-surface-2/70 shadow-[0_20px_50px_-25px_rgba(0,0,0,0.7)] p-3 sm:p-6 mb-8">
    <div class="flex items-center mb-2">
      <slot name="header-prefix"></slot>
      <h1 class="text-xl font-semibold tracking-tight">{{ headerText }}</h1>

      <slot name="header-items"></slot>
    </div>

    <p v-if="description" id="settings-description" class="mb-6 text-sm text-gray-400" v-html="description" />

    <slot></slot>
  </div>
</template>

<script>
export default {
  props: {
    headerText: String,
    description: String,
    note: String
  },
  methods: {}
}
</script>

<style>
#settings-description a {
  color: rgb(96 165 250);
}
#settings-description a:hover {
  color: rgb(147 197 253);
  text-decoration-line: underline;
}
#settings-description code {
  font-size: 0.875rem;
  border-radius: 6px;
  background-color: rgb(82, 82, 82);
  color: white;
  padding: 2px 4px;
}
</style>
