<template>
  <div v-if="show" id="reader" ref="readerRoot" :data-theme="ereaderTheme" class="reader-root group absolute top-0 left-0 w-full z-60 overflow-hidden" :class="{ 'reader-player-open': !!streamLibraryItem, 'chrome-hidden': isEpub && !chromeVisible }" @mousemove="onPointerActivity">
    <!-- ===== EPUB: premium auto-hiding chrome ===== -->
    <template v-if="isEpub">
      <header class="reader-chrome reader-topbar absolute top-0 left-0 right-0 z-40 flex items-center gap-1 px-2 sm:px-4 h-14" @mouseenter="chromeHovered = true" @mouseleave="chromeHovered = false">
        <button type="button" class="reader-icon-btn" :aria-label="$strings.ButtonClose || 'Close'" @click="close">
          <span class="material-symbols text-2xl">arrow_back</span>
        </button>
        <div class="min-w-0 flex-1 px-2 text-center sm:text-left">
          <p class="truncate text-sm sm:text-[0.95rem] font-semibold leading-tight">{{ abTitle }}</p>
          <p v-if="abAuthor" class="truncate text-xs reader-muted leading-tight">{{ abAuthor }}</p>
        </div>
        <button type="button" class="reader-icon-btn" :class="{ 'is-on': tocOpen }" aria-label="Table of contents" @click="toggleToC">
          <span class="material-symbols text-2xl">toc</span>
        </button>
        <button type="button" class="reader-icon-btn" :class="{ 'is-on': showSettings }" aria-label="Ereader settings" @click.stop="toggleSettings">
          <span class="text-lg font-semibold tracking-tight" style="font-family: var(--font-serif)">Aa</span>
        </button>
        <button type="button" class="reader-icon-btn reader-fs-btn" :aria-label="isFullscreen ? 'Exit full screen' : 'Full screen'" @click="toggleFullscreen">
          <span class="material-symbols text-2xl">{{ isFullscreen ? 'close_fullscreen' : 'open_in_full' }}</span>
        </button>
      </header>

      <footer class="reader-chrome reader-bottombar absolute bottom-0 left-0 right-0 z-40 px-4 sm:px-8 pb-3 pt-2" @mouseenter="chromeHovered = true" @mouseleave="chromeHovered = false">
        <div class="flex items-center justify-between text-xs reader-muted mb-1.5 gap-4">
          <span class="truncate">{{ currentChapterTitle || '&nbsp;' }}</span>
          <span class="shrink-0 tabular-nums">
            <template v-if="sectionPageText">{{ sectionPageText }} · </template>{{ progressPercentText }}
          </span>
        </div>
        <input type="range" class="reader-scrubber w-full" min="0" max="1000" step="1" :value="scrubberValue" :disabled="!locationsReady" :style="{ '--progress': scrubberValue / 10 + '%' }" aria-label="Book progress" @input="scrubInput" @change="scrubChange" />
      </footer>

      <!-- Always-visible minimal progress while chrome is hidden -->
      <div class="reader-mini-progress absolute bottom-2 left-0 right-0 z-30 text-center text-[0.7rem] reader-muted tabular-nums pointer-events-none">{{ progressPercentText }}</div>
    </template>

    <!-- ===== Other formats (pdf / comic / mobi): slim floating header ===== -->
    <template v-else>
      <div class="absolute top-3 left-1/2 -translate-x-1/2 z-20 max-w-[60vw]">
        <h1 :data-type="ebookType" class="reader-pill truncate text-sm sm:text-base px-4 py-1.5 data-[type=comic]:hidden">
          <span class="font-semibold">{{ abTitle }}</span>
          <span v-if="abAuthor" class="hidden md:inline reader-muted"> · {{ abAuthor }}</span>
        </h1>
      </div>
      <div class="absolute top-3 right-3 z-20">
        <button @click="close" type="button" aria-label="Close ereader" class="reader-icon-btn reader-pill">
          <span class="material-symbols text-2xl">close</span>
        </button>
      </div>
    </template>

    <component
      v-if="componentName"
      ref="readerComponent"
      :is="componentName"
      :library-item="selectedLibraryItem"
      :player-open="!!streamLibraryItem"
      :keep-progress="keepProgress"
      :file-id="ebookFileId"
      :settings="ereaderSettings"
      @touchstart="touchstart"
      @touchend="touchend"
      @relocated="onRelocated"
      @locations-ready="locationsReady = true"
      @chapters="onChapters"
      @toggle-chrome="toggleChrome"
      @pointer="onPointerActivity"
      @hook:mounted="readerMounted"
    />

    <!-- TOC drawer -->
    <transition name="reader-fade">
      <div v-if="tocOpen" class="absolute inset-0 bg-black/40 backdrop-blur-[2px] z-50" @click.stop.prevent="toggleToC"></div>
    </transition>
    <aside v-if="isEpub" class="reader-panel absolute top-0 left-0 h-full w-[22rem] max-w-[88vw] z-50 transition-transform duration-300 ease-out flex flex-col" :class="tocOpen ? 'translate-x-0 is-open' : '-translate-x-full'" @click.stop>
      <div class="flex items-center gap-2 px-4 pt-4 pb-3">
        <p class="text-lg font-semibold flex-1">{{ $strings.HeaderTableOfContents }}</p>
        <button @click.stop.prevent="toggleToC" type="button" aria-label="Close table of contents" class="reader-icon-btn">
          <span class="material-symbols text-2xl">close</span>
        </button>
      </div>
      <form class="px-4 pb-3" @submit.prevent="searchBook" @click.stop>
        <div class="reader-search flex items-center rounded-full px-3 h-10">
          <span class="material-symbols text-lg reader-muted mr-2">search</span>
          <input ref="input" v-model="searchQuery" type="search" :placeholder="$strings.PlaceholderSearch" class="bg-transparent outline-hidden flex-1 text-sm min-w-0" @search="searchBook" />
        </div>
      </form>

      <div class="overflow-y-auto flex-1 px-2 pb-6">
        <div v-if="isSearching && !searchResults.length" class="w-full py-10 text-center reader-muted">{{ $strings.MessageNoResults }}</div>
        <ul>
          <li v-for="chapter in isSearching ? searchResults : chapters" :key="chapter.href + chapter.title">
            <a :href="chapter.href" class="reader-toc-item" :class="{ 'is-current': isCurrentChapter(chapter) }" @click.prevent="goToChapter(chapter.href)">
              <span class="truncate">{{ chapter.title }}</span>
              <span v-if="chapter.start >= 0 && locationsReady" class="reader-muted text-xs tabular-nums ml-3 shrink-0">{{ Math.round(chapter.start * 100) }}%</span>
            </a>
            <a v-for="result in chapter.searchResults" :key="result.cfi" :href="result.cfi" class="block text-sm py-1.5 pl-6 pr-3 rounded-lg reader-muted hover:opacity-100 reader-hover" @click.prevent="goToChapter(result.cfi)">{{ result.excerpt }}</a>

            <ul v-if="chapter.subitems && chapter.subitems.length">
              <li v-for="subchapter in chapter.subitems" :key="subchapter.href + subchapter.title">
                <a :href="subchapter.href" class="reader-toc-item pl-7 text-[0.9rem]" :class="{ 'is-current': isCurrentChapter(subchapter) }" @click.prevent="goToChapter(subchapter.href)">
                  <span class="truncate">{{ subchapter.title }}</span>
                </a>
                <a v-for="result in subchapter.searchResults" :key="result.cfi" :href="result.cfi" class="block text-sm py-1.5 pl-10 pr-3 rounded-lg reader-muted reader-hover" @click.prevent="goToChapter(result.cfi)">{{ result.excerpt }}</a>
              </li>
            </ul>
          </li>
        </ul>
      </div>
    </aside>

    <!-- Appearance popover ("Aa") -->
    <transition name="reader-pop">
      <div v-if="showSettings" v-click-outside="closeSettings" class="reader-panel reader-settings absolute top-16 right-2 sm:right-4 z-50 w-[21rem] max-w-[calc(100vw-1rem)] rounded-2xl p-4 space-y-4" @click.stop>
        <!-- Themes -->
        <div class="grid grid-cols-4 gap-2">
          <button v-for="t in themeSwatches" :key="t.value" type="button" class="reader-swatch" :class="{ 'is-on': ereaderSettings.theme === t.value }" :style="{ background: t.bg, color: t.fg }" :aria-label="t.text" @click="setSetting('theme', t.value)">
            <span class="text-lg font-semibold" style="font-family: var(--font-serif)">Aa</span>
            <span class="text-[0.65rem] mt-0.5 opacity-80">{{ t.text }}</span>
          </button>
        </div>

        <!-- Font size -->
        <div class="flex items-center gap-2">
          <button type="button" class="reader-step" aria-label="Decrease font size" :disabled="ereaderSettings.fontScale <= 60" @click="stepFont(-10)"><span class="text-sm font-semibold" style="font-family: var(--font-serif)">A</span></button>
          <div class="flex-1 text-center text-sm tabular-nums reader-muted">{{ ereaderSettings.fontScale }}%</div>
          <button type="button" class="reader-step" aria-label="Increase font size" :disabled="ereaderSettings.fontScale >= 250" @click="stepFont(10)"><span class="text-xl font-semibold" style="font-family: var(--font-serif)">A</span></button>
        </div>

        <!-- Fonts -->
        <div>
          <p class="reader-label">{{ $strings.LabelFontFamily }}</p>
          <div class="grid grid-cols-2 gap-2">
            <button v-for="f in fontItems" :key="f.value" type="button" class="reader-chip" :class="{ 'is-on': ereaderSettings.font === f.value }" :style="{ fontFamily: f.css }" @click="setSetting('font', f.value)">{{ f.text }}</button>
          </div>
        </div>

        <!-- Line spacing -->
        <div>
          <p class="reader-label flex justify-between">
            <span>{{ $strings.LabelLineSpacing }}</span
            ><span class="tabular-nums">{{ (ereaderSettings.lineSpacing / 100).toFixed(2) }}</span>
          </p>
          <input type="range" class="reader-scrubber w-full" min="100" max="250" step="5" :value="ereaderSettings.lineSpacing" :style="{ '--progress': ((ereaderSettings.lineSpacing - 100) / 150) * 100 + '%' }" @input="setSetting('lineSpacing', Number($event.target.value))" />
        </div>

        <!-- Margins -->
        <div>
          <p class="reader-label">Margins</p>
          <div class="grid grid-cols-3 gap-2">
            <button v-for="m in marginItems" :key="m.value" type="button" class="reader-chip" :class="{ 'is-on': ereaderSettings.margin === m.value }" @click="setSetting('margin', m.value)">{{ m.text }}</button>
          </div>
        </div>

        <!-- Layout -->
        <div>
          <p class="reader-label">{{ $strings.LabelLayout }}</p>
          <div class="grid grid-cols-2 gap-2">
            <button v-for="l in spreadItems" :key="l.value" type="button" class="reader-chip" :class="{ 'is-on': ereaderSettings.spread === l.value }" @click="setSetting('spread', l.value)">{{ l.text }}</button>
          </div>
        </div>

        <!-- Boldness -->
        <div>
          <p class="reader-label flex justify-between">
            <span>{{ $strings.LabelFontBoldness }}</span
            ><span class="tabular-nums">{{ ereaderSettings.textStroke }}</span>
          </p>
          <input type="range" class="reader-scrubber w-full" min="0" max="100" step="5" :value="ereaderSettings.textStroke" :style="{ '--progress': ereaderSettings.textStroke + '%' }" @input="setSetting('textStroke', Number($event.target.value))" />
        </div>
      </div>
    </transition>
  </div>
