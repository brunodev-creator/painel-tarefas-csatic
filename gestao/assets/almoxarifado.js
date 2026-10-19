/* Almoxarifado — SIG CSA-TIC. Consulta de destinações RIPC com RPM explícita.
 * O contorno do Estado é baseado no IBGE. Marcadores representam sedes aproximadas,
 * NÃO polígonos nem limites territoriais das RPM. */
(()=>{'use strict';
const REGIOES=Object.freeze([
 {id:'RMBH',nome:'RMBH · 1ª, 2ª e 3ª RPM',sede:'Belo Horizonte',lon:-43.9345,lat:-19.9167,cor:'#2e7998'},
 {id:'4',nome:'4ª RPM',sede:'Juiz de Fora',lon:-43.3515,lat:-21.7609,cor:'#806c55'},
 {id:'5',nome:'5ª RPM',sede:'Uberaba',lon:-47.9319,lat:-19.7495,cor:'#9b8433'},
 {id:'6',nome:'6ª RPM',sede:'Lavras',lon:-44.9984,lat:-21.2458,cor:'#b76d43'},
 {id:'7',nome:'7ª RPM',sede:'Divinópolis',lon:-44.8894,lat:-20.1446,cor:'#5c946e'},
 {id:'8',nome:'8ª RPM',sede:'Governador Valadares',lon:-41.9482,lat:-18.8511,cor:'#688d43'},
 {id:'9',nome:'9ª RPM',sede:'Uberlândia',lon:-48.2772,lat:-18.9186,cor:'#a26d4b'},
 {id:'10',nome:'10ª RPM',sede:'Patos de Minas',lon:-46.5147,lat:-18.5789,cor:'#8b7b44'},
 {id:'11',nome:'11ª RPM',sede:'Montes Claros',lon:-43.8615,lat:-16.7282,cor:'#ad8553'},
 {id:'12',nome:'12ª RPM',sede:'Ipatinga',lon:-42.5367,lat:-19.4684,cor:'#775f99'},
 {id:'13',nome:'13ª RPM',sede:'Barbacena',lon:-43.7744,lat:-21.2258,cor:'#b4704c'},
 {id:'14',nome:'14ª RPM',sede:'Curvelo',lon:-44.4303,lat:-18.7539,cor:'#5d967b'},
 {id:'15',nome:'15ª RPM',sede:'Teófilo Otoni',lon:-41.5053,lat:-17.8572,cor:'#4a7da2'},
 {id:'16',nome:'16ª RPM',sede:'Unaí',lon:-46.9057,lat:-16.3565,cor:'#8e6fa4'},
 {id:'17',nome:'17ª RPM',sede:'Pouso Alegre',lon:-45.9389,lat:-22.2293,cor:'#4c7e9d'},
 {id:'18',nome:'18ª RPM',sede:'Poços de Caldas',lon:-46.5628,lat:-21.7801,cor:'#b56d42'},
 {id:'19',nome:'19ª RPM',sede:'Sete Lagoas',lon:-44.2467,lat:-19.4663,cor:'#b0984e'}
]);
const state={phase:'idle',error:'',registros:[],geo:null,territory:null,geoStatus:'idle',selected:null,
 year:'TODOS',status:'TODOS',type:'TODOS',destination:'TODOS',q:'',subrpm:'TODOS',
 sort:'novo',page:1,pageSize:8,zoom:1,x:0,y:0};
const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const textSearch=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
const brMoney=x=>Number.isFinite(Number(x))?Number(x).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}):'Não informado';
const asDate=d=>/^\d{4}-\d{2}-\d{2}/.test(String(d||''))?d.slice(8,10)+'/'+d.slice(5,7)+'/'+d.slice(0,4):'Não informada';
const category=x=>{
 const s=textSearch(x);
 if(/RADIO|TRANSCEPTOR|COMUNICACAO|ANTENA/.test(s))return 'Radiocomunicação';
 if(/CAMERA|CFTV|GRAVADOR|VIDEOMONITORAMENTO/.test(s))return 'Videomonitoramento';
 if(/COMPUTADOR|IMPRESSORA|NOTEBOOK|MONITOR|SWITCH|NOBREAK|SERVIDOR|PERIFERICO/.test(s))return 'Informática e redes';
 if(/LOUSA|SUPORTE|ARMARIO|MOBILIARIO|CADEIRA|MESA/.test(s))return 'Equipamentos e mobiliário';
 return 'Outros materiais';
};
function numRpm(n){return Number.isInteger(n)&&n>=1&&n<=19?n:null;}
function normalize(row){
 const rpm=row.rpm===null||row.rpm===undefined?null:numRpm(Number(row.rpm));
 return {id:String(row.chave_origem||''),rpm,ano:Number(row.ano)||null,
  documento:String(row.documento_repasse||''),processo:String(row.processo_origem||''),
  processoIdentificado:String(row.processo_identificado||''),
  descricao:String(row.material_descricao||'Não informado'),
  destino:String(row.unidade_destinataria||'Não informado'),
  valor:row.valor_ripc===null?null:Number(row.valor_ripc),tipo:category(row.material_descricao),
  statusProcesso:String(row.situacao_processo||''),
  entrega:row.situacao_entrega?String(row.situacao_entrega):null,
  quantidade:row.quantidade===null||row.quantidade===undefined?null:Number(row.quantidade),
  dataAquisicao:row.data_aquisicao||null,dataRegistro:String(row.data_registro||''),
  validacao:String(row.validacao_origem||''),chaveRepasse:String(row.chave_repasse||'')};
}
async function loadMap(force=false){
 if(state.geoStatus==='loading'||(state.geoStatus==='ready'&&!force))return false;
 state.geoStatus='loading';
 // Primeiro carregar polígonos esquemáticos traçados sobre a referência do usuário.
 // Caso a camada não seja carregada, conservar o contorno IBGE e os seletores originais.
 const [schematic,stateBorder]=await Promise.allSettled([
   fetch('./assets/maps/rpm-regioes-aproximadas.json',{cache:'no-store'}).then(async res=>{
     if(!res.ok)throw Error('Regiões não disponíveis: '+res.status);
     const d=await res.json(),ids=['RMBH',...Array.from({length:16},(_,i)=>String(i+4))];
     if(d.viewBox!=='0 0 900 737'||Object.keys(d.polygons||{}).length!==17||
       ids.some(id=>!/^M[0-9,\s]+Z$/.test(d.polygons[id]||'')||
       !Array.isArray(d.centers?.[id])||d.centers[id].length!==2))
        throw Error('A camada esquemática não contém as 17 áreas esperadas.');
     return d;
   }),
   fetch('./assets/maps/mg-ibge-contorno.geojson',{cache:'force-cache'}).then(async res=>{
     if(!res.ok)throw Error('Limite estadual indisponível');
     const d=await res.json(),mg=(d.features||[]).find(f=>f.properties?.sigla==='MG'||f.properties?.cd_geocuf==='31');
     if(!mg||!['Polygon','MultiPolygon'].includes(mg.geometry?.type))throw Error('GeoJSON estadual inválido');
     return mg.geometry;
   })
 ]);
 state.territory=schematic.status==='fulfilled'?schematic.value:null;
 state.geo=stateBorder.status==='fulfilled'?stateBorder.value:null;
 state.geoStatus=state.territory||state.geo?'ready':'error';
 return true;
}
async function load(rest,force=false){
 if(state.phase==='loading'||(state.phase==='ready'&&!force))return false;
 state.phase='loading';state.error='';
 try{
  const [data]=await Promise.all([
   rest('/rest/v1/sig_almox_destinacoes?select=chave_origem,chave_repasse,ano,documento_repasse,processo_origem,processo_identificado,material_descricao,unidade_destinataria,rpm,valor_ripc,data_registro,situacao_processo,validacao_origem,quantidade,situacao_entrega,data_aquisicao&order=chave_origem.asc&limit=2000'),
   loadMap()
  ]);
  if(!Array.isArray(data))throw Error('A consulta protegida de destinacões não retornou uma lista.');
  const mapped=data.map(normalize);
  if(new Set(mapped.map(x=>x.id)).size!==mapped.length||mapped.some(x=>!x.id))throw Error('Registros RIPC duplicados ou inválidos.');
  state.registros=mapped;state.phase='ready';
 }catch(e){state.registros=[];state.phase='error';state.error=e.message||String(e);}
 return true;
}
function isLoaded(){return state.phase!=='idle';}
function reset(){state.phase='idle';state.registros=[];state.error='';state.selected=null;
 state.year='TODOS';state.status='TODOS';state.type='TODOS';state.destination='TODOS';state.q='';
 state.subrpm='TODOS';state.page=1;state.sort='novo';state.zoom=1;state.x=0;state.y=0;}
