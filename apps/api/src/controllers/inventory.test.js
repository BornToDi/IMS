const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { DatabaseSync } = require('node:sqlite');
const express = require('express');

const root = path.resolve(__dirname, '../../../..');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pos-inventory-test-'));
const dbPath = path.join(directory, 'inventory.db');
process.env.DATABASE_URL = `file:${dbPath.replaceAll('\\','/')}`;
process.env.JWT_ACCESS_SECRET = 'inventory-test-only-secret';
const schema = execFileSync(process.execPath, [path.join(root, 'node_modules/prisma/build/index.js'), 'migrate', 'diff', '--from-empty', '--to-schema-datamodel', path.join(root, 'apps/api/prisma/schema.prisma'), '--script'], { encoding: 'utf8' });
const db = new DatabaseSync(dbPath); db.exec(schema); db.close();
const prisma = require('../prismaClient');
const { signAccess } = require('../utils/jwt');
const app = express();
app.use(express.json());
app.use('/api/hardware', require('../routes/hardware'));
app.use((err, req, res, next) => res.status(err.status || 500).json({ error: err.message }));
let server, base, admin, store, engineer, operations, manager, bankUser, otherBankUser, bank, secondBank;
const today = new Date().toISOString().slice(0,10);
const due = new Date(Date.now() + 86400000 * 10).toISOString().slice(0,10);
async function request(url, { user = admin, body, method = body ? 'POST' : 'GET', raw = false } = {}) {
  const response = await fetch(base + url, { method, headers: { ...(user ? { Authorization: `Bearer ${signAccess({ userId: user.id })}` } : {}), ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}) }, body: body ? body instanceof FormData ? body : JSON.stringify(body) : undefined });
  return { status: response.status, body: raw ? Buffer.from(await response.arrayBuffer()) : await response.json(), headers: response.headers };
}
async function receive(serials, extra = {}, user = admin) {
  return request('/stock-in', { user, body: { serialNumbers: serials, brand: 'PAX', model: 'A920', supplier: 'Test OEM', location: 'Warehouse A', reference: 'PO-001', receivedBy: 'Store officer', occurredAt: today, ...extra } });
}
async function action(device, action, extra = {}, user = admin) {
  return request(`/${device.id}/actions`, { user, body: { action, version: device.version, occurredAt: today, ...extra } });
}
async function get(id, user = admin) { return request(`/${id}`, { user }); }
async function deployed(serial) {
  const received = await receive([serial]); assert.equal(received.status, 201);
  const delivered = await action(received.body.rows[0], 'DELIVER', { bankId: bank.id, location: 'Bank depot', reference: 'CH-001', deliveredBy: 'Driver', receivedBy: 'Bank officer', dueDate: due }); assert.equal(delivered.status, 200, JSON.stringify(delivered.body));
  const result = await action(delivered.body, 'DEPLOY', { bankId: bank.id, location: 'Merchant store', merchant: 'Test merchant', tid: `T-${serial}`, mid: 'MID-1', address: 'Dhaka', engineer: 'Engineer A' }); assert.equal(result.status, 200, JSON.stringify(result.body));
  return result.body;
}
test.before(async () => {
  async function user(name, userRole, extra = {}) { return prisma.user.create({ data: { name, email: `${name}@inventory.test`, userRole, passwordHash: 'not-used', ...extra } }); }
  admin = await user('admin','ADMIN'); store = await user('store','ASSISTANT'); engineer = await user('engineer','EMPLOYEE'); operations = await user('operations','EMPLOYEE',{inventoryRole:'OPERATIONS'}); manager = await user('manager','MANAGEMENT');
  bank = await prisma.bankMaster.create({ data:{name:'Bank Alpha'} }); secondBank = await prisma.bankMaster.create({data:{name:'Bank Beta'}});
  bankUser = await user('bank','BANK',{bankName:bank.name}); otherBankUser = await user('other-bank','BANK',{bankName:secondBank.name});
  server = app.listen(0,'127.0.0.1'); await new Promise(resolve => server.once('listening',resolve)); base = `http://127.0.0.1:${server.address().port}/api/hardware`;
});
test.after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  await prisma.$disconnect();
  const resolved = path.resolve(directory);
  assert.ok(resolved.startsWith(path.join(path.resolve(os.tmpdir()),'pos-inventory-test-')));
  fs.rmSync(resolved, {recursive:true,force:true});
});

