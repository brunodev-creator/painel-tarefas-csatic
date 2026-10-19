/**
 * SIG CSA-TIC V6 — CONCILIAÇÃO ORÇAMENTÁRIA LOCAL
 * Instalar como SIG_V6_Conciliacao_Atual.gs na planilha agora vai - PLANILHA ATUAL.
 * Atualiza SOMENTE abas SIG_V6_*; não altera DASHBOARD, origens, contratos ou Supabase.
 * A instalação do menu NÃO exige sobrescrever onOpen.
 */
const SIG_V6_FONTE_ATUAL_ID='1dxzDySXU1h5BKJkW1_mHpNX9KRwgX6Ol5b_kRqeRrJA';
function sigV6VerificarOrigemAtual_(){
 const ss=SpreadsheetApp.getActiveSpreadsheet();
 if(ss.getId()!==SIG_V6_FONTE_ATUAL_ID)throw new Error('Execução bloqueada: abra a planilha agora vai - PLANILHA ATUAL.');
 return ss;
}
const SIGV6 = Object.freeze({
 version:'6.0.0', maxRows:30000,maxAlerts:450,
 names:{
  cotas:'IMPORT_SALDOS_BO',ripc:'DESTINACAO_REPASSES',itens:'ITENS_AQUISICAO',
  empenhos:'INDICE_EMPENHOS',continuos:'CONTROLE_SERVICOS_CONTINUOS',
  processos:'CONTROLE_PROCESSOS_COMPRA',correcoes:'SIG_V6_CORRECOES_APROVADAS'},
 outputs:{resumo:'SIG_V6_RESUMO',repasses:'SIG_V6_REPASSES',dotacoes:'SIG_V6_DOTACOES',
 empenhos:'SIG_V6_EMPENHOS',continuos:'SIG_V6_CONTINUOS',alertas:'SIG_V6_ALERTAS',
 abatimentos:'SIG_V6_ABATIMENTOS'}
});
function sigV6InstalarMenu(){
 const ss=SpreadsheetApp.getActiveSpreadsheet();
 const exists=ScriptApp.getProjectTriggers().some(t=>
   t.getHandlerFunction()==='sigV6Menu' && t.getEventType()===ScriptApp.EventType.ON_OPEN);
 if(!exists)ScriptApp.newTrigger('sigV6Menu').forSpreadsheet(ss).onOpen().create();
 sigV6Menu();
}
function sigV6Menu(){
 SpreadsheetApp.getUi().createMenu('SIG V6 (conciliação)')
   .addItem('1. Gerar conciliação local','sigV6GerarRelatorio')
   .addItem('2. Baixar JSON para SIG (local)','sigV6BaixarRelatorio')
   .addItem('3. Publicar abatimentos no DASHBOARD (após conferência)','sigV6PublicarDashboardAtual')
   .addSeparator()
   .addItem('3. Ativar análise automática diária','sigV6AtivarRotinaDiaria')
   .addItem('4. Desativar análise automática','sigV6DesativarRotina')
   .addToUi();
}
/**
 * Ativação EXPLÍCITA pela pessoa com permissão de editar o Apps Script.
 * O acionador é aproximado (janela horária do Apps Script) e não intercepta
 * o e-mail nem os gatilhos já instalados da planilha.
 */
function sigV6AtivarRotinaDiaria(){
 const ui=SpreadsheetApp.getUi(),tz=SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
 const prompt=ui.prompt('Programar conferência diária','Informe uma hora inteira entre 0 e 23 (fuso da planilha: '+tz+
   '). Escolha uma hora posterior à importação automática do Armazém. Exemplo: 10.',ui.ButtonSet.OK_CANCEL);
 if(prompt.getSelectedButton()!==ui.Button.OK)return;
 const raw=prompt.getResponseText().trim();
 if(!/^\d{1,2}$/.test(raw)||Number(raw)>23){ui.alert('Hora inválida. Informe apenas 0 a 23.');return;}
 const hour=Number(raw);
 const existing=ScriptApp.getProjectTriggers().filter(t=>t.getHandlerFunction()==='sigV6Agendado');
 const agree=ui.alert('Confirmar horário','A conferência rodará uma vez ao dia por volta das '+hour+
  'h. Atualiza SOMENTE as novas abas SIG_V6_*. Nenhum dado será transmitido ao SIG remoto. Continuar?',ui.ButtonSet.YES_NO);
 if(agree!==ui.Button.YES)return;
 existing.forEach(t=>ScriptApp.deleteTrigger(t));
 ScriptApp.newTrigger('sigV6Agendado').timeBased().atHour(hour).everyDays(1).create();
 ui.alert('Agendamento ativo: aproximadamente '+hour+'h, conforme horário do projeto Apps Script. '+
   'A execução depende de quotas e das permissões do Google.');
}
function sigV6DesativarRotina(){
 const triggers=ScriptApp.getProjectTriggers().filter(t=>t.getHandlerFunction()==='sigV6Agendado');
 triggers.forEach(t=>ScriptApp.deleteTrigger(t));
 SpreadsheetApp.getUi().alert('Foram removidos '+triggers.length+' acionadores de conferência automática V6.');
}
function sigV6Agendado(){
 const lock=LockService.getDocumentLock();
 if(!lock.tryLock(20000))return;
 const props=PropertiesService.getScriptProperties(),k='SIG_V6_ASSINATURA_ULTIMA_CONCILIACAO';
 let state='SEM_ALTERACOES',hash='',totals='';
 try{
  const result=sigV6Construir_();hash=result.assinatura_geral;
  if(result.alertas.some(x=>x.nivel==='BLOQUEIO'))state='BLOQUEADO_REVISAO';
  else if(props.getProperty(k)!==hash){
   sigV6Escrever_(result);
   props.setProperty(k,hash);
   state='CONCILIACAO_ATUALIZADA';
  }
  totals='Cotas='+result.resumo.cota_liquida_centavos+';RIPC='+result.resumo.ripc_total_centavos+
   ';Alertas='+result.alertas.length;
 }catch(err){
  state='ERRO_EXECUCAO';totals=String(err).slice(0,350);
  throw err;
 }finally{
  try{
   const sh=SpreadsheetApp.getActiveSpreadsheet(),name='SIG_V6_LOG_AUTOMATICO';
   const log=sh.getSheetByName(name)||sh.insertSheet(name);
   if(log.getLastRow()===0)log.appendRow(['Data ISO','Resultado','Assinatura','Diagnóstico']);
   log.appendRow([new Date().toISOString(),state,hash,totals]);
  }finally{lock.releaseLock();}
 }
}

