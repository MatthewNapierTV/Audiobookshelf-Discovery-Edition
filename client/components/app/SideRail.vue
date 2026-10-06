<template>
  <div role="toolbar" aria-orientation="vertical" aria-label="Library Sidebar" class="w-20 bg-surface-1 border-r hairline h-full fixed left-0 z-50" style="min-width: 80px" :style="{ top: offsetTop + 'px' }">
    <!-- ugly little workaround to cover up the shadow overlapping the bookshelf toolbar -->

    <div id="siderail-buttons-container" role="navigation" aria-label="Library Navigation" :class="{ 'player-open': streamLibraryItem }" class="w-full overflow-y-auto overflow-x-hidden no-scroll py-2">
      <nuxt-link :to="`/library/${currentLibraryId}`" class="siderail-link w-full h-[4.25rem] flex flex-col items-center justify-center cursor-pointer relative transition-colors" :class="{ 'is-active': homePage }">
        <span class="material-symbols text-2xl">home</span>

        <p class="siderail-label">{{ $strings.ButtonHome }}</p>
      </nuxt-link>

      <nuxt-link v-if="isPodcastLibrary" :to="`/library/${currentLibraryId}/podcast/latest`" class="siderail-link w-full h-[4.25rem] flex flex-col items-center justify-center cursor-pointer relative transition-colors" :class="{ 'is-active': isPodcastLatestPage }">
        <span class="material-symbols text-2xl">&#xe241;</span>

        <p class="siderail-label">{{ $strings.ButtonLatest }}</p>
      </nuxt-link>

      <nuxt-link :to="`/library/${currentLibraryId}/bookshelf`" class="siderail-link w-full h-[4.25rem] flex flex-col items-center justify-center cursor-pointer relative transition-colors" :class="{ 'is-active': showLibrary }">
        <span class="material-symbols text-2xl">import_contacts</span>

        <p class="siderail-label">{{ $strings.ButtonLibrary }}</p>
      </nuxt-link>

      <nuxt-link v-if="isBookLibrary" :to="`/library/${currentLibraryId}/bookshelf/series`" class="siderail-link w-full h-[4.25rem] flex flex-col items-center justify-center cursor-pointer relative transition-colors" :class="{ 'is-active': isSeriesPage }">
        <span class="material-symbols text-2xl">view_column</span>

        <p class="siderail-label">{{ $strings.ButtonSeries }}</p>
      </nuxt-link>

      <nuxt-link v-if="isBookLibrary" :to="`/library/${currentLibraryId}/bookshelf/collections`" class="siderail-link w-full h-[4.25rem] flex flex-col items-center justify-center cursor-pointer relative transition-colors" :class="{ 'is-active': paramId === 'collections' }">
        <span class="material-symbols text-2xl">&#xe431;</span>

        <p class="siderail-label">{{ $strings.ButtonCollections }}</p>
      </nuxt-link>

      <nuxt-link v-if="showPlaylists" :to="`/library/${currentLibraryId}/bookshelf/playlists`" class="siderail-link w-full h-[4.25rem] flex flex-col items-center justify-center cursor-pointer relative transition-colors" :class="{ 'is-active': isPlaylistsPage }">
        <span class="material-symbols text-2.5xl">&#xe03d;</span>

        <p class="siderail-label">{{ $strings.ButtonPlaylists }}</p>
      </nuxt-link>

      <nuxt-link v-if="isBookLibrary" :to="`/library/${currentLibraryId}/bookshelf/authors`" class="siderail-link w-full h-[4.25rem] flex flex-col items-center justify-center cursor-pointer relative transition-colors" :class="{ 'is-active': isAuthorsPage }">
        <span class="material-symbols text-2xl">groups</span>

        <p class="siderail-label">{{ $strings.ButtonAuthors }}</p>
      </nuxt-link>

      <nuxt-link v-if="isBookLibrary" :to="`/library/${currentLibraryId}/narrators`" class="siderail-link w-full h-[4.25rem] flex flex-col items-center justify-center cursor-pointer relative transition-colors" :class="{ 'is-active': isNarratorsPage }">
        <span class="material-symbols text-2xl">&#xe91f;</span>

        <p class="siderail-label">{{ $strings.LabelNarrators }}</p>
      </nuxt-link>

      <nuxt-link v-if="isBookLibrary" :to="`/library/${currentLibraryId}/discovery`" class="siderail-link w-full h-[4.25rem] flex flex-col items-center justify-center cursor-pointer relative transition-colors" :class="{ 'is-active': isDiscoveryPage }">
        <span class="material-symbols text-2xl">travel_explore</span>

        <p class="siderail-label">{{ $strings.ButtonDiscovery }}</p>
      </nuxt-link>

      <nuxt-link v-if="isBookLibrary" :to="`/library/${currentLibraryId}/downloads`" class="siderail-link w-full h-[4.25rem] flex flex-col items-center justify-center cursor-pointer relative transition-colors" :class="{ 'is-active': isDownloadsPage }">
        <span class="material-symbols text-2xl">download</span>

        <p class="siderail-label">{{ $strings.HeaderDownloads }}</p>
      </nuxt-link>

      <nuxt-link v-if="isBookLibrary && userIsAdminOrUp" :to="`/library/${currentLibraryId}/stats`" class="siderail-link w-full h-[4.25rem] flex flex-col items-center justify-center cursor-pointer relative transition-colors" :class="{ 'is-active': isStatsPage }">
        <span class="material-symbols text-2xl">&#xf190;</span>

        <p class="siderail-label">{{ $strings.ButtonStats }}</p>
      </nuxt-link>

      <nuxt-link v-if="isPodcastLibrary && userIsAdminOrUp" :to="`/library/${currentLibraryId}/podcast/search`" class="siderail-link w-full h-[4.25rem] flex flex-col items-center justify-center cursor-pointer relative transition-colors" :class="{ 'is-active': isPodcastSearchPage }">
        <span class="abs-icons icon-podcast text-xl"></span>

        <p class="siderail-label">{{ $strings.ButtonAdd }}</p>
      </nuxt-link>

      <nuxt-link v-if="isPodcastLibrary && userIsAdminOrUp" :to="`/library/${currentLibraryId}/podcast/download-queue`" class="siderail-link w-full h-[4.25rem] flex flex-col items-center justify-center cursor-pointer relative transition-colors" :class="{ 'is-active': isPodcastDownloadQueuePage }">
        <span class="material-symbols text-2xl">&#xf090;</span>

        <p class="siderail-label">{{ $strings.ButtonDownloadQueue }}</p>
      </nuxt-link>

      <nuxt-link v-if="numIssues" :to="`/library/${currentLibraryId}/bookshelf?filter=issues`" class="siderail-link is-issues w-full h-[4.25rem] flex flex-col items-center justify-center cursor-pointer relative transition-colors" :class="{ 'is-active': showingIssues }">
        <span class="material-symbols text-2xl">warning</span>

        <p class="siderail-label">{{ $strings.ButtonIssues }}</p>
        <div class="absolute top-1 right-1 w-4 h-4 rounded-full bg-white/30 flex items-center justify-center">
          <p class="text-xs font-mono pb-0.5">{{ numIssues }}</p>
        </div>
      </nuxt-link>
    </div>

    <div class="w-full h-12 px-1 py-2 border-t hairline bg-surface-1 absolute left-0" :style="{ bottom: streamLibraryItem ? '224px' : '65px' }">
      <p class="font-mono text-xxs text-center text-gray-500 hover:text-gray-200 leading-3 mb-1 cursor-pointer" @click="clickChangelog">v{{ $config.version }}</p>
      <a v-if="hasUpdate" :href="githubTagUrl" target="_blank" class="text-warning text-xxs text-center block leading-3">Update</a>
      <p v-else class="text-xxs text-gray-400 leading-3 text-center italic">{{ Source }}</p>
    </div>

    <modals-changelog-view-modal v-model="showChangelogModal" :versionData="versionData" />
  </div>
