<template>
  <div>
    <app-settings-content :header-text="$strings.HeaderDiscoverySettings" :description="$strings.MessageDiscoveryDescription">
      <form @submit.prevent="submitForm">
        <div class="flex items-center py-2">
          <ui-toggle-switch v-model="newSettings.enabled" :disabled="savingSettings" />
          <p class="pl-4 text-base md:text-lg">{{ $strings.LabelDiscoveryEnable }}</p>
        </div>

        <div class="w-full h-px bg-white/10 my-4" />
        <h2 class="text-lg font-semibold mb-2">Prowlarr</h2>

        <div class="flex flex-wrap -mx-1">
          <div class="w-full md:w-2/3 px-1 mb-2">
            <ui-text-input-with-label v-model="newSettings.prowlarrHost" :disabled="savingSettings" :label="$strings.LabelProwlarrHost" placeholder="http://localhost:9696" />
          </div>
          <div class="w-full md:w-1/3 px-1 mb-2">
            <ui-text-input-with-label v-model="newSettings.prowlarrApiKey" :disabled="savingSettings" :label="$strings.LabelProwlarrApiKey" type="password" />
          </div>
        </div>

        <div class="w-full h-px bg-white/10 my-4" />
        <h2 class="text-lg font-semibold mb-2">qBittorrent</h2>

        <div class="flex flex-wrap -mx-1">
          <div class="w-full md:w-1/2 px-1 mb-2">
            <ui-text-input-with-label v-model="newSettings.qbittorrentHost" :disabled="savingSettings" :label="$strings.LabelQbittorrentHost" placeholder="http://localhost:8080" />
          </div>
          <div class="w-full md:w-1/2 px-1 mb-2">
            <ui-text-input-with-label v-model="newSettings.qbittorrentCategory" :disabled="savingSettings" :label="$strings.LabelQbittorrentCategory" />
          </div>
          <div class="w-full md:w-1/2 px-1 mb-2">
            <ui-text-input-with-label v-model="newSettings.qbittorrentUsername" :disabled="savingSettings" :label="$strings.LabelQbittorrentUsername" />
          </div>
          <div class="w-full md:w-1/2 px-1 mb-2">
            <ui-text-input-with-label v-model="newSettings.qbittorrentPassword" :disabled="savingSettings" :label="$strings.LabelQbittorrentPassword" type="password" />
          </div>
        </div>

        <div class="w-full h-px bg-white/10 my-4" />
        <h2 class="text-lg font-semibold mb-2">{{ $strings.HeaderDiscoveryImport }}</h2>

        <div class="flex flex-wrap -mx-1">
          <div class="w-full md:w-2/3 px-1 mb-2">
            <ui-text-input-with-label v-model="newSettings.downloadPath" :disabled="savingSettings" :label="$strings.LabelDiscoveryDownloadPath" />
            <p class="text-xs text-gray-400 pt-1">{{ $strings.LabelDiscoveryDownloadPathHelp }}</p>
          </div>
          <div class="w-full md:w-1/3 px-1 mb-2">
            <label class="text-sm font-semibold px-1">{{ $strings.LabelDiscoveryTargetLibrary }}</label>
            <ui-dropdown v-model="newSettings.defaultLibraryId" :items="libraryItems" :disabled="savingSettings" class="mt-1" />
          </div>
        </div>

        <div class="w-full h-px bg-white/10 my-4" />
        <h2 class="text-lg font-semibold mb-2">{{ $strings.HeaderDiscoveryAutoGrab }}</h2>
        <p class="text-xs text-gray-400 mb-3">{{ $strings.MessageDiscoveryAutoGrabHelp }}</p>

        <div class="mb-3">
          <label class="text-sm font-semibold px-1">{{ $strings.LabelDiscoveryIndexers }}</label>
          <p class="text-xs text-gray-400 px-1 mb-1">{{ $strings.LabelDiscoveryIndexersHelp }}</p>
          <p v-if="indexersError" class="text-xs text-warning px-1">{{ $strings.MessageDiscoveryLoadIndexersFailed }}</p>
          <div v-else class="flex flex-wrap gap-2 px-1">
            <label v-for="indexer in indexers" :key="indexer.id" class="flex items-center px-2 py-1 rounded bg-primary/20 text-sm cursor-pointer" :class="indexer.enable ? '' : 'opacity-50'">
              <input type="checkbox" class="mr-2" :checked="newSettings.indexerIds.includes(indexer.id)" :disabled="savingSettings" @change="toggleIndexer(indexer.id)" />
              {{ indexer.name }}<span class="text-xxs text-gray-400 ml-1">({{ indexer.protocol }})</span>
            </label>
            <p v-if="!indexers.length" class="text-xs text-gray-500">{{ $strings.LabelDiscoveryAllIndexers }}</p>
          </div>
        </div>

        <div class="flex flex-wrap -mx-1 items-end">
          <div class="w-full md:w-1/3 px-1 mb-2">
            <ui-text-input-with-label v-model="newSettings.autoGrabMinSeeders" type="number" :disabled="savingSettings" :label="$strings.LabelDiscoveryMinSeeders" />
            <p class="text-xs text-gray-400 pt-1">{{ $strings.LabelDiscoveryMinSeedersHelp }}</p>
          </div>
          <div class="w-full md:w-1/3 px-1 mb-2">
            <label class="text-sm font-semibold px-1">{{ $strings.LabelDiscoveryCatalogRegion }}</label>
            <ui-dropdown v-model="newSettings.catalogRegion" :items="regionItems" :disabled="savingSettings" class="mt-1" />
            <p class="text-xs text-gray-400 pt-1">{{ $strings.LabelDiscoveryCatalogRegionHelp }}</p>
          </div>
          <div class="w-full md:w-1/3 px-1 mb-2 flex items-center py-2">
            <ui-toggle-switch v-model="newSettings.preferFreeleech" :disabled="savingSettings" />
            <p class="pl-3 text-sm">{{ $strings.LabelDiscoveryPreferFreeleech }}</p>
          </div>
        </div>

        <div v-if="testResult" class="mt-4 text-sm">
          <p :class="testResult.prowlarr.success ? 'text-success' : 'text-error'">Prowlarr: {{ testResult.prowlarr.success ? $strings.LabelConnected + (testResult.prowlarr.version ? ' (v' + testResult.prowlarr.version + ')' : '') : testResult.prowlarr.error }}</p>
          <p :class="testResult.qbittorrent.success ? 'text-success' : 'text-error'">qBittorrent: {{ testResult.qbittorrent.success ? $strings.LabelConnected + (testResult.qbittorrent.version ? ' (' + testResult.qbittorrent.version + ')' : '') : testResult.qbittorrent.error }}</p>
        </div>

        <div class="flex items-center justify-between pt-4">
          <ui-btn :loading="testing" type="button" @click="testClick">{{ $strings.ButtonTest }}</ui-btn>
          <ui-btn :loading="savingSettings" type="submit">{{ $strings.ButtonSave }}</ui-btn>
        </div>
      </form>

      <div v-show="loading" class="absolute top-0 left-0 w-full h-full bg-black/25 flex items-center justify-center">
        <ui-loading-indicator />
      </div>
    </app-settings-content>
  </div>
