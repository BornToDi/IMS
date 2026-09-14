"use client"
import { useEffect, useRef } from 'react'
import { useAuthStore } from '../../store/useAuthStore'
import styles from './Inventory.module.css'
export const s = styles
export const label = v => String(v || '').toLowerCase().replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase()).replace(/\b(Pos|Mpos|Rma|Tid|Mid)\b/g, word => ({Pos:'POS',Mpos:'mPOS',Rma:'RMA',Tid:'TID',Mid:'MID'}[word]))
export const day = v => v ? new Date(v).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
export const dateValue = v => v ? String(v).slice(0, 10) : ''
export function Icon({ name = 'box', size = 18 }) {
  const paths = { box: 'm12 3 9 5-9 5-9-5 9-5Zm-9 5v9l9 5 9-5V8M12 13v9m-4.5-16.5 9 5', search: 'm21 21-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0', plus: 'M12 5v14M5 12h14', arrow: 'M4 12h16m-6-6 6 6-6 6', chart: 'M4 20h16M7 16v-4m5 4V5m5 11V9', check: 'm5 12 4 4L19 6', clock: 'M12 8v5l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0', download: 'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5', close: 'm6 6 12 12M6 18 18 6', filter: 'M3 5h18M6 12h12M10 19h4', bank: 'm3 8 9-5 9 5H3Zm2 3v7m7-7v7m7-7v7M3 21h18', tool: 'm14 6 4 4 4-4c1 6-4 9-8 7l-7 8-4-4 8-7c-2-5 2-9 7-8l-4 4Z', file: 'M14 2H5v20h14V7l-5-5Zm0 0v6h5M8 13h8M8 17h5', refresh: 'M20 7v5h-5M4 17v-5h5M6 6a8 8 0 0 1 14 6M4 12a8 8 0 0 0 14 6' }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name] || paths.box}/></svg>
}
export function Badge({ value }) {
  const tone = ['IN_STOCK', 'DEPLOYED', 'REPAIRED', 'ACTIVE'].includes(value) ? s.green : ['FAULTY', 'SCRAPPED', 'INACTIVE'].includes(value) ? s.red : ['UNDER_REPAIR', 'REPLACED', 'RESERVED'].includes(value) ? s.amber : s.blue
  return <span className={`${s.badge} ${tone}`}>{label(value)}</span>
}
export function Empty({ title, children }) { return <div className={s.empty}><Icon size={34}/><strong>{title}</strong><div>{children}</div></div> }
export function Field({ name, title, value, onChange, type = 'text', options, required, wide, ...rest }) {
  return <label className={`${s.field} ${wide ? s.wide : ''}`}><span>{title || label(name)}{required ? ' *' : ''}</span>{options ? <select className={s.input} name={name} value={value ?? ''} onChange={onChange} required={required} {...rest}><option value="">Select {String(title || label(name)).toLowerCase()}</option>{options.map(o => <option key={typeof o === 'string' ? o : o.value} value={typeof o === 'string' ? o : o.value}>{typeof o === 'string' ? label(o) : o.label}</option>)}</select> : type === 'textarea' ? <textarea className={s.input} name={name} value={value ?? ''} onChange={onChange} required={required} {...rest}/> : <input className={s.input} name={name} type={type} value={value ?? ''} onChange={onChange} required={required} {...rest}/>}</label>
}
export function Modal({ title, children, onClose, footer, busy }) {
  const ref = useRef(null)
  useEffect(() => { const el = ref.current; el.showModal(); const previous = document.body.style.overflow; document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = previous; el.close() } }, [])
  return <dialog ref={ref} className={`${s.dialog} ${s.shell}`} aria-labelledby="inventory-dialog-title" onCancel={e => { e.preventDefault(); if (!busy) onClose() }} onClick={e => { if (e.target === e.currentTarget && !busy) { const b = e.currentTarget.getBoundingClientRect(); if (e.clientX < b.left || e.clientX > b.right || e.clientY < b.top || e.clientY > b.bottom) onClose() } }}><div className={s.dialogHeader}><h2 id="inventory-dialog-title">{title}</h2><button className={s.button} onClick={onClose} disabled={busy} aria-label="Close dialog"><Icon name="close"/></button></div><div className={s.dialogBody}>{children}</div>{footer && <div className={s.dialogFooter}>{footer}</div>}</dialog>
}
export async function downloadFile(path, token, filename) {
  const request = accessToken => fetch(path, { credentials: 'include', headers: { Authorization: `Bearer ${accessToken}` } })
  let response = await request(token)
  if (response.status === 401) { const refreshed = await useAuthStore.getState().refreshAccessToken(); if (refreshed) response = await request(refreshed) }
  if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.error || 'Download failed') }
  const url = URL.createObjectURL(await response.blob()); const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 10000)
}
