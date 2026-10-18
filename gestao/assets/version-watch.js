/* SIG CSA-TIC: avisa quando uma aba aberta estiver usando interface desatualizada.
 * Não faz recargas automáticas: preserva formulários e edições em andamento.
 */
(function(){
 'use strict';
 const script=document.querySelector('script[src*="assets/app.js"]');
 const current=(script?.getAttribute('src')||'').match(/[?&]v=([a-zA-Z0-9._-]+)/)?.[1];
 if(!current)return;
 let checking=false,lastSeen='';
 function promptUpdate(latest){
  if(!/^[a-zA-Z0-9._-]{1,90}$/.test(latest)||latest===current)return;
  if(lastSeen===latest)return;
  lastSeen=latest;
  let panel=document.getElementById('sig-new-version');
  if(!panel){
   panel=document.createElement('aside');
   panel.id='sig-new-version';
   panel.setAttribute('role','status');
   panel.setAttribute('aria-live','polite');
   panel.style.cssText='position:fixed;right:18px;bottom:18px;z-index:250;max-width:min(420px,calc(100vw - 30px));padding:16px 18px;border-radius:14px;background:#202735;color:#fff;border:1px solid #c2a66d;box-shadow:0 16px 38px rgba(0,0,0,.25);font:14px system-ui,sans-serif;line-height:1.5;';
   const message=document.createElement('div');
   message.textContent='Uma versão atualizada do SIG está disponível. Atualize para ver os menus e correções mais recentes.';
   const btn=document.createElement('button');
   btn.type='button';
   btn.textContent='Atualizar SIG';
   btn.style.cssText='display:block;margin-top:12px;padding:10px 15px;border:1px solid #c2a66d;border-radius:8px;background:#e8d8b3;color:#1e2735;font-weight:700;cursor:pointer;';
   btn.addEventListener('click',()=>{
    const url=new URL(window.location.href);
    url.searchParams.set('sig_version',latest);
    window.location.assign(url.href);
   });
   panel.append(message,btn);document.body.appendChild(panel);
  }
 }
 async function check(){
  if(checking||document.visibilityState==='hidden')return;
  checking=true;
  try{
   const url=new URL('./index.html',document.baseURI);
   url.searchParams.set('_sig_check',String(Date.now()));
   const response=await fetch(url.href,{cache:'no-store'});
   if(!response.ok)return;
   const html=await response.text();
   const latest=html.match(/assets\/app\.js\?v=([a-zA-Z0-9._-]+)/)?.[1];
   if(latest)promptUpdate(latest);
  }catch(_){/* Sem rede: seguir com a página atual. */}
  finally{checking=false;}
 }
 window.addEventListener('focus',check,{passive:true});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)check()});
 setInterval(check,180000);
 check();
})();