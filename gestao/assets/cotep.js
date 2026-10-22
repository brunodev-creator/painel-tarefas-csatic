/* SIG CSA-TIC — Intenções de COTEP: limite anual por elemento-item (critério operacional PMMG).
 * O banco (RPC sig_cotep_acao + gatilhos) é a autoridade: este módulo apenas exibe, simula e envia.
 * Valores em centavos inteiros para não acumular erro de ponto flutuante. */
(()=>{
'use strict';

// ===== Motor de cálculo (puro; também usado nos testes Node e no modo demonstração) =====
const CENT=v=>Math.round((Number(v)||0)*100);
const SIT_CONSUMO=['Finalizada','Realizada (a conferir)'];
const SIT_COTEP=['Em andamento','Finalizada','Realizada (a conferir)','Fracassada','Deserta','Cancelada'];
const INT_ABERTAS=['Pendente','Devolvida','Reservada'];
const PRIORIDADES=['Alta','Média','Baixa'];
const ALERTA_ELEVADO=80;
function contribItem(item,situacao){
 if(item.ativo===false)return 0;
 if(situacao==='Em andamento')return CENT(item.valor_estimado);
 if(SIT_CONSUMO.includes(situacao))return CENT(item.valor_homologado??item.valor_estimado);
 return 0;
}
function limiteDe(d,ano,ug){return (d.limites||[]).find(l=>Number(l.ano)===Number(ano)&&l.unidade_gestora===ug)||null;}
function alertaDe(r){
 if(r.limite===null)return {nivel:'sem-limite',texto:'Limite não configurado'};
 if(r.saldo<0)return {nivel:'excedido',texto:'Limite excedido'};
 if(r.saldo===0)return {nivel:'atingido',texto:'Limite atingido'};
 if(r.pendentes_valor>r.saldo)return {nivel:'insuficiente',texto:'Saldo insuficiente para as intenções pendentes'};
 if(r.percentual>=ALERTA_ELEVADO)return {nivel:'elevado',texto:'Utilização elevada'};
 return {nivel:'ok',texto:'Dentro do limite'};
}
const SEVERIDADE={excedido:0,atingido:1,insuficiente:2,elevado:3,'sem-limite':4,ok:5};
function calcular(d,ano,ug){
 const lim=limiteDe(d,ano,ug),limite=lim?CENT(lim.valor_limite):null;
 const coteps=new Map((d.coteps||[]).map(c=>[c.id,c]));
 const desc=new Map((d.elementos||[]).map(e=>[e.codigo,e.descricao||'']));
 const map=new Map();
 const linha=code=>{
  if(!map.has(code))map.set(code,{codigo:code,descricao:desc.get(code)||'',limite,consumido:0,comprometido_coteps:0,reservado:0,pendentes_qtd:0,pendentes_valor:0,a_conferir:0,coteps:[],intencoes:[]});
  return map.get(code);
 };
 for(const it of d.procedimentos||[]){
  if(Number(it.ano)!==Number(ano)||it.unidade_gestora!==ug||!it.elemento_item)continue;
  const c=coteps.get(it.cotep_id)||{numero:it.numero,situacao:it.situacao,objeto:it.objeto,id:it.cotep_id};
  const r=linha(it.elemento_item),v=contribItem(it,c.situacao);
  if(SIT_CONSUMO.includes(c.situacao))r.consumido+=v;else if(c.situacao==='Em andamento')r.comprometido_coteps+=v;
  if(it.ativo!==false){
   r.coteps.push({cotep:c,item:it,valor:v});
   if(c.situacao==='Realizada (a conferir)')r.a_conferir++;
  }
 }
 for(const i of d.intencoes||[]){
  if(Number(i.ano)!==Number(ano)||i.unidade_gestora!==ug)continue;
  const r=linha(i.elemento_item);r.intencoes.push(i);
  if(i.situacao==='Reservada')r.reservado+=CENT(i.valor_reservado);
  if(i.situacao==='Pendente'||i.situacao==='Devolvida'){r.pendentes_qtd++;r.pendentes_valor+=CENT(i.valor_estimado);}
 }
 const itens=[...map.values()].map(r=>{
  r.comprometido=r.comprometido_coteps+r.reservado;
  r.ocupado=r.consumido+r.comprometido;
  r.saldo=limite===null?null:limite-r.ocupado;
  r.percentual=limite?Math.round(r.ocupado*10000/limite)/100:0;
  r.alerta=alertaDe(r);
  return r;
 }).sort((a,b)=>SEVERIDADE[a.alerta.nivel]-SEVERIDADE[b.alerta.nivel]||b.percentual-a.percentual||a.codigo.localeCompare(b.codigo));
 return {limite:lim,itens,porCodigo:new Map(itens.map(r=>[r.codigo,r]))};
}
// Saldo disponível para um item de COTEP, desconsiderando o que essa própria COTEP já ocupa.
function saldoSemCotep(d,ano,ug,codigo,cotepId){
 const r=calcular(d,ano,ug).porCodigo.get(codigo);const lim=limiteDe(d,ano,ug);
 if(!lim)return null;
 if(!r)return CENT(lim.valor_limite);
 const proprio=r.coteps.filter(x=>cotepId&&x.cotep.id===cotepId).reduce((s,x)=>s+x.valor,0);
 return r.saldo+proprio;
}
const CALC={CENT,contribItem,calcular,saldoSemCotep,alertaDe,SIT_CONSUMO,ALERTA_ELEVADO};

// ===== Utilidades de apresentação =====
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const BRL=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});
const moneyC=c=>c===null||c===undefined?'—':BRL.format(c/100);
const money=v=>v===null||v===undefined||v===''?'—':BRL.format(Number(v)||0);
const pct=v=>(Number(v)||0).toLocaleString('pt-BR',{maximumFractionDigits:1})+'%';
const dia=v=>v?new Date(String(v).slice(0,10)+'T12:00:00').toLocaleDateString('pt-BR'):'—';
const quando=v=>v?new Date(v).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}):'';
const plain=v=>String(v??'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
const parseValor=v=>{const s=String(v??'').trim();if(!s)return NaN;return Number(/,/.test(s)?s.replace(/\./g,'').replace(',','.'):s);};
const anoAtual=()=>Number(new Date().toLocaleString('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric'}));
const ALERTA_FLAG={excedido:'red',atingido:'red',insuficiente:'amber',elevado:'amber','sem-limite':'gray',ok:'teal'};
const SIT_FLAG={Pendente:'amber',Devolvida:'gray',Reservada:'blue','Em COTEP':'teal',Finalizada:'teal',Rejeitada:'red',Cancelada:'gray',
 'Em andamento':'blue','Realizada (a conferir)':'amber',Fracassada:'red',Deserta:'red'};
const flag=(t,cor)=>'<span class="flag '+(cor||SIT_FLAG[t]||'gray')+'">'+esc(t)+'</span>';
const PRI_ORD={Alta:0,'Média':1,Baixa:2};

// ===== Estado =====
const TABELAS=['sig_cotep_limites','sig_cotep_elementos','sig_cotep_centros','sig_cotep_coteps','sig_cotep_procedimentos','sig_cotep_intencoes','sig_cotep_eventos','sig_cotep_gestores','sig_cotep_saldos'];
const CHAVES=['limites','elementos','centros','coteps','procedimentos','intencoes','eventos','gestores','saldos'];
const vazio=()=>Object.fromEntries(CHAVES.map(k=>[k,[]]));
const state={identity:null,loaded:false,loading:false,error:'',d:vazio(),ano:anoAtual(),tab:'elementos',busca:'',filtro:'todos',filaFiltro:'abertas',sel:new Set(),demo:null,
 visitante:false,precisaCodigo:false,acesso:null};
// Visitante: código da DTS-1 dura a sessão do navegador; intenções enviadas ficam lembradas neste aparelho.
const VIS_CODIGO='sig-cotep-codigo',VIS_MINHAS='sig-cotep-minhas',VIS_SOLICITANTE='sig-cotep-solicitante';
const lerJson=(store,k,def)=>{try{return JSON.parse(store.getItem(k))??def;}catch{return def;}};
const gravar=(store,k,v)=>{try{v==null?store.removeItem(k):store.setItem(k,JSON.stringify(v));}catch{}};
const minhasVisitante=()=>new Set(lerJson(localStorage,VIS_MINHAS,[]));
let ctxAtual=null;
function syncIdentity(id){if(state.identity!==id){state.identity=id;state.loaded=false;state.loading=false;state.error='';state.d=vazio();state.sel.clear();}}
async function loadVisitante(rest){
 const st=await rest('/rest/v1/rpc/sig_cotep_publico_status','POST',{});
 if(!st?.ativo)throw Error('O acesso de visitante às Intenções de COTEP está desativado pela DTS-1.');
 const codigo=lerJson(sessionStorage,VIS_CODIGO,null);
 if(st.exige_codigo&&!codigo){state.precisaCodigo=true;state.loaded=true;return;}
 try{
  const d=await rest('/rest/v1/rpc/sig_cotep_publico_dados','POST',{p_codigo:codigo||null});
  state.d={...vazio(),...Object.fromEntries(CHAVES.map(k=>[k,Array.isArray(d?.[k])?d[k]:[]]))};
  state.precisaCodigo=false;state.loaded=true;
 }catch(e){
  if(/código de acesso/i.test(e.message||'')){gravar(sessionStorage,VIS_CODIGO,null);state.precisaCodigo=true;state.loaded=true;state.erroCodigo=e.message;return;}
  throw e;
 }
}
async function load(rest,force=false,opts={}){
 if(!state.identity||state.loading||(state.loaded&&!force))return;
 state.loading=true;state.error='';state.visitante=!!opts.visitante;
 try{
  if(state.visitante){await loadVisitante(rest);return;}
  const q={sig_cotep_eventos:'?select=*&order=criado_em.desc&limit=2000',sig_cotep_intencoes:'?select=*&order=criado_em.desc&limit=5000'};
  const rows=await Promise.all(TABELAS.map(t=>rest('/rest/v1/'+t+(q[t]||'?select=*&limit=5000'))));
  state.d=Object.fromEntries(CHAVES.map((k,i)=>[k,Array.isArray(rows[i])?rows[i]:[]]));
  // Situação do acesso de visitante (o código nunca é lido; só se é exigido).
  state.acesso=await rest('/rest/v1/rpc/sig_cotep_publico_status','POST',{}).catch(()=>null);
  if(state.acesso)state.acesso.limite_por_hora=(await rest('/rest/v1/sig_cotep_acesso_publico?select=limite_por_hora').catch(()=>[]))?.[0]?.limite_por_hora;
  state.loaded=true;
 }catch(e){
  state.error=/sig_cotep_(limites|saldos|coteps)/.test(e.message||'')?'A atualização do banco (migration 20261021_sig_cotep_v2_elemento_item.sql) ainda não foi aplicada. Detalhe: '+e.message:(e.message||String(e));
  state.loaded=false;
 }finally{state.loading=false;}
}
const isLoaded=()=>state.loaded||!!state.error;
const dados=()=>state.demo||state.d;
function ugPadrao(){
 const d=dados();const l=(d.limites||[]).filter(x=>Number(x.ano)===Number(state.ano));
 return (l.find(x=>x.padrao)||l[0]||{}).unidade_gestora||'';
}
function gestor(ctx){if(ctx.visitante)return false;return !!ctx.admin||ctx.role==='dts1'||dados().gestores.some(g=>g.auth_id===ctx.authId&&g.ativo);}
function nomeUsuario(ctx,id){const u=(ctx.users||[]).find(x=>x.auth_id===id);return u?u.nome:'';}

