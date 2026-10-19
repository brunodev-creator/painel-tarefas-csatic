/* Almoxarifado — SIG CSA-TIC. Consulta de destinações RIPC com RPM explícita.
 * As 17 áreas do mapa são vetorizações APROXIMADAS de uma imagem de referência:
 * servem somente à navegação. O filtro usa o número de RPM cadastrado no registro,
 * nunca a posição cartográfica. Contorno IBGE + marcadores ficam como fallback. */
(()=>{'use strict';
const REGIOES=Object.freeze([
 {id:'RMBH',nome:'RMBH',sede:'Região Metropolitana de BH',lon:-43.9345,lat:-19.9167,cor:'#c9a25a'},
 {id:'4',nome:'4ª RPM',sede:'Juiz de Fora',lon:-43.3515,lat:-21.7609,cor:'#9db9c9'},
 {id:'5',nome:'5ª RPM',sede:'Uberaba',lon:-47.9319,lat:-19.7495,cor:'#dcc895'},
 {id:'6',nome:'6ª RPM',sede:'Lavras',lon:-44.9984,lat:-21.2458,cor:'#bcabcf'},
 {id:'7',nome:'7ª RPM',sede:'Divinópolis',lon:-44.8894,lat:-20.1446,cor:'#e5b892'},
 {id:'8',nome:'8ª RPM',sede:'Governador Valadares',lon:-41.9482,lat:-18.8511,cor:'#a9c69c'},
 {id:'9',nome:'9ª RPM',sede:'Uberlândia',lon:-48.2772,lat:-18.9186,cor:'#93b5ae'},
 {id:'10',nome:'10ª RPM',sede:'Patos de Minas',lon:-46.5147,lat:-18.5789,cor:'#a8b8db'},
 {id:'11',nome:'11ª RPM',sede:'Montes Claros',lon:-43.8615,lat:-16.7282,cor:'#bdd2a8'},
 {id:'12',nome:'12ª RPM',sede:'Ipatinga',lon:-42.5367,lat:-19.4684,cor:'#dea7a3'},
 {id:'13',nome:'13ª RPM',sede:'Barbacena',lon:-43.7744,lat:-21.2258,cor:'#a6cbc6'},
 {id:'14',nome:'14ª RPM',sede:'Curvelo',lon:-44.4303,lat:-18.7539,cor:'#d9cdab'},
 {id:'15',nome:'15ª RPM',sede:'Teófilo Otoni',lon:-41.5053,lat:-17.8572,cor:'#c7b2d8'},
 {id:'16',nome:'16ª RPM',sede:'Unaí',lon:-46.9057,lat:-16.3565,cor:'#e6c48f'},
 {id:'17',nome:'17ª RPM',sede:'Pouso Alegre',lon:-45.9389,lat:-22.2293,cor:'#a2c5a9'},
 {id:'18',nome:'18ª RPM',sede:'Poços de Caldas',lon:-46.5628,lat:-21.7801,cor:'#e3b2a0'},
 {id:'19',nome:'19ª RPM',sede:'Sete Lagoas',lon:-44.2467,lat:-19.4663,cor:'#b6c1dc'}
]);
const REGION_IDS=REGIOES.map(r=>r.id);
const FILTER_DEFAULTS=Object.freeze({selected:null,subrpm:'TODOS',year:'TODOS',status:'TODOS',type:'TODOS',destination:'TODOS',q:''});
const state={phase:'idle',error:'',registros:[],snapshot:'',geo:null,territory:null,geoStatus:'idle',
 ...FILTER_DEFAULTS,sortKey:'registro',sortDir:'desc',page:1,pageSize:10,zoom:1,tx:0,ty:0,
 more:false,tab:'map',present:false,fsRequested:false};

const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
// NFKD também decompõe "ª"/"º" em "a"/"o": "12ª" ⇒ "12A", "rádio" ⇒ "RADIO".
const norm=s=>String(s??'').normalize('NFKD').replace(/[̀-ͯ]/g,'').toUpperCase();
const brMoney=x=>x!==null&&Number.isFinite(Number(x))?Number(x).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}):'Não informado';
const asDate=d=>/^\d{4}-\d{2}-\d{2}/.test(String(d||''))?d.slice(8,10)+'/'+d.slice(5,7)+'/'+d.slice(0,4):'Não informada';
const plural=(n,one,many)=>n.toLocaleString('pt-BR')+' '+(n===1?one:many);
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const isMobile=()=>window.matchMedia?.('(max-width:760px)').matches;
const reducedMotion=()=>window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const ICON={
 search:'<path d="m21 21-4.3-4.3M10.8 18a7.2 7.2 0 1 1 0-14.4 7.2 7.2 0 0 1 0 14.4Z"/>',
 map:'<path d="m9 4-6 2.5v13.5l6-2.5 6 2.5 6-2.5V4l-6 2.5L9 4Zm0 0v13.5m6-11v13.5"/>',
 folder:'<path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H10l2 2.5h6.5A2.5 2.5 0 0 1 21 10v7.5a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5v-10Z"/>',
 pin:'<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.5"/>',
 help:'<circle cx="12" cy="12" r="9"/><path d="M9.6 9.4a2.5 2.5 0 0 1 4.8 1c0 1.7-2.4 2.1-2.4 3.6M12 17.2v.1"/>',
 info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.6v.1"/>',
 play:'<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 14.5v-9ZM9 20h6M12 16v4"/>',
 refresh:'<path d="M20 11a8 8 0 0 0-14.6-4.5L4 8m0-4v4h4m-4 5a8 8 0 0 0 14.6 4.5L20 16m0 4v-4h-4"/>',
 close:'<path d="m6 6 12 12M18 6 6 18"/>',
 filter:'<path d="M4 6h16M7 12h10m-7 6h4"/>',
 plus:'<path d="M12 5v14M5 12h14"/>',minus:'<path d="M5 12h14"/>',
 fit:'<path d="M4 9V4h5m6 0h5v5m0 6v5h-5m-6 0H4v-5"/>',
 arrow:'<path d="M5 12h14m-5-5 5 5-5 5"/>',back:'<path d="M19 12H5m5-5-5 5 5 5"/>',
 empty:'<path d="M4 8.5 12 4l8 4.5v7L12 20l-8-4.5v-7Z"/><path d="m4 8.5 8 4.5 8-4.5M12 13v7"/>',
 list:'<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>'
};
const icon=(name,cls='')=>'<svg class="almox-ico '+cls+'" viewBox="0 0 24 24" aria-hidden="true" focusable="false">'+ICON[name]+'</svg>';

