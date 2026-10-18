/* SIG CSA-TIC 2.0 — MVP estático, sem bibliotecas externas. Dados fictícios por padrão. */
(() => {
'use strict';
const KEYS={data:'sig-csatic-demo-v1',settings:'sig-csatic-connect-v1',session:'sig-csatic-auth-v1',profile:'sig-csatic-role-v1'};
const TABLES=['processos','tarefas','contratos','repasses','empenhos','eventos','tramites','usuarios','notificacoes','solicitacoes_empenho','competencias_contratuais'];
const NAV=[['notificacoes','♢','Avisos'],['alertas','⚠','Pendências'],['chefia','▥','Painel da chefia'],['dashboard','◫','Visão geral'],['tarefas','☑','Minhas tarefas'],['processos','▤','Processos'],['compras','◈','Compras'],['licitacao','⚖','Licitação'],['importacoes','⇥','Motor de Dados'],['cotas','◔','Cota orçamentária'],['conciliacao','▥','Conciliação V6'],['auditoria','◇','Auditoria de Compras'],['sofi','▥','SOFI'],['contratos','▣','Contratos'],['assistente','✧','Assistente de IA'],['recebimentos','⇄','Recebimentos'],['usuarios','♙','Usuários']];
// Menus institucionais por perfil. A ordem aqui é a ordem exibida na barra lateral.
const SIG_CHIEF_SECTIONS=Object.freeze({chefe_compras:'Compras',chefe_licitacao:'Licitação',chefe_sofi:'SOFI'});
const SIG_CHIEF_ROLES=['chefia',...Object.keys(SIG_CHIEF_SECTIONS)];
const isSectionChiefRole=r=>SIG_CHIEF_ROLES.includes(r);
const SIG_ROLE_CHOICES=[['compras','Compras'],['licitacao','Licitação'],['sofi','SOFI'],['chefe_compras','Chefe da Compras'],['chefe_licitacao','Chefe da Licitação'],['chefe_sofi','Chefe da SOFI'],['chefia','Chefia (perfil existente)'],['leitura','Consulta / Leitura']];
const labelRole=r=>SIG_ROLE_CHOICES.find(x=>x[0]===r)?.[1]||({admin:'Administrador'})[r]||r;
function syncUserRoleSetor(){
 const form=document.querySelector('#modal-root form[data-form="inviteUser"],#modal-root form[data-form="updateUser"]');
 if(!form)return;
 const role=form.querySelector('#f-role'),sector=form.querySelector('#f-setor');if(!role||!sector)return;
 const fixed=SIG_CHIEF_SECTIONS[role.value]||({compras:'Compras',licitacao:'Licitação',sofi:'SOFI'})[role.value]||null;
 const hidden=form.querySelector('#sig-fixed-sector');
 if(fixed){sector.value=fixed;sector.disabled=true;if(hidden){hidden.name='setor';hidden.value=fixed;}}
 else{sector.disabled=false;if(hidden){hidden.name='';hidden.value='';}}
}
const SIG_ROLE_MENUS=Object.freeze({
 compras:['notificacoes','tarefas','compras','cotas','processos','assistente'],
 licitacao:['notificacoes','tarefas','licitacao','cotas','processos','assistente'],
 sofi:['notificacoes','tarefas','sofi','cotas','processos','assistente'],
 chefia:['notificacoes','chefia','tarefas','licitacao','compras','sofi','cotas','processos','assistente'],
 chefe_compras:['notificacoes','chefia','tarefas','compras','cotas','processos','assistente'],
 chefe_licitacao:['notificacoes','chefia','tarefas','licitacao','cotas','processos','assistente'],
 chefe_sofi:['notificacoes','chefia','tarefas','sofi','cotas','processos','assistente'],
 leitura:['notificacoes','tarefas','processos','assistente']
});
function menusForRole(role){return role==='admin'?NAV.map(([id])=>id):(SIG_ROLE_MENUS[role]||SIG_ROLE_MENUS.leitura).slice();}
function currentMenus(){return menusForRole(effectiveRole());}
function canVisitMenu(id){return currentMenus().includes(id);}
function firstRoleView(){const role=effectiveRole();return role==='admin'?'dashboard':isSectionChiefRole(role)?'chefia':role==='compras'?'compras':'tarefas';}
// Visões que usam somente as tabelas carregadas na etapa rápida do login.
const SIG_FAST_VIEWS=['dashboard','tarefas','compras','licitacao','processos'];
const SECTORS=['Compras','Licitação','SOFI'];
const STATUSES=['Em andamento','Aguardando providência','Aguardando documentação','Aguardando empenho','Bloqueado','Concluído','Cancelado'];
const TASK_STATUSES=['Pendente','Em andamento','Aguardando terceiro','Concluída'];
const PRIORITIES=['Alta','Média','Baixa'];
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const digits=v=>Number(v||0)||0;
const money=v=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:2}).format(digits(v));
const compact=v=>Math.abs(digits(v))>=1e6?'R$ '+(digits(v)/1e6).toLocaleString('pt-BR',{maximumFractionDigits:2})+' mi':Math.abs(digits(v))>=1e3?'R$ '+(digits(v)/1e3).toLocaleString('pt-BR',{maximumFractionDigits:1})+' mil':money(v);
const fmtDate=d=>d?new Date(String(d).slice(0,10)+'T12:00:00').toLocaleDateString('pt-BR'):'—';
const isoDay=d=>new Date(d).toISOString().slice(0,10);
const dayOffset=n=>{const d=new Date();d.setHours(12,0,0,0);d.setDate(d.getDate()+n);return isoDay(d)};
const nowIso=()=>new Date().toISOString();
const uuid=()=>globalThis.crypto?.randomUUID?.()||'id-'+Date.now()+'-'+Math.floor(Math.random()*1000000);
const optionList=(arr,val)=>arr.map(a=>`<option value="${esc(a)}" ${a===val?'selected':''}>${esc(a)}</option>`).join('');
const searchText=(...v)=>v.map(x=>String(x??'')).join(' ').toLocaleLowerCase('pt-BR');
const ageDays=d=>d?Math.floor((Date.now()-new Date(d).getTime())/86400000):0;
const daysLeft=d=>d?Math.ceil((new Date(String(d).slice(0,10)+'T23:59:00').getTime()-Date.now())/86400000):Infinity;
const activeProcess=p=>!['Concluído','Cancelado'].includes(p.status);
const today=()=>isoDay(new Date());
const isOverdue=t=>t.status!=='Concluída'&&daysLeft(t.prazo)<0;
function seed(){
 const p=(i,numero,objeto,setor,etapa,status,responsavel,prioridade,valor,deadline,acao,block='')=>({id:'d-p'+i,numero,objeto,setor,etapa,status,responsavel,prioridade,valor_estimado:valor*1.11,valor_homologado:valor,modalidade:i%2?'COTEP':'Pregão',data_entrada:dayOffset(-(7+i*2)),prazo:dayOffset(deadline),proxima_acao:acao,bloqueio_motivo:block,dotacao:i%2?'DEMO-33.90.30':'DEMO-44.90.52',referencia_sei:'',updated_at:new Date(Date.now()-(i*2)*86400000).toISOString()});
 const processos=[
 p(1,'DEMO-001/2026','Aquisição de equipamentos de rede','Compras','Análise do termo de referência','Em andamento','Equipe Compras','Alta',54000,5,'Concluir revisão do TR'),
 p(2,'DEMO-002/2026','Materiais de conectividade','Licitação','Recebimento de propostas','Aguardando providência','Equipe Licitação','Média',8900,2,'Analisar propostas cadastradas'),
 p(3,'DEMO-003/2026','Serviço de suporte técnico','SOFI','Conformidade orçamentária','Aguardando empenho','Equipe SOFI','Alta',132000,-3,'Providenciar análise de empenhamento'),
 p(4,'DEMO-004/2026','Aquisição de ferramentas','Compras','Adequação do TR','Bloqueado','Equipe Compras','Alta',14800,-6,'Aguardar revisão de especificações','Termo de referência devolvido para correção'),
 p(5,'DEMO-005/2026','Equipamentos para laboratório','Licitação','Julgamento','Em andamento','Equipe Licitação','Média',37000,10,'Analisar habilitação'),
 p(6,'DEMO-006/2026','Aquisição de licenças de software','SOFI','Análise financeira','Aguardando empenho','Equipe SOFI','Alta',28800,4,'Validar saldo e elaborar empenho'),
 p(7,'DEMO-007/2026','Manutenção de impressoras','Compras','Pesquisa de preços','Aguardando documentação','Equipe Compras','Média',11500,8,'Receber orçamento complementar'),
 p(8,'DEMO-008/2026','Contratação de acesso à internet','SOFI','Empenho','Concluído','Equipe SOFI','Baixa',64000,-14,'Processo concluído'),
 p(9,'DEMO-009/2026','Aquisição de mobiliário técnico','Licitação','Diligência','Bloqueado','Equipe Licitação','Alta',19600,-5,'Aguardar manifestação do fornecedor','Diligência sem resposta dentro do prazo')
 ];
 const t=(i,proc,title,sector,who,prio,status,due)=>({id:'d-t'+i,processo_id:proc,titulo:title,descricao:'',setor:sector,responsavel:who,prioridade:prio,status,prazo:dayOffset(due),updated_at:nowIso()});
 const tarefas=[t(1,'d-p1','Revisar especificações do TR','Compras','Equipe Compras','Alta','Em andamento',2),t(2,'d-p2','Conferir propostas e anexos','Licitação','Equipe Licitação','Média','Pendente',1),t(3,'d-p3','Verificar saldo para empenho','SOFI','Equipe SOFI','Alta','Pendente',-2),t(4,'d-p4','Solicitar adequações do termo','Compras','Equipe Compras','Alta','Aguardando terceiro',-5),t(5,'d-p5','Analisar documentos da habilitação','Licitação','Equipe Licitação','Média','Em andamento',4),t(6,'d-p6','Preparar empenho de subscrições','SOFI','Equipe SOFI','Alta','Pendente',3),t(7,'d-p7','Obter terceira cotação','Compras','Equipe Compras','Baixa','Pendente',5),t(8,'d-p9','Cobrar resposta à diligência','Licitação','Equipe Licitação','Alta','Pendente',-3)];
 const c=(i,num,obj,forn,monthly,balance,vigence,gestor)=>({id:'d-c'+i,numero:num,objeto:obj,fornecedor:forn,inicio:dayOffset(-200),fim:dayOffset(vigence),valor_global:monthly*12,custo_mensal:monthly,saldo_empenho:balance,cobertura_alvo:3,gestor,status:'Vigente',updated_at:nowIso()});
 const contratos=[c(1,'CT-DEMO-01/2026','Suporte técnico de sistemas','Fornecedor Exemplo A',18200,34000,140,'Gestão de contratos'),c(2,'CT-DEMO-02/2026','Conectividade e rede','Fornecedor Exemplo B',9500,76000,53,'Fiscal de TIC'),c(3,'CT-DEMO-03/2026','Manutenção de equipamentos','Fornecedor Exemplo C',4200,6000,26,'Equipe técnica'),c(4,'CT-DEMO-04/2026','Serviço de licenciamento','Fornecedor Exemplo D',7300,58000,270,'Gestão de contratos')];
 const repasses=[{id:'d-r1',documento:'DOC-DEMO-01',ano:2026,dotacao:'DEMO-33.90.30',valor_recebido:130000,valor_destinado:85000,descricao:'Materiais de consumo'},{id:'d-r2',documento:'DOC-DEMO-02',ano:2026,dotacao:'DEMO-44.90.52',valor_recebido:380000,valor_destinado:242000,descricao:'Equipamentos permanentes'},{id:'d-r3',documento:'DOC-DEMO-03',ano:2026,dotacao:'DEMO-33.90.39',valor_recebido:220000,valor_destinado:190000,descricao:'Serviços terceiros'}].map(x=>({...x,updated_at:nowIso()}));
 const empenhos=[{id:'d-e1',numero:'EMP-DEMO-001',ano:2026,processo_id:'d-p3',contrato_id:null,dotacao:'DEMO-33.90.39',valor_empenhado:42000,valor_consumido:10000,status:'Ativo'},{id:'d-e2',numero:'EMP-DEMO-002',ano:2026,processo_id:'d-p6',contrato_id:null,dotacao:'DEMO-44.90.52',valor_empenhado:0,valor_consumido:0,status:'Em preparação'},{id:'d-e3',numero:'EMP-DEMO-003',ano:2026,processo_id:'d-p8',contrato_id:'d-c2',dotacao:'DEMO-33.90.39',valor_empenhado:64000,valor_consumido:40000,status:'Ativo'}].map(x=>({...x,updated_at:nowIso()}));
 const eventos=processos.map((x,i)=>({id:'d-ev'+i,processo_id:x.id,tipo:'Importação demonstrativa',descricao:'Registro fictício criado para ilustrar o acompanhamento de processos.',usuario:'Sistema de demonstração',criado_em:x.updated_at}));
 const solicitacoes_empenho=[{id:'d-se1',processo_id:'d-p6',empenho_id:null,dotacao:'DEMO-44.90.52',valor_solicitado:28800,status:'Em análise',descricao:'Conferir recursos para aquisição demonstrativa de software.',pendencia:null,prazo:dayOffset(4),updated_at:nowIso()}];
 const competencias_contratuais=[{id:'d-co1',contrato_id:'d-c1',competencia:today().slice(0,7)+'-01',valor_previsto:18200,valor_executado:0,status:'Prevista',documento_referencia:'',observacoes:'Previsão fictícia para demonstração.'},{id:'d-co2',contrato_id:'d-c2',competencia:today().slice(0,7)+'-01',valor_previsto:9500,valor_executado:2000,status:'Atestada',documento_referencia:'DEMO',observacoes:'Somente demonstração.'}];
 return {solicitacoes_empenho,competencias_contratuais,processos,tarefas,contratos,repasses,empenhos,eventos,tramites:[],usuarios:[{auth_id:'demo-compras',nome:'Analista Compras (demo)',role:'compras',setor:'Compras',ativo:true},{auth_id:'demo-licitacao',nome:'Analista Licitação (demo)',role:'licitacao',setor:'Licitação',ativo:true},{auth_id:'demo-sofi',nome:'Analista SOFI (demo)',role:'sofi',setor:'SOFI',ativo:true}]};
}
function storage(){try{const item=JSON.parse(localStorage.getItem(KEYS.data));return item&&['processos','tarefas','contratos','repasses','empenhos','eventos'].every(k=>Array.isArray(item[k]))?{...item,tramites:item.tramites||[],usuarios:item.usuarios||seed().usuarios,solicitacoes_empenho:item.solicitacoes_empenho||seed().solicitacoes_empenho,competencias_contratuais:item.competencias_contratuais||seed().competencias_contratuais}:seed()}catch{return seed()}}
const SIG_DEFAULT_CONNECTION=Object.freeze({url:'https://nrcobonppfbqgarfoqgj.supabase.co',key:'sb_publishable_q7Lhoq9CbOSJH0llBi6w_A_L8Qabbyl'});
let db=storage();db.notificacoes=db.notificacoes||[];db.solicitacoes_empenho=db.solicitacoes_empenho||[];db.competencias_contratuais=db.competencias_contratuais||[];let config=loadSettings();let session=loadSession();let profile={nome:'Demonstração',role:localStorage.getItem(KEYS.profile)||'admin',setor:'Todos',ativo:true};let v5Report=null;let v3UnreadSeen=0,v3NotificationsReady=false;let stallDays=Math.max(1,Math.min(30,Number(localStorage.getItem('sig-alert-days')||5)));let view='dashboard',filters={q:'',setor:'Todos',status:'Todos'},chat=[],busy=false,lastLoad=null,taskScope='mine',receiptScope='mine',adminUsers=[],adminLoaded=false,inviteActive=false;
/* Conexão institucional é o padrão. Configuração local vazia antiga não pode forçar demo.
 * Apenas mode:'demo' mantém a demonstração por escolha explícita do usuário.
 */
function loadSettings(){
 try {
  const raw=localStorage.getItem(KEYS.settings);
  if(raw===null)return {...SIG_DEFAULT_CONNECTION};
  const stored=JSON.parse(raw);
  if(stored&&stored.mode==='demo')return {url:'',key:'',mode:'demo'};
  if(stored&&typeof stored.url==='string'&&typeof stored.key==='string'&&stored.url.trim()&&stored.key.trim())return {url:stored.url,key:stored.key};
  return {...SIG_DEFAULT_CONNECTION};
 }catch {return {...SIG_DEFAULT_CONNECTION}}
}
function reconnectInstitutional(){previewRole=null;
 // Não apaga dados locais nem altera credenciais: usa a conexão pública já incluída no SIG.
 localStorage.removeItem(KEYS.settings);
 config={...SIG_DEFAULT_CONNECTION};
 session=null;
 sessionStorage.removeItem(KEYS.session);
 vaultClearOpenReports();
 db=Object.fromEntries(TABLES.map(t=>[t,[]]));
 profile={nome:'Não autenticado',role:'leitura',setor:''};
 closeModal();
 render();
 showToast('Conexão institucional restaurada. Entre com sua conta.');
}
function loadSession(){try{return JSON.parse(sessionStorage.getItem(KEYS.session)||'null')}catch{return null}}
const cloud=()=>!!(config.url&&config.key);
const SIG_FAST_TABLES=['processos','tarefas','contratos','empenhos'];
// Prévia visual: não troca autenticação, sessão, JWT ou perfis do banco.
const SIG_PREVIEW_ROLES=[
 {id:'compras',label:'Compras',desc:'Processos e tarefas de compras'},
 {id:'licitacao',label:'Licitação',desc:'Fluxo licitatório e providências'},
 {id:'sofi',label:'SOFI',desc:'Empenhos e demandas financeiras'},
 {id:'chefia',label:'Chefia (existente)',desc:'Painel gerencial atual'},
  {id:'chefe_compras',label:'Chefe da Compras',desc:'Painel e tarefas da seção Compras'},
  {id:'chefe_licitacao',label:'Chefe da Licitação',desc:'Painel e tarefas da seção Licitação'},
  {id:'chefe_sofi',label:'Chefe da SOFI',desc:'Painel e tarefas da seção SOFI'},
 {id:'leitura',label:'Consulta / Leitura',desc:'Somente consulta, sem editar registros'}
];
let previewRole=null;
let purchaseFilter='all',purchaseLimit=12;
let chiefSectorFilter='Todos',chiefTaskFilter='active',chiefMemberFilter='Todos';
const effectiveRole=()=>previewRole||profile.role;
function canPreviewRole(){return cloud()&&!!session?.user?.id&&cloudDataReady&&cloudExtraState==='ready'&&profile.ativo===true&&profile.role==='admin';}
function previewProfileModal(){
 if(!canPreviewRole())return;
 const choices=SIG_PREVIEW_ROLES.map(r=>'<button type="button" class="sig-preview-choice'+(previewRole===r.id?' selected':'')+'" data-action="setRolePreview" data-role="'+r.id+'"><strong>'+esc(r.label)+'</strong><small>'+esc(r.desc)+'</small></button>').join('');
 const content='<div class="sig-preview-info">Sua sessão continua <strong>administradora</strong>. Esta prévia simula os controles e menus dos perfis, mas <strong>não substitui o login de outro usuário nem reproduz as regras RLS do banco</strong>. Alterações e exportações são bloqueadas.</div><div class="sig-preview-grid">'+choices+'</div><div class="modal-footer"><button type="button" class="btn primary" data-action="exitRolePreview">Voltar ao administrador</button><button type="button" class="btn" data-action="closeModal">Fechar</button></div>';
 openModal('Visualizar como','Prévia de perfis, somente leitura.',content,true);
}
function setRolePreview(role){
 if(!canPreviewRole())return showToast('Prévia disponível somente para administradores autenticados.');
 if(!SIG_PREVIEW_ROLES.some(r=>r.id===role))return showToast('Perfil desconhecido.');
 previewRole=role;view=({compras:'compras',licitacao:'licitacao',sofi:'sofi',chefia:'chefia',chefe_compras:'chefia',chefe_licitacao:'chefia',chefe_sofi:'chefia'})[role]||firstRoleView();purchaseFilter='all';chiefSectorFilter=SIG_CHIEF_SECTIONS[role]||(role==='chefia'?(SECTORS.includes(profile.setor)?profile.setor:'Compras'):'Todos');chiefTaskFilter='active';chiefMemberFilter='Todos';
 taskScope='all';receiptScope='sector';purchaseLimit=12;filters={q:'',setor:'Todos',status:'Todos'};
 closeModal();document.getElementById('sidebar').classList.remove('open');document.getElementById('shade').classList.remove('visible');render();window.scrollTo(0,0);
}
function exitRolePreview(){
 if(!canPreviewRole())return;
 previewRole=null;view='dashboard';taskScope='mine';receiptScope='mine';filters={q:'',setor:'Todos',status:'Todos'};
 closeModal();render();window.scrollTo(0,0);
}
let cloudDataReady=false,cloudExtraState='idle',cloudLoadError='';
if(cloud()&&session){db=Object.fromEntries(TABLES.map(t=>[t,[]]));profile={nome:'Verificando acesso',role:'leitura',setor:'',ativo:false};}
function saveLocal(){if(!cloud())localStorage.setItem(KEYS.data,JSON.stringify(db))}
function canWrite(sector){if(!cloud())return true;if(!session||!profile.ativo)return false;const role=effectiveRole();return role==='admin'||(isSectionChiefRole(role)&&profile.setor===sector&&(!SIG_CHIEF_SECTIONS[role]||SIG_CHIEF_SECTIONS[role]===sector))||role===({'Compras':'compras','Licitação':'licitacao','SOFI':'sofi'}[sector]);}
function canFinance(){return !cloud()||['admin','chefia','sofi','chefe_sofi'].includes(effectiveRole())}
function canViewCota(){return !cloud()||['admin','chefia','sofi','compras','licitacao','chefe_compras','chefe_licitacao','chefe_sofi'].includes(effectiveRole())}
function isAdmin(){return !previewRole&&profile.role==='admin'&&(!cloud()||!!session)}
function currentAuthId(){return session?.user?.id||'demo-admin'}
function setorUsuario(){return ({compras:'Compras',licitacao:'Licitação',sofi:'SOFI',...SIG_CHIEF_SECTIONS})[effectiveRole()]||profile.setor||'Compras'}
function assignedToMe(t){if(previewRole){const sector=({'compras':'Compras','licitacao':'Licitação','sofi':'SOFI',...SIG_CHIEF_SECTIONS})[previewRole];return !!sector&&t.setor===sector;}return !!(t.responsavel_auth_id&&t.responsavel_auth_id===currentAuthId())||(!t.responsavel_auth_id&&String(t.responsavel).toLowerCase()===String(profile.nome).toLowerCase())}
function userCandidates(setor){return (db.usuarios||[]).filter(u=>u.ativo&&u.auth_id&&u.setor===setor&&['admin','chefia',{'Compras':'compras','Licitação':'licitacao','SOFI':'sofi'}[setor],...Object.entries(SIG_CHIEF_SECTIONS).filter(([,v])=>v===setor).map(([k])=>k)].includes(u.role))}
function iconBadge(status){const s=String(status||'');const cls=/Bloqueado|Vencido|Atrasad|Cancelad/.test(s)?'red':/Aguardando|Pendente|Baixa cobertura|Próximo vencimento/.test(s)?'amber':/Conclu|Vigente|Ativo/.test(s)?'teal':/andamento|prepara/i.test(s)?'blue':'gray';return `<span class="flag ${cls}">${esc(s)}</span>`}
function showToast(msg){const root=document.getElementById('toast-root');root.innerHTML=`<div class="toast">${esc(msg)}</div>`;setTimeout(()=>root.querySelector('.toast')?.remove(),3500)}
function errMsg(err){return err?.message||'Ocorreu um erro inesperado.'}
function findProcess(id){return db.processos.find(p=>p.id===id)}
function optionsWithAll(items,label='Todos'){return `<option value="Todos">${esc(label)}</option>`+items.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('')}
function processOpen(){return db.processos.filter(activeProcess)}
function processBlocked(p){return p.status==='Bloqueado'||(p.prazo&&daysLeft(p.prazo)<0&&activeProcess(p))}
function moneyToCommit(p){return Math.max(0,digits(p.valor_homologado)-db.empenhos.filter(e=>e.processo_id===p.id&&['Ativo','Encerrado'].includes(e.status)).reduce((a,b)=>a+digits(b.valor_empenhado),0))}
function normalizeProcess(o){return Object.fromEntries(Object.entries(o).map(([k,v])=>[k,typeof v==='string'?v.trim():v]))}
function heading(eyebrow,title,sub,buttons=''){return `<div class="pagehead"><div><div class="eyebrow">${esc(eyebrow)}</div><h1>${esc(title)}</h1><div class="sub">${esc(sub)}</div></div><div class="head-actions">${buttons}</div></div>`}
function cardTitle(title,sub='',act=''){return `<div class="section-heading"><div><h2>${esc(title)}</h2>${sub?`<div class="sub">${esc(sub)}</div>`:''}</div>${act}</div>`}
function empty(label='Nenhum registro encontrado'){return `<div class="empty"><div class="empty-icon">◌</div>${esc(label)}</div>`}
function periodNotice(){return cloud()?`<div class="info-note">Dados consultados no banco da organização ${lastLoad?'· última atualização '+new Date(lastLoad).toLocaleTimeString('pt-BR'):''}. Confirme a completude das importações antes de tomar decisões orçamentárias.</div>`:`<div class="info-note warning-note">Indicadores baseados exclusivamente em <strong>registros fictícios</strong>. Os cálculos não representam saldos oficiais ou situação real de qualquer processo.</div>`}
function updateChrome(){
 // Estado visual separado do perfil real: o CSS também oculta menus não autorizados.
 document.body.dataset.sigVisibleRole=effectiveRole();
 document.body.classList.toggle('sig-role-preview',!!previewRole);
 const personalTaskCount=db.tarefas.filter(t=>t.status!=='Concluída'&&assignedToMe(t)).length;
 const unread=v3Unread();
 document.getElementById('nav').innerHTML=currentMenus().map(id=>NAV.find(([key])=>key===id)).filter(Boolean).map(([v,ico,label])=>'<button class="navitem '+(view===v?'active':'')+'" data-view="'+v+'"><span class="nav-ico">'+ico+'</span><span>'+label+'</span>'+(v==='notificacoes'&&unread?'<span class="bubble">'+unread+'</span>':v==='tarefas'&&personalTaskCount?'<span class="bubble">'+personalTaskCount+'</span>':'')+'</button>').join('');
 document.getElementById('crumb').textContent=NAV.find(x=>x[0]===view)?.[2]||'Visão geral';
 const indicator=document.getElementById('sync-indicator');
 indicator.classList.toggle('online',cloud()&&!!session);
 indicator.lastElementChild.textContent=cloud()?(session?'Conectado · banco em nuvem':'Conexão pendente'):'Modo demonstração';
 document.getElementById('demo-banner').style.display=cloud()?'none':'block';
 document.getElementById('avatar-initial').textContent=(profile.nome||'D').charAt(0).toUpperCase();
 const avatar=document.querySelector('.avatar-button');
 let previewButton=document.getElementById('sig-preview-button');
 if(avatar&&!previewButton){avatar.insertAdjacentHTML('beforebegin','<button type="button" class="sig-preview-trigger" id="sig-preview-button" data-action="previewProfiles" aria-label="Visualizar como outro perfil">⇄ <span>Visualizar como</span></button>');previewButton=document.getElementById('sig-preview-button');}
 if(previewButton){previewButton.hidden=!canPreviewRole();const label=SIG_PREVIEW_ROLES.find(r=>r.id===previewRole)?.label;previewButton.innerHTML=previewRole?'⇄ <span>Prévia: '+esc(label||'Perfil')+'</span>':'⇄ <span>Visualizar como</span>';}
 const reload=document.querySelector('.refresh-button');
 if(reload&&!document.getElementById('v3-bell'))reload.insertAdjacentHTML('beforebegin','<button class="icon-button v3-bell" id="v3-bell" data-view="notificacoes" title="Notificações" aria-label="Ver notificações">♢<span class="v3-count" id="v3-count" style="display:none"></span></button>');
 const bell=document.getElementById('v3-bell');
 if(bell){bell.style.display=session||!cloud()?'inline-flex':'none';const count=document.getElementById('v3-count');count.textContent=unread;count.style.display=unread?'inline-flex':'none'}
}
function navigate(v){
 if(!canVisitMenu(v))return showToast('Este módulo não está disponível para o seu perfil.');
 view=v;filters={q:'',setor:'Todos',status:'Todos'};if(v==='compras'){purchaseFilter='all';purchaseLimit=12;}
 updateChrome();render();
 document.getElementById('sidebar').classList.remove('open');
 document.getElementById('shade').classList.remove('visible');
 window.scrollTo(0,0);
 if(v==='usuarios'&&cloud())loadAdminUsers().catch(e=>showToast(errMsg(e)));
}

