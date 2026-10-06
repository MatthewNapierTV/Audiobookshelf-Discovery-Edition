<template>
  <div>
    <button :aria-labelledby="labeledBy" :aria-label="label" role="checkbox" type="button" class="border rounded-full border-white/10 flex items-center cursor-pointer justify-start p-0.5 transition-colors duration-200" :style="{ width: buttonWidth + 'px' }" :aria-checked="toggleValue" :class="className" @click="clickToggle">
      <span class="rounded-full shadow-md transform transition-transform duration-200 ease-out" :style="switchStyle" :class="switchClassName"></span>
    </button>
  </div>
</template>

<script>
export default {
  props: {
    value: Boolean,
    onColor: {
      type: String,
      default: 'brand'
    },
    offColor: {
      type: String,
      default: 'surface-4'
    },
    disabled: Boolean,
    labeledBy: String,
    label: String,
    size: {
      type: String,
      default: 'md'
    }
  },
  computed: {
    toggleValue: {
      get() {
        return this.value
      },
      set(val) {
        this.$emit('input', val)
      }
    },
    className() {
      // Literal class names so Tailwind generates them (custom colors fall back to bg-<color>)
      const colorClasses = { brand: 'bg-brand', 'surface-4': 'bg-surface-4', success: 'bg-success', primary: 'bg-primary' }
      const color = this.toggleValue ? this.onColor : this.offColor
      const bg = colorClasses[color] || `bg-${color}`
      return this.disabled ? `${bg} opacity-60 cursor-not-allowed` : bg
    },
    switchClassName() {
      return this.disabled ? 'bg-gray-300' : 'bg-white'
    },
    switchStyle() {
      return {
        width: this.cursorHeightWidth + 'px',
        height: this.cursorHeightWidth + 'px',
        transform: this.toggleValue ? `translateX(${this.cursorHeightWidth}px)` : 'translateX(0)'
      }
    },
    cursorHeightWidth() {
      if (this.size === 'sm') return 16
      return 20
    },
    buttonWidth() {
      // two knob widths + padding (2px each side) + border (1px each side)
      return this.cursorHeightWidth * 2 + 6
    }
  },
  methods: {
    clickToggle() {
      if (this.disabled) return
      this.toggleValue = !this.toggleValue
    }
  }
}
</script>