const category=x=>{
 const s=norm(x);
 if(/RADIO|TRANSCEPTOR|COMUNICACAO|ANTENA/.test(s))return 'Radiocomunicação';
 if(/CAMERA|CFTV|GRAVADOR|VIDEOMONITORAMENTO/.test(s))return 'Videomonitoramento';
 if(/COMPUTADOR|IMPRESSORA|NOTEBOOK|MONITOR|SWITCH|NOBREAK|SERVIDOR|PERIFERICO|APPLIANCE|CABO DE REDE|CARTUCHO/.test(s))return 'Informática e redes';
 if(/LOUSA|SUPORTE|ARMARIO|MOBILIARIO|CADEIRA|MESA|TELA/.test(s))return 'Equipamentos e mobiliário';
 return 'Outros materiais';
};
function formatProcStatus(raw){
 if(!raw)return 'Não informada';
 return String(raw).replaceAll('_',' ').toLowerCase().replace(/^./,s=>s.toUpperCase());
}
const statusTone=raw=>/HOMOLOG|CONCLU|FINALIZ/.test(norm(raw))?'ok':/ANDAMENTO|TRAMIT|ABERT/.test(norm(raw))?'progress':'neutral';
const rpmLabel=n=>n?n+'ª RPM':'Sem RPM';
const regionOf=n=>n===null?null:n<=3?'RMBH':String(n);
const regionInfo=id=>REGIOES.find(r=>r.id===id);
function numRpm(n){return Number.isInteger(n)&&n>=1&&n<=19?n:null;}
function normalize(row){
 const rpm=row.rpm===null||row.rpm===undefined?null:numRpm(Number(row.rpm));
 const r={id:String(row.chave_origem||''),rpm,ano:Number(row.ano)||null,
  documento:String(row.documento_repasse||''),processo:String(row.processo_origem||''),
  processoIdentificado:String(row.processo_identificado||''),
  descricao:String(row.material_descricao||'Não informado'),
  destino:String(row.unidade_destinataria||'Não informado'),
  valor:row.valor_ripc===null||row.valor_ripc===undefined?null:Number(row.valor_ripc),tipo:category(row.material_descricao),
  statusProcesso:String(row.situacao_processo||''),
  entrega:row.situacao_entrega?String(row.situacao_entrega):null,
  quantidade:row.quantidade===null||row.quantidade===undefined?null:Number(row.quantidade),
  dataAquisicao:row.data_aquisicao||null,dataRegistro:String(row.data_registro||''),
  validacao:String(row.validacao_origem||''),chaveRepasse:String(row.chave_repasse||''),
  atualizado:String(row.atualizado_em||'')};
 // Chave do processo: evita contar duas vezes um processo destinado a várias unidades.
 r.procKey=r.processoIdentificado?'P:'+r.processoIdentificado:r.processo?'O:'+r.processo:'';
 r.procLabel=r.processoIdentificado||(r.processo?'Processo '+r.processo:'Sem processo identificado');
 const reg=regionOf(rpm),info=reg?regionInfo(reg):null;
 r.hay=norm([r.id.split('|').pop(),r.processo,r.processoIdentificado,r.descricao,r.destino,r.documento,'DOC '+r.documento,r.tipo,
  formatProcStatus(r.statusProcesso),rpm?rpm+'ª RPM RPM '+rpm:'SEM RPM',reg==='RMBH'?'RMBH':'',info?.sede||''].join(' '));
 return r;
}