function v3MyNotifications(){if(previewRole)return [];return (db.notificacoes||[]).filter(n=>n.destinatario_auth_id===currentAuthId()).sort((a,b)=>new Date(b.criado_em)-new Date(a.criado_em))}
function v3Unread(){return v3MyNotifications().filter(n=>!n.lida_em).length}
function v3LastMovement(p){
 const dates=[p.created_at,p.updated_at,...db.eventos.filter(e=>e.processo_id===p.id).map(e=>e.criado_em),...db.tramites.filter(t=>t.processo_id===p.id).map(t=>t.criado_em)];
 return new Date(Math.max(...dates.filter(Boolean).map(x=>new Date(x).getTime()).filter(Number.isFinite),0));
}
function v3Reasons(p){
 if(!activeProcess(p))return [];
 const out=[];
 if(p.status==='Bloqueado')out.push('Bloqueio registrado');
 if(p.prazo&&daysLeft(p.prazo)<0)out.push('Prazo vencido há '+Math.abs(daysLeft(p.prazo))+' dia(s)');
 if(!p.responsavel_auth_id&&(!p.responsavel||/^(fila|equipe|compras|licita|sofi|não atribu)/i.test(p.responsavel)))out.push('Sem responsável individual');
 const last=v3LastMovement(p);if(last.getTime()>0&&ageDays(last)>=stallDays)out.push('Sem movimentação há '+ageDays(last)+' dia(s)');
 return out;
}
function v3AlertView(){
 const alerts=db.processos.map(p=>({p,motivos:v3Reasons(p)})).filter(x=>x.motivos.length).sort((a,b)=>daysLeft(a.p.prazo)-daysLeft(b.p.prazo));
 const counts=SECTORS.map(sector=>({sector,n:alerts.filter(x=>x.p.setor===sector).length}));
 const chooser='<label class="v3-select">Sinalizar ausência de movimentação após <select id="stallDays">'+[3,5,7,10,15,30].map(n=>'<option value="'+n+'" '+(stallDays===n?'selected':'')+'>'+n+' dias corridos</option>').join('')+'</select></label>';
 let html=heading('Monitoramento','Pendências e gargalos','Alertas derivados dos registros do banco; a classificação não substitui a análise do responsável.',chooser)+periodNotice();
 html+='<div class="v3-tiles">'+counts.map(c=>'<div class="card v3-tile"><small>'+esc(c.sector)+'</small><strong>'+c.n+'</strong><span>com alerta(s)</span></div>').join('')+'</div>';
 html+='<div class="card table-card"><div class="table-scroll"><table class="data-table"><thead><tr><th>Processo / Objeto</th><th>Setor</th><th>Responsável</th><th>Alerta(s)</th><th>Última movimentação</th><th>Prazo</th><th>Ação</th></tr></thead><tbody>';
 html+=alerts.map(x=>'<tr><td><button class="link-button cell-main" data-action="detail" data-id="'+esc(x.p.id)+'">'+esc(x.p.numero)+'</button><div class="cell-sub">'+esc(x.p.objeto)+'</div></td><td>'+esc(x.p.setor)+'</td><td>'+esc(x.p.responsavel||'Não definido')+'</td><td>'+x.motivos.map(m=>'<span class="v3-chip">'+esc(m)+'</span>').join(' ')+'</td><td>'+v3LastMovement(x.p).toLocaleString('pt-BR')+'</td><td>'+fmtDate(x.p.prazo)+'</td><td><button class="btn small" data-action="detail" data-id="'+esc(x.p.id)+'">Ver processo</button></td></tr>').join('')||'<tr><td colspan="7" class="table-empty">Nenhum processo atende aos critérios de alerta.</td></tr>';
 return html+'</tbody></table></div></div><p class="v3-hint">Regra piloto: dias corridos, considerando alterações do processo, registros da linha do tempo e tramitações. Confirme a causa da espera antes de classificar como gargalo.</p>';
}
function chiefScope(){
 const role=effectiveRole();
 if(role==='admin')return SECTORS.includes(chiefSectorFilter)?chiefSectorFilter:null;
 if(SIG_CHIEF_SECTIONS[role]){
  const expected=SIG_CHIEF_SECTIONS[role];
  return previewRole?expected:(profile.setor===expected?expected:'__unauthorized__');
 }
 if(role==='chefia'){
  if(previewRole==='chefia')return SECTORS.includes(chiefSectorFilter)?chiefSectorFilter:'__unauthorized__';
  return SECTORS.includes(profile.setor)?profile.setor:'__unauthorized__';
 }
 return '__unauthorized__';
}
function chiefTeam(sector){
 return (db.usuarios||[]).filter(u=>u.ativo&&u.auth_id&&SECTORS.includes(u.setor)&&
  (!sector||u.setor===sector)&&
  ['admin','chefia',{'Compras':'compras','Licitação':'licitacao','SOFI':'sofi'}[u.setor],...Object.entries(SIG_CHIEF_SECTIONS).filter(([,v])=>v===u.setor).map(([k])=>k)].includes(u.role));
}
function chiefTaskPoints(t){return ({Alta:3,'Média':2,Baixa:1})[t.prioridade]||2}
function chiefWorkload(u,teamTasks){
 const open=teamTasks.filter(t=>t.responsavel_auth_id===u.auth_id&&t.status!=='Concluída');
 const points=open.reduce((n,t)=>n+chiefTaskPoints(t),0);
 return {user:u,tasks:open,points,ratio:Math.round(points/12*100),late:open.filter(isOverdue).length};
}
function chiefCanManageTask(t){
 if(!t||t.status==='Concluída'||previewRole)return false;
 const sector=chiefScope();
 if(sector==='__unauthorized__'||(sector&&t.setor!==sector))return false;
 return !!session&&!!profile.ativo&&(profile.role==='admin'||(isSectionChiefRole(profile.role)&&profile.setor===t.setor&&(!SIG_CHIEF_SECTIONS[profile.role]||SIG_CHIEF_SECTIONS[profile.role]===t.setor)));
}
function chiefRedistributeForm(id,proposed){
 const t=db.tarefas.find(x=>x.id===id);
 if(!chiefCanManageTask(t))return showToast('Você não pode redistribuir esta tarefa.');
 const members=chiefTeam(t.setor).filter(u=>u.auth_id!==t.responsavel_auth_id);
 if(!members.length)return showToast('Não há outro militar ativo cadastrado nesta seção.');
 const options=members.map(u=>{
  const count=(db.tarefas||[]).filter(x=>x.status!=='Concluída'&&x.responsavel_auth_id===u.auth_id);
  const points=count.reduce((n,x)=>n+chiefTaskPoints(x),0);
  return '<option value="'+esc(u.auth_id)+'"'+(u.auth_id===proposed?' selected':'')+'>'+esc(u.nome)+' · '+count.length+' ativas · '+points+' pontos</option>';
 }).join('');
 const body='<div class="sig-chief-reassign-intro"><strong>'+esc(t.titulo)+'</strong><small>Setor: '+esc(t.setor)+' · Responsável atual: '+esc(t.responsavel||'Fila da seção')+'</small></div>'+
 '<form data-form="chiefReassign" data-id="'+esc(t.id)+'"><div class="form-row"><label for="chief-new-member">Novo responsável (somente militares da seção)</label><select id="chief-new-member" name="member" required>'+options+'</select></div>'+
 '<p class="helper">A tarefa permanece no setor. O novo responsável será notificado pelo SIG. Confirme a distribuição com a chefia e o militar.</p>'+
 '<div class="modal-footer"><button type="button" class="btn" data-action="closeModal">Cancelar</button><button type="submit" class="btn primary">Confirmar redistribuição</button></div></form>';
 openModal('Redistribuir tarefa','Confirmação obrigatória. Nenhuma sugestão é aplicada automaticamente.',body,true);
}
async function chiefReassignSubmit(form){
 const t=db.tarefas.find(x=>x.id===form.dataset.id);
 if(!chiefCanManageTask(t))throw Error('Você não tem permissão para redistribuir esta tarefa.');
 const member=chiefTeam(t.setor).find(u=>u.auth_id===form.elements.member.value);
 if(!member||member.auth_id===t.responsavel_auth_id)throw Error('Selecione outro militar ativo da mesma seção.');
 const payload={responsavel_auth_id:member.auth_id,responsavel:member.nome};
 busy=true;
 try{
  if(cloud()){
   const where='?id=eq.'+encodeURIComponent(t.id)+'&setor=eq.'+encodeURIComponent(t.setor)+'&updated_at=eq.'+encodeURIComponent(t.updated_at);
   const updated=await rest('/rest/v1/tarefas'+where,'PATCH',payload);
   if(!Array.isArray(updated)||updated.length!==1)throw Error('A tarefa foi alterada. Atualize a tela antes de tentar novamente.');
   await fetchCloud();
  }else{
   Object.assign(t,payload,{updated_at:nowIso()});saveLocal();
  }
  closeModal();render();showToast('Tarefa redistribuída para '+member.nome+'.');
 }finally{busy=false;}
}
function v3ChiefView(){
 if(!['admin',...SIG_CHIEF_ROLES].includes(effectiveRole()))return heading('Acesso restrito','Painel da chefia','Apenas chefias e administração.');
 const scope=chiefScope();
 if(scope==='__unauthorized__')return heading('Seção não vinculada','Painel da chefia','Solicite ao administrador que associe sua conta a Compras, Licitação ou SOFI.');
 const team=chiefTeam(scope),allTasks=(db.tarefas||[]).filter(t=>!scope||t.setor===scope),active=allTasks.filter(t=>t.status!=='Concluída');
 const loads=team.map(u=>chiefWorkload(u,allTasks)).sort((a,b)=>b.points-a.points||a.user.nome.localeCompare(b.user.nome,'pt-BR'));
 const overdue=active.filter(isOverdue),doneRecent=allTasks.filter(t=>t.status==='Concluída'&&t.concluida_em&&Date.now()-new Date(t.concluida_em).getTime()<=7*86400000);
 const overloaded=loads.filter(x=>x.ratio>100),average=loads.length?Math.round(loads.reduce((n,x)=>n+x.ratio,0)/loads.length):0;
 const writeAllowed=!previewRole&&!!session&&!!profile.ativo;
 const sectionOptions=(effectiveRole()==='admin'?['Todos',...SECTORS]:SECTORS).map(v=>'<option value="'+esc(v)+'"'+(scope===v||(!scope&&v==='Todos')?' selected':'')+'>'+esc(v==='Todos'?'Todas as seções':v)+'</option>').join('');
 const selects='<div class="sig-chief-filters">'+
 (profile.role==='admin'?'<label>Seção<select id="chief-sector" data-chief-filter="sector">'+sectionOptions+'</select></label>':'<div class="sig-chief-fixed">Seção: <strong>'+esc(scope)+'</strong></div>')+
 '<label>Situação<select data-chief-filter="status">'+[['active','Ativas'],['late','Atrasadas'],['done','Concluídas'],['all','Todas']].map(([k,v])=>'<option value="'+k+'"'+(chiefTaskFilter===k?' selected':'')+'>'+v+'</option>').join('')+'</select></label>'+
 '<label>Militar<select data-chief-filter="member"><option value="Todos">Toda a equipe</option>'+team.map(u=>'<option value="'+esc(u.auth_id)+'"'+(u.auth_id===chiefMemberFilter?' selected':'')+'>'+esc(u.nome)+'</option>').join('')+'</select></label>'+
 (writeAllowed?'<button type="button" class="btn primary" data-action="chiefNewTask" data-sector="'+esc(scope||profile.setor||'Compras')+'">+ Nova tarefa</button>':'')+
 '</div>';
 const stat=(txt,value,foot,cls='')=>'<div class="sig-chief-stat '+cls+'"><span>'+esc(txt)+'</span><strong>'+value+'</strong><small>'+esc(foot)+'</small></div>';
 const stats='<div class="sig-chief-stats">'+
 stat('Tarefas ativas',active.length,'Atribuídas e em andamento')+
 stat('Atrasadas',overdue.length,'Requerem atenção','warning')+
 stat('Militares com sobrecarga',overloaded.length,'Índice acima de 100%','warning')+
 stat('Concluídas em 7 dias',doneRecent.length,'Conclusões registradas')+
 stat('Carga relativa média',average+'%','Indicador estimado, não são horas')+'</div>';
 const memberCards='<section class="sig-chief-panel"><div class="sig-chief-section-title"><h2>Carga de trabalho da equipe</h2><small>Alta = 3 pontos · Média = 2 · Baixa = 1. Referência: 12 pontos por militar.</small></div>'+
 (loads.length?'<div class="sig-chief-team">'+loads.map(x=>{
  const kind=x.ratio>100?'over':x.ratio>=75?'high':x.ratio<35?'light':'ok';
  return '<button type="button" class="sig-chief-member '+kind+(chiefMemberFilter===x.user.auth_id?' selected':'')+'" data-action="chiefMember" data-member="'+esc(x.user.auth_id)+'">'+
   '<span class="sig-chief-avatar">'+esc(x.user.nome.split(' ').map(z=>z[0]).slice(0,2).join('').toUpperCase())+'</span>'+
   '<strong>'+esc(x.user.nome)+'</strong><span>'+x.tasks.length+' tarefa(s) ativas · '+x.late+' atrasada(s)</span>'+
   '<b>'+x.ratio+'% · '+(kind==='over'?'Atenção: sobrecarga':kind==='high'?'Carga alta':kind==='light'?'Carga baixa':'Carga equilibrada')+'</b>'+
   '<span class="sig-chief-progress"><i style="width:'+Math.min(100,x.ratio)+'%"></i></span></button>';
 }).join('')+'</div>':'<div class="sig-chief-empty">Nenhum militar ativo cadastrado para esta seção. O administrador deve cadastrar os integrantes e seus setores.</div>')+
 '</section>';
 const taskRows=allTasks.filter(t=>chiefTaskFilter==='active'?t.status!=='Concluída':chiefTaskFilter==='late'?isOverdue(t):chiefTaskFilter==='done'?t.status==='Concluída':true)
 .filter(t=>chiefMemberFilter==='Todos'||t.responsavel_auth_id===chiefMemberFilter)
 .sort((a,b)=>(a.status==='Concluída')-(b.status==='Concluída')||daysLeft(a.prazo)-daysLeft(b.prazo));
 const rows=taskRows.slice(0,75).map(t=>
  '<tr><td><strong>'+esc(t.responsavel||'Fila da seção')+'</strong><span class="sig-chief-row-sub">'+esc(t.setor)+'</span></td>'+
  '<td>'+esc(t.titulo)+'</td><td>'+iconBadge(t.prioridade)+'</td><td>'+fmtDate(t.prazo)+'</td>'+
  '<td>'+iconBadge(isOverdue(t)?'Atrasada':t.status)+'</td><td>'+
  (chiefCanManageTask(t)?'<button class="btn small" data-action="chiefReassign" data-id="'+esc(t.id)+'">Redistribuir</button>':'<span class="tiny">'+(t.status==='Concluída'?'Concluída':'Consulta')+'</span>')+'</td></tr>').join('');
 const taskPanel='<section class="sig-chief-panel"><div class="sig-chief-section-title"><h2>Tarefas distribuídas pela chefia</h2><small>'+taskRows.length+' registro(s)'+(taskRows.length>75?' · exibindo as primeiras 75':'')+'</small></div>'+
 '<div class="table-scroll"><table class="data-table sig-chief-table"><thead><tr><th>Responsável</th><th>Tarefa</th><th>Prioridade</th><th>Prazo</th><th>Situação</th><th>Ação</th></tr></thead><tbody>'+
 (rows||'<tr><td colspan="6" class="table-empty">Nenhuma tarefa corresponde aos filtros.</td></tr>')+'</tbody></table></div></section>';
 const suggestions=[];
 for(const source of loads.filter(x=>x.ratio>100)){
  const recipient=loads.filter(x=>x.user.setor===source.user.setor&&x.user.auth_id!==source.user.auth_id&&x.ratio<75).sort((a,b)=>a.points-b.points)[0];
  const possible=source.tasks.filter(t=>t.status!=='Concluída').sort((a,b)=>chiefTaskPoints(a)-chiefTaskPoints(b))[0];
  if(recipient&&possible)suggestions.push({source:source.user,target:recipient.user,task:possible});
 }
 const suggestionsHtml='<section class="sig-chief-panel"><div class="sig-chief-section-title"><h2>Possíveis redistribuições</h2><small>Revisão manual da chefia</small></div>'+
 (suggestions.length?suggestions.slice(0,3).map(x=>
  '<article class="sig-chief-suggestion"><strong>'+esc(x.source.nome)+' → '+esc(x.target.nome)+'</strong>'+
  '<p>'+esc(x.task.titulo)+'</p><small>Ambos da seção '+esc(x.task.setor)+'. Sugestão baseada em carga relativa; confira habilidades e disponibilidade.</small>'+
  (writeAllowed?'<button class="btn small primary" type="button" data-action="chiefReassign" data-id="'+esc(x.task.id)+'" data-member="'+esc(x.target.auth_id)+'">Analisar redistribuição</button>':'')+
  '</article>').join(''):'<div class="sig-chief-empty">Nenhuma sugestão automática no momento. Confira as barras da equipe antes de distribuir novas tarefas.</div>')+
 '</section>';
 const header='<div class="sig-chief-header"><div><span class="eyebrow">Gestão de equipes</span><h1>Painel do Chefe da Seção'+(scope?' · '+esc(scope):'')+'</h1><p>Acompanhe e distribua as tarefas da sua equipe com equilíbrio e clareza.</p></div></div>';
 const footer='<p class="sig-chief-footnote">O índice de carga é uma estimativa baseada na quantidade e prioridade das tarefas. Não representa horas de trabalho, disponibilidade real ou produtividade individual. O chefe deve validar qualquer redistribuição.</p>';
 return '<div class="sig-chief-page">'+header+stats+selects+memberCards+'<div class="sig-chief-grid">'+taskPanel+suggestionsHtml+'</div>'+footer+'</div>';
}