// ===== Modo demonstração (dados fictícios em memória, mesmas regras do banco) =====
function demoSeed(){
 const ano=anoAtual(),ug='1250071',t=new Date().toISOString();
 const id=()=>globalThis.crypto?.randomUUID?.()||('d'+Math.random().toString(16).slice(2));
 const cot=(numero,objeto,situacao,itens)=>{const c={id:id(),ano,unidade_gestora:ug,numero,objeto,situacao,documento:'Demonstração',atualizado_em:t,criado_em:t};
  return [c,itens.map(([el,est,hom])=>({id:id(),cotep_id:c.id,ano,unidade_gestora:ug,numero,objeto,situacao,elemento_item:el,valor_estimado:est,valor_homologado:hom??null,ativo:true}))];};
 const lista=[cot('D-11/'+ano,'Suprimentos de impressão (fictício)','Finalizada',[['3016',31000,30250.5]]),
  cot('D-17/'+ano,'Material de expediente (fictício)','Realizada (a conferir)',[['3016',19800]]),
  cot('D-22/'+ano,'Periféricos e acessórios (fictício)','Em andamento',[['3016',6500],['5207',12000]]),
  cot('D-25/'+ano,'Equipamentos de informática (fictício)','Finalizada',[['5207',48900,47100]]),
  cot('D-29/'+ano,'Reparo de nobreaks (fictício)','Deserta',[['3921',9000]]),
  cot('D-31/'+ano,'Ferramentas de manutenção (fictício)','Finalizada',[['3024',12500,11980]])];
 const intencao=(centro,el,valor,objeto,situacao,prioridade,extra={})=>({id:id(),ano,unidade_gestora:ug,centro,elemento_item:el,valor_estimado:valor,valor_reservado:situacao==='Reservada'?valor:0,
  objeto,justificativa:'Demanda fictícia para demonstração',situacao,prioridade,criado_por:'demo-centro',criado_em:t,atualizado_em:t,...extra});
 return {limites:[{ano,unidade_gestora:ug,valor_limite:65492.11,base_normativa:'Critério operacional PMMG (demonstração)',validacao_juridica:'Pendente',padrao:true}],
  elementos:[{codigo:'3016',descricao:null,ativo:true},{codigo:'3024',descricao:null,ativo:true},{codigo:'3921',descricao:'Reparos de equipamentos, instalações e material permanente',ativo:true},{codigo:'5207',descricao:'Equipamentos de informática',ativo:true}],
  centros:[{id:'c1',nome:'Centro de Videomonitoramento (fictício)',ativo:true},{id:'c2',nome:'Centro de Telecomunicações (fictício)',ativo:true}],
  coteps:lista.map(x=>x[0]),procedimentos:lista.flatMap(x=>x[1]),
  intencoes:[intencao('Centro de Videomonitoramento (fictício)','3016',4200,'Cartuchos para impressoras do centro','Pendente','Alta'),
   intencao('Centro de Telecomunicações (fictício)','5207',3500,'Switches de borda para salas técnicas','Pendente','Média'),
   intencao('Centro de Telecomunicações (fictício)','3921',2800,'Manutenção de rádios base','Reservada','Média')],
  eventos:[],gestores:[],saldos:[]};
}
function demoAcao(p,ctx){
 const d=state.demo,agora=new Date().toISOString(),uid=ctx.authId;
 const ev=(tipo,descricao,extra={})=>d.eventos.unshift({id:Date.now()+Math.random(),tipo,descricao,autor:uid,criado_em:agora,...extra});
 const verificar=(ano,ug,el)=>{const r=calcular(d,ano,ug).porCodigo.get(el);if(r&&r.saldo<0)throw Error('Saldo insuficiente no elemento-item '+el+': excedente '+moneyC(-r.saldo)+'.');};
 const comRollback=fn=>{const copia=JSON.parse(JSON.stringify(d));try{return fn();}catch(e){Object.assign(d,copia);throw e;}};
 const intencao=id=>{const i=d.intencoes.find(x=>x.id===id);if(!i)throw Error('Intenção não localizada');return i;};
 const valor=v=>{const n=parseValor(v);return Number.isFinite(n)?Math.round(n*100)/100:null;};
 const ac=p.acao;
 return comRollback(()=>{
  if(ac==='criar_intencao'||ac==='editar_intencao'){
   const i=ac==='editar_intencao'?intencao(p.id):{id:globalThis.crypto?.randomUUID?.()||String(Date.now()),ano:state.ano,unidade_gestora:ugPadrao(),criado_por:uid,criado_em:agora,valor_reservado:0};
   if(ac==='editar_intencao'&&!['Pendente','Devolvida'].includes(i.situacao))throw Error('Somente intenções pendentes ou devolvidas podem ser editadas');
   const v=valor(p.valor_estimado);
   if(!/^\d{4}$/.test(p.elemento_item||''))throw Error('Informe o elemento-item com 4 dígitos (ex.: 3016)');
   if(!(v>0))throw Error('Informe o valor estimado');
   if(String(p.objeto||'').trim().length<8)throw Error('Descreva o objeto (mínimo 8 caracteres)');
   if(String(p.justificativa||'').trim().length<10)throw Error('Informe a justificativa (mínimo 10 caracteres)');
   if(String(p.centro||'').trim().length<2)throw Error('Informe o centro solicitante');
   Object.assign(i,{centro:p.centro.trim(),objeto:p.objeto.trim(),elemento_item:p.elemento_item,valor_estimado:v,justificativa:p.justificativa.trim(),prioridade:p.prioridade||'Média',situacao:'Pendente',atualizado_em:agora});
   if(!d.elementos.some(e=>e.codigo===i.elemento_item))d.elementos.push({codigo:i.elemento_item,descricao:null,ativo:true});
   if(!d.centros.some(c=>plain(c.nome)===plain(i.centro)))d.centros.push({id:String(Date.now()),nome:i.centro,ativo:true});
   if(ac==='criar_intencao')d.intencoes.unshift(i);
   ev(ac==='criar_intencao'?'Intenção':'Edição','Intenção registrada por '+i.centro,{intencao_id:i.id,elemento_item:i.elemento_item,valor:v});
   return {ok:true,id:i.id};
  }
  if(ac==='cancelar_intencao'){const i=intencao(p.id);i.situacao='Cancelada';i.valor_reservado=0;ev('Cancelada',p.motivo||'Intenção cancelada',{intencao_id:i.id,elemento_item:i.elemento_item});return {ok:true};}
  if(ac==='reservar'){
   const i=intencao(p.id);if(!['Pendente','Reservada'].includes(i.situacao))throw Error('Só é possível reservar intenção pendente');
   const v=valor(p.valor)??Number(i.valor_estimado);if(!(v>0)||v>Number(i.valor_estimado))throw Error('A reserva deve ser maior que zero e até o valor estimado');
   i.situacao='Reservada';i.valor_reservado=v;verificar(i.ano,i.unidade_gestora,i.elemento_item);
   ev('Reserva','Reserva de '+money(v)+' aprovada',{intencao_id:i.id,elemento_item:i.elemento_item,valor:v});return {ok:true};
  }
  if(['liberar_reserva','devolver','rejeitar'].includes(ac)){
   const i=intencao(p.id);if(ac!=='liberar_reserva'&&String(p.motivo||'').trim().length<5)throw Error('Informe o motivo para o centro solicitante');
   i.situacao={liberar_reserva:'Pendente',devolver:'Devolvida',rejeitar:'Rejeitada'}[ac];i.valor_reservado=0;i.observacao_gestor=p.motivo||i.observacao_gestor;
   ev(ac==='liberar_reserva'?'Liberação':i.situacao,p.motivo||'Reserva liberada',{intencao_id:i.id,elemento_item:i.elemento_item});return {ok:true};
  }
  if(ac==='priorizar'||ac==='agrupar'){
   for(const id of p.ids||[p.id]){const i=intencao(id);if(p.prioridade)i.prioridade=p.prioridade;if('grupo' in p)i.grupo=p.grupo||null;ev(ac==='agrupar'?'Agrupamento':'Priorização',p.grupo?'Grupo '+p.grupo:'Prioridade '+p.prioridade,{intencao_id:i.id,elemento_item:i.elemento_item});}
   return {ok:true};
  }
  if(ac==='converter_cotep'){
   const ints=(p.ids||[]).map(intencao);if(!ints.length)throw Error('Selecione as intenções que formarão a COTEP');
   if(ints.some(i=>!['Pendente','Reservada'].includes(i.situacao)))throw Error('Somente intenções pendentes ou reservadas podem formar uma COTEP');
   if(!String(p.numero||'').trim())throw Error('Informe o número da COTEP');
   let c=d.coteps.find(x=>Number(x.ano)===Number(ints[0].ano)&&x.numero===p.numero.trim());
   if(c&&c.situacao!=='Em andamento')throw Error('A COTEP já está encerrada');
   if(!c){c={id:String(Date.now()),ano:ints[0].ano,unidade_gestora:ints[0].unidade_gestora,numero:p.numero.trim(),objeto:p.objeto||ints.map(i=>i.objeto).join('; '),situacao:'Em andamento',criado_em:agora};d.coteps.unshift(c);}
   for(const el of [...new Set(ints.map(i=>i.elemento_item))].sort()){
    let soma=0;for(const i of ints.filter(i=>i.elemento_item===el)){soma+=i.situacao==='Reservada'?Number(i.valor_reservado):Number(i.valor_estimado);Object.assign(i,{situacao:'Em COTEP',valor_reservado:0,cotep_id:c.id,cotep_numero:c.numero});ev('Em COTEP','Vinculada à COTEP '+c.numero,{intencao_id:i.id,elemento_item:el});}
    const it=d.procedimentos.find(x=>x.cotep_id===c.id&&x.elemento_item===el);
    if(it){it.valor_estimado=(it.ativo?Number(it.valor_estimado):0)+soma;it.ativo=true;}
    else d.procedimentos.push({id:String(Date.now())+el,cotep_id:c.id,ano:c.ano,unidade_gestora:c.unidade_gestora,numero:c.numero,objeto:c.objeto,situacao:c.situacao,elemento_item:el,valor_estimado:soma,valor_homologado:null,ativo:true});
    verificar(c.ano,c.unidade_gestora,el);
   }
   return {ok:true,cotep_id:c.id};
  }
  if(ac==='salvar_cotep'){
   if(!SIT_COTEP.includes(p.situacao)||String(p.objeto||'').trim().length<8||!String(p.numero||'').trim())throw Error('Revise número, objeto (mín. 8 caracteres) e situação da COTEP');
   const itens=p.itens||[];const vistos=new Set();
   for(const x of itens){if(x.elemento_item&&!/^\d{4}$/.test(x.elemento_item))throw Error('Elemento-item inválido: '+x.elemento_item);if(vistos.has(x.elemento_item))throw Error('Elemento-item '+x.elemento_item+' repetido na COTEP');vistos.add(x.elemento_item);
    if(p.situacao==='Finalizada'&&x.ativo!==false&&(x.valor_homologado===''||x.valor_homologado==null))throw Error('Para finalizar, informe o valor homologado/negociado de cada elemento-item');}
   if(!['Fracassada','Deserta','Cancelada'].includes(p.situacao)&&!itens.some(x=>x.elemento_item&&x.ativo!==false))throw Error('Informe ao menos um elemento-item com valor');
   let c=p.id?d.coteps.find(x=>x.id===p.id):null;
   if(!c){if(d.coteps.some(x=>Number(x.ano)===Number(p.ano)&&x.numero===p.numero.trim()))throw Error('A COTEP '+p.numero+' já está cadastrada; abra-a para editar');c={id:String(Date.now()),criado_em:agora};d.coteps.unshift(c);}
   const antes=calcular(d,p.ano,p.unidade_gestora);
   Object.assign(c,{ano:Number(p.ano),unidade_gestora:p.unidade_gestora,numero:p.numero.trim(),objeto:p.objeto.trim(),situacao:p.situacao,documento:p.documento||'',processo_id:p.processo_id||null,atualizado_em:agora});
   for(const it of d.procedimentos.filter(x=>x.cotep_id===c.id))if(!vistos.has(it.elemento_item))it.ativo=false;
   for(const x of itens){let it=d.procedimentos.find(y=>y.cotep_id===c.id&&y.elemento_item===(x.elemento_item||null));
    if(!it){it={id:String(Date.now())+x.elemento_item,cotep_id:c.id};d.procedimentos.push(it);}
    Object.assign(it,{ano:c.ano,unidade_gestora:c.unidade_gestora,numero:c.numero,objeto:c.objeto,situacao:c.situacao,elemento_item:x.elemento_item||null,valor_estimado:valor(x.valor_estimado)||0,valor_homologado:valor(x.valor_homologado),ativo:x.ativo!==false});}
   for(const i of d.intencoes.filter(i=>i.cotep_id===c.id)){
    if(c.situacao==='Em andamento'&&i.situacao==='Finalizada')i.situacao='Em COTEP';
    else if(SIT_CONSUMO.includes(c.situacao)&&i.situacao==='Em COTEP')i.situacao='Finalizada';
    else if(['Fracassada','Deserta','Cancelada'].includes(c.situacao)){i.situacao='Pendente';i.cotep_id=null;}
   }
   const depois=calcular(d,c.ano,c.unidade_gestora);let liberado=0;
   for(const el of vistos){if(!el)continue;const a=antes.porCodigo.get(el),b=depois.porCodigo.get(el);
    if(b&&a&&b.ocupado>a.ocupado)verificar(c.ano,c.unidade_gestora,el);else if(b&&!a)verificar(c.ano,c.unidade_gestora,el);
    if(a&&b&&a.ocupado>b.ocupado)liberado+=a.ocupado-b.ocupado;}
   ev('COTEP','COTEP '+c.numero+' · '+c.situacao+(liberado?' · liberado '+moneyC(liberado):''),{cotep_id:c.id});
   return {ok:true,id:c.id,liberado:liberado/100};
  }
  if(ac==='limite'){const l=limiteDe(d,p.ano,p.unidade_gestora)||(d.limites.push({ano:Number(p.ano),unidade_gestora:p.unidade_gestora}),d.limites[d.limites.length-1]);
   Object.assign(l,{valor_limite:valor(p.valor_limite),base_normativa:p.base_normativa,validacao_juridica:p.validacao_juridica||'Pendente',documento_validacao:p.documento_validacao,padrao:true});return {ok:true};}
  if(ac==='elemento'){const e=d.elementos.find(x=>x.codigo===p.codigo);if(e)Object.assign(e,{descricao:p.descricao||null,ativo:p.ativo!==false&&p.ativo!=='false'});else d.elementos.push({codigo:p.codigo,descricao:p.descricao||null,ativo:true});return {ok:true};}
  if(ac==='centro'){const c=d.centros.find(x=>x.id===p.id||plain(x.nome)===plain(p.nome));if(c)Object.assign(c,{nome:p.nome,ativo:p.ativo!==false&&p.ativo!=='false'});else d.centros.push({id:String(Date.now()),nome:p.nome,ativo:true});return {ok:true};}
  throw Error('Ação indisponível na demonstração');
 });
}