async function loadMap(force=false){
 if(state.geoStatus==='loading'||(state.geoStatus==='ready'&&!force))return false;
 state.geoStatus='loading';
 const [schematic,stateBorder]=await Promise.allSettled([
   fetch('./assets/maps/rpm-regioes-aproximadas.json',{cache:'no-store'}).then(async res=>{
     if(!res.ok)throw Error('Regiões não disponíveis: '+res.status);
     const d=await res.json();
     if(d.viewBox!=='0 0 900 737'||Object.keys(d.polygons||{}).length!==17||
       REGION_IDS.some(id=>!/^M[0-9,\s]+Z$/.test(d.polygons[id]||'')||
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
 if(document.getElementById('almox-panel'))refresh();
 try{
  const [data]=await Promise.all([
   rest('/rest/v1/sig_almox_destinacoes?select=chave_origem,chave_repasse,ano,documento_repasse,processo_origem,processo_identificado,material_descricao,unidade_destinataria,rpm,valor_ripc,data_registro,situacao_processo,validacao_origem,quantidade,situacao_entrega,data_aquisicao,atualizado_em&order=chave_origem.asc&limit=2000'),
   loadMap()
  ]);
  if(!Array.isArray(data))throw Error('A consulta protegida de destinações não retornou uma lista.');
  const mapped=data.map(normalize);
  if(new Set(mapped.map(x=>x.id)).size!==mapped.length||mapped.some(x=>!x.id))throw Error('Registros RIPC duplicados ou inválidos.');
  state.registros=mapped;
  state.snapshot=mapped.map(x=>x.atualizado.slice(0,10)).filter(Boolean).sort().pop()||'';
  state.phase='ready';
 }catch(e){state.registros=[];state.phase='error';state.error=e.message||String(e);}
 return true;
}
function isLoaded(){return state.phase!=='idle';}
function reset(){
 Object.assign(state,FILTER_DEFAULTS,{phase:'idle',registros:[],error:'',snapshot:'',page:1,sortKey:'registro',sortDir:'desc',
  zoom:1,tx:0,ty:0,more:false,tab:'map',present:false,fsRequested:false});
}

// ——— Consulta ———
function belongs(x,selected=state.selected,sub=state.subrpm){
 if(selected===null)return true;
 if(selected==='CLASSIFIED')return x.rpm!==null;
 if(selected==='UNCLASSIFIED')return x.rpm===null;
 if(selected==='RMBH')return [1,2,3].includes(x.rpm)&&(sub==='TODOS'||String(x.rpm)===sub);
 return x.rpm===Number(selected);
}
// "12ª RPM", "12a rpm" ou "rpm 12" viram filtro exato de RPM. Números isolados só casam no
// início de um número (com zeros à esquerda): "52" acha "000052/2026", mas "12" não acha "1250071".
function tokens(){
 let rpm=null;
 const s=norm(state.q).replace(/\b(?:(\d{1,2})\s*[AO]?\s*RPM|RPM\s*(\d{1,2}))\b/,(m,a,b)=>{const n=numRpm(Number(a||b));if(n===null)return m;rpm=n;return ' ';});
 const words=s.split(/\s+/).filter(Boolean).map(w=>/^\d+$/.test(w)?{re:new RegExp('(^|\\D)0*'+(w.replace(/^0+(?=\d)/,''))+(w.length>=4?'':'(?!\\d)'))}:{s:w});
 return {rpm,words};
}
function matches(x,t=tokens(),skipDestination=false){
 return (state.year==='TODOS'||String(x.ano)===state.year)&&
  (state.status==='TODOS'||(state.status==='NAO_INFORMADA'?!x.statusProcesso:x.statusProcesso===state.status))&&
  (state.type==='TODOS'||x.tipo===state.type)&&
  (skipDestination||state.destination==='TODOS'||x.destino===state.destination)&&
  (t.rpm===null||x.rpm===t.rpm)&&t.words.every(w=>w.re?w.re.test(x.hay):x.hay.includes(w.s));
}
const SORTERS={
 processo:(a,b)=>a.procLabel.localeCompare(b.procLabel,'pt-BR',{numeric:true}),
 material:(a,b)=>a.descricao.localeCompare(b.descricao,'pt-BR'),
 destino:(a,b)=>a.destino.localeCompare(b.destino,'pt-BR',{numeric:true}),
 valor:(a,b)=>(a.valor??-Infinity)-(b.valor??-Infinity),
 situacao:(a,b)=>formatProcStatus(a.statusProcesso).localeCompare(formatProcStatus(b.statusProcesso),'pt-BR'),
 registro:(a,b)=>a.dataRegistro.localeCompare(b.dataRegistro)||a.id.localeCompare(b.id)
};
function filtered(){
 const t=tokens(),dir=state.sortDir==='asc'?1:-1,cmp=SORTERS[state.sortKey]||SORTERS.registro;
 return state.registros.filter(x=>belongs(x)&&matches(x,t)).sort((a,b)=>dir*cmp(a,b)||a.id.localeCompare(b.id));
}
const filtersActive=()=>state.year!=='TODOS'||state.status!=='TODOS'||state.type!=='TODOS'||state.destination!=='TODOS'||!!state.q.trim();
// Contagem por área do mapa respeitando busca e filtros (exceto a região e a unidade, que são locais).
function regionCounts(){
 const t=tokens(),counts=new Map(REGION_IDS.map(id=>[id,0])),sub={1:0,2:0,3:0};
 for(const x of state.registros){
  if(x.rpm===null||!matches(x,t,true))continue;
  const id=regionOf(x.rpm);counts.set(id,counts.get(id)+1);
  if(x.rpm<=3)sub[x.rpm]++;
 }
 return {counts,sub};
}
const unique=a=>[...new Set(a)].sort((x,y)=>String(x).localeCompare(String(y),'pt-BR',{numeric:true}));
function summary(list){
 const procs=new Set(list.map(x=>x.procKey).filter(Boolean));
 const withValue=list.filter(x=>x.valor!==null);
 return {records:list.length,procs:procs.size,total:withValue.reduce((s,x)=>s+x.valor,0),hasValue:withValue.length>0};
}
function selectionTitle(){
 const s=state.selected;
 if(s===null)return ['Todas as aquisições registradas','Todos os registros de destinação RIPC, com e sem RPM identificada'];
 if(s==='CLASSIFIED')return ['Aquisições com RPM identificada','Registros cuja unidade destinatária cita a RPM expressamente'];
 if(s==='UNCLASSIFIED')return ['Registros sem RPM identificada','Destino genérico (ex.: PMMG, DTS) ou sem menção expressa à RPM — não classificados por inferência'];
 if(s==='RMBH')return state.subrpm==='TODOS'?['Aquisições destinadas à RMBH','Consolidação das 1ª, 2ª e 3ª RPM, individualizadas na fonte']:
  ['Aquisições destinadas à '+state.subrpm+'ª RPM','Região Metropolitana de Belo Horizonte'];
 const r=regionInfo(s);return ['Aquisições destinadas à '+(r?.nome||'RPM'),r?.sede||''];
}

// ——— Renderização ———
function option(value,label,current){return '<option value="'+escape(value)+'"'+(value===current?' selected':'')+'>'+escape(label)+'</option>';}
function regionValue(){return state.selected===null?'':state.selected==='RMBH'&&state.subrpm!=='TODOS'?'RMBH:'+state.subrpm:state.selected;}
function regionSelect(){
 const {counts,sub}=regionCounts(),cur=regionValue(),n=v=>state.phase==='ready'?' ('+v+')':'';
 return '<select id="almox-region" aria-label="Região da Polícia Militar">'+
  option('','Todas as regiões',cur)+option('CLASSIFIED','Com RPM identificada',cur)+option('UNCLASSIFIED','Sem RPM identificada',cur)+
  '<optgroup label="Regiões da Polícia Militar">'+
  option('RMBH','RMBH — 1ª, 2ª e 3ª RPM'+n(counts.get('RMBH')),cur)+
  ['1','2','3'].map(k=>option('RMBH:'+k,k+'ª RPM — RMBH'+n(sub[k]),cur)).join('')+
  REGIOES.slice(1).map(r=>option(r.id,r.nome+' — '+r.sede+n(counts.get(r.id)),cur)).join('')+
  '</optgroup></select>';
}
function filtersHtml(){
 const all=state.registros,scope=all.filter(x=>belongs(x));
 const years=unique(all.map(x=>x.ano).filter(Boolean)).map(String),
  statuses=unique(all.map(x=>x.statusProcesso).filter(Boolean)),
  types=unique(all.map(x=>x.tipo)),destinations=unique(scope.map(x=>x.destino));
 const hidden=[state.year,state.status,state.type,state.destination].filter(v=>v!=='TODOS').length;
 // Rótulo visível só quando o valor não é o padrão; a primeira opção já descreve o filtro.
 const field=(label,html,cls='',on=false)=>'<label class="almox-field '+cls+(on?' is-on':'')+'"><span>'+label+'</span>'+html+'</label>';
 return field('Região',regionSelect(),'is-region',state.selected!==null)+
  field('Ano','<select id="almox-year">'+option('TODOS','Todos os anos',state.year)+years.map(y=>option(y,y,state.year)).join('')+'</select>','is-secondary',state.year!=='TODOS')+
  field('Situação do processo','<select id="almox-status">'+option('TODOS','Todas as situações',state.status)+statuses.map(s=>option(s,formatProcStatus(s),state.status)).join('')+option('NAO_INFORMADA','Situação não informada',state.status)+'</select>','is-secondary',state.status!=='TODOS')+
  field('Tipo de material','<select id="almox-type">'+option('TODOS','Todos os tipos',state.type)+types.map(t=>option(t,t,state.type)).join('')+'</select>','is-secondary',state.type!=='TODOS')+
  '<button type="button" class="almox-more-btn" id="almox-more" data-almox="more" aria-expanded="'+state.more+'" aria-controls="almox-more-panel">'+icon('filter')+
  '<span class="d-only">Mais filtros</span><span class="m-only">Filtros</span>'+
  (state.destination!=='TODOS'?'<b class="d-only">1</b>':'')+(hidden?'<b class="m-only">'+hidden+'</b>':'')+'</button>'+
  '<div class="almox-more-panel" id="almox-more-panel"'+(state.more?'':' hidden')+'>'+
  field('Unidade destinatária','<select id="almox-destination">'+option('TODOS','Todas as unidades destinatárias',state.destination)+destinations.map(d=>option(d,d,state.destination)).join('')+'</select>','is-destination')+
  '</div>';
}
function chipsHtml(){
 const list=state.phase==='ready'?filtered():[],chips=[];
 if(state.selected!==null)chips.push(['region','Região: '+(state.selected==='RMBH'&&state.subrpm!=='TODOS'?state.subrpm+'ª RPM':state.selected==='CLASSIFIED'?'com RPM':state.selected==='UNCLASSIFIED'?'sem RPM':regionInfo(state.selected)?.nome)]);
 if(state.q.trim())chips.push(['q','Busca: “'+state.q.trim()+'”']);
 if(state.year!=='TODOS')chips.push(['year','Ano: '+state.year]);
 if(state.status!=='TODOS')chips.push(['status','Situação: '+formatProcStatus(state.status==='NAO_INFORMADA'?'':state.status)]);
 if(state.type!=='TODOS')chips.push(['type','Tipo: '+state.type]);
 if(state.destination!=='TODOS')chips.push(['destination','Unidade: '+state.destination]);
 const count=state.phase==='ready'?'<span class="almox-result-count"><b>'+list.length.toLocaleString('pt-BR')+'</b> '+(list.length===1?'resultado':'resultados')+'</span>':'';
 return count+chips.map(([k,l])=>'<button type="button" class="almox-chip" data-almox="chip:'+k+'" aria-label="Remover filtro '+escape(l)+'">'+escape(l)+icon('close')+'</button>').join('')+
  (chips.length?'<button type="button" class="almox-clear" data-almox="clear">Limpar tudo</button>':'');
}
function kpisHtml(){
 const ready=state.phase==='ready',a=state.registros,classified=a.filter(x=>x.rpm!==null);
 const rpms=new Set(classified.map(x=>x.rpm)).size,procs=new Set(a.map(x=>x.procKey).filter(Boolean)).size;
 const v=n=>ready?n.toLocaleString('pt-BR'):'—';
 const card=(tag,attrs,ico,label,value,hint,tone)=>'<'+tag+' class="almox-kpi tone-'+tone+'" '+attrs+'><span class="almox-kpi-ico">'+icon(ico)+'</span>'+
  '<span class="almox-kpi-body"><span class="almox-kpi-label">'+label+'</span><strong>'+value+'</strong><small>'+hint+'</small></span>'+
  (tag==='button'?icon('arrow','almox-kpi-go'):'')+'</'+tag+'>';
 return card('div','','map','RPMs representadas',ready?rpms+'<em> de 19</em>':'—','Com ao menos uma destinação','gold')+
  card('div','','folder','Processos de aquisição',v(procs),'Identificados, sem duplicar compartilhados','blue')+
  card('button','type="button" data-action="almoxPick" data-rpm="CLASSIFIED"'+(ready?'':' disabled'),'pin','Destinações vinculadas a RPM',v(classified.length),ready?'de '+plural(a.length,'registro','registros')+' RIPC · ver lista':'Registros RIPC','green')+
  card('button','type="button" data-action="almoxPick" data-rpm="UNCLASSIFIED"'+(ready?'':' disabled'),'help','Sem classificação territorial',v(a.length-classified.length),'Destino sem RPM expressa · ver lista','amber');
}
function boundary(){
 if(!state.geo)return {path:'',project:()=>[0,0]};
 const coords=[],geometry=state.geo.type==='Polygon'?[state.geo.coordinates]:state.geo.coordinates;
 geometry.forEach(poly=>poly.forEach(ring=>ring.forEach(c=>{if(Array.isArray(c)&&Number.isFinite(c[0])&&Number.isFinite(c[1]))coords.push(c);})));
 if(!coords.length)return {path:'',project:()=>[0,0]};
 const lons=coords.map(p=>p[0]),lats=coords.map(p=>p[1]);
 const minx=Math.min(...lons),maxx=Math.max(...lons),miny=Math.min(...lats),maxy=Math.max(...lats);
 const margin=54,W=760,H=570,scale=Math.min((W-2*margin)/(maxx-minx),(H-2*margin)/(maxy-miny));
 const ox=(W-(maxx-minx)*scale)/2,oy=(H-(maxy-miny)*scale)/2;
 const project=([x,y])=>[ox+(x-minx)*scale,oy+(maxy-y)*scale];
 const path=geometry.map(poly=>poly.map(ring=>ring.map((c,i)=>{const xy=project(c);return(i?'L':'M')+xy.map(x=>x.toFixed(1)).join(',')}).join(' ')+' Z').join(' ')).join(' ');
 return {path,project};
}
function mapSvg(){
 const t=state.territory;
 if(t){
  const regions=REGIOES.map(r=>'<path class="almox-rpm-region" d="'+escape(t.polygons[r.id])+'" fill="'+r.cor+'" data-action="almoxPick" data-rpm="'+r.id+
   '" role="button" tabindex="0" aria-label="'+escape(r.nome+', '+r.sede)+'"></path>').join('');
  const labels=REGIOES.map(r=>{const [x,y]=t.centers[r.id],txt=r.id==='RMBH'?'RMBH':r.id+'ª',bx=r.id==='RMBH'?40:26;
   return '<g class="almox-rpm-label" data-region-label="'+r.id+'" transform="translate('+x+' '+y+')">'+
    '<text class="almox-lbl" text-anchor="middle" dy="8">'+txt+'</text>'+
    '<g class="almox-badge" transform="translate('+bx+' -20)"><circle r="14"/><text text-anchor="middle" dy="5">0</text></g></g>';}).join('');
  return '<svg id="almox-map-svg" viewBox="0 0 900 737" xmlns="http://www.w3.org/2000/svg" role="group" aria-label="Mapa ilustrativo com 17 áreas selecionáveis: RMBH e 4ª a 19ª RPM">'+
   '<defs><filter id="almox-map-shadow" x="-5%" y="-5%" width="110%" height="110%"><feDropShadow dx="0" dy="4" stdDeviation="7" flood-color="#2a2518" flood-opacity=".16"/></filter></defs>'+
   '<g id="almox-map-transform"><g class="almox-regions" filter="url(#almox-map-shadow)">'+regions+'</g>'+
   '<path id="almox-sel-outline" d="" aria-hidden="true"/><g class="almox-labels" aria-hidden="true">'+labels+'</g></g></svg>';
 }
 if(state.geo){
  const b=boundary();
  const pins=REGIOES.map(r=>{const [x,y]=b.project([r.lon,r.lat]);
   return '<g class="almox-map-pin" data-action="almoxPick" data-rpm="'+r.id+'" role="button" tabindex="0" aria-label="'+escape(r.nome+', '+r.sede)+'" transform="translate('+x.toFixed(1)+' '+y.toFixed(1)+')">'+
    '<circle class="almox-pin-disc" r="14" fill="'+r.cor+'"/><text text-anchor="middle" dy="4">'+(r.id==='RMBH'?'BH':r.id)+'</text></g>';}).join('');
  return '<svg id="almox-map-svg" class="is-fallback" viewBox="0 0 760 570" xmlns="http://www.w3.org/2000/svg" role="group" aria-label="Contorno estadual com marcadores das sedes regionais">'+
   '<g id="almox-map-transform"><path class="almox-state-outline" d="'+escape(b.path)+'"/>'+pins+'</g></svg>';
 }
 return '<div class="almox-map-wait">'+(state.geoStatus==='error'?icon('map')+'<p>Camada cartográfica indisponível.<br>Use o seletor <b>Região</b> acima.</p>':'<span class="almox-spinner"></span><p>Carregando o mapa das regiões…</p>')+'</div>';
}
function mapHtml(){
 return '<section class="almox-map-card" aria-labelledby="almox-map-title">'+
  '<header class="almox-map-head"><div><h2 id="almox-map-title">Mapa das RPM</h2><p>Selecione uma região para listar suas aquisições</p></div>'+
  '<div class="almox-map-tools" role="group" aria-label="Controles do mapa">'+
  '<button type="button" data-action="almoxZoomIn" aria-label="Aproximar mapa" title="Aproximar">'+icon('plus')+'</button>'+
  '<button type="button" data-action="almoxZoomOut" aria-label="Afastar mapa" title="Afastar">'+icon('minus')+'</button>'+
  '<button type="button" data-action="almoxZoomReset" aria-label="Reenquadrar mapa" title="Reenquadrar">'+icon('fit')+'</button></div></header>'+
  '<div class="almox-map-stage" id="almox-map-stage">'+mapSvg()+'<div class="almox-map-tip" id="almox-map-tip" hidden></div>'+
  (state.territory?'<div class="almox-map-legend" aria-hidden="true"><i class="lg-badge">3</i> registros encontrados<i class="lg-sel"></i> selecionada</div>':'')+'</div>'+
  '<p class="almox-map-note">'+icon('info')+'<span><b>Divisões aproximadas e ilustrativas</b>, sem valor oficial. O filtro usa a RPM cadastrada no registro, não a posição no mapa.'+
  '<span class="d-only"> Ctrl + roda do mouse amplia.</span></span></p></section>';
}
function tabsHtml(){
 const n=state.phase==='ready'?filtered().length:0;
 return '<button type="button" role="tab" data-almox="tab:map" aria-selected="'+(state.tab==='map')+'">'+icon('map')+'Mapa</button>'+
  '<button type="button" role="tab" data-almox="tab:list" aria-selected="'+(state.tab==='list')+'">'+icon('list')+'Resultados <b>'+n+'</b></button>';
}
function statusPill(raw){return '<span class="almox-status tone-'+statusTone(raw)+'">'+escape(formatProcStatus(raw))+'</span>';}
function sortTh(key,label,cls=''){
 const on=state.sortKey===key,dir=on?(state.sortDir==='asc'?'ascending':'descending'):'none';
 return '<th class="'+cls+'" aria-sort="'+dir+'"><button type="button" id="almox-sort-'+key+'" data-almox="sort:'+key+'">'+label+
  '<i aria-hidden="true">'+(on?(state.sortDir==='asc'?'▲':'▼'):'↕')+'</i></button></th>';
}
function emptyHtml(){
 if(state.phase==='idle')return '<div class="almox-state">'+icon('empty')+'<h3>Consulta institucional indisponível neste ambiente</h3>'+
  '<p>No modo demonstração nenhuma aquisição real é exibida e nenhum dado fictício é apresentado como oficial. Entre no SIG institucional para consultar.</p></div>';
 if(state.phase==='loading')return '<div class="almox-skeleton" aria-label="Carregando registros">'+'<div></div>'.repeat(6)+'</div>';
 if(state.phase==='error')return '<div class="almox-state is-error" role="alert">'+icon('info')+'<h3>Não foi possível consultar os registros</h3><p>'+escape(state.error)+'</p>'+
  '<button type="button" class="almox-btn" data-action="almoxReload">'+icon('refresh')+'Tentar novamente</button></div>';
 const regionHasData=state.registros.some(x=>belongs(x));
 if(!regionHasData&&!filtersActive())return '<div class="almox-state">'+icon('empty')+'<h3>Sem destinações registradas para esta região</h3>'+
  '<p>Nenhum registro RIPC cita expressamente esta RPM na unidade destinatária. Registros sem RPM não são atribuídos por inferência.</p>'+
  '<button type="button" class="almox-btn" data-almox="chip:region">Ver todas as regiões</button></div>';
 return '<div class="almox-state">'+icon('search')+'<h3>Nenhuma aquisição encontrada</h3><p>Nenhum registro atende à busca e aos filtros atuais. Revise os termos ou remova filtros.</p>'+
  '<button type="button" class="almox-btn" data-almox="clear-filters">Limpar busca e filtros</button></div>';
}
function resultsHtml(){
 const [title,sub]=selectionTitle(),ready=state.phase==='ready',list=ready?filtered():[],s=summary(list);
 const totalPages=Math.max(1,Math.ceil(list.length/state.pageSize));
 if(state.page>totalPages)state.page=totalPages;
 const start=(state.page-1)*state.pageSize,page=list.slice(start,start+state.pageSize);
 let html='<header class="almox-results-head"><div><span class="almox-eyebrow">Consulta por destino</span><h2>'+escape(title)+'</h2><p>'+escape(sub)+'</p></div>'+
  '<button type="button" class="almox-back m-only" data-almox="tab:map">'+icon('back')+'Mapa</button></header>';
 if(state.selected==='RMBH'&&ready){
  const {sub:sc}=regionCounts();
  html+='<div class="almox-seg" role="group" aria-label="Filtrar RPM da RMBH">'+[['TODOS','1ª + 2ª + 3ª',sc[1]+sc[2]+sc[3]],['1','1ª RPM',sc[1]],['2','2ª RPM',sc[2]],['3','3ª RPM',sc[3]]]
   .map(([k,l,c])=>'<button type="button" data-almox="sub:'+k+'" aria-pressed="'+(state.subrpm===k)+'">'+l+' <b>'+c+'</b></button>').join('')+'</div>';
 }
 if(ready&&list.length){
  html+='<div class="almox-summary">'+
   '<div><strong>'+s.records.toLocaleString('pt-BR')+'</strong><span>'+(s.records===1?'registro de destinação':'registros de destinação')+'</span></div>'+
   '<div><strong>'+s.procs.toLocaleString('pt-BR')+'</strong><span>'+(s.procs===1?'processo de compra':'processos de compra')+'</span></div>'+
   '<div class="is-money" title="Soma das linhas de destinação RIPC listadas. Não é o valor total das compras."><strong>'+(s.hasValue?brMoney(s.total):'—')+'</strong><span>soma das destinações RIPC</span></div></div>';
  const row=x=>{const rec=escape(encodeURIComponent(x.id));
   return '<tr class="almox-row" data-action="almoxDetail" data-record="'+rec+'">'+
    '<td data-label="Processo"><strong class="almox-proc">'+escape(x.procLabel)+'</strong><small>Doc. repasse '+escape(x.documento||'—')+'</small>'+statusPill(x.statusProcesso)+'</td>'+
    '<td data-label="Material" class="almox-mat"><b>'+escape(x.descricao)+'</b><small>'+escape(x.tipo)+'</small></td>'+
    '<td data-label="Unidade destinatária"><span class="almox-dest">'+escape(x.destino)+'</span><span class="almox-rpm-tag'+(x.rpm?'':' is-none')+'">'+escape(rpmLabel(x.rpm))+'</span></td>'+
    '<td data-label="Valor RIPC" class="almox-num">'+escape(brMoney(x.valor))+'</td>'+
    '<td class="almox-act"><button type="button" class="almox-view" data-action="almoxDetail" data-record="'+rec+'" aria-label="Ver detalhes: '+escape(x.descricao+' — '+x.procLabel)+'" title="Ver detalhes"><span class="m-only">Ver detalhes</span>'+icon('arrow')+'</button></td></tr>';};
  html+='<div class="almox-table-wrap"><table class="almox-table"><caption class="sr-only">'+escape(title)+'</caption><thead><tr>'+
   sortTh('processo','Processo')+sortTh('material','Material')+sortTh('destino','Unidade destinatária')+sortTh('valor','Valor RIPC','almox-num')+
   '<th class="almox-act"><span class="sr-only">Ações</span></th></tr></thead><tbody>'+page.map(row).join('')+'</tbody></table></div>'+
   '<footer class="almox-pager"><span>Mostrando <b>'+(start+1)+'–'+(start+page.length)+'</b> de <b>'+list.length+'</b></span>'+
   (totalPages>1?'<div><button type="button" data-action="almoxPrev" '+(state.page===1?'disabled':'')+' aria-label="Página anterior">‹</button>'+
   '<span>'+state.page+' / '+totalPages+'</span>'+
   '<button type="button" data-action="almoxNext" '+(state.page===totalPages?'disabled':'')+' aria-label="Próxima página">›</button></div>':'')+'</footer>'+
   '<p class="almox-table-note">Valor RIPC = valor de destinação, não o valor total da compra. Entrega e quantidade: sem dados na fonte.</p>';
 }else html+=emptyHtml();
 return html;
}
function aboutHtml(){
 return '<details class="almox-about"><summary>'+icon('info')+'<span><b>'+(state.snapshot?'Base importada em '+asDate(state.snapshot):'Fotografia importada da planilha')+'</b> — retrato histórico, sem sincronização em tempo real.</span><em>Sobre os dados</em></summary>'+
  '<ul><li><b>Origem:</b> planilha “agora vai – PLANILHA ATUAL”, abas DESTINACAO_REPASSES (RIPC) e CONTROLE_PROCESSOS_COMPRA.</li>'+
  '<li><b>RPM:</b> atribuída somente quando a unidade destinatária cita a RPM expressamente. Destinos genéricos ficam “sem RPM”.</li>'+
  '<li><b>Valor:</b> é o valor da destinação RIPC — não o valor total da licitação, contrato ou compra. Não há rateio automático.</li>'+
  '<li><b>Entrega:</b> “OK” na validação RIPC não comprova entrega. Quantidade, entrega e recebimento só aparecem com fonte específica.</li>'+
  '<li><b>“Atualizar”</b> relê o banco; não reimporta a planilha.</li></ul></details>';
}
function view(authorized=true){
 if(!authorized)return '<section class="card section"><h2>Almoxarifado</h2><p>Acesso não autorizado para este perfil.</p></section>';
 return '<div class="almox-page'+(state.present?' is-presenting':'')+'">'+
  '<header class="almox-hero"><div><span class="almox-eyebrow">Logística · CSA-TIC</span><h1>Almoxarifado</h1>'+
  '<p>Aquisições destinadas às Regiões da Polícia Militar de Minas Gerais.</p></div>'+
  '<div class="almox-hero-actions">'+(state.present?
   '<button type="button" class="almox-btn is-dark" data-almox="present">'+icon('close')+'Sair da apresentação</button>':
   '<button type="button" class="almox-btn" data-almox="present" title="Prioriza mapa e indicadores para reuniões">'+icon('play')+'<span>Modo apresentação</span></button>'+
   '<button type="button" class="almox-btn" data-action="almoxReload" title="Reler a base protegida">'+icon('refresh')+'<span>Atualizar</span></button>')+'</div></header>'+
  '<div class="almox-kpis">'+kpisHtml()+'</div>'+aboutHtml()+
  '<section class="almox-toolbar" role="search" aria-label="Pesquisar e filtrar aquisições">'+
  '<div class="almox-search">'+icon('search')+'<input type="search" id="almox-q" placeholder="Buscar material, processo, documento, unidade ou RPM…" value="'+escape(state.q)+'" autocomplete="off" aria-label="Pesquisar aquisições"><kbd class="d-only" title="Atalho">/</kbd></div>'+
  '<div class="almox-filters'+(state.more?' is-open':'')+'" id="almox-filters">'+filtersHtml()+'</div></section>'+
  '<div class="almox-chips" id="almox-chips">'+chipsHtml()+'</div>'+
  '<div class="almox-tabs" id="almox-tabs" role="tablist" aria-label="Alternar entre mapa e resultados">'+tabsHtml()+'</div>'+
  '<div class="almox-layout" id="almox-layout" data-tab="'+state.tab+'">'+mapHtml()+
  '<section class="almox-data-card" id="almox-panel" aria-live="polite" aria-busy="'+(state.phase==='loading')+'">'+resultsHtml()+'</section></div>'+
  '</div>';
}
function refresh(){
 if(!document.querySelector('.almox-page'))return;
 const focus=document.activeElement?.id;
 const set=(id,html)=>{const e=document.getElementById(id);if(e)e.innerHTML=html;};
 set('almox-filters',filtersHtml());set('almox-chips',chipsHtml());set('almox-tabs',tabsHtml());set('almox-panel',resultsHtml());
 document.getElementById('almox-panel')?.setAttribute('aria-busy',String(state.phase==='loading'));
 document.getElementById('almox-layout')?.setAttribute('data-tab',state.tab);
 document.getElementById('almox-filters')?.classList.toggle('is-open',state.more);
 const q=document.getElementById('almox-q');if(q&&q.value!==state.q)q.value=state.q;
 updateMap();
 if(focus&&focus!=='almox-q'){const f=document.getElementById(focus);if(f&&f!==document.activeElement)f.focus({preventScroll:true});}
}
function rerender(){
 const page=document.querySelector('.almox-page');if(!page)return;
 page.outerHTML=view(true);afterRender();
}
function updateMap(){
 const svg=document.getElementById('almox-map-svg');if(!svg)return;
 const {counts}=regionCounts(),sel=state.selected,regionSel=REGION_IDS.includes(sel),active=filtersActive(),ready=state.phase==='ready';
 svg.classList.toggle('has-selection',regionSel);
 svg.querySelectorAll('[data-rpm]').forEach(el=>{
  const id=el.dataset.rpm,c=counts.get(id)||0,r=regionInfo(id);
  el.classList.toggle('selected',sel===id);
  el.classList.toggle('is-empty',ready&&active&&!c);
  el.setAttribute('aria-pressed',String(sel===id));
  el.setAttribute('aria-label',r.nome+', '+r.sede+(ready?', '+plural(c,'registro','registros'):''));
 });
 svg.querySelectorAll('[data-region-label]').forEach(g=>{
  const id=g.dataset.regionLabel,c=counts.get(id)||0;
  g.classList.toggle('selected',sel===id);g.classList.toggle('has-count',ready&&c>0);
  const t=g.querySelector('.almox-badge text');if(t)t.textContent=c>99?'99+':String(c);
 });
 const outline=document.getElementById('almox-sel-outline');
 if(outline)outline.setAttribute('d',regionSel&&state.territory?state.territory.polygons[sel]:'');
}

// ——— Ações ———
function pick(rpm){
 if(!['CLASSIFIED','UNCLASSIFIED',...REGION_IDS].includes(rpm))return;
 // Novo clique na mesma área do mapa volta à visão geral.
 if(REGION_IDS.includes(rpm)&&state.selected===rpm&&state.subrpm==='TODOS'&&!(isMobile()&&state.tab==='map'))state.selected=null;
 else state.selected=rpm;
 state.subrpm='TODOS';state.destination='TODOS';state.page=1;
 if(isMobile()){state.tab='list';document.getElementById('almox-tabs')?.scrollIntoView({block:'start',behavior:reducedMotion()?'auto':'smooth'});}
 refresh();
}
function setRegion(value){
 const v=String(value||'');
 if(v.startsWith('RMBH:')&&['1','2','3'].includes(v.slice(5))){state.selected='RMBH';state.subrpm=v.slice(5);}
 else if(v===''){state.selected=null;state.subrpm='TODOS';}
 else if(['CLASSIFIED','UNCLASSIFIED',...REGION_IDS].includes(v)){state.selected=v;state.subrpm='TODOS';}
 else return;
 state.destination='TODOS';state.page=1;refresh();
}
function clearFilters(keepRegion){
 const {selected,subrpm}=state;Object.assign(state,FILTER_DEFAULTS);
 if(keepRegion){state.selected=selected;state.subrpm=subrpm;}
 state.page=1;refresh();
}
function clear(){clearFilters(false);}
function input(id,value){
 const map={'almox-year':'year','almox-status':'status','almox-type':'type','almox-destination':'destination','almox-subrpm':'subrpm'};
 if(id==='almox-q')state.q=String(value).slice(0,140);
 else if(id==='almox-region')return setRegion(value);
 else if(map[id])state[map[id]]=String(value);
 else return;
 state.page=1;refresh();
}
function paginate(direction){
 state.page=Math.max(1,state.page+(direction==='next'?1:-1));refresh();
 document.getElementById('almox-panel')?.scrollIntoView({block:'nearest',behavior:reducedMotion()?'auto':'smooth'});
}
function setPresent(on){
 state.present=!!on;
 if(on){
  state.tab='map';state.fsRequested=false;
  try{const p=document.documentElement.requestFullscreen?.();if(p){state.fsRequested=true;p.catch(()=>{state.fsRequested=false;});}}catch{}
 }else if(document.fullscreenElement){state.fsRequested=false;document.exitFullscreen?.().catch(()=>{});}
 rerender();
 setTimeout(()=>document.querySelector('.almox-page [data-almox="present"]')?.focus({preventScroll:true}),0);
}
function uiAction(cmd){
 const [a,b]=cmd.split(':');
 if(a==='present')return setPresent(!state.present);
 if(a==='more'){state.more=!state.more;return refresh();}
 if(a==='tab'){state.tab=b==='list'?'list':'map';refresh();return document.getElementById('almox-tabs')?.scrollIntoView({block:'nearest'});}
 if(a==='sort'){if(!SORTERS[b])return;if(state.sortKey===b)state.sortDir=state.sortDir==='asc'?'desc':'asc';else{state.sortKey=b;state.sortDir=b==='valor'||b==='registro'?'desc':'asc';}state.page=1;return refresh();}
 if(a==='sub'){if(state.selected==='RMBH'&&['TODOS','1','2','3'].includes(b)){state.subrpm=b;state.page=1;refresh();}return;}
 if(a==='clear')return clear();
 if(a==='clear-filters')return clearFilters(true);
 if(a==='chip'){
  if(b==='region'){state.selected=null;state.subrpm='TODOS';state.destination='TODOS';}
  else if(b==='q'){state.q='';}
  else if(['year','status','type','destination'].includes(b))state[b]='TODOS';
  state.page=1;refresh();
  return document.getElementById(b==='q'?'almox-q':'almox-region')?.focus({preventScroll:true});
 }
}
function detail(key){
 const r=state.registros.find(x=>x.id===key);
 if(!r)return '<p>Registro indisponível ou sem autorização.</p>';
 const dot=r.chaveRepasse.split('|').pop()||'',el=dot.split('.').slice(6,8).join('.');
 const none='<span class="is-muted">Sem dados na fonte</span>';
 const sec=(ico,title,rows)=>'<section class="almox-dsec"><h3>'+icon(ico)+title+'</h3><dl>'+
  rows.map(([k,v,raw])=>'<div><dt>'+escape(k)+'</dt><dd>'+(raw?v:escape(v))+'</dd></div>').join('')+'</dl></section>';
 return '<div class="almox-detail">'+
  '<div class="almox-dhead"><div><span class="almox-rpm-tag'+(r.rpm?'':' is-none')+'">'+escape(rpmLabel(r.rpm))+'</span>'+
  '<h3>'+escape(r.descricao)+'</h3><p>'+escape(r.procLabel)+' · '+statusPill(r.statusProcesso)+'</p></div>'+
  '<div class="almox-dvalue"><small>Valor da destinação (RIPC)</small><strong>'+escape(brMoney(r.valor))+'</strong></div></div>'+
  '<div class="almox-dgrid">'+
  sec('folder','Identificação',[['Processo de compra',r.processoIdentificado||r.processo||'Não informado'],['Documento de repasse',r.documento||'Não informado'],
   ['Objeto / material',r.descricao],['Tipo (inferido da descrição)',r.tipo]])+
  sec('pin','Destino',[['RPM',r.rpm?rpmLabel(r.rpm)+(r.rpm<=3?' · RMBH':''):'Não classificada (sem menção expressa)'],['Unidade destinatária',r.destino]])+
  sec('list','Informações administrativas',[['Valor da destinação RIPC',brMoney(r.valor)],['Situação conhecida do processo',formatProcStatus(r.statusProcesso)],
   ['Data de registro RIPC',asDate(r.dataRegistro)],['Ano',r.ano||'Não informado'],['Dotação orçamentária',dot||'Não informada'],['Elemento-item',el||'—'],
   ['Validação no cadastro RIPC (não comprova entrega)',r.validacao||'Não informada'],['ID da origem RIPC',r.id]])+
  sec('empty','Informações logísticas',[['Quantidade',r.quantidade===null?none:escape(r.quantidade),true],['Entrega',r.entrega?escape(r.entrega):none,true],
   ['Data de aquisição',r.dataAquisicao?escape(asDate(r.dataAquisicao)):none,true]])+
  '</div><p class="almox-detail-note">'+icon('info')+'Este registro documenta a destinação declarada na fonte RIPC. Não comprova compra concluída, entrega ou quantitativo. '+
  'Se a aquisição abrange várias unidades, os valores não são rateados automaticamente.</p></div>';
}

// ——— Mapa: zoom, arraste, pinça, dica ———
function svgSize(svg){const vb=svg?.viewBox?.baseVal;return [vb?.width||900,vb?.height||737];}
function updateTransform(animate=false){
 const el=document.getElementById('almox-map-transform'),svg=document.getElementById('almox-map-svg');if(!el||!svg)return;
 const [W,H]=svgSize(svg),z=state.zoom;
 if(z<=1){state.tx=0;state.ty=0;}
 state.tx=clamp(state.tx,W*(1-z)-W*.2,W*.2);state.ty=clamp(state.ty,H*(1-z)-H*.2,H*.2);
 el.classList.toggle('is-animating',animate&&!reducedMotion());
 el.style.transform='translate('+state.tx.toFixed(2)+'px,'+state.ty.toFixed(2)+'px) scale('+z.toFixed(4)+')';
 svg.classList.toggle('is-zoomed',z>1);
 svg.style.touchAction=z>1?'none':'pan-y';
}
function zoomAt(factor,px,py,animate){
 const svg=document.getElementById('almox-map-svg');if(!svg)return;
 const [W,H]=svgSize(svg),x=px??W/2,y=py??H/2,z=state.zoom,nz=clamp(z*factor,1,4);
 state.tx=x-(x-state.tx)*nz/z;state.ty=y-(y-state.ty)*nz/z;state.zoom=nz;updateTransform(animate);
}
function zoom(v){zoomAt(v>0?1.35:1/1.35,null,null,true);}
function resetZoom(){state.zoom=1;state.tx=0;state.ty=0;updateTransform(true);}
function toSvg(svg,cx,cy){const r=svg.getBoundingClientRect(),[W,H]=svgSize(svg);return [(cx-r.left)*W/r.width,(cy-r.top)*H/r.height];}
function afterRender(){
 updateMap();
 const svg=document.getElementById('almox-map-svg');if(!svg||svg.dataset.ready)return;
 svg.dataset.ready='1';updateTransform();
 svg.addEventListener('wheel',e=>{
  if(!e.ctrlKey&&!e.metaKey&&state.zoom===1)return; // não sequestrar a rolagem da página
  e.preventDefault();const [x,y]=toSvg(svg,e.clientX,e.clientY);zoomAt(e.deltaY<0?1.15:1/1.15,x,y,false);
 },{passive:false});
 const pts=new Map();let drag=null,pinch=null,moved=false;
 const dist=()=>{const [a,b]=[...pts.values()];return Math.hypot(a.x-b.x,a.y-b.y)||1;};
 svg.addEventListener('pointerdown',e=>{
  pts.set(e.pointerId,{x:e.clientX,y:e.clientY});moved=false;
  if(pts.size===2){const [a,b]=[...pts.values()];pinch={d:dist(),z:state.zoom,mid:toSvg(svg,(a.x+b.x)/2,(a.y+b.y)/2)};drag=null;}
  else if(pts.size===1&&state.zoom>1)drag={px:e.clientX,py:e.clientY,tx:state.tx,ty:state.ty};
 });
 svg.addEventListener('pointermove',e=>{
  if(pts.has(e.pointerId))pts.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(pinch&&pts.size===2){e.preventDefault();moved=true;zoomAt(pinch.z*dist()/pinch.d/state.zoom,pinch.mid[0],pinch.mid[1],false);return;}
  if(drag){
   const dx=e.clientX-drag.px,dy=e.clientY-drag.py;if(!moved&&Math.hypot(dx,dy)<6)return;
   if(!moved){moved=true;try{svg.setPointerCapture?.(e.pointerId)}catch{}svg.classList.add('is-dragging');hideTip();}
   const r=svg.getBoundingClientRect(),[W,H]=svgSize(svg);
   state.tx=drag.tx+dx*W/r.width;state.ty=drag.ty+dy*H/r.height;updateTransform(false);return;
  }
  const region=e.pointerType!=='touch'&&e.target.closest?.('[data-rpm]');
  if(region)showTip(region,e);else hideTip();
 });
 const end=e=>{pts.delete(e.pointerId);if(pts.size<2)pinch=null;if(!pts.size){drag=null;svg.classList.remove('is-dragging');}};
 svg.addEventListener('pointerup',end);svg.addEventListener('pointercancel',end);
 svg.addEventListener('pointerleave',hideTip);
 // Após arrastar/pinçar, o clique não deve selecionar uma região.
 svg.addEventListener('click',e=>{if(moved){e.stopPropagation();e.preventDefault();moved=false;}},true);
 svg.addEventListener('keydown',e=>{const p=e.target.closest('[data-rpm]');if(p&&(e.key==='Enter'||e.key===' ')){e.preventDefault();pick(p.dataset.rpm);}});
 svg.addEventListener('focusin',e=>{const p=e.target.closest('[data-rpm]');if(p)showTip(p,null);});
 svg.addEventListener('focusout',hideTip);
}
function showTip(el,e){
 const tip=document.getElementById('almox-map-tip'),stage=document.getElementById('almox-map-stage');if(!tip||!stage)return;
 const r=regionInfo(el.dataset.rpm);if(!r)return;
 const c=regionCounts().counts.get(r.id)||0,sr=stage.getBoundingClientRect(),br=el.getBoundingClientRect();
 tip.innerHTML='<b>'+escape(r.id==='RMBH'?'RMBH · 1ª, 2ª e 3ª RPM':r.nome)+'</b><span>'+escape(r.sede)+'</span>'+
  (state.phase==='ready'?'<em>'+plural(c,'registro','registros')+(filtersActive()?' com os filtros':'')+'</em>':'');
 tip.hidden=false;
 const x=e?e.clientX-sr.left:br.left+br.width/2-sr.left,y=e?e.clientY-sr.top:br.top+br.height/2-sr.top;
 const w=tip.offsetWidth,h=tip.offsetHeight;
 tip.style.left=clamp(x-w/2,6,sr.width-w-6)+'px';tip.style.top=(y-h-14<6?y+18:y-h-14)+'px';
}
function hideTip(){const t=document.getElementById('almox-map-tip');if(t)t.hidden=true;}

// Controles próprios do módulo (data-almox): somente interface, sem leitura ou escrita de dados.
document.addEventListener('click',e=>{
 const el=e.target.closest?.('[data-almox]');
 if(el&&el.closest('.almox-page'))uiAction(el.dataset.almox);
});
document.addEventListener('change',e=>{if(e.target?.id==='almox-region'&&e.target.closest('.almox-page'))setRegion(e.target.value);});
document.addEventListener('keydown',e=>{
 if(!document.querySelector('.almox-page'))return;
 const typing=/^(INPUT|SELECT|TEXTAREA)$/.test(e.target?.tagName||'')||e.target?.isContentEditable;
 const modal=document.getElementById('modal-root')?.childElementCount;
 if(e.key==='/'&&!typing&&!modal){e.preventDefault();document.getElementById('almox-q')?.focus();}
 if(e.key==='Escape'&&!modal){
  if(e.target?.id==='almox-q'&&state.q){state.q='';state.page=1;refresh();return;}
  if(state.present)setPresent(false);
 }
});
document.addEventListener('fullscreenchange',()=>{if(!document.fullscreenElement&&state.present&&state.fsRequested){state.fsRequested=false;setPresent(false);}});

window.SIG_ALMOX=Object.freeze({view,load,loadMap,isLoaded,reset,pick,clear,input,paginate,detail,zoom,resetZoom,afterRender,setRegion,
 getStats:()=>({records:state.registros.length,classified:state.registros.filter(x=>x.rpm!==null).length,
 unclassified:state.registros.filter(x=>x.rpm===null).length,processes:new Set(state.registros.map(x=>x.procKey).filter(Boolean)).size,
 pins:REGIOES.length,areas:state.territory?Object.keys(state.territory.polygons).length:0,selected:state.selected,subrpm:state.subrpm,
 results:state.phase==='ready'?filtered().length:0})});
})();
