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
  const columns = [['name','İşletme Adı'],['phone','Telefon'],['address','Adres'],['website','Web Sitesi'],['rating','Puan'],['reviews','Yorum Sayısı'],['category','Sektör'],['location','Bölge'],['mapsUrl','Google Maps Bağlantısı'],['collectedAt','Toplanma Zamanı']];
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
    if (!category || !location || !Number.isInteger(limit) || limit < 1 || limit > 500) throw new Error('Alanları kontrol edin (hedef 1–500).');
    const tab = await chrome.tabs.create({url:'about:blank', active:true});
    job = {id:crypto.randomUUID(), tabId:tab.id, category, location, limit, rows:[], scrolls:0,
      status:'pending', currentName:'', message:'Maps hazırlanıyor; sonuç paneli bekleniyor…'};
    await chrome.storage.local.set({job});
    try { await chrome.tabs.update(tab.id, {url:`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(category+' '+location)}&hl=tr`}); }
    catch (error) { await finish(job,'error',error.message); }
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
  if (sender.tab?.id !== job.tabId || message.jobId !== job.id || !ACTIVE.includes(job.status)) return {};
  if (message.type === 'progress') {
    job.status='running'; job.scrolls=Number(message.scrolls)||0;
    job.currentName=String(message.currentName||''); job.message=String(message.message||'Taranıyor…');
  } else if (message.type === 'row') {
    if (message.row?.key && !job.rows.some(row => row.key === message.row.key)) job.rows.push({...message.row,category:job.category,location:job.location});
    if (job.rows.length >= job.limit) return finish(job,'done','Hedef sayıya ulaşıldı. CSV indiriliyor.');
  } else if (message.type === 'complete') return finish(job,'done','Bölgedeki tüm işletmeler tarandı. CSV indiriliyor.');
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
