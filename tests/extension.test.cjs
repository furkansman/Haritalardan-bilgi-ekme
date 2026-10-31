const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
test('Side panel manifest has no popup and all entrypoints exist',()=>{
  const m=JSON.parse(fs.readFileSync('manifest.json'));
  assert.equal(m.manifest_version,3);assert.ok(m.permissions.includes('sidePanel'));
  assert.ok(m.permissions.includes('downloads'));assert.equal(m.action.default_popup,undefined);
  for(const file of [m.side_panel.default_path,m.background.service_worker,...m.content_scripts.flatMap(s=>s.js)])assert.ok(fs.existsSync(file));
});
test('CSV has BOM, Turkish headers, delimiters and formula protection',()=>{
  const source=fs.readFileSync('background.js','utf8');
  const functions=source.slice(source.indexOf('function csvCell'),source.indexOf('async function download'));
  const context={};vm.createContext(context);vm.runInContext(functions,context);
  assert.equal(context.csvCell('=1+1'),'"\'=1+1"');
  assert.equal(context.csvCell('İstanbul; "Kafe"'),'"İstanbul; ""Kafe"""');
  const output=context.csv([{name:'İşletme',phone:'+90 555',address:'Kadıköy'}]);
  assert.equal(output.charCodeAt(0),0xFEFF);assert.ok(output.includes('İşletme Adı'));assert.ok(output.includes('\r\n'));assert.ok(output.includes(';'));
});
test('worker stops atomically, exports once, and ignores late rows',async()=>{
  let state={},listener,downloads=[];
  const chrome={action:{onClicked:{addListener(){}}},sidePanel:{open:async()=>{}},
    storage:{local:{get:async()=>structuredClone(state),set:async value=>{state=structuredClone({...state,...value});},remove:async()=>{state={};}}},
    tabs:{create:async()=>({id:17}),update:async()=>{},onRemoved:{addListener(){}}},
    downloads:{download:async request=>{downloads.push(request);return downloads.length;}},
    runtime:{onMessage:{addListener(fn){listener=fn;}}}};
  const context={chrome,crypto:{randomUUID:()=> 'job-1'},console,URL,encodeURIComponent,Date};
  vm.createContext(context);vm.runInContext(fs.readFileSync('background.js','utf8'),context);
  const send=(message,sender={})=>new Promise(resolve=>listener(message,sender,resolve));
  await send({type:'start',category:'Kafe',location:'İzmir',limit:5});
  await send({type:'row',jobId:'job-1',row:{key:'one',name:'Kafe'}},{tab:{id:17}});
  await send({type:'row',jobId:'job-1',row:{key:'one',name:'Kafe'}},{tab:{id:17}});
  assert.equal(state.job.rows.length,1);
  await send({type:'stop'});
  await send({type:'row',jobId:'job-1',row:{key:'two',name:'Geç gelen'}},{tab:{id:17}});
  await send({type:'complete',jobId:'job-1'},{tab:{id:17}});
  assert.equal(state.job.status,'stopped');assert.equal(state.job.rows.length,1);assert.equal(downloads.length,1);
  assert.ok(decodeURIComponent(downloads[0].url).includes('Kafe'));
  await send({type:'start',category:'Diş',location:'Ankara',limit:1});
  await send({type:'row',jobId:'job-1',row:{key:'three',name:'Klinik'}},{tab:{id:17}});
  assert.equal(state.job.status,'done');assert.equal(downloads.length,2);
});
