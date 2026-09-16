const VERSION='2026.09-r2-bootstrap';
const PREFIX='mmg-gym-';
const SHELL=PREFIX+'shell-'+VERSION;
const MEDIA=PREFIX+'media-'+VERSION;
const SHELL_URLS=['./','./index.html','./r2.payload.b64','./manifest.webmanifest'];
const MEDIA_MAX=180;

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(SHELL).then(cache=>cache.addAll(SHELL_URLS)));
});

self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    for(const key of await caches.keys()){
      if(key.startsWith(PREFIX)&&key!==SHELL&&key!==MEDIA) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

async function trim(cache,max){
  const keys=await cache.keys();
  while(keys.length>max) await cache.delete(keys.shift());
}

self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET') return;
  const url=new URL(request.url);
  if(url.origin!==self.location.origin) return;

  if(request.mode==='navigate'){
    event.respondWith(fetch(request).catch(async()=>{
      return (await caches.match('./index.html'))||(await caches.match('./legacy-base.html'));
    }));
    return;
  }

  if(/\/(images|videos)\//.test(url.pathname)){
    event.respondWith(caches.open(MEDIA).then(async cache=>{
      const hit=await cache.match(request);
      if(hit) return hit;
      const response=await fetch(request);
      if(response.ok){
        await cache.put(request,response.clone());
        trim(cache,MEDIA_MAX);
      }
      return response;
    }));
    return;
  }

  if(url.pathname.endsWith('/r2.payload.b64')||url.pathname.endsWith('/manifest.webmanifest')||url.pathname.endsWith('/index.html')){
    event.respondWith(caches.match(request).then(hit=>hit||fetch(request).then(async response=>{
      if(response.ok) (await caches.open(SHELL)).put(request,response.clone());
      return response;
    })));
  }
});

self.addEventListener('message',event=>{
  if(event.data?.type==='SKIP_WAITING') self.skipWaiting();
  if(event.data?.type==='GET_VERSION') event.source?.postMessage({type:'VERSION',version:VERSION});
});
