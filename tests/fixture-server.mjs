import http from 'node:http';
export function fixtureServer() {
  const server=http.createServer((req,res)=>{
    if(req.url==='/slow.svg'){res.setHeader('Content-Type','image/svg+xml');setTimeout(()=>res.end('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"></svg>'),800);return;}
    if(req.url==='/style.css'){res.setHeader('Content-Type','text/css');res.end('@import "/more.css"; body{background:#f5f1e9;font-family:Tahoma}.logo{width:40px;height:40px;background-image:url(/icon.svg)}');return;}
    if(req.url==='/more.css'){res.setHeader('Content-Type','text/css');res.end('h1{color:#80522d}');return;}
    if(req.url==='/icon.svg'){res.setHeader('Content-Type','image/svg+xml');res.end('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="#80522d"/></svg>');return;}
    if(req.url==='/frame'){res.end('<html><body><p>Вложенный документ</p><img src="/icon.svg"></body></html>');return;}
    if(req.url==='/unavailable'){res.writeHead(404);res.end('Missing');return;}
    res.setHeader('Content-Type','text/html; charset=utf-8');
    if(req.url.startsWith('/long')){res.end(`<!doctype html><html><head><title>Long page QA</title><style>*{box-sizing:border-box}html,body{margin:0;padding:0}body{width:${req.url.includes('wide')?'1500px':'100%'};height:2400px}.band{height:400px;padding:24px;font:24px sans-serif}.band:nth-child(odd){background:#bf342a}.band:nth-child(even){background:#23714f}.fixed{position:fixed;right:0;top:0;width:2px;height:8px;background:#000}</style></head><body>${Array.from({length:6},(_,i)=>`<section class="band">${i===0?'TOP':i===5?'BOTTOM':'BAND'} ${i+1} · Кириллица</section>`).join('')}<div class="fixed"></div></body></html>`);return;}
    res.end(`<!doctype html><html lang="ru"><head><title>Тестовый источник ${req.url}</title><link rel="stylesheet" href="/style.css"></head><body><h1>Публичный тестовый материал</h1><p>Генеральный директор Иван Иванов назначен на должность.</p><p>Unicode: العربية 😀 Кириллица</p><div class="logo"></div><img src="/icon.svg" srcset="/icon.svg 1x"><details open><summary>Данные</summary>Раскрытый текст</details>${req.url==='/slow'?'<img src="/slow.svg">':''}${req.url==='/complex'?'<iframe src="/frame"></iframe><img src="/unavailable"><video src="/movie.mp4"></video>':''}<input type="password" value="DO-NOT-ARCHIVE"><script>window.siteScriptRan=true;document.body.dataset.live='true'</script></body></html>`);
  });
  return new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve({server,url:'http://127.0.0.1:'+server.address().port})));
}
