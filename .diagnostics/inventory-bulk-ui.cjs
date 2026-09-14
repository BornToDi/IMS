const fs = require('fs');
const file = 'apps/web/components/inventory/InventoryApp.js';
let source = fs.readFileSync(file, 'utf8');
const replacements = [
  ["const [extra, setExtra] = useState(false)", "const [extra, setExtra] = useState(false)\n  const [selected, setSelected] = useState([])\n  const [bulkAction, setBulkAction] = useState('')"],
  ["useEffect(() => { loadList() }, [loadList])", "useEffect(() => { loadList(); setSelected([]) }, [loadList])"],
  ["function saved(message) { setModal(null);", "function saved(message) { setSelected([]); setModal(null);"],
  ['<div className={s.tableScroll} aria-busy={listLoading}>', `<div className={s.toolbar}><label className={s.actions}><input type="checkbox" aria-label="Select all devices on this page" checked={data.rows.length > 0 && data.rows.every(r => selected.includes(r.id))} onChange={e => setSelected(e.target.checked ? data.rows.map(r => r.id) : [])}/>Select page</label><span className={s.sub}>{selected.length} selected</span><select className={s.input + ' ' + s.select} aria-label="Bulk movement" value={bulkAction} onChange={e => setBulkAction(e.target.value)}><option value="">Stock movement</option>{['RESERVE','DELIVER','TRANSFER','RETURN','RESTOCK'].filter(a => summary.actions.includes(a)).map(a => <option key={a} value={a}>{label(a)}</option>)}</select><button className={s.button} disabled={!selected.length || !bulkAction || listLoading} onClick={() => { const devices = data.rows.filter(r => selected.includes(r.id)); setModal({ action:bulkAction, device:devices[0], devices }) }}>Apply to selected</button></div><div className={s.tableScroll} aria-busy={listLoading}>`],
  ['<tr key={row.id}><td><button', '<tr key={row.id}><td><input type="checkbox" aria-label={`Select ${row.serialNumber}`} style={{marginRight:9}} checked={selected.includes(row.id)} onChange={e => setSelected(ids => e.target.checked ? [...ids,row.id] : ids.filter(id => id !== row.id))}/><button'],
  ['<DeviceForm action={modal.action} device={modal.device}', '<DeviceForm action={modal.action} devices={modal.devices} device={modal.device}']
];
for (const [before,after] of replacements) {
  if (!source.includes(before)) throw new Error('Missing edit anchor: ' + before);
  source = source.replace(before,after);
}
fs.writeFileSync(file,source);