function sigV6GerarRelatorio(){
 const lock=LockService.getDocumentLock();
 if(!lock.tryLock(20000))throw Error('Outra análise está em andamento.');
 try{
  const report=sigV6Construir_();
  sigV6Escrever_(report);
  SpreadsheetApp.getUi().alert('SIG V6: análise local concluída.\nRepasses consolidados: '+
   report.resumo.repasses+'; dotações: '+report.resumo.dotacoes+'; empenhos: '+report.resumo.empenhos+
   '; alertas: '+report.alertas.length+'. Nenhum dado foi enviado à nuvem do SIG.');
 }finally{lock.releaseLock();}
}
function sigV6BaixarRelatorio(){
 const report=sigV6Construir_();
 const json=JSON.stringify(report);
 if(json.length>4500000)throw Error('Prévia muito grande: reduza as linhas ou use apenas as abas locais.');
 const base64=Utilities.base64Encode(Utilities.newBlob(json,'application/json').getBytes());
 const html='<!doctype html><html><head><meta charset="utf-8"><style>body{font:14px Arial,sans-serif;padding:22px;color:#173047}button{background:#108f88;color:white;padding:13px;border:0;border-radius:8px;cursor:pointer}</style></head>'+
 '<body><h3>Conciliação SIG V6</h3><p>Download direto neste navegador. Nenhum dado será transmitido a servidores externos.</p>'+
 '<button id="s">Baixar SIG_V6_CONCILIACAO.json</button><script>document.getElementById("s").onclick=()=>{'+
 'const b=atob("'+base64+'"),u=URL.createObjectURL(new Blob([Uint8Array.from(b,c=>c.charCodeAt(0))],{type:"application/json"}));'+
 'const a=document.createElement("a");a.href=u;a.download="SIG_V6_CONCILIACAO.json";document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),3000)};</script></body></html>';
 SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutput(html).setWidth(490).setHeight(240),'Exportar conciliação local');
}
function sigV6Ler_(name,required,alert){
 const ss=SpreadsheetApp.getActiveSpreadsheet(),sh=ss.getSheetByName(name);
 if(!sh){alert('BLOQUEIO','ABA_AUSENTE',name,0,'Aba obrigatória inexistente');return [];}
 const rows=sh.getDataRange().getDisplayValues();
 if(rows.length>SIGV6.maxRows)alert('BLOQUEIO','LIMITE_LINHAS',name,0,'Aba supera '+SIGV6.maxRows+' linhas');
 const heads=(rows[0]||[]).map(sigV6NormalHeader_),idx=Object.create(null);
 heads.forEach((h,i)=>{if(h&&!Object.prototype.hasOwnProperty.call(idx,h))idx[h]=i;});
 const missing=required.filter(k=>!(sigV6NormalHeader_(k) in idx));
 if(missing.length){alert('BLOQUEIO','COLUNAS_AUSENTES',name,1,'Colunas: '+missing.join(', '));return [];}
 const out=[];
 for(let i=1;i<Math.min(rows.length,SIGV6.maxRows);i++){
  const row=rows[i];if(!row.some(x=>String(x).trim()))continue;
  out.push({linha:i+1,get:(k)=>{const j=idx[sigV6NormalHeader_(k)];return j===undefined?'':String(row[j]??'').trim();}});
 }
 return out;
}
function sigV6NormalHeader_(s){return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');}
function sigV6Digits_(v){return String(v||'').replace(/\D/g,'');}
function sigV6Year_(v){const n=sigV6Digits_(v);return n.length===4?n:'';}
function sigV6Doc_(v){const x=sigV6Digits_(v);return x?String(Number(x)):'';}
/* Global: OOEE (do BO) => EE00 para chave, EEXX para exibição.
   Item definido EE01..EE99 permanece separado. Original sempre preservado. */
const SIGV6_DOT_SIZES=[4,2,3,3,4,4,4,4,2,1,1];
function sigV6DotFromDigits_(d){
 if(!/^\d{32}$/.test(d))return null;const a=[];let p=0;
 for(const n of SIGV6_DOT_SIZES){a.push(d.slice(p,p+n));p+=n;}
 return a;
}
function sigV6Dot_(v){
 const raw=String(v??'').trim().toUpperCase();if(!raw)return '';
 const seg=raw.split('.');
 if(seg.length===11){
  if(!seg.every((x,i)=>new RegExp('^\\d{'+SIGV6_DOT_SIZES[i]+'}$').test(x)||(i===7&&/^\d{2}XX$/.test(x))))return '';
  if(/^00\d{2}$/.test(seg[7]))seg[7]=seg[7].slice(2)+'00';
  else if(/^\d{2}XX$/.test(seg[7]))seg[7]=seg[7].slice(0,2)+'00';
  return seg.join('');
 }
 if(raw.includes('XX'))return ''; // XX sem delimitador: nunca remover posições
 const digits=sigV6Digits_(raw),p=sigV6DotFromDigits_(digits);
 if(p&&/^00\d{2}$/.test(p[7])){p[7]=p[7].slice(2)+'00';return p.join('');}
 return digits;
}
function sigV6DotInfo_(v){
 const code=sigV6Dot_(v),p=sigV6DotFromDigits_(code);
 if(!p)return {codigo:code,exibicao:code,tipo:'FORMATO_A_CONFERIR',conta:''};
 const el=p[7].slice(0,2),isGlobal=p[7].slice(2)==='00',view=p.slice();
 if(isGlobal)view[7]=el+'XX';
 return {codigo:code,exibicao:view.join('.'),tipo:isGlobal?'GLOBAL':'ITEM_DEFINIDO',conta:isGlobal?'998020301':'998020302'};
}
function sigV6Key_(year,doc,dot){return [sigV6Year_(year),sigV6Doc_(doc),sigV6Dot_(dot)].join('|');}

/** Mesmos campos da dotação; somente a cauda de item vira XX/00.
 * Exemplo 5207 -> 5200; nunca ignora fonte, ação, unidade ou outros campos.
 */
function sigV6GlobalDoItem_(dot) {
 const p=sigV6DotFromDigits_(sigV6Dot_(dot));
 if(!p)return '';
 p[7]=p[7].slice(0,2)+'00';
 return p.join('');
}
/** Códigos de empenho de 31 dígitos: acrescenta zero no ponto conhecido SOMENTE
 * quando a dotação específica OU global correspondente existe nas cotas.
 */
function sigV6DotEmpenhoParaAbate_(emp, cotasConhecidas) {
 // A correção histórica foi aprovada e validada contra a cota na construção
 // do índice. Não voltar ao valor bruto nesta segunda etapa.
 if(emp.normalizacao_dotacao==='FUNCIONAL_0000_PARA_0001_APROVADA'&&
    sigV6DotFromDigits_(emp.dotacao)&&cotasConhecidas.has(emp.dotacao))return emp.dotacao;
 const raw=sigV6Dot_(emp.dotacao_orig||emp.dotacao);
 if(sigV6DotFromDigits_(raw))return raw;
 if(raw.length===31&&raw.startsWith('12516')){
  const candid=raw.slice(0,4)+'0'+raw.slice(4),global=sigV6GlobalDoItem_(candid);
  if(cotasConhecidas.has(candid)||(global&&cotasConhecidas.has(global)))return candid;
 }
 return raw;
}
/* Correções históricas autorizadas são armazenadas EXCLUSIVAMENTE na aba privada
 * SIG_V6_CORRECOES_APROVADAS. Não publicar números de empenho/dotação reais no GitHub.
 * Os originais e a justificativa permanecem nessa aba para rastreabilidade.
 */
const SIGV6_UE_COTAS='1250070';
function sigV6ValidarCorrecoes_(registros,cotasConhecidas,alert){
 const aprovadas=Object.create(null);
 for(const r of registros){
  const id=r.get('Chave_Empenho'),status=r.get('Status').toUpperCase();
  if(status!=='APROVADO')continue;
  const origem=sigV6Dot_(r.get('Dotacao_Original'));
  const destino=sigV6Dot_(r.get('Dotacao_Corrigida'));
  const antiga=sigV6DotFromDigits_(origem),nova=sigV6DotFromDigits_(destino);
  const correta=antiga&&nova&&antiga[5]==='0000'&&nova[5]==='0001'&&
   antiga.every((v,i)=>i===5||v===nova[i])&&
   cotasConhecidas.has(destino)&&!cotasConhecidas.has(origem);
  if(!id||!correta||aprovadas[id]){
   alert('ATENCAO','CORRECAO_HISTORICA_NAO_VALIDADA',SIGV6.names.correcoes,r.linha,
    'Correção não aplicada: '+(id||'identificador ausente')+
    '. Conferir código original, alteração exclusiva de 0000 para 0001, duplicidade ou existência de cota.');
   continue;
  }
  aprovadas[id]={original:origem,correto:destino,justificativa:r.get('Justificativa')};
 }
 return aprovadas;
}
function sigV6CorrigirFuncionalHistorica_(chave,dotOrigem,dotacoesCotas,aprovadas){
 const origem=sigV6Dot_(dotOrigem),regra=aprovadas[chave];
 if(!regra)return {dotacao:origem,normalizacao:'',detalhe:''};
 if(origem!==regra.original||!dotacoesCotas.has(regra.correto)){
  return {dotacao:origem,normalizacao:'',
   detalhe:'Correção aprovada não aplicada porque o valor original ou a cota já não corresponde ao registro autorizado.'};
 }
 return {dotacao:regra.correto,normalizacao:'FUNCIONAL_0000_PARA_0001_APROVADA',
  detalhe:'Correção histórica validada na aba privada. '+(regra.justificativa||'Código original preservado.')};
}

function sigV6DataISO_(raw){
 const text=String(raw||'').trim();
 let m=text.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
 if(m)return m[3]+'-'+m[2]+'-'+m[1];
 m=text.match(/^(\d{4})-(\d{2})-(\d{2})/);
 return m?m[1]+'-'+m[2]+'-'+m[3]:'';
}
/** Relacionamento gerencial, nunca lançamento contábil. Não compara montantes:
 * - somente específica: ABATIDO_ESPECIFICA
 * - somente global: ABATIDO_GLOBAL
 * - ambas: AMBIGUA_SEM_ABATE
 * - nenhuma: SEM_COTA
 * Um empenho positivo é atribuído uma só vez, não se desconta RIPC novamente.
 */
function sigV6ConciliarAbatimentos_(repasses, empenhos, alert){
 const cotas=new Set(repasses.filter(x=>x.quantidade_movimentos>0).map(x=>x.dotacao));
 const totals=Object.create(null),out=[];
 for(const e of empenhos){
  const value=e.empenhado_liquido_centavos;
  const dot=sigV6DotEmpenhoParaAbate_(e,cotas);
  const global=sigV6GlobalDoItem_(dot);
  const exact=!!dot&&cotas.has(dot);
  const viaGlobal=!!global&&global!==dot&&cotas.has(global);
  let status,target='',descricao='';
  if(e.eh_tdco){status='TDCO_FORA_ESCOPO';descricao='Empenho TDCO em outra unidade contábil: não abater cotas das contas 998020301/998020302 da UE 1250070.';}
  else if(e.fora_unidade_cotas){status='OUTRA_UNIDADE_FORA_ESCOPO';descricao='Unidade contábil '+e.unidade_contabil_executora+' diferente da UE 1250070; não abater.';}
  else if(value===0){status='SEM_VALOR_LIQUIDO';descricao='Empenho sem valor líquido positivo.';}
  else if(value<0){status='VALOR_NEGATIVO_CONFERIR';descricao='Valor líquido negativo: exige conferência.';}
  else if(!sigV6DotFromDigits_(dot)){status='CODIGO_INCOMPLETO';descricao='Dotação não normalizada com segurança.';}
  else if(exact&&viaGlobal){status='AMBIGUA_SEM_ABATE';descricao='Cota específica e global coexistem: aguardar escolha.';}
  else if(exact){status='ABATIDO_ESPECIFICA';target=dot;descricao='Somente a dotação específica existe no conjunto de cotas.';}
  else if(viaGlobal){status='ABATIDO_GLOBAL';target=global;descricao='Somente a dotação global do mesmo elemento e demais campos existe.';}
  else {status='SEM_COTA';descricao='Nenhuma dotação específica ou global correspondente.';}
  if(target)totals[target]=(totals[target]||0)+value;
  if(status==='AMBIGUA_SEM_ABATE')alert('ATENCAO','ABATE_AMBIGUO',SIGV6.names.empenhos,0,
    'Empenho '+e.chave_empenho+': existem cotas específica e global; sem abatimento automático.');
  if(status==='SEM_COTA'||status==='CODIGO_INCOMPLETO'||status==='VALOR_NEGATIVO_CONFERIR')
   alert('ATENCAO','ABATE_'+status,SIGV6.names.empenhos,0,
    'Empenho '+e.chave_empenho+': '+descricao);
  out.push({chave_empenho:e.chave_empenho,processo:e.processo,dotacao_empenho:dot,
   dotacao_empenho_original:e.dotacao_orig,dotacao_global_candidata:global,
   dotacao_de_abate:target,status,descricao,valor_empenhado_liquido_centavos:value,
   cota_especifica_existe:exact,cota_global_existe:viaGlobal,
   tipo_execucao_contabil:e.classificacao,eh_tdco:!!e.eh_tdco,
   unidade_contabil_executora:e.unidade_contabil_executora,
   dotacao_texto_fonte:e.dotacao_texto_fonte,
   normalizacao_dotacao:e.normalizacao_dotacao,detalhe_normalizacao:e.detalhe_normalizacao,
   referencia:'Posição dos dados importados; não individualiza documento de repasse.'});
 }
 return {registros:out,abatidoPorDot:totals};
}

function sigV6Reais_(value){
 if(typeof value==='number')return Number.isFinite(value)?Math.round(value*100):null;
 let s=String(value||'').trim();if(!s)return null;
 let negative=/^\(/.test(s)||/^-/.test(s);
 s=s.replace(/[^0-9.,]/g,'');
 if(!s)return null;
 const comma=s.lastIndexOf(','),dot=s.lastIndexOf('.');
 let decimals='';
 if(comma>=0 && (dot<0||comma>dot))decimals=',';
 else if(dot>=0&&s.length-dot-1<=2)decimals='.';
 let str=decimals?s.slice(0,s.lastIndexOf(decimals)).replace(/[.,]/g,'')+'.'+s.slice(s.lastIndexOf(decimals)+1):s.replace(/[.,]/g,'');
 if(!/^\d+(?:\.\d{1,2})?$/.test(str))return null;
 const [integer,fraction='']=str.split('.');
 const n=Number(integer)*100+Number((fraction+'00').slice(0,2));
 return Number.isSafeInteger(n)?(negative?-n:n):null;
}
/* Valor_RIPC, Valor_Total_Repasse e Valor_Total dos itens são montantes em REAIS.
 * O valor 1141390 equivale a R$ 1.141.390,00; 105711,2 a R$ 105.711,20.
 * O parser retorna centavos apenas para CÁLCULO INTERNO (não é a unidade da fonte).
 */
function sigV6CentavosOrigem_(value){return sigV6Reais_(value);}
function sigV6Sha_(v){
 const bytes=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,String(v),Utilities.Charset.UTF_8);
 return bytes.map(b=>('0'+(b<0?b+256:b).toString(16)).slice(-2)).join('');
}
function sigV6Construir_(){
 const now=new Date().toISOString(),notices=[],max=SIGV6.maxAlerts;
 const alert=(nivel,codigo,aba,linha,mensagem)=>{
  if(notices.length<max)notices.push({nivel,codigo,aba,linha,mensagem});
 };
 const cotas=sigV6Ler_(SIGV6.names.cotas,['Ano','Doc_Repasse','Dotacao','Valor_Descentralizado'],alert);
 const dests=sigV6Ler_(SIGV6.names.ripc,['ID_RIPC','Ano','Doc_Repasse','Dotacao','Valor_RIPC'],alert);
 const itens=sigV6Ler_(SIGV6.names.itens,['ID_Item_RIPC','ID_RIPC','Valor_Total'],alert);
 const emps=sigV6Ler_(SIGV6.names.empenhos,['Chave_Empenho','Dotacao','Total_Empenhado_Liquido','Saldo_Atual_Empenho'],alert);
 const continuos=sigV6Ler_(SIGV6.names.continuos,['Chave_Empenho','Saldo_Atual_Empenho'],alert);
 const processos=sigV6Ler_(SIGV6.names.processos,['ID_Processo','Processo_Compra','Status_Processo'],alert);
 // Aba privada opcional: nenhuma correção é inferida nem publicada no código público.
 const correcaoSheet=SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SIGV6.names.correcoes);
 const registrosCorrecao=correcaoSheet?
  sigV6Ler_(SIGV6.names.correcoes,['Chave_Empenho','Dotacao_Original','Dotacao_Corrigida','Status','Justificativa'],alert):[];
 const byCota=Object.create(null),byRipc=Object.create(null),byDot=Object.create(null),byEmp=Object.create(null);
 const itemByRipc=Object.create(null),continuosOut=[],processosOut=[];const dotacaoCotasConhecidas=new Set();let empenhosNormalizados=0,empenhosComCota=0;
 const ensureDot=(key)=>byDot[key]||(byDot[key]={dotacao:key,cotas_centavos:0,ripc_centavos:0,empenhado_liquido_centavos:0,
    saldo_empenhos_centavos:0,documentos:0,empenhos:0,avisos:[],origens_bo:[]});
 const origemDot=(code,raw)=>{if(!code||!raw)return;const o=ensureDot(code).origens_bo;if(!o.includes(raw))o.push(raw);};
 const cotaFingerprint=Object.create(null);
 for(const r of cotas){
  const y=sigV6Year_(r.get('Ano')),doc=sigV6Doc_(r.get('Doc_Repasse')),dot=sigV6Dot_(r.get('Dotacao'));
  const key=sigV6Key_(y,doc,dot),value=sigV6Reais_(r.get('Valor_Descentralizado'));
  if(dot)dotacaoCotasConhecidas.add(dot);
  if(!y||!doc||dot.length<10||value===null){alert('BLOQUEIO','COTA_INVALIDA',SIGV6.names.cotas,r.linha,'Ano, documento, dotação ou valor inválido');continue;}
  origemDot(dot,r.get('Dotacao'));
  const unique=key+'|'+r.get('Linha_Original')+'|'+value;
  if(cotaFingerprint[unique])alert('BLOQUEIO','MOVIMENTO_IDÊNTICO',SIGV6.names.cotas,r.linha,'Movimentação idêntica à linha '+cotaFingerprint[unique]);else cotaFingerprint[unique]=r.linha;
  const c=byCota[key]||(byCota[key]={chave:key,ano:y,documento:doc,dotacao:dot,credito_liquido_centavos:0,valor_ripc_centavos:0,
    quantidade_movimentos:0,quantidade_ripc:0,linhas:[],origens_bo:[]});
  if(!c.origens_bo.includes(r.get('Dotacao')))c.origens_bo.push(r.get('Dotacao'));
  c.credito_liquido_centavos+=value;c.quantidade_movimentos++;c.linhas.push(r.linha);
 }
 const itemSeen=Object.create(null);
 for(const r of itens){
  const id=r.get('ID_Item_RIPC'),ripcId=r.get('ID_RIPC'),value=sigV6CentavosOrigem_(r.get('Valor_Total'));
  if(!id||!ripcId||value===null){alert('BLOQUEIO','ITEM_INVALIDO',SIGV6.names.itens,r.linha,'Identificador ou valor do item inválido');continue;}
  if(itemSeen[id]){alert('BLOQUEIO','ITEM_DUPLICADO',SIGV6.names.itens,r.linha,'ID_Item_RIPC repetido: '+id);continue;}
  itemSeen[id]=true;
  const g=itemByRipc[ripcId]||(itemByRipc[ripcId]={centavos:0,itens:0});
  g.centavos+=value;g.itens++;
 }
 const ripcSeen=Object.create(null),noCota=[];
 for(const r of dests){
  const id=r.get('ID_RIPC'),year=sigV6Year_(r.get('Ano')),doc=sigV6Doc_(r.get('Doc_Repasse')),dot=sigV6Dot_(r.get('Dotacao'));
  const key=sigV6Key_(year,doc,dot),value=sigV6CentavosOrigem_(r.get('Valor_RIPC'));
  if(!id||!year||!doc||dot.length<10||value===null){alert('BLOQUEIO','RIPC_INVALIDO',SIGV6.names.ripc,r.linha,'RIPC, chave ou valor inválido');continue;}
  if(ripcSeen[id]){alert('BLOQUEIO','RIPC_DUPLICADO',SIGV6.names.ripc,r.linha,'ID_RIPC duplicado: '+id);continue;}
  ripcSeen[id]=true;
  origemDot(dot,r.get('Dotacao'));
  const totalItens=itemByRipc[id];
  if(!totalItens)alert('ATENCAO','RIPC_SEM_ITEM',SIGV6.names.ripc,r.linha,'RIPC não possui itens vinculados: '+id);
  else if(totalItens.centavos!==value)alert('ATENCAO','RIPC_DIFERENCA_ITENS',SIGV6.names.ripc,r.linha,
      'RIPC '+id+': diferença de '+(value-totalItens.centavos)+' centavos em relação aos itens');
  byRipc[id]={id_ripc:id,chave_repasse:key,valor_ripc_centavos:value,itens_centavos:totalItens?.centavos??null,
   quantidade_itens:totalItens?.itens??0,dotacao:dot,dotacao_original:r.get('Dotacao'),
   tipo_dotacao:sigV6DotInfo_(dot).tipo,processo_informado:r.get('Processo_Compra')||'',
   referencia:r.get('Objeto_Geral').slice(0,110)};
  if(byCota[key]){byCota[key].valor_ripc_centavos+=value;byCota[key].quantidade_ripc++;}
  else noCota.push(key);
 }
 Object.keys(itemByRipc).forEach(id=>{if(!ripcSeen[id])alert('ATENCAO','ITEM_SEM_RIPC',SIGV6.names.itens,0,'Itens vinculados a RIPC ausente: '+id);});
 const repasses=Object.values(byCota).map(c=>{
  c.diferenca_nao_destinada_centavos=c.credito_liquido_centavos-c.valor_ripc_centavos;
  c.situacao=c.quantidade_ripc===0?(c.credito_liquido_centavos<0?'COTA_NEGATIVA_SEM_RIPC':'SEM_RIPC'):
    c.diferenca_nao_destinada_centavos<0?'RIPC_SUPERA_DOCUMENTO':'CONCILIADO_ARITMETICAMENTE';
  if(c.situacao==='RIPC_SUPERA_DOCUMENTO')
    alert('ATENCAO','RIPC_SUPERA_DOCUMENTO',SIGV6.names.ripc,0,
     'Documento '+c.ano+'/'+c.documento+' possui RIPC acima da cota líquida (pode haver utilização de outra fonte ou ajuste)');
  const d=ensureDot(c.dotacao);d.cotas_centavos+=c.credito_liquido_centavos;
  d.ripc_centavos+=c.valor_ripc_centavos;d.documentos++;
  return c;
 }).sort((a,b)=>a.chave.localeCompare(b.chave));
 const orphan=[...new Set(noCota)];
 orphan.forEach(key=>{
  const rows=Object.values(byRipc).filter(x=>x.chave_repasse===key);
  const total=rows.reduce((n,x)=>n+x.valor_ripc_centavos,0);
  const dot=key.split('|')[2];ensureDot(dot).ripc_centavos+=total;
  alert('ATENCAO','RIPC_SEM_COTA',SIGV6.names.ripc,0,'RIPC sem documento de cota correspondente: '+key);
  repasses.push({chave:key,ano:key.split('|')[0],documento:key.split('|')[1],dotacao:dot,origens_bo:[],
   credito_liquido_centavos:null,valor_ripc_centavos:total,quantidade_movimentos:0,quantidade_ripc:rows.length,
   diferenca_nao_destinada_centavos:null,situacao:'SEM_COTA_CORRESPONDENTE',linhas:[]});
 });
 const correcoesAprovadas=sigV6ValidarCorrecoes_(registrosCorrecao,dotacaoCotasConhecidas,alert);
 const empSeen=Object.create(null),empenhos=[];
 for(const r of emps){
  const id=r.get('Chave_Empenho'),dotOrigem=sigV6Dot_(r.get('Dotacao'));
  const tipoExecucao=r.get('Tipo_Execucao_Contabil')||'';
  const unidade=sigV6Digits_(r.get('Unidade_Contabil_Executora'));
  const ehTdco=r.get('Eh_TDCO').trim().toUpperCase()==='SIM'||tipoExecucao.trim().toUpperCase()==='TDCO';
  const foraUE=!!unidade&&unidade!==SIGV6_UE_COTAS;
  const correcao=sigV6CorrigirFuncionalHistorica_(id,dotOrigem,dotacaoCotasConhecidas,correcoesAprovadas);
  let dot=correcao.dotacao;
  if(correcao.normalizacao)empenhosNormalizados++;
  if(correcao.detalhe&&!correcao.normalizacao)alert('ATENCAO','NORMALIZACAO_FUNCIONAL_PENDENTE',
     SIGV6.names.empenhos,r.linha,'Empenho '+id+': '+correcao.detalhe);
  // O preenchimento em dotações compactas é mantido APENAS quando há cota idêntica.
  if(!correcao.normalizacao&&dot.length===31 && dot.startsWith('12516')){
    const candidata=dot.slice(0,4)+'0'+dot.slice(4);
    if(dotacaoCotasConhecidas.has(candidata)){dot=candidata;empenhosNormalizados++;}
  }
  if(!ehTdco&&!foraUE&&dotacaoCotasConhecidas.has(dot))empenhosComCota++;
  if(!id||dot.length<10){alert('BLOQUEIO','EMPENHO_IDENTIFICACAO',SIGV6.names.empenhos,r.linha,'Chave ou dotação inválida');continue;}
  if(empSeen[id]){alert('BLOQUEIO','EMPENHO_DUPLICADO',SIGV6.names.empenhos,r.linha,'Chave repetida: '+id);continue;}
  empSeen[id]=true;
  const liquid=sigV6Reais_(r.get('Total_Empenhado_Liquido')),saldo=sigV6Reais_(r.get('Saldo_Atual_Empenho'));
  if(liquid===null||saldo===null){alert('BLOQUEIO','EMPENHO_VALORES',SIGV6.names.empenhos,r.linha,'Montante empenhado ou saldo inválido');continue;}
  const e={chave_empenho:id,processo:r.get('Processo_Compra'),dotacao:dot,dotacao_orig:dotOrigem,
    dotacao_texto_fonte:r.get('Dotacao'),normalizacao_dotacao:correcao.normalizacao,
    detalhe_normalizacao:correcao.detalhe,
    unidade_contabil_executora:unidade,eh_tdco:ehTdco,fora_unidade_cotas:foraUE,
    empenhado_liquido_centavos:liquid,saldo_informado_centavos:saldo,
    classificacao:tipoExecucao,historico:r.get('Data_Atualizacao')||''};
  empenhos.push(e);byEmp[id]=e;
  // TDCO/OU outra unidade não entra em agregações nem abatimentos das contas da UE 1250070.
  if(!ehTdco&&!foraUE){
   const d=ensureDot(dot);origemDot(dot,r.get('Dotacao'));
   d.empenhado_liquido_centavos+=liquid;d.saldo_empenhos_centavos+=saldo;d.empenhos++;
  }
 }
 const seenContinuous=Object.create(null);
 for(const r of continuos){
  const key=r.get('Chave_Empenho');if(!key)continue;
  if(seenContinuous[key]){alert('BLOQUEIO','SERVICO_DUPLICADO',SIGV6.names.continuos,r.linha,'Empenho repetido: '+key);continue;}
  seenContinuous[key]=true;
  const suggested=sigV6Reais_(r.get('Valor_Reforco_Sugerido')),saldo=sigV6Reais_(r.get('Saldo_Atual_Empenho'));
  if(r.get('Valor_Reforco_Sugerido')&&suggested===null)alert('ATENCAO','REFORCO_INVALIDO',SIGV6.names.continuos,r.linha,'Valor de reforço não numérico');
  if(!byEmp[key])alert('ATENCAO','CONTINUO_SEM_EMPENHO',SIGV6.names.continuos,r.linha,'Serviço sem correspondente no índice de empenhos: '+key);
  continuosOut.push({chave_empenho:key,processo:r.get('Processo_Compra'),dotacao:sigV6Dot_(r.get('Dotacao')),
   status:r.get('Status_Servico'),provavel_servico:r.get('Provavel_Servico_Continuo'),
   alerta:r.get('Alerta'),saldo_informado_centavos:saldo,reforco_sugerido_centavos:suggested,
   tipo_execucao:r.get('Tipo_Execucao_Contabil'),classificacao:r.get('Motivo_Classificacao')});
 }
 for(const r of processos){
  if(r.get('ID_Processo'))processosOut.push({id:r.get('ID_Processo'),numero:r.get('Processo_Compra'),
   status:r.get('Status_Processo'),controle:r.get('Tipo_Controle_Orcamentario'),
   valor_homologado_centavos:sigV6Reais_(r.get('Valor_Final_Homologado'))});
 }
 const retornoAbate=sigV6ConciliarAbatimentos_(repasses,empenhos,alert);
 const abatimentos=retornoAbate.registros,abatidoPorDot=retornoAbate.abatidoPorDot;
 // Presença de cotas só pode ser apurada na posição importada.
 // A data de processamento do relatório NÃO demonstra existência de saldo naquela data.
 const datasCota=[...new Set(cotas.map(x=>sigV6DataISO_(x.get('Data_Importacao'))).filter(Boolean))].sort();
 const dataCotas=datasCota.length?datasCota[datasCota.length-1]:'';
 const tz=SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
 const hoje=Utilities.formatDate(new Date(),tz,'yyyy-MM-dd');
 if(!dataCotas||dataCotas!==hoje)alert('ATENCAO','POSICAO_HISTORICA_COTAS',SIGV6.names.cotas,0,
   'Cotas com última data de importação '+(dataCotas||'não informada')+
   '; não é possível garantir quais dotações existiam em '+hoje+'. Abatimento gerencial apenas na posição importada.');
 const dotacoes=Object.values(byDot).map(d=>({
  ...d,dotacao_exibicao:sigV6DotInfo_(d.dotacao).exibicao,
  tipo_dotacao:sigV6DotInfo_(d.dotacao).tipo,
  conta_controle:sigV6DotInfo_(d.dotacao).conta,
  abatido_sig_centavos:abatidoPorDot[d.dotacao]||0,
  diferenca_gerencial_centavos:d.cotas_centavos-(abatidoPorDot[d.dotacao]||0),
  criterio_abate:'Somente uma dotação (específica ou global) presente nas cotas. RIPC não descontado novamente. Posição histórica.',
  nao_destinado_teorico_centavos:d.cotas_centavos-d.ripc_centavos,
  criterio:'Cota líquida menos RIPC na mesma dotação; NÃO representa saldo oficial disponível para empenhar.',
  observacao_empenhos:'Empenhos agrupados apenas por dotação; vínculo direto a documento de repasse NÃO foi comprovado.'
 })).sort((a,b)=>a.dotacao.localeCompare(b.dotacao));
 const rawCotas=repasses.filter(x=>x.credito_liquido_centavos!==null);
 const summary={repasses:repasses.length,dotacoes:dotacoes.length,ripcs:Object.keys(byRipc).length,
   regra_dotacao_global_v2:true,regra_mestre_abate_v1:true,
   referencia_cotas_data:dataCotas,posicao_cotas_atualizada_hoje:dataCotas===hoje,
   empenhos_abatidos:abatimentos.filter(x=>x.dotacao_de_abate).length,
   empenhos_abatidos_globais:abatimentos.filter(x=>x.status==='ABATIDO_GLOBAL').length,
   empenhos_abatidos_especificos:abatimentos.filter(x=>x.status==='ABATIDO_ESPECIFICA').length,
   empenhos_ambiguos:abatimentos.filter(x=>x.status==='AMBIGUA_SEM_ABATE').length,
   empenhos_sem_cota:abatimentos.filter(x=>x.status==='SEM_COTA'||x.status==='CODIGO_INCOMPLETO').length,
   regra_exclusao_tdco_v1:true,regra_normalizacao_historica_v1:true,
   empenhos_tdco_listados:abatimentos.filter(x=>x.status==='TDCO_FORA_ESCOPO').length,
   empenhos_outra_ue_listados:abatimentos.filter(x=>x.status==='OUTRA_UNIDADE_FORA_ESCOPO').length,
   valor_tdco_sem_abate_centavos:abatimentos.filter(x=>x.status==='TDCO_FORA_ESCOPO').reduce((a,x)=>a+x.valor_empenhado_liquido_centavos,0),
   empenhos_dota_corrigidos:abatimentos.filter(x=>x.normalizacao_dotacao==='FUNCIONAL_0000_PARA_0001_APROVADA').length,
   valor_abatido_gerencial_centavos:abatimentos.filter(x=>x.dotacao_de_abate)
       .reduce((sum,x)=>sum+x.valor_empenhado_liquido_centavos,0),
   dotacoes_globais:dotacoes.filter(x=>x.tipo_dotacao==='GLOBAL'&&x.documentos>0).length,
   cota_global_centavos:dotacoes.filter(x=>x.tipo_dotacao==='GLOBAL').reduce((a,b)=>a+b.cotas_centavos,0),
   itens:Object.keys(itemSeen).length,empenhos:empenhos.length,continuos:continuosOut.length,
   processos:processosOut.length,empenhos_com_dotacao_de_cota:empenhosComCota,empenhos_dotacao_normalizada:empenhosNormalizados,
   cota_liquida_centavos:rawCotas.reduce((n,x)=>n+x.credito_liquido_centavos,0),
   ripc_total_centavos:Object.values(byRipc).reduce((n,x)=>n+x.valor_ripc_centavos,0),
   documentos_sem_cota:orphan.length,
   repasses_superados:repasses.filter(x=>x.situacao==='RIPC_SUPERA_DOCUMENTO').length,
   diferenca_global_informativa_centavos:rawCotas.reduce((n,x)=>n+x.credito_liquido_centavos,0)-
     Object.values(byRipc).reduce((n,x)=>n+x.valor_ripc_centavos,0),
   empenho_liquido_total_centavos:empenhos.reduce((n,x)=>n+x.empenhado_liquido_centavos,0)};
 const report={sig_version:'6.0.0',tipo:'CONCILIACAO_LOCAL',origem:'Planilha: '+SpreadsheetApp.getActiveSpreadsheet().getName(),
  gerado_em:now,referencia_arquivo:'Posição das abas conforme última importação; não significa dados de hoje.',
  resumo:summary,repasses,dotacoes,abatimentos,ripcs:Object.values(byRipc),empenhos,continuos:continuosOut,
  processos:processosOut,alertas:notices,
  avisos_metodologicos:[
   'RIPC e Valor_Total de itens são valores em REAIS, mesmo quando inteiros e sem R$; o parser converte para centavos apenas internamente.',
   'Valor_Total_Repasse no RIPC é referência documental repetida e NÃO é somado.',
   'Diferenças negativas por documento são alertas para conferência, não prova de irregularidade.',
   'Posição financeira por dotação não identifica qual documento de repasse financiou cada empenho.',
   'Códigos compactos de empenho só recebem zero à esquerda se houver correspondência EXATA de uma dotação de cota; casos restantes não são relacionados por aproximação.',
   'Elemento sem item: código BO 00EE é interpretado como EE00 na chave numérica e EEXX na exibição, conforme orientação CSA-TIC. Original preservado.',
   'Recursos globais (conta 998020301) e específicos (conta 998020302) não são conciliados automaticamente entre si ou com um documento de repasse.',
   'Regra mestre: abate valor líquido positivo de cada empenho UMA vez na dotação presente nas cotas. Se coexistirem dotação específica e global: alerta, sem escolha nem abatimento automático.',
   'O valor da cota não precisa coincidir com o empenho; não se reutiliza o valor do RIPC como novo gasto.',
   'TDCO ou empenho de unidade contábil diferente da 1250070: apenas listado, jamais abatido das contas 998020301 e 998020302.',
   'Correção histórica de 0000 para 0001 exige aprovação registrada por chave de empenho na SIG_V6_CORRECOES_APROVADAS, correspondência exata e cota existente. Códigos originais preservados.',
   'Diferença gerencial (cotas menos abatimentos) pode ser negativa e não é saldo oficial nem prova de insuficiência do SIAFI. Somente a data de posição das cotas, e não a geração do relatório, indica até quando é possível inferir presença de dotação.',
   'Disponibilidade para empenhar, reforço de contrato e classificação de serviço contínuo exigem conferência oficial.'
  ]};
 report.assinatura_geral=sigV6Sha_(JSON.stringify({regra_dotacao_global_v2:true,regra_mestre_abate_v1:true,regra_exclusao_tdco_v1:true,regra_normalizacao_historica_v1:true,referencia_cotas:dataCotas,abatimentos:abatimentos.map(x=>[x.chave_empenho,x.status,x.dotacao_de_abate]),repasses:repasses.map(x=>[x.chave,x.credito_liquido_centavos,x.valor_ripc_centavos]),
   empenhos:empenhos.map(x=>[x.chave_empenho,x.empenhado_liquido_centavos,x.saldo_informado_centavos]),
   continuos:continuosOut.map(x=>[x.chave_empenho,x.reforco_sugerido_centavos])}));
 return report;
}
function sigV6CriarAba_(ss,name,headers,rows){
 const sh=ss.getSheetByName(name)||ss.insertSheet(name);
 sh.clearContents();
 const vals=[headers].concat(rows).map(x=>x.map(v=>(v===undefined||v===null)?'':v));
 if(vals.length>1 || headers.length)sh.getRange(1,1,vals.length,headers.length).setValues(vals);
 sh.setFrozenRows(1);sh.getRange(1,1,1,headers.length).setBackground('#142b43').setFontColor('#ffffff').setFontWeight('bold');
 for(let i=1;i<=Math.min(headers.length,9);i++)sh.setColumnWidth(i,i===1?260:180);
 return sh;
}
function sigV6Escrever_(r){
 const ss=SpreadsheetApp.getActiveSpreadsheet(),n=SIGV6.outputs,fmt=x=>x===null||x===undefined?'':x/100;
 sigV6CriarAba_(ss,n.resumo,['Indicador','Valor'],[
  ['Data da análise',r.gerado_em],['Documentos de repasse',r.resumo.repasses],
  ['Dotações diferentes',r.resumo.dotacoes],
  ['Dotações globais (EEXX)',r.resumo.dotacoes_globais],
  ['Posição da última importação de cotas',r.resumo.referencia_cotas_data],
  ['Posição das cotas é de hoje?',r.resumo.posicao_cotas_atualizada_hoje?'SIM':'NÃO'],
  ['Empenhos atribuídos segundo a regra mestre',r.resumo.empenhos_abatidos],
  ['Empenhos atribuídos em dotação global',r.resumo.empenhos_abatidos_globais],
  ['Empenhos com ambiguidade de dotação',r.resumo.empenhos_ambiguos],
  ['TDCO listados fora do abatimento',r.resumo.empenhos_tdco_listados],
  ['Valor TDCO não abatido (R$)',fmt(r.resumo.valor_tdco_sem_abate_centavos)],
  ['Correções históricas de dotação aplicadas',r.resumo.empenhos_dota_corrigidos],
  ['Abatimento gerencial total (R$)',fmt(r.resumo.valor_abatido_gerencial_centavos)],
  ['Cotas globais 998020301 (R$)',fmt(r.resumo.cota_global_centavos)],['RIPC',r.resumo.ripcs],['Itens RIPC',r.resumo.itens],
  ['Empenhos no índice',r.resumo.empenhos],['Empenhos em dotações presentes nas cotas',r.resumo.empenhos_com_dotacao_de_cota],
  ['Empenhos com código normalizado por fonte',r.resumo.empenhos_dotacao_normalizada],['Serviços prováveis',r.resumo.continuos],
  ['Cota líquida (R$)',fmt(r.resumo.cota_liquida_centavos)],
  ['RIPC destinado (R$)',fmt(r.resumo.ripc_total_centavos)],
  ['Diferença global apenas informativa (R$)',fmt(r.resumo.diferenca_global_informativa_centavos)],
  ['Empenhado líquido - índice (R$)',fmt(r.resumo.empenho_liquido_total_centavos)],
  ['RIPC sem documento de cota',r.resumo.documentos_sem_cota],
  ['Documentos RIPC maior que cota',r.resumo.repasses_superados],
  ['Alertas (até '+SIGV6.maxAlerts+')',r.alertas.length],['Assinatura SHA256',r.assinatura_geral],
  ['AVISO','Valores históricos/informados não são disponibilidade oficial para empenhar.']]);
 sigV6CriarAba_(ss,n.repasses,['Chave documento','Ano','Documento','Dotação','Cota líquida (R$)','RIPC (R$)','Diferença (R$)','Movimentos','RIPC associados','Situação','Leitura EEXX','Tipo','Conta','Código(s) BO'],r.repasses.map(x=>[
  x.chave,x.ano,x.documento,x.dotacao,fmt(x.credito_liquido_centavos),fmt(x.valor_ripc_centavos),
  fmt(x.diferenca_nao_destinada_centavos),x.quantidade_movimentos,x.quantidade_ripc,x.situacao,
  sigV6DotInfo_(x.dotacao).exibicao,sigV6DotInfo_(x.dotacao).tipo,sigV6DotInfo_(x.dotacao).conta,(x.origens_bo||[]).join(' | ')]));
 sigV6CriarAba_(ss,n.dotacoes,['Dotação','Cota líquida (R$)','RIPC (R$)','Diferença informativa (R$)',
  'Empenhado líquido informado (R$)','Saldo em empenhos (R$)','Documentos','Empenhos','Leitura EEXX','Tipo','Conta','Código(s) BO',
  'Abatido gerencial (R$)','Diferença gerencial NÃO OFICIAL (R$)'],r.dotacoes.map(x=>[
  x.dotacao,fmt(x.cotas_centavos),fmt(x.ripc_centavos),fmt(x.nao_destinado_teorico_centavos),
  fmt(x.empenhado_liquido_centavos),fmt(x.saldo_empenhos_centavos),x.documentos,x.empenhos,
  x.dotacao_exibicao,x.tipo_dotacao,x.conta_controle,(x.origens_bo||[]).join(' | '),
  fmt(x.abatido_sig_centavos),fmt(x.diferenca_gerencial_centavos)]));
 sigV6CriarAba_(ss,n.empenhos,['Chave Empenho','Processo','Dotação consolidada','Dotação original','Empenhado líquido (R$)',
  'Saldo de empenho (R$)','Tipo de execução','Leitura EEXX','Tipo','Conta','Eh TDCO?','UE contábil',
  'Dotação texto de origem','Correção histórica','Justificativa'],r.empenhos.map(x=>[
  x.chave_empenho,x.processo,x.dotacao,x.dotacao_orig,fmt(x.empenhado_liquido_centavos),
  fmt(x.saldo_informado_centavos),x.classificacao,sigV6DotInfo_(x.dotacao).exibicao,sigV6DotInfo_(x.dotacao).tipo,sigV6DotInfo_(x.dotacao).conta,
  x.eh_tdco?'SIM':'NÃO',x.unidade_contabil_executora,x.dotacao_texto_fonte,
  x.normalizacao_dotacao,x.detalhe_normalizacao]));
 sigV6CriarAba_(ss,n.abatimentos,['Chave empenho','Processo','Dotação do empenho (normalizada)',
  'Dotação original','Dotação global candidata','Dotação utilizada para abate',
  'Valor líquido empenhado (R$)','Resultado','Há cota específica?','Há cota global?','Observação',
  'Tipo execução','Eh TDCO?','UE contábil','Dotação fonte texto','Normalização histórica','Justificativa normalização'],r.abatimentos.map(x=>[
  x.chave_empenho,x.processo,x.dotacao_empenho,x.dotacao_empenho_original,
  x.dotacao_global_candidata,x.dotacao_de_abate,
  fmt(x.valor_empenhado_liquido_centavos),x.status,x.cota_especifica_existe?'SIM':'NÃO',
  x.cota_global_existe?'SIM':'NÃO',x.descricao,
  x.tipo_execucao_contabil,x.eh_tdco?'SIM':'NÃO',x.unidade_contabil_executora,x.dotacao_texto_fonte,
  x.normalizacao_dotacao,x.detalhe_normalizacao]));
 sigV6CriarAba_(ss,n.continuos,['Chave empenho','Processo','Dotação','Status',
  'Saldo informado (R$)','Reforço sugerido (R$)','Tipo execução','Observação'],r.continuos.map(x=>[
  x.chave_empenho,x.processo,x.dotacao,x.status,fmt(x.saldo_informado_centavos),
  fmt(x.reforco_sugerido_centavos),x.tipo_execucao,x.alerta]));
 sigV6CriarAba_(ss,n.alertas,['Gravidade','Código','Aba','Linha','Descrição'],
  r.alertas.map(x=>[x.nivel,x.codigo,x.aba,x.linha,x.mensagem]));
}