// ===== Componentes =====
function barra(r){
 if(r.limite===null||!r.limite)return '<div class="cotep-bar" aria-hidden="true"></div>';
 const w=v=>Math.max(0,Math.min(100,v*100/r.limite));
 const c=w(r.consumido),m=Math.min(w(r.comprometido),100-c),p=Math.min(w(r.pendentes_valor),Math.max(0,100-c-m));
 return '<div class="cotep-bar" role="img" aria-label="'+esc('Consumido '+moneyC(r.consumido)+', comprometido '+moneyC(r.comprometido)+', pendente '+moneyC(r.pendentes_valor)+' de '+moneyC(r.limite))+'">'+
  '<span class="seg consumido" style="width:'+c+'%"></span><span class="seg comprometido" style="width:'+m+'%"></span><span class="seg pendente" style="width:'+p+'%"></span></div>';
}
function legenda(){return '<div class="cotep-legend" aria-hidden="true"><span><i class="consumido"></i>Consumido</span><span><i class="comprometido"></i>Comprometido</span><span><i class="pendente"></i>Pendente (não abate)</span><span><i class="livre"></i>Saldo</span></div>';}
function cartao(r){
 const desc=r.descricao||'Descrição a cadastrar pela DTS-1';
 return '<button type="button" class="cotep-card nivel-'+r.alerta.nivel+'" data-action="cotepElemento" data-el="'+esc(r.codigo)+'" aria-label="'+esc('Elemento-item '+r.codigo+': saldo '+moneyC(r.saldo)+', '+r.alerta.texto)+'">'+
  '<span class="cotep-card-top"><strong class="cotep-code">'+esc(r.codigo)+'</strong>'+(r.alerta.nivel==='ok'?'':flag(r.alerta.texto,ALERTA_FLAG[r.alerta.nivel]))+'</span>'+
  '<span class="cotep-card-desc'+(r.descricao?'':' muted')+'">'+esc(desc)+'</span>'+barra(r)+
  '<span class="cotep-card-saldo"><span><small>Saldo disponível</small><b>'+moneyC(r.saldo)+'</b></span><em>'+pct(r.percentual)+'</em></span>'+
  '<span class="cotep-card-nums"><span><small>Consumido</small>'+moneyC(r.consumido)+'</span><span><small>Comprometido</small>'+moneyC(r.comprometido)+'</span></span>'+
  '<span class="cotep-card-foot">'+r.coteps.length+' COTEP(s) · '+r.intencoes.length+' intenção(ões)'+(r.pendentes_qtd?' · <b>'+r.pendentes_qtd+' pendente(s) '+moneyC(r.pendentes_valor)+'</b>':'')+(r.a_conferir?' · '+r.a_conferir+' a conferir':'')+'</span></button>';
}
function cabecalho(ctx,res){
 const l=res.limite,manage=gestor(ctx),d=dados();
 const anos=[...new Set([state.ano,anoAtual(),...(d.limites||[]).map(x=>Number(x.ano))])].sort((a,b)=>b-a);
 return '<div class="pagehead"><div><div class="eyebrow">'+(ctx.visitante?'Acesso de visitante · Limite anual por elemento-item':'DTS-1 · Limite anual de COTEP por elemento-item')+'</div><h1>Intenções de COTEP</h1>'+
  '<div class="sub">'+(l?'Limite de <strong>'+money(l.valor_limite)+'</strong> por elemento-item · Exercício '+esc(state.ano)+' · UG '+esc(l.unidade_gestora):'Limite do exercício '+esc(state.ano)+' ainda não configurado')+'</div></div>'+
  '<div class="head-actions"><label class="sr-only" for="cotep-ano">Exercício</label><select id="cotep-ano" class="field-select cotep-ano" data-cotep-ano>'+anos.map(a=>'<option'+(a===state.ano?' selected':'')+'>'+a+'</option>').join('')+'</select>'+
  '<button class="btn primary" data-action="cotepNova">+ Nova intenção</button>'+(manage?'<button class="btn" data-action="cotepParametros">Parâmetros</button>':'')+
  '<button class="btn" data-action="cotepRecarregar" aria-label="Atualizar dados">↻</button></div></div>'+
  (l?'<p class="cotep-note">Critério operacional PMMG: limite anual controlado por elemento-item. Intenções pendentes não abatem o saldo; reservas aprovadas e COTEPs em andamento, sim.'+(ctx.demo?' <em>Demonstração: dados fictícios em memória, nada é gravado.</em>':'')+'</p>':'');
}
function divergencias(res){
 // Confere o cálculo local com a visão sig_cotep_saldos do banco (mesma fonte de dados).
 const d=dados();if(!d.saldos?.length)return '';
 const ug=res.limite?.unidade_gestora;
 const diff=d.saldos.filter(s=>Number(s.ano)===Number(state.ano)&&s.unidade_gestora===ug).filter(s=>{const r=res.porCodigo.get(s.elemento_item);return r&&s.saldo!==null&&CENT(s.saldo)!==r.saldo;}).map(s=>s.elemento_item);
 return diff.length?'<p class="cotep-note danger" role="alert">Divergência entre o painel e o banco nos elementos-itens '+esc(diff.join(', '))+'. Clique em ↻ para atualizar; se persistir, informe a DTS-1.</p>':'';
}
function kpis(res){
 const t=res.itens.reduce((a,r)=>({c:a.c+r.consumido,m:a.m+r.comprometido,pq:a.pq+r.pendentes_qtd,pv:a.pv+r.pendentes_valor,al:a.al+(['excedido','atingido','insuficiente','elevado'].includes(r.alerta.nivel)?1:0)}),{c:0,m:0,pq:0,pv:0,al:0});
 return '<div class="cotep-kpis"><div><span>Elementos-itens com movimento</span><strong>'+res.itens.length+'</strong><small>'+(t.al?t.al+' com alerta':'nenhum alerta')+'</small></div>'+
  '<div><span>Consumido (COTEPs realizadas)</span><strong>'+moneyC(t.c)+'</strong><small>valor homologado/negociado</small></div>'+
  '<div><span>Comprometido</span><strong>'+moneyC(t.m)+'</strong><small>em andamento + reservas aprovadas</small></div>'+
  '<div><span>Intenções pendentes</span><strong>'+t.pq+'</strong><small>'+moneyC(t.pv)+' · não abatem saldo</small></div></div>';
}
function abas(res){
 const d=dados(),abertas=d.intencoes.filter(i=>Number(i.ano)===state.ano&&(i.situacao==='Pendente'||i.situacao==='Devolvida')).length;
 const nc=d.coteps.filter(c=>Number(c.ano)===state.ano).length;
 const b=(id,txt)=>'<button class="mini-tab'+(state.tab===id?' active':'')+'" role="tab" aria-selected="'+(state.tab===id)+'" data-action="cotepAba" data-tab="'+id+'">'+txt+'</button>';
 return '<div class="mini-tabs cotep-tabs" role="tablist">'+b('elementos','Elementos-itens ('+res.itens.length+')')+b('intencoes','Fila de intenções'+(abertas?' <span class="cotep-bubble">'+abertas+'</span>':''))+b('coteps','COTEPs ('+nc+')')+'</div>';
}
function busca(ph){return '<div class="searchbox"><span aria-hidden="true">⌕</span><label class="sr-only" for="cotep-busca">Buscar</label><input id="cotep-busca" type="search" autocomplete="off" value="'+esc(state.busca)+'" placeholder="'+esc(ph)+'"></div>';}
function chips(lista,atual,acao){return '<div class="cotep-chips" role="group">'+lista.map(([id,t])=>'<button type="button" class="cotep-chip'+(atual===id?' active':'')+'" aria-pressed="'+(atual===id)+'" data-action="'+acao+'" data-val="'+id+'">'+esc(t)+'</button>').join('')+'</div>';}
function abaElementos(res){
 const q=plain(state.busca),d=dados();
 let itens=res.itens;
 if(q){
  itens=itens.filter(r=>plain(r.codigo+' '+r.descricao).includes(q));
  // Busca também no catálogo completo: elementos sem movimento aparecem com saldo integral.
  const extra=(d.elementos||[]).filter(e=>e.ativo!==false&&!res.porCodigo.has(e.codigo)&&plain(e.codigo+' '+(e.descricao||'')).includes(q))
   .map(e=>({codigo:e.codigo,descricao:e.descricao||'',limite:res.limite?CENT(res.limite.valor_limite):null,consumido:0,comprometido:0,comprometido_coteps:0,reservado:0,pendentes_qtd:0,pendentes_valor:0,a_conferir:0,coteps:[],intencoes:[],saldo:res.limite?CENT(res.limite.valor_limite):null,percentual:0,alerta:{nivel:'ok',texto:''}}));
  itens=itens.concat(extra);
 }
 if(state.filtro==='alerta')itens=itens.filter(r=>r.alerta.nivel!=='ok');
 if(state.filtro==='pendentes')itens=itens.filter(r=>r.pendentes_qtd>0);
 const novo=/^\d{4}$/.test(state.busca.trim())&&!itens.some(r=>r.codigo===state.busca.trim())?state.busca.trim():'';
 return '<section class="card section"><div class="toolbar">'+busca('Código ou descrição do elemento-item (ex.: 3016)')+chips([['todos','Todos'],['alerta','Com alerta'],['pendentes','Com pendências']],state.filtro,'cotepFiltro')+'</div>'+legenda()+
  '<div class="cotep-grid">'+itens.map(cartao).join('')+
  '<button type="button" class="cotep-card cotep-card-add" data-action="cotepNova"'+(novo?' data-el="'+esc(novo)+'"':'')+'><span class="cotep-add-ico" aria-hidden="true">+</span><strong>'+(novo?'Registrar intenção no '+esc(novo):'Outro elemento-item')+'</strong><span class="cotep-card-desc muted">Qualquer código de 4 dígitos pode ser incluído; o catálogo é aberto.</span></button></div>'+
  (itens.length?'':'<p class="cotep-empty">Nenhum elemento-item corresponde ao filtro.</p>')+'</section>';
}
function linhaIntencao(i,ctx,res,manage){
 const r=res.porCodigo.get(i.elemento_item);
 const pode=manage&&INT_ABERTAS.includes(i.situacao),meu=!ctx.visitante&&i.criado_por&&i.criado_por===ctx.authId&&['Pendente','Devolvida'].includes(i.situacao);
 const sel=manage&&['Pendente','Reservada'].includes(i.situacao)?'<input type="checkbox" class="cotep-check" data-action="cotepSel" data-id="'+esc(i.id)+'"'+(state.sel.has(i.id)?' checked':'')+' aria-label="Selecionar intenção de '+esc(i.centro)+'">':'';
 const acoes=[];
 if(pode&&i.situacao!=='Reservada')acoes.push('<button class="btn small primary" data-action="cotepReservar" data-id="'+esc(i.id)+'">Reservar</button>');
 if(pode)acoes.push('<button class="btn small" data-action="cotepIntencao" data-id="'+esc(i.id)+'">Analisar</button>');
 else if(meu)acoes.push('<button class="btn small" data-action="cotepIntencao" data-id="'+esc(i.id)+'">'+(i.situacao==='Devolvida'?'Ajustar':'Abrir')+'</button>');
 else acoes.push('<button class="btn small ghost" data-action="cotepIntencao" data-id="'+esc(i.id)+'">Ver</button>');
 const venc=i.situacao==='Reservada'&&i.reserva_ate&&i.reserva_ate<new Date().toISOString().slice(0,10);
 return '<tr><td class="cotep-td-check">'+sel+'</td><td>'+flag(i.prioridade||'Média',i.prioridade==='Alta'?'red':i.prioridade==='Baixa'?'gray':'amber')+'</td>'+
  '<td><div class="cell-main">'+esc(i.centro)+'</div><div class="cell-sub">'+dia(i.criado_em)+(i.grupo?' · grupo '+esc(i.grupo):'')+(i.origem==='Visitante'?' · visitante'+(i.solicitante_nome?': '+esc(i.solicitante_nome):''):'')+'</div></td>'+
  '<td><button class="link-button" data-action="cotepElemento" data-el="'+esc(i.elemento_item)+'">'+esc(i.elemento_item)+'</button><div class="cell-sub">saldo '+moneyC(r?.saldo)+'</div></td>'+
  '<td><div class="cotep-obj">'+esc(i.objeto)+'</div></td><td><div class="cell-main">'+money(i.valor_estimado)+'</div>'+(i.situacao==='Reservada'?'<div class="cell-sub">reservado '+money(i.valor_reservado)+'</div>':'')+'</td>'+
  '<td>'+flag(i.situacao)+(i.cotep_numero&&['Em COTEP','Finalizada'].includes(i.situacao)?'<div class="cell-sub">COTEP '+esc(i.cotep_numero)+'</div>':'')+(venc?'<div class="cell-sub cotep-warn">validade vencida</div>':'')+'</td>'+
  '<td><div class="cotep-row-actions">'+acoes.join('')+'</div></td></tr>';
}
function abaIntencoes(ctx,res){
 const manage=gestor(ctx),q=plain(state.busca),d=dados();
 let rows=d.intencoes.filter(i=>Number(i.ano)===state.ano);
 if(state.filaFiltro==='abertas')rows=rows.filter(i=>INT_ABERTAS.includes(i.situacao));
 if(state.filaFiltro==='minhas'){const mv=minhasVisitante();rows=rows.filter(i=>(i.criado_por&&i.criado_por===ctx.authId)||mv.has(i.id));}
 if(q)rows=rows.filter(i=>plain([i.centro,i.elemento_item,i.objeto,i.situacao,i.grupo,i.cotep_numero].join(' ')).includes(q));
 rows.sort((a,b)=>(INT_ABERTAS.includes(b.situacao)-INT_ABERTAS.includes(a.situacao))||(PRI_ORD[a.prioridade]??1)-(PRI_ORD[b.prioridade]??1)||String(a.criado_em).localeCompare(String(b.criado_em)));
 for(const id of [...state.sel])if(!d.intencoes.some(i=>i.id===id&&['Pendente','Reservada'].includes(i.situacao)))state.sel.delete(id);
 const n=state.sel.size;
 const lote=manage?'<div class="cotep-bulk'+(n?' on':'')+'" aria-live="polite">'+(n?'<strong>'+n+' selecionada(s)</strong><button class="btn small primary" data-action="cotepGerarCotep">Gerar COTEP</button><button class="btn small" data-action="cotepAgrupar">Agrupar</button><button class="btn small" data-action="cotepPriorizarLote">Prioridade</button><button class="btn small ghost" data-action="cotepLimparSel">Limpar</button>':'<span>Selecione intenções para agrupar, priorizar ou gerar uma COTEP (vários elementos-itens são permitidos).</span>')+'</div>':'';
 return '<section class="card section"><div class="toolbar">'+busca('Centro, objeto, elemento-item ou grupo')+chips([['abertas','Em aberto'],['todas','Todas'],['minhas',ctx.visitante?'Enviadas deste aparelho':'Minhas']],state.filaFiltro,'cotepFila')+'</div>'+lote+
  '<div class="table-scroll"><table class="data-table cotep-table"><thead><tr><th><span class="sr-only">Seleção</span></th><th>Prioridade</th><th>Centro</th><th>Elemento-item</th><th>Objeto</th><th>Valor</th><th>Situação</th><th>Ações</th></tr></thead><tbody>'+
  (rows.map(i=>linhaIntencao(i,ctx,res,manage)).join('')||'<tr><td colspan="8" class="table-empty">Nenhuma intenção neste filtro.</td></tr>')+'</tbody></table></div></section>';
}
function abaCoteps(ctx){
 const manage=gestor(ctx),q=plain(state.busca),d=dados();
 const itens=c=>d.procedimentos.filter(x=>x.cotep_id===c.id&&x.ativo!==false);
 let rows=d.coteps.filter(c=>Number(c.ano)===state.ano);
 if(q)rows=rows.filter(c=>plain([c.numero,c.objeto,c.situacao,...itens(c).map(x=>x.elemento_item)].join(' ')).includes(q));
 rows.sort((a,b)=>String(b.numero).localeCompare(String(a.numero),'pt-BR',{numeric:true}));
 const tr=c=>{const its=itens(c),tot=its.reduce((s,x)=>s+contribItem(x,c.situacao),0);
  return '<tr><td><div class="cell-main">'+esc(c.numero)+'</div><div class="cell-sub">UG '+esc(c.unidade_gestora)+'</div></td><td><div class="cotep-obj">'+esc(c.objeto)+'</div></td>'+
  '<td><div class="cotep-itens">'+(its.map(x=>'<button class="cotep-item-chip" data-action="cotepElemento" data-el="'+esc(x.elemento_item||'')+'"'+(x.elemento_item?'':' disabled')+'>'+esc(x.elemento_item||'s/ código')+' · '+money(SIT_CONSUMO.includes(c.situacao)?(x.valor_homologado??x.valor_estimado):x.valor_estimado)+'</button>').join('')||'—')+'</div></td>'+
  '<td>'+flag(c.situacao)+'</td><td><div class="cell-main">'+moneyC(tot)+'</div><div class="cell-sub">'+(c.situacao==='Em andamento'?'comprometido':SIT_CONSUMO.includes(c.situacao)?'consumido':'liberado')+'</div></td>'+
  '<td><button class="btn small'+(manage?'':' ghost')+'" data-action="cotepCotep" data-id="'+esc(c.id)+'">'+(manage?'Editar':'Ver')+'</button></td></tr>';};
 return '<section class="card section"><div class="toolbar">'+busca('Número, objeto ou elemento-item')+(manage?'<button class="btn primary" data-action="cotepCotep">+ Registrar COTEP</button>':'')+'</div>'+
  '<div class="table-scroll"><table class="data-table cotep-table"><thead><tr><th>COTEP</th><th>Objeto</th><th>Elementos-itens</th><th>Situação</th><th>Valor no limite</th><th>Ação</th></tr></thead><tbody>'+
  (rows.map(tr).join('')||'<tr><td colspan="6" class="table-empty">Nenhuma COTEP registrada em '+state.ano+'.</td></tr>')+'</tbody></table></div>'+
  '<p class="helper">Realizada: conta o valor homologado/negociado (ou o informado, se «a conferir»). Em andamento: conta o estimado. Fracassada, deserta e cancelada não ocupam o limite.</p></section>';
}

