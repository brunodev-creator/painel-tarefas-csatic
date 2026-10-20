/* Testes de fumaça do SIG CSA-TIC: sem dependências, no navegador, sobre o modo demonstração.
 * Abra gestao/tests/smoke.html por um servidor local (ex.: py -m http.server 8080 na raiz)
 * e clique em "Executar testes". O resultado também fica em window.SMOKE_RESULT e no título.
 */
(() => {
'use strict';
const frame=document.getElementById('app');
const list=document.getElementById('results');
const summary=document.getElementById('summary');
const runButton=document.getElementById('run');
const APP_URL='../index.html';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
let win=null,doc=null,errors=[];

function assert(cond,msg){if(!cond)throw Error(msg);}
async function until(fn,msg,timeout=4000){
 const end=Date.now()+timeout;
 while(Date.now()<end){try{const v=fn();if(v)return v;}catch{}await wait(40);}
 throw Error('Tempo esgotado: '+msg);
}
// Carrega o app em modo demonstração, com dados fictícios novos e o perfil pedido.
async function loadApp({role='admin',width=1440,height=820,keepData=false}={}){
 localStorage.setItem('sig-csatic-connect-v1',JSON.stringify({mode:'demo'}));
 if(!keepData)localStorage.removeItem('sig-csatic-demo-v1');
 localStorage.setItem('sig-csatic-role-v1',role);
 frame.style.width=width+'px';frame.style.height=height+'px';
 const loaded=new Promise(r=>frame.addEventListener('load',r,{once:true}));
 frame.src=APP_URL+'?smoke='+Date.now();
 await loaded;
 win=frame.contentWindow;doc=frame.contentDocument;errors=[];
 win.addEventListener('error',e=>errors.push(e.message));
 win.addEventListener('unhandledrejection',e=>errors.push(String(e.reason?.message||e.reason)));
 await until(()=>doc.querySelector('#nav .navitem'),'menu não apareceu');
}
const $=sel=>doc.querySelector(sel);
const $$=sel=>[...doc.querySelectorAll(sel)];
function click(sel){const el=typeof sel==='string'?$(sel):sel;assert(el,'Elemento não encontrado: '+sel);el.click();return el;}
function setValue(el,value,event='input'){el.value=value;el.dispatchEvent(new win.Event(event,{bubbles:true}));}
function heading(){return ($('#content h1')?.textContent||'').trim();}
function noErrors(){assert(!errors.length,'Erros no console: '+errors.join(' | '));}

const tests=[];
const test=(name,fn)=>tests.push({name,fn});

for(const role of ['admin','compras','licitacao','sofi','chefe_compras','leitura']){
 test('Perfil '+role+': todos os menus abrem sem erro',async()=>{
  await loadApp({role});
  const views=$$('#nav [data-view]').map(b=>b.dataset.view);
  assert(views.length>=3,'Menu com poucos itens: '+views.length);
  for(const v of views){
   click('#nav [data-view="'+v+'"]');await wait(60);
   assert(heading(),'Menu "'+v+'" sem título');
   assert($('#nav .navitem.active')?.getAttribute('aria-current')==='page','Menu "'+v+'" sem aria-current');
  }
  noErrors();
 });
}
test('Celular (375px): nenhum menu com rolagem horizontal',async()=>{
 await loadApp({role:'admin',width:375,height:812});
 const bad=[];
 for(const v of $$('#nav [data-view]').map(b=>b.dataset.view)){
  click('#nav [data-view="'+v+'"]');await wait(60);
  if(doc.documentElement.scrollWidth>375+1)bad.push(v+' ('+doc.documentElement.scrollWidth+'px)');
 }
 assert(!bad.length,'Rolagem horizontal em: '+bad.join(', '));
 noErrors();
});
test('Tela inicial mostra "O que exige sua ação agora"',async()=>{
 await loadApp({role:'compras'});
 const panel=await until(()=>$('.sig-now'),'painel não apareceu');
 assert(/ação agora|Tudo em dia/.test(panel.textContent),'Título do painel inesperado');
 noErrors();
});
test('Assumir pela tela inicial e validar conclusão (mensagem de erro)',async()=>{
 await loadApp({role:'compras'});
 const claim=await until(()=>$('.sig-now [data-action=claimTask]'),'nenhuma tarefa na fila');
 const id=claim.dataset.id;claim.click();await wait(80);
 assert($('.toast-success'),'Sem mensagem de sucesso ao assumir');
 click('#nav [data-view=tarefas]');await wait(40);
 click('[data-action=v4FinishTask][data-id="'+id+'"]');
 const form=await until(()=>$('form[data-form=v4FinishTask]'),'modal de conclusão não abriu');
 form.elements.conclusao_observacao.value='ok';
 form.querySelector('button[value=concluir]').click();await wait(80);
 assert($('.toast-error[role=alert]'),'Justificativa curta não gerou erro acessível');
 noErrors();
});
test('Abas de tarefas mostram contagem',async()=>{
 await loadApp({role:'licitacao'});
 click('#nav [data-view=tarefas]');await wait(60);
 assert($$('.sig-task-tabs .sig-count').length>=1,'Nenhuma contagem nas abas');
 noErrors();
});
test('Avatar abre o perfil (não o convite de usuário)',async()=>{
 await loadApp({role:'admin'});
 click('[data-action=profile]');await wait(40);
 assert(($('#modal-root h2')?.textContent||'')==='Perfil de acesso','Abriu: '+($('#modal-root h2')?.textContent||'nada'));
 assert(!$('#toast-root .toast'),'Mensagem inesperada ao abrir o perfil: '+($('#toast-root .toast')?.textContent||''));
 noErrors();
});
test('Assistente responde pergunta digitada',async()=>{
 await loadApp({role:'admin'});
 click('#nav [data-view=assistente]');await wait(40);
 const form=$('#chat-form');form.elements.question.value='O que está atrasado?';
 form.querySelector('button[type=submit]').click();
 await until(()=>$$('.chat-msg.user').length===1&&$$('.chat-msg.bot').some(m=>/PROCESSOS COM ALERTA/.test(m.textContent)),'assistente não respondeu');
 noErrors();
});
test('Busca global encontra e abre processo',async()=>{
 await loadApp({role:'admin'});
 const q=$('#sig-global-q');assert(q&&!$('#sig-global-search').hidden,'Busca global não visível');
 setValue(q,'equipamentos de rede');
 const item=await until(()=>$('.sig-global-item'),'sem resultados');
 assert(item.textContent.includes('DEMO-001/2026'),'Resultado inesperado: '+item.textContent);
 item.click();await wait(40);
 assert(($('#modal-root h2')?.textContent||'')==='Detalhes do processo','Detalhe não abriu');
 noErrors();
});
test('Nova tarefa herda dados do processo',async()=>{
 await loadApp({role:'compras'});
 click('#nav [data-view=compras]');await wait(40);
 click('.sig-buy-list [data-action=detail][data-id="d-p1"]');
 click('#modal-root [data-action=newTask]');
 const form=await until(()=>$('form[data-form=task]'),'formulário de tarefa não abriu');
 assert(form.elements.titulo.value==='Concluir revisão do TR','Título: '+form.elements.titulo.value);
 assert(form.elements.prioridade.value==='Alta','Prioridade: '+form.elements.prioridade.value);
 noErrors();
});
test('Solicitação de empenho sugere dotação e valor',async()=>{
 await loadApp({role:'sofi'});
 click('#nav [data-view=sofi]');await wait(40);
 click('[data-action=v4NewRequest][data-process="d-p3"]');
 const form=await until(()=>$('form[data-form=v4Request]'),'formulário não abriu');
 assert(form.elements.dotacao.value==='DEMO-33.90.30','Dotação: '+form.elements.dotacao.value);
 assert(Number(form.elements.valor_solicitado.value)===90000,'Valor: '+form.elements.valor_solicitado.value);
 noErrors();
});
test('Detalhe do processo mostra o próximo passo',async()=>{
 await loadApp({role:'admin'});
 click('#nav [data-view=dashboard]');await wait(40);
 click('#content .row-item [data-action=detail]');
 assert($('.sig-next-step .btn.primary'),'Faixa de próximo passo ausente');
 noErrors();
});
test('Trocar o destino do encaminhamento não gera erro',async()=>{
 await loadApp({role:'admin'});
 const form=doc.createElement('form');form.dataset.form='transfer';
 form.innerHTML='<select name="destino"><option>SOFI</option><option>Compras</option></select>';
 $('#modal-root').appendChild(form);
 setValue(form.querySelector('select'),'Compras','change');await wait(40);
 form.remove();
 noErrors();
});
test('Tabelas viram cartões com rótulos no celular',async()=>{
 await loadApp({role:'admin',width:375,height:812});
 click('#nav [data-view=processos]');await wait(60);
 const td=$('.data-table tbody td[data-label]');
 assert(td,'Células sem data-label');
 assert(win.getComputedStyle($('.data-table tbody tr')).display==='block','Linha não virou cartão');
 noErrors();
});

test('Compras: cartão mostra AIPC e próximo passo',async()=>{
 await loadApp({role:'compras'});
 click('#nav [data-view=compras]');await wait(40);
 const item=[...$$('.sig-buy-item')].find(x=>x.textContent.includes('DEMO-004/2026'));
 assert(item,'Cartão DEMO-004/2026 ausente');
 assert(/AIPC pendente/.test(item.textContent),'Situação da AIPC ausente no cartão');
 assert([...item.querySelectorAll('.btn.primary')].some(b=>/AIPC|Encaminhar/.test(b.textContent)),'Botão de próximo passo ausente');
 noErrors();
});
test('Compras: modalidade filtra pela etiqueta',async()=>{
 await loadApp({role:'compras'});
 click('#nav [data-view=compras]');await wait(40);
 click('.sig-buy-chip[data-service="COTEP"]');await wait(40);
 assert($('.sig-buy-chip[data-service="COTEP"]').getAttribute('aria-pressed')==='true','Etiqueta não ficou selecionada');
 assert(!$('.sig-buy-service-toggle'),'Botão antigo de modalidades ainda presente');
 noErrors();
});
test('Compras: "Registrar andamento" grava processo e histórico',async()=>{
 await loadApp({role:'compras'});
 click('#nav [data-view=compras]');await wait(40);
 click('[data-action=progressForm][data-id="d-p1"]');
 const form=await until(()=>$('form[data-form=andamento]'),'formulário de andamento não abriu');
 assert(form.elements.proxima_acao.value==='Concluir revisão do TR','Próxima providência não veio preenchida');
 form.elements.proxima_acao.value='Enviar TR revisado para a chefia';
 form.elements.observacao.value='Revisão do TR concluída com o requisitante.';
 form.querySelector('button[type=submit]').click();
 await until(()=>$('.toast-success'),'sem mensagem de sucesso');
 const data=JSON.parse(localStorage.getItem('sig-csatic-demo-v1'));
 assert(data.processos.find(p=>p.id==='d-p1').proxima_acao==='Enviar TR revisado para a chefia','Processo não atualizado');
 assert(data.eventos.some(e=>e.processo_id==='d-p1'&&/^Andamento — Revisão do TR concluída/.test(e.descricao)),'Histórico não registrado');
 noErrors();
});
test('Compras: aba "Enviados" mostra processos que saíram da Compras',async()=>{
 await loadApp({role:'compras'});
 const data=JSON.parse(localStorage.getItem('sig-csatic-demo-v1'));
 data.tramites.unshift({id:'smoke-tr',processo_id:'d-p2',origem:'Compras',destino:'Licitação',tipo:'Encaminhamento',motivo:'Teste',proxima_acao:'Analisar propostas',responsavel_destino:'Fila da Licitação',criado_em:new Date().toISOString()});
 localStorage.setItem('sig-csatic-demo-v1',JSON.stringify(data));
 await loadApp({role:'compras',keepData:true});
 click('#nav [data-view=compras]');await wait(40);
 click('.sig-buy-metric[data-filter="sent"]');await wait(40);
 const item=[...$$('.sig-buy-sent')].find(x=>x.textContent.includes('DEMO-002/2026'));
 assert(item,'Processo enviado não aparece');
 assert(/Agora na Licitação/.test(item.textContent),'Seção atual ausente');
 noErrors();
});
test('Menu intersetorial se chama "Acompanhar seções"',async()=>{
 await loadApp({role:'compras'});
 assert(/Acompanhar seções/.test($('#nav [data-view=processos]')?.textContent||''),'Rótulo antigo no menu');
 noErrors();
});

async function run(){
 runButton.disabled=true;list.innerHTML='';summary.className='';summary.textContent='Executando…';
 const saved=Object.fromEntries(Object.keys(localStorage).map(k=>[k,localStorage.getItem(k)]));
 const out=[];
 try{
  for(const t of tests){
   const li=document.createElement('li');li.textContent=t.name;list.appendChild(li);
   try{await t.fn();li.className='pass';out.push({name:t.name,ok:true});}
   catch(e){li.className='fail';const s=document.createElement('small');s.textContent=e.message;li.appendChild(s);out.push({name:t.name,ok:false,error:e.message});}
  }
 }finally{
  localStorage.clear();
  for(const [k,v] of Object.entries(saved))localStorage.setItem(k,v);
  runButton.disabled=false;
 }
 const failed=out.filter(x=>!x.ok).length;
 summary.className=failed?'fail':'pass';
 summary.textContent=failed?failed+' de '+out.length+' testes falharam.':'Todos os '+out.length+' testes passaram.';
 document.title=(failed?'FAIL':'PASS')+' '+(out.length-failed)+'/'+out.length+' · SIG testes';
 window.SMOKE_RESULT={passed:out.length-failed,failed,results:out};
 return window.SMOKE_RESULT;
}
runButton.addEventListener('click',run);
window.runSmoke=run;
if(new URLSearchParams(location.search).has('auto'))run();
})();
