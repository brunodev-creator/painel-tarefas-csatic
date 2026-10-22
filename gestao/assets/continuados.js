/* SIG CSA-TIC — Contratos Continuados: área do fiscal e visão gerencial (DTS-1/SOFI).
 * Leitura do retrato da PLANILHA ATUAL (tabelas sig_cont_*), análise pelo motor puro (continuados-motor.js)
 * e um único campo de preenchimento: o saldo adicional necessário até 31/12, informado pelo fiscal.
 * O banco é a autoridade (RLS + RPC); este módulo exibe, calcula projeções e envia a manifestação. */
(()=>{
'use strict';
const M=window.SIG_CONT_MOTOR;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const brl=c=>c===null||c===undefined?'—':M.brl(c);
const curto=c=>c===null||c===undefined?'—':M.brlCurto(c);
const quando=v=>v?new Date(v).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}):'—';
const dia=v=>v?new Date(String(v).slice(0,10)+'T12:00:00').toLocaleDateString('pt-BR'):'—';
const plain=v=>String(v??'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
const hojeSP=()=>new Date().toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'});
const GESTAO=['admin','dts1','sofi','chefe_sofi','chefia'];
const SITUACAO={insuficiente:{cor:'red',icone:'!'},atencao:{cor:'amber',icone:'◐'},sem_dados:{cor:'gray',icone:'?'},coberto:{cor:'teal',icone:'✓'},unico:{cor:'gray',icone:'1×'}};
const PERIODICIDADE={mensal:'Execução mensal regular',eventual:'Execução irregular',insuficiente:'Histórico insuficiente',unico:'Pagamento único / anual',sem_historico:'Sem conformidade no exercício',sem_movimento:'Sem valor líquido'};
const CONFIANCA={alta:'Alta',media:'Média',baixa:'Baixa',nenhuma:'Sem base'};
const TENDENCIA={alta:'↗ em alta',queda:'↘ em queda',estavel:'→ estável'};
const ORIGEM={MEDIA_ULTIMOS_3_MESES:'Média dos últimos 3 meses',MEDIA_HISTORICA:'Média histórica do exercício',MEDIA_COM_MES_CORRENTE:'Média com o mês corrente',MEDIA_MANUAL_PLANILHA:'Média manual da planilha',PAGAMENTO_UNICO:'Sem recorrência mensal'};

// ===== Estado =====
const vazio=()=>({parametros:[],contratos:[],movimentos:[],empenhos:[],correcoes:[],manifestacoes:[],fiscais:[],sync:null,syncs:[],eventos:[],v6:null});
const state={identity:null,loaded:false,loading:false,error:'',d:vazio(),analise:null,dispo:null,calculadoEm:null,
 tab:null,filtro:'atencao',busca:'',aberto:null,focoPainel:false,salvo:null,demo:false,ver:'cartoes'};
let ctxAtual=null;
function syncIdentity(id){if(state.identity!==id){state.identity=id;state.loaded=false;state.loading=false;state.error='';state.d=vazio();state.analise=null;state.aberto=null;state.tab=null;}}
const isLoaded=()=>state.loaded||state.loading;

async function todas(rest,path){
 const out=[];
 for(let off=0;off<100000;off+=1000){
  const rows=await rest(path+(path.includes('?')?'&':'?')+'limit=1000&offset='+off);
  if(!Array.isArray(rows))break;out.push(...rows);if(rows.length<1000)break;
 }
 return out;
}
async function load(rest,force=false){
 if(state.loading||(state.loaded&&!force))return;
 state.loading=true;state.error='';
 try{
  // Retrato vigente: a última importação com alteração; retratos anteriores ficam só como histórico.
  const ultimaImportacao=await rest('/rest/v1/sig_cont_sincronizacoes?select=*&sem_alteracao=eq.false&order=id.desc&limit=1').catch(()=>[]);
  const retrato=(ultimaImportacao||[])[0]?.id;
  const [parametros,contratos,movimentos,empenhos,correcoes,manifestacoes,fiscais,syncs,eventos]=await Promise.all([
   rest('/rest/v1/sig_cont_parametros?select=*&order=exercicio.desc'),
   todas(rest,'/rest/v1/sig_cont_contratos?select=*&order=chave.asc'),
   retrato?todas(rest,'/rest/v1/sig_cont_movimentos?select=*&retrato=eq.'+retrato+'&order=id.asc'):Promise.resolve([]),
   todas(rest,'/rest/v1/sig_cont_empenhos?select=*&order=chave_empenho.asc'),
   rest('/rest/v1/sig_cont_correcoes?select=*&ativo=eq.true'),
   todas(rest,'/rest/v1/sig_cont_manifestacoes?select=*&order=registrado_em.asc'),
   rest('/rest/v1/sig_cont_fiscais?select=*'),
   rest('/rest/v1/sig_cont_sincronizacoes?select=*&order=id.desc&limit=12'),
   rest('/rest/v1/sig_cont_eventos?select=*&order=id.desc&limit=300')]);
  state.d={parametros,contratos,movimentos,empenhos,correcoes,manifestacoes,fiscais,syncs,eventos,
   sync:(ultimaImportacao||[])[0]||(syncs||[])[0]||null,ultimaVerificacao:(syncs||[])[0]||null,v6:null};
  // Disponibilidade orçamentária (conferência V6): somente perfis financeiros leem esses snapshots (RLS).
  if(ctxAtual&&GESTAO.includes(ctxAtual.role)){
   const v6=await rest('/rest/v1/sig_planilha_snapshots?aba=in.(SIG_V6_ABATIMENTOS,SIG_V6_DOTACOES)&select=aba,cabecalhos,linhas,gerado_em').catch(()=>null);
   state.d.v6=lerV6(v6);
  }
  state.demo=false;state.loaded=true;analisar();
 }catch(e){state.error=e.message||String(e);state.loaded=true;}
 finally{state.loading=false;}
}
function lerV6(rows){
 if(!Array.isArray(rows)||rows.length<2)return null;
 const tab=n=>rows.find(r=>r.aba===n);const ab=tab('SIG_V6_ABATIMENTOS'),dt=tab('SIG_V6_DOTACOES');if(!ab||!dt)return null;
 const ix=(t,n)=>t.cabecalhos.findIndex(h=>String(h).trim()===n);
 const ac=ix(ab,'Chave empenho'),au=ix(ab,'Dotação utilizada para abate'),dd=ix(dt,'Dotação'),df=ix(dt,'Diferença gerencial NÃO OFICIAL (R$)'),dl=ix(dt,'Leitura EEXX');
 if([ac,au,dd,df].some(i=>i<0))return null;
 return {gerado_em:dt.gerado_em,abatimentos:ab.linhas.map(r=>({chave:r[ac],cota:String(r[au]||'').replace(/\D/g,'')})),
  dotacoes:dt.linhas.map(r=>({cota:String(r[dd]||'').replace(/\D/g,''),diferenca:M.C(r[df]),leitura:dl>=0?r[dl]:r[dd]}))};
}
function parametrosAtuais(){
 const hoje=hojeSP(),ano=Number(hoje.slice(0,4));
 const ps=state.d.parametros||[];
 const p=ps.find(x=>Number(x.exercicio)===ano)||ps.filter(x=>Number(x.exercicio)<=ano).sort((a,b)=>b.exercicio-a.exercicio)[0]||{exercicio:ano,meses_alvo:[ano+'-11',ano+'-12']};
 return {hoje,exercicio:Number(p.exercicio),mesesAlvo:p.meses_alvo};
}
function analisar(){
 const p=parametrosAtuais();
 const correcoes=Object.fromEntries((state.d.correcoes||[]).map(c=>[c.chave_empenho,{original:c.original,corrigida:c.corrigida}]));
 const contratosAtivos=(state.d.contratos||[]).map(c=>({...c}));
 state.analise=M.analisar({movimentos:state.d.movimentos,contratos:contratosAtivos,empenhos:state.d.empenhos,manifestacoes:state.d.manifestacoes,correcoes},p);
 const cad=new Map(contratosAtivos.map(c=>[c.chave,c]));
 state.analise.contratos.forEach(c=>{const k=cad.get(c.chave);if(k){c.ativo=k.ativo!==false;if(k.titulo&&!c.especificacao)c.especificacao=k.titulo;}else c.ativo=true;});
 state.dispo=state.d.v6?M.disponibilidade(state.analise,state.d.v6.abatimentos,state.d.v6.dotacoes):null;
 state.calculadoEm=new Date().toISOString();
}

// ===== Modo demonstração (dados fictícios, gerados) =====
const DEMO_KEY='sig-cont-demo-manifestacoes-v1';
function demoDados(){
 const hoje=hojeSP(),ano=Number(hoje.slice(0,4)),mesAtual=hoje.slice(0,7);
 const meses=M.mesesEntre(ano+'-03',M.mesAnterior(mesAtual));
 const movs=[];let n=0;
 const mov=(chave,proc,obj,cnpj,dot,tipo,mes,valor,extra={})=>movs.push({id:'demo-'+(++n),chave_empenho:chave,tipo,mes,data:mes+'-'+String(10+(n%15)).padStart(2,'0'),
  valor_empenho:/EMPENHO/.test(tipo)?valor:0,valor_conformidade:/CONFORMIDADE/.test(tipo)?valor:0,processo:proc,cnpj,fornecedor:extra.fornecedor||'Fornecedor Exemplo',
  objeto_contrato:obj,especificacao:obj,dotacao:dot,unidade_contabil:extra.unidade||'1250070',tdco:extra.tdco||false});
 const regular=(k,proc,obj,cnpj,dot,valor,empenhado,var_=0.06,extra)=>{
  mov(k,proc,obj,cnpj,dot,'EMPENHO_INICIAL',ano+'-02',empenhado,extra);
  meses.forEach((m,i)=>mov(k,proc,obj,cnpj,dot,'CONFORMIDADE_ORCAMENTARIA',m,Math.round(valor*(1+((i%3)-1)*var_)),extra));
 };
 const D='1251.06.181.137.4365.0001.3390.';
 regular(ano+'|9|1','DEMO-011/2025','Suporte técnico e sustentação de sistemas','11.111.111/0001-11',D+'4002.60.2.0',118000,780000,0.05,{fornecedor:'Fornecedor Exemplo A'});
 regular(ano+'|9|2','DEMO-011/2025','Suporte técnico e sustentação de sistemas','11.111.111/0001-11',D+'4002.10.1.0',22000,190000,0.04,{fornecedor:'Fornecedor Exemplo A'});
 mov(ano+'|9|1','DEMO-011/2025','Suporte técnico e sustentação de sistemas','11.111.111/0001-11',D+'4002.60.2.0','REFORCO_EMPENHO',mesAtual,120000,{fornecedor:'Fornecedor Exemplo A'});
 regular(ano+'|9|3','DEMO-021/2024','Conectividade e links de dados','22.222.222/0001-22',D+'4004.60.2.0',41000,370000,0.03,{fornecedor:'Fornecedor Exemplo B'});
 regular(ano+'|9|4','DEMO-031/2024','Hospedagem de servidores em nuvem','33.333.333/0001-33','1251.02.061.734.4355.0001.4490.4007.10.1.0',64000,700000,0.08,{fornecedor:'Fornecedor Exemplo C',unidade:'1050003',tdco:true});
 mov(ano+'|9|5','DEMO-041/2025','Licenças de software com subscrição por 1 ano','44.444.444/0001-44',D+'4002.60.2.0','EMPENHO_INICIAL',ano+'-05',96000,{fornecedor:'Fornecedor Exemplo D'});
 mov(ano+'|9|5','DEMO-041/2025','Licenças de software com subscrição por 1 ano','44.444.444/0001-44',D+'4002.60.2.0','CONFORMIDADE_ORCAMENTARIA',ano+'-06',96000,{fornecedor:'Fornecedor Exemplo D'});
 mov(ano+'|9|6','DEMO-051/2026','Telefonia móvel corporativa','55.555.555/0001-55',D+'4004.60.2.0','EMPENHO_INICIAL',M.mesAnterior(mesAtual),30000,{fornecedor:'Fornecedor Exemplo E'});
 mov(ano+'|9|6','DEMO-051/2026','Telefonia móvel corporativa','55.555.555/0001-55',D+'4004.60.2.0','CONFORMIDADE_ORCAMENTARIA',M.mesAnterior(mesAtual),8200,{fornecedor:'Fornecedor Exemplo E'});
 regular(ano+'|9|7','DEMO-061/2023','Manutenção de rádios e repetidoras','66.666.666/0001-66',D+'3921.60.2.0',15500,260000,0.02,{fornecedor:'Fornecedor Exemplo F'});
 mov(ano+'|9|8','DEMO-071/2025','Certificação digital sob demanda','77.777.777/0001-77',D+'4002.60.2.0','EMPENHO_INICIAL',ano+'-04',12000,{fornecedor:'Fornecedor Exemplo G'});
 const contratos=[...new Set(movs.map(m=>M.contratoChave(m.processo,m.cnpj,m.objeto_contrato)))].map(chave=>({chave,ativo:true}));
 const k=p=>contratos.find(c=>c.chave.includes(p)).chave;
 let manif=[];try{manif=JSON.parse(localStorage.getItem(DEMO_KEY)||'null');}catch{}
 if(!Array.isArray(manif)){
  manif=[{id:'dm1',exercicio:ano,contrato_chave:k('DEMO-011'),valor:300000,sugestao_sistema:null,registrado_por:'demo-admin',registrado_nome:'Fiscal (demonstração)',registrado_em:ano+'-'+mesAtual.slice(5)+'-01T10:00:00-03:00'},
   {id:'dm2',exercicio:ano,contrato_chave:k('DEMO-061'),valor:0,sugestao_sistema:0,registrado_por:'demo-admin',registrado_nome:'Fiscal (demonstração)',registrado_em:ano+'-'+mesAtual.slice(5)+'-05T09:12:00-03:00'}];
 }
 const fiscais=['DEMO-011','DEMO-021','DEMO-051','DEMO-061'].map(p=>({contrato_chave:k(p),auth_id:'demo-admin',papel:'Fiscal',ativo:true}));
 return {parametros:[{exercicio:ano,meses_alvo:[ano+'-11',ano+'-12']}],contratos,movimentos:movs,empenhos:[],correcoes:[],manifestacoes:manif,fiscais,
  sync:{executado_em:new Date().toISOString(),gerado_em:new Date().toISOString(),origem:'demonstração'},syncs:[],eventos:[],v6:null};
}
function carregarDemo(){state.d=demoDados();state.demo=true;state.loaded=true;state.error='';analisar();}

// ===== Permissões no cliente (o banco aplica as mesmas regras com RLS/RPC) =====
const ehGestao=ctx=>GESTAO.includes(ctx.role);
const meusVinculos=ctx=>(state.d.fiscais||[]).filter(f=>f.ativo&&f.auth_id===ctx.authId);
const ehFiscal=(ctx,chave)=>meusVinculos(ctx).some(f=>f.contrato_chave===chave);
const podeRegistrar=(ctx,chave)=>ehFiscal(ctx,chave)&&!ctx.preview&&(ctx.online||ctx.demo);
function abas(ctx){
 const t=[];
 if(meusVinculos(ctx).length||!ehGestao(ctx))t.push(['fiscal','Meus contratos']);
 if(ehGestao(ctx))t.push(['gestao','Visão gerencial']);
 if(ctx.admin)t.push(['vinculos','Fiscais e parâmetros']);
 return t;
}
function escopo(ctx,tab){
 const todos=(state.analise?.contratos||[]).filter(c=>c.ativo!==false);
 if(tab==='fiscal'){const meus=new Set(meusVinculos(ctx).map(f=>f.contrato_chave));return todos.filter(c=>meus.has(c.chave));}
 return todos;
}

// ===== Componentes visuais =====
function pill(c){const s=SITUACAO[c.situacao.nivel]||SITUACAO.sem_dados;return '<span class="cont-pill '+s.cor+'"><i aria-hidden="true">'+s.icone+'</i>'+esc(c.situacao.texto)+'</span>';}
function chipManifestacao(c){
 if(!c.manifestacao)return '<span class="cont-chip vazio">Aguardando o fiscal</span>';
 if(c.manifestacao.valor===0)return '<span class="cont-chip zero">Fiscal: sem necessidade</span>';
 const st=c.atendimento?.status;
 return '<span class="cont-chip valor">Fiscal: '+esc(curto(c.manifestacao.valor))+(st?' · '+({atendida:'atendida',parcial:'atendida em parte',pendente:'pendente'})[st]:'')+'</span>';
}
// Barra de cobertura: cada mês projetado em largura proporcional à despesa; parte coberta pelo saldo × reforço.
function barraCobertura(c){
 const meses=c.porMes.filter(p=>p.despesa>0);
 if(!meses.length)return '<div class="cont-cover vazio"><span>Sem despesa mensal projetada</span></div>';
 const total=meses.reduce((t,p)=>t+p.despesa,0);
 return '<div class="cont-cover" role="img" aria-label="'+esc(meses.map(p=>M.mesLongo(p.mes)+': '+(p.reforco>0?'faltam '+brl(p.reforco):'coberto')).join('; '))+'">'+meses.map(p=>{
  const w=Math.max(8,p.despesa*100/total),cob=p.despesa?p.coberto*100/p.despesa:0;
  return '<div class="cont-cover-seg" style="flex:'+w.toFixed(2)+'"><div class="cont-cover-bar"><span class="ok" style="width:'+cob.toFixed(1)+'%"></span><span class="falta" style="width:'+(100-cob).toFixed(1)+'%"></span></div><small>'+esc(p.corrente?M.mesLabel(p.mes).slice(0,3):M.mesLabel(p.mes).slice(0,3))+'</small></div>';
 }).join('')+'</div>';
}
function cobreAteTexto(c){
 if(c.referencia===null)return '—';
 if(c.situacao.nivel==='unico')return 'Sem recorrência';
 if(!c.cobreAte)return 'Até 31/12';
 const p=c.porMes.find(x=>x.mes===c.cobreAte);
 return p&&p.coberto>0?'Parte de '+M.mesLabel(c.cobreAte):'Até '+M.mesLabel(M.mesAnterior(c.cobreAte));
}
function cartao(c){
 return '<button type="button" class="cont-card nivel-'+c.situacao.nivel+'" data-action="sigContAbrir" data-chave="'+esc(c.chave)+'">'+
  '<span class="cont-card-top">'+pill(c)+chipManifestacao(c)+'</span>'+
  '<span class="cont-card-title">'+esc(c.titulo)+'</span>'+
  '<span class="cont-card-meta">'+esc(c.fornecedor||'Fornecedor não informado')+' · '+esc(c.processos.join(' · '))+'</span>'+
  barraCobertura(c)+
  '<span class="cont-card-nums"><span><small>Consumo/mês</small><b>'+esc(curto(c.referencia))+'</b></span><span><small>Saldo</small><b>'+esc(curto(c.saldo))+'</b></span>'+
  '<span><small>Cobre</small><b>'+esc(cobreAteTexto(c))+'</b></span><span class="'+(c.reforcoTotal>0?'falta':'')+'"><small>Reforço estimado</small><b>'+esc(c.reforcoTotal===null?'—':curto(c.reforcoTotal))+'</b></span></span>'+
  '<span class="cont-card-resumo">'+esc(c.resumo)+'</span></button>';
}

// Série do gráfico: realizado (conformidade por mês) → mês corrente → meses projetados (coberto × reforço) + saldo utilizável.
function serieGrafico(contratos,analise){
 const meses=new Map();
 const get=m=>{if(!meses.has(m))meses.set(m,{mes:m,realizado:0,coberto:0,reforco:0,saldo:null,saldoProj:null,tipo:'real'});return meses.get(m);};
 const inicio=analise.exercicio+'-01';
 contratos.forEach(c=>{
  c.serie.forEach(x=>{if(x.mes>=inicio)get(x.mes).realizado+=x.valor;});
  c.saldoMensal.forEach(x=>{if(x.mes>=inicio){const g=get(x.mes);g.saldo=(g.saldo||0)+x.saldo;}});
  c.porMes.forEach(p=>{const g=get(p.mes);g.tipo=p.corrente?'corrente':'proj';g.coberto+=p.coberto||0;g.reforco+=p.reforco||0;g.saldoProj=(g.saldoProj||0)+(p.saldoUtilizavelFim||0);
   if(p.corrente)g.realizado+=c.execMesAtual||0;});
 });
 // Meses fechados sem nenhum contrato ainda iniciado: remove zeros à esquerda.
 const lista=[...meses.values()].sort((a,b)=>a.mes.localeCompare(b.mes));
 while(lista.length>4&&lista[0].tipo==='real'&&!lista[0].realizado&&!lista[0].saldo)lista.shift();
 return lista;
}
function grafico(contratos,analise,titulo,id){
 const s=serieGrafico(contratos,analise);
 if(!s.length)return '<div class="cont-chart-empty">Sem execução registrada para desenhar a linha do tempo.</div>';
 const W=760,H=270,L=58,R=14,T=30,B=34,iw=W-L-R,ih=H-T-B;
 const maxBar=Math.max(1,...s.map(x=>x.realizado+x.coberto+x.reforco),...s.map(x=>Math.max(x.saldo||0,x.saldoProj||0)));
 const passo=niceStep(maxBar/4),ymax=Math.ceil(maxBar/passo)*passo;
 const y=v=>T+ih-(v/ymax)*ih,bw=Math.min(46,iw/s.length*0.56),cx=i=>L+iw*(i+0.5)/s.length;
 let g='<defs><pattern id="'+id+'-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="#ead9b5"/><line x1="0" y1="0" x2="0" y2="6" stroke="#946b1e" stroke-width="2.4"/></pattern>'+
  '<pattern id="'+id+'-falta" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(135)"><rect width="6" height="6" fill="#f3d6d4"/><line x1="0" y1="0" x2="0" y2="6" stroke="#9e3f3c" stroke-width="2.4"/></pattern></defs>';
 for(let v=0;v<=ymax;v+=passo)g+='<line class="grid" x1="'+L+'" x2="'+(W-R)+'" y1="'+y(v)+'" y2="'+y(v)+'"/><text class="ytick" x="'+(L-8)+'" y="'+(y(v)+4)+'">'+esc(M.brlCurto(v).replace('R$ ',''))+'</text>';
 const iProj=s.findIndex(x=>x.tipo!=='real');
 if(iProj>=0){const x0=L+iw*iProj/s.length;g+='<rect class="proj-bg" x="'+x0+'" y="'+(T-18)+'" width="'+(W-R-x0)+'" height="'+(ih+18)+'"/><text class="proj-label" x="'+(x0+8)+'" y="'+(T-6)+'">PROJEÇÃO · ESTIMATIVA</text>';}
 s.forEach((x,i)=>{
  const xc=cx(i),x0=xc-bw/2;let base=T+ih;
  const seg=(v,cls,fill)=>{if(v<=0)return;const h=Math.max(1.5,v/ymax*ih);base-=h;g+='<rect class="'+cls+'" x="'+x0+'" y="'+base+'" width="'+bw+'" height="'+h+'" rx="3"'+(fill?' fill="url(#'+id+fill+')"':'')+'/>';base-=2;};
  seg(x.realizado,'real');seg(x.coberto,'est','-hatch');seg(x.reforco,'falta','-falta');
  if(x.reforco>0)g+='<text class="lbl-falta" x="'+xc+'" y="'+(T+12)+'">−'+esc(M.brlCurto(x.reforco).replace('R$ ',''))+'</text>';
  g+='<text class="xtick'+(x.tipo!=='real'?' proj':'')+'" x="'+xc+'" y="'+(H-12)+'">'+esc(M.mesLabel(x.mes).slice(0,3))+'</text>';
 });
 // Linha de saldo: histórico contínuo e projeção tracejada a partir do último mês fechado.
 const pts=s.map((x,i)=>({x:cx(i),v:x.tipo==='real'?x.saldo:x.saldoProj,real:x.tipo==='real'})).filter(p=>p.v!==null&&p.v!==undefined);
 const reais=pts.filter(p=>p.real),proj=pts.filter(p=>!p.real);
 if(reais.length)g+='<polyline class="saldo" points="'+reais.map(p=>p.x+','+y(Math.max(0,p.v))).join(' ')+'"/>';
 if(proj.length)g+='<polyline class="saldo proj" points="'+[reais[reais.length-1],...proj].filter(Boolean).map(p=>p.x+','+y(Math.max(0,p.v))).join(' ')+'"/>';
 pts.forEach(p=>{g+='<circle class="saldo-pt'+(p.real?'':' proj')+'" cx="'+p.x+'" cy="'+y(Math.max(0,p.v))+'" r="4"/>';});
 // Áreas de leitura (hover/foco) por mês.
 s.forEach((x,i)=>{g+='<rect class="hit" tabindex="0" x="'+(L+iw*i/s.length)+'" y="'+T+'" width="'+(iw/s.length)+'" height="'+ih+'" data-i="'+i+'"><title>'+esc(M.mesLabel(x.mes))+'</title></rect>';});
 const dados=esc(JSON.stringify(s.map(x=>({m:M.mesLabel(x.mes),t:x.tipo,r:x.realizado,c:x.coberto,f:x.reforco,s:x.tipo==='real'?x.saldo:x.saldoProj}))));
 return '<figure class="cont-chart" data-serie="'+dados+'"><figcaption><span>'+esc(titulo)+'</span><span class="cont-legend">'+
  '<span><i class="lg-real"></i>Executado (conformidade)</span><span><i class="lg-est"></i>Despesa estimada coberta</span><span><i class="lg-falta"></i>Reforço estimado</span><span><i class="lg-saldo"></i>Saldo utilizável</span></span></figcaption>'+
  '<div class="cont-chart-box"><svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="'+esc(titulo+': execução mensal realizada, projeção e saldo')+'">'+g+'</svg><div class="cont-tip" hidden></div></div></figure>';
}
function niceStep(v){if(v<=0)return 1;const p=Math.pow(10,Math.floor(Math.log10(v))),n=v/p;return (n<=1?1:n<=2?2:n<=2.5?2.5:n<=5?5:10)*p;}

function kpis(lista,analise){
 const soma=f=>lista.reduce((t,c)=>t+(f(c)||0),0);
 const ref=soma(c=>c.referencia),saldo=soma(c=>c.saldo);
 const alvo=m=>soma(c=>c.porMes.find(p=>p.mes===m)?.despesa);
 const refAlvo=m=>soma(c=>c.porMes.find(p=>p.mes===m)?.reforco);
 const corrente=soma(c=>c.porMes.find(p=>p.corrente)?.reforco);
 const reforco=soma(c=>c.reforcoTotal);
 const mesesTxt=analise.mesesAlvo.map(m=>M.mesLongo(m)).join(' + ');
 const desp=analise.mesesAlvo.reduce((t,m)=>t+alvo(m),0);
 const atencao=lista.filter(c=>c.situacao.nivel==='insuficiente').length;
 return '<div class="cont-kpis">'+
  '<div><span>Consumo mensal de referência</span><strong>'+esc(curto(ref))+'</strong><small>'+lista.filter(c=>c.referencia>0).length+' contrato(s) com execução recorrente</small></div>'+
  '<div><span>Saldo nos empenhos</span><strong>'+esc(curto(saldo))+'</strong><small>'+(ref>0?'≈ '+(saldo/ref).toLocaleString('pt-BR',{maximumFractionDigits:1})+' mês(es) do consumo atual':'—')+'</small></div>'+
  '<div><span>Despesa projetada · '+esc(mesesTxt)+'</span><strong>'+esc(curto(desp))+'</strong><small>Estimativa do sistema</small></div>'+
  '<div class="destaque'+(reforco>0?' falta':'')+'"><span>Reforço estimado até 31/12</span><strong>'+esc(curto(reforco))+'</strong><small>'+
   analise.mesesAlvo.map(m=>esc(M.mesLabel(m).slice(0,3))+' '+esc(curto(refAlvo(m)))).join(' · ')+(corrente>0?' · '+esc(M.mesLabel(analise.mesAtual).slice(0,3))+' '+esc(curto(corrente)):'')+
   ' · '+atencao+' contrato(s) com falta</small></div></div>';
}
function carimbo(){
 const s=state.d.sync;
 if(state.demo)return '<span class="cont-stamp demo">Demonstração · dados fictícios gerados</span>';
 if(!s)return '<span class="cont-stamp vazio">Nenhuma sincronização com a planilha</span>';
 return '<span class="cont-stamp"><i aria-hidden="true"></i>Planilha atualizada em <b>'+esc(quando(s.gerado_em||s.executado_em))+'</b> · importada em '+esc(quando(s.executado_em))+
  (state.d.ultimaVerificacao&&state.d.ultimaVerificacao!==s?' · conferida em '+esc(quando(state.d.ultimaVerificacao.executado_em)):'')+'</span>';
}

// ===== Página =====
function view(ctx){
 ctxAtual=ctx;
 if(ctx.demo&&!state.loaded)carregarDemo();
 if(!ctx.demo&&state.demo){state.loaded=false;state.d=vazio();state.analise=null;state.demo=false;}
 const ab=abas(ctx);if(!state.tab||!ab.some(a=>a[0]===state.tab))state.tab=ab[0]?.[0]||'fiscal';
 const a=state.analise;
 const ano=a?.exercicio||Number(hojeSP().slice(0,4));
 let h='<div class="cont-page"><section class="cont-hero"><div class="cont-hero-grid"><div><span class="cont-eyebrow">Execução continuada · Exercício '+ano+'</span>'+
  '<h1>Contratos continuados</h1><p>A execução de cada contrato lida da planilha oficial, analisada e projetada até 31/12 — com foco em <strong>'+esc((a?.mesesAlvo||[ano+'-11',ano+'-12']).map(m=>M.mesLongo(m)).join(' e '))+'</strong>. O fiscal só informa quanto saldo adicional precisa.</p></div>'+
  '<div class="cont-hero-side">'+carimbo()+'<div class="cont-hero-actions">'+
  (ctx.online?'<button type="button" class="cont-btn-ghost" data-action="sigContRecarregar">↻ Atualizar análise</button>':'')+
  (ehGestao(ctx)&&a?'<button type="button" class="cont-btn-ghost" data-action="sigContImprimir">⎙ Relatório</button>':'')+'</div></div></div>'+
  (ab.length>1?'<div class="cont-tabs" role="tablist">'+ab.map(([k,l])=>'<button type="button" role="tab" aria-selected="'+(state.tab===k)+'" class="'+(state.tab===k?'active':'')+'" data-action="sigContAba" data-tab="'+k+'">'+esc(l)+'</button>').join('')+'</div>':'')+'</section>';
 if(state.loading&&!a)return h+carregando()+'</div>';
 if(state.error)return h+'<section class="cont-state erro" role="alert"><h2>Não foi possível carregar os contratos</h2><p>'+esc(state.error)+'</p><button type="button" class="btn primary" data-action="sigContRecarregar">Tentar novamente</button></section></div>';
 if(!a)return h+carregando()+'</div>';
 if(!a.contratos.length&&state.tab!=='vinculos')return h+'<section class="cont-state"><h2>Aguardando a primeira sincronização</h2><p>Nenhum retrato da planilha foi importado. O administrador instala o script <code>SIG_CONTINUADOS_SINCRONIZACAO.gs</code> na «agora vai - PLANILHA ATUAL»; a partir daí a análise é atualizada sozinha.</p></section></div>';
 if(state.tab==='gestao')h+=viewGestao(ctx);else if(state.tab==='vinculos')h+=viewVinculos(ctx);else h+=viewFiscal(ctx);
 if(state.aberto)h+=painel(ctx);
 return h+'</div>';
}
function carregando(){return '<section class="cont-loading" aria-busy="true" aria-live="polite"><span class="sr-only">Carregando e analisando os contratos…</span>'+
 '<div class="cont-kpis">'+'<div class="sk"></div>'.repeat(4)+'</div><div class="sk sk-chart"></div><div class="cont-grid">'+'<div class="sk sk-card"></div>'.repeat(3)+'</div></section>';}

function viewFiscal(ctx){
 const lista=escopo(ctx,'fiscal'),a=state.analise;
 if(!lista.length)return '<section class="cont-state"><h2>Nenhum contrato vinculado a você</h2><p>Os contratos aparecem aqui quando o administrador registra você como fiscal. '+(ehGestao(ctx)?'Use a <b>Visão gerencial</b> para acompanhar todos os contratos.':'Procure a administração do SIG.')+'</p></section>';
 const pend=lista.filter(c=>!c.manifestacao).length;
 let h=kpis(lista,a);
 h+='<section class="cont-panel cont-chart-panel">'+grafico(lista,a,lista.length===1?'Seu contrato: execução, projeção e saldo':'Seus '+lista.length+' contratos: execução, projeção e saldo','g-fiscal')+'</section>';
 h+='<div class="cont-section-head"><div><h2>Seus contratos</h2><p>'+(pend?'<b>'+pend+'</b> aguardando a sua avaliação. Abra o contrato, confira a análise e informe o saldo adicional necessário.':'Todas as necessidades foram informadas. Você pode atualizar o valor a qualquer momento.')+'</p></div></div>';
 h+='<div class="cont-grid">'+lista.map(cartao).join('')+'</div>';
 return h;
}

// ===== Visão gerencial =====
const FILTROS=[['atencao','Precisam de atenção',c=>['insuficiente','atencao','sem_dados'].includes(c.situacao.nivel)],['sem','Sem manifestação',c=>!c.manifestacao],
 ['com','Com manifestação',c=>!!c.manifestacao],['parcial','Atendimento parcial/pendente',c=>c.atendimento&&c.atendimento.status!=='atendida'],['todos','Todos',()=>true]];
function viewGestao(ctx){
 const a=state.analise,todos=escopo(ctx,'gestao'),t=M.totalizar(todos,a.mesesAlvo);
 let h=kpis(todos,a);
 // Planejamento: manifestação quando existe; estimativa quando não existe — nunca as duas para o mesmo contrato.
 const pf=t.planejamento.fiscal,ps=t.planejamento.sistema,tot=t.planejamento.total||1;
 h+='<section class="cont-panel cont-plan"><div class="cont-plan-head"><div><span class="cont-eyebrow escuro">Recursos a providenciar até 31/12</span><strong>'+esc(brl(t.planejamento.total))+'</strong></div>'+
  '<p>Total de planejamento sem dupla contagem: usa o valor informado pelo fiscal quando existe (já descontado o que foi atendido) e a estimativa do sistema quando o fiscal ainda não se manifestou.</p></div>'+
  '<div class="cont-plan-bar" role="img" aria-label="'+esc('Informado pelos fiscais '+brl(pf)+'; estimado pelo sistema '+brl(ps))+'"><span class="fiscal" style="flex:'+Math.max(pf/tot,0.0001)+'"></span><span class="sistema" style="flex:'+Math.max(ps/tot,0.0001)+'"></span></div>'+
  '<div class="cont-plan-legend"><div><i class="fiscal"></i><b>'+esc(brl(pf))+'</b><span>informados pelos fiscais e ainda pendentes · '+t.manifestados+' contrato(s) com manifestação</span></div>'+
  '<div><i class="sistema"></i><b>'+esc(brl(ps))+'</b><span>estimados pelo sistema · '+t.semManifestacao+' contrato(s) sem manifestação ('+t.semManifestacaoComNecessidade+' com necessidade estimada)</span></div>'+
  '<div><i class="atendido"></i><b>'+esc(brl(t.atendido))+'</b><span>já atendidos por reforços importados · '+t.status.atendida+' atendida(s), '+t.status.parcial+' parcial(is), '+t.status.pendente+' pendente(s)</span></div></div></section>';
 h+='<section class="cont-panel cont-chart-panel">'+grafico(todos,a,'Carteira de contratos continuados: execução, projeção e saldo','g-gestao')+'</section>';
 if(state.dispo)h+=blocoDisponibilidade();
 else h+='<p class="cont-note">Disponibilidade orçamentária compatível: '+(ctx.demo?'indisponível no modo demonstração.':'requer a conciliação V6 importada e perfil financeiro (administrador, chefia ou SOFI). Sem ela, os valores acima são necessidade de empenho ou reforço, não necessidade de orçamento adicional.')+'</p>';
 const f=FILTROS.find(x=>x[0]===state.filtro)||FILTROS[0];
 const q=plain(state.busca);
 const lista=todos.filter(f[2]).filter(c=>!q||plain([c.titulo,c.fornecedor,c.processos.join(' '),c.objeto].join(' ')).includes(q));
 h+='<div class="cont-section-head"><div><h2>Contratos</h2><p>'+todos.length+' contratos derivados de '+new Set(todos.flatMap(c=>c.grupos.flatMap(g=>g.empenhos))).size+' empenhos. Clique para ver a análise completa.</p></div>'+
  '<div class="cont-tools"><label class="cont-search"><span aria-hidden="true">⌕</span><span class="sr-only">Buscar contrato</span><input id="sig-cont-busca" type="search" placeholder="Contrato, fornecedor ou processo" value="'+esc(state.busca)+'"></label>'+
  '<button type="button" class="btn small" data-action="sigContCSV">↓ CSV consolidado</button></div></div>';
 h+='<div class="cont-filtros" role="group" aria-label="Filtrar contratos">'+FILTROS.map(([k,l,fn])=>'<button type="button" class="'+(state.filtro===k?'active':'')+'" aria-pressed="'+(state.filtro===k)+'" data-action="sigContFiltro" data-filtro="'+k+'">'+esc(l)+' <b>'+todos.filter(fn).length+'</b></button>').join('')+'</div>';
 h+='<div class="cont-table-wrap"><table class="cont-table"><thead><tr><th>Contrato</th><th>Situação</th><th class="num">Consumo/mês</th><th class="num">Saldo</th>'+
  a.mesesAlvo.map(m=>'<th class="num">Reforço '+esc(M.mesLabel(m).slice(0,3))+'<small>sistema</small></th>').join('')+'<th class="num">Reforço até 31/12<small>sistema</small></th><th class="num">Informado<small>fiscal</small></th><th class="num">Atendido</th><th class="num">Pendente</th></tr></thead><tbody>'+
  (lista.map(c=>{
   const mp=m=>c.porMes.find(p=>p.mes===m)?.reforco;
   const at=c.atendimento;
   return '<tr class="nivel-'+c.situacao.nivel+'"><td><button type="button" class="cont-link" data-action="sigContAbrir" data-chave="'+esc(c.chave)+'">'+esc(c.titulo)+'</button><small>'+esc(c.fornecedor||'')+' · '+esc(c.processos.join(' · '))+'</small></td>'+
    '<td>'+pill(c)+'</td><td class="num">'+esc(curto(c.referencia))+'</td><td class="num">'+esc(curto(c.saldo))+'</td>'+
    a.mesesAlvo.map(m=>'<td class="num'+(mp(m)>0?' falta':'')+'">'+esc(c.referencia===null?'—':curto(mp(m)||0))+'</td>').join('')+
    '<td class="num'+(c.reforcoTotal>0?' falta':'')+'"><b>'+esc(c.reforcoTotal===null?'—':curto(c.reforcoTotal))+'</b></td>'+
    '<td class="num">'+(c.manifestacao?'<b>'+esc(curto(c.manifestacao.valor))+'</b><small>'+esc(dia(c.manifestacao.em))+'</small>':'<span class="cont-chip vazio">sem manifestação</span>')+'</td>'+
    '<td class="num">'+(at?esc(curto(at.atendido)):'—')+'</td><td class="num">'+(at?'<span class="cont-status '+at.status+'">'+esc(curto(at.pendente))+'</span>':c.manifestacao?esc(curto(c.manifestacao.valor)):'—')+'</td></tr>';
  }).join('')||'<tr><td colspan="'+(8+a.mesesAlvo.length)+'" class="cont-vazio">Nenhum contrato neste filtro.</td></tr>')+'</tbody></table></div>';
 h+='<p class="cont-note">Valores do sistema são estimativas calculadas automaticamente a partir das conformidades da planilha; não alteram saldos contábeis. «Atendido» considera apenas reforços e empenhos efetivamente registrados nas importações após a manifestação — aprovação isolada não conta. O valor solicitado pelo fiscal é preservado; o atendido e o restante pendente aparecem separados.</p>';
 return h;
}
function blocoDisponibilidade(){
 const d=state.dispo;
 return '<section class="cont-panel"><div class="cont-section-head tight"><div><h2>Disponibilidade orçamentária compatível</h2><p>Conferência gerencial V6 <b>não oficial</b> (posição de '+esc(quando(state.d.v6?.gerado_em))+'). A necessidade de cada contrato é confrontada com a diferença gerencial da cota em que seus empenhos foram abatidos; a cota é compartilhada entre contratos.</p></div></div>'+
  '<div class="cont-dispo">'+
  '<div><span>Necessidade de orçamento adicional</span><strong class="'+(d.adicional>0?'falta':'')+'">'+esc(brl(d.adicional))+'</strong><small>'+d.cotas.filter(x=>x.adicional>0).length+' cota(s) sem diferença suficiente</small></div>'+
  '<div><span>Necessidade de empenho/reforço sem cota identificada</span><strong>'+esc(brl(d.semCotaTotal))+'</strong><small>TDCO ou vínculo de cota não identificado: orçamento adicional não calculado</small></div></div>'+
  (d.cotas.length?'<div class="cont-table-wrap"><table class="cont-table compacta"><thead><tr><th>Cota (dotação)</th><th class="num">Diferença gerencial V6</th><th class="num">Necessidade dos contratos</th><th class="num">Orçamento adicional</th></tr></thead><tbody>'+
  d.cotas.map(x=>'<tr><td>'+esc(x.leitura)+'<small>'+esc(x.contratos.map(c=>c.titulo).join(' · '))+'</small></td><td class="num">'+esc(brl(x.disponivel))+'</td><td class="num">'+esc(brl(x.necessidade))+'</td><td class="num'+(x.adicional>0?' falta':'')+'"><b>'+esc(brl(x.adicional))+'</b></td></tr>').join('')+'</tbody></table></div>':'')+'</section>';
}

// ===== Fiscais e parâmetros (administração) =====
function viewVinculos(ctx){
 const a=state.analise,todos=(a?.contratos||[]);
 const users=(ctx.users||[]).filter(u=>u.ativo&&u.auth_id).sort((x,y)=>String(x.nome).localeCompare(String(y.nome)));
 const nome=id=>users.find(u=>u.auth_id===id)?.nome||(id==='demo-admin'?'Você (demonstração)':'Usuário '+String(id).slice(0,8));
 const p=parametrosAtuais();
 let h='<section class="cont-panel"><div class="cont-section-head tight"><div><h2>Período de projeção</h2><p>Meses do exercício '+p.exercicio+' destacados na análise. Os meses seguem em sequência a partir do mês corrente.</p></div></div>'+
  '<form class="cont-params" data-form="sigContParametros"><div class="cont-meses">'+Array.from({length:12},(_,i)=>{const m=p.exercicio+'-'+String(i+1).padStart(2,'0');return '<label><input type="checkbox" name="mes" value="'+m+'"'+(p.mesesAlvo.includes(m)?' checked':'')+'><span>'+esc(M.mesLabel(m).slice(0,3))+'</span></label>';}).join('')+
  '</div><button type="submit" class="btn primary"'+(ctx.demo||ctx.preview?' disabled':'')+'>Salvar período</button></form></section>';
 h+='<section class="cont-panel"><div class="cont-section-head tight"><div><h2>Fiscais dos contratos</h2><p>Cada fiscal vê e informa a necessidade somente dos contratos aos quais estiver vinculado. A regra é aplicada também no banco (RLS).</p></div></div>'+
  '<div class="cont-table-wrap"><table class="cont-table compacta"><thead><tr><th>Contrato</th><th>Fiscais vinculados</th><th>Vincular</th></tr></thead><tbody>'+
  todos.map(c=>{
   const fs=(state.d.fiscais||[]).filter(f=>f.contrato_chave===c.chave&&f.ativo);
   return '<tr><td><b>'+esc(c.titulo)+'</b><small>'+esc(c.fornecedor||'')+' · '+esc(c.processos.join(' · '))+'</small></td><td>'+
    (fs.map(f=>'<span class="cont-fiscal">'+esc(nome(f.auth_id))+' <em>'+esc(f.papel)+'</em><button type="button" aria-label="Desvincular '+esc(nome(f.auth_id))+'" data-action="sigContDesvincular" data-chave="'+esc(c.chave)+'" data-auth="'+esc(f.auth_id)+'"'+(ctx.demo||ctx.preview?' disabled':'')+'>×</button></span>').join('')||'<span class="cont-chip vazio">sem fiscal</span>')+'</td>'+
    '<td><form class="cont-vinc" data-form="sigContVincular" data-chave="'+esc(c.chave)+'"><label class="sr-only" for="v-'+esc(c.chave)+'">Usuário</label><select id="v-'+esc(c.chave)+'" name="auth_id" required><option value="">Selecione…</option>'+users.map(u=>'<option value="'+esc(u.auth_id)+'">'+esc(u.nome)+'</option>').join('')+'</select>'+
    '<select name="papel" aria-label="Papel"><option>Fiscal</option><option>Fiscal suplente</option><option>Gestor do contrato</option></select><button type="submit" class="btn small"'+(ctx.demo||ctx.preview?' disabled':'')+'>Vincular</button></form></td></tr>';
  }).join('')+'</tbody></table></div></section>';
 h+='<section class="cont-panel"><div class="cont-section-head tight"><div><h2>Sincronização com a planilha</h2><p>O script <code>integracao/SIG_CONTINUADOS_SINCRONIZACAO.gs</code> envia o retrato da «agora vai - PLANILHA ATUAL» a cada hora, usando o mesmo token de integração das Intenções COTEP. Retrato idêntico é apenas conferido; manifestações e vínculos nunca são sobrescritos.</p></div></div>'+
  '<ul class="cont-syncs">'+((state.d.syncs||[]).map(s=>'<li><b>'+esc(quando(s.executado_em))+'</b> · '+(s.sem_alteracao?'sem alteração':esc(s.empenhos+' empenhos, '+s.movimentos+' movimentos, '+s.contratos+' contratos'+(s.contratos_novos?' ('+s.contratos_novos+' novos)':'')))+' · '+esc(s.origem)+'</li>').join('')||'<li>Nenhuma execução registrada.</li>')+'</ul></section>';
 return h;
}

// ===== Painel do contrato =====
function painel(ctx){
 const c=(state.analise?.contratos||[]).find(x=>x.chave===state.aberto);
 if(!c)return '';
 const a=state.analise,fiscal=ehFiscal(ctx,c.chave),pode=podeRegistrar(ctx,c.chave);
 const ano=a.exercicio,m=c.manifestacao;
 const ultimo=a.mesesProjecao[a.mesesProjecao.length-1];
 let h='<div class="cont-drawer-shade" data-action="sigContFechar"></div><aside class="cont-drawer" role="dialog" aria-modal="true" aria-labelledby="cont-drawer-title">'+
  '<header class="cont-drawer-head"><div><div class="cont-drawer-tags">'+pill(c)+'<span class="cont-conf">Confiança da estimativa: <b>'+esc(CONFIANCA[c.confianca]||c.confianca)+'</b></span></div>'+
  '<h2 id="cont-drawer-title" tabindex="-1">'+esc(c.titulo)+'</h2><p>'+esc(c.fornecedor||'')+(c.cnpj?' · CNPJ '+esc(c.cnpj):'')+' · Processo(s) '+esc(c.processos.join(', '))+(c.vigenciaFim?' · Vigência até '+esc(dia(c.vigenciaFim)):' · Vigência não informada na fonte')+'</p></div>'+
  '<button type="button" class="cont-close" data-action="sigContFechar" aria-label="Fechar painel do contrato">×</button></header><div class="cont-drawer-body">';
 h+='<p class="cont-resumo"><span aria-hidden="true">✦</span>'+esc(c.resumo)+'</p>';
 // Decisão: sugestão do sistema × manifestação do fiscal (lado a lado, nunca somadas).
 const sug=c.reforcoTotal;
 h+='<div class="cont-decisao"><section class="cont-sugestao"><span class="cont-eyebrow escuro">Reforço sugerido pelo sistema</span><strong>'+esc(sug===null?'Sem base de cálculo':brl(sug))+'</strong>'+
  '<small>Estimativa automática até 31/12/'+ano+'</small>'+(sug!==null?'<ul>'+c.porMes.filter(p=>p.reforco>0||p.alvo).map(p=>'<li><span>'+esc(M.mesLongo(p.mes)[0].toUpperCase()+M.mesLongo(p.mes).slice(1)+(p.corrente?' (mês corrente)':''))+'</span><b>'+esc(brl(p.reforco))+'</b></li>').join('')+'</ul>':'')+'</section>';
 h+='<section class="cont-fiscal-box'+(pode?' ativo':'')+'">'+formNecessidade(ctx,c,pode,fiscal)+'</section></div>';
 // Trilha: despesa → saldo utilizável → reforço → disponibilidade → orçamento adicional.
 h+=trilha(ctx,c);
 h+='<section class="cont-sec">'+grafico([c],a,'Execução, projeção e saldo do contrato','g-'+c.chave.replace(/[^a-z0-9]/gi,'').slice(-18))+'</section>';
 h+=indicadores(c);
 // Projeção sequencial.
 h+='<section class="cont-sec"><h3>Projeção mês a mês <small>o saldo usado em um mês não volta no seguinte</small></h3><div class="cont-table-wrap"><table class="cont-table compacta"><thead><tr><th>Mês</th><th class="num">Despesa projetada</th><th class="num">Saldo no início</th><th class="num">Coberto pelo saldo</th><th class="num">Reforço necessário</th><th class="num">Saldo ao fim</th></tr></thead><tbody>'+
  c.porMes.map(p=>'<tr'+(p.alvo?' class="alvo"':'')+'><td><b>'+esc(M.mesLabel(p.mes))+'</b>'+(p.corrente?'<small>mês corrente completo · nota paga no mês seguinte</small>':p.alvo?'<small>mês de foco</small>':'')+'</td><td class="num">'+esc(brl(p.despesa))+' <em class="est">estimada</em></td>'+
   '<td class="num">'+esc(brl(c.grupos.filter(g=>g.referencia!==null).reduce((t,g)=>t+(g.projecao.find(x=>x.mes===p.mes)?.saldoInicio||0),0)))+'</td><td class="num">'+esc(brl(p.coberto))+'</td><td class="num'+(p.reforco>0?' falta':'')+'"><b>'+esc(brl(p.reforco))+'</b></td><td class="num">'+esc(brl(p.saldoFim))+'</td></tr>').join('')+
  '</tbody></table></div><p class="cont-note">Projeção por linha orçamentária, somada no contrato. Saldo negativo ao fim indica o valor acumulado sem cobertura até '+esc(M.mesLabel(ultimo))+'.</p></section>';
 h+=detalhesCalculo(c);
 if(m)h+=blocoAtendimento(c);
 if(ehGestao(ctx)&&!ctx.preview&&(ctx.online||ctx.demo))h+='<section class="cont-sec"><h3>Dados complementares <small>gestão · não altera a manifestação do fiscal</small></h3><form class="cont-compl" data-form="sigContContrato" data-chave="'+esc(c.chave)+'">'+
  '<label>Vigência até<input type="date" name="vigencia_fim" value="'+esc(c.vigenciaFim||'')+'"></label><label>Observação da gestão<input type="text" name="observacao" maxlength="1000" value="'+esc(c.cadastro?.observacao||'')+'"></label><button type="submit" class="btn small"'+(ctx.demo?' disabled':'')+'>Salvar</button></form>'+
  '<p class="cont-note">Com a vigência informada, meses posteriores deixam de ser projetados.</p></section>';
 const ev=(state.d.eventos||[]).filter(e=>e.contrato_chave===c.chave).slice(0,12);
 if(ev.length)h+='<section class="cont-sec"><h3>Trilha de registros</h3><ul class="cont-hist">'+ev.map(e=>'<li><b>'+esc(quando(e.criado_em))+'</b> '+esc(e.descricao)+'</li>').join('')+'</ul></section>';
 return h+'</div></aside>';
}
function formNecessidade(ctx,c,pode,fiscal){
 const ano=state.analise.exercicio,m=c.manifestacao;
 const estado=!m?'<span class="cont-estado vazio">Ainda não informado pelo fiscal</span>':m.valor===0?'<span class="cont-estado zero">Avaliado: não precisa de complemento</span>':'<span class="cont-estado valor">Necessidade informada</span>';
 const ultimo=m?'<p class="cont-ultimo">Último registro: <b>'+esc(brl(m.valor))+'</b> por '+esc(m.por||'fiscal')+' em '+esc(quando(m.em))+'</p>':'';
 const salvo=state.salvo&&state.salvo.chave===c.chave?'<p class="cont-ok" role="status">✓ Necessidade salva: '+esc(brl(state.salvo.valor))+' · '+esc(quando(state.salvo.em))+'</p>':'';
 if(!pode)return '<span class="cont-eyebrow escuro">Saldo adicional informado pelo fiscal</span><strong>'+esc(m?brl(m.valor):'—')+'</strong>'+estado+ultimo+
  '<p class="cont-note">'+(fiscal&&ctx.preview?'Prévia de perfil: gravação bloqueada.':fiscal?'Conecte-se ao SIG institucional para registrar.':'Somente o fiscal vinculado registra este valor.')+'</p>';
 const valor=m?(m.valor/100).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}):'';
 return '<form data-form="sigContNecessidade" data-chave="'+esc(c.chave)+'" novalidate><label for="cont-valor" class="cont-label">Saldo adicional necessário até 31/12/'+ano+' — R$</label>'+
  '<p id="cont-valor-ajuda" class="cont-ajuda">Informe quanto precisa acrescentar ao saldo disponível para atender à demanda até o fim do exercício.</p>'+
  '<div class="cont-input"><span aria-hidden="true">R$</span><input id="cont-valor" name="valor" inputmode="decimal" autocomplete="off" placeholder="Valor em reais" value="'+esc(valor)+'" aria-describedby="cont-valor-ajuda cont-valor-erro"></div>'+
  '<p id="cont-valor-erro" class="cont-erro" role="alert"></p>'+
  '<div class="cont-acoes"><button type="submit" class="btn primary cont-salvar">Salvar necessidade</button>'+
  (c.reforcoTotal!==null?'<button type="button" class="btn small" data-action="sigContUsarSugestao" data-valor="'+c.reforcoTotal+'">Preencher com a sugestão</button>':'')+'</div>'+
  estado+ultimo+salvo+
  '<p class="cont-note">Vazio: ainda não avaliado · 0: avaliado, sem necessidade · valor positivo: necessidade informada. A sugestão só é registrada se você salvar. Se houver distribuição entre meses, ela é estimativa do sistema.</p></form>';
}
function trilha(ctx,c){
 const desp=c.porMes.reduce((t,p)=>t+(p.despesa||0),0);
 const dispo=state.dispo;let disp='Avaliada pela SOFI',add='Não calculado: dados insuficientes',addCls='';
 if(dispo){
  const cotas=dispo.cotas.filter(x=>x.contratos.some(y=>y.contrato===c.chave));
  const semCota=dispo.semCota.filter(x=>x.contrato===c.chave);
  if(cotas.length&&!semCota.length){disp=cotas.map(x=>brl(x.disponivel)).join(' + ')+' (cota compartilhada)';const ad=cotas.reduce((t,x)=>t+x.adicional,0);add=brl(ad);addCls=ad>0?' falta':'';}
  else if(semCota.length)disp=semCota[0].motivo;
  else if(!(c.reforcoTotal>0)&&!(c.manifestacao?.valor>0)){disp='Sem necessidade a confrontar';add=brl(0);}
 }else if(!ehGestao(ctx))disp='Consultada pela gestão (DTS-1/SOFI)';
 const passos=[['Despesa projetada',c.referencia===null?'—':brl(desp),'até 31/12, estimativa'],['Saldo utilizável dos empenhos',brl(Math.max(0,c.saldo)),'empenhos do próprio contrato'],
  ['Necessidade de empenho ou reforço',c.reforcoTotal===null?'Depende do fiscal':brl(c.reforcoTotal),'sistema'],['Disponibilidade orçamentária compatível',disp,'conferência V6, não oficial'],['Necessidade de orçamento adicional',add,'somente com dados suficientes']];
 return '<ol class="cont-trilha">'+passos.map((p,i)=>'<li'+(i===2&&c.reforcoTotal>0?' class="falta"':i===4?' class="'+addCls.trim()+'"':'')+'><span>'+esc(p[0])+'</span><b>'+esc(p[1])+'</b><small>'+esc(p[2])+'</small></li>').join('')+'</ol>';
}
function indicadores(c){
 const g0=c.grupos.filter(g=>g.referencia!==null);
 const g=g0.length===1?g0[0]:null;
 const u=c.ultimaConformidade;
 const cards=[
  ['Consumo mensal de referência',brl(c.referencia),g?ORIGEM[g.origem]||g.origem:g0.length>1?'Soma de '+g0.length+' linhas orçamentárias':'—'],
  ['Média histórica',g?brl(g.mediaHistorica):'por linha (detalhes)',g?'desde '+M.mesLabel(g.inicio)+', meses sem conformidade = 0':''],
  ['Média dos últimos 3 meses',g?brl(g.mediaRecente):'por linha (detalhes)',g&&g.serie.length>=3?M.mesLabel(g.serie[g.serie.length-3].mes)+' a '+M.mesLabel(g.serie[g.serie.length-1].mes):''],
  ['Regularidade e tendência',g?(PERIODICIDADE[g.periodicidade]||g.periodicidade):'Várias linhas',g?(g.cv!==null?'variação '+Math.round(g.cv*100)+'% · ':'')+(TENDENCIA[g.tendencia]||''):''],
  ['Última conformidade',u?brl(u.valor):'Nenhuma',u?'em '+dia(u.data)+' · data de conformidade':'no exercício'],
  ['Cobertura estimada do saldo',c.coberturaMeses===null?'—':c.coberturaMeses.toLocaleString('pt-BR',{maximumFractionDigits:1})+' mês(es)',cobreAteTexto(c)]
 ];
 return '<section class="cont-sec"><h3>Indicadores do contrato</h3><div class="cont-ind">'+cards.map(x=>'<div><span>'+esc(x[0])+'</span><b>'+esc(x[1])+'</b><small>'+esc(x[2])+'</small></div>').join('')+'</div>'+
  '<p class="cont-note">Datas de conformidade indicam quando a despesa foi conformada no sistema contábil; não equivalem à competência do serviço nem comprovam nota fiscal paga.</p></section>';
}
function detalhesCalculo(c){
 const emp=new Map((state.d.empenhos||[]).map(e=>[e.chave_empenho,e]));
 return '<details class="cont-sec cont-detalhes"><summary>Como o sistema calculou <small>linhas orçamentárias, empenhos e regras aplicadas</small></summary>'+
  c.grupos.map(g=>'<div class="cont-grupo"><div class="cont-grupo-head"><b>'+esc(g.base)+'</b> '+(g.tdco?'<span class="cont-pill amber">TDCO · UE '+esc(g.unidade)+'</span>':'<span class="cont-pill gray">UE 1250070</span>')+' <span class="cont-tag">'+esc(PERIODICIDADE[g.periodicidade]||g.periodicidade)+'</span></div>'+
   '<p>'+esc(g.explicacao)+'</p>'+(g.avisos.length?'<ul class="cont-avisos">'+g.avisos.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul>':'')+
   '<div class="cont-serie">'+g.serie.map(x=>'<span'+(x.valor===0?' class="zero"':'')+'><small>'+esc(M.mesLabel(x.mes))+'</small>'+esc(curto(x.valor))+'</span>').join('')+(g.execMesAtual?'<span class="corrente"><small>'+esc(M.mesLabel(state.analise.mesAtual))+' (parcial)</small>'+esc(curto(g.execMesAtual))+'</span>':'')+'</div>'+
   '<table class="cont-table compacta"><thead><tr><th>Fonte</th><th>Empenhos</th><th class="num">Empenhado líquido</th><th class="num">Conformado</th><th class="num">Saldo</th><th>Planilha (regra anterior)</th></tr></thead><tbody>'+
   g.fontes.map(f=>'<tr><td>'+esc(f.fonte)+'</td><td>'+esc(f.empenhos.map(k=>k.split('|').pop()+'/'+k.split('|')[0]).join(', '))+'</td><td class="num">'+esc(brl(f.empenhado))+'</td><td class="num">'+esc(brl(f.conformado))+'</td><td class="num">'+esc(brl(f.saldo))+'</td><td>'+
    esc(f.empenhos.map(k=>{const p=emp.get(k)?.planilha;return p&&p.Valor_Reforco_Ate_Fim_Exercicio!==undefined?'reforço até 31/12: '+brl(M.C(p.Valor_Reforco_Ate_Fim_Exercicio))+' ('+(p.Origem_Media_Referencia||'—')+')':'';}).filter(Boolean).join(' · ')||'—')+'</td></tr>').join('')+'</tbody></table></div>').join('')+
  '<p class="cont-note">Regras: conformidades consolidadas por mês e por linha (contrato + unidade contábil + dotação até o elemento-item), sem duplicar movimentos; meses sem conformidade dentro do período de execução contam como zero; referência = maior entre a média do exercício e a dos últimos 3 meses fechados (critério prudencial); pagamento único/anual não vira mensalidade; o mês corrente entra inteiro, pois a nota de cada mês é paga no mês seguinte. Coluna «Planilha» mostra o valor da regra anterior (CONTROLE_SERVICOS_CONTINUOS), por empenho, apenas para comparação. Motor '+esc(M.VERSAO)+' · calculado em '+esc(quando(state.calculadoEm))+'.</p></details>';
}
function blocoAtendimento(c){
 const m=c.manifestacao,at=c.atendimento;
 let h='<section class="cont-sec"><h3>Manifestação e atendimento</h3>';
 if(at)h+='<div class="cont-atend"><div><span>Solicitado (valor vigente)</span><b>'+esc(brl(at.solicitado))+'</b>'+(m.original!==null&&m.original!==at.solicitado?'<small>original: '+esc(brl(m.original))+' em '+esc(dia(m.originalEm))+'</small>':'<small>desde '+esc(dia(at.desde))+'</small>')+'</div>'+
  '<div><span>Atendido</span><b>'+esc(brl(at.atendido))+'</b><small>reforços/empenhos importados após '+esc(dia(at.desde))+'</small></div>'+
  '<div class="'+(at.pendente>0?'falta':'')+'"><span>Restante pendente</span><b>'+esc(brl(at.pendente))+'</b><small class="cont-status '+at.status+'">'+esc(({atendida:'Atendida',parcial:'Atendida parcialmente',pendente:'Pendente'})[at.status])+'</small></div></div>'+
  (at.movimentos.length?'<ul class="cont-hist">'+at.movimentos.map(x=>'<li><b>'+esc(dia(x.data))+'</b> '+esc(x.tipo==='EMPENHO_INICIAL'?'Novo empenho':x.tipo==='ANULACAO_EMPENHO'?'Anulação':'Reforço')+' '+esc(brl(x.valor))+' · empenho '+esc(x.chave.split('|').pop())+'</li>').join('')+'</ul>':'');
 h+='<h4>Histórico de manifestações</h4><ul class="cont-hist">'+m.historico.slice().reverse().map(x=>'<li><b>'+esc(quando(x.registrado_em))+'</b> '+esc(x.registrado_nome||'Fiscal')+' informou '+esc(brl(M.C(x.valor)))+(x.sugestao_sistema!==null&&x.sugestao_sistema!==undefined?' <small>(sugestão do sistema na ocasião: '+esc(brl(M.C(x.sugestao_sistema)))+')</small>':'')+'</li>').join('')+'</ul></section>';
 return h;
}

// ===== Ações =====
function parseValor(s){
 const t=String(s??'').replace(/R\$|\s/g,'').trim();
 if(!t)return null;
 if(!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+(,\d{1,2})?$|^\d+(\.\d{1,2})?$/.test(t))return NaN;
 const n=/,/.test(t)||/^\d{1,3}(\.\d{3})+$/.test(t)?Number(t.replace(/\./g,'').replace(',','.')):Number(t);
 return Number.isFinite(n)?Math.round(n*100):NaN;
}
async function submit(form,ctx){
 ctxAtual=ctx;const tipo=form.dataset.form;
 try{
  if(tipo==='sigContNecessidade')return await salvarNecessidade(form,ctx);
  if(ctx.preview)return ctx.toast('Prévia de perfil: alterações bloqueadas.');
  if(tipo==='sigContVincular'){
   const f=new FormData(form);if(!f.get('auth_id'))return ctx.toast('Selecione o usuário.');
   await ctx.rest('/rest/v1/rpc/sig_cont_vincular_fiscal','POST',{p_contrato:form.dataset.chave,p_auth_id:f.get('auth_id'),p_papel:f.get('papel')||'Fiscal',p_ativo:true});
   await load(ctx.rest,true);ctx.render();ctx.toast('Fiscal vinculado com sucesso.');
  }else if(tipo==='sigContParametros'){
   const meses=[...form.querySelectorAll('input[name="mes"]:checked')].map(i=>i.value);
   if(!meses.length)return ctx.toast('Selecione ao menos um mês.');
   await ctx.rest('/rest/v1/rpc/sig_cont_definir_parametros','POST',{p_exercicio:Number(meses[0].slice(0,4)),p_meses:meses});
   await load(ctx.rest,true);ctx.render();ctx.toast('Período de projeção salvo com sucesso.');
  }else if(tipo==='sigContContrato'){
   const f=new FormData(form);
   await ctx.rest('/rest/v1/rpc/sig_cont_atualizar_contrato','POST',{p_contrato:form.dataset.chave,p_vigencia_fim:f.get('vigencia_fim')||null,p_observacao:f.get('observacao')||''});
   await load(ctx.rest,true);ctx.render();ctx.toast('Dados do contrato salvos com sucesso.');
  }
 }catch(e){ctx.toast('Não foi possível salvar: '+(e.message||e));}
}
async function salvarNecessidade(form,ctx){
 const chave=form.dataset.chave,erro=form.querySelector('#cont-valor-erro'),input=form.querySelector('#cont-valor');
 const v=parseValor(input.value);
 const falha=msg=>{erro.textContent=msg;input.setAttribute('aria-invalid','true');input.focus();};
 if(v===null)return falha('Informe um valor. Use 0 se, após avaliar a demanda, não precisar de complemento.');
 if(Number.isNaN(v)||v<0)return falha('Valor inválido. Use o formato 12.345,67.');
 if(v>=100000000000)return falha('Valor acima do limite permitido.');
 if(!podeRegistrar(ctx,chave))return falha('Somente o fiscal vinculado pode registrar este valor.');
 const c=state.analise.contratos.find(x=>x.chave===chave);
 const btn=form.querySelector('.cont-salvar');btn.disabled=true;btn.textContent='Salvando…';
 try{
  const em=new Date().toISOString();
  if(state.demo){
   const atual=c.manifestacao?.valor;
   if(atual!==v){state.d.manifestacoes.push({id:'dm'+Date.now(),exercicio:state.analise.exercicio,contrato_chave:chave,valor:v/100,sugestao_sistema:c.reforcoTotal===null?null:c.reforcoTotal/100,registrado_por:ctx.authId,registrado_nome:ctx.profile?.nome||'Fiscal',registrado_em:em});
    try{localStorage.setItem(DEMO_KEY,JSON.stringify(state.d.manifestacoes));}catch{}}
  }else{
   const r=await ctx.rest('/rest/v1/rpc/sig_cont_registrar_necessidade','POST',{p_contrato:chave,p_valor:v/100,p_sugestao:c.reforcoTotal===null?null:c.reforcoTotal/100,p_versao:M.VERSAO,p_exercicio:state.analise.exercicio});
   if(r?.sem_alteracao){btn.disabled=false;btn.textContent='Salvar necessidade';state.salvo={chave,valor:v,em:c.manifestacao?.em||em};ctx.render();return ctx.toast('Valor igual ao último registro: nada a alterar.');}
   await load(ctx.rest,true);
  }
  analisar();state.salvo={chave,valor:v,em};ctx.render();
  ctx.toast('Necessidade salva com sucesso: '+brl(v)+'.');
 }catch(e){btn.disabled=false;btn.textContent='Salvar necessidade';falha('Não foi possível salvar: '+(e.message||e));}
}
async function click(action,btn,ctx){
 ctxAtual=ctx;
 switch(action){
  case 'sigContAba':state.tab=btn.dataset.tab;state.aberto=null;ctx.render();break;
  case 'sigContFiltro':state.filtro=btn.dataset.filtro;ctx.render();break;
  case 'sigContAbrir':state.aberto=btn.dataset.chave;state.salvo=null;state.focoPainel=true;state.origemFoco=btn.dataset.chave;ctx.render();break;
  case 'sigContFechar':fechar();break;
  case 'sigContUsarSugestao':{const i=document.getElementById('cont-valor');if(i){i.value=(Number(btn.dataset.valor)/100).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});i.focus();}ctx.toast('Valor preenchido com a sugestão. Revise e clique em «Salvar necessidade» para registrar.');break;}
  case 'sigContRecarregar':if(ctx.demo){carregarDemo();ctx.render();break;}state.loaded=false;ctx.render();await load(ctx.rest,true);ctx.render();if(!state.error)ctx.toast('Análise atualizada.');break;
  case 'sigContCSV':exportarCSV();break;
  case 'sigContImprimir':document.body.classList.add('cont-print');window.print();setTimeout(()=>document.body.classList.remove('cont-print'),500);break;
  case 'sigContDesvincular':
   if(ctx.preview)return ctx.toast('Prévia de perfil: alterações bloqueadas.');
   if(!confirm('Desvincular este fiscal do contrato? O histórico de manifestações é preservado.'))return;
   try{await ctx.rest('/rest/v1/rpc/sig_cont_vincular_fiscal','POST',{p_contrato:btn.dataset.chave,p_auth_id:btn.dataset.auth,p_ativo:false});await load(ctx.rest,true);ctx.render();ctx.toast('Fiscal desvinculado com sucesso.');}
   catch(e){ctx.toast('Não foi possível desvincular: '+(e.message||e));}
   break;
 }
}
function fechar(){
 const k=state.aberto;state.aberto=null;state.salvo=null;ctxAtual?.render();
 const b=[...document.querySelectorAll('[data-action="sigContAbrir"]')].find(x=>x.dataset.chave===k);b?.focus();
}
function afterRender(){
 document.body.classList.toggle('cont-drawer-open',!!state.aberto&&!!document.querySelector('.cont-drawer'));
 if(state.focoPainel){state.focoPainel=false;document.getElementById('cont-drawer-title')?.focus();}
 document.querySelectorAll('.cont-chart').forEach(ligarGrafico);
}
function ligarGrafico(fig){
 if(fig.dataset.ligado)return;fig.dataset.ligado='1';
 let s;try{s=JSON.parse(fig.dataset.serie);}catch{return;}
 const tip=fig.querySelector('.cont-tip'),box=fig.querySelector('.cont-chart-box');
 const mostrar=(el)=>{
  const x=s[Number(el.dataset.i)];if(!x)return;
  tip.replaceChildren();
  const h=document.createElement('strong');h.textContent=x.m+(x.t==='real'?' · realizado':x.t==='corrente'?' · mês corrente':' · projeção');tip.appendChild(h);
  const linha=(rot,val,cls)=>{const d=document.createElement('div');const i=document.createElement('i');i.className=cls;const b=document.createElement('b');b.textContent=M.brl(val);const sp=document.createElement('span');sp.textContent=rot;d.append(i,b,sp);tip.appendChild(d);};
  if(x.r)linha('executado (conformidade)',x.r,'lg-real');
  if(x.c)linha('estimado, coberto pelo saldo',x.c,'lg-est');
  if(x.f)linha('reforço estimado',x.f,'lg-falta');
  if(x.s!==null&&x.s!==undefined)linha(x.t==='real'?'saldo ao fim do mês':'saldo utilizável projetado',x.s,'lg-saldo');
  tip.hidden=false;
  const r=el.getBoundingClientRect(),bb=box.getBoundingClientRect();
  let left=r.left-bb.left+r.width/2+12;if(left+230>bb.width)left=r.left-bb.left+r.width/2-242;
  tip.style.left=Math.max(4,left)+'px';tip.style.top='8px';
  fig.querySelectorAll('.hit.on').forEach(e=>e.classList.remove('on'));el.classList.add('on');
 };
 fig.querySelectorAll('.hit').forEach(el=>{el.addEventListener('pointerenter',()=>mostrar(el));el.addEventListener('focus',()=>mostrar(el));});
 box.addEventListener('pointerleave',()=>{tip.hidden=true;fig.querySelectorAll('.hit.on').forEach(e=>e.classList.remove('on'));});
 fig.addEventListener('focusout',e=>{if(!fig.contains(e.relatedTarget)){tip.hidden=true;}});
}
function input(id,valor){if(id==='sig-cont-busca'){state.busca=String(valor||'').slice(0,100);return true;}return false;}
function exportarCSV(){
 const a=state.analise;if(!a)return;
 const linhas=[['Contrato','Fornecedor','CNPJ','Processos','Situação','Confiança','Consumo mensal de referência','Saldo nos empenhos',
  ...a.mesesProjecao.map(m=>'Despesa projetada '+M.mesLabel(m)),...a.mesesProjecao.map(m=>'Reforço sistema '+M.mesLabel(m)),'Reforço sistema até 31/12',
  'Manifestação do fiscal','Data da manifestação','Valor original solicitado','Atendido (reforços importados)','Pendente','Status atendimento','Origem no planejamento','Valor no planejamento','Explicação']];
 const n=c=>c===null||c===undefined?'':(c/100).toFixed(2).replace('.',',');
 for(const c of a.contratos.filter(x=>x.ativo!==false)){
  const plan=c.manifestacao?(c.atendimento?c.atendimento.pendente:c.manifestacao.valor):(c.reforcoTotal||0);
  linhas.push([c.titulo,c.fornecedor,c.cnpj,c.processos.join(' | '),c.situacao.texto,CONFIANCA[c.confianca]||'',n(c.referencia),n(c.saldo),
   ...a.mesesProjecao.map(m=>n(c.porMes.find(p=>p.mes===m)?.despesa)),...a.mesesProjecao.map(m=>n(c.porMes.find(p=>p.mes===m)?.reforco)),n(c.reforcoTotal),
   c.manifestacao?n(c.manifestacao.valor):'',c.manifestacao?quando(c.manifestacao.em):'',c.manifestacao?n(c.manifestacao.original):'',
   c.atendimento?n(c.atendimento.atendido):'',c.atendimento?n(c.atendimento.pendente):'',c.atendimento?c.atendimento.status:'',
   c.manifestacao?'Fiscal':'Sistema (sem manifestação)',n(plan),c.grupos.map(g=>g.explicacao).join(' / ')]);
 }
 const csv='﻿'+linhas.map(l=>l.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(';')).join('\r\n');
 const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
 const el=document.createElement('a');el.href=url;el.download='contratos_continuados_'+a.hoje+'.csv';document.body.appendChild(el);el.click();el.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
// Esc fecha o painel; foco retorna ao cartão de origem.
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&state.aberto&&document.querySelector('.cont-drawer')){e.preventDefault();fechar();}});
// Atualização automática: relê o retrato a cada 5 minutos enquanto a página estiver aberta.
if(typeof setInterval==='function')setInterval(async()=>{
 if(!ctxAtual||!ctxAtual.online||state.demo||state.loading||!document.querySelector('.cont-page')||document.querySelector('.cont-drawer form :focus'))return;
 const antes=state.d.sync?.id;await load(ctxAtual.rest,true);
 if(document.querySelector('.cont-page')&&!document.querySelector('.cont-drawer form :focus'))ctxAtual.render();
 if(state.d.sync?.id!==antes&&antes!==undefined)ctxAtual.toast('Nova importação da planilha: análise atualizada.');
},300000);

// _reanalisar: usado pelos testes de interface para recalcular após injetar dados.
window.SIG_CONT={syncIdentity,isLoaded,load,view,click,submit,input,afterRender,parseValor,_state:state,_reanalisar:analisar};
})();