function view(ctx){
 ctxAtual=ctx;
 if(ctx.demo&&!state.demo)state.demo=demoSeed();
 if(!ctx.demo)state.demo=null;
 const titulo='<div class="pagehead"><div><div class="eyebrow">DTS-1 · Limite anual de COTEP por elemento-item</div><h1>Intenções de COTEP</h1></div></div>';
 if(ctx.visitante){
  if(state.error)return titulo+'<section class="card section"><p class="cotep-note danger">'+esc(state.error)+'</p><button class="btn" data-action="cotepRecarregar">Tentar novamente</button></section>';
  if(!state.loaded)return titulo+'<section class="card section"><p role="status" class="cotep-empty">Carregando…</p></section>';
  if(state.precisaCodigo)return titulo+'<section class="card section cotep-codigo"><h2>Código de acesso</h2><p class="sub">Informe o código de acesso COTEP divulgado pela DTS-1.</p>'+
   (state.erroCodigo?'<p class="cotep-note danger">'+esc(state.erroCodigo)+'</p>':'')+
   '<form data-form="cotepCodigo" class="cotep-inline-form"><input name="codigo" type="password" required minlength="6" autocomplete="off" aria-label="Código de acesso"><button class="btn primary">Continuar</button></form></section>';
 }else if(!ctx.demo){
  if(!ctx.online)return titulo+'<section class="card section"><p class="cotep-empty">Entre na sessão institucional para consultar e registrar intenções.</p></section>';
  if(state.error)return titulo+'<section class="card section"><p class="cotep-note danger">'+esc(state.error)+'</p><button class="btn" data-action="cotepRecarregar">Tentar novamente</button></section>';
  if(!state.loaded)return titulo+'<section class="card section"><p role="status" class="cotep-empty">Carregando dados protegidos…</p></section>';
 }
 const res=calcular(dados(),state.ano,ugPadrao());
 const corpo=state.tab==='intencoes'?abaIntencoes(ctx,res):state.tab==='coteps'?abaCoteps(ctx):abaElementos(res);
 return '<div class="cotep-page">'+cabecalho(ctx,res)+divergencias(res)+kpis(res)+abas(res)+corpo+'</div>';
}