function v3NotificationsView(){
 let notes=v3MyNotifications();let html=heading('Avisos pessoais','Notificações','Avisos gerados automaticamente quando um processo ou tarefa é atribuído a você.',notes.some(n=>!n.lida_em)?'<button class="btn" data-action="readAllNotifications">Marcar todas como lidas</button>':'')+periodNotice();
 html+='<div class="card section"><div class="v3-notes">'+notes.map(n=>'<div class="v3-note '+(n.lida_em?'':'v3-unread')+'"><div><strong>'+esc(n.titulo)+'</strong><p>'+esc(n.mensagem)+'</p><small>'+new Date(n.criado_em).toLocaleString('pt-BR')+' · '+(n.lida_em?'Lida':'Não lida')+'</small></div><div class="v3-note-actions">'+(n.processo_id?'<button class="btn small" data-action="openNotification" data-id="'+esc(n.id)+'">Abrir processo</button>':'')+(!n.lida_em?'<button class="btn small" data-action="readNotification" data-id="'+esc(n.id)+'">Marcar como lida</button>':'')+'</div></div>').join('')+(notes.length?'':empty('Nenhuma notificação pessoal'))+'</div></div>';
 return html+'<p class="v3-hint">Avisos dentro do SIG; atualizados periodicamente com a página aberta. Ainda não são notificações push ou mensagens por e-mail.</p>';
}
function v3CurrentRoute(t){
 const related=db.tramites.filter(r=>r.processo_id===t.processo_id);
 const newest=related.sort((a,b)=>new Date(b.criado_em)-new Date(a.criado_em))[0];
 return newest?.id===t.id;
}
function v3ReceiptView(){
 const me=currentAuthId(),sector=setorUsuario(),arr=db.tramites.filter(t=>v3CurrentRoute(t)).filter(t=>receiptScope==='all'?(effectiveRole()==='admin'||effectiveRole()==='chefia'||t.destino===sector):receiptScope==='sector'?t.destino===sector:(t.destinatario_auth_id===me||(!t.destinatario_auth_id&&t.destino===sector))).sort((a,b)=>new Date(b.criado_em)-new Date(a.criado_em));
 const buttons='<button class="btn '+(receiptScope==='mine'?'primary':'')+'" data-action="receiptScope" data-scope="mine">Minha fila</button><button class="btn '+(receiptScope==='sector'?'primary':'')+'" data-action="receiptScope" data-scope="sector">Meu setor</button>'+(['admin','chefia'].includes(effectiveRole())?'<button class="btn '+(receiptScope==='all'?'primary':'')+'" data-action="receiptScope" data-scope="all">Todos</button>':'');
 let html=heading('Tramitação','Recebimentos','Último encaminhamento de cada processo, com prioridade, prazo e responsável.',buttons)+periodNotice();
 html+='<div class="v3-receipts">'+arr.map(t=>{const p=findProcess(t.processo_id),task=db.tarefas.find(x=>x.processo_id===t.processo_id&&x.setor===t.destino&&x.status!=='Concluída'&&x.responsavel_auth_id===t.destinatario_auth_id),can=!!task&&canWrite(t.destino),reasons=p?v3Reasons(p):[];return '<div class="card v3-receipt"><div class="v3-receipt-head"><div><button class="link-button item-title" data-action="detail" data-id="'+esc(t.processo_id)+'">'+esc(p?.numero||'Processo')+'</button><div class="cell-sub">'+esc(p?.objeto||'')+'</div></div><span class="v3-chip">'+esc(p?.prioridade||'Média')+'</span></div><div class="v3-receipt-meta"><span><b>Origem:</b> '+esc(t.origem)+'</span><span><b>Destino:</b> '+esc(t.destino)+'</span><span><b>Responsável:</b> '+esc(t.responsavel_destino)+'</span><span><b>Prazo:</b> '+fmtDate(t.prazo)+(t.prazo&&daysLeft(t.prazo)<0?' (vencido)':'')+'</span></div><p><b>Próxima providência:</b> '+esc(t.proxima_acao)+'</p><p class="cell-sub"><b>Motivo:</b> '+esc(t.motivo)+'</p>'+ (reasons.length?'<p class="v3-alerttext">⚠ '+esc(reasons.join(' · '))+'</p>':'')+'<div class="v3-actions"><button class="btn small" data-action="detail" data-id="'+esc(t.processo_id)+'">Abrir processo</button>'+(can?'<button class="btn small" data-action="editTask" data-id="'+esc(task.id)+'">Providências da tarefa</button>':'')+(can&&task.status==='Pendente'?'<button class="btn small primary" data-action="startReceipt" data-id="'+esc(task.id)+'">Iniciar atendimento</button>':'')+(can?'<button class="btn small" data-action="v4FinishTask" data-id="'+esc(task.id)+'">Concluir tarefa</button>':'')+'</div></div>'}).join('')||empty('Nenhum processo na fila ativa');
 return html+'</div>';
}
async function v3ReadNotification(id){
 const n=v3MyNotifications().find(x=>x.id===id);if(!n||n.lida_em)return;
 if(cloud())await rest('/rest/v1/notificacoes?id=eq.'+encodeURIComponent(id),'PATCH',{lida_em:nowIso()});
 n.lida_em=nowIso();
 if(!cloud())saveLocal();
 render();
}
async function v3ReadAll(){
 for(const n of v3MyNotifications().filter(x=>!x.lida_em)){await v3ReadNotification(n.id)}
 showToast('Notificações marcadas como lidas.');
}
async function v3StartReceipt(id){
 const task=db.tarefas.find(t=>t.id===id);
 if(!task||!canWrite(task.setor))throw Error('Tarefa indisponível ou sem autorização');
 if(task.status!=='Pendente')return showToast('A tarefa já foi movimentada. Atualize a página.');
 if(cloud()){
  const result=await rest('/rest/v1/tarefas?id=eq.'+encodeURIComponent(id)+'&status=eq.Pendente','PATCH',{status:'Em andamento'});
  if(!Array.isArray(result)||result.length!==1)throw Error('A tarefa foi alterada por outro usuário. Atualize e tente novamente.');
  await fetchCloud();
 }else{
  task.status='Em andamento';task.updated_at=nowIso();saveLocal();render();
 }
 showToast('Tarefa iniciada; prazo e responsável permanecem registrados.');
}


/* === SIG CSA-TIC V4 : controle operacional SOFI e contratos === */
function v4Solicitacoes(){return db.solicitacoes_empenho||[]}
function v4Competencias(){return db.competencias_contratuais||[]}
function v4ProcessLabel(id){return findProcess(id)?.numero||'Processo não localizado'}
function v4Value(v){return money(v)}
function v4OpenRequests(){return v4Solicitacoes().filter(r=>!['Empenhado','Cancelado'].includes(r.status))}
function v4PredictedContract(c){
 const first=new Date(today()+'T12:00:00');first.setDate(1);
 const future=[];
 for(let i=0;i<Math.max(1,digits(c.cobertura_alvo||3));i++){
  const date=new Date(first);date.setMonth(date.getMonth()+i);
  const period=isoDay(date),entry=v4Competencias().find(x=>x.contrato_id===c.id&&x.competencia===period);
  future.push({month:period,value:entry?digits(entry.valor_previsto):digits(c.custo_mensal),hasRecord:!!entry});
 }
 const needed=future.reduce((x,y)=>x+y.value,0),available=digits(c.saldo_empenho),shortfall=Math.max(0,needed-available);
 return {future,needed,available,shortfall,hasMissing:future.some(x=>!x.hasRecord)};
}
function v4SofiView(){
 const requests=v4Solicitacoes(),open=v4OpenRequests(),current=db.processos.filter(p=>p.setor==='SOFI'&&activeProcess(p));
 const waiting=current.filter(p=>p.status==='Aguardando empenho'),pendingValue=open.reduce((n,r)=>n+digits(r.valor_solicitado),0);
 const k=(title,value,sub)=>'<div class="card v4-kpi"><small>'+esc(title)+'</small><strong>'+esc(value)+'</strong><span>'+esc(sub)+'</span></div>';
 let html=heading('SOFI · Controle operacional','Demandas financeiras','Processos recebidos, solicitações de empenho e execução informada; não equivale a saldo oficial.',
 canFinance()?'<button class="btn primary" data-action="v4NewRequest">+ Solicitação de empenho</button><button class="btn" data-action="newEmpenho">+ Empenho</button>':'')+periodNotice();
 html+='<div class="info-note warning-note">Ambiente piloto: os valores desta tela dependem de lançamentos e conferência com BO, SIAD e documentos oficiais. Nenhum dado da planilha institucional foi importado.</div>';
 html+='<div class="v4-grid">'+k('Processos na SOFI',current.length,'Em andamento no setor')+k('Aguardando empenho',waiting.length,'Classificação do processo')+k('Solicitações abertas',open.length,'Registros sob análise')+k('Valor em solicitações abertas',v4Value(pendingValue),'Demandado, não disponível')+'</div>';
 html+='<div class="card section">'+cardTitle('Fila de processos da SOFI','Abrir providências e analisar pendências')+
 '<div class="table-scroll"><table class="data-table"><thead><tr><th>Processo / Objeto</th><th>Responsável</th><th>Situação</th><th>Prazo</th><th>Próxima providência</th><th>Ação</th></tr></thead><tbody>'+
 (current.map(p=>'<tr><td><button class="link-button cell-main" data-action="detail" data-id="'+esc(p.id)+'">'+esc(p.numero)+'</button><div class="cell-sub">'+esc(p.objeto)+'</div></td><td>'+esc(p.responsavel)+'</td><td>'+iconBadge(p.status)+'</td><td>'+fmtDate(p.prazo)+'</td><td>'+esc(p.proxima_acao||'Não definida')+'</td><td>'+(canFinance()?'<button class="btn small" data-action="v4NewRequest" data-process="'+esc(p.id)+'">Solicitar</button>':'<button class="btn small" data-action="detail" data-id="'+esc(p.id)+'">Ver</button>')+'</td></tr>').join('')||'<tr><td colspan="6" class="table-empty">Nenhum processo na SOFI.</td></tr>')+'</tbody></table></div></div>';
 html+='<div class="card section">'+cardTitle('Solicitações de empenho','Uma solicitação só fica "Empenhado" se vinculada a um empenho cadastrado.')+
 '<div class="table-scroll"><table class="data-table"><thead><tr><th>Processo</th><th>Dotação</th><th>Valor solicitado</th><th>Estado</th><th>Prazo</th><th>Pendência / ação</th><th></th></tr></thead><tbody>'+
 (requests.map(r=>'<tr><td>'+esc(v4ProcessLabel(r.processo_id))+'</td><td>'+esc(r.dotacao)+'</td><td>'+v4Value(r.valor_solicitado)+'</td><td>'+iconBadge(r.status)+'</td><td>'+fmtDate(r.prazo)+'</td><td>'+esc(r.pendencia||r.descricao||'—')+'</td><td>'+(canFinance()?'<button class="btn small" data-action="v4EditRequest" data-id="'+esc(r.id)+'">Atualizar</button>':'—')+'</td></tr>').join('')||'<tr><td colspan="7" class="table-empty">Nenhuma solicitação cadastrada.</td></tr>')+'</tbody></table></div></div>';
 const empenhos=db.empenhos.filter(e=>['Ativo','Encerrado'].includes(e.status));
 const sumEmp=empenhos.reduce((a,e)=>a+digits(e.valor_empenhado),0),sumExe=empenhos.reduce((a,e)=>a+digits(e.valor_consumido),0);
 html+='<div class="card section">'+cardTitle('Empenhos cadastrados','Total registrado: '+v4Value(sumEmp)+' · Execução informada: '+v4Value(sumExe),
 canFinance()?'<button class="btn small" data-action="newEmpenho">+ Registrar empenho</button>':'')+
 '<div class="table-scroll"><table class="data-table"><thead><tr><th>Empenho</th><th>Processo</th><th>Dotação</th><th>Empenhado</th><th>Executado</th><th>Status</th><th></th></tr></thead><tbody>'+
 (db.empenhos.map(e=>'<tr><td>'+esc(e.numero)+'/'+esc(e.ano)+'</td><td>'+esc(v4ProcessLabel(e.processo_id))+'</td><td>'+esc(e.dotacao)+'</td><td>'+v4Value(e.valor_empenhado)+'</td><td>'+v4Value(e.valor_consumido)+'</td><td>'+iconBadge(e.status)+'</td><td>'+(canFinance()?'<button class="btn small" data-action="editEmpenho" data-id="'+esc(e.id)+'">Editar</button>':'—')+'</td></tr>').join('')||'<tr><td colspan="7" class="table-empty">Nenhum empenho cadastrado.</td></tr>')+'</tbody></table></div></div>';
 const received=db.repasses.reduce((a,r)=>a+digits(r.valor_recebido),0),destined=db.repasses.reduce((a,r)=>a+digits(r.valor_destinado),0);
 html+='<div class="card section">'+cardTitle('Documentos de repasse','Recebido: '+v4Value(received)+' · Destinado informado: '+v4Value(destined),
 canFinance()?'<button class="btn small" data-action="newRepasse">+ Repasse</button>':'')+
 '<div class="table-scroll"><table class="data-table"><thead><tr><th>Documento</th><th>Dotação</th><th>Recebido</th><th>Destinado</th><th></th></tr></thead><tbody>'+
 (db.repasses.map(r=>'<tr><td>'+esc(r.documento)+'</td><td>'+esc(r.dotacao)+'</td><td>'+v4Value(r.valor_recebido)+'</td><td>'+v4Value(r.valor_destinado)+'</td><td>'+(canFinance()?'<button class="btn small" data-action="editRepasse" data-id="'+esc(r.id)+'">Editar</button>':'—')+'</td></tr>').join('')||'<tr><td colspan="5" class="table-empty">Nenhum repasse cadastrado.</td></tr>')+'</tbody></table></div><p class="v4-disclaimer">Recebido − destinado não indica automaticamente disponibilidade para empenhar.</p></div>';
 return html;
}
function v4RequestForm(id,selectedProcess){
 if(!canFinance())return showToast('Somente SOFI ou chefia podem alterar demandas de empenho.');
 const r=v4Solicitacoes().find(x=>x.id===id)||{processo_id:selectedProcess||'',dotacao:findProcess(selectedProcess)?.dotacao||'',valor_solicitado:0,status:'Em análise',descricao:'',pendencia:'',prazo:dayOffset(5),empenho_id:null};
 const procs=db.processos.filter(x=>activeProcess(x)||x.id===r.processo_id);
 const options='<option value="" '+(!r.processo_id?'selected':'')+'>Selecione um processo</option>'+procs.map(p=>'<option value="'+esc(p.id)+'" '+(p.id===r.processo_id?'selected':'')+'>'+esc(p.numero)+' · '+esc(p.setor)+' · '+esc(p.objeto.slice(0,50))+'</option>').join('');
 const empenhos='<option value="">Nenhum empenho vinculado</option>'+db.empenhos.filter(e=>e.status!=='Anulado').map(e=>'<option value="'+esc(e.id)+'" '+(e.id===r.empenho_id?'selected':'')+'>'+esc(e.numero)+'/'+esc(e.ano)+' · '+esc(v4ProcessLabel(e.processo_id))+'</option>').join('');
 const html='<form data-form="v4Request" data-id="'+esc(id||'')+'"><div class="form-grid"><div class="form-row full"><label>Processo relacionado</label><select name="processo_id" required '+(id?'disabled':'')+'>'+options+'</select></div>'+
 inputField('dotacao','Dotação para conferência',r.dotacao,'text','required maxlength="100"')+inputField('valor_solicitado','Valor solicitado (R$)',r.valor_solicitado,'number','required min="0.01" step="0.01"')+
 selectField('status','Situação',['Em análise','Aguardando documentação','Pronto para empenhar','Empenhado','Devolvido','Cancelado'],r.status)+inputField('prazo','Prazo de análise',r.prazo,'date')+
 textareaField('descricao','Descrição e justificativa',r.descricao)+textareaField('pendencia','Pendência ou motivo de devolução',r.pendencia||'')+
 '<div class="form-row full"><label>Empenho relacionado (obrigatório para marcar "Empenhado")</label><select name="empenho_id">'+empenhos+'</select></div></div><div class="modal-footer"><button type="button" class="btn" data-action="closeModal">Cancelar</button><button type="submit" class="btn primary">Salvar solicitação</button></div></form>';
 openModal(id?'Atualizar solicitação de empenho':'Nova solicitação de empenho','Registro de controle interno. A situação Empenhado exige vínculo com registro cadastrado.',html,true);
}
function v4ContractsView(){
 const contracts=db.contratos.filter(c=>searchText(c.numero,c.objeto,c.fornecedor,c.gestor).includes(filters.q.toLowerCase()));
 const alert=contracts.filter(c=>c.status==='Vigente'&&(daysLeft(c.fim)<=60||v4PredictedContract(c).shortfall>0));
 let html=heading('Execução continuada','Contratos continuados','Projeção mensal, cobertura estimada e alertas de vigência.',
 canFinance()?'<button class="btn primary" data-action="newContract">+ Contrato</button>':'')+periodNotice();
 html+='<div class="v4-grid"><div class="card v4-kpi"><small>Contratos cadastrados</small><strong>'+contracts.length+'</strong></div><div class="card v4-kpi"><small>Com alerta de cobertura ou vigência</small><strong>'+alert.length+'</strong></div><div class="card v4-kpi"><small>Competências previstas</small><strong>'+v4Competencias().length+'</strong></div></div>';
 html+='<div class="info-note">Saldo informado e custo mensal são lançamentos manuais: a cobertura calculada representa planejamento, <strong>não comprova saldo oficial nem autoriza reforço</strong>.</div>';
 html+='<div class="toolbar"><label class="searchbox">⌕ <input id="filter-q" data-filter="q" placeholder="Buscar contrato, objeto ou fornecedor..." value="'+esc(filters.q)+'"></label></div>';
 html+='<div class="v4-contract-grid">'+contracts.map(c=>{
 const forecast=v4PredictedContract(c),due=daysLeft(c.fim),warning=c.status==='Vigente'&&(due<=60||forecast.shortfall>0);
 return '<div class="card v4-contract"><div class="v4-contract-top"><div><h3>'+esc(c.numero)+'</h3><div class="cell-sub">'+esc(c.objeto)+' · '+esc(c.fornecedor)+'</div></div>'+iconBadge(c.status)+'</div>'+
 '<div class="v4-contract-data"><div><small>Vigência</small><b>'+fmtDate(c.fim)+'</b></div><div><small>Saldo informado</small><b>'+v4Value(c.saldo_empenho)+'</b></div><div><small>Previsão '+esc(c.cobertura_alvo)+' mês(es)</small><b>'+v4Value(forecast.needed)+'</b></div><div><small>Diferença projetada</small><b>'+v4Value(forecast.shortfall)+'</b></div></div>'+
 (warning?'<div class="v4-alert">Atenção: '+(due<=60?'vigência em até 60 dias. ':'')+(forecast.shortfall>0?'previsão acima do saldo informado.':'')+'</div>':'')+
 '<p class="v4-disclaimer">'+(forecast.hasMissing?'Parte da previsão usa o custo mensal padrão por ausência de competência cadastrada.':'Todas as competências do horizonte possuem previsão cadastrada.')+'</p>'+
 '<div class="v4-mini-calendar">'+forecast.future.map(f=>'<div><span>'+fmtDate(f.month)+'</span><strong>'+v4Value(f.value)+'</strong>'+(f.hasRecord?'':'<small>estimado</small>')+'</div>').join('')+'</div>'+
 '<div class="v4-actions">'+(canFinance()?'<button class="btn small" data-action="editContract" data-id="'+esc(c.id)+'">Editar contrato</button><button class="btn small" data-action="v4NewCompetence" data-id="'+esc(c.id)+'">+ Competência</button>':'')+
 '<button class="btn small" data-action="v4ContractSchedule" data-id="'+esc(c.id)+'">Ver calendário</button></div></div>';
 }).join('')||empty('Nenhum contrato cadastrado.')+'</div>';
 return html;
}
function v4ScheduleModal(contractId){
 const c=db.contratos.find(x=>x.id===contractId);
 if(!c)return showToast('Contrato não encontrado.');
 const comps=v4Competencias().filter(x=>x.contrato_id===c.id).sort((a,b)=>a.competencia.localeCompare(b.competencia));
 const html='<div class="info-note">Competências registradas manualmente. Previsões, liquidações e pagamentos precisam ser conciliados com os documentos oficiais.</div>'+
 '<div class="table-scroll"><table class="data-table"><thead><tr><th>Competência</th><th>Previsto</th><th>Executado informado</th><th>Situação</th><th>Documento</th><th></th></tr></thead><tbody>'+
 (comps.map(x=>'<tr><td>'+fmtDate(x.competencia)+'</td><td>'+v4Value(x.valor_previsto)+'</td><td>'+v4Value(x.valor_executado)+'</td><td>'+iconBadge(x.status)+'</td><td>'+esc(x.documento_referencia||'—')+'</td><td>'+(canFinance()?'<button class="btn small" data-action="v4EditCompetence" data-id="'+esc(x.id)+'">Editar</button>':'—')+'</td></tr>').join('')||'<tr><td colspan="6" class="table-empty">Nenhuma competência registrada.</td></tr>')+'</tbody></table></div>'+
 (canFinance()?'<div class="modal-footer"><button class="btn primary" data-action="v4NewCompetence" data-id="'+esc(c.id)+'">+ Nova competência</button></div>':'');
 openModal('Calendário contratual',c.numero+' · '+c.objeto,html,true);
}
function v4CompetenceForm(id,contractId){
 if(!canFinance())return showToast('Somente SOFI e chefia podem editar competências.');
 const x=v4Competencias().find(e=>e.id===id)||{contrato_id:contractId,competencia:today().slice(0,7)+'-01',valor_previsto:0,valor_executado:0,status:'Prevista',documento_referencia:'',observacoes:''};
 const c=db.contratos.find(a=>a.id===x.contrato_id);
 if(!c)return showToast('Contrato não localizado.');
 const html='<form data-form="v4Competence" data-id="'+esc(id||'')+'" data-contract="'+esc(c.id)+'"><div class="form-grid">'+inputField('competencia','Competência',String(x.competencia).slice(0,7),'month','required')+
 inputField('valor_previsto','Valor previsto (R$)',x.valor_previsto,'number','required min="0" step="0.01"')+
 inputField('valor_executado','Execução informada (R$)',x.valor_executado,'number','required min="0" step="0.01"')+
 selectField('status','Situação',['Prevista','Atestada','Liquidada','Paga'],x.status)+
 inputField('documento_referencia','Documento de referência',x.documento_referencia||'')+textareaField('observacoes','Observações',x.observacoes||'')+
 '</div><div class="modal-footer"><button type="button" class="btn" data-action="closeModal">Cancelar</button><button class="btn primary" type="submit">Salvar competência</button></div></form>';
 openModal(id?'Editar competência':'Nova competência',c.numero+' · Registros informados manualmente',html,true);
}
function v4FinishTaskModal(id){
 const t=db.tarefas.find(x=>x.id===id);
 if(!t||!canWrite(t.setor))return showToast('Sem permissão para concluir a tarefa.');
 if(t.status==='Concluída')return showToast('Tarefa já concluída.');
 const html='<div class="info-note"><strong>'+esc(t.titulo)+'</strong><p>Responsável: '+esc(t.responsavel)+' · Setor: '+esc(t.setor)+'</p></div>'+
 '<form data-form="v4FinishTask" data-id="'+esc(id)+'"><div class="form-grid">'+textareaField('conclusao_observacao','Providência executada e resultado','')+
 '</div><div class="modal-footer"><button class="btn" type="button" data-action="closeModal">Cancelar</button><button class="btn primary" type="submit">Concluir tarefa</button></div></form>';
 openModal('Concluir tarefa','A conclusão ficará registrada com data, autor e justificativa.',html,true);
}
async function v4HandleFinishTask(form){
 const t=db.tarefas.find(x=>x.id===form.dataset.id);
 if(!t||!canWrite(t.setor))throw Error('Tarefa indisponível.');
 const obs=String(gather(form).conclusao_observacao||'').trim();
 if(obs.length<8)return showToast('Descreva a providência executada (mínimo 8 caracteres).');
 if(t.status==='Concluída')return showToast('Tarefa já concluída.');
 busy=true;
 try{
 if(cloud()){
  const res=await rest('/rest/v1/tarefas?id=eq.'+encodeURIComponent(t.id)+'&status=neq.Conclu%C3%ADda','PATCH',{status:'Concluída',conclusao_observacao:obs});
  if(!Array.isArray(res)||res.length!==1)throw Error('A tarefa já foi alterada. Atualize antes de concluir.');
  await fetchCloud();
 }else{
  t.status='Concluída';t.conclusao_observacao=obs;t.concluida_em=nowIso();t.concluida_por=currentAuthId();t.updated_at=nowIso();
  db.eventos.unshift({id:uuid(),processo_id:t.processo_id,tipo:'Tarefa concluída',descricao:t.titulo+' · '+obs,usuario:profile.nome,criado_em:nowIso()});saveLocal();
 }
 closeModal();render();showToast('Tarefa concluída e registrada no histórico.');
 }catch(e){showToast('Falha ao concluir tarefa: '+errMsg(e))}finally{busy=false}
}
async function v4HandleRequest(form){
 if(!canFinance())return showToast('Acesso financeiro não autorizado.');
 const d=gather(form),old=v4Solicitacoes().find(x=>x.id===form.dataset.id);
 if(old)d.processo_id=old.processo_id;
 d.valor_solicitado=Number(d.valor_solicitado);d.empenho_id=d.empenho_id||null;d.pendencia=d.pendencia||null;
 if(!d.processo_id||!findProcess(d.processo_id))return showToast('Selecione um processo válido.');
 if(!Number.isFinite(d.valor_solicitado)||d.valor_solicitado<=0)return showToast('Valor solicitado inválido.');
 if((d.descricao||'').trim().length<8)return showToast('Informe a justificativa da solicitação.');
 if(d.status==='Empenhado'&&!d.empenho_id)return showToast('Vincule o empenho antes de marcar "Empenhado".');
 if(['Devolvido','Aguardando documentação'].includes(d.status)&&(!d.pendencia||d.pendencia.trim().length<8))return showToast('Descreva o motivo da pendência/devolução.');
 const record={...old,...d,id:old?.id||uuid()};
 busy=true;try{await persist('solicitacoes_empenho',record,!!old);closeModal();await (cloud()?fetchCloud():Promise.resolve());render();showToast('Solicitação financeira registrada.');}catch(e){showToast('Erro: '+errMsg(e))}finally{busy=false}
}
async function v4HandleCompetence(form){
 if(!canFinance())return showToast('Acesso financeiro não autorizado.');
 const d=gather(form),old=v4Competencias().find(x=>x.id===form.dataset.id);
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(d.competencia||''))return showToast('Competência inválida.');
 const contractId=old?.contrato_id||form.dataset.contract;
 if(!db.contratos.some(x=>x.id===contractId))return showToast('Contrato não encontrado.');
 const record={...old,...d,id:old?.id||uuid(),contrato_id:contractId,competencia:d.competencia+'-01',valor_previsto:Number(d.valor_previsto),valor_executado:Number(d.valor_executado)};
 if(!Number.isFinite(record.valor_previsto)||!Number.isFinite(record.valor_executado)||record.valor_previsto<0||record.valor_executado<0)return showToast('Valores devem ser não negativos.');
 if(v4Competencias().some(x=>x.id!==record.id&&x.contrato_id===contractId&&x.competencia===record.competencia))return showToast('Essa competência já está cadastrada no contrato.');
 busy=true;try{await persist('competencias_contratuais',record,!!old);closeModal();await (cloud()?fetchCloud():Promise.resolve());render();showToast('Competência contratual salva.');}catch(e){showToast('Erro: '+errMsg(e))}finally{busy=false}
}


