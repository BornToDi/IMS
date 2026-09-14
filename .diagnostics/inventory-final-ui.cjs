const fs=require('fs');
const file='apps/web/components/inventory/InventoryApp.js';
let text=fs.readFileSync(file,'utf8');
const pairs=[
  ["const counts = summary?.counts || {}", "const counts = summary?.counts || {}\n  const bulkAllowed = summary?.actions.some(a => ['RESERVE','DELIVER','TRANSFER','RETURN','RESTOCK'].includes(a))"],
  ['<div className={s.toolbar}><label className={s.actions}><input type="checkbox" aria-label="Select all devices on this page"', '{bulkAllowed && <div className={s.toolbar}><label className={s.actions}><input type="checkbox" aria-label="Select all devices on this page"'],
  ['Apply to selected</button></div><div className={s.tableScroll} aria-busy={listLoading}>','Apply to selected</button></div>}<div className={s.tableScroll} aria-busy={listLoading}>'],
  ['<td><input type="checkbox" aria-label={`Select ${row.serialNumber}`}','<td>{bulkAllowed && <input type="checkbox" aria-label={`Select ${row.serialNumber}`}'],
  ['ids.filter(id => id !== row.id))}/><button','ids.filter(id => id !== row.id))}/>}<button'],
  ['{summary.alerts.lowStock && <div className={s.alert}>','{counts.RECEIVED > 0 && <div className={s.alert}><Icon name="check"/><div><strong>{counts.RECEIVED} POS awaiting verification</strong><div className={s.small}>Check imported details and physical stock before allocation.</div></div><button className={s.button} onClick={() => view({status:"RECEIVED"})}>View</button></div>}{summary.alerts.lowStock && <div className={s.alert}>'],
  ["{!summary.alerts.lowStock && !Object.entries(summary.alerts)","{!counts.RECEIVED && !summary.alerts.lowStock && !Object.entries(summary.alerts)"]
];
for(const [before,after] of pairs){if(!text.includes(before))throw new Error('Missing anchor: '+before);text=text.replace(before,after);}
fs.writeFileSync(file,text);
