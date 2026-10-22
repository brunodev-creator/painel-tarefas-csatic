/**
 * SIG Online — Sincronização automática dos Contratos Continuados (somente leitura na planilha).
 * Planilha: agora vai - PLANILHA ATUAL. Abas lidas:
 *   SELECAO_SERVICOS_CONTINUOS (Controlar, média manual), CONTROLE_SERVICOS_CONTINUOS (indicadores atuais,
 *   para comparação), BASE_EXECUCAO_EMPENHOS (movimentos de empenho, reforço, anulação e conformidade) e
 *   SIG_V6_CORRECOES_APROVADAS (correções históricas de dotação aprovadas).
 * Envia o retrato para public.sig_cont_sincronizar. O SIG recalcula médias, projeções e reforços sozinho.
 * Retrato idêntico ao anterior é só conferido; manifestações dos fiscais e vínculos nunca são sobrescritos.
 * NUNCA altera nenhuma aba.
 *
 * Instalação (uma vez, no mesmo projeto Apps Script de SIG_SINCRONIZACAO_DIARIA.gs):
 *  1. Se o token ainda não foi configurado: no SIG (administrador) Intenções COTEP → Parâmetros →
 *     «Gerar token de integração»; aqui, executar sigSyncConfigurar (ou sigContConfigurar) e colar o token.
 *  2. Colar este arquivo como novo .gs, salvar e executar sigContInstalarGatilho (a cada hora).
 * Menu opcional: sigContCriarMenu → «SIG — Contratos continuados» → «Sincronizar agora».
 */
const SIG_CONT_SYNC = Object.freeze({
  planilhaId: '1dxzDySXU1h5BKJkW1_mHpNX9KRwgX6Ol5b_kRqeRrJA',
  url: 'https://nrcobonppfbqgarfoqgj.supabase.co/rest/v1/rpc/sig_cont_sincronizar',
  chavePublica: 'sb_publishable_q7Lhoq9CbOSJH0llBi6w_A_L8Qabbyl',
  fuso: 'America/Sao_Paulo',
  abas: {
    selecao: 'SELECAO_SERVICOS_CONTINUOS', controle: 'CONTROLE_SERVICOS_CONTINUOS',
    base: 'BASE_EXECUCAO_EMPENHOS', correcoes: 'SIG_V6_CORRECOES_APROVADAS'
  },
  // Indicadores atuais da planilha guardados para comparação com a análise do SIG (não usados no cálculo).
  indicadores: ['Saldo_Atual_Empenho', 'Total_Empenhado_Liquido', 'Total_Conformidade', 'Media_Mensal_Historica',
    'Media_Mensal_Ultimos_3_Meses', 'Media_Mensal_Referencia', 'Origem_Media_Referencia', 'Meses_Cobertos',
    'Cobertura_Alvo_Meses', 'Valor_Reforco_Sugerido', 'Valor_Reforco_Ate_Fim_Exercicio', 'Qtd_Meses_Com_Conformidade',
    'Status_Servico', 'Alerta', 'Tipo_Execucao_Contabil', 'Eh_TDCO', 'Data_Atualizacao']
});

function sigContConfigurar() {
  const ui = SpreadsheetApp.getUi();
  const r = ui.prompt('SIG — token de integração', 'Cole o token gerado no SIG (o mesmo da sincronização das COTEPs):', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  const token = r.getResponseText().trim();
  if (!/^[0-9a-f]{64}$/.test(token)) throw new Error('Token inválido: copie exatamente o texto exibido pelo SIG.');
  PropertiesService.getScriptProperties().setProperty('SIG_TOKEN', token);
  ui.alert('Token salvo. Agora execute sigContInstalarGatilho.');
}

// A importação dos relatórios roda pela manhã; a conferência horária leva novas posições ao SIG em até 1 hora.
function sigContInstalarGatilho() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'sigContExecutar')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('sigContExecutar').timeBased().everyHours(1).create();
  return sigContExecutar();
}

function sigContCriarMenu() {
  SpreadsheetApp.getUi().createMenu('SIG — Contratos continuados')
    .addItem('Sincronizar agora', 'sigContExecutarComAviso')
    .addToUi();
}

function sigContExecutarComAviso() {
  const r = sigContExecutar();
  SpreadsheetApp.getUi().alert('SIG — contratos continuados', r.sem_alteracao ? 'Sem alteração desde a última sincronização.' :
    'Empenhos: ' + r.empenhos + '\nMovimentos: ' + r.movimentos + '\nContratos novos: ' + r.contratos_novos,
    SpreadsheetApp.getUi().ButtonSet.OK);
}

function sigContTabela_(ss, nome, obrigatorias) {
  const sheet = ss.getSheetByName(nome);
  if (!sheet) throw new Error('Aba não encontrada: ' + nome);
  const valores = sheet.getDataRange().getValues();
  const cab = valores.shift().map(v => String(v).trim());
  (obrigatorias || []).forEach(c => { if (cab.indexOf(c) < 0) throw new Error('Coluna não encontrada na aba ' + nome + ': ' + c); });
  return valores.filter(l => l.some(v => String(v).trim() !== ''))
    .map(l => { const o = {}; cab.forEach((c, i) => { if (c) o[c] = l[i]; }); return o; });
}

function sigContData_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, SIG_CONT_SYNC.fuso, 'yyyy-MM-dd');
  const s = String(v || '').trim();
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : '';
}
function sigContNum_(v) { return typeof v === 'number' ? v : (String(v || '').trim() || 0); }