/* SIG V5 — prévia inteiramente local; não transmite JSON ou dados financeiros ao Supabase. */
function v5Count(num){return new Intl.NumberFormat('pt-BR').format(Number(num)||0)}
function v5FormatCents(num){return Number.isFinite(Number(num))?new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(num)/100):'—'}
function v5View(){
 if(!canFinance())return heading('Acesso restrito','Motor de Dados','A conferência financeira é exclusiva de administradores, chefia e SOFI.');
 const actions='<button class="btn" data-action="vaultRestore" data-kind="v5">Restaurar cópia protegida</button>'+
 (v5Report?'<button class="btn" data-action="vaultSave" data-kind="v5">Salvar cópia protegida</button>':'')+
 '<button class="btn" data-action="vaultDelete" data-kind="v5">Apagar cópia local</button>'+
 '<button class="btn" data-action="v5Demo">Exemplo fictício</button>'+
 (v5Report?'<button class="btn" data-action="v5Clear">Limpar prévia</button>':'');
 let html=heading('Integração de planilhas','Motor de Dados — V5','Interpretação, validação, comparação e conferência dos arquivos produzidos pelo Apps Script.',actions);
 html+='<div class="v5-notice"><strong>Processamento somente no navegador.</strong> O relatório escolhido abaixo é lido localmente no seu dispositivo. Não é enviado ao GitHub, ao Supabase ou a qualquer API de IA. Você pode guardar uma cópia criptografada neste navegador e recuperá-la com a senha do cofre após novo login. Ainda não há sincronização financeira automática.</div>';
 html+='<div class="card v5-upload"><div><h2>1. Analisar uma prévia do Google Sheets</h2><p>Na planilha saldos_2_0, execute <b>SIG V5 (prévia) → Baixar relatório JSON</b> e selecione o arquivo gerado.</p></div><label class="btn primary v5-label" for="v5-json-file">Selecionar SIG_V5_PREVIA.json</label><input type="file" id="v5-json-file" accept=".json,application/json" class="v5-file"></div>';
 html+='<div class="card section">'+cardTitle('2. Instalação do extrator','Executar uma única vez, sem alterar a importação existente')+
 '<ol class="v5-steps"><li>Abra <b>saldos_2_0 → Extensões → Apps Script</b>.</li><li>Crie um arquivo separado chamado <b>SIG_V5_AppsScript.gs</b> e cole o código fornecido no GitHub.</li><li>Salve e execute <code>sigV5InstalarMenu</code> uma vez; autorize apenas os escopos que o Google solicitar.</li><li>Use o menu <b>SIG V5 (prévia) → Gerar análise (sem envio)</b>.</li><li>Revise a nova aba <code>SIG_V5_PREVIA</code>. Se quiser registrar as diferenças dentro da própria planilha, escolha <b>Registrar versão conferida</b>.</li></ol>'+
 '<p class="v5-guide"><a href="https://github.com/brunodev-creator/painel-tarefas-csatic/blob/main/gestao/integracao/SIG_V5_AppsScript.gs" target="_blank" rel="noopener">Abrir código do extrator no GitHub ↗</a></p></div>';
 if(!v5Report)return html+'<div class="card section">'+empty('Selecione um relatório JSON ou use o exemplo fictício para conhecer a conferência.')+'</div>';
 const r=v5Report,check=Array.isArray(r.resumo)?r.resumo:[],alerts=Array.isArray(r.alertas)?r.alertas:[],blocks=Array.isArray(r.bloqueios)?r.bloqueios:[],groups=Array.isArray(r.agrupamentos)?r.agrupamentos:[];
 html+='<div class="v5-grid">'+[{title:'Registros analisados',value:v5Count(r.total_registros),sub:'Posição dos relatórios'},{title:'Abas reconhecidas',value:check.length,sub:'Estruturas mapeadas'},{title:'Alertas',value:alerts.length,sub:'Itens para revisão'},{title:'Bloqueios',value:blocks.length,sub:'Impedem registrar versão'}].map(x=>'<div class="card v5-metric"><small>'+esc(x.title)+'</small><strong>'+esc(String(x.value))+'</strong><span>'+esc(x.sub)+'</span></div>').join('')+'</div>';
 html+='<div class="card section">'+cardTitle('Prévia carregada',esc(r.origem||'Planilha sem identificação'))+
 '<div class="v5-meta"><span><b>Tipo:</b> '+esc(r.tipo||'—')+'</span><span><b>Gerado em:</b> '+esc(r.gerado_em||'—')+'</span><span><b>Assinatura:</b> <code>'+esc(String(r.assinatura_geral||'').slice(0,30))+'…</code></span></div>'+
 (r.comparacao?'<div class="v5-diff"><span>Novos: <b>'+v5Count(r.comparacao.novos)+'</b></span><span>Alterados: <b>'+v5Count(r.comparacao.alterados)+'</b></span><span>Ausentes na posição: <b>'+v5Count(r.comparacao.ausentes)+'</b></span></div>':'<p class="v5-guide">Ainda não existe versão anterior registrada para comparação, ou ela não estava disponível ao gerar o relatório.</p>')+'</div>';
 html+='<div class="card section">'+cardTitle('Fontes reconhecidas','Cada aba é conferida separadamente; totais de relatórios distintos não são somados entre si.')+
 '<div class="table-scroll"><table class="data-table"><thead><tr><th>Fonte</th><th>Tipo</th><th>Linhas interpretadas</th><th>Valor principal (informativo)</th></tr></thead><tbody>'+
 check.map(x=>{const entries=Object.entries(x.total_centavos||{}),p=entries[0];return '<tr><td><b>'+esc(x.aba)+'</b></td><td>'+esc(x.tipo||'')+'</td><td>'+v5Count(x.registros)+'</td><td>'+(p?esc(p[0])+': '+v5FormatCents(p[1]):'Não aplicável')+'</td></tr>'}).join('')+
 '</tbody></table></div></div>';
 html+='<div class="card section">'+cardTitle('Movimentações consolidadas de cotas','Linhas do mesmo documento e dotação são consolidadas pelo valor líquido, mantendo sua quantidade de movimentos.')+
 (groups.length?'<div class="table-scroll"><table class="data-table"><thead><tr><th>Documento e dotação</th><th>Linhas</th><th>Movimentos</th><th>Valor líquido</th></tr></thead><tbody>'+
 groups.map(g=>'<tr><td><code>'+esc(g.chave)+'</code></td><td>'+esc((g.linhas||[]).join(', '))+'</td><td>'+v5Count(g.movimentos)+'</td><td><b>'+v5FormatCents(g.valor_liquido_centavos)+'</b></td></tr>').join('')+'</tbody></table></div>':'<p class="v5-guide">Nenhuma chave com múltiplas movimentações identificada.</p>')+'</div>';
 html+='<div class="card section">'+cardTitle('Ocorrências de qualidade','A aprovação da versão deve ocorrer após tratar os bloqueios.')+
 (alerts.length?'<div class="table-scroll"><table class="data-table"><thead><tr><th>Gravidade</th><th>Aba / linha</th><th>Motivo</th></tr></thead><tbody>'+alerts.slice(0,80).map(a=>'<tr><td><span class="v5-chip '+(a.gravidade==='BLOQUEIO'?'v5-block':'')+'">'+esc(a.gravidade)+'</span></td><td>'+esc(a.aba)+' · '+esc(a.linha)+'</td><td>'+esc(a.motivo)+'</td></tr>').join('')+'</tbody></table></div>':'<div class="v5-clean">Nenhuma inconsistência sinalizada nas regras atuais.</div>')+'</div>';
 html+='<p class="v5-footer">Relatório limitado a regras estruturais. Não substitui conformidade orçamentária, análise contábil ou validação nos sistemas oficiais.</p>';
 return html;
}
function v5Demo(){
 v5Report={sig_version:'5.0.0',tipo:'PREVIA_LOCAL',origem:'Demonstração fictícia (sem dados reais)',gerado_em:new Date().toISOString(),
 total_registros:9,comparacao:{novos:2,alterados:1,ausentes:0},assinatura_geral:'DEMO-SEM-HASH-REAL',agrupamentos:[{aba:'IMPORT_SALDOS_BO',chave:'2026|1|DOTACAO-FICTICIA',linhas:[2,3],movimentos:2,valor_liquido_centavos:297000}],resumo:[
 {aba:'IMPORT_SALDOS_BO',tipo:'cotas',registros:3,total_centavos:{Valor_Descentralizado:5000000}},
 {aba:'DESTINACAO_REPASSES',tipo:'destinacoes',registros:4,total_centavos:{Valor_RIPC:1800000}},
 {aba:'INDICE_EMPENHOS',tipo:'empenhos',registros:2,total_centavos:{Total_Empenhado_Liquido:1000000}}],
 alertas:[{gravidade:'AVISO',aba:'IMPORT_SALDOS_BO',linha:7,motivo:'Documento de repasse sem campo obrigatório'}],bloqueios:[]};
 render();
}
async function v5ReadLocal(file){
 if(!canFinance())throw Error('Acesso não autorizado.');
 if(!file) return;
 if(file.size>2*1024*1024)throw Error('Arquivo de prévia muito grande (limite 2 MB).');
 const raw=await file.text();
 let result;try{result=JSON.parse(raw)}catch{throw Error('JSON inválido. Gere novamente pelo Apps Script.')}
 if(result?.sig_version!=='5.0.0'||result.tipo!=='PREVIA_LOCAL'||!Array.isArray(result.resumo)||!Array.isArray(result.alertas)||!Array.isArray(result.bloqueios))throw Error('Relatório não reconhecido como prévia SIG V5.');
 if(result.resumo.length>20||result.alertas.length>300)throw Error('Relatório excede limites estruturais de leitura.');
 v5Report=result;render();showToast('Prévia interpretada localmente. Nenhum dado foi transmitido.');
}


/* Cofre local de relatórios financeiros.
 * Os dados continuam no navegador; somente cópia criptografada vai para IndexedDB.
 * A chave NÃO é a senha de acesso ao SIG e não é guardada pelo site. */
function vaultScope(){
 if(!cloud()||!session?.user?.id||!canFinance())throw Error('Entre com seu usuário autorizado para guardar ou recuperar a cópia financeira.');
 if(!window.SIG_VAULT?.supported())throw Error('O navegador não oferece criptografia e armazenamento local compatíveis.');
 return {uid:session.user.id,project:config.url};
}
function vaultData(kind){return kind==='v5'?v5Report:kind==='v6'?window.SIG_V6.getData():window.SIG_V7.getData();}
function vaultShow(kind,mode){
 if(!['v5','v6','v7'].includes(kind))return;
 try{vaultScope()}catch(e){showToast(errMsg(e));return;}
 if(mode==='delete'){
  if(!window.confirm('Apagar a cópia protegida de '+kind.toUpperCase()+' armazenada NESTE navegador para esta conta? Os arquivos JSON originais não serão apagados.'))return;
  vaultDelete(kind).catch(e=>showToast(errMsg(e)));return;
 }
 if(mode==='save'&&!vaultData(kind))return showToast('Importe primeiro o relatório JSON que deseja salvar.');
 const isSave=mode==='save';
 const textInfo=isSave
  ?'Defina uma frase-senha diferente da senha de login do SIG (mínimo 12 caracteres). Ela não será armazenada e será necessária para recuperar a cópia. Salvar substituirá eventual cópia anterior desta versão neste dispositivo.'
  :'Informe a frase-senha usada ao salvar o relatório neste dispositivo. Se o navegador foi limpo ou você está em outro aparelho, reimporte o JSON.';
 const form='<div class="v7-vault-warning">'+esc(textInfo)+'</div>'+
 '<form data-form="vault" data-kind="'+kind+'" data-mode="'+mode+'">'+
 '<div class="form-grid">'+inputField('cofre_senha','Frase-senha do cofre','', 'password','required minlength="12" autocomplete="off"')+
 (isSave?inputField('cofre_confirmacao','Repita a frase-senha','', 'password','required minlength="12" autocomplete="off"'):'')+'</div>'+
 '<div class="modal-footer"><button class="btn" type="button" data-action="closeModal">Cancelar</button>'+
 '<button class="btn primary" type="submit">'+(isSave?'Salvar cópia neste dispositivo':'Restaurar cópia')+'</button></div></form>';
 openModal(isSave?'Guardar relatório protegido':'Recuperar relatório protegido',kind.toUpperCase()+' · navegador atual',form);
}
async function vaultSubmit(form){
 if(busy)return;
 const kind=form.dataset.kind,mode=form.dataset.mode;
 if(!['v5','v6','v7'].includes(kind)||!['save','restore'].includes(mode))return;
 const {uid,project}=vaultScope();
 const pass=form.elements.namedItem('cofre_senha')?.value||'';
 if(pass.length<12)throw Error('Frase-senha com no mínimo 12 caracteres.');
 if(mode==='save'&&pass!==form.elements.namedItem('cofre_confirmacao')?.value)throw Error('As frases-senha não coincidem.');
 busy=true;
 try{
  if(mode==='save'){
   const data=vaultData(kind);
   if(!data)throw Error('Não existe relatório aberto para salvar.');
   await window.SIG_VAULT.save(uid,project,kind,data,pass);
   closeModal();showToast(kind.toUpperCase()+' armazenada com criptografia apenas neste dispositivo.');
  }else{
   const data=await window.SIG_VAULT.unlock(uid,project,kind,pass);
   if(!session?.user?.id||session.user.id!==uid||config.url!==project||!canFinance())throw Error('A conta mudou enquanto a cópia era desbloqueada.');
   if(kind==='v5'){
    if(data.sig_version!=='5.0.0'||data.tipo!=='PREVIA_LOCAL'||!Array.isArray(data.resumo)||!Array.isArray(data.alertas)||!Array.isArray(data.bloqueios))
      throw Error('Cópia V5 não reconhecida.');
    v5Report=data;view='importacoes';
   }else if(kind==='v6'){
    window.SIG_V6.restore(data);view='conciliacao';
   }else{
    window.SIG_V7.restore(data);view='auditoria';
   }
   closeModal();render();showToast('Cópia '+kind.toUpperCase()+' restaurada neste navegador.');
  }
 }finally{busy=false;}
}
async function vaultDelete(kind){
 const {uid,project}=vaultScope();
 await window.SIG_VAULT.remove(uid,project,kind);
 showToast('Cópia protegida '+kind.toUpperCase()+' apagada deste navegador.');
}
function vaultClearOpenReports(){
 v5Report=null;
 window.SIG_V7.clear();
 window.SIG_V6.reset();
}

