// Isolated real-API browser checks. Never connects to the application's dev/VM DB.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { spawn, execFileSync } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');
const WebSocket = require('ws');
const root = path.resolve(__dirname, '..');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'trackfield-mobile-'));
const reportDir = path.join(root, 'reports/mobile-check');
const base = 'http://127.0.0.1:3009';
const api = 'http://127.0.0.1:5009';
process.env.DATABASE_URL = `file:${path.join(directory, 'test.db').replaceAll('\\', '/')}`;
process.env.JWT_ACCESS_SECRET = 'isolated-mobile-check-access';
process.env.JWT_REFRESH_SECRET = 'isolated-mobile-check-refresh';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const children = [], pending = new Map(), errors = [], results = [];
const checks = [];
let prisma, socket, nextId = 0;
let expireAnnouncement = false, announcementRequests = 0, refreshResponses = 0, completed = false;
function launch(args, options = {}) {
  const child = spawn(process.execPath, args, { cwd: root, env: process.env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], ...options });
  children.push(child);
  child.stdout?.on('data', () => {});
  child.stderr?.on('data', data => { if (/Error|error/.test(String(data))) console.error(String(data).slice(0, 1500)); });
  return child;
}
async function ready(url) {
  for (let i = 0; i < 120; i++) { try { if ((await fetch(url)).ok) return; } catch {} await sleep(500); }
  throw new Error('Server did not become ready: ' + url);
}
function cdp(method, params = {}, sessionId) {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('CDP timeout: ' + method)); }, 30000);
    pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
}
async function evaluate(expression) {
  const r = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
}
async function until(expression, label) {
  for (let i = 0; i < 100; i++) { if (await evaluate(expression)) return; await sleep(300); }
  throw new Error(label + ': ' + await evaluate('document.body.innerText.slice(0,1800)'));
}
async function navigate(route) {
  await cdp('Page.navigate', { url: base + route });
  await until(`location.pathname === ${JSON.stringify(route.split('?')[0])} && document.readyState === 'complete' && !!document.querySelector('main') && !document.body.innerText.includes('Restoring your session')`, 'Page load ' + route);
  await sleep(900);
}
async function widthCheck(label) {
  const dimensions = await evaluate(`({viewport:document.documentElement.clientWidth,width:document.documentElement.scrollWidth,overflow:[...document.querySelectorAll('main *')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.right>document.documentElement.clientWidth+2&&!e.closest('[class*="tableScroll"],.overflow-x-auto')}).slice(0,8).map(e=>e.tagName+'.'+e.className)})`);
  results.push({ label, ...dimensions });
  console.log(label, dimensions.viewport, dimensions.width);
  assert.ok(dimensions.width <= dimensions.viewport + 1, label + ' overflows: ' + JSON.stringify(dimensions));
}
async function screenshot(name) {
  const shot = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  fs.writeFileSync(path.join(reportDir, name + '.png'), Buffer.from(shot.data, 'base64'));
}
async function setInput(selector, value) {
  await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});const proto=e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
}
async function login(email) {
  await navigate('/login');
  await setInput('#email', email); await setInput('#password', 'Mobile-check-123');
  await evaluate(`document.querySelector('form button:not([type=button])').click()`);
  await until(`location.pathname==='/dashboard' && !!document.querySelector('header')`, 'Login');
  await sleep(800);
}
async function main() {
  fs.mkdirSync(reportDir, { recursive: true });
  // Refuse to reuse unknown processes at test ports.
  for (const url of [base, api]) { let occupied = false; try { await fetch(url, {signal:AbortSignal.timeout(1000)}); occupied=true; } catch {} assert.ok(!occupied, 'Test port already occupied: ' + url); }
  const schema = execFileSync(process.execPath, [path.join(root, 'node_modules/prisma/build/index.js'), 'migrate', 'diff', '--from-empty', '--to-schema-datamodel', path.join(root, 'apps/api/prisma/schema.prisma'), '--script'], { encoding: 'utf8' });
  const db = new DatabaseSync(path.join(directory, 'test.db')); db.exec(schema); db.close();
  prisma = require('../apps/api/src/prismaClient');
  const { hashPassword } = require('../apps/api/src/utils/hash');
  const passwordHash = await hashPassword('Mobile-check-123');
  const admin = await prisma.user.create({ data: { name: 'Mobile Check Administrator', email: 'admin@mobile.test', passwordHash, userRole: 'ADMIN' } });
  const bank = await prisma.bankMaster.create({ data: { name: 'Mobile Test Bank' } });
  const member = await prisma.user.create({ data: { name: 'Bank Mobile Check', email: 'bank@mobile.test', passwordHash, userRole: 'BANK', bankId: bank.id, bankName: bank.name, bankRole: 'ADMIN', bankStatus: 'APPROVED' } });
  await prisma.user.create({ data: { name: 'Field Employee', email: 'employee@mobile.test', passwordHash, userRole: 'EMPLOYEE' } });
  await prisma.inventoryDevice.create({ data: { serialNumber: 'MOBILE-TEST-001', brand: 'PAX', model: 'A920', location: 'Dhaka', bankId: bank.id, status: 'DELIVERED' } });
  await prisma.posSerial.create({ data: { serialNumber: 'MOBILE-TEST-001', bankName: bank.name } });
  const ticket = await prisma.bankTicket.create({ data: { ticketNo: 'MOBILE-001', title: 'Mobile layout test ticket', bankName: bank.name, bankUserId: member.id, description: 'Test ticket details on desktop and phone.' } });
  const workspace = await prisma.workspace.create({ data: { name: 'Mobile test field task', ownerId: admin.id, bankName: bank.name } });
  await prisma.workspaceMember.create({ data: { workspaceId: workspace.id, userId: admin.id, role: 'OWNER' } });
  const goal = await prisma.goal.create({ data: { workspaceId: workspace.id, title: 'Mobile goal check', ownerId: admin.id } });
  await prisma.directMessage.create({ data: { senderId: member.id, recipientId: admin.id, content: 'Mobile conversation check' } });
  launch(['apps/api/src/server.js'], { env: { ...process.env, NODE_ENV: 'development', HOST: '127.0.0.1', PORT: '5009', CLIENT_URLS: base } });
  await ready(api + '/api/health');
  const webEnv = { ...process.env, NODE_ENV: 'production', API_URL: api, NEXT_DIST_DIR: '.next-mobile-check-production', NEXT_PUBLIC_SOCKET_URL: base, NEXT_PUBLIC_API_URL: 'http://obsolete-deployment.invalid', ANDROID_PACKAGE_NAME: 'com.trackfield.browsertest', ANDROID_SHA256_FINGERPRINTS: Array(32).fill('AB').join(':') };
  console.log('Building isolated production website for browser checks…');
  const build = execFileSync(process.execPath, ['node_modules/next/dist/bin/next', 'build', 'apps/web'], { cwd: root, env: webEnv, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  fs.writeFileSync(path.join(reportDir, 'browser-build.txt'), build);
  launch(['node_modules/next/dist/bin/next', 'start', 'apps/web', '-p', '3009', '--hostname', '127.0.0.1'], { env: webEnv });
  await ready(base + '/login');
  const health = await fetch(base + '/api/health');
  assert.equal(health.status, 200); assert.equal(health.headers.get('cache-control'), 'no-store');
  const association = await (await fetch(base + '/.well-known/assetlinks.json')).json();
  assert.equal(association[0].target.package_name, 'com.trackfield.browsertest');
  const manifest = await (await fetch(base + '/manifest.webmanifest')).json();
  assert.equal(manifest.scope, '/');
  for (const icon of manifest.icons) assert.equal((await fetch(base + icon.src)).status, 200);
  assert.ok((await fetch(base + '/sw.js')).headers.get('cache-control').includes('no-store'));
  checks.push('API health/cache headers', 'Configured Android association', 'Manifest and all icon URLs', 'Service worker update headers');
  const chrome = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  const browser = spawn(chrome, ['--headless=new', '--disable-gpu', '--remote-debugging-port=9229', '--user-data-dir=' + path.join(directory, 'chrome'), '--no-first-run', '--no-default-browser-check', 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  children.push(browser); await ready('http://127.0.0.1:9229/json/version');
  const target = await (await fetch('http://127.0.0.1:9229/json/new?about:blank', { method: 'PUT' })).json();
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  socket.onmessage = ({ data }) => {
    const m = JSON.parse(data);
    if (process.env.DEBUG_CDP) console.log('CDP', String(data).slice(0, 400));
    if (m.id) { const p = pending.get(m.id); if (p) { clearTimeout(p.timer); pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); } }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    if (m.method === 'Network.responseReceived' && m.params.response.url.endsWith('/api/auth/refresh') && m.params.response.status === 200) refreshResponses++;
    if (m.method === 'Network.responseReceived' && m.params.response.url.includes('/api/') && m.params.response.status >= 500) errors.push('API HTTP ' + m.params.response.status + ' ' + m.params.response.url);
    if (m.method === 'Fetch.requestPaused') {
      announcementRequests++;
      const task = expireAnnouncement
        ? cdp('Fetch.fulfillRequest', { requestId: m.params.requestId, responseCode: 401, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }], body: Buffer.from('{"error":"Expired test token"}').toString('base64') })
        : cdp('Fetch.continueRequest', { requestId: m.params.requestId });
      expireAnnouncement = false;
      task.catch(error => errors.push(error.message));
    }
  };
  await cdp('Page.enable'); await cdp('Runtime.enable'); await cdp('Network.enable');
  for (const width of [320, 390, 768, 1440]) {
    await cdp('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 768 });
    for (const route of ['/login', '/register', '/bank-register']) { await navigate(route); await widthCheck('public ' + width + ' ' + route); }
  }
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await login('admin@mobile.test');
  await evaluate(`localStorage.setItem('activeWorkspace',${JSON.stringify(workspace.id)})`);
  const routes = ['/dashboard', '/tickets', '/tickets/' + ticket.id, '/hardware', '/bank-team', '/support', '/employees', '/workspaces', '/workspaces/' + workspace.id, '/workspaces/' + workspace.id + '/goals', '/workspaces/' + workspace.id + '/goals/' + goal.id, '/goals', '/action-items', '/meetings', '/announcements', '/chat', '/profile', '/pos-serials', '/pdf-to-png'];
  for (const width of [320, 390, 768, 1440]) {
    await cdp('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 768 });
    for (const route of routes) {
      await navigate(route); await widthCheck(width + ' ' + route);
      if ([390, 768, 1440].includes(width) && ['/dashboard', '/chat', '/support', '/employees'].includes(route)) await screenshot(route.slice(1) + '-' + width);
    }
    await screenshot('admin-' + width);
  }
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await navigate('/dashboard');
  await evaluate(`document.querySelector('[aria-label="Open navigation menu"]').click()`);
  await until(`!!document.querySelector('#mobile-navigation')`, 'Mobile menu opens');
  await evaluate(`document.querySelector('#mobile-navigation a[href="/profile"]').click()`);
  await until(`location.pathname==='/profile'&&!document.querySelector('#mobile-navigation')`, 'Mobile navigation closes');
  checks.push('Mobile menu opens and closes on navigation');
  const refreshBefore = refreshResponses;
  expireAnnouncement = true;
  await cdp('Fetch.enable', { patterns: [{ urlPattern: base + '/api/announcements', requestStage: 'Request' }] });
  await navigate('/announcements');
  await until(`document.querySelector('header') !== null`, 'Session refresh page');
  assert.ok(announcementRequests >= 2 && refreshResponses > refreshBefore, 'Expired API token refreshes and retries the request');
  await cdp('Fetch.disable');
  checks.push('Expired token refresh and same-origin retry');
  await navigate('/chat');
  await evaluate(`document.querySelector('[aria-label="Open chat contacts"]').click()`);
  await until(`!!document.querySelector('[aria-label="Close contacts"]')`, 'Mobile chat contacts open');
  await evaluate(`document.querySelector('[aria-label="Close contacts"]').click()`);
  checks.push('Mobile chat contacts drawer');
  await navigate('/hardware');
  await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='Receive stock').click()`);
  await until(`!!document.querySelector('dialog[open]')`, 'Mobile stock form opens');
  const dialog = await evaluate(`({width:document.querySelector('dialog').getBoundingClientRect().width,viewport:document.documentElement.clientWidth})`);
  assert.ok(dialog.width <= dialog.viewport, 'Mobile inventory dialog fits');
  checks.push('Mobile inventory stock dialog fits');
  await screenshot('mobile-stock-form');
  await evaluate(`document.querySelector('[aria-label="Close dialog"]').click()`);
  await navigate('/support?contact=' + member.id);
  await until(`!!document.querySelector('textarea')&&!document.querySelector('textarea').disabled`, 'Private conversation loads');
  await setInput('textarea', 'Sent from the mobile browser check');
  await evaluate(`document.querySelector('button[type="submit"]').click()`);
  await until(`document.body.innerText.includes('Sent from the mobile browser check')`, 'Private message saves');
  assert.equal(await prisma.directMessage.count({ where: { senderId: admin.id, content: 'Sent from the mobile browser check' } }), 1);
  checks.push('Mobile private-message send persists exactly once');
  await screenshot('mobile-conversation');
  await widthCheck('mobile private conversation');
  await navigate('/profile');
  await cdp('Page.reload');
  await until(`!!document.querySelector('header')`, 'Cookie session survives reload');
  checks.push('Cookie session restores after page reload');
  await evaluate(`navigator.serviceWorker.ready.then(()=>true)`);
  const targets = await cdp('Target.getTargets');
  const worker = targets.targetInfos.find(target => target.type === 'service_worker' && target.url === base + '/sw.js');
  assert.ok(worker, 'Service worker registered');
  const workerSession = (await cdp('Target.attachToTarget', { targetId: worker.targetId, flatten: true })).sessionId;
  await cdp('Network.enable', {}, workerSession);
  await cdp('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 }, workerSession);
  await cdp('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
  await cdp('Page.navigate', { url: base + '/dashboard' });
  await until(`document.title==='Offline | TrackField'`, 'Offline navigation fallback');
  await screenshot('offline');
  checks.push('Offline service-worker navigation fallback');
  await cdp('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 }, workerSession);
  await cdp('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await login('bank@mobile.test');
  for (const route of ['/dashboard', '/tickets', '/bank-team', '/support', '/hardware']) { await navigate(route); await widthCheck('bank ' + route); }
  await screenshot('bank-mobile');
  await login('employee@mobile.test');
  for (const route of ['/dashboard', '/workspaces', '/chat', '/profile']) { await navigate(route); await widthCheck('employee ' + route); }
  assert.deepEqual(errors, [], 'Browser runtime errors');
  completed = true;
}
main().catch(async error => { console.error(error); errors.push(error.message); process.exitCode = 1; if (socket?.readyState === 1) { try { await screenshot('failure'); } catch {} } }).finally(async () => {
  fs.mkdirSync(reportDir, { recursive: true });
  fs.writeFileSync(path.join(reportDir, 'results.json'), JSON.stringify({ passed: completed && errors.length === 0, checks, results, errors }, null, 2));
  if (socket?.readyState === 1) { try { await cdp('Browser.close'); } catch {} socket.close(); }
  for (const child of children.reverse()) child.kill();
  if (prisma) await prisma.$disconnect();
  console.log('Browser report: reports/mobile-check/results.json');
});
