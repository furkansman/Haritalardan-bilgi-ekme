const $ = id => document.getElementById(id);
let job = null;
const active = () => job && ['pending','running'].includes(job.status);
async function send(type, extra={}) {
  const response=await chrome.runtime.sendMessage({type,...extra});
  if (!response?.ok) throw new Error(response?.error || 'Eklenti bağlantısı kesildi.');
  return response.result;
}
function filtered() { return (job?.rows||[]).filter(row=>['phone','website'].every(key=>{
  const value=$(key+'Filter').value;return value==='all'||(value==='yes')===Boolean(row[key]);
})); }
function render() {
  $('start').disabled=Boolean(active());$('stop').disabled=!active();$('clear').disabled=Boolean(active());
  $('scrolls').textContent=job?.scrolls||0;$('collected').textContent=job?.rows?.length||0;$('target').textContent=job?.limit||0;
  $('progress').value=job?.limit ? Math.min(100,100*job.rows.length/job.limit):0;
  $('status').textContent=job?.message||'Yeni bir arama için hazır.';
  $('current').textContent=job?.currentName ? `İnceleniyor: ${job.currentName}`:'';
  $('error').textContent=job?.downloadError||'';
  const rows=filtered();$('download').disabled=!rows.length;
  $('count').textContent=`${rows.length} filtrelenen / ${job?.rows?.length||0} toplam • önizleme ilk 100`;
  $('preview').replaceChildren();
  for (const row of rows.slice(0,100)) {
    const tr=document.createElement('tr');
    for (const value of [row.name,row.phone,row.address,row.website,[row.rating,row.reviews].filter(Boolean).join(' / ')]) {
      const td=document.createElement('td');td.textContent=value||'—';tr.append(td);
    }$('preview').append(tr);
  }
}
async function action(fn) {try{await fn();}catch(error){$('error').textContent=error.message;}}
$('searchForm').addEventListener('submit',event=>{
  event.preventDefault();action(async()=>{
    if(job?.rows?.length&&!confirm('Yeni arama mevcut listeyi değiştirecek. Devam edilsin mi?'))return;
    $('start').disabled=true;
    try {await send('start',{category:$('category').value,location:$('location').value,limit:Number($('limit').value)});}
    finally {job=(await chrome.storage.local.get('job')).job;render();}
  });
});
$('stop').onclick=()=>action(async()=>{ $('stop').disabled=true;await send('stop'); });
$('download').onclick=()=>action(()=>send('export',{filtered:true,filters:{phone:$('phoneFilter').value,website:$('websiteFilter').value}}));
$('clear').onclick=()=>action(async()=>{if(confirm('Yerel kayıtlar silinsin mi?'))await send('clear');});
for(const id of ['phoneFilter','websiteFilter'])$(id).onchange=render;
chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&changes.job){job=changes.job.newValue;render();}});
(async()=>{job=(await chrome.storage.local.get('job')).job;if(job){$('category').value=job.category;$('location').value=job.location;$('limit').value=job.limit;}render();})();