function dashboardView(){
 const opened=processOpen(),waiting=db.processos.filter(p=>p.status==='Aguardando empenho'),blocked=opened.filter(processBlocked),lateTasks=db.tarefas.filter(isOverdue),coverage=db.contratos.filter(c=>c.status==='Vigente'&&digits(c.custo_mensal)>0&&digits(c.saldo_empenho)/digits(c.custo_mensal)<digits(c.cobertura_alvo));
 const dept=SECTORS.map(s=>({s,n:opened.filter(p=>p.setor===s).length})),max=Math.max(...dept.map(x=>x.n),1);
 const k=(label,value,foot,ico,cls='')=>`<div class="card kpi ${cls}"><div class="kpi-label">${label}</div><div class="kpi-icon">${ico}</div><div class="kpi-value">${value}</div><div class="kpi-foot">${foot}</div></div>`;
 return heading('Centro de controle','Visão geral','Acompanhamento de Compras, Licitação, SOFI e contratos.',`<button class="btn" data-action="export">↓ Exportar</button><button class="btn primary" data-action="newProcess">+ Novo processo</button>`)+periodNotice()+`<div class="kpi-grid">${k('Processos em aberto',opened.length,'Distribuídos entre três setores','▤','blue')}${k('Pendências e bloqueios',blocked.length,'Atrasos e impedimentos sinalizados','!','red')}${k('Tarefas atrasadas',lateTasks.length,'Providências com prazo vencido','◷','alert')}${k('Em análise para empenho',compact(waiting.reduce((a,p)=>a+moneyToCommit(p),0)),'Estimativa com base nos registros locais','▥')}</div>
 <div class="dashboard-grid"><div><div class="card section">${cardTitle('Carga de processos por setor','Processos ainda não concluídos')}<div class="stat-list">${dept.map(x=>`<div class="stat-line"><div class="stat-name">${x.s}</div><div class="barwrap"><div class="bar" style="width:${Math.round(x.n/max*100)}%"></div></div><div class="stat-num">${x.n}</div></div>`).join('')}</div></div>
 <div class="card section">${cardTitle('Processos que exigem atenção','Vencidos ou classificados como bloqueados',`<button class="btn small" data-view="processos">Ver todos →</button>`)}${blocked.slice(0,5).map(p=>`<div class="row-item"><div><button class="link-button item-title" data-action="detail" data-id="${esc(p.id)}">${esc(p.numero)} · ${esc(p.objeto)}</button><div class="item-meta">${esc(p.setor)} · ${esc(p.responsavel)} · ${esc(p.proxima_acao||'Sem próxima ação')}</div></div>${iconBadge(p.status)}</div>`).join('')||empty('Sem bloqueios ou atrasos registrados')}</div></div>
 <div><div class="card section">${cardTitle('Tarefas prioritárias','Ordenadas por vencimento',`<button class="btn small" data-view="tarefas">Minhas tarefas →</button>`)}${db.tarefas.filter(t=>t.status!=='Concluída').sort((a,b)=>daysLeft(a.prazo)-daysLeft(b.prazo)).slice(0,6).map(t=>`<div class="row-item"><div><div class="item-title">${esc(t.titulo)}</div><div class="item-meta">${esc(t.setor)} · ${esc(t.responsavel)} · ${fmtDate(t.prazo)}</div></div><span class="flag ${isOverdue(t)?'red':'amber'}">${isOverdue(t)?'Atrasada':esc(t.prioridade)}</span></div>`).join('')||empty('Nenhuma tarefa pendente')}</div>
 <div class="card section">${cardTitle('Contratos sob atenção','Cobertura inferior à meta configurada',`<button class="btn small" data-view="contratos">Contratos →</button>`)}${coverage.slice(0,4).map(c=>`<div class="row-item"><div><div class="item-title">${esc(c.numero)}</div><div class="item-meta">${esc(c.objeto)}</div></div><span class="flag amber">${(digits(c.saldo_empenho)/digits(c.custo_mensal)).toLocaleString('pt-BR',{maximumFractionDigits:1})} mês(es)</span></div>`).join('')||empty('Nenhum alerta de cobertura')}</div></div></div>`;
}
/* Área de Compras — primeiro ciclo de UX, sem novas tabelas ou APIs. */
function purchaseDays(prazo){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(String(prazo||'').slice(0,10)))return Infinity;
 const target=new Date(String(prazo).slice(0,10)+'T12:00:00');
 const current=new Date();current.setHours(12,0,0,0);
 return Math.round((target.getTime()-current.getTime())/86400000);
}
function purchaseIssue(p){
 const due=purchaseDays(p.prazo);
 return activeProcess(p)&&(p.status==='Bloqueado'||p.status==='Aguardando providência'||due<0);
}
function purchaseDueSoon(p){
 const due=purchaseDays(p.prazo);
 return activeProcess(p)&&Number.isFinite(due)&&due>=0&&due<=7;
}
function purchaseSort(a,b){
 const score=p=>purchaseIssue(p)?0:purchaseDueSoon(p)?1:activeProcess(p)?2:3;
 const x=score(a)-score(b);if(x!==0)return x;
 const da=purchaseDays(a.prazo),dbb=purchaseDays(b.prazo);
 return da-dbb||String(a.numero).localeCompare(String(b.numero),'pt-BR',{numeric:true});
}
function purchaseView(){
 const all=db.processos.filter(p=>p.setor==='Compras');
 const counts={all:all.length,attention:all.filter(purchaseIssue).length,week:all.filter(purchaseDueSoon).length,done:all.filter(p=>p.status==='Concluído').length};
 const visible=all.filter(p=>purchaseFilter==='attention'?purchaseIssue(p):purchaseFilter==='week'?purchaseDueSoon(p):purchaseFilter==='done'?p.status==='Concluído':true)
  .filter(p=>searchText(p.numero,p.objeto,p.responsavel,p.etapa,p.proxima_acao,p.referencia_sei,p.dotacao).includes(filters.q.toLocaleLowerCase('pt-BR'))).sort(purchaseSort);
 const tabs=[
  {id:'all',label:'Todos os processos',help:'Registro completo',value:counts.all,icon:'▤'},
  {id:'attention',label:'Exigem atenção',help:'Atrasados, bloqueados ou aguardando ação',value:counts.attention,icon:'!'},
  {id:'week',label:'Próximos 7 dias',help:'Prazos que estão chegando',value:counts.week,icon:'◷'},
  {id:'done',label:'Concluídos',help:'Histórico finalizado',value:counts.done,icon:'✓'}
 ];
 const canEdit=!previewRole&&canWrite('Compras');
 const metrics='<div class="sig-buy-metrics" aria-label="Filtrar processos de compras">'+tabs.map(t=>
  '<button type="button" class="sig-buy-metric'+(purchaseFilter===t.id?' active':'')+'" data-action="buyFilter" data-filter="'+t.id+'" aria-pressed="'+String(purchaseFilter===t.id)+'"><span class="sig-buy-metric-top"><span>'+esc(t.label)+'</span><span class="sig-buy-metric-icon" aria-hidden="true">'+t.icon+'</span></span><strong>'+t.value+'</strong><small>'+esc(t.help)+'</small></button>'
 ).join('')+'</div>';
 const card=p=>{
  const due=purchaseDays(p.prazo),issue=purchaseIssue(p);
  const deadline=!p.prazo?'Prazo não definido':due<0?'Atrasado há '+Math.abs(due)+' dia(s)':due===0?'Vence hoje':due<=7?'Vence em '+due+' dia(s)':'Prazo '+fmtDate(p.prazo);
  const urgency=issue?' urgent':purchaseDueSoon(p)?' near':'';
  return '<article class="sig-buy-item'+urgency+'">'+
   '<div class="sig-buy-item-head"><div class="sig-buy-item-heading"><button type="button" class="sig-buy-process-link" data-action="detail" data-id="'+esc(p.id)+'">'+esc(p.numero)+'</button><h3>'+esc(p.objeto||'Objeto não informado')+'</h3></div><div class="sig-buy-tags">'+iconBadge(p.status)+(p.prioridade==='Alta'?'<span class="sig-buy-high">Alta prioridade</span>':'')+'</div></div>'+
   '<div class="sig-buy-next"><span>Próxima providência</span><strong>'+esc(p.proxima_acao||'Definir a próxima providência')+'</strong></div>'+
   '<div class="sig-buy-item-bottom"><div class="sig-buy-meta"><span>Responsável: <b>'+esc(p.responsavel||'Não definido')+'</b></span><span class="'+(issue?'sig-buy-deadline-urgent':'')+'">'+esc(deadline)+'</span><span>Etapa: '+esc(p.etapa||'Não definida')+'</span></div>'+
   '<div class="sig-buy-actions"><button type="button" class="btn" data-action="detail" data-id="'+esc(p.id)+'">Ver detalhes</button>'+(canEdit?'<button type="button" class="btn primary" data-action="editProcess" data-id="'+esc(p.id)+'">Atualizar</button>':'')+'</div></div></article>';
 };
 const list=visible.length?visible.slice(0,purchaseLimit).map(card).join(''):'<div class="sig-buy-empty"><strong>Nenhum processo encontrado neste filtro.</strong><span>Altere o filtro ou a pesquisa para consultar outras demandas.</span></div>';
 const taskCount=db.tarefas.filter(t=>t.setor==='Compras'&&t.status!=='Concluída'&&assignedToMe(t)).length;
 const headingHtml='<div class="sig-buy-head"><div><div class="eyebrow">Fluxo de aquisições</div><h1>Central de Compras</h1><p>Encontre rapidamente as demandas que precisam de providência.</p></div><div class="sig-buy-head-actions">'+
  '<button type="button" class="btn" data-view="tarefas">Minhas tarefas'+(taskCount?' · '+taskCount+' no setor':'')+'</button>'+
  (canEdit?'<button type="button" class="btn primary" data-action="newProcess" data-sector="Compras">+ Nova demanda</button>':'')+
  '</div></div>';
 const top='<div class="sig-buy-workbar"><label class="sig-buy-search"><span aria-hidden="true">⌕</span><input id="filter-q" data-filter="q" type="search" autocomplete="off" placeholder="Buscar número, objeto, responsável ou SEI" aria-label="Buscar processos de compras" value="'+esc(filters.q)+'"></label><span class="sig-buy-count" role="status">'+visible.length+' de '+all.length+' processo(s)</span></div>';
 const more=visible.length>purchaseLimit?'<div class="sig-buy-more"><span>Exibindo '+Math.min(visible.length,purchaseLimit)+' de '+visible.length+' processos filtrados</span><button type="button" class="btn" data-action="buyMore">Ver mais processos ↓</button></div>':'';
 return '<section class="sig-buy-page">'+headingHtml+metrics+top+'<div class="sig-buy-list">'+list+'</div>'+more+'<p class="sig-buy-hint">Processos ordenados por urgência e prazo. Registros de compras são mantidos no mesmo banco e histórico do SIG.</p></section>';
}
function processView(sector){if(sector==='Compras')return purchaseView();
 const all=sector?db.processos.filter(p=>p.setor===sector):db.processos;
 const arr=all.filter(p=>filters.setor==='Todos'||p.setor===filters.setor).filter(p=>filters.status==='Todos'||p.status===filters.status).filter(p=>searchText(p.numero,p.objeto,p.responsavel,p.etapa,p.dotacao,p.proxima_acao).includes(filters.q.toLocaleLowerCase('pt-BR'))).sort((a,b)=>(a.status==='Concluído')-(b.status==='Concluído')||daysLeft(a.prazo)-daysLeft(b.prazo));
 const title=sector?sector:'Central de processos';const can=canWrite(sector||'Compras')||canWrite('Licitação')||canWrite('SOFI');
 const actions=`<button class="btn" data-action="export">↓ Exportar</button>${can?`<button class="btn primary" data-action="newProcess" data-sector="${esc(sector||'Compras')}">+ Novo processo</button>`:''}`;
 const toolbar=`<div class="toolbar"><label class="searchbox">⌕ <input id="filter-q" data-filter="q" placeholder="Buscar número, objeto, responsável ou dotação..." value="${esc(filters.q)}"></label>${!sector?`<select data-filter="setor" class="field-select">${optionsWithAll(SECTORS)}</select>`:''}<select data-filter="status" class="field-select">${optionsWithAll(STATUSES)}</select></div>`;
 return heading(sector?'Fluxo setorial':'Acompanhamento',''+title,`${arr.length} registro(s) exibido(s) · processos e responsáveis atualizados pelos usuários.`,actions)+periodNotice()+toolbar+`<div class="card table-card"><div class="table-scroll"><table class="data-table"><thead><tr><th>Processo / Objeto</th><th>Setor / Etapa</th><th>Responsável</th><th>Próxima ação</th><th>Prazo</th><th>Status</th><th></th></tr></thead><tbody>${arr.map(p=>`<tr><td><button class="link-button cell-main" data-action="detail" data-id="${esc(p.id)}">${esc(p.numero)}</button><div class="cell-sub">${esc(p.objeto)}</div></td><td><div class="cell-main">${esc(p.setor)}</div><div class="cell-sub">${esc(p.etapa)}</div></td><td>${esc(p.responsavel||'Não atribuído')}</td><td>${esc(p.proxima_acao||'Não definida')}</td><td><span class="${daysLeft(p.prazo)<0&&activeProcess(p)?'badge-inline':''}">${fmtDate(p.prazo)}</span></td><td>${iconBadge(p.status)}</td><td><button class="btn small" data-action="detail" data-id="${esc(p.id)}">Abrir →</button></td></tr>`).join('')||'<tr><td colspan="7" class="table-empty">Nenhum processo corresponde aos filtros.</td></tr>'}</tbody></table></div></div><div class="filter-summary">Exibindo ${arr.length} de ${all.length} processos.</div>`;
}
function tasksView(){
 const arr=db.tarefas.filter(t=>!cloud()||taskScope==='all'||assignedToMe(t)).filter(t=>filters.setor==='Todos'||t.setor===filters.setor).filter(t=>filters.status==='Todos'||t.status===filters.status).filter(t=>searchText(t.titulo,t.responsavel,t.descricao,findProcess(t.processo_id)?.numero).includes(filters.q.toLocaleLowerCase('pt-BR'))).sort((a,b)=>(a.status==='Concluída')-(b.status==='Concluída')||daysLeft(a.prazo)-daysLeft(b.prazo));
 return heading('Fluxo de trabalho',taskScope==='mine'&&cloud()?'Minhas tarefas':'Tarefas dos setores','Demandas recebidas, prazos, responsáveis e providências.',`<button class="btn" data-action="taskScope" data-scope="${taskScope==='mine'?'all':'mine'}">${taskScope==='mine'?'Ver todas as tarefas':'Somente minhas tarefas'}</button>${!previewRole&&(!cloud()||['admin',...SIG_CHIEF_ROLES].includes(profile.role))?'<button class="btn primary" data-action="newTask">+ Nova tarefa</button>':''}`)+`<div class="toolbar"><label class="searchbox">⌕ <input id="filter-q" data-filter="q" placeholder="Buscar tarefa ou processo..." value="${esc(filters.q)}"></label><select data-filter="setor" class="field-select">${optionsWithAll(SECTORS)}</select><select data-filter="status" class="field-select">${optionsWithAll(TASK_STATUSES)}</select></div><div class="card table-card"><div class="table-scroll"><table class="data-table"><thead><tr><th>Tarefa</th><th>Processo</th><th>Setor</th><th>Responsável</th><th>Prazo</th><th>Prioridade</th><th>Situação</th><th>Ação</th></tr></thead><tbody>${arr.map(t=>`<tr><td><button class="link-button cell-main" data-action="editTask" data-id="${esc(t.id)}">${esc(t.titulo)}</button><div class="cell-sub">${esc(t.descricao||'Sem observações')}</div></td><td>${findProcess(t.processo_id)?`<button class="link-button" data-action="detail" data-id="${esc(t.processo_id)}">${esc(findProcess(t.processo_id).numero)}</button>`:'—'}</td><td>${esc(t.setor)}</td><td>${esc(t.responsavel||'Não atribuído')}</td><td>${fmtDate(t.prazo)}${isOverdue(t)?'<div class="cell-sub" style="color:#c4504a">Em atraso</div>':''}</td><td>${iconBadge(t.prioridade)}</td><td>${iconBadge(t.status)}</td><td><button class="btn small" data-action="editTask" data-id="${esc(t.id)}">Editar</button>${t.status!=='Concluída'&&canWrite(t.setor)?`<button class="btn small primary" data-action="v4FinishTask" data-id="${esc(t.id)}">Concluir</button>`:''}</td></tr>`).join('')||'<tr><td colspan="8" class="table-empty">Nenhuma tarefa encontrada.</td></tr>'}</tbody></table></div></div>`;
}
function contractsView(){
 const contracts=db.contratos.filter(c=>searchText(c.numero,c.objeto,c.fornecedor,c.gestor).includes(filters.q.toLowerCase()));
 return heading('Execução continuada','Contratos continuados','Vigências, valores, fiscalização e cobertura estimada de empenhos.',`${canFinance()?'<button class="btn primary" data-action="newContract">+ Novo contrato</button>':''}`)+periodNotice()+`<div class="info-note">A cobertura é calculada por saldo informado ÷ custo mensal estimado. <strong>Não substitui</strong> o saldo oficialmente conciliado, a análise contratual nem a programação orçamentária.</div><div class="toolbar"><label class="searchbox">⌕ <input id="filter-q" data-filter="q" placeholder="Buscar contrato ou fornecedor..." value="${esc(filters.q)}"></label></div><div class="contract-cards">${contracts.map(c=>{
  const cov=digits(c.custo_mensal)>0?digits(c.saldo_empenho)/digits(c.custo_mensal):0,ratio=Math.min(100,(cov/Math.max(1,digits(c.cobertura_alvo)))*100),alert=cov<digits(c.cobertura_alvo),due=daysLeft(c.fim);return `<div class="card contract-card"><div class="contract-top"><div><h3>${esc(c.numero)}</h3><div class="contract-meta">${esc(c.objeto)} · ${esc(c.fornecedor)}</div></div>${iconBadge(due<0?'Vencido':due<60?'Próximo vencimento':alert?'Baixa cobertura':'Vigente')}</div><div class="contract-stats"><div><small>Valor mensal estimado</small><strong>${money(c.custo_mensal)}</strong></div><div><small>Saldo informado</small><strong>${money(c.saldo_empenho)}</strong></div></div><div class="section-split"><span class="tiny">Cobertura estimada</span><strong>${cov.toLocaleString('pt-BR',{maximumFractionDigits:2})} mês(es)</strong></div><div style="margin-top:10px" class="progress-track"><div class="progress-inner" style="width:${ratio}%;background:${alert?'#dfa95d':'#159387'}"></div></div><div class="contract-foot"><span>Meta: ${esc(c.cobertura_alvo)} meses</span><span>Vigência até ${fmtDate(c.fim)}</span></div><div style="margin-top:13px" class="section-split"><span class="tiny">Gestor: ${esc(c.gestor||'Não informado')}</span><button class="btn small" data-action="editContract" data-id="${esc(c.id)}">Detalhes →</button></div></div>`;
 }).join('')||empty('Nenhum contrato encontrado')}</div>`;
}
function financeView(){
 const received=db.repasses.reduce((a,r)=>a+digits(r.valor_recebido),0),allocated=db.repasses.reduce((a,r)=>a+digits(r.valor_destinado),0),committed=db.empenhos.reduce((a,e)=>a+digits(e.valor_empenhado),0),spent=db.empenhos.reduce((a,e)=>a+digits(e.valor_consumido),0);
 const dot=[...new Set(db.repasses.map(r=>r.dotacao))].map(d=>({dotacao:d,recebido:db.repasses.filter(r=>r.dotacao===d).reduce((a,r)=>a+digits(r.valor_recebido),0),destinado:db.repasses.filter(r=>r.dotacao===d).reduce((a,r)=>a+digits(r.valor_destinado),0)}));
 const k=(txt,n,foot)=>`<div class="card kpi"><div class="kpi-label">${txt}</div><div class="kpi-value">${compact(n)}</div><div class="kpi-foot">${foot}</div></div>`;
 return heading('Gestão orçamentária','SOFI · Repasses e empenhos','Consolidação de registros demonstrativos e conciliação a validar.',`${canFinance()?'<button class="btn primary" data-action="newRepasse">+ Novo repasse</button><button class="btn" data-action="newEmpenho">+ Empenho</button>':''}`)+periodNotice()+`<div class="kpi-grid">${k('Repasses registrados',received,'Total em documentos importados')}${k('Destinação informada',allocated,'Valores alocados em RIPC / processos')}${k('Empenhado registrado',committed,'Não implica liquidação ou pagamento')}${k('Saldo a destinar',received-allocated,'Não é disponibilidade para empenhar')}</div><div class="dashboard-grid"><div><div class="card section">${cardTitle('Repasses por dotação','Valores recebidos e destinados')}<div class="table-scroll"><table class="data-table" style="min-width:560px"><thead><tr><th>Dotação</th><th>Recebido</th><th>Destinado</th><th>Saldo</th></tr></thead><tbody>${dot.map(x=>`<tr><td><strong>${esc(x.dotacao)}</strong></td><td>${money(x.recebido)}</td><td>${money(x.destinado)}</td><td><strong>${money(x.recebido-x.destinado)}</strong></td></tr>`).join('')}</tbody></table></div></div><div class="card section">${cardTitle('Documentos de repasse','Fonte orçamentária registrada')}<div class="table-scroll"><table class="data-table" style="min-width:660px"><thead><tr><th>Documento</th><th>Dotação</th><th>Valor</th><th>Destinado</th><th></th></tr></thead><tbody>${db.repasses.map(r=>`<tr><td>${esc(r.documento)}</td><td>${esc(r.dotacao)}</td><td>${money(r.valor_recebido)}</td><td>${money(r.valor_destinado)}</td><td><button data-action="editRepasse" data-id="${esc(r.id)}" class="btn small">Editar</button></td></tr>`).join('')}</tbody></table></div></div></div>
 <div><div class="card section">${cardTitle('Empenhos','Registros e saldo por empenho')}<div class="stat-list"><div class="row-item"><strong class="item-title">Total empenhado</strong><strong>${money(committed)}</strong></div><div class="row-item"><strong class="item-title">Execução informada</strong><strong>${money(spent)}</strong></div><div class="row-item"><strong class="item-title">Saldo calculado</strong><strong>${money(committed-spent)}</strong></div></div></div><div class="card section">${cardTitle('Em análise para empenho','Processos classificados nessa etapa')}${db.processos.filter(p=>p.status==='Aguardando empenho').map(p=>`<div class="row-item"><div><button class="link-button item-title" data-action="detail" data-id="${esc(p.id)}">${esc(p.numero)}</button><div class="item-meta">${esc(p.objeto)}</div></div><strong>${money(moneyToCommit(p))}</strong></div>`).join('')||empty('Nenhum processo nessa etapa')}</div></div></div><div class="card section">${cardTitle('Relação de empenhos','Controle demonstrativo — sem conciliação oficial')}<div class="table-scroll"><table class="data-table"><thead><tr><th>Número</th><th>Processo</th><th>Dotação</th><th>Valor empenhado</th><th>Execução</th><th>Saldo</th><th>Status</th><th></th></tr></thead><tbody>${db.empenhos.map(e=>`<tr><td>${esc(e.numero)}/${esc(e.ano)}</td><td>${esc(findProcess(e.processo_id)?.numero||'—')}</td><td>${esc(e.dotacao)}</td><td>${money(e.valor_empenhado)}</td><td>${money(e.valor_consumido)}</td><td>${money(digits(e.valor_empenhado)-digits(e.valor_consumido))}</td><td>${iconBadge(e.status)}</td><td><button data-action="editEmpenho" data-id="${esc(e.id)}" class="btn small">Editar</button></td></tr>`).join('')}</tbody></table></div></div>`;
}
function assistantView(){
 const prompts=['O que está parado ou atrasado?','Quais solicitações de empenho estão abertas?','Quais contratos exigem reforço de cobertura?','Quais processos aguardam empenho?','Quais tarefas estão pendentes?','Resuma o andamento da Licitação'];
 return heading('Consulta assistida','Assistente de gestão','Consultas determinísticas e explicáveis; não utiliza API de IA paga.',`<button class="btn" data-action="clearChat">Limpar conversa</button>`)+`<div class="info-note">Neste MVP, o assistente interpreta perguntas conhecidas e consulta os registros do sistema. <strong>Não é um modelo de IA generativa.</strong> Nenhum dado é enviado a provedores externos de IA.</div><div class="chat-shell"><div class="card chat-presets"><h3>Perguntas sugeridas</h3><p class="sub">Clique para consultar os dados</p>${prompts.map(x=>`<button class="chat-prompt" data-action="ask" data-text="${esc(x)}">${esc(x)}</button>`).join('')}</div><div class="card chat-main"><div class="chat-history" id="chat-history">${chat.length?chat.map(m=>`<div class="chat-msg ${m.role==='user'?'user':'bot'}"><div class="chat-bubble">${esc(m.text)}</div></div>`).join(''):`<div class="chat-msg bot"><div class="chat-bubble"><strong>Olá! Sou o assistente de consultas do SIG.</strong>\n\nPosso localizar processos atrasados, tarefas pendentes, contratos com baixa cobertura e valores registrados na SOFI. Minhas respostas sempre se limitam aos dados cadastrados.</div></div>`}</div><form id="chat-form" class="chat-entry"><input name="question" maxlength="300" placeholder="Pergunte sobre tarefas, processos, contratos ou empenhos..." autocomplete="off" required><button class="btn primary" type="submit">Enviar ↗</button></form></div></div>`;
}

