/* Tela institucional de cotas. Consome SOMENTE o relatório V6 já carregado em memória.
 * Não utiliza fetch, localStorage ou serviços externos.
 */
(() => {
'use strict';
const state={q:'',tipo:'TODOS',conta:'TODAS'};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const num=v=>Number.isFinite(Number(v))?Number(v):0;
const fmt=cents=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(num(cents)/100);
const data=()=>window.SIG_V6?.getData?.()||null;
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
function rows(){
 const r=data();if(!r||!Array.isArray(r.dotacoes))return [];
 return r.dotacoes.filter(d=>Number(d.documentos||0)>0).map(d=>{
   const p=dotString(d).split('.'),item=p[7]||'',global=d.tipo_dotacao==='GLOBAL'||item.endsWith('XX');
   const budget=num(d.cotas_centavos),spent=num(d.abatido_sig_centavos);
   return {...d,_code:dotString(d),_global:global,_type:global?'Global':'Item definido',
    _account:d.conta_controle||(global?'998020301':'998020302'),_budget:budget,_spent:spent,_balance:budget-spent,
    _group:p.slice(0,7).join('.')+'.'+item.slice(0,2)};
 }).sort((a,b)=>a._group.localeCompare(b._group,'pt-BR',{numeric:true})||
  Number(a._global)-Number(b._global)||a._code.localeCompare(b._code,'pt-BR',{numeric:true}));
}
function filtered(){
 const q=state.q.toUpperCase().trim().replace(/\s/g,''),normalized=q.replace(/(\d{2})XX/g,'$100');
 return rows().filter(d=>(state.tipo==='TODOS'||d._type===state.tipo)&&
 (state.conta==='TODAS'||d._account===state.conta)&&
 (!q||[d._code,d.dotacao,...(d.origens_bo||[]),d._account].some(v=>{
 const t=String(v||'').toUpperCase().replace(/\s/g,'');
 return t.includes(q)||t.replace(/(\d{2})XX/g,'$100').replace(/\D/g,'').includes(normalized.replace(/\D/g,''));
 })));
}
function rowHtml(d){
 const encoded=encodeURIComponent(String(d.dotacao||''));
 return '<tr><td class="budget-dot">'+esc(d._code)+'</td>'+
 '<td><span class="budget-tag '+(d._global?'global':'specific')+'">'+esc(d._type)+'</span></td>'+
 '<td class="budget-account">'+esc(d._account)+'</td>'+
 '<td class="budget-value">'+fmt(d._budget)+'</td>'+
 '<td class="budget-value">'+fmt(d._spent)+'</td>'+
 '<td class="budget-value'+(d._balance<0?' budget-negative':'')+'">'+fmt(d._balance)+'</td>'+
 '<td class="budget-detail"><button type="button" class="budget-link" data-action="cotaDetail" data-dot="'+esc(encoded)+'">Ver detalhes <span aria-hidden="true">→</span></button></td></tr>';
}
function refresh(){
 const body=document.getElementById('cotas-tbody');if(!body)return;
 const list=filtered();body.innerHTML=list.length?list.map(rowHtml).join(''):'<tr><td colspan="7" class="budget-empty">Nenhuma dotação encontrada com esses filtros.</td></tr>';
 const count=document.getElementById('cotas-count');if(count)count.textContent=list.length+' de '+rows().length+' dotações';
}
const date=iso=>/^\d{4}-\d{2}-\d{2}$/.test(iso||'')?iso.slice(8,10)+'/'+iso.slice(5,7)+'/'+iso.slice(0,4):'não informada';
function view(authorized){
 if(!authorized)return '<div class="card section"><h2>Acesso restrito</h2><p class="sub">Cotas orçamentárias disponíveis somente para SOFI, chefia e administração.</p></div>';
 const report=data();
 if(!report)return '<div class="budget-page"><div class="budget-breadcrumb">Início <span>›</span> Cota orçamentária <span>›</span> Saldos por dotação</div>'+
 '<div class="card budget-empty-state"><h1>Saldos por dotação</h1><p>Para visualizar dados reais, importe um relatório V6 no módulo de conciliação.</p>'+
 '<button type="button" class="btn primary" data-view="conciliacao">Abrir Conciliação V6</button><p class="budget-note">Não são exibidos dados fictícios sem um relatório válido.</p></div></div>';
 const s=report.resumo||{},budget=num(s.cota_liquida_centavos),spent=num(s.valor_abatido_gerencial_centavos),balance=budget-spent;
 const warning='<div class="budget-alert"><span class="budget-alert-icon" aria-hidden="true">i</span><div><strong>Posição histórica</strong> · Última importação de cotas: '+esc(date(s.referencia_cotas_data))+'. Consulte a posição atual do SIAFI-MG antes de decidir operacionalmente.</div></div>';
 const kpi=(type,ico,val)=>'<div class="card budget-card"><div class="budget-icon">'+ico+'</div><div><div class="budget-label">'+type+'</div><strong>'+fmt(val)+'</strong></div></div>';
 const icon1='<svg viewBox="0 0 24 24" width="25" height="25" fill="none" stroke="currentColor" stroke-width="1.8"><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v7c0 4 16 4 16 0V5M4 12v6c0 4 16 4 16 0v-6"/></svg>';
 const icon2='<svg viewBox="0 0 24 24" width="25" height="25" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h6"/></svg>';
 const icon3='<svg viewBox="0 0 24 24" width="25" height="25" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 19V12h3v7M11 19V7h3v12M17 19V3h3v16"/></svg>';
 const options=(val,opts)=>opts.map(([v,t])=>'<option value="'+esc(v)+'"'+(v===val?' selected':'')+'>'+esc(t)+'</option>').join('');
 return '<div class="budget-page">'+
 '<div class="budget-breadcrumb">Início <span>›</span> Cota orçamentária <span>›</span> <b>Saldos por dotação</b></div>'+
 warning+
 '<div class="budget-hero">'+kpi('Orçamentário',icon1,budget)+kpi('Valor empenhado',icon2,spent)+kpi('Saldo atual',icon3,balance)+'</div>'+
 '<section class="card budget-panel"><div class="budget-panel-head"><div><h1>Saldos por dotação</h1><p>Visão consolidada por classificação orçamentária</p></div>'+
 '<button type="button" class="btn budget-export" data-action="cotaExport">↓ &nbsp; Exportar</button></div>'+
 '<div class="budget-toolbar">'+
 '<label class="budget-search"><span aria-hidden="true">⌕</span><input type="search" id="cotas-busca" placeholder="Buscar dotação, conta ou descrição..." value="'+esc(state.q)+'" aria-label="Buscar dotação ou conta"></label>'+
 '<label class="budget-filter">Tipo<select id="cotas-tipo">'+options(state.tipo,[['TODOS','Todos'],['Global','Global'],['Item definido','Item definido']])+'</select></label>'+
 '<label class="budget-filter">Conta<select id="cotas-conta">'+options(state.conta,[['TODAS','Todas'],['998020301','998020301'],['998020302','998020302']])+'</select></label>'+
 '<button type="button" class="budget-clear" data-action="cotaClearFilters">Limpar filtros</button></div>'+
 '<div class="table-scroll"><table class="data-table budget-table"><thead><tr><th>Dotação</th><th>Tipo</th><th>Conta</th><th>Orçamentário</th><th>Valor empenhado</th><th>Saldo atual</th><th>Detalhes</th></tr></thead>'+
 '<tbody id="cotas-tbody">'+filtered().map(rowHtml).join('')+'</tbody></table></div>'+
 '<div class="budget-footer"><span>Exibindo <b id="cotas-count">'+filtered().length+' de '+rows().length+' dotações</b></span><span>Posição '+esc(date(s.referencia_cotas_data))+'</span></div>'+
 '</section></div>';
}
function filter(name,value){
 if(name==='q')state.q=String(value||'').slice(0,100);
 if(name==='tipo')state.tipo=String(value);
 if(name==='conta')state.conta=String(value);
 refresh();
}
function clear(){state.q='';state.tipo='TODOS';state.conta='TODAS';for(const [id,v] of [['cotas-busca',''],['cotas-tipo','TODOS'],['cotas-conta','TODAS']]){const el=document.getElementById(id);if(el)el.value=v}refresh();}
function detail(key){
 const report=data(),d=rows().find(x=>String(x.dotacao||'')===String(key||''));
 if(!report||!d)return '<p>Dotação não encontrada neste relatório.</p>';
 return '<div class="budget-detail-grid"><div><span>Dotação normalizada</span><strong>'+esc(d._code)+'</strong></div>'+
 '<div><span>Tipo</span><strong>'+esc(d._type)+'</strong></div>'+
 '<div><span>Conta de controle</span><strong>'+esc(d._account)+'</strong></div>'+
 '<div><span>Documentos de repasse relacionados</span><strong>'+num(d.documentos)+'</strong></div>'+
 '<div><span>Orçamentário</span><strong>'+fmt(d._budget)+'</strong></div>'+
 '<div><span>Valor empenhado</span><strong>'+fmt(d._spent)+'</strong></div>'+
 '<div><span>Saldo atual (posição histórica)</span><strong>'+fmt(d._balance)+'</strong></div>'+
 '<div class="budget-detail-original"><span>Registro(s) original(is) da cota</span><small>'+esc((d.origens_bo||[]).join(' | ')||'Não informado')+'</small></div></div>'+
 '<p class="budget-note">Valores gerenciais calculados com base na posição importada. Consulte a posição oficial atual antes de decidir sobre empenhos.</p>';
}
function exportCSV(){
 if(!data())return false;
 const columns=['Dotação','Tipo','Conta','Orçamentário (R$)','Valor empenhado (R$)','Saldo atual (R$)'];
 const quote=t=>'"'+String(t??'').replace(/"/g,'""')+'"';
 const lines=filtered().map(d=>[d._code,d._type,d._account,(d._budget/100).toFixed(2).replace('.',','),(d._spent/100).toFixed(2).replace('.',','),(d._balance/100).toFixed(2).replace('.',',')].map(quote).join(';'));
 const body='\uFEFF'+[columns.map(quote).join(';'),...lines].join('\r\n');
 const blob=new Blob([body],{type:'text/csv;charset=utf-8'});
 const url=URL.createObjectURL(blob);
 const a=document.createElement('a');a.href=url;a.download='SIG_CSA_TIC_Cotas_Orcamentarias.csv';
 document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
 return true;
}
window.SIG_COTAS=Object.freeze({view,filter,clear,detail,exportCSV,getCount:()=>rows().length});
})();