</template>

<script>
export default {
  data() {
    return {
      touchstartX: 0,
      touchstartY: 0,
      touchendX: 0,
      touchendY: 0,
      touchstartTime: 0,
      touchIdentifier: null,
      chapters: [],
      isSearching: false,
      searchResults: [],
      searchQuery: '',
      tocOpen: false,
      showSettings: false,
      readingTimer: null,
      readingHeartbeatSeconds: 20,
      // Auto-hiding chrome (epub)
      chromeVisible: true,
      chromeHovered: false,
      chromeTimer: null,
      isFullscreen: false,
      // Reading position (emitted by the epub reader)
      locationsReady: false,
      location: { percentage: 0, href: null, page: 0, total: 0, chapterTitle: '' },
      scrubPreview: null,
      ereaderSettings: {
        theme: 'dark',
        font: 'literata',
        fontScale: 100,
        lineSpacing: 150,
        fontBoldness: 100,
        spread: 'auto',
        textStroke: 0,
        margin: 'normal'
      }
    }
  },
  watch: {
    show(newVal) {
      if (newVal) {
        this.init()
      }
    }
  },
  computed: {
    show: {
      get() {
        return this.$store.state.showEReader
      },
      set(val) {
        this.$store.commit('setShowEReader', val)
      }
    },
    ereaderTheme() {
      if (this.isEpub) return this.ereaderSettings.theme
      return 'dark'
    },
    themeSwatches() {
      return [
        { value: 'light', text: this.$strings.LabelThemeLight, bg: '#fbfaf7', fg: '#1d1d1f' },
        { value: 'sepia', text: this.$strings.LabelThemeSepia, bg: '#f3e9d2', fg: '#5b4636' },
        { value: 'dark', text: this.$strings.LabelThemeDark, bg: '#1b1d22', fg: '#e8e4dc' },
        { value: 'black', text: 'Black', bg: '#000000', fg: '#c9c6bf' }
      ]
    },
    fontItems() {
      return [
        { value: 'literata', text: 'Literata', css: "'Literata', Georgia, serif" },
        { value: 'serif', text: 'Georgia', css: 'Georgia, serif' },
        { value: 'sans-serif', text: 'Inter', css: "'Inter', sans-serif" },
        { value: 'publisher', text: 'Original', css: 'inherit' }
      ]
    },
    marginItems() {
      return [
        { value: 'narrow', text: 'Narrow' },
        { value: 'normal', text: 'Normal' },
        { value: 'wide', text: 'Wide' }
      ]
    },
    displayedPercentage() {
      return this.scrubPreview !== null ? this.scrubPreview : this.location.percentage || 0
    },
    progressPercentText() {
      if (!this.locationsReady) return ''
      return `${Math.round(this.displayedPercentage * 100)}%`
    },
    scrubberValue() {
      return Math.round(this.displayedPercentage * 1000)
    },
    sectionPageText() {
      if (!this.location.total || this.scrubPreview !== null) return ''
      return `Page ${this.location.page} of ${this.location.total}`
    },
    currentChapterTitle() {
      if (this.scrubPreview !== null) {
        const chapter = this.chapterAtPercentage(this.scrubPreview)
        return chapter?.title || ''
      }
      // Chapter starts (by percentage) are the most precise once locations exist; fall back to the nav label
      const byPosition = this.locationsReady ? this.chapterAtPercentage(this.location.percentage)?.title : ''
      return byPosition || this.location.chapterTitle || ''
    },
    flatChapters() {
      const out = []
      const walk = (list) => {
        for (const c of list || []) {
          out.push(c)
          walk(c.subitems)
        }
      }
      walk(this.chapters)
      return out.filter((c) => typeof c.start === 'number' && c.start >= 0).sort((a, b) => a.start - b.start)
    },
    spreadItems() {
      return [
        {
          text: this.$strings.LabelLayoutSinglePage,
          value: 'none'
        },
        {
          text: this.$strings.LabelLayoutSplitPage,
          value: 'auto'
        }
      ]
    },
    componentName() {
      if (this.ebookType === 'epub') return 'readers-epub-reader'
      else if (this.ebookType === 'mobi') return 'readers-mobi-reader'
      else if (this.ebookType === 'pdf') return 'readers-pdf-reader'
      else if (this.ebookType === 'comic') return 'readers-comic-reader'
      return null
    },
    streamLibraryItem() {
      return this.$store.state.streamLibraryItem
    },
    abTitle() {
      return this.mediaMetadata.title
    },
    abAuthor() {
      return this.mediaMetadata.authorName
    },
    selectedLibraryItem() {
      return this.$store.state.selectedLibraryItem || {}
    },
    media() {
      return this.selectedLibraryItem.media || {}
    },
    mediaMetadata() {
      return this.media.metadata || {}
    },
    libraryId() {
      return this.selectedLibraryItem.libraryId
    },
    folderId() {
      return this.selectedLibraryItem.folderId
    },
    ebookFile() {
      // ebook file id is passed when reading a supplementary ebook
      if (this.ebookFileId) {
        return this.selectedLibraryItem.libraryFiles.find((lf) => lf.ino === this.ebookFileId)
      }
      return this.media.ebookFile
    },
    ebookFormat() {
      if (!this.ebookFile) return null
      // Use file extension for supplementary ebook
      if (!this.ebookFile.ebookFormat) {
        return this.ebookFile.metadata.ext.toLowerCase().slice(1)
      }
      return this.ebookFile.ebookFormat
    },
    ebookType() {
      if (this.isMobi) return 'mobi'
      else if (this.isEpub) return 'epub'
      else if (this.isPdf) return 'pdf'
      else if (this.isComic) return 'comic'
      return null
    },
    isEpub() {
      return this.ebookFormat == 'epub'
    },
    isMobi() {
      return this.ebookFormat == 'mobi' || this.ebookFormat == 'azw3'
    },
    isPdf() {
      return this.ebookFormat == 'pdf'
    },
    isComic() {
      return this.ebookFormat == 'cbz' || this.ebookFormat == 'cbr'
    },
    keepProgress() {
      return this.$store.state.ereaderKeepProgress
    },
    ebookFileId() {
      return this.$store.state.ereaderFileId
    },
    isDarkTheme() {
      return this.ereaderSettings.theme === 'dark'
    }
  },
  methods: {
    goToChapter(uri) {
      this.toggleToC()
      this.$refs.readerComponent.goToChapter(uri)
    },
    chapterAtPercentage(pct) {
      let found = null
      for (const c of this.flatChapters) {
        if (c.start <= pct + 0.0001) found = c
        else break
      }
      return found
    },
    isCurrentChapter(chapter) {
      if (!this.location.href || !chapter.href) return false
      const current = this.currentChapterTitle
      return chapter.title === current || chapter.href.split('#')[0] === this.location.href.split('#')[0]
    },
    onRelocated(location) {
      this.location = { ...this.location, ...location }
    },
    onChapters(chapters) {
      this.chapters = chapters
    },
    scrubInput(e) {
      this.scrubPreview = Number(e.target.value) / 1000
      this.showChrome()
    },
    scrubChange(e) {
      const pct = Number(e.target.value) / 1000
      this.$refs.readerComponent?.goToPercentage?.(pct)
      this.scrubPreview = null
    },
    // ---- Chrome visibility ----
    showChrome() {
      this.chromeVisible = true
      this.scheduleHideChrome()
    },
    scheduleHideChrome() {
      clearTimeout(this.chromeTimer)
      this.chromeTimer = setTimeout(() => {
        if (this.chromeHovered || this.showSettings || this.tocOpen || this.scrubPreview !== null) {
          this.scheduleHideChrome()
          return
        }
        this.chromeVisible = false
      }, 3500)
    },
    toggleChrome() {
      if (this.showSettings) {
        this.showSettings = false
        return
      }
      if (this.chromeVisible) {
        clearTimeout(this.chromeTimer)
        this.chromeVisible = false
      } else {
        this.showChrome()
      }
    },
    onPointerActivity(e) {
      // Reveal chrome when the pointer approaches the top or bottom edge
      const root = this.$refs.readerRoot
      if (!root) return
      const rect = root.getBoundingClientRect()
      const y = e.clientY - rect.top
      if (y < 80 || y > rect.height - 90) this.showChrome()
    },
    toggleFullscreen() {
      const el = this.$refs.readerRoot
      if (!document.fullscreenElement && el?.requestFullscreen) {
        el.requestFullscreen().catch((error) => console.warn('Fullscreen failed', error))
      } else if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {})
      }
    },
    fullscreenChanged() {
      this.isFullscreen = !!document.fullscreenElement
      // Let the reader re-measure after the layout change
      setTimeout(() => this.$refs.readerComponent?.resize?.(), 150)
    },
    // ---- Appearance settings ----
    toggleSettings() {
      this.showSettings = !this.showSettings
      if (this.showSettings) this.showChrome()
    },
    closeSettings() {
      this.showSettings = false
    },
    setSetting(key, value) {
      this.ereaderSettings[key] = value
      this.settingsUpdated()
    },
    stepFont(delta) {
      const next = Math.min(250, Math.max(60, (Number(this.ereaderSettings.fontScale) || 100) + delta))
      this.setSetting('fontScale', next)
    },
    readerMounted() {
      if (this.isEpub) {
        this.loadEreaderSettings()
      }
    },
    settingsUpdated() {
      this.$refs.readerComponent?.updateSettings?.(this.ereaderSettings)
      localStorage.setItem('ereaderSettings', JSON.stringify(this.ereaderSettings))
    },
    toggleToC() {
      this.tocOpen = !this.tocOpen
      if (this.$refs.readerComponent?.chapters) this.chapters = this.$refs.readerComponent.chapters
      if (this.tocOpen) this.showSettings = false
    },
    openSettings() {
      this.showSettings = true
    },
    hotkey(action) {
      if (!this.$refs.readerComponent) return

      if (action === this.$hotkeys.EReader.NEXT_PAGE) {
        this.next()
      } else if (action === this.$hotkeys.EReader.PREV_PAGE) {
        this.prev()
      } else if (action === this.$hotkeys.EReader.CLOSE) {
        this.close()
      }
    },
    async searchBook() {
      if (this.searchQuery.length > 1) {
        this.searchResults = await this.$refs.readerComponent.searchBook(this.searchQuery)
        this.isSearching = true
      } else {
        this.isSearching = false
        this.searchResults = []
      }
    },
    next() {
      if (this.$refs.readerComponent?.next) this.$refs.readerComponent.next()
    },
    prev() {
      if (this.$refs.readerComponent?.prev) this.$refs.readerComponent.prev()
    },
    handleGesture() {
      // Touch must be less than 1s. Must be > 60px drag and X distance > Y distance
      const touchTimeMs = Date.now() - this.touchstartTime
      if (touchTimeMs >= 1000) {
        console.log('Touch too long', touchTimeMs)
        return
      }

      const touchDistanceX = Math.abs(this.touchendX - this.touchstartX)
      const touchDistanceY = Math.abs(this.touchendY - this.touchstartY)
      const touchDistance = Math.sqrt(Math.pow(this.touchstartX - this.touchendX, 2) + Math.pow(this.touchstartY - this.touchendY, 2))
      if (touchDistance < 60) {
        return
      }

      if (touchDistanceX < 60 || touchDistanceY > touchDistanceX) {
        return
      }

      if (this.touchendX < this.touchstartX) {
        this.next()
      }
      if (this.touchendX > this.touchstartX) {
        this.prev()
      }
    },
    touchstart(e) {
      // Ignore rapid touch
      if (this.touchstartTime && Date.now() - this.touchstartTime < 250) {
        return
      }

      this.touchstartX = e.touches[0].screenX
      this.touchstartY = e.touches[0].screenY
      this.touchstartTime = Date.now()
      this.touchIdentifier = e.touches[0].identifier
    },
    touchend(e) {
      if (this.touchIdentifier !== e.changedTouches[0].identifier) {
        return
      }

      this.touchendX = e.changedTouches[0].screenX
      this.touchendY = e.changedTouches[0].screenY
      this.handleGesture()
    },
    registerListeners() {
      document.addEventListener('fullscreenchange', this.fullscreenChanged)
      this.$eventBus.$on('reader-hotkey', this.hotkey)
      document.body.addEventListener('touchstart', this.touchstart)
      document.body.addEventListener('touchend', this.touchend)
    },
    unregisterListeners() {
      document.removeEventListener('fullscreenchange', this.fullscreenChanged)
      this.$eventBus.$off('reader-hotkey', this.hotkey)
      document.body.removeEventListener('touchstart', this.touchstart)
      document.body.removeEventListener('touchend', this.touchend)
    },
    loadEreaderSettings() {
      try {
        const settings = localStorage.getItem('ereaderSettings')
        if (settings) {
          const _ereaderSettings = JSON.parse(settings)
          for (const key in this.ereaderSettings) {
            if (_ereaderSettings[key] !== undefined) {
              this.ereaderSettings[key] = _ereaderSettings[key]
            }
          }
        }
        // Older versions stored line spacing as a tight 115%; bump to a comfortable default once
        if (this.ereaderSettings.lineSpacing < 100) this.ereaderSettings.lineSpacing = 150
        this.settingsUpdated()
      } catch (error) {
        console.error('Failed to load ereader settings', error)
      }
    },
    // ---- Reading time tracking (per-user stats) ----
    startReadTracking() {
      this.stopReadTracking()
      this.readingTimer = setInterval(() => {
        // Only count time while the reader is open and the tab is visible
        if (!this.show) return
        if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
        this.flushReadTime(this.readingHeartbeatSeconds)
      }, this.readingHeartbeatSeconds * 1000)
    },
    stopReadTracking() {
      if (this.readingTimer) {
        clearInterval(this.readingTimer)
        this.readingTimer = null
      }
    },
    flushReadTime(seconds) {
      const libraryItemId = this.selectedLibraryItem?.id
      if (!libraryItemId || !seconds) return
      this.$axios.$post(`/api/me/reading-time/${libraryItemId}`, { time: seconds }, { progress: false }).catch((error) => {
        console.error('Failed to record reading time', error)
      })
    },
    init() {
      this.registerListeners()
      this.startReadTracking()
      this.locationsReady = false
      this.location = { percentage: 0, href: null, page: 0, total: 0, chapterTitle: '' }
      this.chapters = []
      this.showChrome()
    },
    close() {
      this.stopReadTracking()
      this.unregisterListeners()
      clearTimeout(this.chromeTimer)
      if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {})
      this.isSearching = false
      this.searchQuery = ''
      this.tocOpen = false
      this.showSettings = false
      this.show = false
    }
  },
  mounted() {
    if (this.show) this.init()
  },
  beforeDestroy() {
    this.stopReadTracking()
    this.unregisterListeners()
    clearTimeout(this.chromeTimer)
  }
}
</script>

