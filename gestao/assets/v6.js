/* SIG CSA-TIC V6 — conferência de JSON financeiro SOMENTE no navegador.
   Não grava em localStorage, não faz fetch e não transmite dados.
   Este módulo precisa ser incluído ANTES de app.js. */
(() => {
'use strict';
let report=null,search='';
const esc=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const amount=v=>typeof v==='number'&&Number.isFinite(v)?new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(v/100):'—';
const integer=v=>new Intl.NumberFormat('pt-BR').format(Number(v)||0);

// Exibição retrocompatível: também lê JSONs V6 antigos, mas alerta que é preciso regenerá-los.
const v6DotSizes=[4,2,3,3,4,4,4,4,2,1,1];
function v6DotLabel(raw){
 const orig=String(raw??'').trim().toUpperCase(),parts=orig.split('.');
 let digits=orig.replace(/\D/g,'');
 if(parts.length===11&&/^\d{2}XX$/.test(parts[7])){
  parts[7]=parts[7].slice(0,2)+'00';digits=parts.join('');
 }
 if(!/^\d{32}$/.test(digits)){
  const it=parts.length===7?parts[3]:'';
  return {formatted:orig,normalized:digits,
   type:/^\d{4}$/.test(it)?it.slice(2)==='00'?'GLOBAL':'ITEM_DEFINIDO':'FORMATO_A_CONFERIR',
   account:/^\d{4}$/.test(it)?it.slice(2)==='00'?'998020301':'998020302':''};
 }
 const seg=[];let off=0;for(const n of v6DotSizes){seg.push(digits.slice(off,off+n));off+=n;}
 if(/^00\d{2}$/.test(seg[7]))seg[7]=seg[7].slice(2)+'00';
 const normalized=seg.join(''),glob=seg[7].slice(2)==='00';
 if(glob)seg[7]=seg[7].slice(0,2)+'XX';
 return {formatted:seg.join('.'),normalized,type:glob?'GLOBAL':'ITEM_DEFINIDO',account:glob?'998020301':'998020302'};
}
function v6DotCell(row){
 const info=v6DotLabel(row.dotacao),formatted=row.dotacao_exibicao||info.formatted;
 const type=row.tipo_dotacao||info.type,account=row.conta_controle||info.account;
 const originals=row.origens_bo||[];
 const source=originals.length?'Origem BO: '+originals.join(' | '):'';
 return '<b>'+esc(formatted)+'</b><div class="cell-sub">'+esc(type==='GLOBAL'?'GLOBAL · sem item':type==='ITEM_DEFINIDO'?'ITEM DEFINIDO':'Código a conferir')+
 (account?' · Conta '+esc(account):'')+'</div>'+
 (source?'<div class="cell-sub">'+esc(source)+'</div>':'');
}

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
 const r=report,summary=r.resumo||{},warnings=Array.isArray(r.alertas)?r.alertas:[],
 q=search.trim().toUpperCase().replace(/(\d{2})XX/g,(_,el)=>el+'00').replace(/\D/g,'');
 const filter=arr=>Array.isArray(arr)?arr.filter(x=>!q||[x.dotacao,x.dotacao_exibicao,x.dotacao_orig,...(x.origens_bo||[])].some(v=>{
   const str=String(v||''),i=v6DotLabel(str);
   return i.normalized.includes(q)||str.replace(/\D/g,'').includes(q);
 })):[];
 const repasses=filter(r.repasses),dotacoes=filter(r.dotacoes),empenhos=filter(r.empenhos);
 if(!summary.regra_dotacao_global_v2)html+='<div class="v5-notice"><b>JSON anterior à correção de dotações globais.</b> Atualize o Apps Script V6, gere novo relatório e importe o JSON atualizado.</div>';
 if(!summary.regra_mestre_abate_v1)html+='<div class="v5-notice"><b>JSON sem a regra mestre de abatimento.</b> O abatimento por dotação específica ou global somente será exibido após gerar um novo relatório no Apps Script V6 atualizado.</div>';
 if(summary.regra_mestre_abate_v1&&!summary.posicao_cotas_atualizada_hoje)
 html+='<div class="v5-notice"><b>Posição histórica.</b> Última importação de cotas: '+esc(summary.referencia_cotas_data||'não informada')+'. A conciliação não demonstra quais dotações estão disponíveis hoje. Consulte a posição atual antes de decidir operacionalmente.</div>';
 const kpi=(label,value,sub)=>'<div class="card v5-metric"><small>'+esc(label)+'</small><strong>'+esc(value)+'</strong><span>'+esc(sub)+'</span></div>';
 html+='<div class="v6-metrics">'+
 kpi('Cotas líquidas',amount(summary.cota_liquida_centavos),'Valor descentralizado, com anulações')+
 kpi('RIPC destinados',amount(summary.ripc_total_centavos),'Sem somar Valor_Total_Repasse repetido')+
 kpi('Diferença indicativa',amount(summary.diferenca_global_informativa_centavos),'Não é disponibilidade para empenhar')+
 kpi('Empenhos',integer(summary.empenhos),'Registros distintos no índice')+
 (summary.regra_mestre_abate_v1?
 kpi('Abatimento gerencial',amount(summary.valor_abatido_gerencial_centavos),'Soma dos empenhos atribuídos uma vez, NÃO baixa contábil')+
 kpi('Empenhos atribuídos',integer(summary.empenhos_abatidos),'Específica ou global, sem comparação de valores'):'')+'</div>';
 html+=panel('Origem e consistência','<p class="v6-data-info"><b>Origem:</b> '+esc(r.origem)+' · <b>Gerado em:</b> '+esc(r.gerado_em)+' · <b>Versão:</b> '+esc(r.sig_version)+'</p>'+
 '<div class="v6-counters">'+[
  'Documentos: '+integer(summary.repasses),'RIPC: '+integer(summary.ripcs),'Itens: '+integer(summary.itens),
  'Dotações: '+integer(summary.dotacoes),'Serviços prováveis: '+integer(summary.continuos),
  ...(summary.regra_mestre_abate_v1?['Empenhos na global: '+integer(summary.empenhos_abatidos_globais),
     'Empenhos na específica: '+integer(summary.empenhos_abatidos_especificos),
     'Empenhos ambíguos: '+integer(summary.empenhos_ambiguos),
     'Empenhos sem cota: '+integer(summary.empenhos_sem_cota)]:[]),
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
 '<tr><td><b>'+esc(x.ano)+' / '+esc(x.documento)+'</b><div class="cell-sub">'+v6DotCell(x)+'</div></td>'+
 '<td>'+amount(x.credito_liquido_centavos)+'</td><td>'+amount(x.valor_ripc_centavos)+'</td>'+
 '<td>'+amount(x.diferenca_nao_destinada_centavos)+'</td><td><span class="v6-status">'+esc(x.situacao)+'</span></td></tr>')));
 html+=panel('Consolidação por dotação',
 '<p class="v5-guide">Abatimento gerencial: cada empenho positivo é descontado uma vez na cota específica ou, na ausência desta, na global do mesmo elemento e classificação. Se ambas existirem, há alerta e nenhum abatimento automático. A diferença calculada não é saldo oficial do SIAFI.</p>'+
 table(['Dotação / Tipo e conta','Cota líquida','Abatido gerencial','Diferença NÃO OFICIAL','RIPC vinculado','Empenhado na mesma dotação','Saldo dos empenhos'],dotacoes.slice(0,200).map(x=>
 '<tr><td>'+v6DotCell(x)+'</td><td>'+amount(x.cotas_centavos)+'</td>'+
 '<td>'+amount(x.abatido_sig_centavos)+'</td><td>'+amount(x.diferenca_gerencial_centavos)+'</td>'+
 '<td>'+amount(x.ripc_centavos)+'</td><td>'+amount(x.empenhado_liquido_centavos)+'</td>'+
 '<td>'+amount(x.saldo_empenhos_centavos)+'</td></tr>')));
 if(Array.isArray(r.abatimentos)){
  const abatFilter=r.abatimentos.filter(x=>!q||[x.dotacao_empenho,x.dotacao_global_candidata,x.dotacao_de_abate,x.dotacao_empenho_original].some(v=>{
   const raw=String(v||'');return raw.replace(/\D/g,'').includes(q)||v6DotLabel(raw).normalized.includes(q);
  }));
  const label={ABATIDO_ESPECIFICA:'Abatido na específica',ABATIDO_GLOBAL:'Abatido na global',
   AMBIGUA_SEM_ABATE:'ALERTA — duas dotações',SEM_COTA:'ALERTA — sem cota',
   CODIGO_INCOMPLETO:'ALERTA — código incompleto',VALOR_NEGATIVO_CONFERIR:'ALERTA — valor negativo',
   SEM_VALOR_LIQUIDO:'Sem valor líquido'};
  html+=panel('Regra mestre — abatimentos de empenhos',
   '<p class="v5-guide">Não exige igualdade de valores entre cota e empenho. O abatimento é apenas uma conciliação gerencial sobre a posição importada, não uma operação no SIAFI nem uma vinculação a documento de repasse. Se houver global e específica, o SIG não escolhe automaticamente.</p>'+
   table(['Empenho / Processo','Dotação do empenho','Dotação abatida','Valor líquido','Resultado'],
    abatFilter.slice(0,300).map(x=>
    '<tr><td><b>'+esc(x.chave_empenho)+'</b><div class="cell-sub">'+esc(x.processo||'')+'</div></td>'+
    '<td>'+esc(v6DotLabel(x.dotacao_empenho).formatted)+'</td>'+
    '<td>'+(x.dotacao_de_abate?esc(v6DotLabel(x.dotacao_de_abate).formatted):'—')+'</td>'+
    '<td>'+amount(x.valor_empenhado_liquido_centavos)+'</td>'+
    '<td><span class="v6-status">'+esc(label[x.status]||x.status)+'</span></td></tr>')));
 }
 html+=panel('Empenhos identificados',
 table(['Chave','Processo','Dotação','Empenhado líquido','Saldo informado'],empenhos.slice(0,200).map(x=>
 '<tr><td>'+esc(x.chave_empenho)+'</td><td>'+esc(x.processo)+'</td><td>'+v6DotCell(x)+'</td><td>'+
 amount(x.empenhado_liquido_centavos)+'</td><td>'+amount(x.saldo_informado_centavos)+'</td></tr>')));
 html+=panel('Ocorrências para conferência',warnings.length?
 table(['Nível','Código','Referência'],warnings.slice(0,300).map(x=>'<tr><td>'+esc(x.nivel)+'</td><td>'+esc(x.codigo)+'</td><td>'+esc(x.mensagem)+'</td></tr>')):
 '<div class="v5-clean">Nenhum alerta estrutural identificado.</div>');
 html+='<p class="v5-footer">Importante: RIPC não é uma despesa adicional; não é subtraído novamente dos empenhos. Os abatimentos gerenciais dependem da posição da planilha, podem diferir do saldo oficial do SIAFI e não representam baixa contábil.</p>';
 return html;
}
function validate(o){
 if(o?.sig_version!=='6.0.0'||o.tipo!=='CONCILIACAO_LOCAL'||!o.resumo||
 !Array.isArray(o.repasses)||!Array.isArray(o.dotacoes)||!Array.isArray(o.empenhos)||!Array.isArray(o.alertas))
  throw Error('Arquivo não reconhecido como relatório de conciliação V6.');
 if(Math.max(o.repasses.length,o.dotacoes.length,o.empenhos.length,o.alertas.length,Array.isArray(o.abatimentos)?o.abatimentos.length:0)>30000)throw Error('Relatório acima do limite de linhas.');
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
 '\nEmpenhado líquido: '+amount(found.empenhado_liquido_centavos)+'\nAbatido gerencial: '+amount(found.abatido_sig_centavos)+'\nDiferença gerencial (NÃO oficial): '+amount(found.diferenca_gerencial_centavos)+'\nSaldo dos empenhos: '+amount(found.saldo_empenhos_centavos)+
 '\nFonte: relatório V6 carregado localmente.\nA diferença NÃO comprova disponibilidade para empenhar.';
 if(/repass|ripc|dotac|saldo|cota|concilia/.test(l)){
  const s=report.resumo;
  return 'CONCILIAÇÃO LOCAL V6\nCotas líquidas: '+amount(s.cota_liquida_centavos)+
  '\nRIPC destinado: '+amount(s.ripc_total_centavos)+'\nDiferença informativa: '+amount(s.diferenca_global_informativa_centavos)+
  '\nDocumentos: '+integer(s.repasses)+'; empenhos: '+integer(s.empenhos)+'\nAbatido gerencial: '+amount(s.valor_abatido_gerencial_centavos)+'\nEmpenhos atribuídos: '+integer(s.empenhos_abatidos)+'\nAlertas: '+integer(report.alertas.length)+
  '\nDados válidos somente para a posição da planilha analisada; não são o saldo oficial atual.';
 }
 return null;
}
window.SIG_V6={view,load,demo,reset,filter,answer,getData,restore};
})();
