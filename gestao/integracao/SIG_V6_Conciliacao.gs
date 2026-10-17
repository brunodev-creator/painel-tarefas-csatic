/**
 * SIG CSA-TIC V6 — CONCILIAÇÃO ORÇAMENTÁRIA LOCAL
 * Instalar em novo arquivo SIG_V6_Conciliacao.gs na planilha saldos_2_0.
 * NÃO altera rotinas atuais nem acessa e-mail / APIs / Supabase.
 * A instalação do menu NÃO exige sobrescrever onOpen.
 */
const SIGV6 = Object.freeze({
 version:'6.0.0', maxRows:30000,maxAlerts:450,
 names:{
  cotas:'IMPORT_SALDOS_BO',ripc:'DESTINACAO_REPASSES',itens:'ITENS_AQUISICAO',
  empenhos:'INDICE_EMPENHOS',continuos:'CONTROLE_SERVICOS_CONTINUOS',
  processos:'CONTROLE_PROCESSOS_COMPRA'},
 outputs:{resumo:'SIG_V6_RESUMO',repasses:'SIG_V6_REPASSES',dotacoes:'SIG_V6_DOTACOES',
 empenhos:'SIG_V6_EMPENHOS',continuos:'SIG_V6_CONTINUOS',alertas:'SIG_V6_ALERTAS'}
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
   .addToUi();
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
function sigV6Dot_(v){return sigV6Digits_(v);}
function sigV6Key_(year,doc,dot){return [sigV6Year_(year),sigV6Doc_(doc),sigV6Dot_(dot)].join('|');}
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
 const byCota=Object.create(null),byRipc=Object.create(null),byDot=Object.create(null),byEmp=Object.create(null);
 const itemByRipc=Object.create(null),continuosOut=[],processosOut=[];
 const ensureDot=(key)=>byDot[key]||(byDot[key]={dotacao:key,cotas_centavos:0,ripc_centavos:0,empenhado_liquido_centavos:0,
    saldo_empenhos_centavos:0,documentos:0,empenhos:0,avisos:[]});
 const cotaFingerprint=Object.create(null);
 for(const r of cotas){
  const y=sigV6Year_(r.get('Ano')),doc=sigV6Doc_(r.get('Doc_Repasse')),dot=sigV6Dot_(r.get('Dotacao'));
  const key=sigV6Key_(y,doc,dot),value=sigV6Reais_(r.get('Valor_Descentralizado'));
  if(!y||!doc||dot.length<10||value===null){alert('BLOQUEIO','COTA_INVALIDA',SIGV6.names.cotas,r.linha,'Ano, documento, dotação ou valor inválido');continue;}
  const unique=key+'|'+r.get('Linha_Original')+'|'+value;
  if(cotaFingerprint[unique])alert('BLOQUEIO','MOVIMENTO_IDÊNTICO',SIGV6.names.cotas,r.linha,'Movimentação idêntica à linha '+cotaFingerprint[unique]);else cotaFingerprint[unique]=r.linha;
  const c=byCota[key]||(byCota[key]={chave:key,ano:y,documento:doc,dotacao:dot,credito_liquido_centavos:0,valor_ripc_centavos:0,
    quantidade_movimentos:0,quantidade_ripc:0,linhas:[]});
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
  const totalItens=itemByRipc[id];
  if(!totalItens)alert('ATENCAO','RIPC_SEM_ITEM',SIGV6.names.ripc,r.linha,'RIPC não possui itens vinculados: '+id);
  else if(totalItens.centavos!==value)alert('ATENCAO','RIPC_DIFERENCA_ITENS',SIGV6.names.ripc,r.linha,
      'RIPC '+id+': diferença de '+(value-totalItens.centavos)+' centavos em relação aos itens');
  byRipc[id]={id_ripc:id,chave_repasse:key,valor_ripc_centavos:value,itens_centavos:totalItens?.centavos??null,
   quantidade_itens:totalItens?.itens??0,processo_informado:r.get('Processo_Compra')||'',
   referencia:r.get('Objeto_Geral').slice(0,110)};
  if(byCota[key]){byCota[key].valor_ripc_centavos+=value;byCota[key].quantidade_ripc++;}
  else noCota.push(key);
 }
 Object.keys(itemByRipc).forEach(id=>{if(!ripcSeen[id])alert('ATENCAO','ITEM_SEM_RIPC',SIGV6.names.itens,0,'Itens vinculados a RIPC ausente: '+id);});
 const repasses=Object.values(byCota).map(c=>{
  c.diferenca_nao_destinada_centavos=c.credito_liquido_centavos-c.valor_ripc_centavos;
  c.situacao=c.diferenca_nao_destinada_centavos<0?'RIPC_SUPERA_DOCUMENTO':
     c.quantidade_ripc===0?'SEM_RIPC':'CONCILIADO_ARITMETICAMENTE';
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
  repasses.push({chave:key,ano:key.split('|')[0],documento:key.split('|')[1],dotacao:dot,
   credito_liquido_centavos:null,valor_ripc_centavos:total,quantidade_movimentos:0,quantidade_ripc:rows.length,
   diferenca_nao_destinada_centavos:null,situacao:'SEM_COTA_CORRESPONDENTE',linhas:[]});
 });
 const empSeen=Object.create(null),empenhos=[];
 for(const r of emps){
  const id=r.get('Chave_Empenho'),dot=sigV6Dot_(r.get('Dotacao'));
  if(!id||dot.length<10){alert('BLOQUEIO','EMPENHO_IDENTIFICACAO',SIGV6.names.empenhos,r.linha,'Chave ou dotação inválida');continue;}
  if(empSeen[id]){alert('BLOQUEIO','EMPENHO_DUPLICADO',SIGV6.names.empenhos,r.linha,'Chave repetida: '+id);continue;}
  empSeen[id]=true;
  const liquid=sigV6Reais_(r.get('Total_Empenhado_Liquido')),saldo=sigV6Reais_(r.get('Saldo_Atual_Empenho'));
  if(liquid===null||saldo===null){alert('BLOQUEIO','EMPENHO_VALORES',SIGV6.names.empenhos,r.linha,'Montante empenhado ou saldo inválido');continue;}
  const e={chave_empenho:id,processo:r.get('Processo_Compra'),dotacao:dot,
    empenhado_liquido_centavos:liquid,saldo_informado_centavos:saldo,
    classificacao:r.get('Tipo_Execucao_Contabil')||'',historico:r.get('Data_Atualizacao')||''};
  empenhos.push(e);byEmp[id]=e;
  const d=ensureDot(dot);d.empenhado_liquido_centavos+=liquid;d.saldo_empenhos_centavos+=saldo;d.empenhos++;
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
 const dotacoes=Object.values(byDot).map(d=>({
  ...d,nao_destinado_teorico_centavos:d.cotas_centavos-d.ripc_centavos,
  criterio:'Cota líquida menos RIPC na mesma dotação; NÃO representa saldo oficial disponível para empenhar.',
  observacao_empenhos:'Empenhos agrupados apenas por dotação; vínculo direto a documento de repasse NÃO foi comprovado.'
 })).sort((a,b)=>a.dotacao.localeCompare(b.dotacao));
 const rawCotas=repasses.filter(x=>x.credito_liquido_centavos!==null);
 const summary={repasses:repasses.length,dotacoes:dotacoes.length,ripcs:Object.keys(byRipc).length,
   itens:Object.keys(itemSeen).length,empenhos:empenhos.length,continuos:continuosOut.length,
   processos:processosOut.length,
   cota_liquida_centavos:rawCotas.reduce((n,x)=>n+x.credito_liquido_centavos,0),
   ripc_total_centavos:Object.values(byRipc).reduce((n,x)=>n+x.valor_ripc_centavos,0),
   documentos_sem_cota:orphan.length,
   repasses_superados:repasses.filter(x=>x.situacao==='RIPC_SUPERA_DOCUMENTO').length,
   diferenca_global_informativa_centavos:rawCotas.reduce((n,x)=>n+x.credito_liquido_centavos,0)-
     Object.values(byRipc).reduce((n,x)=>n+x.valor_ripc_centavos,0),
   empenho_liquido_total_centavos:empenhos.reduce((n,x)=>n+x.empenhado_liquido_centavos,0)};
 const report={sig_version:'6.0.0',tipo:'CONCILIACAO_LOCAL',origem:'Planilha: '+SpreadsheetApp.getActiveSpreadsheet().getName(),
  gerado_em:now,referencia_arquivo:'Posição das abas conforme última importação; não significa dados de hoje.',
  resumo:summary,repasses,dotacoes,ripcs:Object.values(byRipc),empenhos,continuos:continuosOut,
  processos:processosOut,alertas:notices,
  avisos_metodologicos:[
   'RIPC e Valor_Total de itens são valores em REAIS, mesmo quando inteiros e sem R$; o parser converte para centavos apenas internamente.',
   'Valor_Total_Repasse no RIPC é referência documental repetida e NÃO é somado.',
   'Diferenças negativas por documento são alertas para conferência, não prova de irregularidade.',
   'Posição financeira por dotação não identifica qual documento de repasse financiou cada empenho.',
   'Disponibilidade para empenhar, reforço de contrato e classificação de serviço contínuo exigem conferência oficial.'
  ]};
 report.assinatura_geral=sigV6Sha_(JSON.stringify({repasses:repasses.map(x=>[x.chave,x.credito_liquido_centavos,x.valor_ripc_centavos]),
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
  ['Dotações diferentes',r.resumo.dotacoes],['RIPC',r.resumo.ripcs],['Itens RIPC',r.resumo.itens],
  ['Empenhos no índice',r.resumo.empenhos],['Serviços prováveis',r.resumo.continuos],
  ['Cota líquida (R$)',fmt(r.resumo.cota_liquida_centavos)],
  ['RIPC destinado (R$)',fmt(r.resumo.ripc_total_centavos)],
  ['Diferença global apenas informativa (R$)',fmt(r.resumo.diferenca_global_informativa_centavos)],
  ['Empenhado líquido - índice (R$)',fmt(r.resumo.empenho_liquido_total_centavos)],
  ['RIPC sem documento de cota',r.resumo.documentos_sem_cota],
  ['Documentos RIPC maior que cota',r.resumo.repasses_superados],
  ['Alertas (até '+SIGV6.maxAlerts+')',r.alertas.length],['Assinatura SHA256',r.assinatura_geral],
  ['AVISO','Valores históricos/informados não são disponibilidade oficial para empenhar.']]);
 sigV6CriarAba_(ss,n.repasses,['Chave documento','Ano','Documento','Dotação','Cota líquida (R$)','RIPC (R$)','Diferença (R$)','Movimentos','RIPC associados','Situação'],r.repasses.map(x=>[
  x.chave,x.ano,x.documento,x.dotacao,fmt(x.credito_liquido_centavos),fmt(x.valor_ripc_centavos),
  fmt(x.diferenca_nao_destinada_centavos),x.quantidade_movimentos,x.quantidade_ripc,x.situacao]));
 sigV6CriarAba_(ss,n.dotacoes,['Dotação','Cota líquida (R$)','RIPC (R$)','Diferença informativa (R$)',
  'Empenhado líquido informado (R$)','Saldo em empenhos (R$)','Documentos','Empenhos'],r.dotacoes.map(x=>[
  x.dotacao,fmt(x.cotas_centavos),fmt(x.ripc_centavos),fmt(x.nao_destinado_teorico_centavos),
  fmt(x.empenhado_liquido_centavos),fmt(x.saldo_empenhos_centavos),x.documentos,x.empenhos]));
 sigV6CriarAba_(ss,n.empenhos,['Chave Empenho','Processo','Dotação','Empenhado líquido (R$)',
  'Saldo de empenho (R$)','Tipo de execução'],r.empenhos.map(x=>[
  x.chave_empenho,x.processo,x.dotacao,fmt(x.empenhado_liquido_centavos),
  fmt(x.saldo_informado_centavos),x.classificacao]));
 sigV6CriarAba_(ss,n.continuos,['Chave empenho','Processo','Dotação','Status',
  'Saldo informado (R$)','Reforço sugerido (R$)','Tipo execução','Observação'],r.continuos.map(x=>[
  x.chave_empenho,x.processo,x.dotacao,x.status,fmt(x.saldo_informado_centavos),
  fmt(x.reforco_sugerido_centavos),x.tipo_execucao,x.alerta]));
 sigV6CriarAba_(ss,n.alertas,['Gravidade','Código','Aba','Linha','Descrição'],
  r.alertas.map(x=>[x.nivel,x.codigo,x.aba,x.linha,x.mensagem]));
}