// ===== Formulários (modais) =====
const campo=(name,label,value='',type='text',attr='')=>'<div class="form-row"><label for="cf-'+name+'">'+esc(label)+'</label><input id="cf-'+name+'" name="'+name+'" type="'+type+'" value="'+esc(value)+'" '+attr+'></div>';
const area=(name,label,value='',attr='')=>'<div class="form-row full"><label for="cf-'+name+'">'+esc(label)+'</label><textarea id="cf-'+name+'" name="'+name+'" rows="2" '+attr+'>'+esc(value)+'</textarea></div>';
const opcoes=(arr,val)=>arr.map(a=>{const [v,t]=Array.isArray(a)?a:[a,a];return '<option value="'+esc(v)+'"'+(String(v)===String(val??'')?' selected':'')+'>'+esc(t)+'</option>';}).join('');
const selecao=(name,label,arr,val,attr='')=>'<div class="form-row"><label for="cf-'+name+'">'+esc(label)+'</label><select id="cf-'+name+'" name="'+name+'" '+attr+'>'+opcoes(arr,val)+'</select></div>';
const rodape=(txt='Salvar')=>'<div class="modal-footer"><button class="btn" type="button" data-action="closeModal">Cancelar</button><button class="btn primary" type="submit">'+esc(txt)+'</button></div>';
function centroPadrao(ctx){
 if(ctx.visitante)return lerJson(localStorage,VIS_SOLICITANTE,{}).centro||'';
 const d=dados(),meu=d.intencoes.filter(i=>i.criado_por===ctx.authId).sort((a,b)=>String(b.criado_em).localeCompare(String(a.criado_em)))[0];
 if(meu)return meu.centro;
 const setor=ctx.profile?.setor||'';
 return d.centros.find(c=>c.ativo!==false&&plain(c.nome)===plain(setor))?.nome||'';
}
function formIntencao(ctx,el,i){
 const d=dados(),r=el?calcular(d,state.ano,ugPadrao()).porCodigo.get(el):null;
 const centros=d.centros.filter(c=>c.ativo!==false).map(c=>'<option value="'+esc(c.nome)+'">').join('');
 const elems=d.elementos.filter(e=>e.ativo!==false).map(e=>'<option value="'+esc(e.codigo)+'">'+esc(e.descricao||'')+'</option>').join('');
 const x=i||{};
 return '<form data-form="cotepIntencao" class="cotep-form" data-cotep-live="intencao">'+(i?'<input type="hidden" name="id" value="'+esc(i.id)+'">':'')+
  '<div class="form-grid">'+
  '<div class="form-row"><label for="cf-centro">Centro solicitante</label><input id="cf-centro" name="centro" list="cotep-centros" required maxlength="120" value="'+esc(x.centro||centroPadrao(ctx))+'" placeholder="Selecione ou digite"><datalist id="cotep-centros">'+centros+'</datalist></div>'+
  '<div class="form-row"><label for="cf-elemento_item">Elemento-item</label><input id="cf-elemento_item" name="elemento_item" list="cotep-elementos" required pattern="[0-9]{4}" inputmode="numeric" maxlength="4" value="'+esc(x.elemento_item||el||'')+'" placeholder="Ex.: 3016"'+(el&&!i?' readonly':'')+'><datalist id="cotep-elementos">'+elems+'</datalist></div>'+
  (ctx.visitante?(()=>{const sol=lerJson(localStorage,VIS_SOLICITANTE,{});return campo('solicitante_nome','Seu nome (posto/graduação e nome)',sol.nome||'','text','required minlength="3" maxlength="120" autocomplete="name"')+
   campo('solicitante_contato','Contato (e-mail funcional ou telefone)',sol.contato||'','text','required minlength="5" maxlength="160"');})():'')+
  area('objeto','Objeto',x.objeto||'','required minlength="8" maxlength="1500" placeholder="O que será contratado"')+
  campo('valor_estimado','Valor estimado (R$)',x.valor_estimado??'','text','required inputmode="decimal" placeholder="0,00" autocomplete="off"')+
  selecao('prioridade','Prioridade',PRIORIDADES,x.prioridade||'Média')+
  area('justificativa','Justificativa',x.justificativa||'','required minlength="10" maxlength="2000" placeholder="Por que a contratação é necessária"')+
  '</div><div class="cotep-sim" data-cotep-sim aria-live="polite">'+simulacaoHtml(r,parseValor(x.valor_estimado))+'</div>'+
  (i?.observacao_gestor&&i.situacao==='Devolvida'?'<p class="cotep-note">Orientação da DTS-1: '+esc(i.observacao_gestor)+'</p>':'')+
  rodape(i?(i.situacao==='Devolvida'?'Reenviar à DTS-1':'Salvar alterações'):'Registrar intenção')+'</form>';
}
function simulacaoHtml(r,valor){
 if(!r)return '<span>Informe o elemento-item para ver o saldo.</span>';
 if(r.saldo===null)return '<span>Limite do exercício não configurado.</span>';
 const v=Number.isFinite(valor)&&valor>0?CENT(valor):0,apos=r.saldo-v;
 return '<span>Saldo do '+esc(r.codigo)+': <b>'+moneyC(r.saldo)+'</b></span>'+(v?'<span class="'+(apos<0?'neg':'')+'">Se aprovada: <b>'+moneyC(apos)+'</b></span>':'')+
  (r.pendentes_qtd?'<span>Já há '+r.pendentes_qtd+' intenção(ões) pendente(s) ('+moneyC(r.pendentes_valor)+')</span>':'')+
  (v&&apos<0?'<span class="neg">Valor acima do saldo: a DTS-1 só poderá reservar até '+moneyC(Math.max(r.saldo,0))+'.</span>':'')+
  '<span class="muted">A intenção fica pendente e não abate o saldo até a aprovação da DTS-1.</span>';
}
function detalheElemento(ctx,el){
 const d=dados(),res=calcular(d,state.ano,ugPadrao());
 const lim=res.limite?CENT(res.limite.valor_limite):null;
 const r=res.porCodigo.get(el)||{codigo:el,descricao:(d.elementos.find(e=>e.codigo===el)||{}).descricao||'',limite:lim,consumido:0,comprometido:0,comprometido_coteps:0,reservado:0,pendentes_qtd:0,pendentes_valor:0,coteps:[],intencoes:[],saldo:lim,percentual:0,alerta:{nivel:lim===null?'sem-limite':'ok',texto:lim===null?'Limite não configurado':'Dentro do limite'}};
 const manage=gestor(ctx);
 const eventos=d.eventos.filter(e=>e.elemento_item===el||r.intencoes.some(i=>i.id===e.intencao_id)||r.coteps.some(x=>x.cotep.id===e.cotep_id)).slice(0,25);
 const met=(t,v,cls='')=>'<div class="'+cls+'"><small>'+t+'</small><strong>'+v+'</strong></div>';
 const cot=r.coteps.slice().sort((a,b)=>String(b.cotep.numero).localeCompare(String(a.cotep.numero),'pt-BR',{numeric:true})).map(x=>'<li><button class="link-button" data-action="cotepCotep" data-id="'+esc(x.cotep.id)+'">COTEP '+esc(x.cotep.numero)+'</button> '+flag(x.cotep.situacao)+'<span class="cotep-li-val">'+moneyC(x.valor)+'</span><small>'+esc(x.cotep.objeto||'')+(x.cotep.situacao==='Finalizada'&&x.item.valor_homologado!=null&&Number(x.item.valor_estimado)!==Number(x.item.valor_homologado)?' · estimado '+money(x.item.valor_estimado)+' → homologado '+money(x.item.valor_homologado):'')+'</small></li>').join('');
 const ints=r.intencoes.slice().sort((a,b)=>(INT_ABERTAS.includes(b.situacao)-INT_ABERTAS.includes(a.situacao))||String(b.criado_em).localeCompare(String(a.criado_em))).map(i=>'<li><button class="link-button" data-action="cotepIntencao" data-id="'+esc(i.id)+'">'+esc(i.centro)+'</button> '+flag(i.situacao)+'<span class="cotep-li-val">'+money(i.valor_estimado)+'</span><small>'+esc(i.objeto)+'</small>'+
  (manage&&i.situacao==='Pendente'?'<span class="cotep-li-act"><button class="btn small primary" data-action="cotepReservar" data-id="'+esc(i.id)+'">Reservar</button></span>':'')+'</li>').join('');
 const hist=eventos.map(e=>'<div class="event"><strong>'+esc(e.tipo)+'</strong><p>'+esc(e.descricao)+(e.valor!=null&&e.valor!==''?' · '+money(e.valor):'')+'</p><small>'+quando(e.criado_em)+(nomeUsuario(ctx,e.autor)?' · '+esc(nomeUsuario(ctx,e.autor)):'')+'</small></div>').join('');
 const body='<div class="cotep-detail">'+(r.alerta.nivel!=='ok'?'<p class="cotep-alert nivel-'+r.alerta.nivel+'">'+esc(r.alerta.texto)+'</p>':'')+
  '<div class="cotep-metrics">'+met('Limite anual',moneyC(r.limite))+met('Consumido',moneyC(r.consumido))+met('Comprometido',moneyC(r.comprometido),'')+met('Saldo disponível',moneyC(r.saldo),'saldo')+'</div>'+barra(r)+
  '<p class="helper">'+pct(r.percentual)+' utilizado · comprometido = '+moneyC(r.comprometido_coteps)+' em COTEPs em andamento + '+moneyC(r.reservado)+' em reservas'+(r.pendentes_qtd?' · '+r.pendentes_qtd+' pendente(s) somando '+moneyC(r.pendentes_valor)+' (não abatem)':'')+'</p>'+
  '<details class="cotep-quick"'+(r.saldo!==null&&r.saldo>0?' open':'')+'><summary>Registrar intenção neste elemento-item</summary>'+formIntencao(ctx,el)+'</details>'+
  '<div class="cotep-cols"><div><h3>COTEPs vinculadas ('+r.coteps.length+')</h3><ul class="cotep-list">'+(cot||'<li class="muted">Nenhuma COTEP neste exercício.</li>')+'</ul></div>'+
  '<div><h3>Intenções ('+r.intencoes.length+')</h3><ul class="cotep-list">'+(ints||'<li class="muted">Nenhuma intenção.</li>')+'</ul></div></div>'+
  '<h3>Histórico</h3>'+(hist?'<div class="timeline">'+hist+'</div>':'<p class="muted">Sem eventos registrados.</p>')+'</div>';
 ctx.openModal('Elemento-item '+el,r.descricao||'Descrição a cadastrar pela DTS-1',body,true);
}
function detalheIntencao(ctx,id){
 const d=dados(),i=d.intencoes.find(x=>x.id===id);if(!i)return;
 const manage=gestor(ctx),meu=i.criado_por===ctx.authId&&['Pendente','Devolvida'].includes(i.situacao);
 const r=calcular(d,i.ano,i.unidade_gestora).porCodigo.get(i.elemento_item);
 const ev=d.eventos.filter(e=>e.intencao_id===id).map(e=>'<div class="event"><strong>'+esc(e.tipo)+'</strong><p>'+esc(e.descricao)+'</p><small>'+quando(e.criado_em)+(nomeUsuario(ctx,e.autor)?' · '+esc(nomeUsuario(ctx,e.autor)):'')+'</small></div>').join('');
 const info='<div class="meta-grid cotep-meta"><div><small>Centro</small><strong>'+esc(i.centro)+'</strong></div><div><small>Elemento-item</small><strong>'+esc(i.elemento_item)+' · saldo '+moneyC(r?.saldo)+'</strong></div>'+
  '<div><small>Valor estimado</small><strong>'+money(i.valor_estimado)+'</strong></div><div><small>Reserva</small><strong>'+(i.situacao==='Reservada'?money(i.valor_reservado)+(i.reserva_ate?' até '+dia(i.reserva_ate):''):'—')+'</strong></div>'+
  '<div><small>Prioridade</small><strong>'+esc(i.prioridade||'Média')+(i.grupo?' · grupo '+esc(i.grupo):'')+'</strong></div><div><small>Registrada</small><strong>'+dia(i.criado_em)+(nomeUsuario(ctx,i.criado_por)?' · '+esc(nomeUsuario(ctx,i.criado_por)):'')+'</strong></div></div>'+
  (i.origem==='Visitante'?'<p class="cotep-note">Registrada sem conta (visitante)'+(i.solicitante_nome?': <strong>'+esc(i.solicitante_nome)+'</strong>':'')+(i.solicitante_contato?' · '+esc(i.solicitante_contato):'')+'</p>':'')+'<p><strong>Objeto:</strong> '+esc(i.objeto)+'</p><p><strong>Justificativa:</strong> '+esc(i.justificativa||'—')+'</p>'+(i.observacao_gestor?'<p class="cotep-note">DTS-1: '+esc(i.observacao_gestor)+'</p>':'')+(i.cotep_numero?'<p>COTEP vinculada: <strong>'+esc(i.cotep_numero)+'</strong></p>':'');
 let acoes='';
 if(manage&&INT_ABERTAS.includes(i.situacao)){
  const sug=r&&r.saldo!==null?Math.min(CENT(i.valor_estimado),Math.max(0,r.saldo+(i.situacao==='Reservada'?CENT(i.valor_reservado):0))):CENT(i.valor_estimado);
  acoes='<form data-form="cotepDecisao" class="cotep-form cotep-decisao"><input type="hidden" name="id" value="'+esc(i.id)+'"><h3>Decisão da DTS-1</h3><div class="form-grid">'+
   selecao('acao','Ação',[['reservar',i.situacao==='Reservada'?'Ajustar reserva':'Aprovar e reservar'],...(i.situacao==='Reservada'?[['liberar_reserva','Liberar reserva (volta a pendente)']]:[]),['devolver','Devolver ao centro para ajuste'],['rejeitar','Rejeitar'],['cancelar_intencao','Cancelar'],['priorizar','Alterar prioridade / grupo']],'reservar')+
   campo('valor','Valor a reservar (R$)',(sug/100).toFixed(2).replace('.',','),'text','inputmode="decimal"')+
   selecao('prioridade','Prioridade',PRIORIDADES,i.prioridade||'Média')+campo('grupo','Grupo (opcional)',i.grupo||'','text','maxlength="60"')+
   campo('reserva_ate','Validade da reserva (opcional)',i.reserva_ate||'','date')+area('motivo','Observação ao centro (obrigatória para devolver/rejeitar)','','maxlength="2000"')+
   '</div><p class="helper">Saldo atual do '+esc(i.elemento_item)+': '+moneyC(r?.saldo)+'. O banco recusa qualquer reserva acima do saldo, inclusive em aprovações simultâneas.</p>'+rodape('Confirmar decisão')+'</form>';
 }else if(meu){
  acoes='<h3>'+(i.situacao==='Devolvida'?'Ajustar e reenviar':'Editar intenção')+'</h3>'+formIntencao(ctx,null,i)+'<div class="detail-actions"><button class="btn danger" data-action="cotepCancelar" data-id="'+esc(i.id)+'">Cancelar intenção</button></div>';
 }
 ctx.openModal('Intenção · '+i.elemento_item,i.situacao,'<div class="cotep-detail">'+info+acoes+'<h3>Histórico</h3>'+(ev?'<div class="timeline">'+ev+'</div>':'<p class="muted">Sem eventos.</p>')+'</div>',true);
}
function linhaItem(x={},idx){
 return '<div class="cotep-item-row" data-item>'+(x.id?'<input type="hidden" name="item_id" value="'+esc(x.id)+'">':'<input type="hidden" name="item_id" value="">')+
  '<div class="form-row"><label>Elemento-item</label><input name="item_elemento" list="cotep-elementos" pattern="[0-9]{4}" inputmode="numeric" maxlength="4" value="'+esc(x.elemento_item||'')+'" placeholder="0000" aria-label="Elemento-item '+(idx+1)+'"></div>'+
  '<div class="form-row"><label>Estimado (R$)</label><input name="item_estimado" inputmode="decimal" value="'+esc(x.valor_estimado??'')+'" aria-label="Valor estimado '+(idx+1)+'"></div>'+
  '<div class="form-row"><label>Homologado (R$)</label><input name="item_homologado" inputmode="decimal" value="'+esc(x.valor_homologado??'')+'" aria-label="Valor homologado '+(idx+1)+'"></div>'+
  '<button type="button" class="close-x cotep-item-del" data-action="cotepItemRemover" aria-label="Remover elemento-item">×</button><p class="cotep-item-info" data-item-info></p></div>';
}
function formCotep(ctx,c){
 const d=dados(),manage=gestor(ctx);
 const its=c?d.procedimentos.filter(x=>x.cotep_id===c.id&&x.ativo!==false):[];
 const ints=c?d.intencoes.filter(i=>i.cotep_id===c.id):[];
 const procs=(ctx.processos||[]).filter(p=>/cotep/i.test(p.modalidade||'')||p.id===c?.processo_id);
 const elems=d.elementos.filter(e=>e.ativo!==false).map(e=>'<option value="'+esc(e.codigo)+'">'+esc(e.descricao||'')+'</option>').join('');
 if(!manage){
  return '<div class="cotep-detail"><div class="meta-grid cotep-meta"><div><small>Situação</small><strong>'+esc(c.situacao)+'</strong></div><div><small>UG</small><strong>'+esc(c.unidade_gestora)+'</strong></div></div><p>'+esc(c.objeto)+'</p>'+
   '<ul class="cotep-list">'+its.map(x=>'<li><strong>'+esc(x.elemento_item||'s/ código')+'</strong><span class="cotep-li-val">estimado '+money(x.valor_estimado)+(x.valor_homologado!=null?' · homologado '+money(x.valor_homologado):'')+'</span></li>').join('')+'</ul>'+
   (ints.length?'<p class="helper">Intenções atendidas: '+ints.map(i=>esc(i.centro)).join(', ')+'</p>':'')+'</div>';
 }
 return '<form data-form="cotepCotep" class="cotep-form" data-cotep-live="cotep">'+(c?'<input type="hidden" name="id" value="'+esc(c.id)+'">':'')+
  '<input type="hidden" name="ano" value="'+esc(c?.ano||state.ano)+'"><input type="hidden" name="unidade_gestora" value="'+esc(c?.unidade_gestora||ugPadrao())+'">'+
  '<div class="form-grid">'+campo('numero','Número da COTEP',c?.numero||'','text','required maxlength="35" placeholder="Ex.: 131/'+state.ano+'"')+
  selecao('situacao','Situação',SIT_COTEP,c?.situacao||'Em andamento')+area('objeto','Objeto',c?.objeto||'','required minlength="8"')+
  campo('documento','Referência (SEI / Portal de Compras)',c?.documento||'','text','maxlength="1000"')+
  (procs.length?selecao('processo_id','Processo de compra vinculado',[['','— nenhum —'],...procs.map(p=>[p.id,(p.numero||'')+' · '+String(p.objeto||'').slice(0,60)])],c?.processo_id||''):'')+
  '</div><h3 class="cotep-h3">Elementos-itens desta COTEP</h3><p class="helper">Cada código é controlado individualmente. Em andamento conta o estimado; ao finalizar, informe o homologado de cada código e a diferença é liberada.</p>'+
  '<datalist id="cotep-elementos">'+elems+'</datalist><div class="cotep-itens-form" data-itens>'+(its.length?its:[{}]).map(linhaItem).join('')+'</div>'+
  '<button type="button" class="btn small" data-action="cotepItemAdd">+ Elemento-item</button>'+
  (ctx.admin?'<div class="form-row full cotep-excecao" data-excecao hidden><label for="cf-justificativa_excecao">Exceção ao limite (somente administrador)</label><textarea id="cf-justificativa_excecao" name="justificativa_excecao" rows="2" placeholder="Use apenas para registrar fato já homologado; mínimo 20 caracteres"></textarea></div>':'')+
  (ints.length?'<p class="helper">Intenções vinculadas: '+ints.map(i=>esc(i.centro)+' ('+esc(i.elemento_item)+')').join(', ')+'. Se a COTEP for fracassada, deserta ou cancelada, elas voltam à fila como pendentes.</p>':'')+
  rodape(c?'Salvar COTEP':'Registrar COTEP')+'</form>';
}
function atualizarCotepInfo(form){
 const d=dados(),id=form.querySelector('[name=id]')?.value||null,ano=form.querySelector('[name=ano]').value,ug=form.querySelector('[name=unidade_gestora]').value;
 const sit=form.querySelector('[name=situacao]').value;let excede=false;
 for(const row of form.querySelectorAll('[data-item]')){
  const el=row.querySelector('[name=item_elemento]').value.trim(),info=row.querySelector('[data-item-info]');
  if(!/^\d{4}$/.test(el)){info.textContent='';continue;}
  const disp=saldoSemCotep(d,ano,ug,el,id);
  const est=parseValor(row.querySelector('[name=item_estimado]').value),hom=parseValor(row.querySelector('[name=item_homologado]').value);
  const usa=sit==='Em andamento'?est:SIT_CONSUMO.includes(sit)?(Number.isFinite(hom)?hom:est):0;
  const v=Number.isFinite(usa)?CENT(usa):0;
  if(disp===null){info.textContent='Limite não configurado para o exercício.';info.className='cotep-item-info neg';continue;}
  const apos=disp-v;excede=excede||apos<0;
  info.textContent='Disponível para este código: '+moneyC(disp)+(v?' · após esta COTEP: '+moneyC(apos):'')+(apos<0?' — acima do limite':'');
  info.className='cotep-item-info'+(apos<0?' neg':'');
 }
 const ex=form.querySelector('[data-excecao]');if(ex)ex.hidden=!excede;
}
function formParametros(ctx){
 const d=dados(),l=limiteDe(d,state.ano,ugPadrao())||{};
 const elems=d.elementos.slice().sort((a,b)=>a.codigo.localeCompare(b.codigo));
 const gest=ctx.admin?'<section class="cotep-param"><h3>Gestores DTS-1</h3><p class="helper">Analisam, priorizam, reservam, agrupam e registram COTEPs.</p><form data-form="cotepGestor" class="cotep-inline-form"><select name="auth_id" required aria-label="Usuário">'+(ctx.users||[]).filter(u=>u.ativo&&u.auth_id).map(u=>'<option value="'+esc(u.auth_id)+'">'+esc(u.nome+' · '+(u.setor||u.role))+(d.gestores.some(g=>g.auth_id===u.auth_id&&g.ativo)?' (gestor)':'')+'</option>').join('')+'</select><select name="ativo" aria-label="Permissão"><option value="true">Conceder</option><option value="false">Revogar</option></select><button class="btn small primary">Aplicar</button></form></section>':'';
 return '<div class="cotep-detail">'+
  '<section class="cotep-param"><h3>Limite anual por elemento-item</h3><form data-form="cotepLimite" class="cotep-form"><div class="form-grid">'+
  campo('ano','Exercício',l.ano||state.ano,'number','min="2020" max="2100" required')+campo('unidade_gestora','Unidade gestora',l.unidade_gestora||'','text','required pattern="[0-9]{5,9}"')+
  campo('valor_limite','Limite por elemento-item (R$)',l.valor_limite!=null?String(l.valor_limite).replace('.',','):'','text','required inputmode="decimal"')+
  selecao('validacao_juridica','Validação jurídica institucional',ctx.admin?['Pendente','Validada']:[l.validacao_juridica||'Pendente'],l.validacao_juridica||'Pendente')+
  area('base_normativa','Base normativa e critério adotado',l.base_normativa||'','required minlength="10"')+campo('documento_validacao','Documento da validação (parecer, nota técnica)',l.documento_validacao||'')+
  '</div>'+rodape('Salvar limite')+'</form></section>'+
  '<section class="cotep-param"><h3>Catálogo de elementos-itens ('+elems.length+')</h3><form data-form="cotepElementoCat" class="cotep-inline-form"><input name="codigo" required pattern="[0-9]{4}" maxlength="4" placeholder="Código" aria-label="Código" inputmode="numeric"><input name="descricao" maxlength="200" placeholder="Descrição" aria-label="Descrição"><select name="ativo" aria-label="Situação"><option value="true">Ativo</option><option value="false">Inativo</option></select><button class="btn small primary">Salvar</button></form>'+
  '<div class="cotep-catalogo">'+elems.map(e=>'<span class="'+(e.ativo===false?'off':'')+'"><b>'+esc(e.codigo)+'</b> '+esc(e.descricao||'sem descrição')+(e.ativo===false?' (inativo)':'')+'</span>').join('')+'</div></section>'+
  '<section class="cotep-param"><h3>Acesso de visitante (sem conta)</h3><p class="helper">Botão «COTEP» da tela de login: o visitante só vê este menu e registra intenções pendentes, identificando-se por nome e contato. '+
  (state.acesso?'Situação: <strong>'+(state.acesso.ativo?'ativo':'desativado')+'</strong> · '+(state.acesso.exige_codigo?'exige código':'sem código')+(state.acesso.limite_por_hora?' · até '+esc(state.acesso.limite_por_hora)+' envios/hora':''):'')+'</p>'+
  '<form data-form="cotepAcesso" class="cotep-inline-form"><select name="ativo" aria-label="Situação do acesso"><option value="true"'+(state.acesso?.ativo!==false?' selected':'')+'>Ativo</option><option value="false"'+(state.acesso?.ativo===false?' selected':'')+'>Desativado</option></select>'+
  '<input name="codigo" type="password" minlength="6" autocomplete="new-password" placeholder="Novo código (vazio mantém)" aria-label="Novo código de acesso">'+
  '<label class="cotep-check-label"><input type="checkbox" name="sem_codigo"> dispensar código</label>'+
  '<input name="limite_por_hora" type="number" min="1" max="1000" value="'+esc(state.acesso?.limite_por_hora||60)+'" aria-label="Limite de envios por hora" title="Envios por hora">'+
  '<button class="btn small primary">Salvar</button></form></section>'+
  '<section class="cotep-param"><h3>Centros solicitantes</h3><form data-form="cotepCentro" class="cotep-inline-form"><input name="nome" required maxlength="120" placeholder="Nome do centro" aria-label="Nome do centro"><select name="ativo" aria-label="Situação"><option value="true">Ativo</option><option value="false">Inativo</option></select><button class="btn small primary">Salvar</button></form>'+
  '<div class="cotep-catalogo">'+d.centros.map(c=>'<span class="'+(c.ativo===false?'off':'')+'">'+esc(c.nome)+(c.ativo===false?' (inativo)':'')+'</span>').join('')+'</div></section>'+gest+'</div>';
}

