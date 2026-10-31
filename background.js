// Curated starting areas, not an official/exhaustive administrative register.
const DISTRICTS = {
  'nilufer': {city:'Bursa',areas:['Özlüce','Görükle','İhsaniye','Beşevler','Fethiye','Ataevler','Balat','Ertuğrul','Çamlıca','Üçevler','Altınşehir','Konak','Kültür','Odunluk','Dumlupınar','Yüzüncüyıl','23 Nisan','Barış','Cumhuriyet','Minareliçavuş']},
  'kadikoy': {city:'İstanbul',areas:['Caferağa','Osmanağa','Rasimpaşa','Fenerbahçe','Feneryolu','Göztepe','Erenköy','Suadiye','Bostancı','Kozyatağı','Caddebostan','Acıbadem','Hasanpaşa','Fikirtepe']},
  'besiktas': {city:'İstanbul',areas:['Abbasağa','Sinanpaşa','Türkali','Vişnezade','Ortaköy','Bebek','Arnavutköy','Etiler','Levent','Akat','Ulus']},
  'cankaya': {city:'Ankara',areas:['Kızılay','Bahçelievler','Emek','Ayrancı','Çankaya','Çukurambar','Balgat','Dikmen','Öveçler','Birlik','Çayyolu','Ümit','Koru']},
  'bornova': {city:'İzmir',areas:['Kazımdirik','Erzene','Atatürk','Evka 3','İnönü','Mevlana','Yeşilova','Çamdibi','Rafet Paşa']},
  'muratpasa': {city:'Antalya',areas:['Fener','Şirinyalı','Çağlayan','Güzeloba','Lara','Meltem','Bahçelievler','Varlık','Yeşilbahçe']}
};
function normalize(value) { return String(value||'').toLocaleLowerCase('tr-TR').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ı/g,'i').replace(/[^a-z0-9]+/g,' ').trim(); }
function districtFor(location) {
  const words=' '+normalize(location)+' ';
  return Object.entries(DISTRICTS).find(([key])=>words.includes(' '+key+' '))?.[1];
}
function identities(row) {
  const ids=[];
  const phone=String(row.phone||'').replace(/\D/g,'').replace(/^(?:0090|90|0)(?=\d{10}$)/,'');
  if(phone.length>=10)ids.push('phone:'+phone);
  if(row.cid)ids.push('cid:'+row.cid);
  for(const value of [row.mapsUrl,row.key]){
    if(!value)continue;
    try {
      const u=new URL(value);const decoded=decodeURIComponent(u.pathname);
      const cid=u.searchParams.get('cid')||u.searchParams.get('ludocid');
      if(cid)ids.push('cid:'+cid);
      const feature=decoded.match(/!1s([^!]+)/)?.[1];
      if(feature)ids.push('place:'+feature);
      const hex=feature?.match(/:0x([0-9a-f]+)$/i)?.[1];
      if(hex)ids.push('cid:'+BigInt('0x'+hex).toString());
      const queryId=u.searchParams.get('query_place_id')||u.searchParams.get('place_id');
      if(queryId)ids.push('place:'+queryId);
      u.search='';u.hash='';u.hostname='www.google.com';
      if(u.pathname.includes('/maps/place/'))ids.push('url:'+u.href);
    }catch{ids.push('key:'+value);}
  }
  return [...new Set(ids)];
}
async function navigate(job) {
  job.stage=crypto.randomUUID();job.status='pending';job.currentName='';
  const area=job.queue?.[job.queueIndex]||'';
  job.currentArea=area;
  job.message=job.phase==='discover'?'Mahalle adayları Maps üzerinde keşfediliyor…':`Arama hazırlanıyor: ${area||job.location}`;
  await chrome.storage.local.set({job});
  const query=job.phase==='discover'?`${job.location} mahalleleri`:`${job.category} ${job.searchLocation||job.location} ${area}`;
  try {await chrome.tabs.update(job.tabId,{url:`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}&hl=tr`});}
  catch(error){await finish(job,'error',error.message);}
  return job;
}
const ACTIVE = ['pending', 'running'];
let chain = Promise.resolve();
chrome.action.onClicked.addListener(tab => {
  chrome.sidePanel.open({windowId: tab.windowId}).catch(console.error);
});
function csvCell(value) {
  let text = String(value ?? '');
  if (/^[\s\u0000-\u001f]*[=+@-]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
function csv(rows) {
  const columns = [['name','İşletme Adı'],['phone','Telefon'],['address','Adres'],['website','Web Sitesi'],['rating','Puan'],['reviews','Yorum Sayısı'],['category','Sektör'],['location','Bölge'],['neighborhood','Bulunduğu Mahalle / Arama Bölgesi'],['mapsUrl','Google Maps Bağlantısı'],['collectedAt','Toplanma Zamanı']];
  return '\ufeff' + [columns.map(x => csvCell(x[1])).join(';'), ...rows.map(row => columns.map(([key]) => csvCell(row[key])).join(';'))].join('\r\n');
}
async function download(job, rows = job.rows) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return chrome.downloads.download({url: 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv(rows)),
    filename: `isletmeler-${stamp}.csv`, saveAs: false, conflictAction: 'uniquify'});
}
async function finish(job, status, message) {
  job.status = status; job.message = message; job.currentName = '';
  await chrome.storage.local.set({job});
  try {
    job.downloadId = await download(job); job.downloadError = '';
  } catch (error) { job.downloadError = `CSV indirilemedi: ${error.message}. İndir düğmesini kullanın.`; }
  await chrome.storage.local.set({job});
  return job;
}
async function handle(message, sender) {
  let job = (await chrome.storage.local.get('job')).job;
  if (message.type === 'identify-tab') return {tabId: sender.tab?.id};
  if (message.type === 'start') {
    if (job && ACTIVE.includes(job.status)) throw new Error('Önce devam eden aramayı durdurun.');
    const category = String(message.category || '').trim().slice(0,120);
    const location = String(message.location || '').trim().slice(0,120);
    const limit = Number(message.limit);
    if (!category || !location || !Number.isInteger(limit) || limit < 1 || limit > 10000) throw new Error('Alanları kontrol edin (hedef 1–10000).');
    const tab = await chrome.tabs.create({url:'about:blank', active:true});
    const district=message.deepScan ? districtFor(location):null;
    job = {id:crypto.randomUUID(), tabId:tab.id, category, location, limit, rows:[], scrolls:0,
      deepScan:Boolean(message.deepScan),queue:district?.areas||[''],queueIndex:0,
      searchLocation:district?`${district.city} ${location}`:location,
      phase:message.deepScan&&!district?'discover':'scan',aliases:[],
      queueSource:district?'Hazır bölge listesi (tamlık garantisi yok)':message.deepScan?'Maps keşfi':'Tek arama',
      status:'pending', currentName:'', message:'Maps hazırlanıyor…'};
    await navigate(job);
    return job;
  }
  if (!job) throw new Error('Arama bulunamadı.');
  if (message.type === 'export') return {downloadId:await download(job, message.filtered ? job.rows.filter(row =>
    ['phone','website'].every(key => !message.filters?.[key] || message.filters[key] === 'all' || (message.filters[key] === 'yes') === Boolean(row[key]))) : job.rows)};
  if (message.type === 'clear') {
    if (ACTIVE.includes(job.status)) throw new Error('Önce aramayı durdurun.');
    await chrome.storage.local.remove('job'); return {};
  }
  if (message.type === 'stop') {
    if (!ACTIVE.includes(job.status)) return job;
    return finish(job, 'stopped', 'Durduruldu. Toplanan veriler CSV olarak indiriliyor.');
  }
  if (sender.tab?.id !== job.tabId || message.jobId !== job.id || (job.stage && message.stage !== job.stage) || !ACTIVE.includes(job.status)) return {};
  if (message.type === 'progress') {
    job.status='running'; job.scrolls=Number(message.scrolls)||0;
    job.currentName=String(message.currentName||''); job.message=String(message.message||'Taranıyor…');
  } else if (message.type === 'row') {
    const row=message.row;
    if(row?.key){
      const ids=identities(row);
      const known=new Set(job.aliases||job.rows.flatMap(identities));
      if(!ids.some(id=>known.has(id)))job.rows.push({...row,category:job.category,location:job.location,neighborhood:job.currentArea||job.location});
      job.aliases=[...new Set([...known,...ids])];
    }
    if (job.rows.length >= job.limit) return finish(job,'done','Toplam benzersiz işletme hedefine ulaşıldı. CSV indiriliyor.');
  } else if(message.type==='discovered' && job.phase==='discover'){
    const areas=[...new Set((message.areas||[]).filter(a=>typeof a==='string'&&a.trim().length>1&&a.length<100).map(a=>a.trim()))].slice(0,250);
    job.queue=areas.length?areas:[''];job.queueIndex=0;job.phase='scan';
    job.queueSource=areas.length?'Maps üzerinden keşfedilen adaylar (tamlık garantisi yok)':'Mahalle keşfedilemedi; yalnız ilçe geneli taranacak';
    return navigate(job);
  } else if (message.type === 'complete') {
    if(job.deepScan&&job.queueIndex+1<job.queue.length){job.queueIndex++;return navigate(job);}
    return finish(job,'done',job.deepScan?'Mahalle kuyruğu tamamlandı. Tekilleştirilmiş CSV indiriliyor.':'Bölgedeki tüm işletmeler tarandı. CSV indiriliyor.');
  }
  else if (message.type === 'error') return finish(job,'error',String(message.message));
  else return {};
  await chrome.storage.local.set({job}); return job;
}
chrome.runtime.onMessage.addListener((message,sender,respond) => {
  chain = chain.catch(()=>{}).then(()=>handle(message,sender));
  chain.then(result=>respond({ok:true,result}),error=>respond({ok:false,error:error.message}));
  return true;
});
chrome.tabs.onRemoved.addListener(tabId => {
  chain = chain.catch(()=>{}).then(async()=> {
    const {job} = await chrome.storage.local.get('job');
    if (job?.tabId === tabId && ACTIVE.includes(job.status)) await finish(job,'stopped','Maps sekmesi kapandı. Mevcut veriler indiriliyor.');
  });
});