test('receipt validates duplicates, dates, quantities and rolls back the whole receipt', async () => {
  assert.equal((await request('/summary',{user:null})).status,401);
  assert.equal((await receive(['POS-A','pos-a'])).status,400);
  assert.equal((await receive(['POS-A'],{purchaseDate:'2026-02-30'})).status,400);
  assert.equal((await receive(['POS-A'],{purchaseDate:'2026-05-01',warrantyUntil:'2026-04-01'})).status,400);
  assert.equal((await receive(['POS-A'],{occurredAt:'2099-01-01'})).status,400);
  assert.equal((await receive(['pos-a'],{},store)).status,201);
  const result = await receive(['POS-B','pos-a']); assert.equal(result.status,409);
  assert.equal(await prisma.inventoryDevice.count({where:{serialNumber:'POS-B'}}),0);
  assert.equal(await prisma.inventoryEvent.count({where:{device:{serialNumber:'POS-A'}}}),1);
});
test('management and bank are read-only; store, operations and technician actions are scoped', async () => {
  for (const user of [manager,bankUser,engineer,operations]) assert.equal((await receive([`DENIED-${user.id}`],{},user)).status,403);
  const device = (await receive(['ROLE-POS'])).body.rows[0];
  assert.equal((await action(device,'EDIT',{brand:'Other'},manager)).status,403);
  assert.equal((await action(device,'FAULT',{faultType:'Display'},store)).status,403);
  assert.equal((await action(device,'FAULT',{faultType:'Display'},engineer)).status,200);
  assert.equal((await request('/settings',{user:store})).status,403);
  assert.equal((await request('/banks',{user:manager,body:{name:'Not allowed'}})).status,403);
  assert.equal((await request('/settings',{method:'PUT',body:{userId:manager.id,inventoryRole:'STORE'}})).status,400);
});
test('delivery, deployment, transfer and return retain one position with full history', async () => {
  let device = (await receive(['LIFECYCLE'])).body.rows[0];
  assert.equal((await action(device,'DEPLOY',{bankId:bank.id})).status,409);
  let result = await action(device,'RESERVE',{bankId:bank.id,dueDate:due}); assert.equal(result.status,200); device=result.body;
  assert.equal((await action(device,'DELIVER',{bankId:secondBank.id,location:'Another bank',reference:'CH',deliveredBy:'A',receivedBy:'B',dueDate:due})).status,409);
  result = await action(device,'DELIVER',{bankId:bank.id,location:'Branch',reference:'CH',deliveredBy:'A',receivedBy:'B',dueDate:due}); assert.equal(result.status,200); device=result.body;
  result = await action(device,'DEPLOY',{bankId:bank.id,location:'Merchant A',merchant:'Merchant A',tid:'TID-L',mid:'MID',address:'Dhaka',engineer:'Engineer'}); assert.equal(result.status,200); device=result.body;
  result = await action(device,'TRANSFER',{location:'Merchant B',merchant:'Merchant B',tid:'TID-B',mid:'MID-B',address:'Chattogram',engineer:'Engineer',remarks:'Merchant relocated'}); assert.equal(result.status,200); device=result.body;
  const detail = await get(device.id); assert.equal(detail.body.events.length,5); assert.equal(detail.body.location,'Merchant B');
  assert.ok(detail.body.events.every(e => e.actorName && e.createdAt && e.details));
  result = await action(device,'RETURN',{location:'Warehouse B',receivedBy:'Store',remarks:'Bank return'}); assert.equal(result.status,200); device=result.body;
  assert.equal(device.bankId,null); assert.equal(device.tid,null); assert.equal(device.merchant,null);
  result = await action(device,'RESTOCK',{location:'Warehouse B'}); assert.equal(result.status,200); assert.equal(result.body.status,'IN_STOCK');
});
test('stale edits and duplicate active TIDs are rejected without adding history', async () => {
  const device = await deployed('VERSION');
  const first = await action(device,'EDIT',{remarks:'First save'}); assert.equal(first.status,200);
  assert.equal((await action(device,'EDIT',{remarks:'Stale overwrite'})).status,409);
  const next = (await receive(['TID-DUPLICATE'])).body.rows[0];
  const delivered = await action(next,'DELIVER',{bankId:bank.id,location:'Bank',reference:'CH',deliveredBy:'A',receivedBy:'B',dueDate:due});
  assert.equal((await action(delivered.body,'DEPLOY',{bankId:bank.id,location:'Other shop',merchant:'Other',tid:'T-VERSION',mid:'MID',address:'Dhaka',engineer:'A'})).status,409);
  assert.equal((await get(device.id)).body.remarks,'First save');
});
test('returning faulty stock never makes it available before repair', async () => {
  let device = (await receive(['RETURNED-FAULT'])).body.rows[0];
  device = (await action(device,'FAULT',{faultType:'Card reader'})).body;
  device = (await action(device,'RETURN',{location:'Warehouse',receivedBy:'Store',remarks:'Returned faulty'})).body;
  assert.equal((await action(device,'RESTOCK',{location:'Warehouse'})).status,409);
  let result = await action(device,'REPAIR',{technician:'Technician',location:'Lab'}); assert.equal(result.status,200); device=result.body;
  device = (await action(device,'REPAIR_COMPLETE',{remarks:'Fixed reader',repairCost:50})).body;
  assert.equal((await action(device,'RESTOCK',{location:'Warehouse'})).status,200);
  assert.ok((await request('/reports?type=return')).body.rows.some(r=>r.Serial==='RETURNED-FAULT'));
});
test('replacement links both serials atomically and requires confirmation before old-device repair', async () => {
  const original = await deployed('OLD-POS');
  const faulty = (await action(original,'FAULT',{faultType:'Power failure'})).body;
  const spare = (await receive(['SPARE-POS'])).body.rows[0];
  assert.equal((await action(faulty,'REPLACE',{replacementSerial:'MISSING',location:'Merchant store',engineer:'A',remarks:'Replacement',dueDate:due})).status,409);
  assert.equal((await get(faulty.id)).body.status,'FAULTY');
  const replaced = await action(faulty,'REPLACE',{replacementSerial:spare.serialNumber,location:'Merchant store',engineer:'A',remarks:'Replacement',dueDate:due}); assert.equal(replaced.status,200,JSON.stringify(replaced.body));
  const spareDetail=(await get(spare.id)).body;
  assert.equal(spareDetail.status,'DEPLOYED'); assert.equal(spareDetail.tid,original.tid); assert.equal(spareDetail.replacementSerial,'OLD-POS'); assert.equal(spareDetail.events[0].action,'REPLACEMENT_ISSUED');
  assert.equal(replaced.body.pendingReturn,true);
  assert.equal((await action(replaced.body,'REPAIR',{technician:'Vendor',location:'Lab'})).status,409);
  const confirmed = (await action(replaced.body,'CONFIRM_RETURN',{receivedBy:'Store',location:'Lab'})).body; assert.equal(confirmed.pendingReturn,false);
  let repair = await action(confirmed,'REPAIR',{technician:'Vendor',location:'Lab'}); assert.equal(repair.status,200);
  assert.equal((await action(repair.body,'REPAIR_UPDATE',{technician:'Vendor',repairStatus:'REPAIRING',repairCost:-1})).status,400);
  repair = await action(repair.body,'REPAIR_COMPLETE',{repairCost:1500,remarks:'Replaced battery'}); assert.equal(repair.status,200); assert.equal(repair.body.repairCost,1500); assert.ok(repair.body.repairReturnDate);
});
test('bulk movements are atomic when any serial has a stale version', async () => {
  const rows = (await receive(['BULK-1','BULK-2'])).body.rows;
  const payload = { action:'RESERVE',devices:rows.map(d=>({id:d.id,version:d.version})),bankId:bank.id,dueDate:due };
  payload.devices[1].version=99;
  assert.equal((await request('/actions',{body:payload})).status,409);
  assert.equal((await get(rows[0].id)).body.status,'IN_STOCK');
  payload.devices[1].version=0;
  const result=await request('/actions',{body:payload}); assert.equal(result.status,200); assert.equal(result.body.quantity,2);
});
test('bank queries, detail and exports cannot access another bank or internal costs', async () => {
  const device=await deployed('BANK-SCOPE');
  assert.equal((await get(device.id,otherBankUser)).status,404);
  const own=await get(device.id,bankUser); assert.equal(own.status,200); assert.equal(own.body.repairCost,undefined); assert.ok(own.body.events.every(e=>e.details===undefined));
  const filtered=await request(`/?bankId=${bank.id}`,{user:otherBankUser}); assert.equal(filtered.body.total,0);
  const list=await request('/',{user:bankUser}); assert.ok(list.body.rows.every(r=>r.bankId===bank.id && r.repairCost===undefined));
  const report=await request('/reports?type=stock',{user:bankUser}); assert.ok(report.body.rows.every(r=>r.Bank===bank.name && r.RepairCost===undefined));
});
test('documents are validated, authenticated and preserved in history', async () => {
  const device=await deployed('DOC-POS');
  const invalid=new FormData(); invalid.append('category','INVOICE'); invalid.append('file',new Blob(['<script>bad</script>'],{type:'application/pdf'}),'fake.pdf');
  assert.equal((await request(`/${device.id}/documents`,{body:invalid})).status,400);
  const valid=new FormData(); valid.append('category','DELIVERY_CHALLAN'); valid.append('file',new Blob(['%PDF-1.4\n test fixture'],{type:'application/pdf'}),'challan.pdf');
  const uploaded=await request(`/${device.id}/documents`,{body:valid}); assert.equal(uploaded.status,201);
  const file=await request(`/documents/${uploaded.body.id}`,{raw:true}); assert.equal(file.status,200); assert.equal(file.body.subarray(0,5).toString(),'%PDF-');
  assert.equal((await request(`/documents/${uploaded.body.id}`,{user:bankUser})).status,403);
  assert.equal((await get(device.id)).body.documents.length,1);
});
test('archive preserves retired serials and immutable history; bank edits are audited', async () => {
  let device=(await receive(['ARCHIVE'])).body.rows[0];
  assert.equal((await action(device,'ARCHIVE',{remarks:'Remove'})).status,409);
  device=(await action(device,'SCRAP',{remarks:'End of life'})).body;
  device=(await action(device,'ARCHIVE',{remarks:'Retired inventory'})).body;
  assert.equal(device.archived,true); assert.equal((await get(device.id)).body.events.length,3);
  assert.equal((await action(device,'EDIT',{remarks:'overwrite'})).status,409);
  assert.equal((await receive(['archive'])).status,409);
  const archived=await request('/?archived=true'); assert.ok(archived.body.rows.some(r=>r.id===device.id));
  const edited=await request(`/banks/${bank.id}`,{method:'PUT',body:{name:'Bank Alpha renamed',contactPerson:'Contact',active:false}}); assert.equal(edited.status,200);
  assert.equal((await request('/reports?type=audit')).body.rows.some(r=>r.Action==='BANK_EDIT'),true);
  assert.equal((await prisma.user.findUnique({where:{id:bankUser.id}})).bankName,'Bank Alpha renamed');
});
test('dashboard totals, filters and real Excel exports match persisted records', async () => {
  const summary=await request('/summary'); assert.equal(summary.status,200);
  assert.equal(summary.body.total,await prisma.inventoryDevice.count({where:{archived:false}}));
  assert.equal(summary.body.counts.IN_STOCK,await prisma.inventoryDevice.count({where:{status:'IN_STOCK',archived:false}}));
  const filter=await request('/?q=SPARE-POS'); assert.equal(filter.body.total,1); assert.equal(filter.body.rows[0].serialNumber,'SPARE-POS');
  assert.equal((await request('/?from=bad-date')).status,400);
  assert.equal((await request('/?page=Infinity')).status,400);
  const workbook=await request('/reports?format=xlsx&type=stock',{raw:true}); assert.equal(workbook.status,200); assert.equal(workbook.body.subarray(0,2).toString(),'PK');
  const ExcelJS=require('exceljs'); const parsed=new ExcelJS.Workbook(); await parsed.xlsx.load(workbook.body); assert.equal(parsed.worksheets[0].rowCount,summary.body.total+1);
});
