/**
 * SIG CSA-TIC V5 — extrator local e independente do importador atual.
 * NÃO acessa o Gmail, NÃO envia dados para servidores externos, NÃO modifica as 39 abas originais.
 * Instale como arquivo NOVO (.gs) em Extensões > Apps Script da planilha saldos_2_0.
 *
 * Depois de executar sigV5InstalarMenu() uma vez: Menu SIG V5 (prévia) -> Gerar análise / Registrar versão / Baixar prévia JSON.
 * A análise somente escreve a aba SIG_V5_PREVIA. Registrar versão é opt-in.
 */
const SIGV5 = Object.freeze({
  versao: '5.0.0',
  preview: 'SIG_V5_PREVIA',
  state: 'SIG_V5_ESTADO',
  history: 'SIG_V5_HISTORICO',
  limitRows: 30000,
  maxIssues: 300,
  sheets: [
    {name:'IMPORT_SALDOS_BO',kind:'cotas',key:['Ano','Doc_Repasse','Dotacao'],money:['Valor_Descentralizado','Valor_Empenhado','Saldo_A_Empenhar'],required:['Ano','Doc_Repasse','Dotacao','Valor_Descentralizado']},
    {name:'DESTINACAO_REPASSES',kind:'destinacoes',key:['ID_RIPC'],money:['Valor_RIPC','Valor_Total_Repasse'],required:['ID_RIPC','Ano','Doc_Repasse','Dotacao','Valor_RIPC']},
    {name:'IMPORT_EXECUCAO_DESPESA_BO',kind:'execucao',key:[],money:['Valor Despesa Empenhada','Anulação Empenho-ValorTotal','Conformidade Orçamentária-ValorTotal','Conformidade RP-ValorTotal','Ajuste Financeiro-ValorTotal'],required:['Número do Empenho','Ano Empenho']},
    {name:'IMPORT_PROCESSOS_HOMOLOGADOS',kind:'homologados',key:['Chave_Processo'],money:['Valor_Referencia','Valor_Homologado'],required:['Processo_Compra','Valor_Homologado']},
    {name:'CONTROLE_PROCESSOS_COMPRA',kind:'processos',key:['ID_Processo'],money:['Valor_Referencia_Processo','Valor_Final_Homologado','Valor_Efetivo_Processo'],required:['Processo_Compra']},
    {name:'INDICE_EMPENHOS',kind:'empenhos',key:['Chave_Empenho'],money:['Total_Empenhado_Liquido','Saldo_Atual_Empenho','Total_Reforco','Total_Anulacao_Empenho'],required:['Chave_Empenho']},
    {name:'CONTROLE_SERVICOS_CONTINUOS',kind:'continuos',key:['Chave_Empenho'],money:['Saldo_Atual_Empenho','Valor_Reforco_Sugerido','Valor_Reforco_Ate_Fim_Exercicio'],required:['Chave_Empenho']}
  ]
});

