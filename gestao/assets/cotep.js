/* SIG CSA-TIC — Intenções e reservas de COTEP. Valores gerenciais, nunca saldo legal certificado. */
(()=>{
'use strict';
const url='/rest/v1/';
const state={loaded:false,loading:false,error:'',identity:null,intencoes:[],procedimentos:[],bases:[],gestores:[],eventos:[],search:'',tab:'intencoes'};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=v=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(v)||0);
const shortDate=v=>v?new Date(String(v).slice(0,10)+'T12:00:00').toLocaleDateString('pt-BR'):'—';
const plain=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const desc=v=>String(v||'').trim();
const empty=t=>'<p class="cotep-empty">'+esc(t)+'</p>';
function syncIdentity(id){if(state.identity!==id){state.identity=id;state.loaded=false;state.loading=false;state.error='';state.intencoes=[];state.procedimentos=[];state.bases=[];state.gestores=[];state.eventos=[];}}
async function load(rest,force=false){
 if(!state.identity)return;
 if(state.loading||(state.loaded&&!force))return;
 state.loading=true;state.error='';
 try{
  const tables=['sig_cotep_intencoes','sig_cotep_procedimentos','sig_cotep_bases','sig_cotep_gestores','sig_cotep_eventos'];
  const rows=await Promise.all(tables.map(t=>rest(url+t+'?select=*&limit=1000')));
  [state.intencoes,state.procedimentos,state.bases,state.gestores,state.eventos]=rows.map(x=>Array.isArray(x)?x:[]);
  state.loaded=true;
 }catch(e){state.error=e.message||String(e);state.loaded=false;}finally{state.loading=false;}
}
const isLoaded=()=>state.loaded||!!state.error;
function manager(ctx){return ctx.admin||state.gestores.some(g=>g.auth_id===ctx.authId&&g.ativo);}
function occupied(year,ug,category,branch){
 const p=state.procedimentos.filter(x=>Number(x.ano)===Number(year)&&x.unidade_gestora===ug&&x.categoria===category&&plain(x.ramo_atividade)===plain(branch)&&['Finalizada','Em andamento'].includes(x.situacao)).reduce((s,x)=>s+Number(x.situacao==='Finalizada'?x.valor_homologado:x.valor_estimado||0),0);
 const r=state.intencoes.filter(x=>Number(x.ano)===Number(year)&&x.unidade_gestora===ug&&x.categoria===category&&plain(x.ramo_atividade)===plain(branch)&&x.situacao==='Reservada').reduce((s,x)=>s+Number(x.valor_reservado||0),0);
 return {p,r,total:p+r};
}
function sameElement(code,year){
 const rows=state.procedimentos.filter(x=>x.elemento_item===code&&Number(x.ano)===Number(year));
 const used=rows.filter(x=>x.situacao==='Finalizada').reduce((s,x)=>s+Number(x.valor_homologado||0),0);
 const active=rows.filter(x=>x.situacao==='Em andamento').reduce((s,x)=>s+Number(x.valor_estimado||0),0);
 const reserved=state.intencoes.filter(x=>x.elemento_item===code&&Number(x.ano)===Number(year)&&x.situacao==='Reservada').reduce((s,x)=>s+Number(x.valor_reservado||0),0);
 const unverified=rows.filter(x=>x.situacao==='Realizada (a conferir)').reduce((s,x)=>s+Number(x.valor_estimado||0),0);
 return {used,active,unverified,reserved,pending:state.intencoes.filter(x=>x.elemento_item===code&&Number(x.ano)===Number(year)&&x.situacao==='Pendente').length};
}
function fields(d){
 const i=(name,label,value='',type='text',attr='')=>'<label class="cotep-field"><span>'+esc(label)+'</span><input name="'+name+'" type="'+type+'" value="'+esc(value)+'" '+attr+'></label>';
 const select=(name,label,values,val)=>'<label class="cotep-field"><span>'+esc(label)+'</span><select name="'+name+'">'+values.map(v=>'<option value="'+esc(v)+'"'+(v===val?' selected':'')+'>'+esc(v)+'</option>').join('')+'</select></label>';
 const area=(name,label,value='')=>'<label class="cotep-field cotep-wide"><span>'+esc(label)+'</span><textarea name="'+name+'" rows="2">'+esc(value)+'</textarea></label>';
 return {i,select,area};
}
function contentForm(type,body,hint=''){
 return '<form data-form="'+esc(type)+'" class="cotep-form">'+(hint?'<p class="cotep-hint">'+hint+'</p>':'')+
 '<div class="cotep-fields">'+body+'</div><div class="modal-footer"><button class="btn" type="button" data-action="closeModal">Cancelar</button><button class="btn primary" type="submit">Salvar</button></div></form>';
}
function intentionForm(){
 const f=fields();const year=new Date().getFullYear();
 return contentForm('cotepIntencao',
  f.i('ano','Exercício',year,'number','min="2020" max="2100" required')+
  f.i('unidade_gestora','Unidade gestora (código)','1250071','text','required pattern="[0-9]{5,9}"')+
  f.i('centro','Centro solicitante','','text','required maxlength="120" placeholder="Ex.: Centro de Videomonitoramento"')+
  f.i('elemento_item','Elemento-item (4 dígitos)','','text','required pattern="[0-9]{4}" placeholder="Ex.: 3022"')+
  f.i('valor_estimado','Valor previsto (R$)','','number','min="0.01" step="0.01" required')+
  f.i('necessidade_ate','Necessário até','','date')+
  f.area('objeto','Descrição do objeto')+f.area('justificativa','Justificativa / referência documental'),
  'O registro ficará <strong>pendente</strong> e não reservará saldo. A DTS-1 decidirá após conferir a classificação e a base de contratações.');
}
function procedureForm(existing){
 const f=fields();const x=existing||{};const year=new Date().getFullYear();
 return contentForm('cotepProcedimento',
  f.i('id','Registro',x.id||'','hidden')+
  f.i('ano','Exercício',x.ano||year,'number','min="2020" max="2100" required')+
  f.i('unidade_gestora','Unidade gestora',x.unidade_gestora||'1250071','text','required pattern="[0-9]{5,9}"')+
  f.i('numero','COTEP nº',x.numero||'','text','required placeholder="Ex.: 126/2026"')+
  f.i('elemento_item','Elemento-item (vazio apenas se fracassada)',x.elemento_item||'','text','pattern="[0-9]{4}"')+
  f.i('ramo_atividade','Ramo de atividade (conferido)',x.ramo_atividade||'','text','placeholder="Ex.: suprimentos de impressão"')+
  f.select('categoria','Categoria do limite',['','geral','engenharia'],x.categoria||'')+
  f.select('situacao','Situação',['Em andamento','Realizada (a conferir)','Finalizada','Fracassada','Cancelada'],x.situacao||'Em andamento')+
  f.i('valor_estimado','Valor inicial estimado (R$)',x.valor_estimado??'','number','min="0" step="0.01" required')+
  f.i('valor_homologado','Valor final homologado/negociado (R$)',x.valor_homologado??'','number','min="0" step="0.01"')+
  f.area('objeto','Objeto',x.objeto||'')+
  f.area('documento','Documento ou referência da conferência',x.documento||''),
  'Uma COTEP com dois elementos-itens deve ter dois lançamentos, um por item, sem duplicar o valor do procedimento. Para registros apenas informados como realizados, use «Realizada (a conferir)» sem preencher homologação. Confirme unidade gestora, ramo e valor final antes de mudar para Finalizada.');
}
function baseForm(){
 const f=fields();const year=new Date().getFullYear();
 return contentForm('cotepBase',f.i('ano','Exercício',year,'number','min="2020" max="2100" required')+
 f.i('unidade_gestora','Unidade gestora','1250071','text','pattern="[0-9]{5,9}" required')+
 f.select('categoria','Categoria',['geral','engenharia'],'geral')+
 f.i('teto_referencia','Teto legal aplicável (R$)',year===2026?'65492.11':'','number','min="0.01" step="0.01" required')+
 f.area('documento','Referência de conferência de TODOS os procedimentos da UG no exercício'),
 'Confirme a base somente depois de confrontar o histórico completo, os ramos de atividade e a unidade gestora nos sistemas oficiais. Esta declaração habilita reservas gerenciais; não atesta legalidade.');
}
function decisionForm(row){
 const f=fields();
 return contentForm('cotepDecisao',f.i('id','ID',row.id,'hidden')+
 f.select('situacao','Decisão',['Reservada','Devolvida','Rejeitada','Cancelada','Finalizada'],'Reservada')+
 f.i('ramo_atividade','Ramo de atividade (não é apenas elemento-item)',row.ramo_atividade||'','text')+
 f.select('categoria','Categoria',['geral','engenharia'],row.categoria||'geral')+
 f.i('valor_reservado','Valor a reservar (R$)',row.valor_estimado,'number','step="0.01" min="0.01"')+
 f.i('reserva_ate','Validade da reserva',row.reserva_ate||'','date')+
 f.i('cotep_numero','COTEP finalizada vinculada (se for finalizar)',row.cotep_numero||'','text')+
 f.area('observacao','Justificativa da decisão',row.observacao_gestor||''),
 'Reservas são exclusivas da DTS-1. Informe classificação, valor e validade. Para finalizar, cadastre antes o resultado da COTEP no histórico.');
}
function gestorForm(ctx){
 const f=fields();
 const choices=(ctx.users||[]).filter(x=>x.ativo&&x.auth_id).map(x=>'<option value="'+esc(x.auth_id)+'">'+esc(x.nome+' — '+(x.setor||'')+' / '+x.role)+'</option>').join('');
 return contentForm('cotepGestor','<label class="cotep-field cotep-wide"><span>Usuário autorizado</span><select name="auth_id" required>'+choices+'</select></label>'+
 f.select('ativo','Permissão de gestor DTS-1',['true','false'],'true'),
 'Somente administradores podem atribuir ou revogar a gestão de reservas.');
}
function csv(rows,headers){
 const quote=v=>'"'+String(v??'').replace(/"/g,'""')+'"';
 return [headers.map(quote).join(';'),...rows.map(r=>r.map(quote).join(';'))].join('\r\n');
}
function exportCsv(){
 const rows=state.intencoes.map(x=>[x.ano,x.unidade_gestora,x.centro,x.elemento_item,x.objeto,x.valor_estimado,x.valor_reservado,x.situacao,x.ramo_atividade,x.categoria,x.reserva_ate,x.cotep_numero]);
 const str='\uFEFF'+csv(rows,['Ano','Unidade gestora','Centro','Elemento-item','Objeto','Valor estimado','Reserva','Situação','Ramo','Categoria','Reserva até','COTEP']);
 const file=new Blob([str],{type:'text/csv;charset=utf-8;'});const u=URL.createObjectURL(file);const a=document.createElement('a');a.href=u;a.download='sig_cotep_intencoes.csv';document.body.append(a);a.click();a.remove();URL.revokeObjectURL(u);
}
function view(ctx){
 if(!ctx.online)return '<section class="card section"><h2>Planejamento de COTEPs</h2>'+empty('Entre na sessão institucional para consultar e registrar intenções. Nenhuma informação real é exibida no modo demonstração.')+'</section>';
 if(state.loading&&!state.loaded)return '<section class="card section"><h2>Planejamento de COTEPs</h2><p role="status">Carregando dados protegidos…</p></section>';
 if(state.error)return '<section class="card section"><h2>Planejamento de COTEPs</h2><p class="cotep-danger">'+esc(state.error)+'</p><button class="btn" data-action="cotepRecarregar">Tentar novamente</button></section>';
 if(!state.loaded)return '<section class="card section"><h2>Planejamento de COTEPs</h2><p>Preparando módulo…</p></section>';
 const manage=manager(ctx),year=new Date().getFullYear(),q=plain(state.search);
 const filtered=arr=>arr.filter(x=>!q||plain([x.numero,x.centro,x.elemento_item,x.objeto,x.ano,x.unidade_gestora,x.situacao,x.ramo_atividade].join(' ')).includes(q));
 const intents=filtered(state.intencoes).sort((a,b)=>String(b.criado_em).localeCompare(String(a.criado_em)));
 const procedures=filtered(state.procedimentos).sort((a,b)=>b.ano-a.ano||String(b.numero).localeCompare(String(a.numero),'pt-BR',{numeric:true}));
 const open=state.intencoes.filter(x=>['Pendente','Devolvida'].includes(x.situacao)).length;
 const reserved=state.intencoes.filter(x=>x.situacao==='Reservada').reduce((s,x)=>s+Number(x.valor_reservado||0),0);
 const unverified=state.procedimentos.filter(x=>x.situacao==='Realizada (a conferir)').reduce((s,x)=>s+Number(x.valor_estimado||0),0);
 const finalized=state.procedimentos.filter(x=>x.situacao==='Finalizada').reduce((s,x)=>s+Number(x.valor_homologado||0),0);
 const codes=[...new Set([...state.procedimentos.filter(x=>Number(x.ano)===year).map(x=>x.elemento_item),...state.intencoes.filter(x=>Number(x.ano)===year).map(x=>x.elemento_item)])].sort();
 const items=codes.map(code=>{const x=sameElement(code,year);return '<tr><td><strong>'+esc(code||'A confirmar')+'</strong></td><td>'+money(x.used)+'</td><td>'+money(x.unverified)+'</td><td>'+money(x.active)+'</td><td>'+money(x.reserved)+'</td><td>'+x.pending+'</td></tr>';}).join('');
 const itemRows=items||'<tr><td colspan="6">Nenhuma classificação cadastrada para '+year+'.</td></tr>';
 const intentions=intents.map(x=>'<tr><td><strong>'+esc(x.centro)+'</strong><small>'+esc(x.ano)+' · UG '+esc(x.unidade_gestora)+'</small></td><td><strong>'+esc(x.elemento_item||'A confirmar')+'</strong><small>'+esc(x.objeto)+'</small></td><td>'+money(x.valor_estimado)+'</td><td>'+money(x.valor_reservado)+'</td><td><span class="cotep-status">'+esc(x.situacao)+'</span>'+(x.situacao==='Reservada'&&x.reserva_ate&&x.reserva_ate<new Date().toISOString().slice(0,10)?'<small>Reserva vencida — conferir</small>':'')+'</td><td>'+ (manage&&['Pendente','Devolvida','Reservada'].includes(x.situacao)?'<button class="btn small" data-action="cotepDecidir" data-id="'+esc(x.id)+'">Analisar</button>':'<button class="btn small" data-action="cotepDetalhes" data-id="'+esc(x.id)+'">Ver</button>')+'</td></tr>').join('');
 const acts=manage?'<button class="btn" data-action="cotepProcedimento">+ COTEP / resultado</button><button class="btn" data-action="cotepBase">Conferir base</button>':'';
 const admin=ctx.admin?'<button class="btn" data-action="cotepGestor">Gestores DTS-1</button>':'';
 const proceduresRows=procedures.map(x=>'<tr><td><strong>'+esc(x.numero)+'</strong><small>UG '+esc(x.unidade_gestora)+'</small></td><td><strong>'+esc(x.elemento_item||'A confirmar')+'</strong><small>'+esc(x.objeto)+'</small></td><td>'+money(x.valor_estimado)+'</td><td>'+ (x.valor_homologado===null?'—':money(x.valor_homologado))+'</td><td>'+esc(x.situacao)+'</td><td>'+(manage?'<button class="btn small" data-action="cotepEditarProcedimento" data-id="'+esc(x.id)+'">Editar</button>':'—')+'</td></tr>').join('');
 const bases=state.bases.map(x=>'<span class="cotep-base '+(x.conferida?'ok':'')+'">'+esc(x.ano)+' · UG '+esc(x.unidade_gestora)+' · '+esc(x.categoria)+' · '+(x.conferida?'conferida':'pendente')+'</span>').join('');
 return '<div class="cotep-page">'+
 '<div class="pagehead"><div><div class="eyebrow">DTS-1 · Gestão compartilhada</div><h1>Planejamento de COTEPs</h1><div class="sub">Intenções dos centros, reservas internas e procedimentos por elemento-item, ramo e unidade gestora.</div></div><div class="head-actions"><button class="btn primary" data-action="cotepNova">+ Nova intenção</button><button class="btn" data-action="cotepRecarregar">↻ Atualizar</button></div></div>'+
 '<div class="cotep-note"><strong>Importante:</strong> a comparação por elemento-item é gerencial. Histórico realizado sem valor homologado confirmado aparece separado e BLOQUEIA reservas até conferência. O limite legal depende de exercício, unidade gestora, ramo de atividade e enquadramento jurídico. Histórico parcial não comprova saldo disponível. As reservas não constituem contratação ou empenho.</div>'+
 '<div class="cotep-kpis"><div><span>Intenções para análise</span><strong>'+open+'</strong></div><div><span>Histórico a conferir</span><strong>'+money(unverified)+'</strong></div><div><span>Reservas gerenciais</span><strong>'+money(reserved)+'</strong></div><div><span>Valores finais confirmados</span><strong>'+money(finalized)+'</strong></div></div>'+
 '<section class="card section"><div class="cotep-heading"><h2>Panorama por elemento-item · '+year+'</h2><span>Valores não equivalem ao limite legal disponível</span></div><div class="table-scroll"><table class="data-table cotep-table"><thead><tr><th>Elemento-item</th><th>Final homologado</th><th>Realizada (a conferir)</th><th>Em andamento (estimado)</th><th>Reservado</th><th>Intenções pendentes</th></tr></thead><tbody>'+itemRows+'</tbody></table></div><p class="helper">Somente procedimentos cadastrados neste módulo entram no panorama. Não há importação automática do Portal de Compras.</p></section>'+
 '<section class="card section"><div class="cotep-heading"><h2>Fila compartilhada DTS-1</h2><div class="cotep-actions">'+acts+admin+'<button class="btn" data-action="cotepExportar">Exportar intenções CSV</button></div></div>'+
 '<div class="cotep-filter"><label for="cotep-busca">Buscar por centro, COTEP, objeto, elemento-item ou UG</label><input id="cotep-busca" value="'+esc(state.search)+'" placeholder="Ex.: 3016, Videomonitoramento, plotter" autocomplete="off"></div>'+
 '<div class="cotep-tabs"><button class="btn '+(state.tab==='intencoes'?'primary':'')+'" data-action="cotepAba" data-tab="intencoes">Intenções ('+intents.length+')</button><button class="btn '+(state.tab==='procedimentos'?'primary':'')+'" data-action="cotepAba" data-tab="procedimentos">COTEPs ('+procedures.length+')</button></div>'+
 (state.tab==='intencoes'?'<div class="table-scroll"><table class="data-table cotep-table"><thead><tr><th>Centro</th><th>Elemento/objeto</th><th>Estimado</th><th>Reservado</th><th>Situação</th><th>Ação</th></tr></thead><tbody>'+ (intentions||'<tr><td colspan="6">Nenhuma intenção encontrada.</td></tr>')+'</tbody></table></div>':
 '<div class="table-scroll"><table class="data-table cotep-table"><thead><tr><th>COTEP</th><th>Elemento/objeto</th><th>Estimado</th><th>Homologado</th><th>Situação</th><th>Ação</th></tr></thead><tbody>'+(proceduresRows||'<tr><td colspan="6">Nenhum procedimento encontrado.</td></tr>')+'</tbody></table></div>')+
 '<div class="cotep-bases"><strong>Bases anuais conferidas</strong><div>'+ (bases||'<span class="cotep-danger">Nenhuma. Reservas desabilitadas até conferência da DTS-1.</span>')+'</div></div></section>'+
 '<section class="card section"><h2>Disponibilidade por ramo</h2>'+
 (state.bases.length?'<div class="cotep-ramo-list">'+state.bases.map(b=>{const groups=[...new Set([...state.intencoes,...state.procedimentos].filter(x=>Number(x.ano)===Number(b.ano)&&x.unidade_gestora===b.unidade_gestora&&x.categoria===b.categoria&&x.ramo_atividade).map(x=>plain(x.ramo_atividade)))];return '<div><strong>'+esc(b.ano)+' · UG '+esc(b.unidade_gestora)+' · '+esc(b.categoria)+'</strong>'+groups.map(g=>{const x=occupied(b.ano,b.unidade_gestora,b.categoria,g);return '<p>'+esc(g)+' — procedimentos '+money(x.p)+' + reservas '+money(x.r)+'; '+(b.conferida?'margem interna '+money(Number(b.teto_referencia)-x.total):'base não conferida')+'</p>'}).join('')+'</div>'}).join('')+'</div>':empty('Cadastre e confira a base anual e o histórico antes de utilizar a disponibilidade por ramo.'))+'</section></div>';
}
async function action(rest,p){const out=await rest('/rest/v1/rpc/sig_cotep_acao','POST',{p});await load(rest,true);if(state.error)throw Error(state.error);return out;}
async function click(name,el,ctx){
 const manage=manager(ctx),id=el.dataset.id;
 if(ctx.preview&&name!=='cotepDetalhes'&&name!=='cotepAba')return ctx.toast('Prévia somente leitura.');
 if(name==='cotepRecarregar'){await load(ctx.rest,true);ctx.render();return;}
 if(name==='cotepExportar'){exportCsv();return;}
 if(name==='cotepAba'){state.tab=el.dataset.tab==='procedimentos'?'procedimentos':'intencoes';ctx.render();return;}
 if(name==='cotepNova'){ctx.openModal('Nova intenção de COTEP','Encaminhamento centralizado para a DTS-1',intentionForm(),true);return;}
 if(name==='cotepDetalhes'||name==='cotepDecidir'){
  const x=state.intencoes.find(x=>x.id===id);if(!x)return;
  const info='<p><strong>'+esc(x.centro)+'</strong> · '+esc(x.elemento_item)+' · '+money(x.valor_estimado)+'</p><p>'+esc(x.objeto)+'</p><p>Ramo: '+esc(x.ramo_atividade||'Não classificado')+' · reserva: '+money(x.valor_reservado)+' · validade: '+shortDate(x.reserva_ate)+'</p><p>'+esc(x.justificativa||'')+'</p>';
  ctx.openModal(name==='cotepDecidir'?'Decisão DTS-1':'Detalhes da intenção',esc(x.situacao),name==='cotepDecidir'&&manage?info+decisionForm(x):info,true);return;
 }
 if(!manage){ctx.toast('Ação restrita aos gestores da DTS-1.','error');return;}
 if(name==='cotepProcedimento'||name==='cotepEditarProcedimento'){
  const x=state.procedimentos.find(x=>x.id===id);ctx.openModal('Registrar COTEP e resultado','Cadastro por elemento-item e valor final conferido',procedureForm(x),true);return;
 }
 if(name==='cotepBase'){ctx.openModal('Conferência da base anual','Validação documentada pela DTS-1',baseForm(),true);return;}
 if(name==='cotepGestor'&&ctx.admin){ctx.openModal('Delegar gestão à DTS-1','Apenas usuários habilitados no SIG',gestorForm(ctx),true);}
}
async function submit(form,ctx){
 if(ctx.preview)throw Error('Prévia somente leitura');
 const type=form.dataset.form;if(type!=='cotepIntencao'&&!manager(ctx))throw Error('Somente gestor DTS-1 pode registrar decisões');
 if(type==='cotepGestor'&&!ctx.admin)throw Error('Somente administrador pode gerenciar delegações');
 const d=Object.fromEntries(new FormData(form).entries());
 const payload=type==='cotepIntencao'?{acao:'criar_intencao',...d}:type==='cotepProcedimento'?{acao:'procedimento',...d}:type==='cotepBase'?{acao:'base',...d}:type==='cotepGestor'?{acao:'definir_gestor',...d}:{acao:'decidir',...d};
 await action(ctx.rest,payload);ctx.closeModal();ctx.toast('Registro confirmado no banco.','success');ctx.render();
}
function filter(q){state.search=q;}
window.SIG_COTEP={syncIdentity,load,isLoaded,view,click,submit,filter};
})();