// ===== Eventos =====
async function enviar(ctx,payload){
 if(ctx.demo)return demoAcao(payload,ctx);
 if(ctx.visitante){
  if(payload.acao!=='criar_intencao')throw Error('Ação disponível apenas para a DTS-1');
  const {acao,ano,unidade_gestora,...dadosIntencao}=payload;
  const out=await ctx.rest('/rest/v1/rpc/sig_cotep_publico_intencao','POST',{p:{...dadosIntencao,codigo:lerJson(sessionStorage,VIS_CODIGO,null)}});
  if(out?.id){const m=minhasVisitante();m.add(out.id);gravar(localStorage,VIS_MINHAS,[...m].slice(-200));}
  await load(ctx.rest,true,{visitante:true});if(state.error)throw Error(state.error);
  return out;
 }
 const out=await ctx.rest('/rest/v1/rpc/sig_cotep_acao','POST',{p:payload});
 await load(ctx.rest,true);if(state.error)throw Error(state.error);
 return out;
}
const reabrir=(ctx,fn)=>{ctx.closeModal();ctx.render();if(fn)fn();};
async function click(name,el,ctx){
 ctxAtual=ctx;
 const id=el.dataset.id,manage=gestor(ctx);
 const leitura=['cotepAba','cotepFiltro','cotepFila','cotepElemento','cotepIntencao','cotepCotep','cotepRecarregar','cotepSel','cotepLimparSel','cotepItemAdd','cotepItemRemover'];
 if(ctx.preview&&!leitura.includes(name))return ctx.toast('Prévia somente leitura.');
 switch(name){
 case 'cotepRecarregar':if(!ctx.demo)await load(ctx.rest,true,{visitante:!!ctx.visitante});ctx.render();return;
 case 'cotepAba':state.tab=['elementos','intencoes','coteps'].includes(el.dataset.tab)?el.dataset.tab:'elementos';state.busca='';ctx.render();return;
 case 'cotepFiltro':state.filtro=el.dataset.val;ctx.render();return;
 case 'cotepFila':state.filaFiltro=el.dataset.val;ctx.render();return;
 case 'cotepElemento':if(el.dataset.el)detalheElemento(ctx,el.dataset.el);return;
 case 'cotepIntencao':detalheIntencao(ctx,id);return;
 case 'cotepNova':ctx.openModal('Nova intenção de COTEP','Centro, objeto, elemento-item, valor, prioridade e justificativa',formIntencao(ctx,el.dataset.el||null),true);return;
 case 'cotepCotep':{
  const c=dados().coteps.find(x=>x.id===id);
  if(!c&&!manage)return;
  ctx.openModal(c?'COTEP '+c.numero:'Registrar COTEP',c?c.situacao+' · '+c.unidade_gestora:'Um procedimento, um ou mais elementos-itens',formCotep(ctx,c),true);
  const f=document.querySelector('#modal-root form[data-form="cotepCotep"]');if(f)atualizarCotepInfo(f);return;
 }
 case 'cotepItemAdd':{const box=document.querySelector('#modal-root [data-itens]');if(box){box.insertAdjacentHTML('beforeend',linhaItem({},box.children.length));box.lastElementChild.querySelector('input[name=item_elemento]').focus();}return;}
 case 'cotepItemRemover':{const row=el.closest('[data-item]'),box=row?.parentElement;if(row&&box&&box.children.length>1){row.remove();atualizarCotepInfo(box.closest('form'));}return;}
 case 'cotepSel':if(el.checked)state.sel.add(id);else state.sel.delete(id);ctx.render();return;
 case 'cotepLimparSel':state.sel.clear();ctx.render();return;
 }
 if(name==='cotepCancelar'){
  if(!confirm('Cancelar esta intenção? O registro permanece no histórico.'))return;
  await enviar(ctx,{acao:'cancelar_intencao',id,motivo:'Cancelada pelo solicitante'});reabrir(ctx);ctx.toast('Intenção cancelada.','success');return;
 }
 if(!manage)return ctx.toast('Ação restrita aos gestores da DTS-1.','error');
 if(name==='cotepReservar'){
  const i=dados().intencoes.find(x=>x.id===id);if(!i)return;
  const r=calcular(dados(),i.ano,i.unidade_gestora).porCodigo.get(i.elemento_item);
  if(r&&r.saldo!==null&&r.saldo<CENT(i.valor_estimado))return detalheIntencao(ctx,id);
  if(!confirm('Reservar '+money(i.valor_estimado)+' no elemento-item '+i.elemento_item+'?\nSaldo atual '+moneyC(r?.saldo)+' → após a reserva '+moneyC(r&&r.saldo!==null?r.saldo-CENT(i.valor_estimado):null)))return;
  await enviar(ctx,{acao:'reservar',id});reabrir(ctx);ctx.toast('Reserva aprovada.','success');return;
 }
 const ids=[...state.sel];
 if(name==='cotepGerarCotep'){
  if(!ids.length)return ctx.toast('Selecione as intenções.');
  const ints=dados().intencoes.filter(i=>ids.includes(i.id)),porEl={};
  for(const i of ints)porEl[i.elemento_item]=(porEl[i.elemento_item]||0)+CENT(i.situacao==='Reservada'?i.valor_reservado:i.valor_estimado);
  const abertas=dados().coteps.filter(c=>Number(c.ano)===state.ano&&c.situacao==='Em andamento');
  ctx.openModal('Gerar COTEP','Agrupa '+ints.length+' intenção(ões) num único procedimento',
   '<form data-form="cotepConverter" class="cotep-form"><div class="form-grid">'+campo('numero','Número da COTEP','','text','required list="cotep-abertas" maxlength="35" placeholder="Ex.: 131/'+state.ano+'"')+
   '<datalist id="cotep-abertas">'+abertas.map(c=>'<option value="'+esc(c.numero)+'">'+esc(c.objeto)+'</option>').join('')+'</datalist>'+
   campo('documento','Referência (SEI / Portal)','')+area('objeto','Objeto da COTEP',ints.length===1?ints[0].objeto:'','minlength="8"')+'</div>'+
   '<ul class="cotep-list">'+Object.entries(porEl).map(([el,v])=>'<li><strong>'+esc(el)+'</strong><span class="cotep-li-val">'+moneyC(v)+'</span><small>reservas são transferidas ao item, sem dupla contagem; pendentes passam a comprometer o saldo</small></li>').join('')+'</ul>'+
   '<p class="helper">Informe o número de uma COTEP em andamento para acrescentar estas intenções a ela.</p>'+rodape('Gerar COTEP')+'</form>',true);return;
 }
 if(name==='cotepAgrupar'||name==='cotepPriorizarLote'){
  if(!ids.length)return ctx.toast('Selecione as intenções.');
  ctx.openModal(name==='cotepAgrupar'?'Agrupar intenções':'Prioridade em lote',ids.length+' selecionada(s)',
   '<form data-form="'+(name==='cotepAgrupar'?'cotepAgrupar':'cotepPriorizar')+'" class="cotep-form"><div class="form-grid">'+
   (name==='cotepAgrupar'?campo('grupo','Nome do grupo (vazio remove)','','text','maxlength="60" placeholder="Ex.: Suprimentos 2º semestre"'):selecao('prioridade','Prioridade',PRIORIDADES,'Alta'))+'</div>'+rodape('Aplicar')+'</form>');return;
 }
 if(name==='cotepParametros'){ctx.openModal('Parâmetros do controle','Limite, catálogo, centros e gestores DTS-1',formParametros(ctx),true);return;}
}
function valorForm(v){const n=parseValor(v);return Number.isFinite(n)?n.toFixed(2):String(v??'').trim();}
async function submit(form,ctx){
 ctxAtual=ctx;
 if(ctx.preview)throw Error('Prévia somente leitura');
 const type=form.dataset.form,f=Object.fromEntries(new FormData(form).entries());
 if(type==='cotepCodigo'){
  gravar(sessionStorage,VIS_CODIGO,String(f.codigo||'').trim());state.erroCodigo='';
  await load(ctx.rest,true,{visitante:true});ctx.render();
  if(state.precisaCodigo)throw Error(state.erroCodigo||'Código de acesso COTEP inválido');
  return;
 }
 if(ctx.visitante&&type!=='cotepIntencao')throw Error('Ação disponível apenas para a DTS-1');
 if(ctx.visitante)gravar(localStorage,VIS_SOLICITANTE,{nome:f.solicitante_nome,contato:f.solicitante_contato,centro:f.centro});
 const ids=[...state.sel];let msg='Registro confirmado no banco.',out;
 if(type==='cotepIntencao'){
  out=await enviar(ctx,{acao:f.id?'editar_intencao':'criar_intencao',...f,valor_estimado:valorForm(f.valor_estimado),ano:state.ano,unidade_gestora:ugPadrao()||undefined});
  msg=f.id?'Intenção atualizada e enviada à DTS-1.':'Intenção registrada. Ela aguarda análise da DTS-1 e não abate o saldo até ser aprovada.';
 }else{
  if(!gestor(ctx)&&!(type==='cotepGestor'&&ctx.admin))throw Error('Ação restrita aos gestores da DTS-1');
  if(type==='cotepDecisao'){
   const p={acao:f.acao,id:f.id,motivo:f.motivo};
   if(f.acao==='reservar'){p.valor=valorForm(f.valor);if(f.reserva_ate)p.reserva_ate=f.reserva_ate;}
   if(f.acao==='priorizar'){p.prioridade=f.prioridade;p.grupo=f.grupo;}
   out=await enviar(ctx,p);msg=({reservar:'Reserva aprovada.',liberar_reserva:'Reserva liberada.',devolver:'Intenção devolvida ao centro.',rejeitar:'Intenção rejeitada.',cancelar_intencao:'Intenção cancelada.',priorizar:'Prioridade atualizada.'})[f.acao]||msg;
  }else if(type==='cotepConverter'){
   out=await enviar(ctx,{acao:'converter_cotep',ids,numero:f.numero,objeto:f.objeto,documento:f.documento});state.sel.clear();state.tab='coteps';msg='COTEP gerada; as reservas foram transferidas para os elementos-itens.';
  }else if(type==='cotepAgrupar'||type==='cotepPriorizar'){
   out=await enviar(ctx,type==='cotepAgrupar'?{acao:'agrupar',ids,grupo:f.grupo}:{acao:'priorizar',ids,prioridade:f.prioridade});state.sel.clear();
  }else if(type==='cotepCotep'){
   const rows=[...form.querySelectorAll('[data-item]')].map(r=>({id:r.querySelector('[name=item_id]').value||undefined,elemento_item:r.querySelector('[name=item_elemento]').value.trim(),
    valor_estimado:valorForm(r.querySelector('[name=item_estimado]').value),valor_homologado:valorForm(r.querySelector('[name=item_homologado]').value)})).filter(x=>x.elemento_item||x.valor_estimado||x.id);
   out=await enviar(ctx,{acao:'salvar_cotep',id:f.id,ano:Number(f.ano),unidade_gestora:f.unidade_gestora,numero:f.numero,objeto:f.objeto,situacao:f.situacao,documento:f.documento,processo_id:f.processo_id||'',justificativa_excecao:f.justificativa_excecao||'',itens:rows});
   msg='COTEP salva.'+(out?.liberado>0?' Liberado '+money(out.liberado)+' no limite.':'');
  }else if(type==='cotepLimite'){
   out=await enviar(ctx,{acao:'limite',...f,valor_limite:valorForm(f.valor_limite),ano:Number(f.ano)});msg='Limite do exercício salvo.';
  }else if(type==='cotepElementoCat'){out=await enviar(ctx,{acao:'elemento',...f,ativo:f.ativo==='true'});msg='Catálogo atualizado.';}
  else if(type==='cotepCentro'){out=await enviar(ctx,{acao:'centro',...f,ativo:f.ativo==='true'});msg='Centro atualizado.';}
  else if(type==='cotepAcesso'){
   const p={ativo:f.ativo==='true',limite_por_hora:f.limite_por_hora};
   if(f.sem_codigo)p.codigo='';else if(String(f.codigo||'').trim())p.codigo=f.codigo.trim();
   if(ctx.demo)throw Error('Disponível somente no banco institucional');
   out=await ctx.rest('/rest/v1/rpc/sig_cotep_acesso_publico_definir','POST',{p});await load(ctx.rest,true);msg='Acesso de visitante atualizado.';
  }
  else if(type==='cotepGestor'){out=await enviar(ctx,{acao:'definir_gestor',auth_id:f.auth_id,ativo:f.ativo==='true'});msg='Permissão atualizada.';}
  else throw Error('Formulário desconhecido');
 }
 ctx.closeModal();ctx.render();ctx.toast(msg,'success');
 return out;
}
function filter(q){state.busca=q;}
// Pré-visualização de saldo enquanto o usuário digita (intenção e itens da COTEP) e troca de exercício.
document.addEventListener('input',e=>{
 const form=e.target.closest?.('form[data-cotep-live]');if(!form)return;
 if(form.dataset.cotepLive==='intencao'){
  const el=form.querySelector('[name=elemento_item]').value.trim(),box=form.querySelector('[data-cotep-sim]');
  if(box){let r=/^\d{4}$/.test(el)?calcular(dados(),state.ano,ugPadrao()).porCodigo.get(el):null;
   if(!r&&/^\d{4}$/.test(el)){const l=limiteDe(dados(),state.ano,ugPadrao());r=l?{codigo:el,saldo:CENT(l.valor_limite),pendentes_qtd:0,pendentes_valor:0}:{codigo:el,saldo:null};}
   box.innerHTML=simulacaoHtml(r,parseValor(form.querySelector('[name=valor_estimado]').value));}
 }else atualizarCotepInfo(form);
});
document.addEventListener('change',e=>{
 if(e.target.matches?.('[data-cotep-ano]')){state.ano=Number(e.target.value)||anoAtual();state.sel.clear();ctxAtual?.render();}
 else if(e.target.closest?.('form[data-cotep-live="cotep"]'))atualizarCotepInfo(e.target.closest('form'));
});
window.SIG_COTEP={syncIdentity,load,isLoaded,view,click,submit,filter};
window.SIG_COTEP_CALC=CALC;
})();