<style>
#reader {
  height: 100%;
}
#reader.reader-player-open {
  height: calc(100% - 164px);
}
@media (max-height: 400px) {
  #reader.reader-player-open {
    height: 100%;
  }
}

/* ---- Reader themes ---- */
.reader-root {
  --reader-bg: #1b1d22;
  --reader-fg: #e8e4dc;
  --reader-muted: rgba(232, 228, 220, 0.55);
  --reader-chrome: rgba(27, 29, 34, 0.82);
  --reader-panel: rgba(32, 35, 41, 0.96);
  --reader-border: rgba(255, 255, 255, 0.08);
  --reader-hover: rgba(255, 255, 255, 0.07);
  --reader-accent: #19c8f5;
  background-color: var(--reader-bg);
  color: var(--reader-fg);
  transition:
    background-color 0.3s ease,
    color 0.3s ease;
}
.reader-root[data-theme='black'] {
  --reader-bg: #000;
  --reader-fg: #c9c6bf;
  --reader-muted: rgba(201, 198, 191, 0.5);
  --reader-chrome: rgba(0, 0, 0, 0.82);
  --reader-panel: rgba(18, 18, 20, 0.97);
  --reader-border: rgba(255, 255, 255, 0.08);
}
.reader-root[data-theme='light'] {
  --reader-bg: #fbfaf7;
  --reader-fg: #1d1d1f;
  --reader-muted: rgba(29, 29, 31, 0.55);
  --reader-chrome: rgba(251, 250, 247, 0.85);
  --reader-panel: rgba(255, 255, 255, 0.97);
  --reader-border: rgba(0, 0, 0, 0.08);
  --reader-hover: rgba(0, 0, 0, 0.05);
  --reader-accent: #0b86ad;
}
.reader-root[data-theme='sepia'] {
  --reader-bg: #f3e9d2;
  --reader-fg: #5b4636;
  --reader-muted: rgba(91, 70, 54, 0.6);
  --reader-chrome: rgba(243, 233, 210, 0.88);
  --reader-panel: rgba(248, 240, 222, 0.98);
  --reader-border: rgba(91, 70, 54, 0.14);
  --reader-hover: rgba(91, 70, 54, 0.07);
  --reader-accent: #2b7f95;
}

