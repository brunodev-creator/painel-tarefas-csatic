/* SIG CSA-TIC V7 — painel local de auditoria de processos e RIPC.
   Sem fetch, cookies, localStorage ou envio para Supabase. */
(function(){
'use strict';
let report=null,term='';
const esc=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const money=n=>typeof n==='number'&&Number.isFinite(n)?new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(n/100):'—';
const int=n=>new Intl.NumberFormat('pt-BR').format(Number(n)||0);
const shade=s=>/DIVERGEN|MAIOR|REVISAO|BLOQUEIO/.test(String(s||''))?'v7-flag-danger':/ABREVIADO|SEM_AUTO|PENDENCIA|PARCIAL/.test(String(s||''))?'v7-flag-warn':'v7-flag-muted';
const status=v=>'<span class="v7-flag '+shade(v)+'">'+esc(v||'—')+'</span>';
const cols=(titles,body)=>'<div class="table-scroll"><table class="data-table"><thead><tr>'+titles.map(x=>'<th>'+esc(x)+'</th>').join('')+'</tr></thead><tbody>'+
 (body.length?body.join(''):'<tr><td colspan="'+titles.length+'" class="table-empty">Nenhum registro encontrado.</td></tr>')+'</tbody></table></div>';
const card=(label,value,foot)=>'<div class="card v5-metric"><small>'+esc(label)+'</small><strong>'+esc(value)+'</strong><span>'+esc(foot)+'</span></div>';
const section=(title,body,extra)=>'<div class="card section">'+
 '<div class="section-heading"><div><h2>'+esc(title)+'</h2>'+(extra?'<p class="sub">'+esc(extra)+'</p>':'')+'</div></div>'+body+'</div>';
function view(authorized){
 if(!authorized)return '<div class="pagehead"><h1>Acesso restrito</h1><p>Auditoria disponível para perfis autorizados.</p></div>';
 let html='<div class="pagehead"><div><div class="eyebrow">INTERPRETAÇÃO DE DADOS</div><h1>Auditoria de compras — V7</h1>'+
 '<p class="sub">Modalidade, estimativa, homologação, registro de preços e divergências do RIPC.</p></div>'+
 '<div class="head-actions"><button class="btn" data-action="vaultRestore" data-kind="v7">Restaurar cópia protegida</button>'+
 (report?'<button class="btn" data-action="vaultSave" data-kind="v7">Salvar cópia protegida</button>':'')+
 '<button class="btn" data-action="vaultDelete" data-kind="v7">Apagar cópia local</button>'+
 '<button class="btn" data-action="v7Demo">Exemplo fictício</button>'+
 (report?'<button class="btn" data-action="v7Clear">Limpar prévia</button>':'')+'</div></div>';
 html+='<div class="v5-notice"><strong>Dados permanecem neste dispositivo:</strong> o relatório JSON é lido em memória e não é enviado ao Supabase, GitHub ou serviço de IA. Para preservar uma cópia após logout, use o cofre local opcional. Valores de RIPC e modalidades manuais nunca prevalecem sobre o relatório automático de homologação.</div>';
 html+='<div class="card v5-upload"><div><h2>Auditar processos e RIPC</h2><p>Na planilha <b>saldos_2_0</b> use <b>SIG V7 (processos) → Baixar JSON para SIG (local)</b>.</p></div>'+
 '<label class="btn primary v5-label" for="v7-upload">Selecionar SIG_V7_PROCESSOS.json</label>'+
 '<input id="v7-upload" type="file" accept=".json,application/json" class="v5-file"></div>';
 html+=section('Instalação do auditor', '<ol class="v5-steps">'+
 '<li>No Apps Script crie novo arquivo <code>SIG_V7_Processos.gs</code>, sem substituir V5/V6.</li>'+
 '<li>Cole o <a target="_blank" rel="noopener noreferrer" href="https://github.com/brunodev-creator/painel-tarefas-csatic/blob/main/gestao/integracao/SIG_V7_Processos.gs">código V7 do GitHub ↗</a> e salve.</li>'+
 '<li>Execute <code>sigV7InstalarMenu</code> uma vez e atualize o Google Sheets.</li>'+
 '<li>Execute <b>SIG V7 (processos) → Auditar modalidades e valores</b>. Revise as abas <code>SIG_V7_*</code>.</li>'+
 '<li>Em <code>SIG_V7_VINCULOS_CONFERIDOS</code>, você poderá indicar processo e documento comprobatório para RIPC abreviados, sem inventar vínculos.</li></ol>');
 if(!report)return html+section('Prévia de auditoria','<p class="v5-guide">Selecione o JSON gerado pela planilha. Também é possível visualizar um exemplo fictício.</p>');
 const s=report.resumo||{},issues=report.alertas||[],p=report.processos||[],r=report.ripc||[];
 const look=term.trim().toLowerCase();
 const contains=(...xs)=>!look||xs.some(x=>String(x??'').toLowerCase().includes(look));
 const procs=p.filter(x=>contains(x.processo,x.modalidade_automatica,x.modalidade_controle,x.objeto));
 const ripcs=r.filter(x=>contains(x.id_ripc,x.processo_informado,x.processo_oficial_confirmado,x.modalidade_manual,x.via_aquisicao,x.objeto_ripc));
 const problems=issues.filter(x=>contains(x.processo,x.codigo,x.mensagem));
 html+='<div class="v7-metrics">'+
 card('Homologações automáticas',int(s.homologados_automaticos),'Pregão, dispensa e outras modalidades registradas')+
 card('RIPC manuais',int(s.ripc_total),'Cadastro sujeito à conferência')+
 card('RIPC sem identificação formal',int(s.ripc_sem_numero_formal),'Não vinculados por suposição')+
 card('Divergências de modalidade',int(s.modalidade_ripc_divergente),'Comparações com fonte automática')+
 '</div>';
 html+=section('Confiabilidade das origens',
 '<div class="v7-source-grid"><div><strong>1. Homologação automática</strong><small>Valores de referência, homologado e procedimento extraídos do relatório</small></div>'+
 '<div><strong>2. Controle de processos</strong><small>Cadastro derivado ou complementado, sujeito à verificação da origem</small></div>'+
 '<div><strong>3. RIPC manual</strong><small>Modalidade, valores e processo devem ser conciliados; entrada manual não substitui homologação</small></div></div>'+
 '<p class="v5-guide"><b>Gerado:</b> '+esc(report.gerado_em)+' · <b>Fonte:</b> '+esc(report.origem)+' · <b>Assinatura:</b> '+esc(report.assinatura_geral)+'</p>');
 html+=section('Pesquisar processo, RIPC ou modalidade',
 '<div class="v7-searchbar"><input id="v7-filter" class="v6-search" type="search" value="'+esc(term)+'" placeholder="Ex.: 1250071 000023/2026 ou carona">'+
 '<button class="btn primary" data-action="v7ApplyFilter">Aplicar filtro</button><button class="btn" data-action="v7ClearFilter">Limpar</button></div>'+
 '<p class="v5-guide">Resultados: '+int(procs.length)+' processos · '+int(ripcs.length)+' RIPC · '+int(problems.length)+' apontamentos.</p>');
 html+=section('Resultados homologados e valores',
 '<p class="v5-guide">Economia é diferença entre referência e homologado. Não equivale a recurso liberado para empenhar.</p>'+
 cols(['Processo / Procedimento','Referência','Homologado','Economia','RIPC vinculado','Comparação'],
 procs.slice(0,200).map(x=>'<tr><td><b>'+esc(x.processo)+'</b><div class="cell-sub">'+esc(x.modalidade_automatica||x.modalidade_controle||'Sem modalidade confirmada')+'</div></td>'+
 '<td>'+money(x.valor_referencia_centavos)+'</td><td>'+money(x.valor_homologado_centavos)+'</td>'+
 '<td>'+money(x.economia_centavos)+'</td><td>'+money(x.total_ripc_vinculado_centavos)+'</td><td>'+status(x.comparacao_ripc_homologado)+'</td></tr>')),
 'Fonte automática prevalece na comparação quando disponível.');
 html+=section('RIPC e vias de aquisição',
 '<p class="v5-guide">Ata de RP não comprova a origem SIRP ou carona. Número abreviado exige vínculo documental.</p>'+
 cols(['RIPC / Processo informado','Modalidade manual','Via de aquisição','RIPC (R$)','Vínculo'],
 ripcs.slice(0,180).map(x=>'<tr><td><b>'+esc(x.processo_informado||'—')+'</b><div class="cell-sub">'+esc(x.id_ripc)+'</div></td>'+
 '<td>'+esc(x.modalidade_manual)+'</td><td>'+esc(x.via_aquisicao)+'</td><td>'+money(x.valor_ripc_centavos)+'</td>'+
 '<td>'+status(x.vinculo)+'</td></tr>')));
 html+=section('Pendências e diferenças para revisão',
 cols(['Gravidade','Processo / Registro','Ocorrência','Motivo'],
 problems.slice(0,220).map(x=>'<tr><td>'+status(x.gravidade)+'</td><td>'+esc(x.processo)+'</td>'+
 '<td><b>'+esc(x.codigo)+'</b></td><td>'+esc(x.mensagem)+'</td></tr>')),
 'Os apontamentos exigem conferência, não comprovam erro ou irregularidade.');
 html+='<p class="v5-footer">Somatórios referem-se à posição histórica importada; registro de preços, carona e COTEP só podem ser confirmados com a documentação pertinente.</p>';
 return html;
}
function validate(x){
 if(!x||x.sig_version!=='7.0.0'||x.tipo!=='AUDITORIA_PROCESSOS_LOCAL'||!x.resumo||
 !Array.isArray(x.processos)||!Array.isArray(x.ripc)||!Array.isArray(x.alertas))throw Error('Relatório não reconhecido como V7.');
 if(Math.max(x.processos.length,x.ripc.length,x.alertas.length)>30000)throw Error('Relatório ultrapassa o limite.');
 return x;
}
async function load(file){
 if(!file)return;if(file.size>5*1024*1024)throw Error('JSON acima do limite de 5 MB.');
 let data;try{data=JSON.parse(await file.text())}catch{throw Error('JSON inválido.')}
 restore(data);
}
function restore(data){report=validate(data);term='';}
function clear(){report=null;term='';}
function getData(){return report;}
function filter(t){term=String(t||'').slice(0,180);}
function demo(){
 restore({sig_version:'7.0.0',tipo:'AUDITORIA_PROCESSOS_LOCAL',origem:'Exemplo fictício (nenhum dado real)',gerado_em:new Date().toISOString(),assinatura_geral:'DEMO',
 resumo:{homologados_automaticos:1,ripc_total:1,ripc_sem_numero_formal:0,modalidade_ripc_divergente:1},
 processos:[{processo:'1234567 000001/2026',modalidade_automatica:'Dispensa de Licitação - Por valor',valor_referencia_centavos:100000,
 valor_homologado_centavos:50000,economia_centavos:50000,total_ripc_vinculado_centavos:50000,comparacao_ripc_homologado:'RIPC_IGUAL_HOMOLOGADO'}],
 ripc:[{id_ripc:'DEMO-RIPC1',processo_informado:'1234567 000001/2026',modalidade_manual:'Pregão',via_aquisicao:'NAO_DEFINIDA',valor_ripc_centavos:50000,vinculo:'IDENTIFICADOR_FORMAL_DECLARADO'}],
 alertas:[{gravidade:'REVISAO',codigo:'MODALIDADE_RIPC_DIVERGENTE',processo:'1234567 000001/2026',mensagem:'RIPC manual descreve Pregão, relatório automático descreve Dispensa por valor.'}]});
}
function answer(q,authorized){
 if(!authorized||!report)return null;
 const raw=String(q||''),match=raw.match(/\d{7}\s+\d{6}\/\d{4}/);
 if(match){
  const p=report.processos.find(x=>x.processo===match[0]);
  if(!p)return 'O processo '+match[0]+' não consta na auditoria V7 carregada. Isso não prova que esteja ausente nos sistemas oficiais.';
  return 'PROCESSO '+p.processo+'\nProcedimento no relatório automático: '+(p.modalidade_automatica||'não localizado')+
  '\nReferência: '+money(p.valor_referencia_centavos)+'\nHomologado: '+money(p.valor_homologado_centavos)+
  '\nEconomia aritmética: '+money(p.economia_centavos)+'\nRIPC com vínculo formal: '+money(p.total_ripc_vinculado_centavos)+
  '\nSituação: '+p.comparacao_ripc_homologado+
  '\n\nA conferência depende de dados da última importação e de validação nos documentos oficiais.';
 }
 if(/modali|licita|pregao|inexigib|cotep|carona|sirp|registro de preco|homologad/.test(raw.toLowerCase())){
  const s=report.resumo;
  return 'AUDITORIA V7\nHomologações automáticas: '+int(s.homologados_automaticos)+
   '\nRIPC cadastrados manualmente: '+int(s.ripc_total)+
   '\nRIPC ainda sem processo formal vinculado: '+int(s.ripc_sem_numero_formal)+
   '\nModalidades divergentes: '+int(s.modalidade_ripc_divergente)+
   '\n\nA classificação de Ata de RP não identifica automaticamente SIRP ou carona. Consulte as tabelas da V7 e o documento comprobatório.';
 }
 return null;
}
window.SIG_V7=Object.freeze({view,load,restore,clear,getData,filter,demo,answer});
})();