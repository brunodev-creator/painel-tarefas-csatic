/* Consulta contabil-gerencial V6. Nunca grava dados, credenciais ou valores contabeis informados. */
(()=>{'use strict';
const ORIGEM='1dxzDySXU1h5BKJkW1_mHpNX9KRwgX6Ol5b_kRqeRrJA';
const TYPES=['SIG_V6_RESUMO','SIG_V6_DOTACOES','SIG_V6_ABATIMENTOS','SIG_V6_ALERTAS','SIG_V6_CORRECOES_APROVADAS','SIG_V6_ALOCACOES_APROVADAS'];
const state={report:null,phase:'idle',error:'',search:'',status:'TODOS',comparisonDot:''};
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const integer=x=>Number.isFinite(Number(x))?Number(x):0;
const fmt=c=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(integer(c)/100);
const normalize=x=>{
 const s=String(x||'').trim().toUpperCase(),p=s.split('.');
 const sizes=[4,2,3,3,4,4,4,4,2,1,1];
 let a;
 if(p.length===11&&p.every((v,i)=>(/^\d+$/.test(v)&&v.length===sizes[i])||(i===7&&/^\d{2}XX$/.test(v))))a=p.slice();
 else {const digits=s.replace(/\D/g,'');if(digits.length!==32)return '';a=[];let at=0;for(const n of sizes){a.push(digits.slice(at,at+n));at+=n;}}
 if(/^00\d{2}$/.test(a[7]))a[7]=a[7].slice(2)+'00';
 else if(/^\d{2}XX$/.test(a[7]))a[7]=a[7].slice(0,2)+'00';
 return a.join('');
};
const rowMap=(snapshot,required)=>{
 if(!snapshot||snapshot.origem_id!==ORIGEM||!Array.isArray(snapshot.cabecalhos)||!Array.isArray(snapshot.linhas)||snapshot.linhas.length!==Number(snapshot.quantidade))throw Error('Snapshot de conciliação ausente ou incompleto: '+(snapshot?.aba||'?'));
 const h=Object.fromEntries(snapshot.cabecalhos.map((k,i)=>[k,i]));
 for(const key of required){if(h[key]===undefined)throw Error('Cabeçalho ausente em '+snapshot.aba+': '+key);}
 return snapshot.linhas.map(row=>Object.fromEntries(snapshot.cabecalhos.map((k,i)=>[k,row[i]??''])));
};
function money(v){
 const t=String(v??'').trim().replace(/^R\$\s*/,'');
 if(!/^-?(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{1,2})?$/.test(t))throw Error('Valor BRL incorreto: '+t.slice(0,22));
 const n=Math.round(Number(t.replace(/\./g,'').replace(',','.'))*100);
 if(!Number.isSafeInteger(n))throw Error('Valor monetário fora do intervalo.');
 return n;
}
function assemble(snaps,base){
 if(!base?._dashboard)throw Error('DASHBOARD protegido obrigatório.');
 const by=Object.fromEntries(snaps.map(s=>[s.aba,s]));
 if(TYPES.some(k=>!by[k]))throw Error('Relatórios V6 não foram importados integralmente. Atualize a fonte com o exportador V3.');
 const sourceTime=Date.parse(base.gerado_em||'');
 for(const snap of snaps){
   const st=Date.parse(snap.gerado_em||'');
   if(!Number.isFinite(st)||!Number.isFinite(sourceTime)||Math.abs(st-sourceTime)>1000)throw Error('Posições do DASHBOARD e da V6 são diferentes. Importe um único snapshot V3.');
 }
 const resumoRows=rowMap(by.SIG_V6_RESUMO,['Indicador','Valor']);
 const m=Object.fromEntries(resumoRows.map(r=>[r.Indicador,r.Valor]));
 const emps=rowMap(by.SIG_V6_ABATIMENTOS,['Chave empenho','Processo','Dotação original','Dotação utilizada para abate','Valor líquido empenhado (R$)','Resultado'])
   .map(r=>({id:String(r['Chave empenho']),processo:String(r.Processo),source:String(r['Dotação fonte texto']||r['Dotação original']),
     destino:normalize(r['Dotação utilizada para abate']),valor:money(r['Valor líquido empenhado (R$)']),status:String(r.Resultado),
     observacao:String(r['Observação']||''),normalizacao:String(r['Normalização histórica']||'')}));
 const dots=rowMap(by.SIG_V6_DOTACOES,['Dotação','Cota líquida (R$)','Documentos','Abatido gerencial (R$)','Diferença gerencial NÃO OFICIAL (R$)'])
  .filter(r=>Number(r.Documentos)>0).map(r=>({key:normalize(r['Dotação']),cota:money(r['Cota líquida (R$)']),
    abatimento:money(r['Abatido gerencial (R$)']),diferenca:money(r['Diferença gerencial NÃO OFICIAL (R$)']),
    documentos:Number(r.Documentos),conta:String(r.Conta||'')}));
 const alerts=rowMap(by.SIG_V6_ALERTAS,['Gravidade','Código','Descrição']);
 const corrections=rowMap(by.SIG_V6_CORRECOES_APROVADAS,['Chave_Empenho','Status']);
 const decisions=rowMap(by.SIG_V6_ALOCACOES_APROVADAS,['Chave_Empenho','Dotacao_Selecionada','Status']);
 const spent=emps.filter(r=>r.status==='ABATIDO_GLOBAL'||r.status==='ABATIDO_ESPECIFICA');
 const counts={global:spent.filter(r=>r.status==='ABATIDO_GLOBAL').length,specific:spent.filter(r=>r.status==='ABATIDO_ESPECIFICA').length,
 tdco:emps.filter(r=>r.status==='TDCO_FORA_ESCOPO').length,zero:emps.filter(r=>r.status==='SEM_VALOR_LIQUIDO').length,excluded:emps.length-spent.length};
 const expect=(cond,msg)=>{if(!cond)throw Error('Conciliação V6 divergente: '+msg);};
 expect(new Set(emps.map(e=>e.id)).size===emps.length,'empenhos duplicados');
 expect(emps.length===Number(m['Empenhos no índice'])&&spent.length===Number(m['Empenhos atribuídos segundo regra V6']),'contagem de empenhos');
 expect(counts.global===Number(m['Empenhos na global'])&&counts.specific===Number(m['Empenhos na específica']),'abatimentos global/específica');
 expect(counts.tdco===Number(m['Empenhos TDCO excluídos'])&&alerts.length===Number(m.Alertas),'TDCO/alertas');
 expect(corrections.filter(r=>r.Status==='APROVADO').length===Number(m['Correções históricas validadas']),'correções históricas');
 expect(spent.every(x=>x.destino&&dots.some(d=>d.key===x.destino)),'empenho com dotação de destino inexistente');
 expect(emps.filter(x=>!spent.includes(x)).every(x=>!x.destino),'empenho excluído com destino');
 const actual=base.resumo,totC=dots.reduce((n,x)=>n+x.cota,0),totE=dots.reduce((n,x)=>n+x.abatimento,0),
   unique=new Set(dots.map(x=>x.key));
 expect(dots.length===base.dotacoes.length&&unique.size===dots.length,'dotações');
 expect(totC===actual.cota_liquida_centavos&&totE===actual.valor_abatido_gerencial_centavos,'totais do painel');
 expect(money(m['Cota líquida (R$)'])===totC&&money(m['Abatimento gerencial (R$)'])===totE,'resumo financeiro');
 for(const d of dots){
   const target=base.dotacoes.find(x=>normalize(x.dotacao)===d.key);
   expect(!!target&&target.cotas_centavos===d.cota&&target.abatido_sig_centavos===d.abatimento,'dotação '+d.key);
   const sum=spent.filter(x=>x.destino===d.key).reduce((n,x)=>n+x.valor,0);
   expect(sum===d.abatimento,'empenhos da dotação '+d.key);
 }
 for(const dec of decisions.filter(x=>x.Status==='APROVADO')){
   expect(spent.some(x=>x.id===dec.Chave_Empenho&&x.destino===normalize(dec.Dotacao_Selecionada)),'alocação manual '+dec.Chave_Empenho);
 }
 const dateMatch=String(m['Data da análise']||'').match(/\d{4}-\d{2}-\d{2}/);
 return {emps,dots,alerts,corrections,decisions,counts,position:dateMatch?dateMatch[0]:'',resumo:m,
    total:{cota:totC,abatido:totE,diferenca:totC-totE},generated:base.gerado_em};
}
async function load(rest,base){
 const uri='/rest/v1/sig_planilha_snapshots?aba=in.('+TYPES.join(',')+')&select=aba,origem_id,cabecalhos,linhas,quantidade,gerado_em,importado_em';
 const r=await rest(uri);
 state.report=assemble(r||[],base);state.phase='ready';state.error='';
 return true;
}
function reset(){state.report=null;state.phase='idle';state.error='';state.search='';state.status='TODOS';state.comparisonDot='';}
function getReport(){return state.report;}
const statusLabel={ABATIDO_ESPECIFICA:'Abatido · específica',ABATIDO_GLOBAL:'Abatido · global',
 TDCO_FORA_ESCOPO:'TDCO excluído',OUTRA_UNIDADE_FORA_ESCOPO:'Outra UE',SEM_VALOR_LIQUIDO:'Líquido zerado',
 AMBIGUA_SEM_ABATE:'Ambíguo',SEM_COTA:'Sem cota',CODIGO_INCOMPLETO:'Código incompleto',VALOR_NEGATIVO_CONFERIR:'Valor a conferir'};
function filtered(){
 if(!state.report)return [];
 const q=state.search.toUpperCase().trim().replace(/\s/g,'');
 return state.report.emps.filter(e=>{
  const matched=state.status==='TODOS'||(state.status==='ABATIDOS'&&e.destino)||(state.status==='EXCLUIDOS'&&!e.destino)||e.status===state.status;
  return matched&&(!q||[e.id,e.processo,e.source,e.destino,e.status].some(v=>String(v).toUpperCase().replace(/\s/g,'').includes(q)));
 });
}
const tr=e=>'<tr><td><strong>'+esc(e.id.replaceAll('|',' / '))+'</strong><div class="cell-sub">'+esc(e.processo)+'</div></td>'+
 '<td class="budget-dot">'+esc(e.source)+'</td><td class="budget-dot">'+esc(e.destino||'—')+'</td>'+
 '<td class="budget-value">'+fmt(e.valor)+'</td><td>'+esc(statusLabel[e.status]||e.status)+'</td>'+
 '<td><button type="button" class="budget-link" data-action="cotaEmpDetail" data-id="'+esc(e.id)+'">Conferir →</button></td></tr>';
function refresh(){
 const tbody=document.getElementById('cota-audit-body');if(!tbody)return;
 const list=filtered();tbody.innerHTML=list.map(tr).join('')||'<tr><td colspan="6">Nenhum empenho corresponde ao filtro.</td></tr>';
 const counter=document.getElementById('cota-audit-count');if(counter)counter.textContent=list.length+' de '+state.report.emps.length+' empenhos';
}
function filter(field,value){
 if(field==='search')state.search=String(value||'').slice(0,120);
 if(field==='status')state.status=String(value||'TODOS');
 refresh();
}
function view(canExport=false){
 const r=state.report;if(!r)return '';
 const counts=r.counts;
 const opts=[['TODOS','Todos'],['ABATIDOS','Abatidos'],['EXCLUIDOS','Não abatidos'],
 ['ABATIDO_GLOBAL','Abatidos · global'],['ABATIDO_ESPECIFICA','Abatidos · específica'],
 ['TDCO_FORA_ESCOPO','TDCO excluídos'],['SEM_VALOR_LIQUIDO','Líquido zerado']]
 .map(([value,label])=>'<option value="'+esc(value)+'"'+(value===state.status?' selected':'')+'>'+esc(label)+'</option>').join('');
 const excluded=r.emps.filter(x=>!x.destino);
 const info='<div class="budget-audit-summary"><span><b>'+r.emps.length+'</b> empenhos analisados</span><span><b>'+ (r.emps.length-counts.excluded) +'</b> abatidos</span><span><b>'+counts.excluded+'</b> não abatidos</span><span><b>'+counts.global+'</b> globais</span><span><b>'+counts.specific+'</b> específicos</span>'+
 '<span><b>'+counts.tdco+'</b> TDCO</span><span><b>'+counts.zero+'</b> zerados</span><span><b>'+r.alerts.length+'</b> alertas</span></div>';
 const notes='<p class="budget-note">Posição da fonte BO: <strong>'+esc(r.position||'não informada')+'</strong>. Importado no SIG: '+
 esc(new Date(r.generated).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}))+'. Regras V6 e '+r.corrections.length+
 ' correções históricas registradas; '+r.decisions.length+' alocação(ões) manual(is). Consulta gerencial para comparação com o sistema contábil: valores não comprovam disponibilidade oficial.</p>';
 const risk='<div class="budget-alert"><strong>Conferência contábil:</strong> há '+r.alerts.length+
 ' alerta(s) de documentos e conciliação a revisar. O total de empenhos líquidos do índice pode ser maior que o abatimento gerencial porque TDCO e empenhos zerados não são lançados nas cotas da UE 1250070. Nenhuma informação foi importada diretamente do outro sistema contábil.</div>';
 const alertDetails='<details class="budget-audit-details"><summary>Ver alertas ('+r.alerts.length+')</summary><div class="table-scroll"><table class="data-table"><thead><tr><th>Gravidade</th><th>Código</th><th>Descrição</th></tr></thead><tbody>'+
 r.alerts.map(a=>'<tr><td>'+esc(a.Gravidade)+'</td><td>'+esc(a.Código)+'</td><td>'+esc(a.Descrição)+'</td></tr>').join('')+'</tbody></table></div></details>';
 const decisions=r.decisions.filter(d=>d.Status==='APROVADO');
 const ledger=decisions.length?'<details class="budget-audit-details"><summary>Ver decisões manuais aprovadas ('+decisions.length+')</summary>'+
 decisions.map(d=>'<p><strong>'+esc(d.Chave_Empenho)+'</strong> · '+esc(d.Dotacao_Selecionada)+'<br>'+esc(d.Justificativa_Aprovacao||'')+'</p>').join('')+'</details>':'';
 return '<section class="card budget-panel budget-audit"><div class="budget-panel-head"><div><h2>Conciliação por empenho · V6</h2><p>Rastreabilidade dos abatimentos, decisões e exclusões</p></div>'+
 (canExport?'<button type="button" class="btn budget-export" data-action="cotaAuditExport">↓ Exportar empenhos</button>':'')+'</div>'+
 info+notes+risk+'<div class="budget-toolbar"><label class="budget-search">⌕ <input id="cota-audit-search" type="search" placeholder="Empenho, processo ou dotação" value="'+esc(state.search)+'"></label>'+
 '<label class="budget-filter">Resultado<select id="cota-audit-status">'+opts+'</select></label></div>'+
 '<div class="table-scroll"><table class="data-table budget-table"><thead><tr><th>Empenho / processo</th><th>Dotação de origem</th><th>Dotação de abatimento</th><th>Valor líquido</th><th>Resultado</th><th></th></tr></thead>'+
 '<tbody id="cota-audit-body">'+filtered().map(tr).join('')+'</tbody></table></div>'+
 '<div class="budget-footer"><span id="cota-audit-count">'+filtered().length+' de '+r.emps.length+' empenhos</span><span>'+excluded.length+' não abatidos por regra</span></div>'+
 alertDetails+ledger+'</section>';
}
function detail(id){
 const e=state.report?.emps.find(x=>x.id===id);
 if(!e)return '<p>Empenho não encontrado no snapshot V6.</p>';
 const decision=state.report.decisions.find(d=>d.Chave_Empenho===id&&d.Status==='APROVADO');
 const entries=[['Empenho',e.id],['Processo',e.processo],['Dotação original',e.source],['Dotação utilizada para abate',e.destino||'Não houve abatimento'],
 ['Valor líquido',fmt(e.valor)],['Resultado',statusLabel[e.status]||e.status],['Correção histórica',e.normalizacao||'Não aplicada'],['Justificativa',e.observacao||'—']];
 return '<div class="budget-detail-grid">'+entries.map(([k,v])=>'<div><span>'+esc(k)+'</span><strong>'+esc(v)+'</strong></div>').join('')+'</div>'+
 (decision?'<p class="budget-note"><strong>Decisão aprovada:</strong> '+esc(decision.Justificativa_Aprovacao||'')+'</p>':'')+
 '<p class="budget-note">Posição de '+esc(state.report.position)+'. Não representa liquidação, pagamento ou saldo oficial SIAFI-MG.</p>';
}
function dotDetail(dot,gerencial){
 const r=state.report;if(!r)return '';
 const key=normalize(dot);
 const budget=r.dots.find(d=>d.key===key);
 if(!budget)return '<p class="budget-note">Dotação não incluída no detalhe V6.</p>';
 const applied=r.emps.filter(e=>e.destino===key);
 const declared=applied.reduce((n,e)=>n+e.valor,0);
 const total=applied.length?'Empenhos que abateram esta cota ('+applied.length+')':'Nenhum empenho abatido nesta dotação.';
 state.comparisonDot=key;
 return '<div class="budget-audit-linked"><h3>'+total+'</h3>'+
 (applied.length?'<div class="table-scroll"><table class="data-table"><thead><tr><th>Empenho</th><th>Processo</th><th>Valor abatido</th><th>Regra</th></tr></thead><tbody>'+
 applied.map(e=>'<tr><td>'+esc(e.id)+'</td><td>'+esc(e.processo)+'</td><td>'+fmt(e.valor)+'</td><td>'+esc(statusLabel[e.status]||e.status)+'</td></tr>').join('')+'</tbody></table></div>':'')+
 '<p class="budget-note">Soma dos empenhos atribuídos: '+fmt(declared)+' · conta '+esc(budget.conta)+
 '. Conferência aritmética: '+fmt(budget.cota)+' − '+fmt(budget.abatimento)+' = '+fmt(budget.diferenca)+'.</p>'+
 '<div class="budget-accounting-compare"><label for="cota-accounting-input"><strong>Comparar com o outro sistema contábil (R$)</strong></label>'+
 '<input id="cota-accounting-input" type="number" step="0.01" inputmode="decimal" placeholder="Informe o valor contábil; não será salvo">'+
 '<p id="cota-accounting-result" class="budget-note">Insira o valor contábil para calcular a diferença em relação ao valor gerencial do SIG.</p></div>'+
 '</div>';
}
function compare(value){
 const el=document.getElementById('cota-accounting-result');if(!el||!state.report)return;
 const dot=state.report.dots.find(d=>d.key===state.comparisonDot);if(!dot)return;
 if(!String(value).trim()){el.textContent='O valor de comparação não será gravado.';return;}
 const n=Number(String(value).replace(',','.'));
 if(!Number.isFinite(n)||!Number.isSafeInteger(Math.round(n*100))){el.textContent='Informe um valor contábil válido.';return;}
 const diff=Math.round(n*100)-dot.diferenca;
 el.textContent='Valor contábil informado: '+fmt(Math.round(n*100))+' · diferença (contábil − SIG): '+fmt(diff)+'. Apenas nesta janela; valor não salvo.';
}
function exportCSV(){
 if(!state.report)return false;
 const columns=['Chave empenho','Processo','Dotação original','Dotação usada no abatimento','Valor líquido (R$)','Resultado','Correção histórica','Observação'];
 const quote=t=>'"'+String(t??'').replace(/"/g,'""').replace(/^([=+@-])/,"'$1")+'"';
 const lines=filtered().map(e=>[e.id,e.processo,e.source,e.destino,(e.valor/100).toFixed(2).replace('.',','),e.status,e.normalizacao,e.observacao].map(quote).join(';'));
 const blob=new Blob(['\uFEFF'+[columns.map(quote).join(';'),...lines].join('\r\n')],{type:'text/csv;charset=utf-8'});
 const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='SIG_V6_Conferencia_Empenhos.csv';
 document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);return true;
}
window.SIG_COTAS_AUD=Object.freeze({load,reset,getReport,view,filter,detail,dotDetail,compare,exportCSV});
})();