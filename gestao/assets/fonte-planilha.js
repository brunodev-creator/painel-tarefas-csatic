/* SIG Online: consulta autenticada e somente leitura da PLANILHA ATUAL.
 * Os registros aqui NÃO são mesclados com processos/tarefas operacionais.
 * Não incorpora credenciais do Google nem expõe arquivos do Drive publicamente. */
(()=>{'use strict';
const ID='1dxzDySXU1h5BKJkW1_mHpNX9KRwgX6Ol5b_kRqeRrJA';
const NAME='agora vai - PLANILHA ATUAL';
const URL='https://docs.google.com/spreadsheets/d/'+ID+'/edit';
const SOURCE=[
 {key:'CONTROLE_PROCESSOS_COMPRA',title:'Processos de compra',cols:['Processo_Compra','Objeto_Processo','Modalidade_Aquisicao','Status_Processo','Valor_Efetivo_Processo']},
 {key:'IMPORT_PROCESSOS_COMPRA',title:'Itens dos processos',cols:['Processo_Compra','Numero_Item_Processo','Material_Servico','Nome_Fornecedor','Valor_Total_Item']},
 {key:'IMPORT_PROCESSOS_HOMOLOGADOS',title:'Processos homologados',cols:['Processo_Compra','Objeto_Processo','Procedimento_Detalhamento','Valor_Homologado','Situacao_Execucao']},
 {key:'IMPORT_EXECUCAO_DESPESA_BO',title:'Especificações e execução',cols:['Número Processo -  Formatado','Número do Empenho','Tipo da especificação','Nome Empresarial/Nome Fornecedor','Data Efetivação Especificação']},
 {key:'SALDO_ATUAL_DOTACOES_EMPENHOS',title:'Saldos dos empenhos',cols:[]},
 {key:'DASHBOARD',title:'Cota orçamentária',cols:['Dotacao','Total_Repassado_Dotacao','TOTAL_EMPENHADO','Saldo_A_Destinar']}
];
const E=x=>String(x??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const state={phase:'idle',meta:[],chosen:null,query:'',error:'',loading:false};
const iso=t=>t?new Date(t).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'}):'—';
function render({cloud=false,isAdmin=false}={}){
 let text='<section class="card section sig-fonte-panel"><div class="sig-fonte-heading">'+
  '<div><h2>Fonte oficial — Planilha Atual</h2><p><a href="'+URL+'" target="_blank" rel="noopener noreferrer">'+E(NAME)+' ↗</a></p></div>'+
  '<span class="sig-fonte-pill">Consulta protegida</span></div>'+
  '<p>Espelho de consulta para processos, especificações e saldos. Os registros de tarefas, compras, AIPC e empenhos operacionais do SIG <strong>não são alterados</strong>. A consulta mostra a última importação, não uma sincronização contínua com o Drive.</p>';
 if(!cloud)return text+'<div class="info-note">Conecte-se ao SIG institucional para consultar os dados autorizados.</div></section>';
 if(state.phase==='loading')text+='<p class="sig-fonte-muted">Carregando os dados autorizados...</p>';
 if(state.error)text+='<div class="info-note">Falha na consulta: '+E(state.error)+'</div>';
 if(state.phase!=='loading'&&!state.meta.length)text+='<div class="info-note">Nenhum snapshot importado. É necessário executar a importação inicial.</div>';
 if(state.meta.length){
  const total=state.meta.reduce((n,x)=>n+(Number(x.quantidade)||0),0);
  const latest=state.meta.map(x=>x.gerado_em).filter(Boolean).sort().slice(-1)[0];
  text+='<div class="sig-fonte-overview"><div><span>Abas disponíveis</span><strong>'+state.meta.length+'/6</strong></div>'+
  '<div><span>Linhas de origem</span><strong>'+total.toLocaleString('pt-BR')+'</strong></div>'+
  '<div><span>Extração mais recente</span><strong>'+E(iso(latest))+'</strong></div></div>'+
  '<div class="table-scroll"><table class="data-table"><thead><tr><th>Fonte</th><th>Linhas</th><th>Extração</th><th>Consulta</th></tr></thead><tbody>'+
  SOURCE.map(s=>{const m=state.meta.find(x=>x.aba===s.key);
   return '<tr><td><strong>'+E(s.title)+'</strong><div class="cell-sub">'+E(s.key)+'</div></td>'+
    '<td>'+(m?E(m.quantidade):'—')+'</td><td>'+E(m?iso(m.gerado_em):'Pendente')+'</td>'+
    '<td>'+(m?'<button class="btn small" data-action="sigFontePreview" data-id="'+E(s.key)+'">Ver dados</button>':'—')+'</td></tr>';
  }).join('')+'</tbody></table></div>';
 }
 if(state.chosen){
  text+='<div class="sig-fonte-preview"><h3>'+E(SOURCE.find(x=>x.key===state.chosen.aba)?.title||state.chosen.aba)+'</h3>'+
   '<div class="sig-fonte-preview-bar"><input type="search" id="sig-fonte-busca" placeholder="Buscar neste relatório..." value="'+E(state.query)+'">'+
   '<span>Prévia limitada a 40 linhas</span></div>'+
   '<div id="sig-fonte-resultados">'+rowsHtml()+'</div></div>';
 }
 text+='<div class="sig-fonte-toolbar"><button class="btn" data-action="sigFonteLoad">Atualizar consulta do SIG</button>'+
  (isAdmin?'<label class="btn primary" for="sig-fonte-json-file">Importar JSON da fonte oficial</label>'+
   '<input type="file" class="v5-file" id="sig-fonte-json-file" accept=".json,application/json">':'')+
  '</div><p class="sig-fonte-muted">A atualização desta consulta busca o último snapshot salvo no SIG. Para buscar dados novos do Google Sheets, o administrador precisa exportar e importar um novo JSON.</p>'+
  '<p class="sig-fonte-muted">Exportador: <a href="https://github.com/brunodev-creator/painel-tarefas-csatic/blob/main/gestao/integracao/SIG_FONTE_ATUAL_AppsScript.gs" target="_blank" rel="noopener noreferrer">SIG_FONTE_ATUAL_AppsScript.gs ↗</a> · Acesso: somente perfis financeiros autorizados.</p></section>';
 return text;
}
function rowsHtml(){
 if(!state.chosen)return '';
 const item=state.chosen,header=item.cabecalhos||[],data=item.linhas||[];
 const cfg=SOURCE.find(s=>s.key===item.aba);
 const indices=cfg?.cols?.length?cfg.cols.map(col=>header.findIndex(h=>String(h).trim().toLowerCase()===col.trim().toLowerCase())).filter(i=>i>=0):[];
 if(!indices.length){for(let i=0;i<Math.min(header.length,6);i++)indices.push(i);}
 const q=state.query.trim().toLocaleLowerCase('pt-BR');
 const matched=q?data.filter(row=>row.some(v=>String(v??'').toLocaleLowerCase('pt-BR').includes(q))):data;
 const rendered=matched.slice(0,40);
 return '<p class="sig-fonte-muted">'+matched.length.toLocaleString('pt-BR')+' registros encontrados; '+rendered.length+' apresentados.</p>'+
 '<div class="table-scroll"><table class="data-table"><thead><tr>'+indices.map(i=>'<th>'+E(header[i]||'Coluna '+(i+1))+'</th>').join('')+
 '</tr></thead><tbody>'+rendered.map(row=>'<tr>'+indices.map(i=>'<td>'+E(row?.[i]??'')+'</td>').join('')+'</tr>').join('')+
 (rendered.length?'':'<tr><td colspan="'+indices.length+'">Nenhum registro correspondente.</td></tr>')+'</tbody></table></div>';
}
async function load(rest,force=false){
 if(state.loading)return false;
 if(state.phase==='ready'&&!force)return false;
 state.loading=true;state.phase='loading';state.error='';
 try{
  const records=await rest('/rest/v1/sig_planilha_snapshots?select=aba,quantidade,gerado_em,importado_em,origem_id&order=aba.asc');
  state.meta=(records||[]).filter(x=>x.origem_id===ID);state.phase='ready';
 }catch(e){state.phase='error';state.error=e.message||String(e);}
 finally{state.loading=false;}
 return true;
}
async function open(kind,rest){
 if(!SOURCE.some(x=>x.key===kind))throw Error('Aba desconhecida.');
 const rows=await rest('/rest/v1/sig_planilha_snapshots?aba=eq.'+encodeURIComponent(kind)+'&select=aba,cabecalhos,linhas,gerado_em,quantidade&limit=1');
 if(!rows?.[0])throw Error('Snapshot indisponível. Atualize a consulta.');
 state.chosen=rows[0];state.query='';
}
function setQuery(q){state.query=String(q||'').slice(0,120);}
async function importFile(file,rest){
 if(!file)throw Error('Selecione um arquivo JSON.');
 if(file.size>10000000)throw Error('Arquivo acima do limite de 10 MB.');
 const contents=JSON.parse(await file.text());
 if(contents?.formato!=='SIG_FONTE_ATUAL_V2'||contents?.origem_id!==ID||
  !Array.isArray(contents.abas)||contents.abas.length!==6)throw Error('O arquivo não foi gerado pelo exportador da PLANILHA ATUAL.');
 const response=await rest('/rest/v1/rpc/sig_planilha_importar_snapshot','POST',{p_documento:contents});
 state.chosen=null;state.phase='idle';
 await load(rest,true);
 return response;
}
window.SIG_FONTE={ID,NAME,URL,render,load,open,rowsHtml,setQuery,importFile,isLoaded:()=>state.phase!=='idle'};
})();