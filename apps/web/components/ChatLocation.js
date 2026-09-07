"use client"
import { memo, useEffect, useRef, useState } from 'react'
import { isGenericLocationLabel, resolvePlaceName } from '../lib/location'

export default memo(function ChatLocation({ latitude, longitude, locationLabel, isMine }) {
  const container = useRef(null)
  const [place, setPlace] = useState('')
  const [loading, setLoading] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let active = true
    setPlace(''); setFailed(false)
    if (!isGenericLocationLabel(locationLabel)) { setPlace(locationLabel); return }
    async function lookup() {
      setLoading(true)
      const name = await resolvePlaceName(latitude, longitude)
      if (!active) return
      setPlace(isGenericLocationLabel(name) ? '' : name)
      setFailed(isGenericLocationLabel(name))
      setLoading(false)
    }
    // History can contain thousands of locations. Only resolve those on screen.
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { observer.disconnect(); lookup() }
    })
    if (container.current) observer.observe(container.current)
    return () => { active = false; observer.disconnect() }
  }, [latitude, longitude, locationLabel, attempt])
  return <div ref={container} className={`mt-2 rounded-2xl px-3 py-2 text-white ${isMine ? 'bg-white/10' : 'bg-black/20'}`}>
    <a href={`https://www.google.com/maps?q=${latitude},${longitude}`} target="_blank" rel="noreferrer" className="block">
      <div className="text-xs font-black">📍 Live location</div>
      <div className="mt-0.5 break-words text-[11px] font-semibold leading-4 opacity-80">{place || (loading ? 'Finding place name…' : 'View exact location on map')}</div>
    </a>
    {failed && <button type="button" disabled={loading} onClick={() => setAttempt(value => value + 1)} className="mt-1 text-[11px] underline">Place name unavailable. Retry shortly</button>}
    {place && <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="mt-1 block text-[9px] opacity-60">Place data © OpenStreetMap</a>}
  </div>
})
