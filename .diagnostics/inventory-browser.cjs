const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const { spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');
const express = require(require.resolve('express', { paths: [path.join(__dirname,'../apps/api')] }));
const run = String(Date.now());
const dbPath = path.join(__dirname,`inventory-browser-${run}.db`);
process.env.DATABASE_URL = `file:${dbPath.replaceAll('\\','/')}`;
const db = new DatabaseSync(dbPath); db.exec(fs.readFileSync(path.join(__dirname,'inventory-test-schema.sql'),'utf8')); db.close();
const prisma = require('../apps/api/src/prismaClient');
const { signAccess } = require('../apps/api/src/utils/jwt');
const sleep = ms => new Promise(resolve=>setTimeout(resolve,ms));
let server, browser, socket, token, user, base, nextId=0;
const pending = new Map(), errors=[];
async function cdp(method,params={}) {
  const id=++nextId;
  return new Promise((resolve,reject)=> { const timer=setTimeout(()=>{pending.delete(id);reject(new Error('CDP timeout '+method));},20000); pending.set(id,{resolve,reject,timer}); socket.send(JSON.stringify({id,method,params})); });
}
async function evaluate(expression) {
  const r=await cdp('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ': ' + r.exceptionDetails.exception?.description);
  return r.result.value;
}
async function until(expression,message) { for(let i=0;i<160;i++){if(await evaluate(expression)) return; await sleep(250);} throw new Error(message); }
async function click(text,container='document') { await evaluate(`(()=>{const b=Array.from(${container}.querySelectorAll('button')).find(b=>b.textContent.trim()===${JSON.stringify(text)});if(!b)throw Error('Missing button '+${JSON.stringify(text)});b.click()})()`); }
async function fill(name,value) {
  await evaluate(`(()=>{const e=document.querySelector('[name="${name}"]');if(!e)throw Error('Missing field ${name}');const p=e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:e.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(p,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
}
async function screenshot(name) { const result=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(__dirname,name+'.png'),Buffer.from(result.data,'base64')); }
async function main(){
  user=await prisma.user.create({data:{name:'Inventory Admin',email:'preview@inventory.test',passwordHash:'not-used',userRole:'ADMIN'}});token=signAccess({userId:user.id});
  const bank=await prisma.bankMaster.create({data:{name:'Eastern Bank',branch:'Card Operations',contactPerson:'Operations desk',contactDetails:'+880 1700 000000',agreementReference:'EBL / 2026 / 104'}});
  await prisma.bankMaster.create({data:{name:'City Bank',branch:'Merchant Acquiring',contactPerson:'POS support',agreementReference:'CB / 2026 / 089'}});
  const app=express(); app.use(express.json());
  app.all('/api/auth/refresh',(req,res)=>res.json({user:{id:user.id,name:user.name,email:user.email,userRole:user.userRole},accessToken:token}));
  app.use('/api/hardware',require('../apps/api/src/routes/hardware'));
  app.use((err,req,res,next)=>res.status(err.status||500).json({error:err.message}));
  app.use((req,res)=>res.json([]));
  server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));base=`http://127.0.0.1:${server.address().port}`;
  const headers={Authorization:`Bearer ${token}`,'Content-Type':'application/json'};
  const response=await fetch(base+'/api/hardware/stock-in',{method:'POST',headers,body:JSON.stringify({serialNumbers:Array.from({length:18},(_,i)=>`POS-DEMO-${String(i+1).padStart(3,'0')}`),brand:'PAX',model:'A920 Pro',deviceType:'SMART_POS',supplier:'PAX Technology',location:'Dhaka · Main warehouse',reference:'PO-2026-0142',receivedBy:'Inventory Admin',warrantyUntil:new Date(Date.now()+20*86400000).toISOString().slice(0,10)})});
  assert.equal(response.status,201); const devices=(await response.json()).rows;
  for(let i=4;i<10;i++) {
    let r=await fetch(base+`/api/hardware/${devices[i].id}/actions`,{method:'POST',headers,body:JSON.stringify({action:'DELIVER',version:0,bankId:bank.id,location:'Eastern Bank · Gulshan',reference:'CH-011',deliveredBy:'Dispatch team',receivedBy:'Bank officer',dueDate:new Date(Date.now()+7*86400000).toISOString().slice(0,10)})}); assert.equal(r.status,200);
    if(i<8){r=await fetch(base+`/api/hardware/${devices[i].id}/actions`,{method:'POST',headers,body:JSON.stringify({action:'DEPLOY',version:1,bankId:bank.id,location:'Gulshan retail',merchant:'Daily Mart',tid:`TID-${i}`,mid:'MID-00082',address:'Gulshan 2, Dhaka',engineer:'Rafiq Ahmed'})});assert.equal(r.status,200);}
  }
  browser=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--remote-debugging-port=9224',`--user-data-dir=${path.join(__dirname,'inventory-chrome-'+run)}`,'--no-first-run','--no-default-browser-check','about:blank'],{stdio:'ignore',windowsHide:true});
  let target;for(let i=0;i<40;i++){try{target=await (await fetch('http://127.0.0.1:9224/json/new?about:blank',{method:'PUT'})).json();break;}catch{await sleep(250)}}
  if(!target)throw new Error('Chrome did not start');
  socket=new WebSocket(target.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject});
  socket.onmessage=async({data})=>{
    const message=JSON.parse(data);
    if(message.id){const p=pending.get(message.id);if(p){clearTimeout(p.timer);pending.delete(message.id);message.error?p.reject(new Error(JSON.stringify(message.error))):p.resolve(message.result)}return;}
    if(message.method==='Runtime.exceptionThrown')errors.push(message.params.exceptionDetails.exception?.description||message.params.exceptionDetails.text);
    if(message.method==='Log.entryAdded') console.log('Browser log:',message.params.entry.text);
    if(message.method==='Fetch.requestPaused'){
      const {requestId,request}=message.params;
      console.log('Test API:',request.method,new URL(request.url).pathname);
      try{
        const targetUrl=new URL(request.url);
        const response=await fetch(base+targetUrl.pathname+targetUrl.search,{method:request.method,headers:{Authorization:`Bearer ${token}`,...(request.headers['Content-Type']?{'Content-Type':request.headers['Content-Type']}:{}),...(request.headers['content-type']?{'Content-Type':request.headers['content-type']}:{})},body:['GET','HEAD'].includes(request.method)?undefined:request.postData});
        await cdp('Fetch.fulfillRequest',{requestId,responseCode:response.status,responseHeaders:[{name:'Content-Type',value:response.headers.get('content-type')||'application/json'}],body:Buffer.from(await response.arrayBuffer()).toString('base64')});
      }catch(e){errors.push(e.message);await cdp('Fetch.failRequest',{requestId,errorReason:'Failed'});}
    }
  };
  await cdp('Page.enable');await cdp('Runtime.enable');await cdp('Log.enable');await cdp('Fetch.enable',{patterns:[{urlPattern:'http://127.0.0.1:3003/api/*'}]});
  await cdp('Emulation.setDeviceMetricsOverride',{width:1440,height:1050,deviceScaleFactor:1,mobile:false});
  await cdp('Page.navigate',{url:'http://127.0.0.1:3003/hardware'});
  await until(`document.body.innerText.includes('Available stock')`,'Dashboard not loaded');
  await screenshot('inventory-desktop');
  await click('Inventory');await until(`document.body.innerText.includes('POS-DEMO-001')`,'Device table not loaded');
  await screenshot('inventory-register');
  await click('Receive stock');await until(`document.querySelector('dialog[open]')!==null`,'Stock dialog not open');
  for(const [name,value] of Object.entries({serialNumbers:'UI-RECEIVED-001\nUI-RECEIVED-002',brand:'Sunmi',model:'P2 Pro',supplier:'Sunmi OEM',location:'Dhaka warehouse',reference:'UI-PO-001',receivedBy:'Store team'}))await fill(name,value);
  await screenshot('inventory-stock-form');
  await evaluate(`document.querySelector('button[form="device-action-form"]').click()`);
  await until(`document.body.innerText.includes('2 POS received')`,'Stock receipt did not save');
  assert.equal(await prisma.inventoryDevice.count({where:{serialNumber:{startsWith:'UI-RECEIVED'}}}),2);
  await click('POS-DEMO-001');await until(`document.body.innerText.includes('Current assignment')`,'Device detail not loaded');
  await evaluate(`(()=>{const e=document.querySelector('select[aria-label="Device action"]');e.value='DELIVER';e.dispatchEvent(new Event('change',{bubbles:true}));})()`);await click('Continue');
  for(const [name,value] of Object.entries({bankId:bank.id,location:'Eastern Bank depot',reference:'UI-CH-001',deliveredBy:'Dispatch',receivedBy:'Bank officer',dueDate:new Date(Date.now()+7*86400000).toISOString().slice(0,10)}))await fill(name,value);
  await evaluate(`document.querySelector('button[form="device-action-form"]').click()`);
  await until(`document.body.innerText.includes('Deliver to bank completed')`,'Delivery did not save');
  assert.equal((await prisma.inventoryDevice.findUnique({where:{id:devices[0].id}})).status,'DELIVERED');
  await screenshot('inventory-device');
  await click('← Back to inventory');await click('Reports');await click('Preview');await until(`document.body.innerText.includes('stock preview')||document.body.innerText.includes('Stock preview')`,'Report preview did not load');await screenshot('inventory-reports');
  await click('Overview');await cdp('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await evaluate(`document.querySelector('button[aria-label="Close navigation menu"]')?.click()`);await sleep(500);await screenshot('inventory-mobile');
  const width=await evaluate(`({viewport:innerWidth,content:document.documentElement.scrollWidth})`);assert.ok(width.content<=width.viewport+1,JSON.stringify(width));
  await click('Receive stock');await screenshot('inventory-mobile-form');
  const dialogWidth=await evaluate(`({viewport:innerWidth,width:document.querySelector('dialog').getBoundingClientRect().width})`);assert.ok(dialogWidth.width<dialogWidth.viewport);
  await evaluate(`document.querySelector('button[aria-label="Close dialog"]').click()`);
  console.log(JSON.stringify({desktop:true,receipt:true,delivery:true,reports:true,mobile:true,errors},null,2));
  assert.deepEqual(errors,[]);
}
main().catch(async e=>{console.error(e);console.error(errors);if(socket?.readyState===1){try{await screenshot('inventory-browser-failure');console.error(await evaluate('document.body.innerText'))}catch{}}process.exitCode=1;}).finally(async()=>{if(socket?.readyState===1){try{await cdp('Browser.close')}catch{}socket.close()}if(browser)browser.kill();if(server)await new Promise(r=>server.close(r));await prisma.$disconnect();});
