/**
 * SIG Online — Sincronização diária das COTEPs (somente leitura na planilha).
 * Planilha: agora vai - PLANILHA ATUAL · aba CONTROLE_PROCESSOS_COMPRA.
 * Todo dia (≈ 6h) envia ao SIG as linhas de «Dispensa de Licitação - Por valor»
 * (processo, objeto, valores de referência e homologado, situação, códigos CATMAS).
 * O SIG atualiza as COTEPs já cadastradas e gera pendências para a DTS-1 nas novas.
 * NUNCA altera nenhuma aba.
 *
 * Instalação (uma vez, por quem administra a planilha):
 *  1. No SIG, como administrador: Intenções COTEP → «Gerar token de integração» e copie o token.
 *  2. Na planilha: Extensões → Apps Script → arquivo .gs novo → colar este conteúdo → salvar.
 *  3. Executar sigSyncConfigurar (cola o token na caixa) e autorizar o script.
 *  4. Executar sigSyncInstalarGatilhoDiario. Pronto: roda sozinho todo dia.
 * Menu opcional: SIG — Fonte Oficial → «Sincronizar COTEPs agora» (sigSyncCriarMenu).
 */
const SIG_SYNC = Object.freeze({
  planilhaId: '1dxzDySXU1h5BKJkW1_mHpNX9KRwgX6Ol5b_kRqeRrJA',
  aba: 'CONTROLE_PROCESSOS_COMPRA',
  url: 'https://nrcobonppfbqgarfoqgj.supabase.co/rest/v1/rpc/sig_cotep_sincronizar_portal',
  chavePublica: 'sb_publishable_q7Lhoq9CbOSJH0llBi6w_A_L8Qabbyl',
  hora: 6,
  colunas: {
    processo: 'Processo_Compra', objeto: 'Objeto', status: 'Status',
    valor_referencia: 'Valor_Referencia', valor_homologado: 'Valor_Final_Homologado',
    detalhamento: 'Procedimento_Detalhamento', situacao_execucao: 'Situacao_Execucao',
    codigos_itens: 'Codigos_Itens', materiais: 'Materiais'
  }
});

function sigSyncConfigurar() {
  const ui = SpreadsheetApp.getUi();
  const r = ui.prompt('SIG — token de integração', 'Cole o token gerado no SIG (Intenções COTEP → Gerar token de integração):', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  const token = r.getResponseText().trim();
  if (!/^[0-9a-f]{64}$/.test(token)) throw new Error('Token inválido: copie exatamente o texto exibido pelo SIG.');
  PropertiesService.getScriptProperties().setProperty('SIG_TOKEN', token);
  ui.alert('Token salvo. Agora execute sigSyncInstalarGatilhoDiario.');
}

function sigSyncInstalarGatilhoDiario() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'sigSyncExecutar')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('sigSyncExecutar').timeBased().everyDays(1).atHour(SIG_SYNC.hora)
    .inTimezone('America/Sao_Paulo').create();
  return sigSyncExecutar();
}

function sigSyncCriarMenu() {
  SpreadsheetApp.getUi().createMenu('SIG — Fonte Oficial')
    .addItem('Sincronizar COTEPs agora', 'sigSyncExecutarComAviso')
    .addToUi();
}

function sigSyncExecutarComAviso() {
  const r = sigSyncExecutar();
  SpreadsheetApp.getUi().alert('SIG — sincronização', 'COTEPs lidas: ' + r.cotep_lidas + '\nAtualizadas: ' + r.atualizadas +
    '\nCriadas: ' + r.criadas + '\nSem alteração: ' + r.sem_alteracao + '\nPendências para a DTS-1: ' + r.pendencias,
    SpreadsheetApp.getUi().ButtonSet.OK);
}

function sigSyncLinhas_() {
  const sheet = SpreadsheetApp.openById(SIG_SYNC.planilhaId).getSheetByName(SIG_SYNC.aba);
  if (!sheet) throw new Error('Aba não encontrada: ' + SIG_SYNC.aba);
  const valores = sheet.getDataRange().getDisplayValues();
  const cab = valores.shift().map(v => String(v).trim());
  const idx = {};
  Object.entries(SIG_SYNC.colunas).forEach(([campo, nome]) => {
    const i = cab.indexOf(nome);
    if (i < 0) throw new Error('Coluna não encontrada na aba ' + SIG_SYNC.aba + ': ' + nome);
    idx[campo] = i;
  });
  return valores
    .filter(l => /por valor/i.test(l[idx.detalhamento]) && String(l[idx.processo]).trim())
    .map(l => Object.fromEntries(Object.entries(idx).map(([campo, i]) => [campo, String(l[i]).trim()])));
}

function sigSyncExecutar() {
  const token = PropertiesService.getScriptProperties().getProperty('SIG_TOKEN');
  if (!token) throw new Error('Execute sigSyncConfigurar antes (token de integração do SIG).');
  const resp = UrlFetchApp.fetch(SIG_SYNC.url, {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { apikey: SIG_SYNC.chavePublica, Authorization: 'Bearer ' + SIG_SYNC.chavePublica },
    payload: JSON.stringify({ p_token: token, p_linhas: sigSyncLinhas_() })
  });
  const corpo = resp.getContentText();
  if (resp.getResponseCode() !== 200) throw new Error('SIG recusou a sincronização (' + resp.getResponseCode() + '): ' + corpo);
  const r = JSON.parse(corpo);
  console.log('Sincronização SIG: ' + corpo);
  return r;
}
