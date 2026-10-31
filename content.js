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
      shadow.innerHTML='<style>:host{font:13px system-ui}.card{width:270px;padding:18px;border-radius:16px;background:rgba(10,22,47,.94);border:1px solid #3b527a;color:#eaf1ff;box-shadow:0 12px 35px #0005;backdrop-filter:blur(16px)}h3{font-size:12px;letter-spacing:1px;color:#67d8ed;margin:0 0 14px}.grid{display:flex;justify-content:space-between}b{display:block;font-size:22px;color:#83e4f1}small{color:#a3b4d3;font-size:10px}p{line-height:1.5;margin:12px 0 0;overflow-wrap:anywhere}.current{color:#9bbaff}</style><div class="card"><h3>HARİTA / CANLI TARAMA</h3><div class="grid"><div><b id="s">0</b><small>Kaydırma</small></div><div><b id="n">0</b><small>Toplanan</small></div><div><b id="t">0</b><small>Hedef</small></div></div><p id="m"></p><p id="c" class="current"></p><p id="q" class="current"></p></div>';
      document.documentElement.append(host);card=shadow;
    }
    card.getElementById('s').textContent=job.scrolls||0;card.getElementById('n').textContent=job.rows.length;
    card.getElementById('t').textContent=job.limit;card.getElementById('m').textContent=job.message;
    card.getElementById('c').textContent=job.currentName||'';
    card.getElementById('q').textContent=job.deepScan?`${job.phase==='discover'?'Mahalle keşfi':`${job.currentArea||'İlçe geneli'} (${job.queueIndex+1}/${job.queue.length})`} • ${job.rows.length} benzersiz`:'';
  }
  const blocked=()=>Boolean(document.querySelector('iframe[src*="recaptcha"],#captcha-form,form[action*="consent"]'))||/\/sorry\//.test(location.href);
  function check(){if(cancelled)throw new Error('STOP');if(blocked())throw new Error('CAPTCHA veya izin ekranı: Maps üzerinde manuel kontrol gerekli.');}
  async function send(type,extra={}){
    check();const response=await chrome.runtime.sendMessage({type,jobId:localJob.id,stage:localJob.stage,...extra});
    if(!response?.ok)throw new Error(response?.error||'Eklenti bağlantısı kesildi.');
    if(response.result?.status&&(!['pending','running'].includes(response.result.status)||response.result.stage!==localJob.stage))cancelled=true;
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
  function readCard(link) {
    const result={name:tidy(link?.getAttribute('aria-label')),phone:'',address:'',website:'',rating:'',reviews:''};
    try {
      const root=link?.closest('[role="article"], .Nv2PK')||link?.parentElement;
      if(!root)return result;
      const text=root.innerText||root.textContent||'';
      const phone=root.querySelector('a[href^="tel:"]');
      result.phone=phone?.getAttribute('href').replace(/^tel:/,'')||
        (text.match(/(?:\+90[ \-.()]*)?(?:0[ \-.()]*)?5\d{2}[ \-.()]*\d{3}[ \-.()]*\d{2}[ \-.()]*\d{2}(?!\d)/)||
         text.match(/(?:\+90[ \-.()]*|0[ \-.()]*)[234]\d{2}[ \-.()]*\d{3}[ \-.()]*\d{2}[ \-.()]*\d{2}(?!\d)/)||[])[0]||'';
      const website=[...root.querySelectorAll('a[href]')].find(a=>
        /website|web sitesi|siteyi ziyaret/i.test((a.getAttribute('aria-label')||'')+' '+a.textContent));
      if(website){const u=new URL(website.href,location.origin);if(/^https?:$/.test(u.protocol))result.website=u.href;}
      result.address=tidy(root.querySelector('[data-item-id="address"], [itemprop="streetAddress"]')?.textContent);
      if(!result.address){
        const lines=text.split(/\n|•|·/).map(tidy);
        result.address=lines.find(line=>/\b(?:cadde|caddesi|sokak|sokağı|mahalle|mahallesi|bulvar|bulvarı)\b|(?:Cd|Sk|Mah|Blv)\./i.test(line))||'';
      }
      result.rating=tidy(root.querySelector('.MW4etd')?.textContent)||
        root.querySelector('[role="img"][aria-label*="yıldız"], [role="img"][aria-label*="stars"]')?.getAttribute('aria-label')||'';
      result.reviews=tidy(root.querySelector('.UY7F9')?.textContent);
    } catch(error) { console.debug('Kart kısmen okundu:',error.message); }
    return result;
  }
  async function extractDetails(target,link,single,base) {
    const result={...base};
    const deadline=Date.now()+2000;
    const absoluteDeadline=deadline+500;
    let clicked=false;
    try {
      if(!single){if(!link)return result;link.focus({preventScroll:true});link.click();clicked=true;}
      while(Date.now()<deadline){
        check();
        try {
          const h=heading();
          // Never copy the previous business's fields while navigation is pending.
          if(h&&(!target.name||tidy(h.textContent)===target.name)){
            result.name=target.name||tidy(h.textContent);
            const address=document.querySelector('button[data-item-id="address"]');
            const phone=document.querySelector('button[data-item-id^="phone:tel:"]');
            const website=document.querySelector('a[data-item-id="authority"]');
            result.phone=result.phone||phone?.getAttribute('data-item-id').replace(/^phone:tel:/,'')||'';
            result.address=result.address||tidy(address?.querySelector('.Io6YTe')?.textContent||address?.textContent);
            result.website=result.website||website?.href||'';
            result.rating=result.rating||document.querySelector('[role="main"] [role="img"][aria-label*="yıldız"], [role="main"] [role="img"][aria-label*="stars"]')?.getAttribute('aria-label')||'';
            result.reviews=result.reviews||tidy(document.querySelector('button[jsaction*="moreReviews"]')?.textContent);
            if(result.phone&&result.address&&result.website)break;
          }
        } catch(error) { console.debug('Detay kısmen okundu:',error.message);break; }
        await sleep(Math.min(100,Math.max(0,deadline-Date.now())));
      }
    } catch(error) {
      if(error.message==='STOP'||blocked())throw error;
      console.debug('Detay atlandı:',error.message);
    } finally {
      // Returning to results shares the same 2.5-second budget; no 30/90s detail waits.
      if(clicked&&!cancelled){
        try {
      if(!feedNow()){
            const back=document.querySelector('button[aria-label="Geri"],button[aria-label="Back"],button[jsaction*="backToList"]');
            if(back)back.click();else history.back();
            while(!feedNow()&&Date.now()<absoluteDeadline&&!cancelled)await sleep(Math.min(50,Math.max(0,absoluteDeadline-Date.now())));
          }
        }catch(error){console.debug('Listeye dönüş:',error.message);}
      }
    }
    return result;
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
  async function discoverAreas(progress){
    const names=new Map();let stable=0;
    for(let turn=0;turn<12&&!cancelled;turn++){
      check();const feed=feedNow();
      const before=names.size;
      const texts=feed?[...feed.querySelectorAll('a[aria-label], [role="article"], .Nv2PK')].map(el=>el.getAttribute('aria-label')||el.innerText||''):[];
      // Neighborhood labels must be explicit; do not invent a grid or infer addresses as neighborhoods.
      texts.push(...(document.body.innerText||'').split('\n'));
      for(const text of texts){
        const match=tidy(text).match(/^([A-Za-zÇĞİÖŞÜçğıöşü0-9][A-Za-zÇĞİÖŞÜçğıöşü0-9 .'-]{1,60}?)\s+(?:Mahallesi|Mah\.)(?:$|[,·])/i);
        if(match&&!/cadde|sokak|bulvar|muhtar|\d{5}/i.test(match[1]))names.set(normalizeArea(match[1]),match[1]);
      }
      stable=before===names.size?stable+1:0;
      if(!feed||endText(feed)||stable>=4)break;
      feed.scrollTop=feed.scrollHeight;
      localJob.scrolls=(localJob.scrolls||0)+1;
      await progress(`Mahalle keşfi: ${names.size} aday bulundu`);
      await sleep(1400);
    }
    await send('discovered',{areas:[...names.values()]});
  }
  function normalizeArea(value){return value.toLocaleLowerCase('tr-TR').trim();}
  async function start(){
    if(running)return;
    const {job}=await chrome.storage.local.get('job');
    if(!job||!['pending','running'].includes(job.status))return;
    const identity=await chrome.runtime.sendMessage({type:'identify-tab'}).catch(()=>null);
    if(identity?.result?.tabId!==job.tabId)return;
    running=true;cancelled=false;localJob=job;overlay(job);
    let scrolls=job.scrolls||0;
    const seen=new Set(job.rows.map(r=>r.key));
    const progress=(message,currentName='')=>send('progress',{message,currentName,scrolls:Math.max(scrolls,localJob.scrolls||0)});
    try{
      await progress('Maps hazırlanıyor; sonuç paneli bekleniyor…');
      await waitFor(()=>document.readyState!=='loading'&&(feedNow()||(location.pathname.includes('/maps/place/')&&heading())||/sonuç bulunamadı|no results found/i.test(document.body.innerText)));
      // A brief quiet interval prevents treating a newly mounted, empty feed as its end.
      await sleep(1500);check();
      if(job.phase==='discover'){await discoverAreas(progress);return;}
      if(!feedNow()){
        if(location.pathname.includes('/maps/place/')&&heading())await collect({href:location.href,key:keyFor(location.href),name:tidy(heading().textContent)},true);
        await send('complete');return;
      }
      let unchanged=0,previousSignature='';
      while(!cancelled){
        check();const feed=await waitFor(feedNow,5000);
        const targets=[...feed.querySelectorAll('a[href*="/maps/place/"]')].map(a=>({href:a.href,key:keyFor(a.href),name:tidy(a.getAttribute('aria-label')),link:a,card:readCard(a)}));
        const unique=[...new Map(targets.map(t=>[t.key,t])).values()];
        for(const target of unique){
          if(seen.has(target.key))continue;
          await collect(target,false);if(cancelled)return;
        }
        const list=await waitFor(feedNow,5000);
        if(endText(list)){await send('complete');return;}
        const signature=unique.map(t=>t.key).join('|')+':'+list.scrollHeight;
        const atBottom=list.scrollTop+list.clientHeight>=list.scrollHeight-8;
        unchanged=signature===previousSignature&&atBottom?unchanged+1:0;
        if(unchanged>=4){await send('complete');return;}
        previousSignature=signature;
        list.scrollTop=list.scrollHeight;
        scrolls++;await progress('Sonuç listesi kaydırılıyor…');
        await sleep(1800);
        if(document.querySelector('[role="progressbar"], [aria-busy="true"]'))await sleep(1800);
      }
    }catch(error){
      if(error.message!=='STOP'&&job.phase==='discover'&&!blocked()){
        await send('discovered',{areas:[]}).catch(()=>{});
      }else if(error.message!=='STOP')await chrome.runtime.sendMessage({type:'error',jobId:job.id,stage:job.stage,message:error.message}).catch(()=>{});
    }finally{running=false;}
    async function collect(target,single){
      check();
      const base=target.card||{name:target.name,phone:'',address:'',website:'',rating:'',reviews:''};
      const known=new Set(localJob.aliases||[]);
      if(identities({...base,key:target.key,mapsUrl:target.href}).some(id=>known.has(id))){seen.add(target.key);return;}
      await progress('İşletme kartı okunuyor…',target.name);
      let details=base;
      if(!(base.phone&&base.address&&base.website)){
        await progress('İşletme detayları yükleniyor… (en fazla 2,5 sn)',target.name);
        details=await extractDetails(target,target.link,single,base);
      }
      check();
      await send('row',{row:{...details,key:target.key,name:target.name||details.name||'İsimsiz işletme',
        mapsUrl:target.href,collectedAt:new Date().toISOString()}});
      seen.add(target.key);
      if(!cancelled)await progress('İşletme kaydedildi; sıradaki karta geçiliyor…',target.name);
    }
  }
  chrome.storage.onChanged.addListener((changes,area)=>{
    if(area!=='local'||!changes.job)return;
    const job=changes.job.newValue;
    if(localJob&&job?.id===localJob.id){if(job.stage!==localJob.stage||!['pending','running'].includes(job.status))cancelled=true;localJob=job;overlay(job);}
    // New searches are started by the next document load, never by the old page.
  });
  start();
})();
