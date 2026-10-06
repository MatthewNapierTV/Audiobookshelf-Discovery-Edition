<template>
  <transition name="fr-splash">
    <!-- Same markup as client/loading.html, so the hand-off from the pre-boot splash is seamless -->
    <div v-if="show" id="fr-splash" role="status" :aria-label="$strings.MessageLoading || 'Loading'">
      <div class="fr-splash-mark">
        <svg class="fr-splash-ring" viewBox="0 0 184 184" aria-hidden="true">
          <circle class="fr-splash-track" cx="92" cy="92" r="88" />
          <circle class="fr-splash-arc" cx="92" cy="92" r="88" />
        </svg>
        <img src="~static/icon.svg" class="fr-splash-logo" alt="" />
      </div>
      <div class="fr-splash-name">Faithnet<span>READS</span></div>
      <div class="fr-splash-msg">{{ message }}</div>
    </div>
  </transition>
</template>

<script>
export default {
  props: {
    show: Boolean,
    message: String
  }
}
</script>

<style src="~/assets/splash.css"></style>
<style>
.fr-splash-leave-active {
  transition:
    opacity 0.45s ease,
    transform 0.45s ease;
}
.fr-splash-leave-to {
  opacity: 0;
  transform: scale(1.03);
}
</style>
