/* SIG CSA-TIC — Cofre local opcional de relatórios V5/V6.
   Persiste APENAS ciphertext AES-256-GCM no IndexedDB do navegador.
   A senha do cofre não é armazenada nem transmitida. A cópia pertence à
   conta autenticada + projeto Supabase e não é compartilhada entre dispositivos.
   Necessita contexto seguro (HTTPS), WebCrypto e IndexedDB.
 */
(function(){
'use strict';
const DB_NAME='sig-csatic-finance-vault',STORE='reports',VERSION=1,ITERATIONS=210000;
const encoder=new TextEncoder(),decoder=new TextDecoder();
const toB64=bytes=>{
 let binary='';for(let i=0;i<bytes.length;i+=0x8000)binary+=String.fromCharCode(...bytes.subarray(i,i+0x8000));
 return btoa(binary);
};
const fromB64=s=>{const raw=atob(s),bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);return bytes;};
const supported=()=>!!(globalThis.crypto?.subtle&&globalThis.crypto?.getRandomValues&&globalThis.indexedDB);
function requireSupported(){if(!supported())throw Error('Este navegador não permite armazenamento local criptografado. Mantenha os arquivos JSON originais.')}
function open(){
 requireSupported();return new Promise((resolve,reject)=>{
  const req=indexedDB.open(DB_NAME,VERSION);
  req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(STORE))req.result.createObjectStore(STORE,{keyPath:'id'});};
  req.onsuccess=()=>resolve(req.result);
  req.onerror=()=>reject(req.error||new Error('Não foi possível abrir o cofre local.'));
  req.onblocked=()=>reject(new Error('Feche outras abas do SIG e tente novamente.'));
 });
}
async function transact(mode,method,arg){
 const db=await open();
 try{
  return await new Promise((resolve,reject)=>{
   const tx=db.transaction(STORE,mode);
   const store=tx.objectStore(STORE);
   const req=method==='get'?store.get(arg):method==='delete'?store.delete(arg):store.put(arg);
   let result;
   req.onsuccess=()=>{result=req.result;};
   req.onerror=()=>reject(req.error||new Error('Erro ao acessar cofre.'));
   tx.oncomplete=()=>resolve(result);
   tx.onerror=()=>reject(tx.error||new Error('Falha ao gravar cofre.'));
   tx.onabort=()=>reject(tx.error||new Error('Operação local cancelada.'));
  });
 }finally{db.close();}
}
function keyFor(user,project,kind){
 if(typeof user!=='string'||!user||typeof project!=='string'||!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(project)||!['v5','v6'].includes(kind))
  throw Error('Conta, projeto ou versão não identificados.');
 return 'v1|'+project.toLowerCase().replace(/\/$/,'')+'|'+user+'|'+kind;
}
async function derive(password,salt,iterations){
 const raw=await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveKey']);
 return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations,hash:'SHA-256'},raw,
  {name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
function validatePass(pwd){if(typeof pwd!=='string'||pwd.length<12)throw Error('Escolha uma frase-senha de pelo menos 12 caracteres para o cofre.');}
async function has(user,project,kind){
 const id=keyFor(user,project,kind);return !!(await transact('readonly','get',id));
}
async function save(user,project,kind,data,password){
 validatePass(password);
 const id=keyFor(user,project,kind);requireSupported();
 if(!data||typeof data!=='object')throw Error('Relatório inválido.');
 if((kind==='v5'&&data.sig_version!=='5.0.0')||(kind==='v6'&&data.sig_version!=='6.0.0'))throw Error('Versão do relatório incorreta.');
 // never persist original demo/test data by accident
 if(String(data.origem||'').toLowerCase().includes('demonstra')||String(data.origem||'').toLowerCase().includes('fictíc')||String(data.origem||'').toLowerCase().includes('simula'))
   throw Error('Exemplo fictício não precisa ser guardado.');
 const json=JSON.stringify(data);
 if(encoder.encode(json).length>5*1024*1024)throw Error('Limite local de 5 MB.');
 const salt=crypto.getRandomValues(new Uint8Array(16));
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const key=await derive(password,salt,ITERATIONS);
 const cipher=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:encoder.encode(id)},key,encoder.encode(json)));
 await transact('readwrite','put',{id,salt:toB64(salt),iv:toB64(iv),encrypted:toB64(cipher),iterations:ITERATIONS,createdAt:new Date().toISOString(),schema:1});
 return true;
}
async function unlock(user,project,kind,password){
 if(typeof password!=='string'||!password)throw Error('Informe a senha do cofre.');
 const id=keyFor(user,project,kind);
 const item=await transact('readonly','get',id);
 if(!item)throw Error('Não existe cópia protegida para esta conta neste navegador. Importe novamente o JSON.');
 if(item.schema!==1||item.iterations>500000||item.iterations<150000)throw Error('Versão do cofre não suportada.');
 try{
  const key=await derive(password,fromB64(item.salt),item.iterations);
  const clear=await crypto.subtle.decrypt({name:'AES-GCM',iv:fromB64(item.iv),additionalData:encoder.encode(id)},key,fromB64(item.encrypted));
  const result=JSON.parse(decoder.decode(clear));
  if(!result||result.sig_version!==(kind==='v5'?'5.0.0':'6.0.0'))throw Error('Arquivo salvo não corresponde à versão.');
  return result;
 }catch(e){throw Error('Não foi possível desbloquear. Confira a senha do cofre ou importe novamente o JSON.');}
}
async function remove(user,project,kind){await transact('readwrite','delete',keyFor(user,project,kind));return true;}
window.SIG_VAULT=Object.freeze({supported,save,unlock,remove,has});
})();
