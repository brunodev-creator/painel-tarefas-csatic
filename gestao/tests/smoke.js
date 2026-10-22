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

for(const role of ['admin','compras','licitacao','sofi','chefe_compras','leitura','dts1']){
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
test('Minhas tarefas mostra "O que exige sua ação agora" (e as outras telas não)',async()=>{
 await loadApp({role:'compras'});
 assert(!$('.sig-now'),'Painel aparece fora de Minhas tarefas');
 click('#nav [data-view=tarefas]');await wait(40);
 const panel=await until(()=>$('.sig-now'),'painel não apareceu');
 assert(/ação agora|Tudo em dia/.test(panel.textContent),'Título do painel inesperado');
 noErrors();
});
test('Assumir pelo painel e validar conclusão (mensagem de erro)',async()=>{
 await loadApp({role:'compras'});
 click('#nav [data-view=tarefas]');await wait(40);
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

// ===== Intenções de COTEP (limite por elemento-item, dados fictícios da demonstração) =====
const cotepCard=code=>$('.cotep-card[data-el="'+code+'"]');
const cotepSaldo=code=>(cotepCard(code)?.querySelector('.cotep-card-saldo b')?.textContent||'').replace(/\s/g,' ');
async function openCotep(opts){await loadApp(opts);win.confirm=()=>true;click('#nav [data-view=cotep]');await until(()=>$('.cotep-grid'),'painel COTEP não abriu');}
test('COTEP: painel por elemento-item com limite, saldo e alertas',async()=>{
 await openCotep({role:'admin'});
 assert(/65\.492,11/.test($('.cotep-page .sub')?.textContent||''),'Limite anual não exibido');
 assert($$('.cotep-card[data-el]').length>=4,'Cartões de elemento-item ausentes');
 // 3016: 30.250,50 + 19.800,00 consumidos + 6.500,00 em andamento = 56.550,50 → saldo 8.941,61
 assert(/8\.941,61/.test(cotepSaldo('3016')),'Saldo 3016 incorreto: '+cotepSaldo('3016'));
 // 5207: 47.100,00 + 12.000,00 = 59.100,00 → saldo 6.392,11 (90,2%: utilização elevada)
 assert(/6\.392,11/.test(cotepSaldo('5207')),'Saldo 5207 incorreto: '+cotepSaldo('5207'));
 assert(/Utilização elevada/.test(cotepCard('5207').textContent),'Alerta de utilização elevada ausente');
 assert(/Saldo/.test($('.cotep-legend')?.textContent||''),'Legenda ausente');
 noErrors();
});
test('COTEP: centro registra intenção em poucos cliques a partir do cartão',async()=>{
 await openCotep({role:'compras'});
 assert(!$('[data-action=cotepParametros]'),'Parâmetros visíveis para perfil sem gestão');
 click(cotepCard('3016'));
 await until(()=>$('#modal-root form[data-form=cotepIntencao]'),'formulário rápido não abriu');
 assert($('#modal-root .timeline, #modal-root .cotep-list'),'Histórico do elemento-item ausente');
 const f=$('#modal-root form[data-form=cotepIntencao]');
 assert(f.querySelector('[name=elemento_item]').value==='3016','Elemento-item não veio preenchido');
 setValue(f.querySelector('[name=centro]'),'Centro de Videomonitoramento (fictício)');
 setValue(f.querySelector('[name=objeto]'),'Toner para impressoras do centro');
 setValue(f.querySelector('[name=valor_estimado]'),'9.000,00');
 await until(()=>/acima do saldo/.test(f.querySelector('[data-cotep-sim]').textContent),'simulação de saldo não atualizou');
 setValue(f.querySelector('[name=valor_estimado]'),'1.000,00');
 setValue(f.querySelector('[name=justificativa]'),'Reposição do estoque do semestre');
 f.querySelector('button[type=submit]').click();
 await until(()=>!$('#modal-root form'),'modal não fechou após registrar');
 assert(/8\.941,61/.test(cotepSaldo('3016')),'Intenção pendente não pode abater saldo');
 assert(/2 pendente/.test(cotepCard('3016').textContent),'Pendência não contabilizada no cartão');
 noErrors();
});
test('COTEP: DTS-1 reserva, bloqueia excesso e gera COTEP sem dupla contagem',async()=>{
 await openCotep({role:'admin'});
 click('[data-action=cotepAba][data-tab=intencoes]');await wait(40);
 const linha=[...$$('.cotep-table tbody tr')].find(tr=>/Cartuchos/.test(tr.textContent));
 assert(linha,'Intenção fictícia não listada');
 click(linha.querySelector('[data-action=cotepReservar]'));await wait(60);
 assert(/Reservada/.test([...$$('.cotep-table tbody tr')].find(tr=>/Cartuchos/.test(tr.textContent)).textContent),'Reserva não aplicada');
 click('[data-action=cotepAba][data-tab=elementos]');await wait(40);
 assert(/4\.741,61/.test(cotepSaldo('3016')),'Reserva não abateu o saldo: '+cotepSaldo('3016'));
 // Excesso: reserva de 3.500,00 em 5207 é possível; depois tentar reservar acima do saldo.
 click('[data-action=cotepAba][data-tab=intencoes]');await wait(40);
 const sw=[...$$('.cotep-table tbody tr')].find(tr=>/Switches/.test(tr.textContent));
 click(sw.querySelector('[data-action=cotepIntencao]'));
 const dec=await until(()=>$('#modal-root form[data-form=cotepDecisao]'),'formulário de decisão');
 setValue(dec.querySelector('[name=valor]'),'3.500,00');
 dec.querySelector('button[type=submit]').click();
 await until(()=>!$('#modal-root form'),'decisão não concluiu');
 // Seleciona duas intenções reservadas e gera uma COTEP com dois elementos-itens.
 for(const nome of ['Cartuchos','Switches']){const tr=[...$$('.cotep-table tbody tr')].find(t=>t.textContent.includes(nome));click(tr.querySelector('.cotep-check'));await wait(40);}
 assert(/2 selecionada/.test($('.cotep-bulk')?.textContent||''),'Seleção em lote não exibida');
 click('[data-action=cotepGerarCotep]');
 const conv=await until(()=>$('#modal-root form[data-form=cotepConverter]'),'modal gerar COTEP');
 setValue(conv.querySelector('[name=numero]'),'D-40/2026');
 setValue(conv.querySelector('[name=objeto]'),'Suprimentos e rede (fictício)');
 conv.querySelector('button[type=submit]').click();
 await until(()=>!$('#modal-root form'),'COTEP não gerada');
 const row=[...$$('.cotep-table tbody tr')].find(tr=>/D-40\/2026/.test(tr.textContent));
 assert(row&&/3016/.test(row.textContent)&&/5207/.test(row.textContent),'COTEP com dois elementos-itens não listada');
 click('[data-action=cotepAba][data-tab=elementos]');await wait(40);
 assert(/4\.741,61/.test(cotepSaldo('3016'))&&/2\.892,11/.test(cotepSaldo('5207')),'Conversão alterou saldo (dupla contagem): '+cotepSaldo('3016')+' / '+cotepSaldo('5207'));
 // Finaliza com homologado menor: diferença volta ao saldo de cada código.
 click('[data-action=cotepAba][data-tab=coteps]');await wait(40);
 click([...$$('.cotep-table tbody tr')].find(tr=>/D-40\/2026/.test(tr.textContent)).querySelector('[data-action=cotepCotep]'));
 const cf=await until(()=>$('#modal-root form[data-form=cotepCotep]'),'formulário da COTEP');
 setValue(cf.querySelector('[name=situacao]'),'Finalizada','change');
 for(const r of cf.querySelectorAll('[data-item]')){const el=r.querySelector('[name=item_elemento]').value;setValue(r.querySelector('[name=item_homologado]'),el==='3016'?'4000':'3000');}
 cf.querySelector('button[type=submit]').click();
 await until(()=>!$('#modal-root form'),'COTEP não finalizada');
 click('[data-action=cotepAba][data-tab=elementos]');await wait(40);
 assert(/4\.941,61/.test(cotepSaldo('3016'))&&/3\.392,11/.test(cotepSaldo('5207')),'Diferença não liberada: '+cotepSaldo('3016')+' / '+cotepSaldo('5207'));
 noErrors();
});
test('COTEP: reserva acima do saldo é recusada',async()=>{
 await openCotep({role:'admin'});
 click('[data-action=cotepNova]');
 const f=await until(()=>$('#modal-root form[data-form=cotepIntencao]'),'nova intenção');
 setValue(f.querySelector('[name=centro]'),'Centro de Telecomunicações (fictício)');
 setValue(f.querySelector('[name=elemento_item]'),'5207');
 setValue(f.querySelector('[name=objeto]'),'Servidores de borda para salas técnicas');
 setValue(f.querySelector('[name=valor_estimado]'),'7000');
 setValue(f.querySelector('[name=justificativa]'),'Ampliação da capacidade de processamento');
 f.querySelector('button[type=submit]').click();
 await until(()=>!$('#modal-root form'),'intenção não registrada');
 click('[data-action=cotepAba][data-tab=intencoes]');await wait(40);
 const tr=[...$$('.cotep-table tbody tr')].find(t=>/Servidores de borda/.test(t.textContent));
 click(tr.querySelector('[data-action=cotepReservar]'));
 const dec=await until(()=>$('#modal-root form[data-form=cotepDecisao]'),'saldo insuficiente deve abrir a análise');
 setValue(dec.querySelector('[name=valor]'),'7000');
 dec.querySelector('button[type=submit]').click();await wait(120);
 assert(/Saldo insuficiente/.test(doc.getElementById('toast-root').textContent),'Bloqueio por saldo não informado');
 click('[data-action=closeModal]');await wait(40);
 assert(/Pendente/.test([...$$('.cotep-table tbody tr')].find(t=>/Servidores de borda/.test(t.textContent)).textContent),'Intenção mudou de situação após bloqueio');
 noErrors();
});
test('COTEP: celular 375px sem rolagem horizontal e com cartões em coluna',async()=>{
 await openCotep({role:'leitura',width:375,height:812});
 assert(doc.documentElement.scrollWidth<=376,'Painel com rolagem horizontal: '+doc.documentElement.scrollWidth);
 const cards=$$('.cotep-card');assert(cards.length>1&&Math.abs(cards[0].getBoundingClientRect().left-cards[1].getBoundingClientRect().left)<2,'Cartões não empilhados');
 click('[data-action=cotepAba][data-tab=intencoes]');await wait(40);
 assert(doc.documentElement.scrollWidth<=376,'Fila com rolagem horizontal');
 assert(!$('[data-action=cotepReservar]'),'Perfil de leitura vê ação da DTS-1');
 click(cotepCard('3016')||'[data-action=cotepElemento]');await wait(60);
 const m=$('#modal-root .modal');assert(m&&m.getBoundingClientRect().right<=376,'Modal ultrapassa a tela');
 noErrors();
});

test('COTEP: menu visível na barra lateral para todos os perfis',async()=>{
 for(const role of ['compras','licitacao','sofi','chefia','chefe_compras','chefe_licitacao','chefe_sofi','leitura','dts1']){
  await loadApp({role});
  const item=$('#nav [data-view=cotep]');
  assert(item&&win.getComputedStyle(item).display!=='none','Menu Intenções COTEP oculto para '+role);
 }
 noErrors();
});

test('Perfil DTS-1: só COTEP, Contratos continuados, Almoxarifado, Cota e Acompanhar seções, abrindo em COTEP',async()=>{
 await loadApp({role:'dts1'});
 const views=$$('#nav [data-view]').filter(b=>win.getComputedStyle(b).display!=='none').map(b=>b.dataset.view).sort().join(',');
 assert(views==='almoxarifado,continuados,cotas,cotep,processos','Menus do perfil DTS-1: '+views);
 assert(/Intenções de COTEP/.test(heading()),'Perfil DTS-1 não abriu em Intenções COTEP: '+heading());
 noErrors();
});

test('COTEP: os 15 elementos-itens de TIC aparecem mesmo sem movimento',async()=>{
 await openCotep({role:'admin'});
 const tic=['3016','3015','3020','3022','3005','3017','3019','3021','3030','3031','3039','3041','3099','4002','4006'];
 const faltam=tic.filter(c=>!cotepCard(c));
 assert(!faltam.length,'Elementos TIC ausentes: '+faltam.join(', '));
 assert(/Elementos-itens de TIC/.test($('.cotep-page').textContent),'Grupo TIC sem título');
 click(cotepCard('4006'));await wait(60);
 assert(/Aquisição de software/.test($('#modal-root').textContent),'Detalhe do 4006 sem descrição');
 noErrors();
});

// ===== Contratos continuados (dados fictícios gerados pelo módulo no modo demonstração) =====
async function openCont(opts){localStorage.removeItem('sig-cont-demo-manifestacoes-v1');await loadApp(opts);win.confirm=()=>true;click('#nav [data-view=continuados]');await until(()=>$('.cont-page .cont-kpis'),'módulo de contratos continuados não abriu');}
const contCard=txt=>$$('.cont-card').find(c=>c.textContent.includes(txt));
test('Contratos continuados: fiscal vê análise pronta, gráfico e seus contratos',async()=>{
 await openCont({role:'leitura'});
 assert(/Contratos continuados/.test(heading()),'Título ausente: '+heading());
 assert($$('.cont-kpis>div').length===4,'Indicadores ausentes');
 assert($('.cont-chart svg .real')&&$('.cont-chart svg .saldo'),'Gráfico sem execução realizada ou saldo');
 assert($('.cont-chart .proj-bg'),'Projeção não diferenciada no gráfico');
 assert($$('.cont-card').length===4,'Fiscal deveria ver só os 4 contratos vinculados: '+$$('.cont-card').length);
 assert(!$('[data-tab=gestao]'),'Visão gerencial visível para perfil sem atribuição de gestão');
 assert(/O saldo (não )?cobre .*[Rr]eforço estimado/.test(contCard('Conectividade').textContent),'Resumo automático ausente: '+contCard('Conectividade').textContent);
 noErrors();
});
test('Contratos continuados: único campo do fiscal, vazio × zero × valor, sugestão não é salva sozinha',async()=>{
 await openCont({role:'leitura'});
 click(contCard('Telefonia'));
 await until(()=>$('.cont-drawer form[data-form=sigContNecessidade]'),'painel do contrato não abriu');
 const f=$('.cont-drawer form[data-form=sigContNecessidade]');
 assert(/Saldo adicional necessário até 31\/12\/\d{4} — R\$/.test(f.textContent),'Rótulo do campo diferente do especificado');
 assert(/Informe quanto precisa acrescentar ao saldo disponível/.test(f.textContent),'Texto de apoio ausente');
 assert(f.querySelectorAll('input:not([type=hidden])').length===1,'O fiscal deve ter um único campo');
 assert(/Ainda não informado/.test(f.textContent),'Estado vazio não identificado');
 click('[data-action=sigContUsarSugestao]');
 assert($('#cont-valor').value!=='','Sugestão não preencheu o campo');
 click('[data-action=sigContFechar]');await wait(60);
 assert(/Aguardando o fiscal/.test(contCard('Telefonia').textContent),'Sugestão registrada sem ação explícita do fiscal');
 click(contCard('Telefonia'));await until(()=>$('#cont-valor'),'painel não reabriu');
 setValue($('#cont-valor'),'');$('.cont-drawer form').requestSubmit();await wait(80);
 assert(/Use 0/.test($('#cont-valor-erro').textContent),'Campo vazio deveria pedir valor (0 = sem necessidade)');
 setValue($('#cont-valor'),'0');$('.cont-drawer form').requestSubmit();
 await until(()=>/Avaliado: não precisa/.test($('.cont-drawer')?.textContent||''),'valor zero não registrado como avaliação');
 setValue($('#cont-valor'),'2.345,67');$('.cont-drawer form').requestSubmit();
 await until(()=>/R\$ 2\.345,67/.test($('.cont-ok')?.textContent||''),'confirmação de salvamento ausente');
 assert($$('.cont-drawer .cont-hist li').length>=2,'Histórico de manifestações não registrado');
 win.document.dispatchEvent(new win.KeyboardEvent('keydown',{key:'Escape'}));await wait(60);
 assert(!$('.cont-drawer'),'Esc não fechou o painel');
 noErrors();
});
test('Contratos continuados: gestão sem dupla contagem e com atendimento parcial',async()=>{
 await openCont({role:'admin'});
 click('[data-tab=gestao]');await until(()=>$('.cont-plan'),'visão gerencial não abriu');
 const a=win.SIG_CONT._state.analise,t=a.totais;
 const esperado=a.contratos.reduce((s,c)=>s+(c.manifestacao?(c.atendimento?c.atendimento.pendente:c.manifestacao.valor):(c.reforcoTotal||0)),0);
 assert(t.planejamento.total===esperado,'Planejamento soma estimativa e manifestação do mesmo contrato');
 const sup=a.contratos.find(c=>/Suporte técnico/.test(c.titulo));
 assert(sup.atendimento&&sup.atendimento.status==='parcial'&&sup.atendimento.solicitado===30000000,'Atendimento parcial não reconhecido');
 assert(sup.atendimento.atendido+sup.atendimento.pendente===sup.atendimento.solicitado,'Solicitado não preservado (atendido + pendente)');
 assert(a.contratos.some(c=>c.situacao.nivel==='unico'),'Pagamento anual tratado como mensalidade');
 assert(a.contratos.some(c=>c.situacao.nivel==='sem_dados'),'Histórico insuficiente não identificado');
 assert($$('.cont-table tbody tr').length>=1,'Tabela gerencial vazia');
 click('[data-action=sigContFiltro][data-filtro=sem]');await wait(40);
 assert($$('.cont-table tbody tr').every(r=>/sem manifestação/.test(r.textContent)),'Filtro «sem manifestação» incorreto');
 noErrors();
});
test('Contratos continuados: celular 375 px sem rolagem horizontal da página',async()=>{
 await openCont({role:'leitura',width:375,height:740});
 assert(doc.documentElement.scrollWidth<=376,'Rolagem horizontal: '+doc.documentElement.scrollWidth);
 click(contCard('Conectividade'));await until(()=>$('.cont-drawer'),'painel não abriu no celular');
 assert($('.cont-drawer').getBoundingClientRect().width<=376,'Painel maior que a tela');
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
