import { useEffect, useRef } from 'react'

// iOS-style scroll-snap number picker (vertical or horizontal) - the
// currently-centered item is the selected value, highlighted larger/lime;
// everything else dims. No new dependency - pure scroll-snap CSS + a scroll
// listener that rounds the settled scroll position back to the nearest item.
const ITEM_SIZE = 44

export default function WheelPicker({ values, value, onChange, orientation = 'vertical', formatValue, trackClassName = '' }) {
  const containerRef = useRef(null)
  const scrollTimeoutRef = useRef(null)
  const programmaticRef = useRef(false)
  const isVertical = orientation === 'vertical'

  const index = Math.max(0, values.indexOf(value))

  // Scroll to match `value` whenever it changes from outside this picker's
  // own scroll handler (initial load, unit-toggle conversion, direct click).
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    programmaticRef.current = true
    const target = index * ITEM_SIZE
    if (isVertical) el.scrollTop = target
    else el.scrollLeft = target
    const t = setTimeout(() => {
      programmaticRef.current = false
    }, 80)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, isVertical])

  function handleScroll() {
    if (programmaticRef.current) return
    clearTimeout(scrollTimeoutRef.current)
    // Debounced - only commit once the scroll has actually settled, so a
    // fast fling doesn't fire onChange for every frame it passes through.
    scrollTimeoutRef.current = setTimeout(() => {
      const el = containerRef.current
      if (!el) return
      const pos = isVertical ? el.scrollTop : el.scrollLeft
      const nextIndex = Math.min(values.length - 1, Math.max(0, Math.round(pos / ITEM_SIZE)))
      if (values[nextIndex] !== value) onChange(values[nextIndex])
    }, 90)
  }

  const centerPad = `calc(50% - ${ITEM_SIZE / 2}px)`

  return (
    <div className={`relative ${isVertical ? 'h-[198px] w-28' : 'h-14 w-full'}`}>
      <div
        className="absolute pointer-events-none border-coral-500/40 rounded-lg"
        style={
          isVertical
            ? { left: 0, right: 0, top: '50%', height: ITEM_SIZE, transform: 'translateY(-50%)', borderTopWidth: 1, borderBottomWidth: 1 }
            : { top: 0, bottom: 0, left: '50%', width: ITEM_SIZE, transform: 'translateX(-50%)', borderLeftWidth: 1, borderRightWidth: 1 }
        }
      />
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className={`no-scrollbar h-full w-full ${isVertical ? 'overflow-y-scroll overflow-x-hidden' : 'overflow-x-scroll overflow-y-hidden flex'} ${trackClassName}`}
        style={{
          scrollSnapType: isVertical ? 'y mandatory' : 'x mandatory',
          paddingTop: isVertical ? centerPad : 0,
          paddingBottom: isVertical ? centerPad : 0,
          paddingLeft: isVertical ? 0 : centerPad,
          paddingRight: isVertical ? 0 : centerPad,
        }}
      >
        {values.map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v)}
            className={`flex items-center justify-center shrink-0 tabular-nums transition-all ${
              v === value ? 'text-coral-400 font-heading font-bold text-2xl' : 'text-slate-500 text-base'
            }`}
            style={{
              scrollSnapAlign: 'center',
              height: isVertical ? ITEM_SIZE : '100%',
              width: isVertical ? '100%' : ITEM_SIZE,
            }}
          >
            {formatValue ? formatValue(v) : v}
          </button>
        ))}
      </div>
    </div>
  )
}
