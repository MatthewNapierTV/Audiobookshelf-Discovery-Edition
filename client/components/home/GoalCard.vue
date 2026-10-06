<template>
  <div v-if="goals" class="goal-card surface-card bg-surface-2/75 backdrop-blur-xl shrink-0 w-full sm:w-80 p-5 flex flex-col">
    <div class="flex items-center justify-between mb-3">
      <p class="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-gray-400">{{ $strings.HeaderDailyGoal }}</p>
      <button type="button" class="text-xs text-gray-400 hover:text-white flex items-center gap-0.5" @click="editing = !editing"><span class="material-symbols text-sm">tune</span>{{ goals.goalMinutes }} min</button>
    </div>

    <div v-if="editing" class="flex flex-wrap gap-1.5 mb-3">
      <button v-for="m in presets" :key="m" type="button" class="px-2.5 py-1 rounded-full text-xs border transition-colors" :class="m === goals.goalMinutes ? 'border-brand text-brand' : 'border-white/10 text-gray-300 hover:border-white/30'" @click="setGoal(m)">{{ m }} min</button>
    </div>

    <div class="flex items-center gap-5">
      <!-- Progress ring -->
      <div class="relative w-24 h-24 shrink-0">
        <svg viewBox="0 0 100 100" class="w-full h-full -rotate-90">
          <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="9" />
          <circle cx="50" cy="50" r="42" fill="none" stroke="url(#goalGradient)" stroke-width="9" stroke-linecap="round" :stroke-dasharray="circumference" :stroke-dashoffset="circumference * (1 - ratio)" class="transition-[stroke-dashoffset] duration-700 ease-out" />
          <defs>
            <linearGradient id="goalGradient" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stop-color="#7fe3ff" />
              <stop offset="100%" stop-color="#19c8f5" />
            </linearGradient>
          </defs>
        </svg>
        <div class="absolute inset-0 flex flex-col items-center justify-center">
          <span class="text-2xl font-bold leading-none tabular-nums">{{ goals.today.minutes }}</span>
          <span class="text-[0.65rem] text-gray-400 mt-0.5">of {{ goals.goalMinutes }} min</span>
        </div>
      </div>

      <div class="min-w-0">
        <p class="text-sm font-semibold leading-snug">{{ headline }}</p>
        <p class="text-xs text-gray-400 mt-1 flex items-center gap-1">
          <span class="material-symbols text-base fill" :class="goals.streak.current ? 'text-orange-400' : 'text-gray-500'">local_fire_department</span>
          {{ $getString('LabelStreakDays', [goals.streak.current]) }}
        </p>
        <p class="text-[0.7rem] text-gray-500 mt-0.5">{{ $getString('LabelBestStreak', [goals.streak.best]) }}</p>
      </div>
    </div>

    <!-- Last 7 days -->
    <div class="mt-4 grid grid-cols-7 gap-1.5 items-end h-14">
      <div v-for="day in goals.last7" :key="day.date" class="flex flex-col items-center gap-1 h-full justify-end" :title="`${day.date}: ${day.minutes} min`">
        <div class="w-full rounded-sm transition-all" :class="day.minutes >= goals.goalMinutes ? 'bg-brand' : 'bg-white/15'" :style="{ height: Math.max(6, Math.min(100, (day.minutes / goals.goalMinutes) * 100)) + '%' }" />
        <span class="text-[0.6rem] text-gray-500">{{ weekday(day.date) }}</span>
      </div>
    </div>
    <p class="text-[0.7rem] text-gray-500 mt-2">{{ $getString('LabelGoalBreakdown', [goals.today.listeningMinutes, goals.today.readingMinutes]) }}</p>
  </div>
</template>

<script>
export default {
  data() {
    return {
      goals: null,
      editing: false,
      presets: [5, 15, 30, 45, 60, 90],
      circumference: 2 * Math.PI * 42
    }
  },
  computed: {
    ratio() {
      if (!this.goals) return 0
      return Math.min(1, this.goals.today.minutes / this.goals.goalMinutes)
    },
    headline() {
      if (!this.goals) return ''
      if (this.ratio >= 1) return this.$strings.MessageGoalReached
      if (this.goals.today.minutes === 0) return this.$strings.MessageGoalStart
      return this.$getString('MessageGoalRemaining', [this.goals.goalMinutes - this.goals.today.minutes])
    }
  },
  methods: {
    weekday(dateKey) {
      const [y, m, d] = dateKey.split('-').map(Number)
      return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'narrow' })
    },
    async load() {
      this.goals = await this.$axios.$get('/api/me/goals').catch((error) => {
        console.error('Failed to load goals', error)
        return null
      })
    },
    async setGoal(minutes) {
      await this.$axios.$patch('/api/me/goals', { goalMinutes: minutes }).catch((error) => console.error('Failed to set goal', error))
      this.editing = false
      this.load()
    }
  },
  mounted() {
    this.load()
  }
}
</script>
