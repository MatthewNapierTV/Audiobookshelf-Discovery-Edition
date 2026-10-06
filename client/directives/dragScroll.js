/**
 * v-drag-scroll: grab-and-drag a horizontal row with the mouse, with a little momentum on release.
 * Touch and pens keep the browser's native swipe scrolling. A drag never turns into a click on the card under it.
 */
const THRESHOLD = 6
const FRICTION = 0.92

function bind(el) {
  const state = { down: false, dragging: false, startX: 0, startLeft: 0, lastX: 0, lastT: 0, velocity: 0, raf: null, pointerId: null }

  const restore = () => {
    el.style.scrollBehavior = ''
    el.style.scrollSnapType = ''
    el.classList.remove('is-dragging')
  }
  const blockClick = (e) => {
    e.stopPropagation()
    e.preventDefault()
  }
  const onDown = (e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return
    cancelAnimationFrame(state.raf)
    restore()
    state.down = true
    state.dragging = false
    state.startX = state.lastX = e.clientX
    state.startLeft = el.scrollLeft
    state.lastT = performance.now()
    state.velocity = 0
    state.pointerId = e.pointerId
  }
  const onMove = (e) => {
    if (!state.down || e.pointerId !== state.pointerId) return
    const dx = e.clientX - state.startX
    if (!state.dragging) {
      if (Math.abs(dx) < THRESHOLD || el.scrollWidth <= el.clientWidth) return
      state.dragging = true
      // Smooth scrolling and snap points fight a hand-driven scroll position
      el.style.scrollBehavior = 'auto'
      el.style.scrollSnapType = 'none'
      el.classList.add('is-dragging')
      try {
        el.setPointerCapture(e.pointerId)
      } catch {}
    }
    e.preventDefault()
    el.scrollLeft = state.startLeft - dx
    const now = performance.now()
    const dt = Math.max(1, now - state.lastT)
    state.velocity = 0.8 * ((e.clientX - state.lastX) / dt) + 0.2 * state.velocity
    state.lastX = e.clientX
    state.lastT = now
  }
  const onUp = (e) => {
    if (!state.down || e.pointerId !== state.pointerId) return
    state.down = false
    if (!state.dragging) return
    state.dragging = false
    try {
      el.releasePointerCapture(e.pointerId)
    } catch {}
    // Swallow the click that follows the drag
    el.addEventListener('click', blockClick, { capture: true, once: true })
    setTimeout(() => el.removeEventListener('click', blockClick, { capture: true }), 0)
    // Glide to a stop
    let v = -state.velocity * 16
    if (performance.now() - state.lastT > 80) v = 0
    const step = () => {
      if (Math.abs(v) < 0.5) return restore()
      el.scrollLeft += v
      v *= FRICTION
      state.raf = requestAnimationFrame(step)
    }
    step()
  }
  const onDragStart = (e) => e.preventDefault() // no ghost images of covers/links

  el.addEventListener('pointerdown', onDown)
  el.addEventListener('pointermove', onMove)
  el.addEventListener('pointerup', onUp)
  el.addEventListener('pointercancel', onUp)
  el.addEventListener('dragstart', onDragStart)
  el.classList.add('drag-scroll')
  el._dragScroll = { onDown, onMove, onUp, onDragStart, state }
}

function unbind(el) {
  const h = el._dragScroll
  if (!h) return
  cancelAnimationFrame(h.state.raf)
  el.removeEventListener('pointerdown', h.onDown)
  el.removeEventListener('pointermove', h.onMove)
  el.removeEventListener('pointerup', h.onUp)
  el.removeEventListener('pointercancel', h.onUp)
  el.removeEventListener('dragstart', h.onDragStart)
  delete el._dragScroll
}

export default { inserted: bind, unbind }
