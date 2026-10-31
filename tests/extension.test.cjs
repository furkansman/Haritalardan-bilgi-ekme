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
  const send=(message,sender={})=>new Promise(resolve=>listener({...message,stage:message.stage??state.job?.stage},sender,resolve));
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
function collectorContext(overrides={}) {
  let now=0;
  const context={console,URL,location:{origin:'https://www.google.com'},
    tidy:value=>(value||'').replace(/\s+/g,' ').trim(),
    Date:{now:()=>now},sleep:async ms=>{now+=ms;},check(){},blocked:()=>false,
    heading:()=>null,feedNow:()=>({}),cancelled:false,history:{back(){}},
    document:{querySelector:()=>null},...overrides};
  vm.createContext(context);
  const source=fs.readFileSync('content.js','utf8');
  vm.runInContext(source.slice(source.indexOf('  function readCard'),source.indexOf('  async function start')),context);
  return {context,elapsed:()=>now};
}
test('details never wait for an absent panel beyond 2.5 seconds and preserve card fields',async()=>{
  let clicks=0;
  const {context,elapsed}=collectorContext();
  const base={name:'Dent Nilüfer',phone:'05531234567',address:'Denizciler Cd.',website:''};
  const result=await context.extractDetails({name:'Dent Nilüfer'},{focus(){},click(){clicks++;}},false,base);
  assert.equal(clicks,1);assert.ok(elapsed()<=2500);assert.equal(result.phone,base.phone);
  assert.equal(result.address,base.address);
});
test('detail DOM exception returns partial row and a subsequent business still runs',async()=>{
  const {context}=collectorContext({heading:()=>{throw new Error('DOM changed');}});
  for(const name of ['Dent Nilüfer','Sonraki Klinik']) {
    const result=await context.extractDetails({name},{focus(){},click(){}},false,{name,phone:'05531234567'});
    assert.equal(result.name,name);assert.equal(result.phone,'05531234567');
  }
});
test('card reader extracts Turkish phone, address, website, rating without detail DOM',()=>{
  const root={innerText:'Dent Nilüfer\n0553 123 45 67\nDenizciler Cd. No: 10',
    querySelector(selector){return selector==='.MW4etd'?{textContent:'4,8'}:selector==='.UY7F9'?{textContent:'(125)'}:null;},
    querySelectorAll(){return [{href:'https://dent.example',getAttribute:()=> 'Web sitesi',textContent:'Web sitesi'}];}};
  const {context}=collectorContext();
  const row=context.readCard({getAttribute:()=> 'Dent Nilüfer',closest:()=>root});
  assert.equal(row.phone,'0553 123 45 67');assert.equal(row.address,'Denizciler Cd. No: 10');
  assert.equal(row.website,'https://dent.example/');assert.equal(row.rating,'4,8');assert.equal(row.reviews,'(125)');
});
function queueWorker(){
  let state={},listener,id=0;const downloads=[],navigations=[];
  const chrome={action:{onClicked:{addListener(){}}},sidePanel:{open:async()=>{}},
    storage:{local:{get:async()=>structuredClone(state),set:async v=>{state=structuredClone({...state,...v});},remove:async()=>{state={};}}},
    tabs:{create:async()=>({id:12}),update:async(id,v)=>{navigations.push(v.url);},onRemoved:{addListener(){}}},
    downloads:{download:async v=>{downloads.push(v);return downloads.length;}},runtime:{onMessage:{addListener(fn){listener=fn;}}}};
  const context={chrome,crypto:{randomUUID:()=>`id-${++id}`},console,URL,Date,encodeURIComponent};
  vm.createContext(context);vm.runInContext(fs.readFileSync('background.js','utf8'),context);
  return {state:()=>state,downloads,navigations,context,
    send:(message,content=false)=>new Promise(resolve=>listener({jobId:state.job?.id,stage:state.job?.stage,...message},content?{tab:{id:12}}:{},resolve))};
}
test('queue advances without downloads, rejects previous stage, deduplicates aliases, stops at unique limit',async()=>{
  const w=queueWorker();await w.send({type:'start',category:'Diş kliniği',location:'Nilüfer',limit:3,deepScan:true});
  const first=w.state().job;assert.equal(first.currentArea,'Özlüce');assert.ok(first.queue.includes('Görükle'));
  assert.ok(decodeURIComponent(w.navigations[0]).includes('Bursa Nilüfer Özlüce'));
  await w.send({type:'row',row:{key:'https://www.google.com/maps/place/A/data=!1s0x1:0xa',phone:'0553 123 45 67',name:'A'}},true);
  await w.send({type:'complete'},true);
  assert.equal(w.state().job.currentArea,'Görükle');assert.equal(w.downloads.length,0);
  await w.send({type:'complete',stage:first.stage},true);assert.equal(w.state().job.queueIndex,1);
  await w.send({type:'row',row:{key:'https://www.google.com/maps/place/Other',phone:'+90 553 123 45 67',name:'A again'}},true);
  await w.send({type:'row',row:{key:'https://www.google.com/maps?cid=10',name:'CID duplicate'}},true);
  assert.equal(w.state().job.rows.length,1);
  await w.send({type:'row',row:{key:'https://www.google.com/maps?cid=11',name:'B'}},true);
  await w.send({type:'row',row:{key:'https://www.google.com/maps?cid=12',name:'C'}},true);
  assert.equal(w.state().job.rows.length,3);assert.equal(w.state().job.status,'done');assert.equal(w.downloads.length,1);
  assert.equal(w.state().job.rows[0].neighborhood,'Özlüce');assert.equal(w.state().job.rows[1].neighborhood,'Görükle');
  assert.ok(decodeURIComponent(w.downloads[0].url).includes('Bulunduğu Mahalle / Arama Bölgesi'));
});
test('unknown district discovers dynamic queue and downloads only after the final area',async()=>{
  const w=queueWorker();await w.send({type:'start',category:'Kafe',location:'Bilinmeyen İlçe',limit:50,deepScan:true});
  assert.equal(w.state().job.phase,'discover');assert.ok(decodeURIComponent(w.navigations[0]).includes('mahalleleri'));
  await w.send({type:'discovered',areas:['Merkez','Yeni','Merkez']},true);
  assert.deepEqual(w.state().job.queue,['Merkez','Yeni']);assert.equal(w.state().job.phase,'scan');
  await w.send({type:'complete'},true);assert.equal(w.downloads.length,0);
  await w.send({type:'complete'},true);assert.equal(w.downloads.length,1);
});
test('empty discovery is explicit and falls back to one district-wide search; stop prevents next area',async()=>{
  const w=queueWorker();await w.send({type:'start',category:'Kafe',location:'Bilinmeyen',limit:50,deepScan:true});
  await w.send({type:'discovered',areas:[]},true);assert.equal(w.state().job.queue.length,1);
  assert.match(w.state().job.queueSource,/keşfedilemedi/);
  await w.send({type:'stop'});const count=w.navigations.length;
  await w.send({type:'complete'},true);assert.equal(w.navigations.length,count);assert.equal(w.downloads.length,1);
});
test('Maps discovery extracts explicit neighborhood labels without treating street addresses as neighborhoods',async()=>{
  let message;
  const {context}=collectorContext({feedNow:()=>null,
    document:{body:{innerText:'Özlüce Mahallesi\nGörükle Mah.\nDenizciler Caddesi\nÖzlüce Mahallesi\nDent Nilüfer'}},
    send:async(type,data)=>{message={type,...data};}});
  await context.discoverAreas(async()=>{});
  assert.equal(message.type,'discovered');
  assert.deepEqual(Array.from(message.areas),['Özlüce','Görükle']);
});