</template>

<script>
export default {
  data() {
    return {
      showChangelogModal: false
    }
  },
  computed: {
    Source() {
      return this.$store.state.Source
    },
    isMobileLandscape() {
      return this.$store.state.globals.isMobileLandscape
    },
    isShowingBookshelfToolbar() {
      if (!this.$route.name) return false
      return this.$route.name.startsWith('library')
    },
    offsetTop() {
      return 64
    },
    userIsAdminOrUp() {
      return this.$store.getters['user/getIsAdminOrUp']
    },
    paramId() {
      return this.$route.params ? this.$route.params.id || '' : ''
    },
    currentLibraryId() {
      return this.$store.state.libraries.currentLibraryId
    },
    currentLibraryMediaType() {
      return this.$store.getters['libraries/getCurrentLibraryMediaType']
    },
    isBookLibrary() {
      return this.currentLibraryMediaType === 'book'
    },
    isPodcastLibrary() {
      return this.currentLibraryMediaType === 'podcast'
    },
    isPodcastDownloadQueuePage() {
      return this.$route.name === 'library-library-podcast-download-queue'
    },
    isPodcastSearchPage() {
      return this.$route.name === 'library-library-podcast-search'
    },
    isPodcastLatestPage() {
      return this.$route.name === 'library-library-podcast-latest'
    },
    homePage() {
      return this.$route.name === 'library-library'
    },
    isSeriesPage() {
      return this.$route.name === 'library-library-series-id' || this.paramId === 'series'
    },
    isAuthorsPage() {
      return this.libraryBookshelfPage && this.paramId === 'authors'
    },
    isNarratorsPage() {
      return this.$route.name === 'library-library-narrators'
    },
    isPlaylistsPage() {
      return this.paramId === 'playlists'
    },
    isStatsPage() {
      return this.$route.name === 'library-library-stats'
    },
    isDiscoveryPage() {
      return this.$route.name === 'library-library-discovery'
    },
    isDownloadsPage() {
      return this.$route.name === 'library-library-downloads'
    },
    libraryBookshelfPage() {
      return this.$route.name === 'library-library-bookshelf-id'
    },
    showLibrary() {
      return this.libraryBookshelfPage && this.paramId === '' && !this.showingIssues
    },
    filterBy() {
      return this.$store.getters['user/getUserSetting']('filterBy')
    },
    showingIssues() {
      if (!this.$route.query) return false
      return this.libraryBookshelfPage && this.$route.query.filter === 'issues'
    },
    numIssues() {
      return this.$store.state.libraries.issues || 0
    },
    versionData() {
      return this.$store.state.versionData || {}
    },
    hasUpdate() {
      return !!this.versionData.hasUpdate
    },
    githubTagUrl() {
      return this.versionData.githubTagUrl
    },
    streamLibraryItem() {
      return this.$store.state.streamLibraryItem
    },
    showPlaylists() {
      return this.$store.state.libraries.numUserPlaylists > 0
    }
  },
  methods: {
    clickChangelog() {
      this.showChangelogModal = true
    }
  },
  mounted() {}
}
</script>