function sigV5CriarMenu() {
  SpreadsheetApp.getUi().createMenu('SIG V5 (prévia)')
    .addItem('1. Gerar análise (sem envio)', 'sigV5GerarPrevia')
    .addItem('2. Registrar versão conferida', 'sigV5RegistrarVersao')
    .addItem('3. Baixar relatório JSON', 'sigV5BaixarPrevia')
    .addToUi();
}
/** Execute esta função UMA VEZ para instalar o menu, sem alterar onOpen() já existente. */
function sigV5InstalarMenu() {
  const ss=SpreadsheetApp.getActiveSpreadsheet();
  const exists=ScriptApp.getProjectTriggers().some(t=>
    t.getHandlerFunction()==='sigV5CriarMenu'&&t.getEventType()===ScriptApp.EventType.ON_OPEN);
  if(!exists)ScriptApp.newTrigger('sigV5CriarMenu').forSpreadsheet(ss).onOpen().create();
  sigV5CriarMenu();
}
function sigV5GerarPrevia() {
  const report=sigV5BuildReport_();
  sigV5WritePreview_(report);
  SpreadsheetApp.getUi().alert('SIG V5: prévia concluída. Abra a aba '+SIGV5.preview+
    '. Nenhum dado foi enviado para fora da planilha. Registros: '+report.total_registros+
    '; alertas: '+report.alertas.length+'.');
}
function sigV5RegistrarVersao() {
  const ui=SpreadsheetApp.getUi();
  const ok=ui.alert('Registrar versão','Esta ação cria/atualiza as abas SIG_V5_ESTADO e SIG_V5_HISTORICO dentro desta planilha. Não envia dados ao SIG. Continuar?',ui.ButtonSet.YES_NO);
  if(ok!==ui.Button.YES)return;
  const lock=LockService.getDocumentLock();
  if(!lock.tryLock(15000))throw Error('Outra execução da rotina V5 está em andamento.');
  try {
    const report=sigV5BuildReport_();
    if(report.bloqueios.length)throw Error('Existem '+report.bloqueios.length+' bloqueios. Corrija-os antes de registrar versão.');
    const sh=SpreadsheetApp.getActiveSpreadsheet();
    const old=sigV5GetState_(sh);
    const next={},time=new Date().toISOString(),history=[];
    report._index.forEach(item=>{
      const stateKey=item.sheet+'|'+item.key;
      const prev=old[stateKey];
      // Falhas de identificação impedem a aprovação; nunca somar snapshots.
      next[stateKey]={sheet:item.sheet,key:item.key,hash:item.hash,centavos:item.valor_centavos,time:time};
      if(!prev)history.push([time,item.sheet,item.key,'NOVO','',item.valor_centavos,'']);
      else if(prev.hash!==item.hash)history.push([time,item.sheet,item.key,'ALTERADO',prev.centavos,item.valor_centavos,
        (prev.centavos!==''&&item.valor_centavos!=='')?item.valor_centavos-prev.centavos:'']);
    });
    Object.keys(old).forEach(k=>{if(!next[k])history.push([time,old[k].sheet,old[k].key,'AUSENTE_NA_POSICAO',old[k].centavos,'','']);});
    const entries=Object.values(next).map(x=>[x.sheet,x.key,x.hash,x.centavos,x.time]);
    const state=sigV5GetOrCreate_(sh,SIGV5.state);
    state.clearContents();
    const header=[['Aba','Chave','Hash_SHA256','Valor_Referencia_Centavos','Data_Registro']];
    sigV5Write_(state,header.concat(entries));
    const hist=sigV5GetOrCreate_(sh,SIGV5.history);
    if(hist.getLastRow()===0)sigV5Write_(hist,[['Data','Aba','Chave','Tipo','Valor_Anterior_Centavos','Valor_Atual_Centavos','Diferenca_Centavos']]);
    if(history.length)hist.getRange(hist.getLastRow()+1,1,history.length,7).setValues(history);
    report.comparacao={novos:history.filter(x=>x[3]==='NOVO').length,alterados:history.filter(x=>x[3]==='ALTERADO').length,ausentes:history.filter(x=>x[3]==='AUSENTE_NA_POSICAO').length};
    sigV5WritePreview_(report);
    ui.alert('Versão registrada. Novos: '+report.comparacao.novos+'; alterados: '+report.comparacao.alterados+
      '; ausentes na nova posição: '+report.comparacao.ausentes+'.');
  }finally{lock.releaseLock();}
}
function sigV5BaixarPrevia() {
  const report=sigV5BuildReport_();
  // Somente resumo e alertas limitados; nunca serializar as linhas brutas no navegador.
  delete report._index;
  const json=JSON.stringify(report,null,2);
  const b64=Utilities.base64Encode(Utilities.newBlob(json,'application/json').getBytes());
  const html='<!doctype html><html><head><meta charset="utf-8"><style>body{font:14px Arial;padding:20px;color:#183047}button{padding:12px 18px;border:0;background:#118e87;color:white;border-radius:8px;cursor:pointer}</style></head>'+
   '<body><h3>Prévia SIG V5</h3><p>O download acontece neste navegador. Nenhum arquivo é enviado a serviços externos por esta função.</p>'+
   '<button id="save">Baixar SIG_V5_PREVIA.json</button>'+
   '<script>document.getElementById("save").onclick=function(){let b=atob("'+b64+'");let bytes=Uint8Array.from(b,c=>c.charCodeAt(0));'+
   'let u=URL.createObjectURL(new Blob([bytes],{type:"application/json"}));let a=document.createElement("a");a.href=u;a.download="SIG_V5_PREVIA.json";'+
   'document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),3000)};</script></body></html>';
  SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutput(html).setWidth(470).setHeight(230),'Exportar prévia');
}
function sigV5BuildReport_(){
  const ss=SpreadsheetApp.getActiveSpreadsheet();
  const result={sig_version:SIGV5.versao,tipo:'PREVIA_LOCAL',gerado_em:new Date().toISOString(),
    origem:'Google Sheets: '+ss.getName(),total_registros:0,resumo:[],alertas:[],bloqueios:[],comparacao:null,
    notas:['Valores são os exibidos nas abas de origem; não constituem confirmação oficial.',
     'Relatórios de execução podem conter posições cumulativas; não somar como movimentos sem regra específica.',
     'Saldo não destinado em RIPC não significa saldo disponível para empenho.'],
    _index:[]};
  const max=SIGV5.maxIssues;
  function issue(level,sheet,row,reason){
    const record={gravidade:level,aba:sheet,linha:row,motivo:reason};
    if(level==='BLOQUEIO'&&result.bloqueios.length<max)result.bloqueios.push(record);
    if(result.alertas.length<max)result.alertas.push(record);
  }
  SIGV5.sheets.forEach(spec=>{
    const sh=ss.getSheetByName(spec.name);
    if(!sh){issue('BLOQUEIO',spec.name,0,'Aba obrigatória não encontrada');return;}
    const range=sh.getDataRange(),display=range.getDisplayValues(),rowLimit=Math.min(display.length,SIGV5.limitRows);
    if(display.length>SIGV5.limitRows)issue('BLOQUEIO',spec.name,0,'Aba excede limite de '+SIGV5.limitRows+' linhas');
    if(!display.length){issue('AVISO',spec.name,0,'Aba vazia');return;}
    const headers=display[0].map(sigV5Header_),headIdx={};
    headers.forEach((h,j)=>{if(h&&!Object.prototype.hasOwnProperty.call(headIdx,h))headIdx[h]=j;});
    const missing=spec.required.filter(h=>!Object.prototype.hasOwnProperty.call(headIdx,sigV5Header_(h)));
    if(missing.length){issue('BLOQUEIO',spec.name,1,'Cabeçalhos ausentes: '+missing.join(', '));return;}
    const recs=[],seen={},amountTotal={},skipped=[];
    for(let i=1;i<rowLimit;i++){
      const row=display[i];if(!row||!row.some(v=>String(v||'').trim()))continue;
      const f=(name)=>{const j=headIdx[sigV5Header_(name)];return j===undefined?'':String(row[j]===undefined?'':row[j]).trim();};
      const errors=spec.required.filter(name=>!f(name));
      if(errors.length){issue('AVISO',spec.name,i+1,'Campos obrigatórios vazios: '+errors.join(', '));continue;}
      const money={},invalid=[];
      spec.money.forEach(name=>{const x=f(name);if(!x)return;const cents=sigV5MoneyCents_(x);if(cents===null)invalid.push(name);else{money[name]=cents;amountTotal[name]=(amountTotal[name]||0)+cents;}});
      if(invalid.length){issue('BLOQUEIO',spec.name,i+1,'Valor inválido: '+invalid.join(', '));continue;}
      const volateis=new Set(['dataimportacao','arquivoorigem','messageid','statusextracao','linhaoriginal','dataatualizacao','responsavelatualizacao']);
      const significativos=headers.map((h,j)=>[h,String(row[j]||'')]).filter(item=>item[0]&&!volateis.has(item[0]));
      let key;
      if(spec.key.length===1)key=f(spec.key[0]);
      else if(spec.key.length>1)key=spec.key.map(h=>h==='Ano'?sigV5Year_(f(h)):h==='Dotacao'?sigV5Dotacao_(f(h)):h==='Doc_Repasse'?sigV5Doc_(f(h)):f(h)).join('|');
      else key='LINHA_SHA256:'+sigV5Hash_(JSON.stringify(significativos));
      if(!key){issue('BLOQUEIO',spec.name,i+1,'Não foi possível identificar chave do registro');continue;}
      if(spec.kind==='cotas'&&!/^\d{4}\|[^|]+\|\d+$/.test(key)){issue('BLOQUEIO',spec.name,i+1,'Chave Ano|Documento|Dotação inválida');continue;}
      if(seen[key])issue(spec.kind==='execucao'?'AVISO':'BLOQUEIO',spec.name,i+1,'Chave repetida (primeira linha '+seen[key]+'): '+key);
      else seen[key]=i+1;
      const hash=sigV5Hash_(JSON.stringify(significativos));
      const principal=spec.money[0],value=Object.prototype.hasOwnProperty.call(money,principal)?money[principal]:'';
      recs.push({sheet:spec.name,key,hash,valor_centavos:value});
    }
    result.total_registros+=recs.length;
    result._index.push(...recs);
    result.resumo.push({aba:spec.name,tipo:spec.kind,registros:recs.length,linhas_lidas:rowLimit-1,
      total_centavos:amountTotal,assinatura:sigV5Hash_(recs.map(r=>r.key+'='+r.hash).sort().join('\n'))});
  });
  // Chaves somente para análise; nunca fazer sum(arquivoAnterior+arquivoAtual).
  result._index.sort((a,b)=>a.sheet.localeCompare(b.sheet)||a.key.localeCompare(b.key));
  result.assinatura_geral=sigV5Hash_(result._index.map(r=>r.sheet+'|'+r.key+'|'+r.hash).join('\n'));
  const anterior=sigV5GetState_(ss),chavesAtuais={};let novos=0,alterados=0,ausentes=0;
  result._index.forEach(r=>{const k=r.sheet+'|'+r.key;chavesAtuais[k]=true;
    if(!anterior[k])novos++;else if(anterior[k].hash!==r.hash)alterados++;});
  Object.keys(anterior).forEach(k=>{if(!chavesAtuais[k])ausentes++;});
  result.comparacao=Object.keys(anterior).length?{novos,alterados,ausentes}:null;
  return result;
}
function sigV5WritePreview_(report){
  const ss=SpreadsheetApp.getActiveSpreadsheet(),sheet=sigV5GetOrCreate_(ss,SIGV5.preview);
  const rows=[
    ['SIG CSA-TIC • Motor de Dados V5',''],
    ['Gerado em',report.gerado_em],
    ['Origem',report.origem],
    ['Assinatura SHA-256',report.assinatura_geral],
    ['Total de registros interpretados',report.total_registros],
    ['Bloqueios',report.bloqueios.length],
    ['Avisos e bloqueios',report.alertas.length],
    ['',''],
    ['ABA','REGISTROS']
  ];
  report.resumo.forEach(x=>rows.push([x.aba,x.registros]));
  rows.push(['',''],['ALERTAS (prévia)','']);
  report.alertas.forEach(a=>rows.push([a.gravidade+' | '+a.aba+' | linha '+a.linha,a.motivo]));
  if(report.comparacao)rows.push(['Comparação','Novos '+report.comparacao.novos+'; alterados '+report.comparacao.alterados+'; ausentes '+report.comparacao.ausentes]);
  sheet.clearContents();sigV5Write_(sheet,rows);
  sheet.setFrozenRows(1);sheet.setColumnWidth(1,325);sheet.setColumnWidth(2,680);
  sheet.getRange('A1:B1').setBackground('#132941').setFontColor('white').setFontWeight('bold');
  sheet.getRange(1,1,Math.max(rows.length,1),2).setVerticalAlignment('middle');
}
function sigV5GetOrCreate_(ss,name){return ss.getSheetByName(name)||ss.insertSheet(name);}
function sigV5Write_(sheet,rows){if(!rows.length)return;sheet.getRange(1,1,rows.length,rows[0].length).setValues(rows);}
function sigV5GetState_(ss){
  const sh=ss.getSheetByName(SIGV5.state);if(!sh||sh.getLastRow()<2)return {};
  const rows=sh.getRange(2,1,sh.getLastRow()-1,5).getDisplayValues(),out={};
  rows.forEach(r=>{if(!r[0]||!r[1])return;out[r[0]+'|'+r[1]]={sheet:r[0],key:r[1],hash:r[2],
      centavos:r[3]===''?'':Number(r[3])};});return out;
}
function sigV5Header_(x){return String(x||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');}
function sigV5Year_(s){const x=String(s||'').replace(/\D/g,'');return /^\d{4}$/.test(x)?x:'';}
function sigV5Doc_(s){const x=String(s||'').replace(/\D/g,'');return x?String(Number(x)):'';}
function sigV5Dotacao_(s){return String(s||'').replace(/\D/g,'');}
function sigV5MoneyCents_(value){
 if(typeof value==='number')return Number.isFinite(value)?Math.round(value*100):null;
 let s=String(value||'').trim();if(!s)return null;
 let neg=/^\s*\(/.test(s);s=s.replace(/[^0-9.,\-]/g,'');
 if(s.startsWith('-')){neg=true;s=s.slice(1);}
 if(!s||s==='.'||s===',')return null;
 const lastDot=s.lastIndexOf('.'),lastComma=s.lastIndexOf(',');
 let dec='';
 if(lastDot>=0&&lastComma>=0)dec=lastDot>lastComma?'.':',';
 else if(lastComma>=0)dec=',';
 else if(lastDot>=0 && s.length-lastDot-1<=2)dec='.';
 let normalized=s;
 if(dec){
  const pos=s.lastIndexOf(dec);
  normalized=s.slice(0,pos).replace(/[.,]/g,'')+'.'+s.slice(pos+1).replace(/[.,]/g,'');
 }else normalized=s.replace(/[.,]/g,'');
 if(!/^\d+(?:\.\d{1,2})?$/.test(normalized))return null;
 const [intPart,decPart='']=normalized.split('.');
 const cents=Number(intPart)*100+Number((decPart+'00').slice(0,2));
 return Number.isSafeInteger(cents)?(neg?-cents:cents):null;
}
function sigV5Hash_(text){
 const bytes=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,String(text),Utilities.Charset.UTF_8);
 return bytes.map(b=>('0'+(b<0?b+256:b).toString(16)).slice(-2)).join('');
}