const belongs=(x,selected)=>{
 if(selected==='UNCLASSIFIED')return x.rpm===null;
 if(selected==='RMBH')return [1,2,3].includes(x.rpm);
 if(selected!==null)return x.rpm===Number(selected);
 return x.rpm!==null;
};
function selectionRows(){return state.registros.filter(x=>belongs(x,state.selected));}
function filtered(){
 let a=selectionRows().filter(x=>
 (state.year==='TODOS'||String(x.ano)===state.year)&&
 (state.status==='TODOS'||(state.status==='NAO_INFORMADA'&&!x.statusProcesso)||x.statusProcesso===state.status)&&
 (state.type==='TODOS'||x.tipo===state.type)&&
 (state.destination==='TODOS'||x.destino===state.destination)&&
 (state.subrpm==='TODOS'||state.selected!=='RMBH'||String(x.rpm)===state.subrpm)&&
 (!state.q||textSearch([x.id,x.processo,x.processoIdentificado,x.descricao,x.destino,x.documento,x.tipo].join(' ')).includes(textSearch(state.q))));
 a.sort((a,b)=>{
 if(state.sort==='valor')return (b.valor??-Infinity)-(a.valor??-Infinity);
 if(state.sort==='material')return a.descricao.localeCompare(b.descricao,'pt-BR');
 return String(b.dataRegistro).localeCompare(String(a.dataRegistro))||b.id.localeCompare(a.id);
 });
 return a;
}
const unique=a=>[...new Set(a)].sort((x,y)=>String(x).localeCompare(String(y),'pt-BR',{numeric:true}));
function groupName(x){return x===null?'Todas as RPM':x==='RMBH'?'RMBH · 1ª, 2ª e 3ª RPM':x==='UNCLASSIFIED'?'Sem RPM identificada':REGIOES.find(r=>r.id===x)?.nome||'RPM';}
function formatProcStatus(raw){
 if(!raw)return 'Não informado';
 return String(raw).replaceAll('_',' ').toLowerCase().replace(/^./,s=>s.toUpperCase());
}
function option(value,label,current){return '<option value="'+escape(value)+'"'+(value===current?' selected':'')+'>'+escape(label)+'</option>';}
function options(values,current,labels={}){return values.map(v=>option(String(v),labels[v]||String(v),current)).join('');}
function kpis(){
 const a=state.registros,classified=a.filter(x=>x.rpm!==null);
 const proc=new Set(classified.map(x=>x.processoIdentificado||x.processo).filter(Boolean));
 const entrega=classified.filter(x=>x.entrega==='Entregue').length,
       pend=classified.filter(x=>x.entrega==='Pendente').length,
       hasDelivery=classified.some(x=>!!x.entrega);
 return [
  ['◇','RPMs cadastradas','19','1ª a 19ª Região'],
  ['▤','Processos identificados',proc.size.toLocaleString('pt-BR'),'Com RPM explícita'],
  ['⬡','Registros entregues',hasDelivery?entrega.toLocaleString('pt-BR'):'—',hasDelivery?'Status da fonte':'Sem dados de entrega'],
  ['!','Pendências de entrega',hasDelivery?pend.toLocaleString('pt-BR'):'—',hasDelivery?'Status da fonte':'Sem dados de entrega']
 ].map(([ico,title,value,subtitle],i)=>'<div class="almox-kpi almox-kpi-'+i+'"><div class="almox-kpi-icon">'+ico+'</div><div><span>'+escape(title)+'</span><strong>'+escape(value)+'</strong><small>'+escape(subtitle)+'</small></div></div>').join('');
}
function pointRows(){
 const counts=new Map(REGIOES.map(x=>[x.id,0]));
 for(const r of state.registros){if(r.rpm===null)continue;const id=r.rpm<=3?'RMBH':String(r.rpm);counts.set(id,(counts.get(id)||0)+1);}
 return REGIOES.map(x=>({...x,count:counts.get(x.id)}));
}
function boundary(){
 if(!state.geo)return {path:'',project:()=>[0,0]};
 const coords=[];
 const geometry=state.geo.type==='Polygon'?[state.geo.coordinates]:state.geo.coordinates;
 geometry.forEach(poly=>poly.forEach(ring=>ring.forEach(c=>{
  if(Array.isArray(c)&&Number.isFinite(c[0])&&Number.isFinite(c[1]))coords.push(c);
 })));
 if(!coords.length)return {path:'',project:()=>[0,0]};
 const lons=coords.map(p=>p[0]),lats=coords.map(p=>p[1]);
 const minx=Math.min(...lons),maxx=Math.max(...lons),miny=Math.min(...lats),maxy=Math.max(...lats);
 const margin=54,W=760,H=570,scale=Math.min((W-2*margin)/(maxx-minx),(H-2*margin)/(maxy-miny));
 const ox=(W-(maxx-minx)*scale)/2,oy=(H-(maxy-miny)*scale)/2;
 const project=([x,y])=>[ox+(x-minx)*scale,oy+(maxy-y)*scale];
 const polys=geometry.map(poly=>poly.map(ring=>ring.map((c,i)=>{const xy=project(c);return(i?'L':'M')+xy.map(x=>x.toFixed(1)).join(',')}).join(' ')+' Z').join(' ')).join(' ');
 return {path:polys,project};
}
function mapHtml(){
 const points=pointRows(),approx=state.territory;
 const fallback=boundary();
 const fallbackPins=state.geo?points.map(r=>{
  const [x,y]=fallback.project([r.lon,r.lat]),selected=state.selected===r.id;
  return '<g class="almox-map-pin'+(selected?' selected':'')+
   '" data-action="almoxPick" data-rpm="'+escape(r.id)+'" role="button" tabindex="0" aria-label="'+escape(r.nome)+'" transform="translate('+x.toFixed(1)+' '+y.toFixed(1)+')">'+
   '<title>'+escape(r.nome+' · '+r.sede+' · '+r.count+' registros')+'</title>'+
   '<circle class="almox-pin-halo" r="18"/><circle class="almox-pin-disc" r="14" fill="'+escape(r.cor)+'"/>'+
   '<text text-anchor="middle" dy="4">'+escape(r.id==='RMBH'?'BH':r.id)+'</text></g>';
 }).join(''):'';
 // Os polígonos não são georreferenciados: são vetorizados da imagem referencial.
 // As 17 formas são clicáveis; RMBH preserva [1,2,3] no filtro/banco.
 const regions=approx?points.map(r=>{
  const id=r.id,selected=state.selected===id,[x,y]=approx.centers[id];
  const name=id==='RMBH'?'RMBH':id+'ª RPM';
  return '<path class="almox-rpm-region'+(selected?' selected':'')+(r.count?' has-data':'')+
   '" d="'+escape(approx.polygons[id])+'" fill="'+escape(r.cor)+'"'+
   ' data-action="almoxPick" data-rpm="'+escape(id)+'" role="button" tabindex="0"'+
   ' aria-label="'+escape(name+', '+r.sede+', '+r.count+' destinações')+'">'+
   '<title>'+escape(name+' — '+r.sede+' · '+r.count+' destinações identificadas')+'</title></path>';
 }).join(''):'';
 const labels=approx?points.map(r=>{
  const [x,y]=approx.centers[r.id],name=r.id==='RMBH'?'RMBH':r.id+'ª';
  const selected=state.selected===r.id;
  const w=r.id==='RMBH'?59:40;
  return '<g class="almox-rpm-label'+(selected?' selected':'')+'" data-region-label="'+escape(r.id)+'" transform="translate('+x+' '+y+')">'+
   '<rect x="'+(-w/2)+'" y="-14" width="'+w+'" height="28" rx="7"/>'+
   '<text text-anchor="middle" dy="4.5">'+escape(name)+'</text>'+
   (r.count?'<circle cx="'+(w/2-2)+'" cy="-11" r="4" class="almox-rpm-count-dot"/>':'')+'</g>';
 }).join(''):'';
 const shape=approx?
  '<svg id="almox-map-svg" viewBox="0 0 900 737" xmlns="http://www.w3.org/2000/svg" role="group" aria-label="Mapa esquemático com 17 áreas aproximadas das RPM e RMBH clicáveis">'+
  '<defs><filter id="almox-map-shadow"><feDropShadow dx="0" dy="3" stdDeviation="6" flood-color="#143b31" flood-opacity=".24"/></filter></defs>'+
  '<g id="almox-map-transform">'+regions+labels+'</g></svg>':
  state.geo?
  '<svg id="almox-map-svg" viewBox="0 0 760 570" xmlns="http://www.w3.org/2000/svg" role="group" aria-label="Contorno estadual, com seleção regional por marcadores">'+
  '<g id="almox-map-transform"><path d="'+escape(fallback.path)+'" fill="#d1dabb" stroke="#718373" stroke-width="2"/>'+fallbackPins+'</g></svg>':
  '<div class="almox-map-wait">'+(state.geoStatus==='error'?'Camada cartográfica indisponível. Use a lista regional abaixo.':'Carregando o mapa das regiões…')+'</div>';
 return '<div class="almox-map-card"><div class="almox-map-heading"><div><h2>Mapa das Regiões da Polícia Militar</h2>'+
  '<p>17 áreas selecionáveis · RMBH = 1ª, 2ª e 3ª RPM</p></div>'+
  '<div class="almox-map-zoom"><button type="button" data-action="almoxZoomIn" aria-label="Aproximar mapa">+</button>'+
  '<button type="button" data-action="almoxZoomOut" aria-label="Afastar mapa">−</button>'+
  '<button type="button" data-action="almoxZoomReset" aria-label="Reenquadrar mapa">⤢</button></div></div>'+
  '<div class="almox-map-stage">'+shape+'</div>'+
  '<div class="almox-map-disclaimer"><strong>'+(approx?'Divisões regionais ilustrativas.':'Divisões regionais indisponíveis.')+'</strong> '+
  (approx?'Áreas vetorizadas de uma imagem de referência, com limites aproximados. Não representam a delimitação oficial nem substituem o mapa homologado pela PMMG.':
  'Mostrando apenas o contorno estadual. As divisões das RPM não puderam ser carregadas.')+
  ' As aquisições são filtradas pelo número de RPM cadastrado no registro, não pela posição cartográfica.</div>'+
  '<div class="almox-region-grid">'+points.map(p=>'<button type="button" data-action="almoxPick" data-rpm="'+escape(p.id)+
   '" class="almox-region-choice'+(state.selected===p.id?' active':'')+'">'+
   '<i style="background:'+escape(p.cor)+'"></i><span><b>'+escape(p.id==='RMBH'?'RMBH':p.id+'ª RPM')+
   '</b><small>'+escape(p.sede)+'</small></span><em>'+p.count+'</em></button>').join('')+'</div></div>';
}
function panelHtml(){
 const raw=selectionRows(),list=filtered(),years=unique(state.registros.map(x=>x.ano).filter(Boolean)).map(String),
 types=unique(raw.map(x=>x.tipo)),destinations=unique(raw.map(x=>x.destino)),
 statuses=unique(raw.map(x=>x.statusProcesso).filter(Boolean));
 const totalPages=Math.max(1,Math.ceil(list.length/state.pageSize));
 if(state.page>totalPages)state.page=totalPages;
 const page=list.slice((state.page-1)*state.pageSize,state.page*state.pageSize);
 const header='<header class="almox-panel-heading"><div><span class="almox-eyebrow">CONSULTA POR DESTINO</span><h2>'+
 escape(groupName(state.selected))+'</h2><p>'+escape(state.selected===null?'Todas as regiões com destinação explicitamente registrada':
 state.selected==='UNCLASSIFIED'?'Sem vinculação territorial confirmada':
 state.selected==='RMBH'?'Consolidação das 1ª, 2ª e 3ª RPM, individualizadas na fonte':REGIOES.find(x=>x.id===state.selected)?.sede||'')+
 '</p></div><span class="almox-count">'+raw.length+' registros</span></header>';
 const selects='<div class="almox-filters"><label>Ano<select id="almox-year">'+option('TODOS','Todos',state.year)+options(years,state.year)+'</select></label>'+
 '<label>Situação da aquisição<select id="almox-status">'+option('TODOS','Todas',state.status)+options(statuses,state.status,Object.fromEntries(statuses.map(x=>[x,formatProcStatus(x)])))+option('NAO_INFORMADA','Não informada',state.status)+'</select></label>'+
 '<label>Tipo de material<select id="almox-type">'+option('TODOS','Todos',state.type)+options(types,state.type)+'</select></label>'+
 '<label>Unidade destinatária<select id="almox-destination">'+option('TODOS','Todas',state.destination)+options(destinations,state.destination)+'</select></label>'+
 (state.selected==='RMBH'?'<label>RPM da RMBH<select id="almox-subrpm">'+option('TODOS','1ª + 2ª + 3ª',state.subrpm)+option('1','1ª RPM',state.subrpm)+option('2','2ª RPM',state.subrpm)+option('3','3ª RPM',state.subrpm)+'</select></label>':'')+
 '<label class="almox-q">Pesquisar<input type="search" id="almox-q" placeholder="Material, processo, destino…" value="'+escape(state.q)+'"></label>'+
 '<label>Ordenação<select id="almox-sort">'+option('novo','Registro mais recente',state.sort)+option('valor','Maior valor RIPC',state.sort)+option('material','Material A–Z',state.sort)+'</select></label></div>';
 const line=x=>'<tr><td><strong>'+escape(x.processoIdentificado|| (x.processo?'Processo '+x.processo:'RIPC '+x.documento))+'</strong>'+
 '<small>Doc. de repasse '+escape(x.documento||'—')+'</small></td>'+
 '<td><b>'+escape(x.descricao)+'</b><small>'+escape(x.tipo)+'</small></td>'+
 '<td>'+escape(x.chaveRepasse.split('|').pop()?.split('.').slice(6,8).join('.')||'—')+'</td>'+
 '<td class="almox-value">'+escape(x.quantidade===null?'—':x.quantidade)+'</td>'+
 '<td class="almox-value">'+escape(brMoney(x.valor))+'</td>'+
 '<td>'+escape(x.destino)+'</td>'+
 '<td>'+escape(asDate(x.dataAquisicao))+'</td>'+
 '<td><span class="almox-neutral-status">'+escape(formatProcStatus(x.statusProcesso))+'</span></td>'+
 '<td><span class="almox-neutral-status">'+escape(x.entrega||'Não informada')+'</span></td>'+
 '<td><button type="button" class="almox-view" data-action="almoxDetail" data-record="'+escape(encodeURIComponent(x.id))+'">Detalhes →</button></td></tr>';
 const missing=state.phase==='error'?'<div class="almox-state" role="alert">Falha ao consultar os registros: '+escape(state.error)+
 '<button class="btn small" data-action="almoxReload">Tentar novamente</button></div>':
 state.phase==='loading'?'<div class="almox-state">Consultando registros autorizados…</div>':
 !list.length?'<div class="almox-state">Nenhum registro corresponde à seleção. Não foram criados dados fictícios.</div>':'';
 const table='<div class="almox-table-scroll"><table class="almox-table"><thead><tr>'+
 '<th>Processo / Repasse</th><th>Material</th><th>Elemento-item</th><th>Qtd.</th><th>Valor RIPC</th>'+
 '<th>Unidade destinatária</th><th>Data aquisição</th><th>Situação aquisição</th><th>Entrega</th><th></th></tr></thead><tbody>'+
 page.map(line).join('')+'</tbody></table></div>';
 const pager='<footer class="almox-panel-footer"><span>'+list.length+' registro(s) filtrado(s) · página '+state.page+' de '+totalPages+'</span>'+
 '<div><button data-action="almoxPrev" type="button" '+(state.page===1?'disabled':'')+' aria-label="Página anterior">‹</button>'+
 '<button data-action="almoxNext" type="button" '+(state.page===totalPages?'disabled':'')+' aria-label="Próxima página">›</button></div></footer>';
 return header+selects+missing+(list.length?table:'')+pager+
 '<div class="almox-panel-note">Origem: DESTINACAO_REPASSES (RIPC). Valor e data de registro não significam compra concluída; '+
 '“OK” na origem não comprova entrega. Quantidade e entrega permanecem indisponíveis enquanto não houver registro específico.</div>';
}
function view(authorized=true){
 if(!authorized)return '<section class="card section"><h2>Almoxarifado</h2><p>Acesso não autorizado para este perfil.</p></section>';
 const unclassified=state.registros.filter(x=>x.rpm===null).length;
 return '<div class="almox-page">'+
 '<header class="almox-top"><div><span>ALMOXARIFADO</span><h1>Almoxarifado</h1>'+
 '<p>Consulte as aquisições vinculadas às Regiões da Polícia Militar de Minas Gerais.</p></div>'+
 '<div class="almox-top-actions"><button class="almox-outline-btn" data-action="almoxClear" type="button">↺ Visão geral</button>'+
 '<button class="almox-outline-btn" data-action="almoxReload" type="button">↻ Atualizar consulta</button></div></header>'+
 '<div class="almox-kpis">'+kpis()+'</div>'+
 '<div class="almox-alert">'+
 '<strong>Consulta logística em implantação.</strong> '+
 'Foram encontrados '+state.registros.length+' registros RIPC; '+unclassified+' não possuem RPM explícita. '+
 'Esses registros permanecem sem classificação; indicadores de entrega e quantidade só serão preenchidos com dados verificados.'+
 '<button type="button" class="almox-unclassified" data-action="almoxPick" data-rpm="UNCLASSIFIED">Ver não classificados ('+unclassified+') →</button></div>'+
 '<div class="almox-layout">'+mapHtml()+'<section class="almox-data-card" id="almox-panel">'+panelHtml()+'</section></div>'+
 '<p class="almox-foot-source">Divisões regionais aproximadas vetorizadas da imagem de referência enviada pelo usuário; não homologadas. O contorno estadual IBGE permanece como fallback. Filtros por RPM usam exclusivamente o cadastro de destino.</p>'+
 '</div>';
}
function refreshPanel(){
 const e=document.getElementById('almox-panel');
 if(e)e.innerHTML=panelHtml();
 document.querySelectorAll('.almox-region-choice').forEach(x=>x.classList.toggle('active',x.dataset.rpm===state.selected));
 document.querySelectorAll('.almox-map-pin,.almox-rpm-region').forEach(x=>x.classList.toggle('selected',x.dataset.rpm===state.selected));
 document.querySelectorAll('.almox-rpm-label').forEach(x=>x.classList.toggle('selected',x.dataset.regionLabel===state.selected));
}
function pick(rpm){
 if(!['UNCLASSIFIED','RMBH',...REGIOES.map(r=>r.id)].includes(rpm))return;
 state.selected=rpm;state.page=1;state.subrpm='TODOS';
 state.type='TODOS';state.destination='TODOS';state.q='';state.year='TODOS';state.status='TODOS';state.sort='novo';
 refreshPanel();
}
function clear(){
 state.selected=null;state.subrpm='TODOS';state.type='TODOS';state.destination='TODOS';state.q='';
 state.year='TODOS';state.status='TODOS';state.page=1;state.sort='novo';refreshPanel();
}
function input(id,value){
 if(id==='almox-year')state.year=String(value);
 if(id==='almox-status')state.status=String(value);
 if(id==='almox-type')state.type=String(value);
 if(id==='almox-destination')state.destination=String(value);
 if(id==='almox-q')state.q=String(value).slice(0,140);
 if(id==='almox-subrpm')state.subrpm=String(value);
 if(id==='almox-sort')state.sort=String(value);
 state.page=1;
 // Evita re-render do elemento ativo enquanto usuário digita na busca.
 const active=document.activeElement,keep=id==='almox-q'&&active?.id==='almox-q';
 const start=keep?active.selectionStart:null,end=keep?active.selectionEnd:null;
 refreshPanel();
 if(keep){
  const next=document.getElementById('almox-q');next?.focus();
  try{next?.setSelectionRange(start,end)}catch{}
 }
}
function paginate(direction){state.page=Math.max(1,state.page+(direction==='next'?1:-1));refreshPanel();}
function detail(key){
 const r=state.registros.find(x=>x.id===key);
 if(!r)return '<p>Registro indisponível ou sem autorização.</p>';
 const fields=[
 ['Processo de compra',r.processoIdentificado||r.processo||'Não informado'],
 ['Documento de repasse',r.documento||'Não informado'],
 ['Objeto / material',r.descricao],['Tipo inferido da descrição',r.tipo],
 ['Destino textual',r.destino],['RPM',r.rpm?(r.rpm+'ª RPM'):'Não classificada'],
 ['Valor da destinação RIPC',brMoney(r.valor)],
 ['Quantidade',r.quantidade===null?'Não informada':r.quantidade],
 ['Data de aquisição',asDate(r.dataAquisicao)],
 ['Data de registro RIPC',asDate(r.dataRegistro)],
 ['Situação da entrega',r.entrega||'Não informada'],
 ['Situação do processo na origem',r.statusProcesso||'Não informada'],
 ['ID da origem RIPC',r.id],
 ['Validação no cadastro RIPC (não é entrega)',r.validacao||'Não informada']
 ];
 return '<div class="almox-details-grid">'+fields.map(([label,value])=>'<div><small>'+escape(label)+'</small><strong>'+escape(value)+'</strong></div>').join('')+'</div>'+
 '<p class="almox-panel-note">Este registro apenas documenta a destinação declarada na fonte. '+
 'Sem prova de entrega, quantitativo ou execução final. Se a aquisição abrange várias unidades, não ratear valores automaticamente.</p>';
}
function zoom(v){
 state.zoom=Math.min(3,Math.max(1,state.zoom+(v>0?.25:-.25)));
 if(state.zoom===1){state.x=0;state.y=0;}
 updateTransform();
}
function resetZoom(){state.zoom=1;state.x=0;state.y=0;updateTransform();}
function updateTransform(){
 const el=document.getElementById('almox-map-transform');if(!el)return;
 const svg=document.getElementById('almox-map-svg'),W=svg?.viewBox?.baseVal?.width||900,H=svg?.viewBox?.baseVal?.height||737;
 const x=Math.max(-W*.6,Math.min(W*.6,state.x)),y=Math.max(-H*.6,Math.min(H*.6,state.y));
 state.x=x;state.y=y;
 el.setAttribute('transform','translate('+(W/2-state.zoom*W/2+x)+' '+(H/2-state.zoom*H/2+y)+') scale('+state.zoom+')');
}
function afterRender(){
 const svg=document.getElementById('almox-map-svg');if(!svg||svg.dataset.ready)return;
 svg.dataset.ready='1';updateTransform();
 svg.addEventListener('wheel',e=>{e.preventDefault();zoom(e.deltaY<0?1:-1)},{passive:false});
 let start=null;
 svg.addEventListener('pointerdown',e=>{if(e.target.closest('.almox-map-pin,.almox-rpm-region'))return;start={px:e.clientX,py:e.clientY,x:state.x,y:state.y};svg.setPointerCapture?.(e.pointerId)});
 svg.addEventListener('pointermove',e=>{if(!start)return;const bb=svg.getBoundingClientRect();state.x=start.x+(e.clientX-start.px)*svg.viewBox.baseVal.width/bb.width;state.y=start.y+(e.clientY-start.py)*svg.viewBox.baseVal.height/bb.height;updateTransform()});
 for(const t of ['pointerup','pointercancel'])svg.addEventListener(t,()=>{start=null});
 svg.addEventListener('keydown',e=>{const p=e.target.closest('[data-rpm]');if(p&&(e.key==='Enter'||e.key===' ')){e.preventDefault();pick(p.dataset.rpm)}});
}
window.SIG_ALMOX=Object.freeze({view,load,loadMap,isLoaded,reset,pick,clear,input,paginate,detail,zoom,resetZoom,afterRender,
 getStats:()=>({records:state.registros.length,classified:state.registros.filter(x=>x.rpm!==null).length,
 unclassified:state.registros.filter(x=>x.rpm===null).length,pins:REGIOES.length,areas:state.territory?Object.keys(state.territory.polygons).length:0,selected:state.selected})});
})();