</template>

<script>
export default {
  asyncData({ store, redirect }) {
    if (!store.getters['user/getIsAdminOrUp']) {
      redirect('/')
    }
  },
  data() {
    return {
      loading: false,
      savingSettings: false,
      testing: false,
      testResult: null,
      libraries: [],
      indexers: [],
      indexersError: false,
      settings: null,
      newSettings: {
        enabled: false,
        prowlarrHost: null,
        prowlarrApiKey: null,
        qbittorrentHost: null,
        qbittorrentUsername: null,
        qbittorrentPassword: null,
        qbittorrentCategory: 'audiobookshelf',
        downloadPath: null,
        defaultLibraryId: null,
        indexerIds: [],
        autoGrabMinSeeders: 1,
        preferFreeleech: true,
        catalogRegion: 'us'
      }
    }
  },
  computed: {
    libraryItems() {
      return this.libraries.filter((l) => l.mediaType === 'book').map((l) => ({ text: l.name, value: l.id }))
    },
    regionItems() {
      return ['us', 'ca', 'uk', 'au', 'fr', 'de', 'it', 'es', 'in', 'jp'].map((r) => ({ text: r.toUpperCase(), value: r }))
    }
  },
  methods: {
    toggleIndexer(id) {
      const ids = this.newSettings.indexerIds || []
      this.newSettings.indexerIds = ids.includes(id) ? ids.filter((i) => i !== id) : [...ids, id]
    },
    async loadIndexers() {
      const data = await this.$axios.$get('/api/discovery/indexers').catch((error) => {
        console.error('Failed to load indexers', error)
        return null
      })
      this.indexers = data?.indexers || []
      this.indexersError = !data
    },
    setSettings(settings) {
      this.settings = settings
      this.newSettings = { ...settings, indexerIds: [...(settings.indexerIds || [])] }
    },
    async loadLibraries() {
      const data = await this.$axios.$get('/api/libraries').catch((error) => {
        console.error('Failed to load libraries', error)
        return null
      })
      this.libraries = data?.libraries || data || []
    },
    buildPayload() {
      return {
        enabled: !!this.newSettings.enabled,
        prowlarrHost: this.newSettings.prowlarrHost,
        prowlarrApiKey: this.newSettings.prowlarrApiKey,
        qbittorrentHost: this.newSettings.qbittorrentHost,
        qbittorrentUsername: this.newSettings.qbittorrentUsername,
        qbittorrentPassword: this.newSettings.qbittorrentPassword,
        qbittorrentCategory: this.newSettings.qbittorrentCategory,
        downloadPath: this.newSettings.downloadPath,
        defaultLibraryId: this.newSettings.defaultLibraryId,
        indexerIds: this.newSettings.indexerIds || [],
        autoGrabMinSeeders: Number(this.newSettings.autoGrabMinSeeders) || 0,
        preferFreeleech: !!this.newSettings.preferFreeleech,
        catalogRegion: this.newSettings.catalogRegion || 'us'
      }
    },
    submitForm() {
      this.savingSettings = true
      this.$axios
        .$patch('/api/discovery/settings', this.buildPayload())
        .then((data) => {
          this.setSettings(data.settings)
          this.loadIndexers()
          this.$toast.success(this.$strings.ToastSettingsUpdateSuccess || 'Settings updated')
        })
        .catch((error) => {
          console.error('Failed to update discovery settings', error)
          this.$toast.error(this.$strings.ToastFailedToUpdate)
        })
        .finally(() => {
          this.savingSettings = false
        })
    },
    testClick() {
      this.testing = true
      this.testResult = null
      this.$axios
        .$post('/api/discovery/test', this.buildPayload())
        .then((data) => {
          this.testResult = data
        })
        .catch((error) => {
          console.error('Failed to test connections', error)
          this.$toast.error(this.$strings.ToastFailedToUpdate)
        })
        .finally(() => {
          this.testing = false
        })
    },
    init() {
      this.loading = true
      Promise.all([
        this.loadLibraries(),
        this.loadIndexers(),
        this.$axios
          .$get('/api/discovery/settings')
          .then((data) => {
            this.setSettings(data.settings)
          })
          .catch((error) => {
            console.error('Failed to get discovery settings', error)
            this.$toast.error(this.$strings.ToastFailedToLoadData)
          })
      ]).finally(() => {
        this.loading = false
      })
    }
  },
  mounted() {
    this.init()
  }
}
</script>
