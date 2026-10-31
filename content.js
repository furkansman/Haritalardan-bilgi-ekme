(() => {
  let running=false, cancelled=false, localJob=null;
  const tidy=value=>(value||'').replace(/\s+/g,' ').trim();
  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const keyFor=href=>{const u=new URL(href,location.origin);u.search='';u.hash='';return u.href;};
  let card;
  function overlay(job) {
    if(!card){
      const host=document.createElement('div');host.id='harita-status-overlay';
      Object.assign(host.style,{position:'fixed',right:'18px',top:'18px',zIndex:'2147483647',pointerEvents:'none'});
      const shadow=host.attachShadow({mode:'closed'});
      shadow.innerHTML='<style>:host{font:13px system-ui}.card{width:270px;padding:18px;border-radius:16px;background:rgba(10,22,47,.94);border:1px solid #3b527a;color:#eaf1ff;box-shadow:0 12px 35px #0005;backdrop-filter:blur(16px)}h3{font-size:12px;letter-spacing:1px;color:#67d8ed;margin:0 0 14px}.grid{display:flex;justify-content:space-between}b{display:block;font-size:22px;color:#83e4f1}small{color:#a3b4d3;font-size:10px}p{line-height:1.5;margin:12px 0 0;overflow-wrap:anywhere}.current{color:#9bbaff}</style><div class="card"><h3>HARİTA / CANLI TARAMA</h3><div class="grid"><div><b id="s">0</b><small>Kaydırma</small></div><div><b id="n">0</b><small>Toplanan</small></div><div><b id="t">0</b><small>Hedef</small></div></div><p id="m"></p><p id="c" class="current"></p></div>';
      document.documentElement.append(host);card=shadow;
    }
    card.getElementById('s').textContent=job.scrolls||0;card.getElementById('n').textContent=job.rows.length;
    card.getElementById('t').textContent=job.limit;card.getElementById('m').textContent=job.message;
    card.getElementById('c').textContent=job.currentName||'';
  }
  const blocked=()=>Boolean(document.querySelector('iframe[src*="recaptcha"],#captcha-form,form[action*="consent"]'))||/\/sorry\//.test(location.href);
  function check(){if(cancelled)throw new Error('STOP');if(blocked())throw new Error('CAPTCHA veya izin ekranı: Maps üzerinde manuel kontrol gerekli.');}
  async function send(type,extra={}){
    check();const response=await chrome.runtime.sendMessage({type,jobId:localJob.id,...extra});
    if(!response?.ok)throw new Error(response?.error||'Eklenti bağlantısı kesildi.');
    if(response.result?.status&&!['pending','running'].includes(response.result.status))cancelled=true;
    return response.result;
  }
  async function waitFor(fn,timeout=90000){
    const until=Date.now()+timeout;
    while(Date.now()<until){check();const result=fn();if(result)return result;await sleep(250);}
    throw new Error('Maps yanıt vermiyor veya beklenen panel bulunamadı. Mevcut veriler korundu; Maps izinlerini ve bağlantıyı kontrol edin.');
  }
  const feedNow=()=>document.querySelector('div[role="feed"]');
  const heading=()=>[...document.querySelectorAll('h1')].find(h=>h.getClientRects().length&&tidy(h.textContent));
  const endText=feed=>/listenin sonuna|sonuçların sonuna|you.ve reached the end|no more results/i.test(feed.innerText);
  async function start(){
    if(running)return;
    const {job}=await chrome.storage.local.get('job');
    if(!job||!['pending','running'].includes(job.status))return;
    const identity=await chrome.runtime.sendMessage({type:'identify-tab'}).catch(()=>null);
    if(identity?.result?.tabId!==job.tabId)return;
    running=true;cancelled=false;localJob=job;overlay(job);
    let scrolls=job.scrolls||0;
    const seen=new Set(job.rows.map(r=>r.key));
    const progress=(message,currentName='')=>send('progress',{message,currentName,scrolls});
    try{
      await progress('Maps hazırlanıyor; sonuç paneli bekleniyor…');
      await waitFor(()=>document.readyState!=='loading'&&(feedNow()||(location.pathname.includes('/maps/place/')&&heading())||/sonuç bulunamadı|no results found/i.test(document.body.innerText)));
      // A brief quiet interval prevents treating a newly mounted, empty feed as its end.
      await sleep(1500);check();
      if(!feedNow()){
        if(location.pathname.includes('/maps/place/')&&heading())await collect({href:location.href,key:keyFor(location.href),name:tidy(heading().textContent)},true);
        await send('complete');return;
      }
      let unchanged=0,previousSignature='';
      while(!cancelled){
        check();const feed=await waitFor(feedNow);
        const targets=[...feed.querySelectorAll('a[href*="/maps/place/"]')].map(a=>({href:a.href,key:keyFor(a.href),name:tidy(a.getAttribute('aria-label'))}));
        const unique=[...new Map(targets.map(t=>[t.key,t])).values()];
        for(const target of unique){
          if(seen.has(target.key))continue;
          await collect(target,false);if(cancelled)return;
        }
        const list=await waitFor(feedNow);
        if(endText(list)){await send('complete');return;}
        const signature=unique.map(t=>t.key).join('|')+':'+list.scrollHeight;
        const atBottom=list.scrollTop+list.clientHeight>=list.scrollHeight-8;
        unchanged=signature===previousSignature&&atBottom?unchanged+1:0;
        if(unchanged>=4){await send('complete');return;}
        previousSignature=signature;
        list.scrollTop=Math.min(list.scrollHeight,list.scrollTop+Math.max(500,list.clientHeight*.85));
        scrolls++;await progress('Sonuç listesi kaydırılıyor…');
        await sleep(1800);
        if(document.querySelector('[role="progressbar"], [aria-busy="true"]'))await sleep(1800);
      }
    }catch(error){
      if(error.message!=='STOP')await chrome.runtime.sendMessage({type:'error',jobId:job.id,message:error.message}).catch(()=>{});
    }finally{running=false;}
    async function collect(target,single){
      check();await progress('İşletme detayları yükleniyor…',target.name);
      const before=heading();
      if(!single){
        const link=[...document.querySelectorAll('a[href*="/maps/place/"]')].find(a=>keyFor(a.href)===target.key);
        if(!link)return;
        link.click();
        await waitFor(()=>location.pathname.includes('/maps/place/')&&keyFor(location.href)===target.key);
        await waitFor(()=>{const h=heading();return h&&(!target.name||tidy(h.textContent)===target.name)&&(h!==before||tidy(h.textContent)===target.name);},30000);
      }
      await waitFor(()=>document.querySelector('button[data-item-id="address"],button[data-item-id^="phone:tel:"],a[data-item-id="authority"]')||document.querySelector('[role="main"] h1'),30000);
      await sleep(1300);check();
      const address=document.querySelector('button[data-item-id="address"]');
      const phone=document.querySelector('button[data-item-id^="phone:tel:"]');
      const website=document.querySelector('a[data-item-id="authority"]');
      const rating=document.querySelector('[role="main"] [role="img"][aria-label*="yıldız"], [role="main"] [role="img"][aria-label*="stars"]');
      const review=document.querySelector('button[jsaction*="moreReviews"]');
      const name=tidy(heading()?.textContent);
      if(!name)throw new Error('İşletme başlığı okunamadı; yanlış kayıt oluşturmamak için tarama durduruldu.');
      await send('row',{row:{key:target.key,name,phone:phone?.getAttribute('data-item-id').replace(/^phone:tel:/,'')||'',
        address:tidy(address?.querySelector('.Io6YTe')?.textContent||address?.textContent),website:website?.href||'',
        rating:rating?.getAttribute('aria-label')||'',reviews:tidy(review?.textContent),mapsUrl:target.href,collectedAt:new Date().toISOString()}});
      seen.add(target.key);if(cancelled)return;
      if(!single&&!feedNow()){
        const back=document.querySelector('button[aria-label="Geri"],button[aria-label="Back"],button[jsaction*="backToList"]');
        if(back)back.click();else history.back();
        await waitFor(feedNow,30000);
      }
    }
  }
  chrome.storage.onChanged.addListener((changes,area)=>{
    if(area!=='local'||!changes.job)return;
    const job=changes.job.newValue;
    if(localJob&&job?.id===localJob.id){localJob=job;overlay(job);if(!['pending','running'].includes(job.status))cancelled=true;}
    if(job?.status==='pending')start();
  });
  start();
})();
