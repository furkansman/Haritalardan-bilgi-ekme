(() => {
  let running = false, stopId = null;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const blocked = () => /\/sorry\//.test(location.href) ||
    Boolean(document.querySelector('iframe[src*="recaptcha"], form[action*="consent"], #captcha-form'));
  const tidy = value => (value || '').replace(/\s+/g, ' ').trim();
  function canonical(href) {
    const url = new URL(href, location.origin);
    url.search = ''; url.hash = '';
    return url.href;
  }
  async function start() {
    if (running) return;
    const data = await chrome.storage.local.get(['job', 'stopJobId']);
    let job = data.job;
    if (!job || !['pending', 'running'].includes(job.status)) return;
    // A content script has no tab ID; verify ownership through a job-specific
    // session marker established via a targeted message from the popup's tab.
    const response = await chrome.runtime.sendMessage({type:'identify-tab'}).catch(() => null);
    if (!response || response.tabId !== job.tabId) return;
    running = true; stopId = data.stopJobId;
    const save = async (status, message) => {
      job.status = status; job.message = message;
      await chrome.storage.local.set({job});
    };
    const check = () => {
      if (stopId === job.id) throw new Error('USER_STOP');
      if (blocked()) throw new Error('CAPTCHA veya izin ekranı algılandı. Manuel kontrol gerekli.');
    };
    async function waitFor(fn, timeout = 20000) {
      const until = Date.now() + timeout;
      while (Date.now() < until) { check(); const value = fn(); if (value) return value; await sleep(300); }
      throw new Error('Sayfa beklenen biçimde yüklenmedi. Google Maps arayüzü değişmiş olabilir.');
    }
    try {
      await save('running', 'Arama sonuçları yükleniyor…');
      const feed = await waitFor(() => document.querySelector('[role="feed"]') ||
        (document.querySelector('h1') && document.querySelector('button[data-item-id="address"]') ? 'single' : null));
      const queue = new Map();
      if (feed !== 'single') {
        let stagnant = 0;
        while (queue.size < job.limit && stagnant < 5) {
          check(); const before = queue.size;
          for (const link of feed.querySelectorAll('a[href*="/maps/place/"]')) {
            const key = canonical(link.href);
            if (!queue.has(key)) queue.set(key, {href: link.href, name: tidy(link.getAttribute('aria-label'))});
          }
          stagnant = before === queue.size ? stagnant + 1 : 0;
          await save('running', `${queue.size} sonuç bulundu; liste yükleniyor…`);
          feed.scrollBy(0, Math.max(feed.clientHeight, 700));
          await sleep(1300);
        }
      } else queue.set(canonical(location.href), {href: location.href, name: tidy(document.querySelector('h1')?.textContent)});
      if (!queue.size) throw new Error('İşletme bağlantısı bulunamadı. Aramayı Maps üzerinde kontrol edin.');
      const seen = new Set(job.rows.map(row => row.key));
      for (const [key, target] of [...queue].slice(0, job.limit)) {
        const {href, name: expectedName} = target;
        check(); if (seen.has(key)) continue;
        if (feed !== 'single') {
          const link = [...document.querySelectorAll('a[href*="/maps/place/"]')].find(a => canonical(a.href) === key);
          if (!link) throw new Error('Sonuç bağlantısı sayfadan kaldırıldı. Mevcut kayıtlar korundu; daha küçük limit deneyin.');
          link.click();
          await waitFor(() => location.href.includes('/maps/place/') && canonical(location.href) === key);
        }
        await waitFor(() => document.querySelector('h1') && (!expectedName || tidy(document.querySelector('h1').textContent) === expectedName) && document.querySelector('button[data-item-id="address"]'));
        // Allow detail fields to settle after navigation; this is load pacing, not CAPTCHA bypass.
        await sleep(1200); check();
        const address = document.querySelector('button[data-item-id="address"]');
        const phone = document.querySelector('button[data-item-id^="phone:tel:"]');
        const website = document.querySelector('a[data-item-id="authority"]');
        const rating = document.querySelector('[role="main"] [role="img"][aria-label*=" yıldız"], [role="main"] [role="img"][aria-label*=" stars"]');
        const review = document.querySelector('button[jsaction*="moreReviews"]');
        job.rows.push({key, name: tidy(document.querySelector('h1')?.textContent),
          phone: phone ? phone.getAttribute('data-item-id').replace(/^phone:tel:/, '') : '',
          address: tidy(address?.querySelector('.Io6YTe')?.textContent || address?.textContent),
          website: website?.href || '', rating: rating?.getAttribute('aria-label') || '',
          reviews: tidy(review?.textContent), mapsUrl: href, category: job.category,
          location: job.location, collectedAt: new Date().toISOString()});
        seen.add(key);
        await save('running', `${job.rows.length} işletme toplandı / en fazla ${job.limit}`);
        await sleep(1000);
      }
      await save('done', `Tamamlandı: ${job.rows.length} işletme. Bu aramada Maps'in gösterdiği sonuçlarla sınırlıdır.`);
    } catch (error) {
      await save(error.message === 'USER_STOP' ? 'stopped' : 'error',
        error.message === 'USER_STOP' ? 'Durduruldu. Toplanan kayıtlar korundu.' : error.message);
    } finally { running = false; }
  }
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.stopJobId) stopId = changes.stopJobId.newValue;
    if (changes.job?.newValue?.status === 'pending') start();
  });
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (message.type === 'stop') { stopId = message.jobId; respond({ok: true}); }
  });
  start();
})();
