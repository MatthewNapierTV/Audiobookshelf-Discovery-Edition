<template>
  <div id="epub-reader" class="epub-reader absolute inset-0 pt-14 pb-16">
    <div ref="frame" class="group/frame relative h-full w-full flex justify-center">
      <div id="viewer" ref="viewer" class="h-full" :style="{ width: viewerWidth + 'px' }"></div>

      <!-- Desktop edge navigation -->
      <button type="button" aria-label="Previous page" class="epub-edge-btn left-0" :class="{ invisible: atStart }" @mousedown.prevent @click="prev">
        <span class="material-symbols text-4xl">chevron_left</span>
      </button>
      <button type="button" aria-label="Next page" class="epub-edge-btn right-0" :class="{ invisible: atEnd }" @mousedown.prevent @click="next">
        <span class="material-symbols text-4xl">chevron_right</span>
      </button>
    </div>
  </div>
</template>

<script>
import ePub from 'epubjs'

/**
 * @typedef {object} EpubReader
 * @property {ePub.Book} book
 * @property {ePub.Rendition} rendition
 */
export default {
  props: {
    libraryItem: {
      type: Object,
      default: () => {}
    },
    playerOpen: Boolean,
    keepProgress: Boolean,
    fileId: String,
    settings: Object
  },
  data() {
    return {
      /** @type {ePub.Book} */
      book: null,
      /** @type {ePub.Rendition} */
      rendition: null,
      chapters: [],
      frameWidth: 0,
      frameHeight: 0,
      resizeObserver: null,
      resizeTimer: null,
      atStart: true,
      atEnd: false,
      locationsReady: false,
      lastLocation: null,
      ereaderSettings: {
        theme: 'dark',
        font: 'literata',
        fontScale: 100,
        lineSpacing: 150,
        spread: 'auto',
        textStroke: 0,
        margin: 'normal'
      }
    }
  },
  watch: {
    playerOpen() {
      this.$nextTick(this.resize)
    }
  },
  computed: {
    /** @returns {string} */
    libraryItemId() {
      return this.libraryItem?.id
    },
    allowScriptedContent() {
      return this.$store.getters['libraries/getLibraryEpubsAllowScriptedContent']
    },

    userMediaProgress() {
      if (!this.libraryItemId) return
      return this.$store.getters['user/getUserMediaProgress'](this.libraryItemId)
    },
    savedEbookLocation() {
      if (!this.keepProgress) return null
      if (!this.userMediaProgress?.ebookLocation) return null
      // Validate ebookLocation is an epubcfi
      if (!String(this.userMediaProgress.ebookLocation).startsWith('epubcfi')) return null
      return this.userMediaProgress.ebookLocation
    },
    localStorageLocationsKey() {
      return `ebookLocations-${this.libraryItemId}`
    },
    /** Horizontal page margin (each side) for the selected margin preset */
    marginPx() {
      const w = this.frameWidth
      const mobile = w < 640
      const presets = {
        narrow: mobile ? 14 : Math.max(24, w * 0.03),
        normal: mobile ? 22 : Math.max(48, w * 0.08),
        wide: mobile ? 36 : Math.max(72, w * 0.16)
      }
      return presets[this.ereaderSettings.margin] ?? presets.normal
    },
    viewerWidth() {
      if (!this.frameWidth) return 0
      let width = Math.floor(this.frameWidth - this.marginPx * 2)
      // Comfortable line length: cap single-column pages, and two-page spreads
      if (this.ereaderSettings.spread === 'none') width = Math.min(width, 760)
      else width = Math.min(width, 1400)
      return Math.max(width, 200)
    },
    viewerHeight() {
      return Math.max(Math.floor(this.frameHeight), 200)
    },
    ebookUrl() {
      if (this.fileId) {
        return `/api/items/${this.libraryItemId}/ebook/${this.fileId}`
      }
      return `/api/items/${this.libraryItemId}/ebook`
    },
    themeColors() {
      const themes = {
        dark: { bg: '#1b1d22', fg: '#e8e4dc', link: '#f5b544' },
        black: { bg: '#000000', fg: '#c9c6bf', link: '#f5b544' },
        light: { bg: '#fbfaf7', fg: '#1d1d1f', link: '#a8650a' },
        sepia: { bg: '#f3e9d2', fg: '#5b4636', link: '#8a4f12' }
      }
      return themes[this.ereaderSettings.theme] || themes.dark
    },
    fontAssetBase() {
      return `${window.location.origin}${this.$config.routerBasePath || ''}/fonts`.replace(/([^:])\/\/+/g, '$1/')
    },
    /**
     * Stylesheet injected into every rendered section. Uses a unitless line-height (relative to each
     * element's own font size) so headings and body text both stay proportional - the previous rem
     * based value squashed large text and ignored the font scale.
     */
    themeCss() {
      const { bg, fg, link } = this.themeColors
      const lineSpacing = Math.max(1, (Number(this.ereaderSettings.lineSpacing) || 150) / 100)
      const stroke = Math.min(1, (Number(this.ereaderSettings.textStroke) || 0) / 100)
      const fontStacks = {
        literata: "'Literata', Georgia, 'Times New Roman', serif",
        serif: "Georgia, 'Times New Roman', serif",
        'sans-serif': "'Inter', -apple-system, 'Segoe UI', Roboto, sans-serif"
      }
      const fontStack = fontStacks[this.ereaderSettings.font] || null
      const base = this.fontAssetBase
      const face = (family, file, style) => `@font-face{font-family:'${family}';src:url('${base}/${family}/${file}') format('woff2');font-weight:100 900;font-style:${style};font-display:swap;}`
      const fontFaces = [face('Literata', 'literata-latin-wght-normal.woff2', 'normal'), face('Literata', 'literata-latin-wght-italic.woff2', 'italic'), face('Inter', 'inter-latin-wght-normal.woff2', 'normal'), face('Inter', 'inter-latin-wght-italic.woff2', 'italic')].join('\n')
      const notCode = ':not(code):not(pre):not(kbd):not(samp)'

      return `${fontFaces}
html { background-color: ${bg} !important; }
body {
  background-color: transparent !important;
  color: ${fg} !important;
  ${fontStack ? `font-family: ${fontStack} !important;` : ''}
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
  font-kerning: normal;
  hyphens: auto;
  -webkit-hyphens: auto;
  ${stroke ? `-webkit-text-stroke: ${stroke}px ${fg};` : ''}
}
body *:not(img):not(svg):not(image) { color: inherit !important; background-color: transparent !important; border-color: currentColor; }
${fontStack ? `body *${notCode} { font-family: inherit !important; }` : ''}
body, p, li, blockquote, dd, dt, td, th, div, span { line-height: ${lineSpacing} !important; }
h1, h2, h3, h4, h5, h6 { line-height: 1.25 !important; letter-spacing: -0.005em; }
body a[href], body a[href] * { color: ${link} !important; text-decoration-color: ${link}66 !important; }
::selection { background-color: rgba(245, 181, 68, 0.35); }`
    }
  },
  methods: {
    updateSettings(settings) {
      const previousMargin = this.ereaderSettings.margin
      const previousSpread = this.ereaderSettings.spread
      this.ereaderSettings = { ...this.ereaderSettings, ...settings }

      if (!this.rendition) return

      this.applyTheme()

      const fontScale = this.ereaderSettings.fontScale || 100
      this.rendition.themes.fontSize(`${fontScale}%`)
      if (previousSpread !== this.ereaderSettings.spread) this.rendition.spread(this.ereaderSettings.spread || 'auto')
      if (previousMargin !== this.ereaderSettings.margin || previousSpread !== this.ereaderSettings.spread) this.$nextTick(this.resize)
    },
    goToPercentage(percentage) {
      if (!this.rendition?.manager || !this.locationsReady) return
      const cfi = this.book.locations.cfiFromPercentage(Math.min(1, Math.max(0, percentage)))
      if (cfi) return this.rendition.display(cfi)
    },
    prev() {
      if (!this.rendition?.manager) return
      return this.rendition?.prev()
    },
    next() {
      if (!this.rendition?.manager) return
      return this.rendition?.next()
    },
    goToChapter(href) {
      if (!this.rendition?.manager) return
      return this.rendition?.display(href)
    },
    /** @returns {object} Returns the chapter that the `position` in the book is in */
    findChapterFromPosition(chapters, position) {
      let foundChapter
      for (let i = 0; i < chapters.length; i++) {
        if (position >= chapters[i].start && (!chapters[i + 1] || position < chapters[i + 1].start)) {
          foundChapter = chapters[i]
          if (chapters[i].subitems && chapters[i].subitems.length > 0) {
            return this.findChapterFromPosition(chapters[i].subitems, position, foundChapter)
          }
          break
        }
      }
      return foundChapter
    },
    /** @returns {Array} Returns an array of chapters that only includes chapters with query results */
    async searchBook(query) {
      const chapters = structuredClone(await this.chapters)
      const searchResults = await Promise.all(this.book.spine.spineItems.map((item) => item.load(this.book.load.bind(this.book)).then(item.find.bind(item, query)).finally(item.unload.bind(item))))
      const mergedResults = [].concat(...searchResults)

      mergedResults.forEach((chapter) => {
        chapter.start = this.book.locations.percentageFromCfi(chapter.cfi)
        const foundChapter = this.findChapterFromPosition(chapters, chapter.start)
        if (foundChapter) foundChapter.searchResults.push(chapter)
      })

      let filteredResults = chapters.filter(function f(o) {
        if (o.searchResults.length) return true
        if (o.subitems.length) {
          return (o.subitems = o.subitems.filter(f)).length
        }
      })
      return filteredResults
    },
    keyUp(e) {
      const rtl = this.book.package.metadata.direction === 'rtl'
      if ((e.keyCode || e.which) == 37) {
        return rtl ? this.next() : this.prev()
      } else if ((e.keyCode || e.which) == 39) {
        return rtl ? this.prev() : this.next()
      }
    },
    /**
     * @param {object} payload
     * @param {string} payload.ebookLocation - CFI of the current location
     * @param {string} payload.ebookProgress - eBook Progress Percentage
     */
    updateProgress(payload) {
      if (!this.keepProgress) return
      this.$axios.$patch(`/api/me/progress/${this.libraryItemId}`, payload, { progress: false }).catch((error) => {
        console.error('EpubReader.updateProgress failed:', error)
      })
    },
    getAllEbookLocationData() {
      const locations = []
      let totalSize = 0 // Total in bytes

      for (const key in localStorage) {
        if (!localStorage.hasOwnProperty(key) || !key.startsWith('ebookLocations-')) {
          continue
        }

        try {
          const ebookLocations = JSON.parse(localStorage[key])
          if (!ebookLocations.locations) throw new Error('Invalid locations object')

          ebookLocations.key = key
          ebookLocations.size = (localStorage[key].length + key.length) * 2
          locations.push(ebookLocations)
          totalSize += ebookLocations.size
        } catch (error) {
          console.error('Failed to parse ebook locations', key, error)
          localStorage.removeItem(key)
        }
      }

      // Sort by oldest lastAccessed first
      locations.sort((a, b) => a.lastAccessed - b.lastAccessed)

      return {
        locations,
        totalSize
      }
    },
    /** @param {string} locationString */
    checkSaveLocations(locationString) {
      const maxSizeInBytes = 3000000 // Allow epub locations to take up to 3MB of space
      const newLocationsSize = JSON.stringify({ lastAccessed: Date.now(), locations: locationString }).length * 2

      // Too large overall
      if (newLocationsSize > maxSizeInBytes) {
        console.error('Epub locations are too large to store. Size =', newLocationsSize)
        return
      }

      const ebookLocationsData = this.getAllEbookLocationData()

      let availableSpace = maxSizeInBytes - ebookLocationsData.totalSize

      // Remove epub locations until there is room for locations
      while (availableSpace < newLocationsSize && ebookLocationsData.locations.length) {
        const oldestLocation = ebookLocationsData.locations.shift()
        console.log(`Removing cached locations for epub "${oldestLocation.key}" taking up ${oldestLocation.size} bytes`)
        availableSpace += oldestLocation.size
        localStorage.removeItem(oldestLocation.key)
      }

      console.log(`Cacheing epub locations with key "${this.localStorageLocationsKey}" taking up ${newLocationsSize} bytes`)
      this.saveLocations(locationString)
    },
    /** @param {string} locationString */
    saveLocations(locationString) {
      localStorage.setItem(
        this.localStorageLocationsKey,
        JSON.stringify({
          lastAccessed: Date.now(),
          locations: locationString
        })
      )
    },
    loadLocations() {
      const locationsObjString = localStorage.getItem(this.localStorageLocationsKey)
      if (!locationsObjString) return null

      const locationsObject = JSON.parse(locationsObjString)

      // Remove invalid location objects
      if (!locationsObject.locations) {
        console.error('Invalid epub locations stored', this.localStorageLocationsKey)
        localStorage.removeItem(this.localStorageLocationsKey)
        return null
      }

      // Update lastAccessed
      this.saveLocations(locationsObject.locations)

      return locationsObject.locations
    },
    /** Emit the current reading position to the reader chrome (progress, chapter, page) */
    emitLocation(location) {
      if (!location?.start) return
      this.atStart = !!location.atStart
      this.atEnd = !!location.atEnd
      let percentage = location.start.percentage || 0
      if (this.locationsReady) {
        const pct = this.book.locations.percentageFromCfi(location.start.cfi)
        if (typeof pct === 'number' && !isNaN(pct)) percentage = pct
      }
      let chapterTitle = ''
      try {
        chapterTitle = this.book.navigation?.get(location.start.href)?.label?.trim() || ''
      } catch {
        chapterTitle = ''
      }
      this.$emit('relocated', {
        percentage,
        href: location.start.href,
        page: location.start.displayed?.page || 0,
        total: location.start.displayed?.total || 0,
        chapterTitle
      })
    },
    /** @param {object} location - epub.js location of the new position */
    relocated(location) {
      this.lastLocation = location
      this.emitLocation(location)

      if (this.savedEbookLocation === location.start.cfi) {
        return
      }

      if (location.end.percentage) {
        this.updateProgress({
          ebookLocation: location.start.cfi,
          ebookProgress: location.end.percentage
        })
      } else {
        this.updateProgress({
          ebookLocation: location.start.cfi
        })
      }
    },
    initEpub() {
      /** @type {EpubReader} */
      const reader = this

      // Use axios to make request because we have token refresh logic in interceptor
      const customRequest = async (url) => {
        try {
          return this.$axios.$get(url, {
            responseType: 'arraybuffer'
          })
        } catch (error) {
          console.error('EpubReader.initEpub customRequest failed:', error)
          throw error
        }
      }

      /** @type {ePub.Book} */
      reader.book = new ePub(reader.ebookUrl, {
        openAs: 'epub',
        requestMethod: customRequest
      })

      /** @type {ePub.Rendition} */
      reader.rendition = reader.book.renderTo(this.$refs.viewer, {
        width: this.viewerWidth,
        height: this.viewerHeight,
        allowScriptedContent: this.allowScriptedContent,
        spread: this.ereaderSettings.spread || 'auto',
        snap: true,
        manager: 'continuous',
        flow: 'paginated'
      })

      // Theme every section as it is loaded (before first paint, so there's no white flash)
      reader.rendition.hooks.content.register((contents) => {
        contents.addStylesheetCss(this.themeCss, 'abs-reader-theme')
      })
      reader.rendition.themes.fontSize(`${this.ereaderSettings.fontScale || 100}%`)

      // load saved progress
      reader.rendition.display(this.savedEbookLocation || reader.book.locations.start)

      reader.book.ready
        .then(() => {
          // set up event listeners
          reader.rendition.on('relocated', reader.relocated)
          reader.rendition.on('keydown', reader.keyUp)

          reader.rendition.on('touchstart', (event) => {
            this.$emit('touchstart', event)
          })
          reader.rendition.on('touchend', (event) => {
            this.$emit('touchend', event)
          })
          reader.rendition.on('click', reader.handleTap)
          // Mouse moves inside the section iframe don't reach the reader shell; forward them so the
          // chrome can reveal itself when the pointer nears the top/bottom edge
          reader.rendition.on('mousemove', (e) => {
            const frameEl = e.view?.frameElement
            if (frameEl) this.$emit('pointer', { clientY: frameEl.getBoundingClientRect().top + e.clientY })
          })

          // load ebook cfi locations (needed for percentages, the scrubber and chapter starts)
          const savedLocations = this.loadLocations()
          if (savedLocations) {
            reader.book.locations.load(savedLocations)
            this.onLocationsReady()
          } else {
            reader.book.locations.generate(1600).then(() => {
              this.checkSaveLocations(reader.book.locations.save())
              this.onLocationsReady()
            })
            // Show the table of contents right away; starts are refined once locations exist
            this.getChapters()
          }
        })
        .catch((error) => {
          console.error('EpubReader.initEpub failed:', error)
        })
    },
    getChapters() {
      // Load the list of chapters in the book. See https://github.com/futurepress/epub.js/issues/759
      const toc = this.book?.navigation?.toc || []

      const tocTree = []

      const resolveURL = (url, relativeTo) => {
        // see https://github.com/futurepress/epub.js/issues/1084
        // HACK-ish: abuse the URL API a little to resolve the path
        // the base needs to be a valid URL, or it will throw a TypeError,
        // so we just set a random base URI and remove it later
        const base = 'https://example.invalid/'
        return new URL(url, base + relativeTo).href.replace(base, '')
      }

      const basePath = this.book.packaging.navPath || this.book.packaging.ncxPath

      const createTree = async (toc, parent) => {
        const promises = toc.map(async (tocItem, i) => {
          const href = resolveURL(tocItem.href, basePath)
          const id = href.split('#')[1]
          const item = this.book.spine.get(href)
          await item.load(this.book.load.bind(this.book))
          const el = id ? item.document.getElementById(id) : item.document.body

          const cfi = item.cfiFromElement(el)

          parent[i] = {
            title: tocItem.label.trim(),
            subitems: [],
            href,
            cfi,
            start: this.book.locations.percentageFromCfi(cfi),
            end: null, // set by flattenChapters()
            id: null, // set by flattenChapters()
            searchResults: []
          }

          if (tocItem.subitems) {
            await createTree(tocItem.subitems, parent[i].subitems)
          }
        })
        await Promise.all(promises)
      }
      return createTree(toc, tocTree).then(() => {
        this.chapters = tocTree
        this.$emit('chapters', tocTree)
      })
    },
    onLocationsReady() {
      this.locationsReady = true
      this.$emit('locations-ready')
      this.getChapters()
      if (this.lastLocation) this.emitLocation(this.lastLocation)
    },
    /**
     * Tap / click zones: left edge = previous page, right edge = next page, middle = toggle chrome.
     * Clicks arrive from inside the section iframe, so map them back to page coordinates.
     */
    handleTap(e) {
      if (!e || e.defaultPrevented) return
      const selection = e.view?.getSelection?.()
      if (selection && String(selection).trim().length) return
      if (e.target?.closest?.('a')) return

      const frameEl = e.view?.frameElement
      const wrapper = this.$refs.frame
      if (!frameEl || !wrapper) return
      const x = frameEl.getBoundingClientRect().left + e.clientX
      const rect = wrapper.getBoundingClientRect()
      const rel = (x - rect.left) / rect.width
      const rtl = this.book?.package?.metadata?.direction === 'rtl'
      if (rel < 0.25) return rtl ? this.next() : this.prev()
      if (rel > 0.75) return rtl ? this.prev() : this.next()
      this.$emit('toggle-chrome')
    },
    flattenChapters(chapters) {
      // Convert the nested epub chapters into something that looks like audiobook chapters for player-ui
      const unwrap = (chapters) => {
        return chapters.reduce((acc, chapter) => {
          return chapter.subitems ? [...acc, chapter, ...unwrap(chapter.subitems)] : [...acc, chapter]
        }, [])
      }
      let flattenedChapters = unwrap(chapters)

      flattenedChapters = flattenedChapters.sort((a, b) => a.start - b.start)
      for (let i = 0; i < flattenedChapters.length; i++) {
        flattenedChapters[i].id = i
        if (i < flattenedChapters.length - 1) {
          flattenedChapters[i].end = flattenedChapters[i + 1].start
        } else {
          flattenedChapters[i].end = 1
        }
      }
      return flattenedChapters
    },
    measure() {
      const frame = this.$refs.frame
      if (!frame) return
      this.frameWidth = frame.clientWidth
      this.frameHeight = frame.clientHeight
    },
    resize() {
      this.measure()
      if (!this.rendition?.manager) return
      // Keep the reader on the same location after reflowing
      const cfi = this.rendition.currentLocation()?.start?.cfi
      this.rendition.resize(this.viewerWidth, this.viewerHeight)
      if (cfi) this.rendition.display(cfi)
    },
    debouncedResize() {
      clearTimeout(this.resizeTimer)
      this.resizeTimer = setTimeout(this.resize, 120)
    },
    applyTheme() {
      if (!this.rendition) return
      this.rendition.getContents().forEach((c) => {
        c.addStylesheetCss(this.themeCss, 'abs-reader-theme')
      })
    }
  },
  mounted() {
    if (this.settings) this.ereaderSettings = { ...this.ereaderSettings, ...this.settings }
    this.measure()
    if (window.ResizeObserver) {
      this.resizeObserver = new ResizeObserver(() => this.debouncedResize())
      this.resizeObserver.observe(this.$refs.frame)
    } else {
      window.addEventListener('resize', this.debouncedResize)
    }
    this.initEpub()
  },
  beforeDestroy() {
    this.resizeObserver?.disconnect()
    window.removeEventListener('resize', this.debouncedResize)
    clearTimeout(this.resizeTimer)
    this.book?.destroy()
  }
}
</script>

<style>
.epub-reader #viewer {
  transition: width 0.2s ease;
}
.epub-edge-btn {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 3rem;
  height: 6rem;
  display: none;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  color: inherit;
  opacity: 0;
  transition:
    opacity 0.25s ease,
    background-color 0.2s ease;
}
@media (min-width: 640px) {
  .epub-edge-btn {
    display: flex;
  }
}
.group\/frame:hover .epub-edge-btn {
  opacity: 0.45;
}
.epub-edge-btn:hover {
  opacity: 0.95 !important;
  background-color: var(--reader-hover);
}
</style>
