/* SIG CSA-TIC V6 — conferência de JSON financeiro SOMENTE no navegador.
   Não grava em localStorage, não faz fetch e não transmite dados.
   Este módulo precisa ser incluído ANTES de app.js. */
(() => {
'use strict';
let report=null,search='';
const esc=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const amount=v=>typeof v==='number'&&Number.isFinite(v)?new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(v/100):'—';
const integer=v=>new Intl.NumberFormat('pt-BR').format(Number(v)||0);
const title=(name,sub)=>'<div class="pagehead"><div><div class="eyebrow">CONCILIAÇÃO ORÇAMENTÁRIA</div><h1>'+esc(name)+'</h1><div class="sub">'+esc(sub)+'</div></div>'+
 '<div class="head-actions"><button class="btn" data-action="vaultRestore" data-kind="v6">Restaurar cópia protegida</button>'+
 (report?'<button class="btn" data-action="vaultSave" data-kind="v6">Salvar cópia protegida</button>':'')+
 '<button class="btn" data-action="vaultDelete" data-kind="v6">Apagar cópia local</button>'+
 '<button class="btn" data-action="v6Demo">Exemplo fictício</button>'+(report?'<button class="btn" data-action="v6Clear">Limpar prévia</button>':'')+'</div></div>';
const panel=(name,content)=>'<div class="card section"><div class="section-heading"><div><h2>'+esc(name)+'</h2></div></div>'+content+'</div>';
const table=(heads,rows)=>'<div class="table-scroll"><table class="data-table"><thead><tr>'+heads.map(h=>'<th>'+esc(h)+'</th>').join('')+'</tr></thead><tbody>'+
 (rows.length?rows.join(''):'<tr><td colspan="'+heads.length+'">Nenhum registro encontrado.</td></tr>')+'</tbody></table></div>';
function view(authorized){
 if(!authorized)return title('Acesso restrito','Disponível somente para SOFI, chefia e administração.');
 let html=title('Conciliação — V6','Analise cotas, RIPC, itens, empenhos e serviços continuados a partir da planilha.');
 html+='<div class="v5-notice"><b>Conferência local.</b> Nenhum registro financeiro deste JSON é enviado ao Supabase, ao GitHub ou a qualquer API de IA. Os números são históricos e exigem validação nas fontes oficiais. <b>Guardar cópia</b> é opcional e criptografa o relatório neste navegador; para restaurar após novo login você precisará da senha do cofre.</div>';
 html+='<div class="card v5-upload"><div><h2>Importar prévia da planilha</h2><p>Na planilha <b>saldos_2_0</b>, clique em <b>SIG V6 (conciliação) → Baixar JSON para SIG (local)</b>.</p></div><label class="btn primary v5-label" for="v6-upload">Selecionar relatório JSON</label><input id="v6-upload" type="file" accept=".json,application/json" class="v5-file"></div>';
 html+=panel('Instalação do Apps Script V6','<ol class="v5-steps"><li>Em <b>Extensões → Apps Script</b>, crie um arquivo separado chamado <code>SIG_V6_Conciliacao.gs</code>.</li><li>Cole o <a target="_blank" rel="noopener noreferrer" href="https://github.com/brunodev-creator/painel-tarefas-csatic/blob/main/gestao/integracao/SIG_V6_Conciliacao.gs">código V6 do GitHub ↗</a>.</li><li>Salve, execute <code>sigV6InstalarMenu</code> apenas uma vez e volte à planilha.</li><li>Execute <b>SIG V6 (conciliação) → Gerar conciliação local</b> e confira as abas <code>SIG_V6_*</code>.</li></ol>');
 if(!report)return html+panel('Relatório','<p class="v5-guide">Nenhum JSON selecionado. Use o botão de exemplo fictício para conhecer a interface.</p>');
 const r=report,summary=r.resumo||{},warnings=Array.isArray(r.alertas)?r.alertas:[],f=search.replace(/\D/g,'');
 const filter=arr=>Array.isArray(arr)?arr.filter(x=>!f||String(x.dotacao||'').includes(f)):[];
 const repasses=filter(r.repasses),dotacoes=filter(r.dotacoes),empenhos=filter(r.empenhos);
 const kpi=(label,value,sub)=>'<div class="card v5-metric"><small>'+esc(label)+'</small><strong>'+esc(value)+'</strong><span>'+esc(sub)+'</span></div>';
 html+='<div class="v6-metrics">'+
 kpi('Cotas líquidas',amount(summary.cota_liquida_centavos),'Valor descentralizado, com anulações')+
 kpi('RIPC destinados',amount(summary.ripc_total_centavos),'Sem somar Valor_Total_Repasse repetido')+
 kpi('Diferença indicativa',amount(summary.diferenca_global_informativa_centavos),'Não é disponibilidade para empenhar')+
 kpi('Empenhos',integer(summary.empenhos),'Registros distintos no índice')+'</div>';
 html+=panel('Origem e consistência','<p class="v6-data-info"><b>Origem:</b> '+esc(r.origem)+' · <b>Gerado em:</b> '+esc(r.gerado_em)+' · <b>Versão:</b> '+esc(r.sig_version)+'</p>'+
 '<div class="v6-counters">'+[
  'Documentos: '+integer(summary.repasses),'RIPC: '+integer(summary.ripcs),'Itens: '+integer(summary.itens),
  'Dotações: '+integer(summary.dotacoes),'Serviços prováveis: '+integer(summary.continuos),
  'Empenhos associados a dotações de cota: '+integer(summary.empenhos_com_dotacao_de_cota),
  'Alertas para conferência: '+integer(warnings.length)].map(x=>'<span>'+esc(x)+'</span>').join('')+'</div>'+
 '<p class="v5-guide">Assinatura da posição: <code>'+esc(r.assinatura_geral||'')+'</code>. O documento informa a posição das abas, não garante atualização até hoje.</p>');
 html+=panel('Filtrar por dotação','<p class="v5-guide">Informe os dígitos completos ou parte do código da dotação e clique em Aplicar filtro (ou pressione Enter).</p>'+
 '<div class="v6-filterbar"><input class="v6-search" type="search" id="v6-filter" value="'+esc(search)+'" placeholder="Buscar dotação por código" autocomplete="off">'+
 '<button class="btn primary" data-action="v6ApplyFilter">Aplicar filtro</button><button class="btn" data-action="v6ClearFilter">Limpar filtro</button></div>'+
 '<p class="v6-count">Exibindo '+integer(repasses.length)+' documento(s), '+integer(dotacoes.length)+' dotação(ões) e '+integer(empenhos.length)+' empenho(s).'+
 (search? ' <strong>Filtro: '+esc(search)+'</strong>':' Sem filtro aplicado.')+'</p>');
 html+=panel('Documentos de repasse e RIPC',
 table(['Documento / Dotação','Cota líquida','Valor RIPC','Diferença','Situação'],repasses.slice(0,200).map(x=>
 '<tr><td><b>'+esc(x.ano)+' / '+esc(x.documento)+'</b><div class="cell-sub">'+esc(x.dotacao)+'</div></td>'+
 '<td>'+amount(x.credito_liquido_centavos)+'</td><td>'+amount(x.valor_ripc_centavos)+'</td>'+
 '<td>'+amount(x.diferenca_nao_destinada_centavos)+'</td><td><span class="v6-status">'+esc(x.situacao)+'</span></td></tr>')));
 html+=panel('Consolidação por dotação',
 '<p class="v5-guide">O agrupamento dos empenhos não prova a qual repasse ou RIPC cada empenho pertence.</p>'+
 table(['Dotação','Cota líquida','RIPC','Empenhado líquido','Saldo em empenhos','Empenhos'],dotacoes.slice(0,200).map(x=>
 '<tr><td><b>'+esc(x.dotacao)+'</b></td><td>'+amount(x.cotas_centavos)+'</td><td>'+amount(x.ripc_centavos)+
 '</td><td>'+amount(x.empenhado_liquido_centavos)+'</td><td>'+amount(x.saldo_empenhos_centavos)+
 '</td><td>'+integer(x.empenhos)+'</td></tr>')));
 html+=panel('Empenhos identificados',
 table(['Chave','Processo','Dotação','Empenhado líquido','Saldo informado'],empenhos.slice(0,200).map(x=>
 '<tr><td>'+esc(x.chave_empenho)+'</td><td>'+esc(x.processo)+'</td><td>'+esc(x.dotacao)+'</td><td>'+
 amount(x.empenhado_liquido_centavos)+'</td><td>'+amount(x.saldo_informado_centavos)+'</td></tr>')));
 html+=panel('Ocorrências para conferência',warnings.length?
 table(['Nível','Código','Referência'],warnings.slice(0,300).map(x=>'<tr><td>'+esc(x.nivel)+'</td><td>'+esc(x.codigo)+'</td><td>'+esc(x.mensagem)+'</td></tr>')):
 '<div class="v5-clean">Nenhum alerta estrutural identificado.</div>');
 html+='<p class="v5-footer">Importante: recursos não destinados em RIPC, saldos em empenhos e disponibilidade orçamentária são conceitos diferentes. Os alertas não comprovam irregularidade.</p>';
 return html;
}
function validate(o){
 if(o?.sig_version!=='6.0.0'||o.tipo!=='CONCILIACAO_LOCAL'||!o.resumo||
 !Array.isArray(o.repasses)||!Array.isArray(o.dotacoes)||!Array.isArray(o.empenhos)||!Array.isArray(o.alertas))
  throw Error('Arquivo não reconhecido como relatório de conciliação V6.');
 if(Math.max(o.repasses.length,o.dotacoes.length,o.empenhos.length,o.alertas.length)>30000)throw Error('Relatório acima do limite de linhas.');
 return o;
}
function restore(data){report=validate(data);search='';}
async function load(file){
 if(!file)return;
 if(file.size>5*1024*1024)throw Error('Arquivo ultrapassa 5 MB.');
 let o;try{o=JSON.parse(await file.text())}catch{throw Error('JSON inválido.')}
 restore(o);
}
function getData(){return report;}
function reset(){report=null;search='';}
function filter(v){search=String(v||'').slice(0,100);}
function demo(){
 report={sig_version:'6.0.0',tipo:'CONCILIACAO_LOCAL',origem:'Simulação fictícia',gerado_em:new Date().toISOString(),assinatura_geral:'DEMONSTRACAO',
 resumo:{repasses:1,ripcs:1,itens:2,dotacoes:1,empenhos:1,continuos:0,empenhos_com_dotacao_de_cota:1,
 cota_liquida_centavos:500000,ripc_total_centavos:300000,diferenca_global_informativa_centavos:200000},
 repasses:[{ano:'2026',documento:'DEMO-001',dotacao:'12510000000000000001',credito_liquido_centavos:500000,valor_ripc_centavos:300000,
 diferenca_nao_destinada_centavos:200000,situacao:'CONCILIADO_ARITMETICAMENTE'}],
 dotacoes:[{dotacao:'12510000000000000001',cotas_centavos:500000,ripc_centavos:300000,empenhado_liquido_centavos:150000,saldo_empenhos_centavos:50000,empenhos:1}],
 empenhos:[{chave_empenho:'DEMO/2026',processo:'DEMO-001/2026',dotacao:'12510000000000000001',empenhado_liquido_centavos:150000,saldo_informado_centavos:50000}],
 alertas:[]};search='';
}
function answer(question,authorized){
 if(!report||!authorized)return null;
 const q=String(question||''),l=q.toLowerCase(),digits=q.replace(/\D/g,'');
 const found=digits.length>=18?(report.dotacoes||[]).find(x=>digits.includes(x.dotacao)):null;
 if(found)return 'DOTAÇÃO '+found.dotacao+'\nCota líquida: '+amount(found.cotas_centavos)+
 '\nRIPC: '+amount(found.ripc_centavos)+'\nDiferença indicativa: '+amount(found.nao_destinado_teorico_centavos??(found.cotas_centavos-found.ripc_centavos))+
 '\nEmpenhado líquido: '+amount(found.empenhado_liquido_centavos)+'\nSaldo dos empenhos: '+amount(found.saldo_empenhos_centavos)+
 '\nFonte: relatório V6 carregado localmente.\nA diferença NÃO comprova disponibilidade para empenhar.';
 if(/repass|ripc|dotac|saldo|cota|concilia/.test(l)){
  const s=report.resumo;
  return 'CONCILIAÇÃO LOCAL V6\nCotas líquidas: '+amount(s.cota_liquida_centavos)+
  '\nRIPC destinado: '+amount(s.ripc_total_centavos)+'\nDiferença informativa: '+amount(s.diferenca_global_informativa_centavos)+
  '\nDocumentos: '+integer(s.repasses)+'; empenhos: '+integer(s.empenhos)+'\nAlertas: '+integer(report.alertas.length)+
  '\nDados válidos somente para a posição da planilha analisada; não são o saldo oficial atual.';
 }
 return null;
}
window.SIG_V6={view,load,demo,reset,filter,answer,getData,restore};
})();
