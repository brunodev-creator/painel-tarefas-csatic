/**
 * SIG Online — Exportador da fonte oficial de consulta (somente leitura).
 * Planilha: agora vai - PLANILHA ATUAL.
 * NUNCA altera nenhuma aba. Baixa um arquivo JSON LOCAL; o usuário
 * decide se o envia pelo Motor de Dados do SIG, autenticado como administrador.
 *
 * Instalação: Extensões -> Apps Script -> arquivo .gs novo -> colar este
 * conteúdo -> executar sigFonteInstalarMenu uma vez.
 * Menu: SIG — Fonte Oficial -> Baixar snapshot JSON para SIG
 */
const SIG_FONTE_ATUAL = Object.freeze({
  id: '1dxzDySXU1h5BKJkW1_mHpNX9KRwgX6Ol5b_kRqeRrJA',
  nome: 'agora vai - PLANILHA ATUAL',
  abas: [
    'CONTROLE_PROCESSOS_COMPRA',
    'IMPORT_PROCESSOS_COMPRA',
    'IMPORT_PROCESSOS_HOMOLOGADOS',
    'IMPORT_EXECUCAO_DESPESA_BO',
    'SALDO_ATUAL_DOTACOES_EMPENHOS',
    'DASHBOARD'
  ],
  maxLinhas: 3000,
  maxColunas: 60
});

function sigFonteInstalarMenu() {
  sigFonteVerificarOrigem_();
  const ss=SpreadsheetApp.getActiveSpreadsheet();
  const found=ScriptApp.getProjectTriggers().some(t=>
    t.getHandlerFunction()==='sigFonteCriarMenu' &&
    t.getEventType()===ScriptApp.EventType.ON_OPEN);
  if(!found)ScriptApp.newTrigger('sigFonteCriarMenu').forSpreadsheet(ss).onOpen().create();
  sigFonteCriarMenu();
}
function sigFonteCriarMenu() {
  SpreadsheetApp.getUi().createMenu('SIG — Fonte Oficial')
    .addItem('Baixar snapshot JSON para SIG', 'sigFonteBaixarJSON')
    .addToUi();
}
function sigFonteVerificarOrigem_(){
  const ss=SpreadsheetApp.getActiveSpreadsheet();
  if(ss.getId()!==SIG_FONTE_ATUAL.id)throw new Error(
    'Abra a planilha "agora vai - PLANILHA ATUAL". Não use este exportador em uma cópia ou planilha antiga.');
  return ss;
}
function sigFonteBaixarJSON() {
  const ss=sigFonteVerificarOrigem_();
  const abas=SIG_FONTE_ATUAL.abas.map(nome=>{
    const sheet=ss.getSheetByName(nome);
    if(!sheet)throw new Error('Aba não encontrada: '+nome);
    const lastRow=sheet.getLastRow(),lastCol=sheet.getLastColumn();
    const firstRow=nome==='DASHBOARD'?8:1;
    if(lastRow<firstRow||lastCol<1||lastCol>SIG_FONTE_ATUAL.maxColunas ||
      lastRow-firstRow>SIG_FONTE_ATUAL.maxLinhas) {
      throw new Error('Limite ou cabeçalho inválido na aba '+nome+
        ' (máximo de '+SIG_FONTE_ATUAL.maxLinhas+' linhas e 60 colunas).');
    }
    const contents=sheet.getRange(firstRow,1,lastRow-firstRow+1,lastCol).getDisplayValues();
    const cabecalhos=contents.shift();
    const linhas=contents.filter(row=>row.some(value=>String(value).trim()!==''));
    return {aba:nome,cabecalhos,linhas};
  });
  const snapshot={
    formato:'SIG_FONTE_ATUAL_V2',origem_id:SIG_FONTE_ATUAL.id,
    origem_nome:SIG_FONTE_ATUAL.nome,gerado_em:new Date().toISOString(),abas
  };
  const raw=JSON.stringify(snapshot);
  if(Utilities.newBlob(raw).getBytes().length>10000000)
    throw new Error('O JSON ultrapassa 10 MB. Não é seguro prosseguir.');
  const b64=Utilities.base64Encode(Utilities.newBlob(raw,'application/json').getBytes());
  const filename='SIG_FONTE_ATUAL_'+Utilities.formatDate(new Date(),Session.getScriptTimeZone(),'yyyyMMdd_HHmmss')+'.json';
  const html=HtmlService.createHtmlOutput(
    '<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="font:14px Arial;padding:20px">'+
    '<h3>Snapshot da PLANILHA ATUAL</h3>'+
    '<p>O arquivo será baixado <strong>para o seu computador</strong>. Nenhum dado foi alterado na planilha ou enviado ao SIG.</p>'+
    '<a id="download" download="'+filename+'" href="data:application/json;base64,'+b64+'" style="background:#285340;color:#fff;padding:12px 16px;border-radius:8px;text-decoration:none;display:inline-block">Baixar JSON</a>'+
    '<p>Depois, abra <strong>SIG Online → Motor de Dados → Importar arquivo da fonte oficial</strong>.</p>'+
    '</body></html>').setWidth(560).setHeight(290);
  SpreadsheetApp.getUi().showModalDialog(html,'SIG — Exportação somente leitura');
}