.reader-muted {
  color: var(--reader-muted);
}
.reader-hover:hover {
  background-color: var(--reader-hover);
}

/* ---- Chrome ---- */
.reader-chrome {
  background-color: var(--reader-chrome);
  backdrop-filter: saturate(150%) blur(16px);
  -webkit-backdrop-filter: saturate(150%) blur(16px);
  transition:
    opacity 0.35s ease,
    transform 0.35s cubic-bezier(0.2, 0.8, 0.2, 1);
}
.reader-topbar {
  border-bottom: 1px solid var(--reader-border);
}
.reader-bottombar {
  border-top: 1px solid var(--reader-border);
}
.chrome-hidden .reader-topbar {
  opacity: 0;
  transform: translateY(-100%);
  pointer-events: none;
}
.chrome-hidden .reader-bottombar {
  opacity: 0;
  transform: translateY(100%);
  pointer-events: none;
}
.reader-mini-progress {
  opacity: 0;
  transition: opacity 0.35s ease;
}
.chrome-hidden .reader-mini-progress {
  opacity: 1;
}

.reader-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 999px;
  color: inherit;
  opacity: 0.85;
  transition:
    background-color 0.2s ease,
    opacity 0.2s ease;
}
.reader-icon-btn:hover {
  opacity: 1;
  background-color: var(--reader-hover);
}
.reader-icon-btn.is-on {
  opacity: 1;
  color: var(--reader-accent);
  background-color: var(--reader-hover);
}
.reader-pill {
  border-radius: 999px;
  background-color: var(--reader-chrome);
  border: 1px solid var(--reader-border);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

/* ---- Panels (TOC + settings) ---- */
.reader-panel {
  background-color: var(--reader-panel);
  color: var(--reader-fg);
  border: 1px solid var(--reader-border);
  box-shadow: 0 30px 60px -20px rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
}
aside.reader-panel {
  border-width: 0 1px 0 0;
  box-shadow: none;
}
aside.reader-panel.is-open {
  box-shadow: 24px 0 60px -24px rgba(0, 0, 0, 0.5);
}
.reader-fs-btn {
  display: none;
}
@media (min-width: 640px) {
  .reader-fs-btn {
    display: inline-flex;
  }
}
.reader-search {
  background-color: var(--reader-hover);
  border: 1px solid var(--reader-border);
}
.reader-toc-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.55rem 0.75rem;
  border-radius: 0.6rem;
  opacity: 0.85;
  transition:
    background-color 0.15s ease,
    opacity 0.15s ease;
}
.reader-toc-item:hover {
  opacity: 1;
  background-color: var(--reader-hover);
}
.reader-toc-item.is-current {
  opacity: 1;
  font-weight: 600;
  color: var(--reader-accent);
  background-color: var(--reader-hover);
}
.reader-label {
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--reader-muted);
  margin-bottom: 0.4rem;
}
.reader-swatch {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 4rem;
  border-radius: 0.75rem;
  border: 1px solid rgba(127, 127, 127, 0.3);
  transition:
    transform 0.15s ease,
    box-shadow 0.15s ease;
}
.reader-swatch:hover {
  transform: translateY(-1px);
}
.reader-swatch.is-on {
  box-shadow:
    0 0 0 2px var(--reader-panel),
    0 0 0 4px var(--reader-accent);
}
.reader-chip,
.reader-step {
  height: 2.4rem;
  border-radius: 0.65rem;
  border: 1px solid var(--reader-border);
  background-color: var(--reader-hover);
  font-size: 0.875rem;
  transition:
    border-color 0.15s ease,
    color 0.15s ease;
}
.reader-step {
  width: 3rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.reader-step:disabled {
  opacity: 0.35;
}
.reader-chip.is-on {
  border-color: var(--reader-accent);
  color: var(--reader-accent);
  font-weight: 600;
}

/* ---- Range sliders (scrubber, spacing) ---- */
.reader-scrubber {
  -webkit-appearance: none;
  appearance: none;
  height: 4px;
  border-radius: 999px;
  background: linear-gradient(to right, var(--reader-accent) 0%, var(--reader-accent) var(--progress, 0%), var(--reader-border) var(--progress, 0%), var(--reader-border) 100%);
  cursor: pointer;
  outline: none;
}
.reader-scrubber:disabled {
  opacity: 0.4;
  cursor: default;
}
.reader-scrubber::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 14px;
  height: 14px;
  border-radius: 999px;
  background: var(--reader-accent);
  border: 2px solid var(--reader-bg);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.35);
  transition: transform 0.15s ease;
}
.reader-scrubber::-webkit-slider-thumb:hover {
  transform: scale(1.25);
}
.reader-scrubber::-moz-range-thumb {
  width: 14px;
  height: 14px;
  border-radius: 999px;
  background: var(--reader-accent);
  border: 2px solid var(--reader-bg);
}

/* ---- Transitions ---- */
.reader-fade-enter-active,
.reader-fade-leave-active {
  transition: opacity 0.25s ease;
}
.reader-fade-enter,
.reader-fade-leave-to {
  opacity: 0;
}
.reader-pop-enter-active,
.reader-pop-leave-active {
  transition:
    opacity 0.18s ease,
    transform 0.18s ease;
  transform-origin: top right;
}
.reader-pop-enter,
.reader-pop-leave-to {
  opacity: 0;
  transform: scale(0.96) translateY(-4px);
}
</style>
