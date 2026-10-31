const $ = id => document.getElementById(id);
let current = null;
const active = job => job && ['pending', 'running', 'stopping'].includes(job.status);
function filtered() {
  return (current?.rows || []).filter(row =>
    ['phone', 'website'].every(key => {
      const value = $(key + 'Filter').value;
      return value === 'all' || (value === 'yes') === Boolean(row[key]);
    }));
}
function render() {
  const busy = active(current);
  $('start').disabled = busy;
  $('stop').disabled = !busy || current.status === 'stopping';
  $('clear').disabled = busy;
  $('status').textContent = current?.message || 'Hazır.';
  const rows = filtered();
  $('download').disabled = !rows.length;
  $('count').textContent = `${current?.rows?.length || 0} kayıt • filtreye uyan ${rows.length} • önizleme ilk 100`;
  $('preview').replaceChildren();
  for (const row of rows.slice(0, 100)) {
    const tr = document.createElement('tr');
    for (const key of ['name', 'phone', 'address', 'website']) {
      const td = document.createElement('td');
      td.textContent = row[key] || '—';
      tr.append(td);
    }
    $('preview').append(tr);
  }
}
$('searchForm').addEventListener('submit', async event => {
  event.preventDefault();
  const category = $('category').value.trim(), location = $('location').value.trim();
  if (!category || !location) return;
  if (current?.rows?.length && !confirm('Yeni arama mevcut sonuçları değiştirecek. Önce CSV indirdiniz mi?')) return;
  $('start').disabled = true;
  try {
    const query = `${category} ${location}`;
    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}&hl=tr`;
    const tab = await chrome.tabs.create({url, active: true});
    current = {id: crypto.randomUUID(), tabId: tab.id, status: 'pending', query,
      limit: Number($('limit').value), category, location, rows: [],
      message: 'Maps açılıyor; sonuçlar bekleniyor.', startedAt: new Date().toISOString()};
    await chrome.storage.local.set({job: current});
    render();
  } catch (error) { $('status').textContent = error.message; $('start').disabled = false; }
});
$('stop').addEventListener('click', async () => {
  // Collector observes this key; only it writes running results.
  await chrome.storage.local.set({stopJobId: current.id});
  try {
    await chrome.tabs.sendMessage(current.tabId, {type: 'stop', jobId: current.id});
  } catch {
    const latest = (await chrome.storage.local.get('job')).job;
    if (latest?.id === current.id) {
      latest.status = 'stopped'; latest.message = 'Durduruldu. Toplanan kayıtlar korundu.';
      await chrome.storage.local.set({job: latest});
    }
  }
  $('stop').disabled = true;
});
$('clear').addEventListener('click', async () => {
  if (confirm('Cihazdaki tüm toplanan kayıtlar silinsin mi?')) {
    await chrome.storage.local.remove(['job', 'stopJobId']);
    current = null; render();
  }
});
for (const id of ['phoneFilter', 'websiteFilter']) $(id).addEventListener('change', render);
function csvCell(value) {
  let text = String(value ?? '');
  // Prevent spreadsheet formula execution, including leading whitespace/control characters.
  if (/^[\s\u0000-\u001f]*[=+@-]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
$('download').addEventListener('click', () => {
  const columns = [['name','İşletme Adı'],['phone','Telefon'],['address','Adres'],
    ['website','Web Sitesi'],['rating','Puan'],['reviews','Yorum Sayısı'],
    ['category','Aranan Sektör'],['location','Aranan Bölge'],['mapsUrl','Google Maps Bağlantısı'],['collectedAt','Toplanma Zamanı']];
  const lines = [columns.map(x => csvCell(x[1])).join(';'),
    ...filtered().map(row => columns.map(([key]) => csvCell(row[key])).join(';'))];
  const url = URL.createObjectURL(new Blob(['\ufeff' + lines.join('\r\n')], {type:'text/csv;charset=utf-8'}));
  const a = document.createElement('a'); a.href = url;
  a.download = `isletmeler-${new Date().toISOString().slice(0,10)}.csv`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.job) { current = changes.job.newValue || null; render(); }
});
(async () => {
  current = (await chrome.storage.local.get('job')).job || null;
  if (active(current)) {
    try { await chrome.tabs.get(current.tabId); }
    catch { current.status = 'stopped'; current.message = 'Maps sekmesi kapandı. Mevcut kayıtları indirebilirsiniz.';
      await chrome.storage.local.set({job: current}); }
  }
  if (current) { $('category').value = current.category; $('location').value = current.location; }
  render();
})();