function recebimentosView(){
 const me=currentAuthId(),sector=setorUsuario();
 const arr=db.tramites.filter(t=>receiptScope==='all'?(effectiveRole()==='admin'||effectiveRole()==='chefia'||t.destino===sector):receiptScope==='sector'?t.destino===sector:(t.destinatario_auth_id===me||(!t.destinatario_auth_id&&t.destino===sector)))
  .sort((a,b)=>new Date(b.criado_em)-new Date(a.criado_em));
 const buttons=`<button class="btn ${receiptScope==='mine'?'primary':''}" data-action="receiptScope" data-scope="mine">Minha fila</button><button class="btn ${receiptScope==='sector'?'primary':''}" data-action="receiptScope" data-scope="sector">Meu setor</button>${['admin','chefia'].includes(effectiveRole())?`<button class="btn ${receiptScope==='all'?'primary':''}" data-action="receiptScope" data-scope="all">Todos</button>`:''}`;
 return heading('Tramitação','Recebimentos','Encaminhamentos registrados entre os três setores.',buttons)+periodNotice()+`<div class="card table-card"><div class="table-scroll"><table class="data-table"><thead><tr><th>Processo</th><th>De → Para</th><th>Destinatário</th><th>Próxima ação</th><th>Data</th><th></th></tr></thead><tbody>${arr.map(t=>{const p=findProcess(t.processo_id);return `<tr><td>${p?`<button class="link-button cell-main" data-action="detail" data-id="${esc(p.id)}">${esc(p.numero)}</button>`:'—'}</td><td>${esc(t.origem)} → ${esc(t.destino)}</td><td>${esc(t.responsavel_destino)}</td><td><div class="cell-main">${esc(t.proxima_acao)}</div><div class="cell-sub">${esc(t.motivo)}</div></td><td>${new Date(t.criado_em).toLocaleString('pt-BR')}</td><td>${p?`<button class="btn small" data-action="detail" data-id="${esc(p.id)}">Abrir →</button>`:''}</td></tr>`}).join('')||'<tr><td colspan="6" class="table-empty">Nenhum encaminhamento neste filtro.</td></tr>'}</tbody></table></div></div>`;
}
function usuariosView(){if(!isAdmin())return heading('Acesso','Não autorizado','Somente administradores podem gerenciar usuários.');
 if(!cloud())return heading('Controle de acesso','Gestão de usuários','Na demonstração, as contas são apenas fictícias.')+`<div class="info-note">Conecte-se ao banco compartilhado para enviar convites e habilitar usuários.</div>`;
 return heading('Administração','Gestão de usuários','Convide usuários, escolha seus setores e controle permissões. Nenhuma senha é visível ao administrador.',`<button class="btn" data-action="reloadUsers">↻ Atualizar</button><button class="btn primary" data-action="inviteUser">+ Convidar usuário</button>`)+`<div class="info-note warning-note">Convites dependem do serviço de e-mail do Supabase e da configuração de URLs de redirecionamento. No plano gratuito existem limites de envio.</div><div class="card table-card"><div class="table-scroll"><table class="data-table"><thead><tr><th>Nome / E-mail</th><th>Perfil</th><th>Setor</th><th>Acesso</th><th>Último login</th><th></th></tr></thead><tbody>${!adminLoaded?'<tr><td colspan="6" class="table-empty">Carregando usuários…</td></tr>':adminUsers.map(u=>`<tr><td><div class="cell-main">${esc(u.nome)}</div><div class="cell-sub">${esc(u.email)}</div></td><td>${esc(labelRole(u.role))}</td><td>${esc(u.setor||'—')}</td><td>${iconBadge(u.ativo?'Ativo':'Inativo')}</td><td>${u.ultimo_acesso?new Date(u.ultimo_acesso).toLocaleString('pt-BR'):'Nunca'}</td><td>${u.role!=='admin'?`<button class="btn small" data-action="editUser" data-id="${esc(u.auth_id)}">Gerenciar</button>`:'<span class="cell-sub">Administrador</span>'}</td></tr>`).join('')||'<tr><td colspan="6" class="table-empty">Nenhum perfil encontrado.</td></tr>'}</tbody></table></div></div>`;
}
function setorOptionsUsers(sector,selected){return `<option value="">Fila do setor (não atribuído)</option>`+userCandidates(sector).map(u=>`<option value="${esc(u.auth_id)}" ${u.auth_id===selected?'selected':''}>${esc(u.nome)} · ${esc(u.role)}</option>`).join('')}
function transferForm(id){const p=findProcess(id);if(!p||!canWrite(p.setor)||!activeProcess(p))return showToast('Processo indisponível para encaminhamento.');
 const dest=({Compras:'Licitação','Licitação':'SOFI','SOFI':'Compras'})[p.setor];
 const html=`<div class="info-note"><strong>${esc(p.numero)}</strong> · origem: ${esc(p.setor)} · último responsável: ${esc(p.responsavel)}</div><form data-form="transfer" data-id="${esc(id)}"><div class="form-grid">${selectField('destino','Setor de destino',SECTORS,dest)}<div class="form-row"><label for="f-destinatario_auth_id">Destinatário autorizado</label><select name="destinatario_auth_id" id="f-destinatario_auth_id">${setorOptionsUsers(dest,'')}</select></div>${selectField('status','Situação ao receber',['Aguardando providência','Aguardando documentação','Aguardando empenho','Em andamento','Bloqueado'],dest==='SOFI'?'Aguardando empenho':'Aguardando providência')}${inputField('prazo','Prazo da próxima ação',dayOffset(3),'date')}${textareaField('motivo','Motivo do encaminhamento (obrigatório)','')}${textareaField('proxima_acao','Próxima providência do destino','')}</div><div class="modal-footer"><button type="button" class="btn" data-action="closeModal">Cancelar</button><button type="submit" class="btn primary">Confirmar encaminhamento</button></div></form>`;
 openModal('Encaminhar processo',`${p.numero} · a transferência ficará registrada na linha do tempo.`,html,true);
}
function userForm(id){
 if(!isAdmin()||!cloud())return showToast('É necessário ser administrador conectado.');
 const u=adminUsers.find(x=>x.auth_id===id),existing=!!u;
 const roleChoices=SIG_ROLE_CHOICES.map(([key,label])=>'<option value="'+esc(key)+'"'+(key===(u?.role||'compras')?' selected':'')+'>'+esc(label)+'</option>').join('');
 const roleField='<div class="form-row"><label for="f-role">Perfil de acesso</label><select id="f-role" name="role">'+roleChoices+'</select><small class="helper">Os perfis de chefia setorial ficam limitados ao respectivo setor.</small></div>';
 const html='<form data-form="'+(existing?'updateUser':'inviteUser')+'" data-id="'+esc(id||'')+'"><div class="form-grid">'+
  inputField('nome','Nome completo',u?.nome||'','text','required minlength="3" maxlength="100"')+
  inputField('email','E-mail',u?.email||'','email',existing?'disabled':'required')+
  roleField+selectField('setor','Setor',['Compras','Licitação','SOFI'],u?.setor||'Compras')+
  '<input id="sig-fixed-sector" type="hidden" value="">'+
  (existing?'<div class="form-row"><label for="f-ativo">Situação de acesso</label><select name="ativo" id="f-ativo"><option value="true"'+(u.ativo?' selected':'')+'>Ativo</option><option value="false"'+(!u.ativo?' selected':'')+'>Desativado</option></select></div>':'')+
  '</div><div class="modal-footer"><button type="button" class="btn" data-action="closeModal">Cancelar</button><button type="submit" class="btn primary">'+(existing?'Salvar permissões':'Enviar convite')+'</button></div></form>';
 openModal(existing?'Gerenciar usuário':'Convidar usuário',existing?'Alteração auditada pelo backend.':'O usuário recebe convite do Supabase para definir o acesso.',html,true);
 syncUserRoleSetor();
}
async function adminApi(acao,payload={}){if(!cloud()||!session||!isAdmin())throw Error('Acesso administrativo não autorizado');
 const r=await rest('/functions/v1/gerenciar-usuarios','POST',{acao,...payload});if(r?.erro)throw Error(r.erro);return r;
}
async function loadAdminUsers(){if(!isAdmin()||!cloud())return;try{const r=await adminApi('listar');adminUsers=r.usuarios||[];adminLoaded=true;render();if(r.parcial)showToast('Lista parcial: limite de 1.000 contas.')}catch(e){adminLoaded=true;showToast('Falha ao carregar usuários: '+errMsg(e));render()}}
async function submitTransfer(form){const d=gather(form),p=findProcess(form.dataset.id);if(!p)throw Error('Processo não encontrado');
 if(d.motivo.trim().length<8||d.proxima_acao.trim().length<5)return showToast('Informe motivo (8 caracteres) e próxima ação (5 caracteres).');
 if(!canWrite(p.setor))return showToast('Sem permissão no setor de origem.');
 const selected=db.usuarios.find(u=>u.auth_id===d.destinatario_auth_id),name=selected?.nome||'Fila da '+d.destino;
 busy=true;try{
  if(cloud())await rest('/rest/v1/rpc/encaminhar_processo','POST',{p_processo_id:p.id,p_destino:d.destino,p_destinatario_auth_id:d.destinatario_auth_id||null,p_motivo:d.motivo,p_proxima_acao:d.proxima_acao,p_prazo:d.prazo||null,p_status:d.status,p_versao:p.updated_at});
  else{
   const origem=p.setor;p.setor=d.destino;p.responsavel=name;p.responsavel_auth_id=d.destinatario_auth_id||null;p.etapa='Recebido pela '+d.destino;p.status=d.status;p.proxima_acao=d.proxima_acao;p.prazo=d.prazo;p.updated_at=nowIso();
   db.tramites.unshift({id:uuid(),processo_id:p.id,origem,destino:d.destino,motivo:d.motivo,proxima_acao:d.proxima_acao,responsavel_destino:name,destinatario_auth_id:d.destinatario_auth_id||null,prazo:d.prazo,status_destino:d.status,criado_em:nowIso()});
   db.tarefas.unshift({id:uuid(),processo_id:p.id,titulo:'Receber '+p.numero+': '+d.proxima_acao,descricao:d.motivo,setor:d.destino,responsavel:name,responsavel_auth_id:d.destinatario_auth_id||null,prioridade:p.prioridade,status:'Pendente',prazo:d.prazo,updated_at:nowIso()});
   db.eventos.unshift({id:uuid(),processo_id:p.id,tipo:'Encaminhamento',descricao:origem+' → '+d.destino+' | '+d.motivo,usuario:profile.nome,criado_em:nowIso()});saveLocal();
  }
  closeModal();busy=false;if(cloud())await fetchCloud();render();showToast('Encaminhamento e tarefa registrados.');
 }catch(e){busy=false;showToast('Encaminhamento não realizado: '+errMsg(e))}
}
async function submitUser(form){const d=gather(form),existing=form.dataset.form==='updateUser';
 const fixed=SIG_CHIEF_SECTIONS[d.role]||({compras:'Compras',licitacao:'Licitação',sofi:'SOFI'})[d.role]||null;
 if(fixed&&d.setor!==fixed)return showToast('O perfil selecionado deve pertencer ao setor '+fixed+'.');
 if(!SIG_ROLE_CHOICES.some(([key])=>key===d.role))return showToast('Selecione um perfil válido.');
 const payload={nome:d.nome,role:d.role,setor:d.setor,...(existing?{auth_id:form.dataset.id,ativo:d.ativo==='true'}:{email:d.email})};
 busy=true;try{const r=await adminApi(existing?'atualizar':'convidar',payload);busy=false;closeModal();await loadAdminUsers();showToast(r.mensagem||'Usuário atualizado.');if(cloud())await fetchCloud()}catch(e){busy=false;showToast('Não foi possível concluir: '+errMsg(e))}
}
function render(){if((!cloud()||(session&&cloudDataReady))&&!inviteActive&&!canVisitMenu(view))view=firstRoleView();updateChrome();const content=document.getElementById('content');if(inviteActive){content.innerHTML=heading('Primeiro acesso','Definir senha','Seu convite foi validado. Crie uma senha para acessar o sistema.')+activateAccountView();return}if(cloud()&&!session){content.innerHTML=heading('Acesso restrito','Entrar no sistema','Autenticação necessária para consultar a base compartilhada.')+loginView();return}
 if(cloud()&&session&&(!cloudDataReady||(cloudExtraState!=='ready'&&!SIG_FAST_VIEWS.includes(view)))){
  // Durante o primeiro login, preserve a paisagem e o formulário já visível
  // até confirmar o perfil e os dados principais, evitando troca brusca de tela.
  if(!cloudDataReady&&!cloudLoadError&&content.querySelector('.sig-auth-shell')){
   const btn=content.querySelector('form[data-form="login"] button[type="submit"]');
   if(btn){btn.disabled=true;btn.textContent='Preparando o painel…';}
   return;
  }
  const message=cloudLoadError?'Falha ao sincronizar: '+esc(cloudLoadError):cloudDataReady?'Finalizando a sincronização dos módulos…':'Validando seu acesso e carregando os dados principais…';
  content.innerHTML='<section class="card section" role="status" aria-live="polite" style="max-width:640px;margin:9vh auto;padding:32px"><h2>'+(cloudLoadError?'Sincronização pendente':'Preparando o SIG')+'</h2><p class="sub">'+message+'</p>'+(cloudLoadError?'<button type="button" class="btn primary" data-action="retryCloudLoad">Tentar novamente</button>':'<p class="sub">O painel aparecerá automaticamente.</p>')+'</section>';return;
 }
 let html='';switch(view){case'dashboard':html=dashboardView();break;case'processos':html=processView();break;case'compras':html=processView('Compras');break;case'licitacao':html=processView('Licitação');break;case'tarefas':html=tasksView();break;case'contratos':html=v4ContractsView();break;case'importacoes':html=v5View();break;case'conciliacao':html=window.SIG_V6.view(canFinance());break;case'cotas':html=window.SIG_COTAS.view(canViewCota(),canFinance(),canVisitMenu('conciliacao'));break;case'auditoria':html=window.SIG_V7.view(canFinance());break;case'sofi':html=v4SofiView();break;case'assistente':html=assistantView();break;case'recebimentos':html=v3ReceiptView();break;case'notificacoes':html=v3NotificationsView();break;case'alertas':html=v3AlertView();break;case'chefia':html=v3ChiefView();break;case'usuarios':html=usuariosView();break;default:html=dashboardView();}if(previewRole){const active=SIG_PREVIEW_ROLES.find(r=>r.id===previewRole);
 html='<div class="sig-preview-banner" role="status"><div><strong>Prévia: '+esc(active?.label||previewRole)+'</strong><span>Somente leitura. Sua sessão permanece administradora; não simula a conta nem as políticas RLS de outra pessoa.</span></div><button type="button" class="btn sig-preview-return" data-action="exitRolePreview">Voltar ao administrador</button></div>'+html;}
 if(cloud()&&cloudExtraState!=='ready')html='<div class="info-note" role="status">'+(cloudLoadError?'Dados complementares indisponíveis: '+esc(cloudLoadError)+' <button type="button" class="btn small" data-action="retryCloudLoad">Tentar novamente</button>':'Painel liberado. Sincronizando dados complementares em segundo plano…')+'</div>'+html;content.innerHTML=html;if(previewRole)content.querySelectorAll('input[type="file"]').forEach(x=>x.disabled=true);document.querySelectorAll('[data-filter="setor"]').forEach(el=>el.value=filters.setor);document.querySelectorAll('[data-filter="status"]').forEach(el=>el.value=filters.status);if(view==='assistente'){const e=document.getElementById('chat-history');if(e)e.scrollTop=e.scrollHeight}}
function inputField(name,label,value='',type='text',extra=''){return `<div class="form-row"><label for="f-${name}">${esc(label)}</label><input id="f-${name}" name="${name}" type="${type}" value="${esc(value)}" ${extra}></div>`}
function selectField(name,label,choices,value){return `<div class="form-row"><label for="f-${name}">${esc(label)}</label><select id="f-${name}" name="${name}">${optionList(choices,value)}</select></div>`}
function textareaField(name,label,val){return `<div class="form-row full"><label for="f-${name}">${esc(label)}</label><textarea id="f-${name}" name="${name}">${esc(val)}</textarea></div>`}
function openModal(title,sub,content,large=false){document.getElementById('modal-root').innerHTML=`<div class="modal-backdrop"><div class="modal ${large?'large':''}" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="modal-header"><div><h2>${esc(title)}</h2><p class="sub">${esc(sub)}</p></div><button class="close-x" data-action="closeModal" aria-label="Fechar">×</button></div>${content}</div></div>`;const first=document.querySelector('#modal-root input:not([type="hidden"]),#modal-root button');first?.focus()}
function closeModal(){document.getElementById('modal-root').innerHTML=''}
function processForm(id,sector){const p=db.processos.find(x=>x.id===id)||{numero:'',objeto:'',modalidade:'COTEP',setor:sector||'Compras',etapa:'Triagem da demanda',status:'Em andamento',responsavel:'',prioridade:'Média',data_entrada:today(),prazo:dayOffset(7),valor_estimado:0,valor_homologado:0,dotacao:'',proxima_acao:'',bloqueio_motivo:'',referencia_sei:''};
 if(!canWrite(p.setor))return showToast('Sem permissão de edição neste setor.');
 if(p.setor==='Compras'){
  // Cadastro enxuto; todos os campos existentes continuam editáveis em "Mais detalhes".
  const primary=
   '<div class="sig-buy-form-lead">Comece pelos dados necessários para identificar e acompanhar a demanda. Outros detalhes podem ser preenchidos agora ou depois.</div>'+
   '<div class="form-grid">'+
    inputField('numero','Número / identificador do processo',p.numero,'text','required maxlength="80" placeholder="Ex.: 123/2026"')+
    selectField('modalidade','Modalidade',['COTEP','Pregão','Dispensa','Inexigibilidade','Adesão ARP','Outro'],p.modalidade)+
    '<div class="form-row full"><label for="f-objeto">Objeto da aquisição *</label><textarea id="f-objeto" name="objeto" rows="3" required placeholder="Descreva de forma objetiva o que será adquirido">'+esc(p.objeto)+'</textarea></div>'+
    (id&&cloud()?'<div class="form-row"><label>Responsável atual</label><div class="sig-buy-readonly">'+esc(p.responsavel||'Não atribuído')+'<small>Para alterar o setor ou responsável, use Encaminhar no processo.</small></div></div>':inputField('responsavel','Responsável pela demanda',p.responsavel,'text','required placeholder="Nome ou equipe responsável"'))+
    inputField('prazo','Prazo da próxima etapa',p.prazo,'date')+
    '<div class="form-row full"><label for="f-proxima_acao">Próxima providência</label><textarea id="f-proxima_acao" name="proxima_acao" rows="2" placeholder="Qual é a próxima ação para avançar?">'+esc(p.proxima_acao||'')+'</textarea></div>'+
   '</div>';
  const secondary=
   '<details class="sig-buy-extra"><summary>Mais detalhes do processo <span>Etapa, status, prioridade, valores e referências</span></summary>'+
   '<div class="form-grid">'+
    (id&&cloud()?'<div class="form-row"><label>Setor responsável</label><div class="sig-buy-readonly">'+esc(p.setor)+'</div></div>':'<input type="hidden" name="setor" value="Compras">')+
    inputField('etapa','Etapa atual',p.etapa,'text','required')+
    selectField('status','Situação',STATUSES,p.status)+
    selectField('prioridade','Prioridade',PRIORITIES,p.prioridade)+
    inputField('data_entrada','Data de entrada',p.data_entrada,'date')+
    inputField('valor_estimado','Valor estimado (R$)',p.valor_estimado,'number','step="0.01" min="0"')+
    inputField('valor_homologado','Valor homologado (R$)',p.valor_homologado,'number','step="0.01" min="0"')+
    inputField('dotacao','Dotação orçamentária',p.dotacao)+
    inputField('referencia_sei','Referência / link SEI',p.referencia_sei)+
    textareaField('bloqueio_motivo','Motivo do impedimento (se houver)',p.bloqueio_motivo)+
   '</div></details>';
  const html='<form class="sig-buy-process-form" data-form="process" data-id="'+esc(id||'')+'">'+primary+secondary+
    '<div class="modal-footer"><button class="btn" type="button" data-action="closeModal">Cancelar</button><button class="btn primary" type="submit">'+(id?'Salvar atualizações':'Cadastrar demanda')+'</button></div></form>';
  openModal(id?'Atualizar demanda de Compras':'Nova demanda de Compras',
   id?'Atualize a próxima providência e o prazo sem perder o histórico.':'Cadastro rápido para iniciar o acompanhamento.',html,true);
  return;
 }
 const html=`<form data-form="process" data-id="${esc(id||'')}"><div class="form-grid">${inputField('numero','Número do processo',p.numero,'text','required maxlength="80"')}${id&&cloud()?`<div class="form-row"><label>Setor responsável</label><div class="info-note">${esc(p.setor)} · use Encaminhar para transferir</div></div>`:selectField('setor','Setor responsável',SECTORS,p.setor)}${textareaField('objeto','Objeto da aquisição',p.objeto)}${selectField('modalidade','Modalidade',['COTEP','Pregão','Dispensa','Inexigibilidade','Adesão ARP','Outro'],p.modalidade)}${inputField('etapa','Etapa atual',p.etapa,'text','required')}${selectField('status','Situação',STATUSES,p.status)}${id&&cloud()?`<div class="form-row"><label>Responsável</label><div class="info-note">${esc(p.responsavel)} · use Encaminhar para redistribuir</div></div>`:inputField('responsavel','Responsável / equipe',p.responsavel,'text','required')}${selectField('prioridade','Prioridade',PRIORITIES,p.prioridade)}${inputField('data_entrada','Data de entrada',p.data_entrada,'date')}${inputField('prazo','Prazo da etapa',p.prazo,'date')}${inputField('valor_estimado','Valor estimado (R$)',p.valor_estimado,'number','step="0.01" min="0"')}${inputField('valor_homologado','Valor homologado (R$)',p.valor_homologado,'number','step="0.01" min="0"')}${inputField('dotacao','Dotação',p.dotacao)}${inputField('referencia_sei','Referência / link SEI',p.referencia_sei)}${textareaField('proxima_acao','Próxima providência',p.proxima_acao)}${textareaField('bloqueio_motivo','Motivo do impedimento (se houver)',p.bloqueio_motivo)}</div><div class="modal-footer"><button class="btn" type="button" data-action="closeModal">Cancelar</button><button class="btn primary" type="submit">${id?'Salvar alterações':'Cadastrar processo'}</button></div></form>`;
 openModal(id?'Editar processo':'Cadastrar novo processo','Cada processo tem um responsável, situação e próxima providência.',html,true);
}
function taskForm(id,proc,requestedSection,requestedMember){
 if(!id&&cloud()&&!['admin',...SIG_CHIEF_ROLES].includes(profile.role))return showToast('O cadastro e a distribuição de tarefas são realizados pela chefia da seção.');
 const existing=db.tarefas.find(x=>x.id===id)||null;
 const scoped=isSectionChiefRole(profile.role)&&!previewRole?profile.setor:null;
 const sector=existing?.setor||scoped||((requestedSection&&SECTORS.includes(requestedSection))?requestedSection:findProcess(proc)?.setor||'Compras');
 const t=existing||{processo_id:proc||'',titulo:'',descricao:'',setor:sector,responsavel:'',responsavel_auth_id:requestedMember||'',prioridade:'Média',status:'Pendente',prazo:dayOffset(3)};
 if(!canWrite(t.setor))return showToast('Sem permissão para atribuir tarefas nesta seção.');
 const choices=(db.processos||[]).filter(p=>p.setor===t.setor).map(p=>({label:p.numero+' — '+p.objeto.slice(0,55),value:p.id}));
 const processSelect='<div class="form-row full"><label for="f-processo_id">Processo relacionado (opcional)</label><select name="processo_id" id="f-processo_id"><option value="">Sem processo vinculado</option>'+choices.map(p=>'<option value="'+esc(p.value)+'"'+(p.value===t.processo_id?' selected':'')+'>'+esc(p.label)+'</option>').join('')+'</select></div>';
 const sectionInput=(scoped||existing&&cloud())?'<div class="form-row"><label>Seção responsável</label><div class="sig-buy-readonly">'+esc(t.setor)+'</div><input type="hidden" name="setor" value="'+esc(t.setor)+'"></div>':
  '<div class="form-row"><label for="f-task-sector">Seção responsável</label><select id="f-task-sector" name="setor">'+optionList(SECTORS,t.setor)+'</select></div>';
 const assignee=cloud()?'<div class="form-row"><label for="f-responsavel_auth_id">Militar responsável</label><select id="f-responsavel_auth_id" name="responsavel_auth_id">'+setorOptionsUsers(t.setor,t.responsavel_auth_id||requestedMember||'')+'</select><small class="helper">A lista contém somente pessoas ativas da seção.</small></div>':
  inputField('responsavel','Militar responsável',t.responsavel,'text','required');
 const content='<form data-form="task" data-id="'+esc(id||'')+'"><div class="form-grid">'+
  inputField('titulo','Descrição objetiva da tarefa',t.titulo,'text','required maxlength="180"')+
  sectionInput+processSelect+assignee+
  inputField('prazo','Prazo de conclusão',t.prazo,'date')+
  selectField('prioridade','Prioridade',PRIORITIES,t.prioridade)+
  selectField('status','Situação',TASK_STATUSES,t.status)+
  textareaField('descricao','Orientações e observações',t.descricao)+
  (id?textareaField('conclusao_observacao','Ao concluir: providência realizada (mín. 8 caracteres)',t.conclusao_observacao||''):'')+
 '</div><div class="modal-footer"><button type="button" class="btn" data-action="closeModal">Cancelar</button><button type="submit" class="btn primary">Salvar tarefa</button></div></form>';
 openModal(id?'Editar tarefa':'Distribuir nova tarefa',id?'Atualize as informações da tarefa.':'Atribua um militar do setor e informe a prioridade e o prazo.',content,true);
}

