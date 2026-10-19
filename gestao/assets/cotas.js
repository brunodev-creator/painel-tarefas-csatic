/* Saldos por dotação. Fonte prioritária: DASHBOARD autenticado da PLANILHA ATUAL
 * (snapshot protegido no Supabase). A conciliação V6 permanece separada e local.
 * Nenhuma escrita ou publicação de dados financeiros pelo navegador. */
(() => {
'use strict';
const state={q:'',tipo:'TODOS',conta:'TODAS',mostrarZeradas:false,dailyRefs:[],dailyError:'',cloudPhase:'idle',cloudError:'',cloudReport:null};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const num=v=>Number.isFinite(Number(v))?Number(v):0;
const fmt=cents=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(num(cents)/100);
const data=()=>['loading','error'].includes(state.cloudPhase)?null:(state.cloudReport||window.SIG_V6?.getData?.()||null);
const FONTE_ID='1dxzDySXU1h5BKJkW1_mHpNX9KRwgX6Ol5b_kRqeRrJA';
function money(v){
 const s=String(v??'').trim(),m=s.match(/^(-)?(?:R\$\s*)?(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?$/);
 if(!m)return null;
 const n=Number(m[2].replace(/\./g,''))*100+Number((m[3]||'').padEnd(2,'0'));
 return Number.isSafeInteger(n)?(m[1]?-n:n):null;
}
function dashboardReport(item){
 if(!item||item.aba!=='DASHBOARD'||item.origem_id!==FONTE_ID)throw Error('Origem do DASHBOARD não corresponde à PLANILHA ATUAL.');
 const h=item.cabecalhos||[], source=item.linhas||[];
 const cols=['Dotacao','Total_Repassado_Dotacao','TOTAL_EMPENHADO','Saldo_A_Destinar','Qtd_Docs_Repasse'];
 const idx=cols.map(k=>h.indexOf(k));
 if(idx.some(i=>i<0)||!Array.isArray(source)||source.length!==Number(item.quantidade))throw Error('Estrutura do DASHBOARD incompleta.');
 const dotacoes=source.map((row,k)=>{
   const raw=String(row[idx[0]]||'').trim(),p=raw.split('.');
   if(p.length!==11||!/^[0-9]{4}$/.test(p[7]))throw Error('Dotação inválida na linha '+(k+9)+'.');
   const glob=/^00[0-9]{2}$/.test(p[7])||p[7].slice(2)==='00';
   const display=p.slice();if(glob)display[7]=(/^00/.test(p[7])?p[7].slice(2):p[7].slice(0,2))+'XX';
   const vals=[idx[1],idx[2],idx[3]].map(i=>money(row[i]));
   if(vals.some(n=>n===null)||Math.abs(vals[0]-vals[1]-vals[2])>1)throw Error('Valores divergentes na dotação '+raw+'.');
   return {dotacao:raw,dotacao_exibicao:display.join('.'),tipo_dotacao:glob?'GLOBAL':'ITEM_DEFINIDO',
     conta_controle:glob?'998020301':'998020302',
     cotas_centavos:vals[0],abatido_sig_centavos:vals[1],
     documentos:Number(row[idx[4]]||0),origens_bo:[raw]};
 });
 const budget=dotacoes.reduce((n,x)=>n+x.cotas_centavos,0);
 const spent=dotacoes.reduce((n,x)=>n+x.abatido_sig_centavos,0);
 const t=item.gerado_em||item.importado_em||'';
 return {_dashboard:true,gerado_em:t,
   resumo:{cota_liquida_centavos:budget,valor_abatido_gerencial_centavos:spent,
     referencia_cotas_data:/^\d{4}-\d{2}-\d{2}/.test(t)?t.slice(0,10):''},
   dotacoes};
}
async function load(rest,force=false){
 if(state.cloudPhase==='loading'||(state.cloudPhase==='ready'&&!force))return false;
 state.cloudPhase='loading';state.cloudError='';
 try{
   const items=await rest('/rest/v1/sig_planilha_snapshots?aba=eq.DASHBOARD&select=aba,origem_id,cabecalhos,linhas,quantidade,gerado_em,importado_em&limit=1');
   if(!items?.[0])throw Error('DASHBOARD ainda não foi importado para o SIG.');
   const parsed=dashboardReport(items[0]);
   if(!window.SIG_COTAS_AUD)throw Error('Módulo de conciliação contábil não foi carregado. Atualize a página.');
   await window.SIG_COTAS_AUD.load(rest,parsed);
   // Referências manuais de diárias são registradas separadamente do snapshot V6.
   const dailies=await rest('/rest/v1/sig_cotas_diarias_referencia?ativo=eq.true&select=dotacao_normalizada,saldo_informado_centavos,observado_em,origem,justificativa');
   if(!Array.isArray(dailies))throw Error('Referência das diárias não está disponível. Não é seguro usar os saldos V6 como se fossem contábeis.');
   for(const d of dailies){
     if(!/^[0-9]{32}$/.test(String(d.dotacao_normalizada))||
        !Number.isSafeInteger(Number(d.saldo_informado_centavos))||Number(d.saldo_informado_centavos)<0||
        !Number.isFinite(Date.parse(d.observado_em||'')))throw Error('Cadastro da referência de diárias inválido.');
   }
   if(new Set(dailies.map(d=>d.dotacao_normalizada)).size!==dailies.length)throw Error('Referências de diárias duplicadas.');
   state.dailyRefs=dailies;state.dailyError='';
   state.cloudReport=parsed;state.cloudPhase='ready';
 }catch(e){state.cloudReport=null;state.dailyRefs=[];state.dailyError=e.message||String(e);state.cloudPhase='error';state.cloudError=state.dailyError;}
 return true;
}
function resetCloud(){state.cloudPhase='idle';state.cloudError='';state.cloudReport=null;state.dailyRefs=[];state.dailyError='';window.SIG_COTAS_AUD?.reset();}
function isLoaded(){return state.cloudPhase!=='idle';}
const own=(d,k)=>Object.prototype.hasOwnProperty.call(d,k);
const dotString=d=>d.dotacao_exibicao||formatDot(d.dotacao);
function formatDot(value){
 const s=String(value||''),n=s.replace(/\D/g,'');
 if(n.length!==32)return s;
 const sizes=[4,2,3,3,4,4,4,4,2,1,1];let at=0;
 const parts=sizes.map(size=>{const p=n.slice(at,at+size);at+=size;return p});
 if(parts[7].slice(2)==='00')parts[7]=parts[7].slice(0,2)+'XX';
 return parts.join('.');
}
function allRows(){
 const r=data();if(!r||!Array.isArray(r.dotacoes))return [];
 return r.dotacoes.filter(d=>Number(d.documentos||0)>0).map(d=>{
   const p=dotString(d).split('.'),item=p[7]||'',global=d.tipo_dotacao==='GLOBAL'||item.endsWith('XX');
   const budget=num(d.cotas_centavos),spent=num(d.abatido_sig_centavos);
   const descricao=window.SIG_COTAS_DESC.descrever(p);
   return {...d,_code:dotString(d),_global:global,_type:global?'Global':'Item definido',
    _descTitle:descricao.titulo,_descArea:descricao.area,
    _account:d.conta_controle||(global?'998020301':'998020302'),_budget:budget,_spent:spent,_balance:budget-spent,
    _group:p.slice(0,7).join('.')+'.'+item.slice(0,2)};
 }).sort((a,b)=>a._group.localeCompare(b._group,'pt-BR',{numeric:true})||
  Number(a._global)-Number(b._global)||a._code.localeCompare(b._code,'pt-BR',{numeric:true}));
}
// 3390.15 (global ou item definido) não compõe a consulta principal.
function isDiaria(d){
 const p=String(d._code||'').split('.'),item=p[7]||'';
 return p[6]==='3390'&&(item==='15XX'||/^15\d{2}$/.test(item));
}
function dailyRows(){return allRows().filter(isDiaria);}
function rows(){return allRows().filter(d=>!isDiaria(d));}
function dailyRef(d){
 const p=String(d.dotacao||'').split('.');
 if(p.length!==11)return null;
 if(/^00\d{2}$/.test(p[7]))p[7]=p[7].slice(2)+'00';
 const code=p.join('');
 return state.dailyRefs.find(x=>x.dotacao_normalizada===code)||null;
}
function overview(){
 const active=rows(),daily=dailyRows();
 const mainBudget=active.reduce((t,d)=>t+d._budget,0);
 const mainSpent=active.reduce((t,d)=>t+d._spent,0);
 const known= daily.reduce((t,d)=>{const ref=dailyRef(d);return t+(ref?Number(ref.saldo_informado_centavos):0);},0);
 return {mainBudget,mainSpent,mainBalance:mainBudget-mainSpent,
   dayKnown:known,comparison:mainBudget-mainSpent+known,dailyCount:daily.length,
   referenced:daily.filter(d=>!!dailyRef(d)).length};
}
function filtered(){
 const q=window.SIG_COTAS_DESC.textoBusca(state.q),normalized=q.replace(/(\d{2})XX/g,'$100');
 return rows().filter(d=>(state.mostrarZeradas||d._balance!==0)&&
 (state.tipo==='TODOS'||d._type===state.tipo)&&
 (state.conta==='TODAS'||d._account===state.conta)&&
 (!q||[d._code,d.dotacao,...(d.origens_bo||[]),d._account,d._descTitle,d._descArea].some(v=>{
 const t=window.SIG_COTAS_DESC.textoBusca(v);
 const digits=normalized.replace(/\D/g,'');
 return t.includes(q)||(digits!==''&&t.replace(/(\d{2})XX/g,'$100').replace(/\D/g,'').includes(digits));
 })));
}
function rowHtml(d){
 const encoded=encodeURIComponent(String(d.dotacao||''));
 return '<tr><td class="budget-dot">'+esc(d._code)+'</td>'+
 '<td class="budget-description"><strong>'+esc(d._descTitle)+'</strong><small>'+esc(d._descArea)+'</small></td>'+
 '<td><span class="budget-tag '+(d._global?'global':'specific')+'">'+esc(d._type)+'</span></td>'+
 '<td class="budget-account">'+esc(d._account)+'</td>'+
 '<td class="budget-value">'+fmt(d._budget)+'</td>'+
 '<td class="budget-value">'+fmt(d._spent)+'</td>'+
 '<td class="budget-value'+(d._balance<0?' budget-negative':'')+'">'+fmt(d._balance)+'</td>'+
 '<td class="budget-detail"><button type="button" class="budget-link" data-action="cotaDetail" data-dot="'+esc(encoded)+'">Ver detalhes <span aria-hidden="true">→</span></button></td></tr>';
}
function refresh(){
 const body=document.getElementById('cotas-tbody');if(!body)return;
 const list=filtered();body.innerHTML=list.length?list.map(rowHtml).join(''):'<tr><td colspan="8" class="budget-empty">Nenhuma dotação encontrada com esses filtros.</td></tr>';
 const count=document.getElementById('cotas-count');if(count)count.textContent=list.length+' de '+rows().length+' dotações';
 const toggle=document.getElementById('cotas-toggle-zeradas');
 if(toggle){toggle.textContent=state.mostrarZeradas?'Ocultar zeradas':'Mostrar todas';toggle.setAttribute('aria-pressed',state.mostrarZeradas?'true':'false');}
 const note=document.getElementById('cotas-zero-note');
 if(note)note.textContent=state.mostrarZeradas?'Todas as dotações estão visíveis, inclusive as com diferença gerencial de R$ 0,00.':'Exibindo somente dotações com diferença gerencial diferente de R$ 0,00 (inclusive diferenças negativas).';
}
const date=iso=>/^\d{4}-\d{2}-\d{2}$/.test(iso||'')?iso.slice(8,10)+'/'+iso.slice(5,7)+'/'+iso.slice(0,4):'não informada';
function view(authorized,allowExport=false,allowImport=false){
 if(!authorized)return '<div class="card section"><h2>Acesso restrito</h2><p class="sub">A consulta de cotas orçamentárias não está habilitada para este perfil.</p></div>';
 const report=data();
 if(!report&&state.cloudPhase==='loading')return '<div class="budget-page"><div class="budget-breadcrumb">Início <span>›</span> Cota orçamentária <span>›</span> Saldos por dotação</div><div class="card budget-empty-state"><h1>Saldos por dotação</h1><p>Carregando os dados autorizados da PLANILHA ATUAL...</p></div></div>';
 if(!report&&state.cloudPhase==='error')return '<div class="budget-page"><div class="budget-breadcrumb">Início <span>›</span> Cota orçamentária <span>›</span> Saldos por dotação</div><div class="card budget-empty-state"><h1>Saldos por dotação</h1><p>Falha ao consultar o DASHBOARD protegido: '+esc(state.cloudError)+'</p><button type="button" class="btn primary" data-action="cotaReload">Tentar novamente</button></div></div>';
 if(!report)return '<div class="budget-page"><div class="budget-breadcrumb">Início <span>›</span> Cota orçamentária <span>›</span> Saldos por dotação</div>'+
 '<div class="card budget-empty-state"><h1>Saldos por dotação</h1><p>'+ (allowImport?'Para visualizar dados reais, importe um relatório V6 no módulo de conciliação.':'Nenhum relatório de cotas está disponível nesta sessão. A consulta exibirá os saldos quando houver um relatório V6 disponível neste navegador.') +'</p>'+
 (allowImport?'<button type="button" class="btn primary" data-view="conciliacao">Abrir Conciliação V6</button>':'')+
 '<p class="budget-note">Os relatórios V6 são atualmente locais ao navegador e não são compartilhados automaticamente entre usuários. Nenhum valor fictício será exibido como saldo oficial.</p></div></div>';
 const s=report.resumo||{},original=s,grossBudget=num(original.cota_liquida_centavos),
   grossSpent=num(original.valor_abatido_gerencial_centavos),grossBalance=grossBudget-grossSpent;
 const overviewS=overview(),budget=overviewS.mainBudget,spent=overviewS.mainSpent,
   balance=overviewS.mainBalance;
 const warning='<div class="budget-alert"><span class="budget-alert-icon" aria-hidden="true">i</span><div><strong>Posição histórica</strong> · '+
 (report._dashboard?'DASHBOARD + conciliação V6 da PLANILHA ATUAL (snapshot '+esc(report.gerado_em?new Date(report.gerado_em).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}):'não informada')+'). Valores conciliados com empenhos e decisões manuais da V6. Não representam saldo oficial.':
 'Última importação de cotas: '+esc(date(s.referencia_cotas_data))+'.')+
 ' Consulte a posição atual no SIAFI-MG antes de decidir operacionalmente.'+
 (report._dashboard?' <button type="button" class="budget-link" data-action="cotaReload">Atualizar consulta</button>':'')+
 '</div></div>';
 const kpi=(type,ico,val)=>'<div class="card budget-card"><div class="budget-icon">'+ico+'</div><div><div class="budget-label">'+type+'</div><strong>'+fmt(val)+'</strong></div></div>';
 const icon1='<svg viewBox="0 0 24 24" width="25" height="25" fill="none" stroke="currentColor" stroke-width="1.8"><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v7c0 4 16 4 16 0V5M4 12v6c0 4 16 4 16 0v-6"/></svg>';
 const icon2='<svg viewBox="0 0 24 24" width="25" height="25" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h6"/></svg>';
 const icon3='<svg viewBox="0 0 24 24" width="25" height="25" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 19V12h3v7M11 19V7h3v12M17 19V3h3v16"/></svg>';
 const options=(val,opts)=>opts.map(([v,t])=>'<option value="'+esc(v)+'"'+(v===val?' selected':'')+'>'+esc(t)+'</option>').join('');
 return '<div class="budget-page">'+
 '<div class="budget-breadcrumb">Início <span>›</span> Cota orçamentária <span>›</span> <b>Saldos por dotação</b></div>'+
 warning+
 '<div class="budget-hero budget-hero-diarias">'+
 kpi('Cota BO · sem diárias',icon1,budget)+
 kpi('Abatimento V6 · sem diárias',icon2,spent)+
 kpi('Diferença V6 · sem diárias',icon3,balance)+
 kpi('Referência para conferência · inclui diárias informadas',icon3,overviewS.comparison)+
 '</div>'+
 '<p class="budget-note budget-diarias-explanation">O valor de conferência soma apenas as referências de diárias documentadas. '+ 
 'A posição V6 original é preservada: cota '+fmt(grossBudget)+'; abatimento '+fmt(grossSpent)+
 '; diferença '+fmt(grossBalance)+'. Não se trata de saldo oficial atualizado.</p>'+
 '<section class="card budget-panel"><div class="budget-panel-head"><div><h1>Saldos por dotação</h1><p>Visão consolidada por classificação orçamentária'+(report._dashboard?' · Fonte: DASHBOARD da PLANILHA ATUAL':' · Fonte: Conciliação V6 local')+'</p></div>'+
 (allowExport?'<button type="button" class="btn budget-export" data-action="cotaExport">↓ &nbsp; Exportar</button>':'')+'</div>'+
 '<div class="budget-toolbar">'+
 '<label class="budget-search"><span aria-hidden="true">⌕</span><input type="search" id="cotas-busca" placeholder="Buscar dotação, conta ou descrição..." value="'+esc(state.q)+'" aria-label="Buscar dotação ou conta"></label>'+
 '<label class="budget-filter">Tipo<select id="cotas-tipo">'+options(state.tipo,[['TODOS','Todos'],['Global','Global'],['Item definido','Item definido']])+'</select></label>'+
 '<label class="budget-filter">Conta<select id="cotas-conta">'+options(state.conta,[['TODAS','Todas'],['998020301','998020301'],['998020302','998020302']])+'</select></label>'+
 '<button type="button" class="btn budget-toggle-zeros" id="cotas-toggle-zeradas" data-action="cotaToggleZeradas" aria-pressed="'+(state.mostrarZeradas?'true':'false')+'">'+(state.mostrarZeradas?'Ocultar zeradas':'Mostrar todas')+'</button>'+
 '<button type="button" class="budget-clear" data-action="cotaClearFilters">Limpar filtros</button></div>'+
 '<p class="budget-note budget-description-note">Descrições indicativas pela classificação orçamentária. O objeto real deve ser conferido no empenho ou contrato.</p>'+
 '<p class="budget-note" id="cotas-zero-note">'+(state.mostrarZeradas?'Todas as dotações estão visíveis, inclusive as com diferença gerencial de R$ 0,00.':'Exibindo somente dotações com diferença gerencial diferente de R$ 0,00 (inclusive diferenças negativas).')+'</p>'+
 '<div class="table-scroll"><table class="data-table budget-table"><thead><tr><th>Dotação</th><th>Descrição da despesa</th><th>Tipo</th><th>Conta</th><th>Cota líquida BO</th><th>Abatimento V6</th><th>Diferença gerencial</th><th>Detalhes</th></tr></thead>'+
 '<tbody id="cotas-tbody">'+filtered().map(rowHtml).join('')+'</tbody></table></div>'+
 '<div class="budget-footer"><span>Exibindo <b id="cotas-count">'+filtered().length+' de '+rows().length+' dotações</b></span><span>Posição BO '+esc(window.SIG_COTAS_AUD?.getReport()?.position||date(s.referencia_cotas_data))+'</span></div>'+
 '</section>'+dailySection()+(report._dashboard?(window.SIG_COTAS_AUD?.view(allowExport)||''):'')+'</div>';
}

function dailySection(){
 const daily=dailyRows();
 if(!daily.length)return '';
 const dates=state.dailyRefs.map(r=>r.observado_em);
 const textNote='Diárias (elemento 3390.15) são exibidas somente para conferência, fora da tabela e das cotas gerenciais principais. '+
   'Dotações que não constaram do extrato contábil não recebem saldo presumido de R$ 0,00. '+
   'A única referência informada é histórica e poderá divergir da posição contábil atual.';
 const table=daily.map(d=>{
   const ref=dailyRef(d);
   const pos=ref?new Date(ref.observado_em).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',
      day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}):'';
   return '<tr><td class="budget-dot">'+esc(d._code)+'</td>'+
   '<td class="budget-description"><strong>'+esc(d._descTitle)+'</strong><small>'+esc(d._descArea)+'</small></td>'+
   '<td class="budget-account">'+esc(d._account)+'</td>'+
   '<td class="budget-value">'+fmt(d._budget)+'</td>'+
   '<td class="budget-value">'+fmt(d._balance)+'</td>'+
   '<td class="budget-value">'+(ref?'<strong>'+fmt(Number(ref.saldo_informado_centavos))+'</strong>':'<span class="budget-unconfirmed">Não confirmado</span>')+'</td>'+
   '<td>'+ (ref?'<strong>Informado no Portal Contábil</strong><span class="budget-daily-date">'+esc(pos)+'</span>':
   '<span class="budget-unconfirmed">Não exibido no extrato recebido. Excluído da soma.</span>')+'</td>'+
   '<td><button type="button" class="budget-link" data-action="cotaDiariaDetail" data-dot="'+
      esc(encodeURIComponent(String(d.dotacao)))+'">Ver origem →</button></td></tr>';
 }).join('');
 return '<section class="card budget-panel budget-diarias"><div class="budget-panel-head">'+
  '<div><h2>Diárias · conferência separada</h2>'+
  '<p>Elemento 3390.15 · fora da lista de cotas gerenciais para compras e serviços</p></div></div>'+
  '<p class="budget-note">'+esc(textNote)+'</p>'+
  '<div class="table-scroll"><table class="data-table budget-table"><thead><tr>'+
  '<th>Dotação</th><th>Descrição da despesa</th><th>Conta</th><th>Cota BO histórica</th><th>Diferença V6 bruta</th>'+
  '<th>Saldo de referência</th><th>Conferência contábil</th><th></th></tr></thead>'+
  '<tbody>'+table+'</tbody></table></div>'+
  '<p class="budget-note">Referência conhecida de diárias incluída SOMENTE no indicador “Referência para conferência”: '+
  '<strong>'+fmt(overview().dayKnown)+'</strong>. O abatimento das diárias segue pendente de metodologia e não foi lançado como empenho.</p>'+
  '</section>';
}
function diariaDetail(key){
 const d=dailyRows().find(x=>String(x.dotacao||'')===String(key||''));
 if(!d)return '<p>Dotação de diárias não encontrada na posição da fonte.</p>';
 const ref=dailyRef(d),fields=[
 ['Dotação original',d.dotacao],['Descrição da despesa',d._descTitle],
 ['Área funcional',d._descArea],['Conta de controle',d._account],
 ['Cota BO original',fmt(d._budget)],['Abatimento V6 original',fmt(d._spent)],
 ['Diferença V6 bruta',fmt(d._balance)],
 ['Referência temporária para o SIG',ref?fmt(Number(ref.saldo_informado_centavos)):'Não confirmada']
 ];
 return '<div class="budget-detail-grid">'+fields.map(([key,val])=>'<div><span>'+esc(key)+'</span><strong>'+esc(val)+'</strong></div>').join('')+'</div>'+
 '<p class="budget-note">'+(ref?'<strong>Fonte: </strong>'+esc(ref.origem)+
 '. <strong>Data: </strong>'+esc(new Date(ref.observado_em).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}))+
 '. '+esc(ref.justificativa):
 'Esta dotação não foi identificada no extrato contábil enviado. Não foi considerado saldo zero nem confirmada disponibilidade financeira.')+
 '</p><p class="budget-note">Dados originais da V6 foram preservados e não houve abatimento fictício.</p>';
}
function filter(name,value){
 if(name==='q')state.q=String(value||'').slice(0,100);
 if(name==='tipo')state.tipo=String(value);
 if(name==='conta')state.conta=String(value);
 refresh();
}
function resetFilters(){state.q='';state.tipo='TODOS';state.conta='TODAS';state.mostrarZeradas=false;}
function clear(){resetFilters();for(const [id,v] of [['cotas-busca',''],['cotas-tipo','TODOS'],['cotas-conta','TODAS']]){const el=document.getElementById(id);if(el)el.value=v}refresh();}
function toggleZeradas(){state.mostrarZeradas=!state.mostrarZeradas;refresh();}
function detail(key){
 const report=data(),d=rows().find(x=>String(x.dotacao||'')===String(key||''));
 if(!report||!d)return '<p>Dotação não encontrada neste relatório.</p>';
 return '<div class="budget-detail-grid"><div><span>Dotação normalizada</span><strong>'+esc(d._code)+'</strong></div>'+
 '<div><span>Descrição da despesa</span><strong>'+esc(d._descTitle)+'</strong></div>'+
 '<div><span>Área funcional</span><strong>'+esc(d._descArea)+'</strong></div>'+
 '<div><span>Tipo</span><strong>'+esc(d._type)+'</strong></div>'+
 '<div><span>Conta de controle</span><strong>'+esc(d._account)+'</strong></div>'+
 '<div><span>Documentos de repasse relacionados</span><strong>'+num(d.documentos)+'</strong></div>'+
 '<div><span>Cota líquida BO</span><strong>'+fmt(d._budget)+'</strong></div>'+
 '<div><span>Abatimento gerencial V6</span><strong>'+fmt(d._spent)+'</strong></div>'+
 '<div><span>Diferença gerencial não oficial</span><strong>'+fmt(d._balance)+'</strong></div>'+
 '<div class="budget-detail-original"><span>Registro(s) original(is) da cota</span><small>'+esc((d.origens_bo||[]).join(' | ')||'Não informado')+'</small></div></div>'+
 '<p class="budget-note">'+(report._dashboard?'Consolidação gerencial V6 aplicada sobre o DASHBOARD da PLANILHA ATUAL;':'Valores gerenciais calculados com base na posição importada;')+' consulte a posição oficial atual antes de decidir sobre empenhos.</p>'+
 (report._dashboard?(window.SIG_COTAS_AUD?.dotDetail(key)||''):'');
}
function exportCSV(){
 if(!data())return false;
 const columns=['Dotação','Descrição da despesa','Área funcional','Tipo','Conta','Cota líquida BO (R$)','Abatimento gerencial V6 (R$)','Diferença gerencial NÃO OFICIAL (R$)'];
 const quote=t=>'"'+String(t??'').replace(/"/g,'""')+'"';
 const lines=filtered().map(d=>[d._code,d._descTitle,d._descArea,d._type,d._account,(d._budget/100).toFixed(2).replace('.',','),(d._spent/100).toFixed(2).replace('.',','),(d._balance/100).toFixed(2).replace('.',',')].map(quote).join(';'));
 const body='\uFEFF'+[columns.map(quote).join(';'),...lines].join('\r\n');
 const blob=new Blob([body],{type:'text/csv;charset=utf-8'});
 const url=URL.createObjectURL(blob);
 const a=document.createElement('a');a.href=url;a.download='SIG_CSA_TIC_Cotas_Orcamentarias.csv';
 document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
 return true;
}
window.SIG_COTAS=Object.freeze({view,filter,clear,resetFilters,toggleZeradas,detail,diariaDetail,exportCSV,load,resetCloud,isLoaded,getCount:()=>rows().length,getOverview:overview,getDescription:key=>{const d=allRows().find(x=>x.dotacao===key||x._code===key);return d?{titulo:d._descTitle,area:d._descArea}:null;}});
})();