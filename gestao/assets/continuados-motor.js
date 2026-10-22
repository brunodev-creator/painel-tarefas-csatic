/* SIG CSA-TIC — Contratos Continuados: motor de análise (puro, sem DOM).
 * Usado no navegador (window.SIG_CONT_MOTOR), nos testes Node e no modo demonstração.
 * Fonte única: movimentos da BASE_EXECUCAO_EMPENHOS da «agora vai - PLANILHA ATUAL».
 * Valores em centavos inteiros. Nada aqui altera saldo contábil: é leitura, análise e projeção. */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;else root.SIG_CONT_MOTOR=api;
})(typeof self!=='undefined'?self:this,function(){
'use strict';

const VERSAO='cont-1.0.0';
const C=v=>{if(v===null||v===undefined||v==='')return 0;const n=typeof v==='number'?v:Number(String(v).replace(/[^0-9,.-]/g,'').replace(/\.(?=\d{3}(\D|$))/g,'').replace(',','.'));return Number.isFinite(n)?Math.round(n*100):0;};
const MESES=['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
const MESES_LONGOS=['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
const mesLabel=m=>m?MESES[Number(m.slice(5,7))-1]+'/'+m.slice(2,4):'—';
const mesLongo=m=>m?MESES_LONGOS[Number(m.slice(5,7))-1]:'—';
const proxMes=m=>{let y=Number(m.slice(0,4)),k=Number(m.slice(5,7))+1;if(k>12){k=1;y++;}return y+'-'+String(k).padStart(2,'0');};
const mesesEntre=(a,b)=>{const out=[];if(!a||!b||a>b)return out;for(let m=a;m<=b;m=proxMes(m))out.push(m);return out;};
const mesAnterior=m=>{let y=Number(m.slice(0,4)),k=Number(m.slice(5,7))-1;if(k<1){k=12;y--;}return y+'-'+String(k).padStart(2,'0');};
const digitos=v=>String(v??'').replace(/\D/g,'');
const brl=c=>(c<0?'-':'')+'R$ '+(Math.abs(c)/100).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
const brlCurto=c=>{const v=Math.abs(c)/100,s=c<0?'-':'';return v>=1e6?s+'R$ '+(v/1e6).toLocaleString('pt-BR',{maximumFractionDigits:2})+' mi':v>=1e3?s+'R$ '+(v/1e3).toLocaleString('pt-BR',{maximumFractionDigits:1})+' mil':brl(c);};

// ===== Identidade do contrato, da linha orçamentária e do grupo de análise =====
// Contrato: número explícito no objeto («Contrato 8000034») + fornecedor; senão processo + fornecedor.
// Nunca agrupa apenas por fornecedor; um processo com dois fornecedores gera dois contratos.
const RE_NUM_CONTRATO=/contrato\s*(?:n[º°o.]*\s*)?(\d{6,})/i;
function contratoChave(processo,cnpj,objeto){
 const doc=digitos(cnpj)||'sem-cnpj',m=RE_NUM_CONTRATO.exec(String(objeto||''));
 if(m)return 'CT:'+m[1]+':'+doc;
 return 'PR:'+String(processo||'sem-processo').trim()+':'+doc;
}
// Dotação «1251.06.181.137.4365.0001.3390.3921.60.2.0»: base = até o elemento-item; fonte = 60.2(.0).
function partesDotacao(d){
 const p=String(d||'').trim().split('.');
 if(p.length<9)return {base:String(d||'').trim(),fonte:'',elemento:'',natureza:''};
 return {base:p.slice(0,8).join('.'),fonte:p.slice(8).join('.'),elemento:p[7],natureza:p[6],acao:p[4]};
}
// Normaliza uma linha da BASE_EXECUCAO_EMPENHOS (nomes da planilha) ou da tabela sig_cont_movimentos.
function normalizarMovimento(r,correcoes){
 const g=(...k)=>{for(const x of k)if(r[x]!==undefined&&r[x]!==null&&r[x]!=='')return r[x];return '';};
 const chave=String(g('chave_empenho','Chave_Empenho'));
 let dotacao=String(g('dotacao','Dotacao')).trim();
 const corr=correcoes&&correcoes[chave];
 let dotacaoCorrigida=false;
 // Correção histórica aprovada (SIG_V6_CORRECOES_APROVADAS): compara só os dígitos, pois a planilha guarda
 // a dotação original ora pontuada, ora compactada.
 if(corr&&digitos(corr.original)===digitos(dotacao)&&corr.corrigida){dotacao=String(corr.corrigida).trim();dotacaoCorrigida=true;}
 const mesRef=String(g('mes','Mes_Referencia')).slice(0,7),data=String(g('data','Data_Efetivacao')).slice(0,10);
 const unidade=String(g('unidade_contabil','Unidade_Contabil_Executora')).replace(/\.0$/,'').trim();
 const tdcoTxt=String(g('tdco','Eh_TDCO')).toUpperCase();
 const processo=String(g('processo','Processo_Compra')).trim(),cnpj=String(g('cnpj','CNPJ_CPF_Fornecedor')),objeto=String(g('objeto_contrato','Objeto_Contrato'));
 return {
  id:String(g('id_execucao','id','ID_Execucao')),chave,tipo:String(g('tipo','Tipo_Movimentacao_Normalizado')),
  data,mes:mesRef||data.slice(0,7),
  empenho:C(g('valor_empenho','Valor_Empenho_Assinado')),
  conformidade:C(g('valor_conformidade','Valor_Conformidade_Assinado')),
  ajuste:C(g('valor_ajuste','Valor_Ajuste_Assinado')),
  processo,cnpj,fornecedor:String(g('fornecedor','Nome_Fornecedor')),objeto,
  especificacao:String(g('especificacao','Especificacao_Principal')),
  dotacao,dotacaoCorrigida,unidade,
  tdco:tdcoTxt==='SIM'||tdcoTxt==='TRUE'||r.tdco===true||(unidade!==''&&unidade!=='1250070'),
  contrato:String(g('contrato_chave'))||contratoChave(processo,cnpj,objeto)
 };
}

// ===== Periodicidade e estatística da série =====
const RE_ANUAL=/licen[çc]a|subscri[çc][ãa]o|por\s+1\s+ano|\banual\b|renova[çc][ãa]o anual|office\s*365|garantia/i;
const RE_EVENTUAL=/sob demanda|eventual|por etapa|etapas|implanta[çc][ãa]o|certifica[çc][ãa]o digital/i;
function media(a){return a.length?a.reduce((s,x)=>s+x,0)/a.length:0;}
function cv(a){if(a.length<2)return null;const m=media(a);if(m<=0)return null;const v=media(a.map(x=>(x-m)**2));return Math.sqrt(v)/m;}

/* Analisa um grupo (mesmo contrato + mesma unidade contábil + mesma dotação até o elemento-item).
 * Fontes diferentes do mesmo grupo são consolidadas (a execução pode migrar de fonte), mas o
 * detalhamento por fonte é preservado. Elementos, ações e unidades contábeis (TDCO) nunca se misturam. */
function analisarGrupo(g,ctx){
 const {mesAtual,mesesProjecao,fimExercicio,vigenciaFim}=ctx;
 const movs=g.movimentos;
 const serieMap=new Map(),fontes=new Map();
 let empenhado=0,conformado=0,ultimaConf=null,qtdConf=0;
 for(const m of movs){
  empenhado+=m.empenho+m.ajuste;conformado+=m.conformidade;
  const f=partesDotacao(m.dotacao).fonte||'—';
  if(!fontes.has(f))fontes.set(f,{fonte:f,dotacao:m.dotacao,empenhado:0,conformado:0,ultimaExecucao:null,empenhos:new Set()});
  const fo=fontes.get(f);fo.empenhado+=m.empenho+m.ajuste;fo.conformado+=m.conformidade;fo.empenhos.add(m.chave);
  if(/CONFORMIDADE/.test(m.tipo)&&m.conformidade!==0){
   serieMap.set(m.mes,(serieMap.get(m.mes)||0)+m.conformidade);
   if(m.conformidade>0){qtdConf++;if(!ultimaConf||m.data>ultimaConf.data)ultimaConf={data:m.data,valor:m.conformidade,chave:m.chave};
    if(!fo.ultimaExecucao||m.mes>fo.ultimaExecucao)fo.ultimaExecucao=m.mes;}
  }
 }
 // Uma mesma data com várias conformidades do grupo: «última conformidade» soma o dia.
 if(ultimaConf)ultimaConf.valor=movs.filter(m=>/CONFORMIDADE/.test(m.tipo)&&m.data===ultimaConf.data&&m.conformidade>0).reduce((s,m)=>s+m.conformidade,0);
 const saldo=empenhado-conformado;
 const mesesComConf=[...serieMap.entries()].filter(([,v])=>v>0).map(([k])=>k).sort();
 const inicio=mesesComConf[0]||null;
 const fechados=inicio?mesesEntre(inicio,mesAnterior(mesAtual)):[];
 const serieFechada=fechados.map(m=>({mes:m,valor:serieMap.get(m)||0}));
 const execMesAtual=serieMap.get(mesAtual)||0;
 // Saldo ao fim de cada mês fechado (empenhos/reforços − conformidades acumulados), para o gráfico.
 const primeiroMov=movs.map(m=>m.mes).filter(Boolean).sort()[0];
 const saldoMensal=primeiroMov?mesesEntre(primeiroMov,mesAnterior(mesAtual)).map(mes=>({mes,saldo:movs.filter(m=>m.mes&&m.mes<=mes).reduce((t,m)=>t+m.empenho+m.ajuste-m.conformidade,0)})):[];
 const valores=serieFechada.map(x=>x.valor);
 const mediaHist=valores.length?Math.round(media(valores)):null;
 const ult3=serieFechada.slice(-3);
 const mediaRec=ult3.length===3?Math.round(media(ult3.map(x=>x.valor))):null;
 const coef=cv(valores);
 const objeto=g.objeto||'';
 const pagoTotal=empenhado>0?conformado/empenhado:0;
 const avisos=[];
 // ---- Periodicidade ----
 let periodicidade,confianca,referencia=null,origem='',explicacao='';
 if(!mesesComConf.length&&empenhado===0&&conformado===0){
  periodicidade='sem_movimento';confianca='nenhuma';
  explicacao='Empenho sem valor líquido no exercício (empenhado e anulado ou não executado). Não entra nas projeções.';
 }else if(!mesesComConf.length){
  periodicidade='sem_historico';confianca='nenhuma';
  explicacao=empenhado>0?'Sem conformidade registrada em '+ctx.exercicio+': não há base para estimar a despesa mensal.':'Sem empenho nem conformidade no exercício.';
 }else if((mesesComConf.length===1&&(RE_ANUAL.test(objeto)||pagoTotal>=0.9))||(mesesComConf.length===2&&RE_ANUAL.test(objeto)&&pagoTotal>=0.9)){
  periodicidade='unico';confianca='media';referencia=0;origem='PAGAMENTO_UNICO';
  explicacao='Pagamento único em '+mesLabel(mesesComConf[0])+' ('+brl(conformado)+(RE_ANUAL.test(objeto)?', objeto anual/licença':', '+Math.round(pagoTotal*100)+'% do empenhado')+'). Não é repetido como mensalidade.';
 }else if(mesesComConf.length<3){
  periodicidade='insuficiente';confianca='baixa';
  // Histórico curto: inclui o mês corrente quando ele já supera a média dos meses fechados.
  const comAtual=Math.round((valores.reduce((s,x)=>s+x,0)+execMesAtual)/(valores.length+1));
  if(mediaHist===null||comAtual>mediaHist){referencia=comAtual;origem='MEDIA_COM_MES_CORRENTE';
   explicacao='Histórico curto ('+mesesComConf.length+' mês(es) com conformidade): média de '+mesLabel(inicio)+' a '+mesLabel(mesAtual)+', mês corrente incluído.';}
  else{referencia=mediaHist;origem='MEDIA_HISTORICA';explicacao='Histórico curto ('+mesesComConf.length+' mês(es) com conformidade): média de '+mesLabel(inicio)+' a '+mesLabel(mesAnterior(mesAtual))+', meses sem conformidade contados como zero.';}
  if(RE_EVENTUAL.test(objeto))avisos.push('Objeto com indício de execução eventual ou por etapas: confira se haverá nova parcela.');
 }else{
  periodicidade=RE_EVENTUAL.test(objeto)&&coef!==null&&coef>0.8?'eventual':'mensal';
  confianca=coef!==null&&coef<0.35?'alta':'media';
  if(mediaRec!==null&&mediaRec>=mediaHist){referencia=mediaRec;origem='MEDIA_ULTIMOS_3_MESES';
   explicacao='Referência calculada com base na execução de '+mesLongo(ult3[0].mes)+' a '+mesLongo(ult3[2].mes)+' ('+brl(mediaRec)+'/mês).';}
  else{referencia=mediaHist;origem='MEDIA_HISTORICA';
   explicacao='Referência calculada com base na execução de '+mesLongo(inicio)+' a '+mesLongo(mesAnterior(mesAtual))+' ('+brl(mediaHist)+'/mês), maior que a dos últimos 3 meses.';}
 }
 const manual=g.mediaManual;
 if(manual&&manual>0&&periodicidade!=='sem_historico'){referencia=manual;origem='MEDIA_MANUAL_PLANILHA';explicacao='Média mensal informada manualmente na planilha (SELECAO_SERVICOS_CONTINUOS): '+brl(manual)+'.';}
 const zeros=serieFechada.filter(x=>x.valor===0).length;
 if(zeros&&periodicidade!=='unico')avisos.push(zeros+' mês(es) sem conformidade dentro do período de execução, contados como zero (pagamentos podem ter sido agrupados no mês seguinte).');
 if(fontes.size>1)avisos.push('Execução consolidada entre as fontes '+[...fontes.keys()].join(' e ')+' do mesmo contrato e elemento-item; a fonte do reforço deve ser definida pela SOFI.');
 if(g.tdco)avisos.push('TDCO: execução por outra unidade contábil ('+(g.unidade||'—')+'). Saldo e reforço dependem dessa unidade.');
 if(saldo<0)avisos.push('Saldo calculado negativo ('+brl(saldo)+'): conferir anulações e conformidades na fonte.');
 // ---- Tendência ----
 let tendencia='estavel';
 if(mediaRec!==null&&mediaHist){const r=mediaRec/mediaHist;tendencia=r>1.15?'alta':r<0.85?'queda':'estavel';}
 // ---- Projeção sequencial: mês corrente → meses-alvo; o saldo usado num mês não volta no seguinte ----
 // O mês corrente entra inteiro: a nota de cada mês é paga (conformada) no mês seguinte, então o que já foi
 // conformado no mês corrente refere-se ao mês anterior e já está refletido no saldo.
 const projecao=[];let s=saldo;
 const projetavel=referencia!==null;
 for(const m of mesesProjecao){
  let despesa=null,nota='';
  if(projetavel){
   if(vigenciaFim&&m>vigenciaFim.slice(0,7)){despesa=0;nota='Após a vigência informada';}
   else if(m===mesAtual){despesa=referencia;nota='Mês corrente completo (nota paga no mês seguinte)';}
   else despesa=referencia;
  }
  const inicioMes=s;
  const coberto=despesa===null?null:Math.min(Math.max(inicioMes,0),despesa);
  const reforco=despesa===null?null:despesa-coberto;
  if(despesa!==null)s=inicioMes-despesa;
  projecao.push({mes:m,despesa,saldoInicio:inicioMes,saldoFim:despesa===null?null:s,coberto,reforco,nota,alvo:ctx.mesesAlvo.includes(m),corrente:m===mesAtual});
 }
 const reforcoTotal=projetavel?projecao.reduce((t,p)=>t+(p.reforco||0),0):null;
 const cobertura=referencia>0?Math.max(saldo,0)/referencia:null;
 // Até quando o saldo cobre: primeiro mês projetado com reforço.
 const falta=projecao.find(p=>p.reforco>0);
 return {
  chave:g.chave,contrato:g.contrato,unidade:g.unidade,tdco:g.tdco,base:g.base,elemento:partesDotacao(g.dotacoes[0]).elemento,natureza:partesDotacao(g.dotacoes[0]).natureza,
  dotacoes:g.dotacoes,fontes:[...fontes.values()].map(f=>({...f,empenhos:[...f.empenhos],saldo:f.empenhado-f.conformado})),
  empenhos:[...new Set(movs.map(m=>m.chave))],
  empenhado,conformado,saldo,serie:serieFechada,saldoMensal,execMesAtual,inicio,mesesComConformidade:mesesComConf.length,qtdConformidades:qtdConf,
  ultimaConformidade:ultimaConf,mediaHistorica:mediaHist,mediaRecente:mediaRec,cv:coef,tendencia,
  periodicidade,confianca,referencia,origem,explicacao,avisos,projecao,reforcoTotal,
  coberturaMeses:cobertura,cobreAte:falta?falta.mes:(projetavel?fimExercicio:null)
 };
}

/* Análise completa.
 * dados: {movimentos:[], contratos:[{chave,vigencia_fim,...}], empenhos:[planilha], manifestacoes:[], correcoes:{chave:{original,corrigida}}}
 * opts:  {hoje:'2026-10-22', exercicio:2026, mesesAlvo:['2026-11','2026-12']} */
function analisar(dados,opts={}){
 const hoje=opts.hoje||new Date().toISOString().slice(0,10);
 const exercicio=Number(opts.exercicio||hoje.slice(0,4));
 const mesesAlvo=(opts.mesesAlvo&&opts.mesesAlvo.length?opts.mesesAlvo:[exercicio+'-11',exercicio+'-12']).slice().sort();
 const mesAtual=hoje.slice(0,7);
 const fimExercicio=exercicio+'-12';
 const ultimoAlvo=mesesAlvo[mesesAlvo.length-1];
 const mesesProjecao=mesAtual<=ultimoAlvo?mesesEntre(mesAtual,ultimoAlvo):[];
 const correcoes=dados.correcoes||{};
 const movs=(dados.movimentos||[]).map(r=>r&&r.chave!==undefined&&r.empenho!==undefined?r:normalizarMovimento(r,correcoes))
  .filter(m=>m.id&&m.chave&&m.chave.startsWith(exercicio+'|'));
 // Deduplicação por ID_Execucao (reimportação ou linha repetida não conta duas vezes).
 const vistos=new Set(),unicos=[];let duplicados=0;
 for(const m of movs){if(vistos.has(m.id)){duplicados++;continue;}vistos.add(m.id);unicos.push(m);}
 const cadastro=new Map((dados.contratos||[]).map(c=>[c.chave,c]));
 const planilha=new Map((dados.empenhos||[]).map(e=>[e.chave_empenho||e.Chave_Empenho,e]));
 // ---- Agrupamento ----
 const contratos=new Map();
 for(const m of unicos){
  if(!contratos.has(m.contrato))contratos.set(m.contrato,{chave:m.contrato,processos:new Set(),fornecedor:m.fornecedor,cnpj:m.cnpj,objeto:m.objeto,especificacao:m.especificacao,grupos:new Map(),movs:[]});
  const c=contratos.get(m.contrato);c.processos.add(m.processo);c.movs.push(m);
  if(!c.objeto&&m.objeto)c.objeto=m.objeto;
  const p=partesDotacao(m.dotacao),gk=m.contrato+'|'+(m.tdco?'TDCO '+m.unidade:'1250070')+'|'+p.base;
  if(!c.grupos.has(gk))c.grupos.set(gk,{chave:gk,contrato:m.contrato,unidade:m.unidade||'1250070',tdco:m.tdco,base:p.base,dotacoes:[],movimentos:[],objeto:c.objeto,mediaManual:0,manualChaves:new Set()});
  const g=c.grupos.get(gk);g.movimentos.push(m);if(!g.dotacoes.includes(m.dotacao))g.dotacoes.push(m.dotacao);
  const pe=planilha.get(m.chave),man=pe?C(pe.media_manual??pe.Media_Mensal_Manual):0;
  if(man>0&&!g.manualChaves.has(m.chave)){g.manualChaves.add(m.chave);g.mediaManual+=man;}
 }
 const manifest=agruparManifestacoes(dados.manifestacoes||[],exercicio);
 const lista=[];
 for(const c of contratos.values()){
  const cad=cadastro.get(c.chave)||{};
  const ctx={mesAtual,mesesProjecao,mesesAlvo,fimExercicio,exercicio,vigenciaFim:cad.vigencia_fim||null};
  const grupos=[...c.grupos.values()].map(g=>{g.objeto=c.objeto;return analisarGrupo(g,ctx);})
   .sort((a,b)=>(b.reforcoTotal||0)-(a.reforcoTotal||0)||b.empenhado-a.empenhado);
  lista.push(consolidarContrato(c,cad,grupos,ctx,manifest.get(c.chave)));
 }
 lista.sort((a,b)=>ORDEM_SITUACAO[a.situacao.nivel]-ORDEM_SITUACAO[b.situacao.nivel]||(b.reforcoTotal||0)-(a.reforcoTotal||0)||a.titulo.localeCompare(b.titulo));
 return {versao:VERSAO,hoje,exercicio,mesAtual,mesesAlvo,mesesProjecao,contratos:lista,duplicadosIgnorados:duplicados,
  totais:totalizar(lista,mesesAlvo)};
}
const ORDEM_SITUACAO={insuficiente:0,atencao:1,sem_dados:2,coberto:3,unico:4};

function agruparManifestacoes(rows,exercicio){
 const map=new Map();
 for(const r of rows){
  if(Number(r.exercicio)!==Number(exercicio))continue;
  if(!map.has(r.contrato_chave))map.set(r.contrato_chave,[]);
  map.get(r.contrato_chave).push(r);
 }
 for(const arr of map.values())arr.sort((a,b)=>String(a.registrado_em).localeCompare(String(b.registrado_em)));
 return map;
}

function consolidarContrato(c,cad,grupos,ctx,historico){
 const soma=(f)=>grupos.reduce((t,g)=>t+(f(g)||0),0);
 const projetaveis=grupos.filter(g=>g.referencia!==null);
 const porMes=ctx.mesesProjecao.map((m,i)=>{
  const ps=projetaveis.map(g=>g.projecao[i]);
  return {mes:m,alvo:ctx.mesesAlvo.includes(m),corrente:m===ctx.mesAtual,
   despesa:ps.reduce((t,p)=>t+(p.despesa||0),0),reforco:ps.reduce((t,p)=>t+(p.reforco||0),0),
   saldoFim:ps.reduce((t,p)=>t+(p.saldoFim||0),0),saldoUtilizavelFim:ps.reduce((t,p)=>t+Math.max(0,p.saldoFim||0),0),coberto:ps.reduce((t,p)=>t+(p.coberto||0),0)};
 });
 const reforcoTotal=projetaveis.length?soma(g=>g.reforcoTotal):null;
 const semDados=grupos.filter(g=>g.referencia===null&&g.periodicidade!=='sem_movimento');
 // Série mensal consolidada do contrato (todas as linhas), para o gráfico.
 const mesesSerie=new Set();grupos.forEach(g=>g.serie.forEach(x=>mesesSerie.add(x.mes)));
 const serie=[...mesesSerie].sort().map(m=>({mes:m,valor:grupos.reduce((t,g)=>t+(g.serie.find(x=>x.mes===m)?.valor||0),0)}));
 const execMesAtual=soma(g=>g.execMesAtual);
 const mesesSaldo=new Set();grupos.forEach(g=>g.saldoMensal.forEach(x=>mesesSaldo.add(x.mes)));
 const saldoMensal=[...mesesSaldo].sort().map(m=>({mes:m,saldo:grupos.reduce((t,g)=>{const x=g.saldoMensal.filter(y=>y.mes<=m).pop();return t+(x?Math.max(0,x.saldo):0);},0)}));
 const saldo=soma(g=>g.saldo),referencia=projetaveis.length?soma(g=>g.referencia):null;
 const ultima=grupos.map(g=>g.ultimaConformidade).filter(Boolean).sort((a,b)=>b.data.localeCompare(a.data))[0]||null;
 const titulo=tituloContrato(c);
 // ---- Manifestação do fiscal (valor total até o fim do exercício; nunca descontar o saldo de novo) ----
 const hist=historico||[];
 const atual=hist.length?hist[hist.length-1]:null;
 const primeiraPositiva=hist.find(h=>Number(h.valor)>0)||null;
 const manifestacao=atual?{valor:C(atual.valor),em:atual.registrado_em,por:atual.registrado_nome||'',sugestaoNaEpoca:atual.sugestao_sistema==null?null:C(atual.sugestao_sistema),
  original:primeiraPositiva?C(primeiraPositiva.valor):null,originalEm:primeiraPositiva?primeiraPositiva.registrado_em:null,historico:hist}:null;
 // ---- Atendimento: reforços/empenhos efetivamente importados após a primeira manifestação positiva ----
 let atendimento=null;
 if(manifestacao&&manifestacao.valor>0&&primeiraPositiva){
  const desde=String(primeiraPositiva.registrado_em).slice(0,10);
  const movs=c.movs.filter(m=>(m.tipo==='REFORCO_EMPENHO'||m.tipo==='EMPENHO_INICIAL'||m.tipo==='ANULACAO_EMPENHO')&&m.data>=desde);
  const recebido=Math.max(0,movs.reduce((t,m)=>t+m.empenho,0));
  const solicitado=manifestacao.valor;
  const atendido=Math.min(recebido,solicitado);
  atendimento={desde,solicitado,recebido,atendido,pendente:solicitado-atendido,
   status:atendido<=0?'pendente':atendido>=solicitado?'atendida':'parcial',
   movimentos:movs.map(m=>({data:m.data,tipo:m.tipo,valor:m.empenho,chave:m.chave}))};
 }
 const situacao=classificar({grupos,reforcoTotal,porMes,semDados,saldo,referencia});
 const contrato={
  chave:c.chave,titulo,objeto:c.objeto,especificacao:c.especificacao,fornecedor:c.fornecedor,cnpj:c.cnpj,processos:[...c.processos].sort(),
  numeroContrato:(RE_NUM_CONTRATO.exec(c.objeto||'')||[])[1]||null,vigenciaFim:cad.vigencia_fim||null,cadastro:cad,
  grupos,porMes,serie,saldoMensal,execMesAtual,saldo,referencia,reforcoTotal,ultimaConformidade:ultima,
  empenhado:soma(g=>g.empenhado),conformado:soma(g=>g.conformado),
  coberturaMeses:referencia>0?Math.max(saldo,0)/referencia:null,
  cobreAte:projetaveis.length?(porMes.find(p=>p.reforco>0)?.mes||null):null,
  semDados:semDados.length,situacao,manifestacao,atendimento,
  confianca:menorConfianca(grupos)
 };
 contrato.resumo=resumir(contrato,ctx);
 return contrato;
}
const CONF_ORD={nenhuma:0,baixa:1,media:2,alta:3};
function menorConfianca(grupos){const g=grupos.filter(x=>x.periodicidade!=='unico'&&x.periodicidade!=='sem_movimento');if(!g.length)return 'media';return g.map(x=>x.confianca).sort((a,b)=>CONF_ORD[a]-CONF_ORD[b])[0];}
function tituloContrato(c){
 const num=(RE_NUM_CONTRATO.exec(c.objeto||'')||[])[1];
 let obj=String(c.especificacao||c.objeto||'').replace(/\s+/g,' ').trim();
 obj=obj.replace(/^(o objeto do presente contrato é a |contratação de |prestação de |contrato é a contratação de )/i,'');
 obj=obj.charAt(0).toUpperCase()+obj.slice(1);
 if(obj.length>78)obj=obj.slice(0,76).replace(/\s+\S*$/,'')+'…';
 return (num?'Contrato '+num+' · ':'')+(obj||'Contrato sem descrição');
}
function classificar({grupos,reforcoTotal,porMes,semDados,referencia}){
 const ativos=grupos.filter(g=>g.periodicidade!=='sem_movimento');
 if(ativos.length&&ativos.every(g=>g.periodicidade==='unico'))return {nivel:'unico',texto:'Pagamento único / anual'};
 if(referencia===null)return {nivel:'sem_dados',texto:'Histórico insuficiente'};
 const alvo=porMes.filter(p=>p.alvo);
 if(alvo.some(p=>p.reforco>0)||(reforcoTotal||0)>0){
  const primeiro=porMes.find(p=>p.reforco>0);
  return primeiro&&primeiro.corrente?{nivel:'insuficiente',texto:'Saldo não cobre o mês corrente'}:{nivel:'insuficiente',texto:'Reforço necessário'};
 }
 if(semDados.length)return {nivel:'atencao',texto:'Parte sem histórico'};
 const ultimo=porMes[porMes.length-1];
 if(ultimo&&referencia>0&&ultimo.saldoFim<referencia)return {nivel:'atencao',texto:'Saldo justo'};
 return {nivel:'coberto',texto:'Saldo suficiente'};
}
// Frases automáticas, sempre derivadas dos números calculados.
function resumir(c,ctx){
 if(c.situacao.nivel==='unico')return 'Pagamento único registrado; o sistema não projeta mensalidades. Informe a necessidade se houver renovação ou nova parcela até 31/12.';
 if(c.referencia===null)return 'Sem conformidade suficiente para estimar a despesa. A necessidade depende da avaliação do fiscal.';
 // Meses em ordem (mês corrente inteiro + meses-alvo): cobertos, primeiro mês coberto em parte e reforços.
 const meses=c.porMes.filter(p=>p.alvo||p.corrente),frases=[];
 const cobertos=meses.filter(p=>p.reforco===0),faltam=meses.filter(p=>p.reforco>0);
 if(!faltam.length)return 'O saldo cobre '+lista(meses.map(p=>mesLongo(p.mes)))+'.';
 const parcial=faltam[0].coberto>0?faltam[0]:null;
 if(cobertos.length||parcial)frases.push('O saldo cobre '+lista([...cobertos.map(p=>mesLongo(p.mes)),...(parcial?['parte de '+mesLongo(parcial.mes)]:[])])+'.');
 else frases.push('O saldo não cobre '+mesLongo(faltam[0].mes)+'.');
 frases.push((faltam.length===1?'Para '+mesLongo(faltam[0].mes)+', o reforço estimado é de '+brl(faltam[0].reforco):'Reforço estimado: '+lista(faltam.map(p=>brl(p.reforco)+' em '+mesLongo(p.mes))))+'.');
 return frases.join(' ');
}
const lista=a=>a.length<=1?(a[0]||''):a.slice(0,-1).join(', ')+' e '+a[a.length-1];

/* Totais gerenciais. A estimativa do sistema e a manifestação do fiscal NUNCA são somadas para o mesmo
 * contrato: o total de planejamento usa a manifestação quando existe e a estimativa quando não existe,
 * identificando quanto vem de cada origem. Reforço já recebido (atendimento) abate só a manifestação. */
function totalizar(lista,mesesAlvo){
 const t={contratos:lista.length,sistema:0,sistemaPorMes:Object.fromEntries(mesesAlvo.map(m=>[m,0])),correnteSistema:0,
  manifestados:0,semManifestacao:0,semManifestacaoComNecessidade:0,fiscal:0,fiscalPendente:0,atendido:0,
  planejamento:{fiscal:0,sistema:0,total:0},status:{atendida:0,parcial:0,pendente:0},semDados:0,insuficientes:0};
 for(const c of lista){
  const sist=c.reforcoTotal||0;t.sistema+=sist;
  c.porMes.forEach(p=>{if(p.alvo)t.sistemaPorMes[p.mes]=(t.sistemaPorMes[p.mes]||0)+p.reforco;else if(p.corrente)t.correnteSistema+=p.reforco;});
  if(c.situacao.nivel==='sem_dados')t.semDados++;
  if(c.situacao.nivel==='insuficiente')t.insuficientes++;
  if(c.manifestacao){
   t.manifestados++;t.fiscal+=c.manifestacao.valor;
   const pend=c.atendimento?c.atendimento.pendente:c.manifestacao.valor;
   t.fiscalPendente+=pend;t.planejamento.fiscal+=pend;
   if(c.atendimento){t.atendido+=c.atendimento.atendido;t.status[c.atendimento.status]++;}
  }else{
   t.semManifestacao++;if(sist>0)t.semManifestacaoComNecessidade++;
   t.planejamento.sistema+=sist;
  }
 }
 t.planejamento.total=t.planejamento.fiscal+t.planejamento.sistema;
 return t;
}

/* Disponibilidade orçamentária compatível (visão gerencial; conferência V6, NÃO OFICIAL).
 * abatimentos: linhas SIG_V6_ABATIMENTOS (chave → cota usada); dotacoes: SIG_V6_DOTACOES (cota → diferença).
 * Só calcula orçamento adicional quando todos os empenhos do grupo têm cota identificada. */
function disponibilidade(analise,abatimentos,dotacoes){
 if(!abatimentos||!dotacoes)return null;
 const cotaDe=new Map();
 for(const a of abatimentos){const cota=a.cota||'';if(a.chave)cotaDe.set(a.chave,cota);}
 const dif=new Map(dotacoes.map(d=>[d.cota,{diferenca:d.diferenca,leitura:d.leitura||d.cota}]));
 const porCota=new Map(),semCota=[];
 for(const c of analise.contratos){
  const necessidade=c.manifestacao?(c.atendimento?c.atendimento.pendente:c.manifestacao.valor):(c.reforcoTotal||0);
  if(necessidade<=0)continue;
  // Distribui a necessidade do contrato pelos grupos proporcionalmente ao reforço do sistema (ou igualmente).
  const gs=c.grupos.filter(g=>g.periodicidade!=='unico');
  const pesoTotal=gs.reduce((t,g)=>t+(g.reforcoTotal||0),0);
  gs.forEach(g=>{
   const parte=pesoTotal>0?Math.round(necessidade*(g.reforcoTotal||0)/pesoTotal):Math.round(necessidade/gs.length);
   if(parte<=0)return;
   const cotas=[...new Set(g.empenhos.map(k=>cotaDe.get(k)).filter(x=>x!==undefined))];
   if(g.tdco||cotas.length!==1||!cotas[0]||!dif.has(cotas[0])){semCota.push({contrato:c.chave,titulo:c.titulo,grupo:g.chave,valor:parte,motivo:g.tdco?'TDCO: orçamento de outra unidade contábil':'Cota compatível não identificada na conciliação V6'});return;}
   const k=cotas[0];if(!porCota.has(k))porCota.set(k,{cota:k,leitura:dif.get(k).leitura,disponivel:dif.get(k).diferenca,necessidade:0,contratos:[]});
   const e=porCota.get(k);e.necessidade+=parte;e.contratos.push({contrato:c.chave,titulo:c.titulo,valor:parte});
  });
 }
 const cotas=[...porCota.values()].map(e=>({...e,adicional:Math.max(0,e.necessidade-Math.max(0,e.disponivel))})).sort((a,b)=>b.adicional-a.adicional||b.necessidade-a.necessidade);
 return {cotas,semCota,adicional:cotas.reduce((t,e)=>t+e.adicional,0),semCotaTotal:semCota.reduce((t,e)=>t+e.valor,0)};
}

return {VERSAO,C,brl,brlCurto,mesLabel,mesLongo,mesesEntre,proxMes,mesAnterior,contratoChave,partesDotacao,normalizarMovimento,analisar,analisarGrupo,totalizar,disponibilidade,RE_ANUAL};
});
