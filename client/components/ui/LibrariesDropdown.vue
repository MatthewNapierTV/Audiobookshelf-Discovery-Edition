<template>
  <div v-if="currentLibrary" class="relative h-9 max-w-52 md:min-w-36" v-click-outside="clickOutsideObj">
    <button
      type="button"
      :disabled="disabled"
      class="w-10 sm:w-full relative h-full border border-white/10 hover:border-white/20 rounded-full px-3 text-left text-sm cursor-pointer bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white transition-colors"
      aria-haspopup="menu"
      :aria-expanded="showMenu"
      :aria-label="$strings.ButtonLibrary + ': ' + currentLibrary.name"
      @click.stop.prevent="clickShowMenu"
    >
      <div class="flex items-center justify-center sm:justify-start">
        <ui-library-icon :icon="currentLibraryIcon" class="sm:mr-1.5" />
        <span class="hidden sm:block truncate">{{ currentLibrary.name }}</span>
      </div>
    </button>

    <transition name="menu">
      <ul v-show="showMenu" class="absolute z-10 mt-2 w-full min-w-56 bg-surface-2/95 glass-strong border border-white/10 shadow-2xl rounded-xl p-1 overflow-auto focus:outline-hidden sm:text-sm librariesDropdownMenu" tabindex="-1" role="menu">
        <template v-for="library in librariesFiltered">
          <li :key="library.id" class="text-gray-300 hover:text-white relative py-2 cursor-pointer hover:bg-white/10 rounded-lg" role="menuitem" tabindex="0" @keydown.enter="selectLibrary(library)" @click="selectLibrary(library)">
            <div class="flex items-center px-2">
              <ui-library-icon :icon="library.icon" class="mr-1.5" />
              <span class="font-normal block truncate font-sans text-sm">{{ library.name }}</span>
            </div>
          </li>
        </template>
      </ul>
    </transition>
  </div>
</template>

<script>
export default {
  data() {
    return {
      clickOutsideObj: {
        handler: this.clickedOutside,
        events: ['mousedown'],
        isActive: true
      },
      showMenu: false,
      disabled: false
    }
  },
  computed: {
    currentLibraryId() {
      return this.$store.state.libraries.currentLibraryId
    },
    currentLibrary() {
      return this.libraries.find((lib) => lib.id === this.currentLibraryId)
    },
    currentLibraryIcon() {
      return this.currentLibrary ? this.currentLibrary.icon || 'database' : 'database'
    },
    libraries() {
      return this.$store.getters['libraries/getSortedLibraries']()
    },
    canUserAccessAllLibraries() {
      return this.$store.getters['user/getUserCanAccessAllLibraries']
    },
    userLibrariesAccessible() {
      return this.$store.getters['user/getLibrariesAccessible']
    },
    librariesFiltered() {
      if (this.canUserAccessAllLibraries) return this.libraries
      return this.libraries.filter((lib) => {
        return this.userLibrariesAccessible.includes(lib.id)
      })
    }
  },
  methods: {
    clickShowMenu() {
      if (this.disabled) return
      this.showMenu = !this.showMenu
    },
    clickedOutside() {
      this.showMenu = false
    },
    selectLibrary(library) {
      this.updateLibrary(library)
      this.showMenu = false
    },
    async updateLibrary(library) {
      var currLibraryId = this.currentLibraryId
      if (currLibraryId === library.id) {
        return
      }

      this.disabled = true
      await this.$store.dispatch('libraries/fetch', library.id)

      if (this.$route.name.startsWith('config')) {
        // No need to refresh
      } else if (this.$route.name === 'library-library-series-id' && library.mediaType === 'book') {
        // For series item page redirect to root series page
        this.$router.push(`/library/${library.id}/bookshelf/series`)
      } else if (this.$route.name === 'library-library-search') {
        this.$router.push(this.$route.fullPath.replace(currLibraryId, library.id))
      } else if (this.$route.name.startsWith('library')) {
        this.$router.push(this.$route.path.replace(currLibraryId, library.id))
      } else {
        this.$router.push(`/library/${library.id}`)
      }

      this.disabled = false
    }
  },
  mounted() {}
}
</script>

<style scoped>
.librariesDropdownMenu {
  max-height: calc(100vh - 75px);
}
</style>