function sigContRetrato_() {
  const ss = SpreadsheetApp.openById(SIG_CONT_SYNC.planilhaId);
  const a = SIG_CONT_SYNC.abas;
  const selecao = sigContTabela_(ss, a.selecao, ['Chave_Empenho', 'Controlar']);
  const controle = sigContTabela_(ss, a.controle, ['Chave_Empenho', 'Processo_Compra', 'Dotacao']);
  const base = sigContTabela_(ss, a.base, ['ID_Execucao', 'Chave_Empenho', 'Tipo_Movimentacao_Normalizado', 'Data_Efetivacao',
    'Mes_Referencia', 'Valor_Empenho_Assinado', 'Valor_Conformidade_Assinado', 'Dotacao', 'Unidade_Contabil_Executora']);
  const ctrl = {}, objeto = {};
  controle.forEach(c => { ctrl[String(c.Chave_Empenho).trim()] = c; });
  base.forEach(m => { const k = String(m.Chave_Empenho).trim(); if (!objeto[k] && String(m.Objeto_Contrato || '').trim()) objeto[k] = String(m.Objeto_Contrato).trim().slice(0, 600); });
  const empenhos = selecao.filter(s => String(s.Chave_Empenho).trim()).map(s => {
    const k = String(s.Chave_Empenho).trim(), c = ctrl[k] || {};
    const planilha = {};
    SIG_CONT_SYNC.indicadores.forEach(n => { if (c[n] !== undefined && c[n] !== '') planilha[n] = c[n] instanceof Date ? c[n].toISOString() : c[n]; });
    return {
      chave_empenho: k, controlar: String(s.Controlar || 'SIM').trim(), processo: String(c.Processo_Compra || '').trim(),
      dotacao: String(c.Dotacao || '').trim(), apelido: String(s.Apelido_Servico || c.Apelido_Servico || '').trim(),
      especificacao: String(s.Especificacao_Principal || '').trim(), fornecedor: String(s.Fornecedor || '').trim(),
      cnpj: String(s.CNPJ_CPF_Fornecedor || '').trim(), objeto_contrato: objeto[k] || '', media_manual: sigContNum_(s.Media_Mensal_Manual), planilha: planilha
    };
  });
  const controladas = {};
  empenhos.forEach(e => { if (!/^N[ÃA]O$/i.test(e.controlar)) controladas[e.chave_empenho] = true; });
  const movimentos = base.filter(m => controladas[String(m.Chave_Empenho).trim()] && String(m.ID_Execucao).trim()).map(m => ({
    id: String(m.ID_Execucao).trim(), chave_empenho: String(m.Chave_Empenho).trim(), tipo: String(m.Tipo_Movimentacao_Normalizado).trim(),
    data: sigContData_(m.Data_Efetivacao), mes: sigContData_(m.Mes_Referencia).slice(0, 7),
    valor_empenho: sigContNum_(m.Valor_Empenho_Assinado), valor_conformidade: sigContNum_(m.Valor_Conformidade_Assinado),
    valor_ajuste: sigContNum_(m.Valor_Ajuste_Assinado), processo: String(m.Processo_Compra || '').trim(),
    cnpj: String(m.CNPJ_CPF_Fornecedor || '').trim(), fornecedor: String(m.Nome_Fornecedor || '').trim(),
    objeto_contrato: String(m.Objeto_Contrato || '').trim().slice(0, 600), especificacao: String(m.Especificacao_Principal || '').trim().slice(0, 600),
    dotacao: String(m.Dotacao || '').trim(), unidade_contabil: String(m.Unidade_Contabil_Executora || '').trim(), tdco: String(m.Eh_TDCO || '').trim()
  }));
  let correcoes = [];
  if (ss.getSheetByName(a.correcoes)) {
    correcoes = sigContTabela_(ss, a.correcoes, ['Chave_Empenho', 'Dotacao_Original', 'Dotacao_Corrigida', 'Status']).map(c => ({
      chave_empenho: String(c.Chave_Empenho).trim(), original: String(c.Dotacao_Original).trim(),
      corrigida: String(c.Dotacao_Corrigida).trim(), status: String(c.Status).trim()
    }));
  }
  const atualizacao = controle.map(c => c.Data_Atualizacao).filter(d => d instanceof Date).sort((x, y) => y - x)[0];
  return {
    origem_id: SIG_CONT_SYNC.planilhaId, gerado_em: (atualizacao || new Date()).toISOString(),
    empenhos: empenhos, movimentos: movimentos, correcoes: correcoes
  };
}

function sigContExecutar() {
  const token = PropertiesService.getScriptProperties().getProperty('SIG_TOKEN');
  if (!token) throw new Error('Configure o token de integração (sigContConfigurar ou sigSyncConfigurar).');
  const resp = UrlFetchApp.fetch(SIG_CONT_SYNC.url, {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { apikey: SIG_CONT_SYNC.chavePublica, Authorization: 'Bearer ' + SIG_CONT_SYNC.chavePublica },
    payload: JSON.stringify({ p_token: token, p_dados: sigContRetrato_() })
  });
  const corpo = resp.getContentText();
  if (resp.getResponseCode() !== 200) throw new Error('SIG recusou a sincronização (' + resp.getResponseCode() + '): ' + corpo);
  console.log('Contratos continuados → SIG: ' + corpo);
  return JSON.parse(corpo);
}