function contractForm(id){if(!canFinance())return showToast('A edição financeira está restrita à SOFI e chefia.');
 const c=db.contratos.find(x=>x.id===id)||{numero:'',objeto:'',fornecedor:'',inicio:today(),fim:dayOffset(365),valor_global:0,custo_mensal:0,saldo_empenho:0,cobertura_alvo:3,gestor:'',status:'Vigente'};
 const html=`<form data-form="contract" data-id="${esc(id||'')}"><div class="form-grid">${inputField('numero','Nº do contrato',c.numero,'text','required')}${inputField('fornecedor','Contratada',c.fornecedor,'text','required')}${textareaField('objeto','Objeto contratual',c.objeto)}${inputField('gestor','Gestor / fiscal responsável',c.gestor)}${inputField('inicio','Início da vigência',c.inicio,'date')}${inputField('fim','Fim da vigência',c.fim,'date')}${inputField('valor_global','Valor global (R$)',c.valor_global,'number','step="0.01" min="0"')}${inputField('custo_mensal','Custo mensal estimado (R$)',c.custo_mensal,'number','step="0.01" min="0"')}${inputField('saldo_empenho','Saldo do empenho informado (R$)',c.saldo_empenho,'number','step="0.01" min="0"')}${inputField('cobertura_alvo','Cobertura-alvo em meses',c.cobertura_alvo,'number','step="1" min="1" max="24"')}${selectField('status','Situação',['Vigente','Suspenso','Encerrado'],c.status)}</div><div class="modal-footer"><button type="button" class="btn" data-action="closeModal">Cancelar</button><button class="btn primary" type="submit">Salvar contrato</button></div></form>`;
 openModal(id?'Editar contrato':'Novo contrato','Cobertura é uma estimativa e não um saldo oficial reconciliado.',html);
}
function repasseForm(id){if(!canFinance())return showToast('A edição financeira está restrita à SOFI e chefia.');
 const r=db.repasses.find(x=>x.id===id)||{documento:'',ano:new Date().getFullYear(),dotacao:'',valor_recebido:0,valor_destinado:0,descricao:''};
 const html=`<form data-form="repasse" data-id="${esc(id||'')}"><div class="form-grid">${inputField('documento','Documento de repasse',r.documento,'text','required')}${inputField('ano','Ano',r.ano,'number','required min="2020" max="2100"')}${inputField('dotacao','Dotação orçamentária',r.dotacao,'text','required')}${inputField('valor_recebido','Valor recebido (R$)',r.valor_recebido,'number','step="0.01" min="0"')}${inputField('valor_destinado','Valor destinado (R$)',r.valor_destinado,'number','step="0.01" min="0"')}${textareaField('descricao','Origem / observações',r.descricao)}</div><div class="modal-footer"><button type="button" class="btn" data-action="closeModal">Cancelar</button><button class="btn primary" type="submit">Salvar repasse</button></div></form>`;
 openModal(id?'Editar documento de repasse':'Novo documento de repasse','Não utilizar valores sem validação contra a fonte oficial.',html);
}
function empenhoForm(id){if(!canFinance())return showToast('A edição financeira está restrita à SOFI e chefia.');
 const e=db.empenhos.find(x=>x.id===id)||{numero:'',ano:new Date().getFullYear(),processo_id:'',contrato_id:'',dotacao:'',valor_empenhado:0,valor_consumido:0,status:'Em preparação'};
 const choices=(items,key)=>`<option value="">Não vincular</option>`+items.map(x=>`<option value="${esc(x.id)}" ${x.id===e[key]?'selected':''}>${esc(x.numero)}</option>`).join('');
 const html=`<form data-form="empenho" data-id="${esc(id||'')}"><div class="form-grid">${inputField('numero','Nº do empenho',e.numero,'text','required')}${inputField('ano','Ano',e.ano,'number','min="2020" max="2100"')}${inputField('dotacao','Dotação',e.dotacao,'text','required')}<div class="form-row"><label>Processo</label><select name="processo_id">${choices(db.processos,'processo_id')}</select></div><div class="form-row"><label>Contrato</label><select name="contrato_id">${choices(db.contratos,'contrato_id')}</select></div>${inputField('valor_empenhado','Valor empenhado (R$)',e.valor_empenhado,'number','step="0.01" min="0"')}${inputField('valor_consumido','Execução informada (R$)',e.valor_consumido,'number','step="0.01" min="0"')}${selectField('status','Status',['Em preparação','Ativo','Anulado','Encerrado'],e.status)}</div><div class="modal-footer"><button class="btn" type="button" data-action="closeModal">Cancelar</button><button class="btn primary" type="submit">Salvar empenho</button></div></form>`;
 openModal(id?'Editar empenho':'Novo empenho','O registro manual não substitui a importação dos movimentos oficiais.',html);
}
function detail(id){const p=findProcess(id);if(!p)return showToast('Processo não encontrado.');
 const logs=db.eventos.filter(e=>e.processo_id===p.id).sort((a,b)=>new Date(b.criado_em)-new Date(a.criado_em));
 const tasks=db.tarefas.filter(t=>t.processo_id===p.id);const routes=db.tramites.filter(t=>t.processo_id===p.id).sort((a,b)=>new Date(b.criado_em)-new Date(a.criado_em));
 const html=`<div class="section-split"><div class="eyebrow">${esc(p.numero)} · ${esc(p.setor)}</div>${iconBadge(p.status)}</div><h2 style="margin:10px 0">${esc(p.objeto)}</h2><div class="detail-actions">${canWrite(p.setor)?`<button class="btn primary" data-action="editProcess" data-id="${esc(p.id)}">✎ Editar</button><button class="btn" data-action="transfer" data-id="${esc(p.id)}">⇄ Encaminhar</button><button class="btn" data-action="newTask" data-process="${esc(p.id)}">+ Tarefa</button><button class="btn" data-action="logEvent" data-id="${esc(p.id)}">+ Movimentação</button>`:''}</div><div class="columns-two"><div><div class="card section">${cardTitle('Situação atual')}<div class="meta-grid"><div><small>Etapa</small><strong>${esc(p.etapa)}</strong></div><div><small>Responsável</small><strong>${esc(p.responsavel||'Não atribuído')}</strong></div><div><small>Modalidade</small><strong>${esc(p.modalidade)}</strong></div><div><small>Prioridade</small><strong>${esc(p.prioridade)}</strong></div><div><small>Data de entrada</small><strong>${fmtDate(p.data_entrada)}</strong></div><div><small>Prazo</small><strong>${fmtDate(p.prazo)}</strong></div><div><small>Valor homologado</small><strong>${money(p.valor_homologado)}</strong></div><div><small>Dotação</small><strong>${esc(p.dotacao||'Não informada')}</strong></div></div>${p.bloqueio_motivo?`<div class="info-note warning-note" style="margin-top:17px"><strong>Impedimento registrado:</strong> ${esc(p.bloqueio_motivo)}</div>`:''}<div class="info-note" style="margin-top:17px"><strong>Próxima providência:</strong> ${esc(p.proxima_acao||'Não definida')}</div>${p.referencia_sei?`<div class="tiny">Referência SEI: ${esc(p.referencia_sei)}</div>`:''}</div><div class="card section">${cardTitle('Tarefas vinculadas')} ${tasks.length?tasks.map(t=>`<div class="row-item"><div><div class="item-title">${esc(t.titulo)}</div><div class="item-meta">${esc(t.responsavel)} · ${fmtDate(t.prazo)}</div></div>${iconBadge(t.status)}</div>`).join(''):empty('Ainda não há tarefas vinculadas')}</div></div><div><div class="card section">${cardTitle('Linha do tempo','Registro das movimentações')}${routes.length?`<div class="info-note"><strong>Tramitações:</strong><ul>${routes.map(t=>`<li>${esc(t.origem)} → ${esc(t.destino)} · ${esc(t.responsavel_destino)} · ${new Date(t.criado_em).toLocaleString('pt-BR')}</li>`).join('')}</ul></div>`:''}${logs.length?`<div class="timeline">${logs.map(e=>`<div class="event"><strong>${esc(e.tipo)}</strong><p>${esc(e.descricao)}</p><small>${esc(e.usuario)} · ${new Date(e.criado_em).toLocaleString('pt-BR')}</small></div>`).join('')}</div>`:empty('Nenhuma movimentação encontrada')}</div></div></div>`;
 openModal('Detalhes do processo','Acompanhamento administrativo e histórico de decisões.',html,true);
}
function logForm(id){const p=findProcess(id);if(!p||!canWrite(p.setor))return showToast('Sem permissão para registrar movimentação.');openModal('Registrar movimentação',p.numero,`<form data-form="log" data-id="${esc(id)}"><div class="form-grid">${selectField('tipo','Tipo de evento',['Recebimento','Diligência','Pendência','Conformidade','Empenho','Observação'], 'Observação')}<div class="info-note">Registro em nome do usuário autenticado: ${esc(profile.nome)}</div>${textareaField('descricao','Descrição objetiva do ocorrido','')}</div><div class="modal-footer"><button type="button" class="btn" data-action="closeModal">Cancelar</button><button type="submit" class="btn primary">Registrar</button></div></form>`)}
function activateAccountView(){return `<div class="login-wrapper"><h2>Ativar seu acesso</h2><p class="sub">Escolha uma senha com pelo menos 12 caracteres. Não compartilhe sua senha com o administrador.</p><form data-form="activateAccount" style="margin-top:18px"><div class="form-grid">${inputField('password','Nova senha','','password','required minlength="12" autocomplete="new-password"')}${inputField('confirm','Confirmar nova senha','','password','required minlength="12" autocomplete="new-password"')}</div><div class="modal-footer"><button class="btn primary" type="submit">Ativar minha conta</button></div></form></div>`}
async function acceptInviteFromUrl(){
 const hash=new URLSearchParams(location.hash.replace(/^#/,''));
 const token=hash.get('access_token'),refresh=hash.get('refresh_token'),type=hash.get('type');
 if(!token||!refresh||!['invite','recovery'].includes(type||''))return false;
 if(!cloud())throw Error('Configure a conexão do projeto antes de abrir o convite.');
 session={access_token:token,refresh_token:refresh,user:null,expires_at:Date.now()+(Number(hash.get('expires_in'))||3600)*1000};
 const person=await rest('/auth/v1/user','GET',null,token);
 session.user=person;sessionStorage.setItem(KEYS.session,JSON.stringify(session));
 history.replaceState(null,'',location.pathname+location.search);
 inviteActive=true;render();return true;
}
async function activateAccount(d){if(!inviteActive||!session)return;
 if(String(d.password||'').length<12||d.password!==d.confirm)return showToast('Senha com mínimo de 12 caracteres e confirmação idêntica.');
 busy=true;try{
  await rest('/auth/v1/user','PUT',{password:d.password},session.access_token);
  inviteActive=false;busy=false;cloudDataReady=false;await fetchCloud({fastInitial:true});render();showToast('Senha cadastrada. Bem-vindo ao SIG!');
 }catch(e){busy=false;showToast('Falha na ativação: '+errMsg(e))}
}
async function requestRecovery(d){
 const email=String(d.email||'').trim().toLowerCase();
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){showToast('Informe um endereço de e-mail válido.');return}
 if(!cloud()){showToast('Configure a conexão com o Supabase.');return}
 busy=true;
 try{
  const redirect=new URL('./',location.href);
  redirect.hash='';redirect.search='';
  await rest('/auth/v1/recover?redirect_to='+encodeURIComponent(redirect.href),'POST',{email},null);
  showToast('Se este e-mail está habilitado, um link para definir a senha será enviado. Confira também o spam.');
 }catch(e){showToast('Falha ao solicitar recuperação: '+errMsg(e))}
 finally{busy=false}
}
function loginView(){return `<div class="login-wrapper"><h2>Identificação do usuário</h2><p class="sub">Somente contas liberadas pelo administrador podem acessar o banco.</p><form data-form="login" style="margin-top:18px"><div class="form-grid">${inputField('email','E-mail','', 'email','required autocomplete="username"')}${inputField('password','Senha','', 'password','required autocomplete="current-password"')}</div><div class="modal-footer"><button type="button" class="btn" data-action="settings">Configurações</button><button type="submit" class="btn primary">Entrar</button></div></form><p class="helper">As senhas são enviadas diretamente à autenticação do projeto Supabase; não são gravadas pelo protótipo.</p><div class="card section" style="margin-top:20px"><h3>Primeiro acesso ou esqueceu a senha?</h3><p class="sub">Se o convite direcionou para localhost ou você ainda não definiu sua senha, solicite um novo link. O administrador deve configurar a URL pública no Supabase antes do envio.</p><form data-form="recover" style="margin-top:12px">${inputField('email','E-mail da sua conta','', 'email','required autocomplete="email"')}<div class="modal-footer"><button type="submit" class="btn">Enviar link de definição de senha</button></div></form></div></div>`}
function settingsModal(){const html=`<div class="info-note warning-note"><strong>Atenção:</strong> o site compartilhado não é local apropriado para dados internos antes de autorização institucional, revisão de segurança e configuração das permissões do banco.</div><form data-form="settings"><div class="form-grid">${inputField('url','URL do projeto Supabase',config.url,'url','placeholder="https://projeto.supabase.co"')}${inputField('key','Chave pública (anon/publishable)',config.key,'text','autocomplete="off" placeholder="sb_publishable_..."')}</div><div class="modal-footer"><button type="button" class="btn" data-action="disconnect">${cloud()?'Desconectar / voltar à demo':'Restaurar demonstração'}</button><button type="submit" class="btn primary">Salvar conexão</button></div></form><div class="card section" style="margin-top:17px"><h3>Modo demonstração</h3><p class="sub">Permite testar todas as funcionalidades no navegador, sem servidor e sem criar conta.</p><div class="detail-actions"><button class="btn" data-action="export">↓ Exportar JSON</button><button class="btn" data-action="import">↑ Importar JSON</button><button class="btn danger" data-action="resetDemo">Reiniciar demo</button></div><p class="helper">Sincronização multiusuário só funciona com um projeto PostgreSQL configurado. As credenciais de serviço não devem ser inseridas neste aplicativo.</p></div><div class="card section"><h3>Como ativar a versão compartilhada</h3><p class="sub">1. Criar um projeto no Supabase sob conta aprovada. 2. Executar <span class="code">database/schema.sql</span>. 3. Cadastrar usuários no Authentication e autorizar os perfis na tabela <span class="code">usuarios</span>. 4. Informar aqui a URL e a chave pública do projeto.</p></div>`;
 openModal('Configurações e conexão','Administração local e conexão do banco de dados.',html,true)}
function profileModal(){const html=cloud()?`<div class="card section"><h3>${esc(profile.nome||'Usuário')}</h3><p class="sub">Perfil real: ${esc(labelRole(profile.role))} · setor: ${esc(profile.setor||'—')}</p><div class="detail-actions">${canPreviewRole()?'<button class="btn" data-action="previewProfiles">Visualizar outros perfis</button>':''}<button class="btn danger" data-action="signOut">Sair da conta</button></div></div>`:`<div class="info-note">A demonstração não possui autenticação. Perfis nesta tela apenas ilustram possíveis permissões, sem restringir dados reais.</div><div class="card section"><h3>Perfil de simulação</h3><p class="sub">Atual: ${esc(profile.role)}</p><div class="detail-actions">${['admin','chefia','chefe_compras','chefe_licitacao','chefe_sofi','compras','licitacao','sofi','leitura'].map(r=>`<button class="btn small" data-action="demoRole" data-role="${r}">${r}</button>`).join('')}</div></div>`;openModal('Perfil de acesso',cloud()?'Sessão autorizada pelo banco':'Somente para navegação demonstrativa.',html)}
// Camada de dados: demo local ou Supabase REST + GoTrue (chave pública, políticas RLS).
async function rest(path,method='GET',payload=null,token=session?.access_token){
 if(!cloud())throw Error('Projeto em nuvem não configurado.');
 const headers={'apikey':config.key,'Accept':'application/json'};
 if(token)headers['Authorization']='Bearer '+token;
 if(payload!==null){headers['Content-Type']='application/json';headers['Prefer']='return=representation'}
 let response=await fetch(config.url.replace(/\/$/,'')+path,{method,headers,body:payload!==null?JSON.stringify(payload):undefined,cache:'no-store'});
 if(response.status===401&&session?.refresh_token&&path.startsWith('/rest/')){if(token===session.access_token)await refreshSession();headers['Authorization']='Bearer '+session.access_token;response=await fetch(config.url.replace(/\/$/,'')+path,{method,headers,body:payload!==null?JSON.stringify(payload):undefined,cache:'no-store'})}
 const raw=await response.text();let result;try{result=raw?JSON.parse(raw):null}catch{result={message:raw}}
 if(!response.ok)throw Error(result?.message||result?.msg||result?.error_description||`Erro HTTP ${response.status}`);
 return result;
}
let pendingSessionRefresh=null;
async function refreshSession(){
 if(pendingSessionRefresh)return pendingSessionRefresh;
 pendingSessionRefresh=(async()=>{
  if(!session?.refresh_token)throw Error('Sessão expirada. Entre novamente.');
  const data=await rest('/auth/v1/token?grant_type=refresh_token','POST',{refresh_token:session.refresh_token},null);
  session={access_token:data.access_token,refresh_token:data.refresh_token,user:data.user,expires_at:Date.now()+data.expires_in*1000};
  sessionStorage.setItem(KEYS.session,JSON.stringify(session));
 })();
 try{return await pendingSessionRefresh;}finally{pendingSessionRefresh=null;}
}
function onCloudReady(){
 lastLoad=nowIso();
 if(v3NotificationsReady&&v3Unread()>v3UnreadSeen)showToast('Você recebeu '+(v3Unread()-v3UnreadSeen)+' novo(s) aviso(s).');
 v3UnreadSeen=v3Unread();v3NotificationsReady=true;render();
}
async function fetchCloud(options={}){
 if(!cloud()||!session?.user?.id)return false;
 const userId=session.user.id,fast=!!options.fastInitial&&!cloudDataReady;
 busy=true;
 if(!cloudDataReady){cloudLoadError='';render();}
 // Autorização e dados consultados em paralelo; toda leitura continua sob RLS.
 const identityReq=rest('/rest/v1/usuarios?auth_id=eq.'+encodeURIComponent(userId)+'&select=nome,role,setor,ativo&limit=1');
 const dataReq=TABLES.map(k=>rest('/rest/v1/'+k+'?select=*&limit=1000'));
 const extraNames=TABLES.filter(k=>!SIG_FAST_TABLES.includes(k));
 // Consome rejeições assíncronas mesmo quando a validação inicial falha.
 const extraReq=fast?Promise.all(extraNames.map(k=>dataReq[TABLES.indexOf(k)])).then(rows=>({ok:true,rows}),error=>({ok:false,error})):null;
 try{
  if(fast){
   const [identity,...mainRows]=await Promise.all([identityReq,...SIG_FAST_TABLES.map(k=>dataReq[TABLES.indexOf(k)])]);
   if(session?.user?.id!==userId)return false;
   if(!identity?.[0]?.ativo)throw Error('Usuário não habilitado no SIG. Solicite acesso ao administrador.');
   profile=identity[0];if(profile.role!=='admin')previewRole=null;
   db=Object.fromEntries(TABLES.map(t=>[t,[]]));
   SIG_FAST_TABLES.forEach((k,i)=>db[k]=mainRows[i]||[]);
   cloudDataReady=true;cloudExtraState='loading';cloudLoadError='';view=firstRoleView();render();
   void extraReq.then(result=>{
    if(session?.user?.id!==userId)return;
    if(!result.ok){cloudExtraState='error';cloudLoadError=errMsg(result.error);render();showToast('Falha na sincronização complementar. Tente novamente.');return;}
    extraNames.forEach((k,i)=>db[k]=result.rows[i]||[]);
    cloudExtraState='ready';cloudLoadError='';onCloudReady();
   });
   return true;
  }
  const [identity,...rows]=await Promise.all([identityReq,...dataReq]);
  if(session?.user?.id!==userId)return false;
  if(!identity?.[0]?.ativo)throw Error('Usuário não habilitado no SIG. Solicite acesso ao administrador.');
  profile=identity[0];if(profile.role!=='admin')previewRole=null;db=Object.fromEntries(TABLES.map((k,i)=>[k,rows[i]||[]]));
  cloudDataReady=true;cloudExtraState='ready';cloudLoadError='';onCloudReady();return true;
 }catch(e){
  if(session?.user?.id!==userId)return false;
  if(String(e.message).includes('não habilitado')){
   session=null;sessionStorage.removeItem(KEYS.session);
   db=Object.fromEntries(TABLES.map(t=>[t,[]]));
   profile={nome:'Não autenticado',role:'leitura',setor:''};cloudDataReady=false;cloudExtraState='idle';cloudLoadError='';
  }else if(!cloudDataReady){cloudLoadError=errMsg(e);cloudExtraState='error';}
  render();showToast('Falha ao sincronizar: '+errMsg(e));return false;
 }finally{busy=false;}
}
async function persist(table,record,existing){if(!TABLES.includes(table))throw Error('Tabela desconhecida');if(!cloud()){const found=db[table].findIndex(x=>x.id===record.id);if(found>=0)db[table][found]=record;else db[table].unshift(record);saveLocal();return record}
 const method=existing?'PATCH':'POST';const suffix=existing?'?id=eq.'+encodeURIComponent(record.id):'';
 const out=await rest('/rest/v1/'+table+suffix,method,existing?[record].map(x=>{const y={...x};delete y.id;delete y.created_at;delete y.updated_at;if(table==='processos'){delete y.setor;delete y.responsavel;delete y.responsavel_auth_id;}if(table==='tarefas')delete y.setor;return y})[0]:record);
 if(!out?.[0])throw Error('Operação não confirmada pelo banco.');await fetchCloud();return out[0]}
async function addEvent(processId,type,desc,user){if(cloud())return rest('/rest/v1/rpc/registrar_ocorrencia','POST',{p_processo_id:processId,p_tipo:type,p_descricao:desc});const log={id:uuid(),processo_id:processId,tipo:type,descricao:desc,usuario:user||profile.nome||'Usuário',criado_em:nowIso()};await persist('eventos',log,false)}
function gather(form){return Object.fromEntries(new FormData(form).entries())}
async function handleSubmit(e){const form=e.target;if(!form.matches('form'))return;e.preventDefault();if(previewRole){showToast('Prévia somente de leitura. Volte ao administrador para alterar registros.');return;}if(busy)return;
 const type=form.dataset.form;if(type==='chiefReassign')return chiefReassignSubmit(form);if(type==='vault')return vaultSubmit(form);if(type==='v4Request')return v4HandleRequest(form);if(type==='v4Competence')return v4HandleCompetence(form);if(type==='v4FinishTask')return v4HandleFinishTask(form);if(type==='activateAccount')return activateAccount(gather(form));if(type==='login')return signIn(gather(form));if(type==='recover')return requestRecovery(gather(form));if(type==='transfer')return submitTransfer(form);if(type==='inviteUser'||type==='updateUser')return submitUser(form);if(type==='settings')return saveSettings(gather(form));if(type==='chat')return ask(new FormData(form).get('question'));
 const d=gather(form),id=form.dataset.id,oldType={process:'processos',task:'tarefas',contract:'contratos',repasse:'repasses',empenho:'empenhos'}[type];
 if(!oldType&&type!=='log')return;
 if(type==='log'){if(!d.descricao?.trim())return showToast('Informe a descrição da movimentação.');try{await addEvent(id,d.tipo,d.descricao,d.usuario);closeModal();showToast('Movimentação registrada.');await (cloud()?fetchCloud():Promise.resolve());render()}catch(ex){showToast('Erro: '+errMsg(ex))}return}
 let old=db[oldType]?.find(x=>x.id===id)||null;
 const numbers={process:['valor_estimado','valor_homologado'],contract:['valor_global','custo_mensal','saldo_empenho','cobertura_alvo'],repasse:['ano','valor_recebido','valor_destinado'],empenho:['ano','valor_empenhado','valor_consumido']}[type]||[];
 for(const n of numbers)d[n]=digits(d[n]);if(type==='empenho'){d.processo_id=d.processo_id||null;d.contrato_id=d.contrato_id||null}if(type==='task')d.processo_id=d.processo_id||null;
 if(type==='task'&&old?.status!=='Concluída'&&d.status==='Concluída'&&String(d.conclusao_observacao||'').trim().length<8)return showToast('Para concluir, descreva a providência (mínimo 8 caracteres).');
 if(type==='task'&&old?.status==='Concluída'&&d.status!=='Concluída')return showToast('Tarefa concluída não pode ser reaberta neste piloto.');
 if(type==='process'&&(!d.numero||!d.objeto))return showToast('Número e objeto são obrigatórios.');
 if(type==='process'&&db.processos.some(p=>p.numero===d.numero&&p.id!==id))return showToast('Já existe outro processo com esse número.');
 if((type==='process'||type==='task')&&!canWrite(old?.setor||d.setor))return showToast('Você não pode editar registros do setor de origem.');
  if(type==='task'){
   if(old?.setor&&d.setor!==old.setor)return showToast('Para alterar o setor, utilize a tramitação do processo. A tarefa deve permanecer na seção de origem.');
   if(isSectionChiefRole(profile.role)&&d.setor!==profile.setor)return showToast('A chefia pode distribuir tarefas apenas na própria seção.');
   if(d.processo_id&&findProcess(d.processo_id)?.setor!==d.setor)return showToast('O processo relacionado deve pertencer à mesma seção.');
   if(cloud()&&d.responsavel_auth_id&&!userCandidates(d.setor).some(u=>u.auth_id===d.responsavel_auth_id))return showToast('Escolha um militar ativo da mesma seção.');
  }
 if((type==='contract'||type==='repasse'||type==='empenho')&&!canFinance())return showToast('Permissão insuficiente para editar dados financeiros.');
 if(type==='repasse'&&digits(d.valor_destinado)>digits(d.valor_recebido))return showToast('Valor destinado não pode superar o recebido sem conciliação específica.');
 if(type==='empenho'&&digits(d.valor_consumido)>digits(d.valor_empenhado))return showToast('Execução não pode superar o valor empenhado neste controle simplificado.');
 if(type==='contract'&&d.fim<d.inicio)return showToast('Fim da vigência anterior ao início.');
 const record=normalizeProcess({...old,...d,id:old?.id||uuid(),updated_at:nowIso()});if(type==='task'&&cloud()&&d.responsavel_auth_id!==undefined){const who=db.usuarios.find(u=>u.auth_id===d.responsavel_auth_id);record.responsavel=who?.nome||'Fila da '+d.setor;record.responsavel_auth_id=d.responsavel_auth_id||null;}
 try{busy=true;await persist(oldType,record,!!old);busy=false;
 if(type==='process'&&!cloud())await addEvent(record.id,old?'Alteração de processo':'Abertura de processo',old?`Atualização registrada. Setor: ${old.setor} → ${record.setor}; status: ${old.status} → ${record.status}; responsável: ${old.responsavel} → ${record.responsavel}; próxima ação: ${record.proxima_acao||'não informada'}.`:`Processo cadastrado em ${record.setor} para ${record.responsavel}.`,profile.nome);
 closeModal();if(cloud()&&!((type==='process'||type==='task')&&record.setor==='Compras'))await fetchCloud();render();showToast(`${type==='process'?'Processo':type==='task'?'Tarefa':type==='contract'?'Contrato':type==='repasse'?'Repasse':'Empenho'} salvo com sucesso.`);
 }catch(ex){busy=false;showToast('Não foi possível salvar: '+errMsg(ex))}
}
async function signIn({email,password}){if(!cloud()||busy)return;
 busy=true;const button=document.querySelector('form[data-form="login"] button[type="submit"]');
 if(button){button.disabled=true;button.textContent='Autenticando…';}
 try{
  const r=await rest('/auth/v1/token?grant_type=password','POST',{email,password},null);
  vaultClearOpenReports();
  session={access_token:r.access_token,refresh_token:r.refresh_token,user:r.user,expires_at:Date.now()+r.expires_in*1000};
  sessionStorage.setItem(KEYS.session,JSON.stringify(session));
  cloudDataReady=false;cloudExtraState='idle';cloudLoadError='';
  profile={nome:'Verificando acesso',role:'leitura',setor:'',ativo:false};
  db=Object.fromEntries(TABLES.map(t=>[t,[]]));
  const ok=await fetchCloud({fastInitial:true});
  if(ok){closeModal();showToast('Sessão iniciada.');}
 }catch(e){showToast('Falha no acesso: '+errMsg(e))}
 finally{busy=false;if(button?.isConnected){button.disabled=false;button.innerHTML='Entrar <span class="sig-auth-arrow" aria-hidden="true">→</span>';}}
}
async function signOut(){previewRole=null;try{if(session)await rest('/auth/v1/logout','POST',{},session.access_token)}catch{}session=null;sessionStorage.removeItem(KEYS.session);vaultClearOpenReports();db=Object.fromEntries(TABLES.map(t=>[t,[]]));profile={nome:'Não autenticado',role:'leitura',setor:''};closeModal();render()}
function saveSettings({url,key}){previewRole=null;url=(url||'').trim().replace(/\/$/,'');key=(key||'').trim();if((url&&!key)||(!url&&key))return showToast('Informe URL e chave pública juntos.');if(url&&!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url))return showToast('Use uma URL de projeto HTTPS do Supabase (domínio *.supabase.co).');if(key&&/service_role|sb_secret_/i.test(key))return showToast('Nunca use chave secreta/service_role no navegador.');vaultClearOpenReports();config={url,key};localStorage.setItem(KEYS.settings,JSON.stringify(cloud()?config:{...config,mode:'demo'}));session=null;sessionStorage.removeItem(KEYS.session);closeModal();if(!cloud()){db=storage();profile={nome:'Demonstração',role:'admin',setor:'Todos',ativo:true}}else{db=Object.fromEntries(TABLES.map(t=>[t,[]]));profile={nome:'Não autenticado',role:'leitura',setor:''}}render();showToast(cloud()?'Configuração salva. Faça login.':'Retorno ao modo demonstrativo.')}
function assistantAnswer(question){const q=String(question||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
 const respostaV7=window.SIG_V7.answer(question,canFinance());if(respostaV7)return respostaV7;
 const respostaV6=window.SIG_V6.answer(question,canFinance());if(respostaV6)return respostaV6;

 if(/solicitac|solicitad|pedido de empenho|a empenhar|demandas financeiras/.test(q)){
  if(!canFinance())return 'A consulta detalhada das solicitações de empenho exige perfil autorizado na SOFI ou chefia.';
  const arr=v4OpenRequests().sort((a,b)=>daysLeft(a.prazo)-daysLeft(b.prazo));
  return 'SOLICITAÇÕES DE EMPENHO ABERTAS ('+arr.length+')\n'+(arr.map(r=>'• '+v4ProcessLabel(r.processo_id)+' — '+money(r.valor_solicitado)+'; '+r.status+'; dotação '+r.dotacao+'; prazo '+fmtDate(r.prazo)+'. '+(r.pendencia||r.descricao)).join('\n')||'Nenhuma solicitação aberta cadastrada.')+'\n\nRegistro de controle: não comprova disponibilidade orçamentária nem empenhamento oficial.';
 }
 if(/competenc|previsao contratual|programacao contratual|reforc|cobertura/.test(q)){
  if(!canFinance())return 'A consulta da programação financeira contratual exige perfil autorizado.';
  const arr=db.contratos.filter(c=>c.status==='Vigente');
  return 'PROJEÇÃO DE COBERTURA CONTRATUAL ('+arr.length+' contrato(s))\n'+(arr.map(c=>{const f=v4PredictedContract(c);return '• '+c.numero+' — saldo informado '+money(f.available)+'; previsão do horizonte '+money(f.needed)+'; diferença estimada '+money(f.shortfall)+'; vigência até '+fmtDate(c.fim)+(f.hasMissing?' (inclui média mensal estimada)':'');}).join('\n')||'Nenhum contrato vigente cadastrado.')+'\n\nCálculos de planejamento; não equivalem a saldo oficial ou autorização de reforço.';
 }

 const open=processOpen();const blocked=open.filter(processBlocked);const pending=db.tarefas.filter(t=>t.status!=='Concluída');const contracts=db.contratos.filter(c=>c.status==='Vigente');
 if(/empenh|falta empenhar|financeiro/.test(q)){const arr=db.processos.filter(p=>p.status==='Aguardando empenho');return `PROCESSOS EM ANÁLISE PARA EMPENHO (${arr.length})\n`+(arr.map(p=>`• ${p.numero}: ${p.objeto} — valor ainda não registrado em empenhos: ${money(moneyToCommit(p))}. Próxima ação: ${p.proxima_acao||'não definida'}.`).join('\n')||'Nenhum processo com status "Aguardando empenho".')+'\n\nAtenção: cálculo estimativo com base no cadastro, não é disponibilidade oficial.'}
 if(/travad|parad|atras|bloque|gargal/.test(q)){return `PROCESSOS COM ALERTA (${blocked.length})\n`+(blocked.map(p=>`• ${p.numero} — ${p.setor} — ${p.status}. Responsável: ${p.responsavel}. ${p.bloqueio_motivo||p.proxima_acao||'Sem justificativa detalhada.'}`).join('\n')||'Nenhum bloqueio/atraso identificado.')+`\n\nTarefas com prazo vencido: ${pending.filter(isOverdue).length}.`}
 if(/contrat|vigenc|reforc|cobertura/.test(q)){const alerts=contracts.filter(c=>daysLeft(c.fim)<60||digits(c.custo_mensal)>0&&digits(c.saldo_empenho)/digits(c.custo_mensal)<digits(c.cobertura_alvo));return `CONTRATOS QUE EXIGEM ANÁLISE (${alerts.length})\n`+(alerts.map(c=>`• ${c.numero}: vigência até ${fmtDate(c.fim)}; saldo informado ${money(c.saldo_empenho)}; cobertura ${digits(c.custo_mensal)?(digits(c.saldo_empenho)/digits(c.custo_mensal)).toFixed(1):'indefinida'} meses. Gestor: ${c.gestor}.`).join('\n')||'Nenhum alerta nas regras configuradas.')+'\n\nAlertas dependem de confirmação dos dados contratuais e financeiros.'}
 if(/tarefa|minha fila|chegou para mim|pendenc|providenc/.test(q)){const sector={'compras':'Compras','licitacao':'Licitação','sofi':'SOFI'}[effectiveRole()];const matches=sector?pending.filter(t=>t.setor===sector):pending;return `TAREFAS PENDENTES (${matches.length})\n`+(matches.sort((a,b)=>daysLeft(a.prazo)-daysLeft(b.prazo)).slice(0,15).map(t=>`• ${t.titulo} — ${t.setor} — ${t.responsavel}; prazo ${fmtDate(t.prazo)}${isOverdue(t)?' (ATRASADO)':''}.`).join('\n')||'Nenhuma tarefa pendente neste recorte.')+'\n\nPara a distribuição pessoal, atribua os responsáveis de maneira padronizada.'}
 if(/saldo|dotac|repasse|destin/.test(q)){const r=db.repasses,total=r.reduce((a,b)=>a+digits(b.valor_recebido),0),allocated=r.reduce((a,b)=>a+digits(b.valor_destinado),0);return `REPASSES REGISTRADOS\nRecebido: ${money(total)}. Destinado: ${money(allocated)}. Diferença: ${money(total-allocated)}.\n`+r.map(x=>`• ${x.documento} (${x.dotacao}): ${money(x.valor_recebido-x.valor_destinado)} não destinado.`).join('\n')+'\n\nA diferença não equivale a saldo disponível para empenho.'}
 if(/compras|licitac|sofi|setor|andamento|resumo/.test(q)){const sect=q.includes('licitac')?'Licitação':q.includes('compras')?'Compras':q.includes('sofi')?'SOFI':null;const arr=sect?open.filter(p=>p.setor===sect):open;return `RESUMO ${sect?'DO SETOR '+sect.toUpperCase():'GERAL'}\nProcessos abertos: ${arr.length}. Bloqueados ou atrasados: ${arr.filter(processBlocked).length}.\n`+arr.map(p=>`• ${p.numero} — ${p.status} — ${p.etapa} — ${p.responsavel}. Próxima ação: ${p.proxima_acao||'não cadastrada'}.`).join('\n')}
 return 'Consigo consultar processos, tarefas, empenhos, repasses e contratos cadastrados. Experimente: “Quais processos aguardam empenho?”, “O que está atrasado?” ou “Quais contratos exigem atenção?”.\n\nEsta versão usa regras de consulta, não uma IA generativa. Não invento informações ausentes.';
}
function ask(question){question=String(question||'').trim();if(!question)return;chat.push({role:'user',text:question},{role:'bot',text:assistantAnswer(question)});if(chat.length>36)chat=chat.slice(-36);render()}
function downloadText(filename,content){const blob=new Blob([content],{type:'application/json;charset=utf-8'}),url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)}
function exportData(){const payload={sistema:'SIG CSA-TIC',versao:2,exportado_em:nowIso(),tipo:cloud()?'dados_autorizados':'DEMONSTRACAO_FICTICIA',data:db};downloadText('sig-csatic-'+today()+'.json',JSON.stringify(payload,null,2));showToast('Backup JSON exportado.')}
function importData(){if(cloud())return showToast('Importação JSON não está habilitada no banco compartilhado. Use importação validada.');const file=document.createElement('input');file.type='file';file.accept='.json,application/json';file.onchange=async()=>{try{const text=await file.files[0].text();if(text.length>3000000)throw Error('Arquivo excede 3 MB.');const parsed=JSON.parse(text);if(!TABLES.every(t=>Array.isArray(parsed.data?.[t])))throw Error('Estrutura de backup desconhecida.');if(parsed.tipo!=='DEMONSTRACAO_FICTICIA')throw Error('Somente backups demonstrativos são aceitos nesta versão.');if(!confirm('Substituir todos os dados demonstrativos deste navegador?'))return;db=parsed.data;saveLocal();render();showToast('Backup demonstrativo importado.')}catch(e){showToast('Importação recusada: '+errMsg(e))}};file.click()}
function resetDemo(){if(cloud())return showToast('Desconecte o banco antes de reiniciar a demo.');if(!confirm('Restaurar os dados fictícios? Suas edições locais serão substituídas.'))return;db=seed();saveLocal();closeModal();navigate('dashboard');showToast('Demonstração reiniciada.')}
async function handleClick(e){const btn=e.target.closest('[data-action],[data-view]');if(!btn){if(e.target.classList.contains('modal-backdrop'))closeModal();return}
 if(previewRole&&btn.dataset.action&&!['previewProfiles','setRolePreview','exitRolePreview','closeModal','profile','signOut','detail','taskScope','receiptScope','chiefSector','cotaDetail','buyFilter','buyMore','chiefMember','v4ContractSchedule','v6ApplyFilter','v7ApplyFilter','v6ClearFilter','v7ClearFilter'].includes(btn.dataset.action)){showToast('Prévia somente de leitura. Volte ao administrador para executar esta ação.');return;}
 if(btn.dataset.view){navigate(btn.dataset.view);return}
 if(cloud()&&session&&(!cloudDataReady||cloudExtraState!=='ready')&&btn.dataset.action&&!['retryCloudLoad','profile','signOut'].includes(btn.dataset.action)){showToast('Sincronização em andamento. Aguarde para alterar registros.');return}
 const action=btn.dataset.action,id=btn.dataset.id;
 switch(action){
 case 'buyFilter':if(!['all','attention','week','done'].includes(btn.dataset.filter))break;purchaseFilter=btn.dataset.filter;purchaseLimit=12;render();break;
 case 'buyMore':purchaseLimit+=12;render();break;
 case 'chiefMember':chiefMemberFilter=chiefMemberFilter===btn.dataset.member?'Todos':btn.dataset.member;render();break;
 case 'chiefNewTask':{
  const sec=chiefScope();
  const target=SECTORS.includes(sec)?sec:(SECTORS.includes(btn.dataset.sector)?btn.dataset.sector:'Compras');
  if(previewRole||!(profile.role==='admin'||isSectionChiefRole(profile.role))||!canWrite(target))return showToast('Acesso restrito à chefia da seção.');
  taskForm(null,null,target,chiefMemberFilter==='Todos'?'':chiefMemberFilter);break;
 }
 case 'chiefReassign':chiefRedistributeForm(id,btn.dataset.member);break;
 case 'previewProfiles':previewProfileModal();break;
 case 'setRolePreview':setRolePreview(btn.dataset.role);break;
 case 'exitRolePreview':exitRolePreview();break;
 case 'cotaDetail':if(!canViewCota())return showToast('Cota orçamentária indisponível para o seu perfil.');openModal('Detalhes da dotação','Posição orçamentária importada do SIG V6.',window.SIG_COTAS.detail(decodeURIComponent(btn.dataset.dot||'')),true);break;
 case 'cotaExport':if(!canFinance())return showToast('Acesso financeiro restrito.');window.SIG_COTAS.exportCSV();break;
 case 'cotaClearFilters':window.SIG_COTAS.clear();break;
 case 'v7Demo':window.SIG_V7.demo();render();break;
 case 'v7Clear':window.SIG_V7.clear();render();break;
 case 'v7ApplyFilter':window.SIG_V7.filter(document.getElementById('v7-filter')?.value||'');render();break;
 case 'v7ClearFilter':window.SIG_V7.filter('');render();break;
 case 'vaultSave':vaultShow(btn.dataset.kind,'save');break;
 case 'vaultRestore':vaultShow(btn.dataset.kind,'restore');break;
 case 'vaultDelete':vaultShow(btn.dataset.kind,'delete');break;
 case 'v6ApplyFilter':{const value=document.getElementById('v6-filter')?.value||'';window.SIG_V6.filter(value);render();break;}
 case 'v6ClearFilter':window.SIG_V6.filter('');render();break;
 case 'v6Demo':window.SIG_V6.demo();render();break;
 case 'v6Clear':window.SIG_V6.reset();render();break;
 case 'v5Demo':v5Demo();break;
 case 'v5Clear':v5Report=null;render();break;
 case 'v4NewRequest':v4RequestForm(null,btn.dataset.process);break;
 case 'v4EditRequest':v4RequestForm(id);break;
 case 'v4NewCompetence':v4CompetenceForm(null,id);break;
 case 'v4EditCompetence':v4CompetenceForm(id);break;
 case 'v4ContractSchedule':v4ScheduleModal(id);break;
 case 'v4FinishTask':v4FinishTaskModal(id);break;
 case 'readNotification': await v3ReadNotification(id);break;
 case 'readAllNotifications': await v3ReadAll();break;
 case 'openNotification': {const n=v3MyNotifications().find(x=>x.id===id);if(n){await v3ReadNotification(id);if(n.processo_id)detail(n.processo_id)}break;}
 case 'startReceipt': await v3StartReceipt(id);break;
 case 'chiefSector': navigate('processos');filters.setor=btn.dataset.sector||'Todos';render();break;
 case'menu':document.getElementById('sidebar').classList.toggle('open');document.getElementById('shade').classList.toggle('visible');break;
 case'retryCloudLoad':await fetchCloud();break;case'closeModal':closeModal();break;case'detail':detail(id);break;case'newProcess':processForm(null,btn.dataset.sector);break;case'editProcess':processForm(id);break;case'transfer':transferForm(id);break;case'newTask':taskForm(null,btn.dataset.process,btn.dataset.sector);break;case'editTask':taskForm(id);break;case'newContract':contractForm(null);break;case'editContract':contractForm(id);break;case'newRepasse':repasseForm(null);break;case'editRepasse':repasseForm(id);break;case'newEmpenho':empenhoForm(null);break;case'editEmpenho':empenhoForm(id);break;case'logEvent':logForm(id);break;case'settings':settingsModal();break;case'profile':profileModal();case'inviteUser':userForm(null);break;case'editUser':userForm(id);break;case'reloadUsers':await loadAdminUsers();break;case'taskScope':taskScope=btn.dataset.scope;render();break;case'receiptScope':receiptScope=btn.dataset.scope;render();break;break;case'signOut':await signOut();break;case'ask':ask(btn.dataset.text);break;case'clearChat':chat=[];render();break;case'refresh':if(cloud())await fetchCloud();else{db=storage();render();showToast('Dados locais atualizados.')};break;case'export':exportData();break;case'import':importData();break;case'resetDemo':resetDemo();break;case'reconnectInstitutional':reconnectInstitutional();break;case'disconnect':saveSettings({url:'',key:''});break;case'demoRole':if(!cloud()){profile.role=btn.dataset.role;localStorage.setItem(KEYS.profile,profile.role);closeModal();render()}break;default:break;}}