/** Publicação manual, com verificação dos valores, sem alterar as abas de origem. */
function sigV6PublicarDashboardAtual(){
 const ss=sigV6VerificarOrigemAtual_(),ui=SpreadsheetApp.getUi(),r=sigV6Construir_();
 const blocking=r.alertas.filter(a=>a.nivel==='BLOQUEIO');
 if(blocking.length)throw new Error('Relatório com '+blocking.length+' bloqueio(s). Confira SIG_V6_ALERTAS.');
 const dash=ss.getSheetByName('DASHBOARD');
 if(!dash)throw Error('Aba DASHBOARD ausente.');
 const data=dash.getRange(8,1,Math.max(dash.getLastRow()-7,1),4).getDisplayValues();
 if(data[0][0]!=='Dotacao'||data.length<2)throw Error('Cabeçalho DASHBOARD inesperado.');
 const rows=data.slice(1).filter(x=>String(x[0]).trim());
 const valid=r.dotacoes.filter(x=>x.documentos>0);
 const byKey=new Map(valid.map(x=>[x.dotacao,x]));
 if(valid.length!==rows.length||byKey.size!==rows.length)
   throw Error('Conjuntos de dotações divergem entre DASHBOARD e V6.');
 const amounts=[];
 for(const row of rows){
   const entry=byKey.get(sigV6Dot_(row[0]));
   if(!entry)throw Error('Sem correspondência no V6: '+row[0]);
   const original=sigV6Reais_(row[1]);
   if(original===null||original!==entry.cotas_centavos)
      throw Error('Cota original do DASHBOARD diferente da V6: '+row[0]);
   amounts.push([entry.abatido_sig_centavos/100,entry.diferenca_gerencial_centavos/100]);
 }
 const totalCota=valid.reduce((s,x)=>s+x.cotas_centavos,0);
 const totalAbate=valid.reduce((s,x)=>s+x.abatido_sig_centavos,0);
 if(totalCota!==r.resumo.cota_liquida_centavos || totalAbate!==r.resumo.valor_abatido_gerencial_centavos
 || amounts.some(p=>!p.every(Number.isFinite)))throw Error('Conferência de totais inválida.');
 const chosen=ui.alert('Publicar posição gerencial V6',
  'Dotações: '+rows.length+'; abatimento: R$ '+(totalAbate/100).toLocaleString('pt-BR',{minimumFractionDigits:2})+
  '; alertas: '+r.alertas.length+
  '. Será criada uma cópia do DASHBOARD. Os valores NÃO são saldo oficial SIAFI-MG. Continuar?',
  ui.ButtonSet.YES_NO);
 if(chosen!==ui.Button.YES)return;
 const tz=ss.getSpreadsheetTimeZone(),stamp=Utilities.formatDate(new Date(),tz,'yyyyMMdd_HHmmss');
 dash.copyTo(ss).setName('DASHBOARD_BACKUP_'+stamp);
 dash.getRange(9,3,amounts.length,2).setValues(amounts);
 dash.getRange('B5:C5').setValues([[totalAbate/100,(totalCota-totalAbate)/100]]);
 dash.getRange('A4:C4').setValues([['Cota líquida BO','Abatimento gerencial V6','Diferença gerencial NÃO OFICIAL']]);
 dash.getRange('A2').setValue('Conciliação gerencial V6: '+Utilities.formatDate(new Date(),tz,'dd/MM/yyyy HH:mm')+
   ' | Fonte das cotas: '+r.resumo.referencia_cotas_data+
   ' | Não é saldo oficial do SIAFI-MG. Importações automáticas do DASHBOARD legado podem substituir esta posição.');
 ui.alert('Publicação concluída. Confira os alertas, a data da fonte e o backup do DASHBOARD.');
}