<style>
#siderail-buttons-container {
  max-height: calc(100vh - 64px - 48px);
}
#siderail-buttons-container.player-open {
  max-height: calc(100vh - 64px - 48px - 160px);
}

.siderail-link {
  color: #8d93a1;
}
.siderail-link:hover {
  color: #fff;
}
.siderail-link > .material-symbols,
.siderail-link > .abs-icons {
  width: 3.25rem;
  height: 2rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  transition:
    background-color 0.2s ease,
    color 0.2s ease;
}
.siderail-link:hover > .material-symbols,
.siderail-link:hover > .abs-icons {
  background-color: rgba(255, 255, 255, 0.07);
}
.siderail-link.is-active {
  color: #fff;
}
.siderail-link.is-active > .material-symbols,
.siderail-link.is-active > .abs-icons {
  color: #19c8f5;
  font-variation-settings: 'FILL' 1;
}
.siderail-link.is-active:hover > .material-symbols,
.siderail-link.is-active:hover > .abs-icons {
  background-color: transparent;
}
.siderail-link.is-issues {
  color: #f0919a;
}
.siderail-label {
  padding-top: 0.3rem;
  font-size: 0.7rem;
  font-weight: 500;
  letter-spacing: 0.01em;
  line-height: 1rem;
  text-align: center;
}
</style>