function handleFilter(e){const target=e.target;if(!target.dataset?.filter)return;const key=target.dataset.filter;filters[key]=target.value;const selection=key==='q'?target.selectionStart:null;render();if(key==='q'){const inp=document.getElementById('filter-q');if(inp){inp.focus();inp.setSelectionRange(selection,selection)}}}
function init(){document.addEventListener('click',e=>{handleClick(e).catch(x=>showToast(errMsg(x)))});document.getElementById('shade').addEventListener('click',()=>{document.getElementById('sidebar').classList.remove('open');document.getElementById('shade').classList.remove('visible')});document.addEventListener('submit',e=>{handleSubmit(e).catch(x=>showToast(errMsg(x)))});document.addEventListener('input',e=>{if(e.target.id==='cotas-busca'){window.SIG_COTAS.filter('q',e.target.value);return}if(e.target.dataset?.filter==='q')handleFilter(e)});document.addEventListener('change',e=>{if(e.target.dataset?.chiefFilter){
   const field=e.target.dataset.chiefFilter,value=e.target.value;
   if(field==='sector'&&profile.role==='admin'){
    if(previewRole==='chefia'&&!SECTORS.includes(value))return;
    if(value!=='Todos'&&!SECTORS.includes(value))return;
    chiefSectorFilter=value;chiefMemberFilter='Todos';
   }else if(field==='status'&&['active','late','done','all'].includes(value))chiefTaskFilter=value;
   else if(field==='member'&&(value==='Todos'||chiefTeam(chiefScope()).some(u=>u.auth_id===value)))chiefMemberFilter=value;
   render();return;
  }
  if(e.target.id==='f-role'&&e.target.closest('form[data-form="inviteUser"],form[data-form="updateUser"]')){
   syncUserRoleSetor();return;
  }
  if(e.target.id==='f-task-sector'&&e.target.closest('form[data-form="task"]')){
   const newSector=e.target.value;
   const uSelect=document.getElementById('f-responsavel_auth_id');
   if(uSelect)uSelect.innerHTML=setorOptionsUsers(newSector,'');
   const processSelect=document.getElementById('f-processo_id');
   if(processSelect)processSelect.innerHTML='<option value="">Sem processo vinculado</option>'+
    db.processos.filter(p=>p.setor===newSector).map(p=>'<option value="'+esc(p.id)+'">'+esc(p.numero+' — '+p.objeto.slice(0,55))+'</option>').join('');
   return;
  }
  if(e.target.id==='cotas-tipo'||e.target.id==='cotas-conta'){window.SIG_COTAS.filter(e.target.id==='cotas-tipo'?'tipo':'conta',e.target.value);return}if(e.target.id==='v7-upload'){window.SIG_V7.load(e.target.files?.[0]).then(()=>{render();showToast('Auditoria V7 carregada localmente.');}).catch(err=>showToast('Arquivo V7: '+errMsg(err)));return}if(e.target.id==='v6-upload'){window.SIG_V6.load(e.target.files?.[0]).then(()=>{render();showToast('Conciliação V6 carregada localmente; nenhum dado foi enviado ao servidor.');}).catch(err=>showToast('Arquivo V6: '+errMsg(err)));return}if(e.target.id==='v6-filter'){window.SIG_V6.filter(e.target.value);render();return}if(e.target.id==='v5-json-file'){v5ReadLocal(e.target.files?.[0]).catch(err=>showToast('Prévia: '+errMsg(err)));return}if(e.target.id==='stallDays'){stallDays=Math.max(1,Math.min(30,Number(e.target.value)||5));localStorage.setItem('sig-alert-days',String(stallDays));render();return}if(e.target.name==='destino'&&e.target.closest('form[data-form=transfer]')){document.getElementById('f-destinatario_auth_id').innerHTML=setorOptionsUsers(e.target.value,'')}if(e.target.dataset?.filter&&e.target.dataset.filter!=='q')handleFilter(e)});document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal();if(e.key==='Enter'&&e.target?.id==='v7-filter'){e.preventDefault();window.SIG_V7.filter(e.target.value);render();}if(e.key==='Enter'&&e.target?.id==='v6-filter'){e.preventDefault();window.SIG_V6.filter(e.target.value);render();}});if(!localStorage.getItem(KEYS.data))saveLocal();render();acceptInviteFromUrl().then(hasInvite=>{if(!hasInvite&&cloud()&&session)fetchCloud({fastInitial:true})}).catch(e=>{showToast('Falha ao validar convite: '+errMsg(e));render()});setInterval(()=>{if(cloud()&&session&&cloudExtraState==='ready'&&!busy&&document.visibilityState==='visible'&&!document.getElementById('modal-root').childElementCount)fetchCloud().catch(()=>{})},120000)}
// Exposição limitada para testes automatizados locais.
if(typeof window!=='undefined')window.SIG_TEST={seed,assistantAnswer,moneyToCommit,daysLeft,activeProcess};
init();
})();