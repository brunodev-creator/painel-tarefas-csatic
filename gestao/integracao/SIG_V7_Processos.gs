/**
 * SIG CSA-TIC V7 — Auditoria de Processos de Compra (local).
 * Adicionar como NOVO arquivo Apps Script à planilha saldos_2_0.
 * NÃO acessa Gmail, NÃO envia dados, NÃO altera as abas originais, V5 ou V6.
 * Conferência: fontes automáticas de homologação > controle derivado > RIPC manual.
 * "Ata de RP" não identifica por si só SIRP vs carona.
 */
const SIGV7=Object.freeze({
 version:'7.0.0',maxRows:30000,maxAlerts:400,
 homologados:'IMPORT_PROCESSOS_HOMOLOGADOS',
 controle:'CONTROLE_PROCESSOS_COMPRA',
 ripc:'DESTINACAO_REPASSES',vinculos:'SIG_V7_VINCULOS_CONFERIDOS',
 sheets:{resumo:'SIG_V7_RESUMO',processos:'SIG_V7_PROCESSOS',ripc:'SIG_V7_RIPC',alertas:'SIG_V7_ALERTAS'}
});
function sigV7Menu(){
 SpreadsheetApp.getUi().createMenu('SIG V7 (processos)')
 .addItem('1. Auditar modalidades e valores','sigV7GerarAuditoria')
 .addItem('2. Baixar JSON para SIG (local)','sigV7BaixarRelatorio')
 .addToUi();
}
function sigV7InstalarMenu(){
 const ss=SpreadsheetApp.getActiveSpreadsheet();
 const present=ScriptApp.getProjectTriggers().some(t=>t.getHandlerFunction()==='sigV7Menu'&&t.getEventType()===ScriptApp.EventType.ON_OPEN);
 if(!present)ScriptApp.newTrigger('sigV7Menu').forSpreadsheet(ss).onOpen().create();
 sigV7Menu();
}
function sigV7Ler_(name,required,alert){
 const sh=SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
 if(!sh){alert('BLOQUEIO','FONTE_AUSENTE',name,0,'Não foi encontrada a aba de origem.');return [];}
 const rows=sh.getDataRange().getDisplayValues();
 const headers=(rows[0]||[]).map(sigV7Header_),map={};
 headers.forEach((h,i)=>{if(h&&map[h]===undefined)map[h]=i;});
 const missing=required.filter(h=>map[sigV7Header_(h)]===undefined);
 if(missing.length){alert('BLOQUEIO','COLUNA_AUSENTE',name,1,'Ausentes: '+missing.join(', '));return [];}
 if(rows.length>SIGV7.maxRows)alert('BLOQUEIO','LIMITE',name,0,'Aba excede o limite de leitura de '+SIGV7.maxRows+' linhas.');
 const out=[];
 for(let i=1;i<Math.min(rows.length,SIGV7.maxRows);i++){
  const row=rows[i];if(!row.some(x=>String(x||'').trim()))continue;
  out.push({linha:i+1,get:(name)=>{const pos=map[sigV7Header_(name)];return pos===undefined?'':String(row[pos]??'').trim();}});
 }
 return out;
}
function sigV7Header_(s){return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');}
function sigV7Ascii_(s){return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();}
function sigV7Processo_(raw){
 const s=String(raw||'').replace(/\s+/g,' ').trim();
 const m=/^(\d{7}) (\d{6})\/(\d{4})$/.exec(s);
 return m?m[1]+' '+m[2]+'/'+m[3]:'';
}
function sigV7Currency_(x){
 const s=String(x??'').trim();
 if(!s)return null;
 let negative=/^\(/.test(s)||/^-/.test(s);
 const stripped=s.replace(/[^0-9.,]/g,'');
 if(!stripped)return null;
 const c=stripped.lastIndexOf(','),d=stripped.lastIndexOf('.');
 const sep=c>d?',':(d>=0&&stripped.length-d-1<=2?'.':'');
 const val=sep?stripped.slice(0,stripped.lastIndexOf(sep)).replace(/[.,]/g,'')+'.'+stripped.slice(stripped.lastIndexOf(sep)+1):stripped.replace(/[.,]/g,'');
 if(!/^\d+(?:\.\d{1,2})?$/.test(val))return null;
 const [inte,dec='']=val.split('.');
 const cents=Number(inte)*100+Number((dec+'00').slice(0,2));
 return Number.isSafeInteger(cents)?(negative?-cents:cents):null;
}
function sigV7Categoria_(value){
 const str=sigV7Ascii_(value);
 if(/inexigibil/.test(str))return 'INEXIGIBILIDADE';
 if(/dispensa/.test(str))return 'DISPENSA';
 if(/pregao/.test(str))return 'PREGAO';
 return 'NAO_COMPROVADA';
}
function sigV7Via_(value){
 const s=sigV7Ascii_(value);
 if(/carona|adesao/.test(s))return 'ADESAO_ATA_CARONA_DECLARADA';
 if(/sistema de registro de precos|\bsirp\b/.test(s))return 'RP_SIRP_DECLARADO';
 if(/ata de rp|registro de precos|ata de registro/.test(s))return 'RP_ORIGEM_NAO_COMPROVADA';
 if(/contrato vigente/.test(s))return 'CONTRATO_VIGENTE_DECLARADO';
 return 'NAO_DEFINIDA';
}
function sigV7Hash_(v){
 const a=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,v,Utilities.Charset.UTF_8);
 return a.map(n=>('0'+(n<0?n+256:n).toString(16)).slice(-2)).join('');
}

function sigV7CriarModeloVinculos_(){
 const ss=SpreadsheetApp.getActiveSpreadsheet();
 const columns=['ID_RIPC','Processo_Compra_Confirmado','Modalidade_Confirmada','Via_Aquisicao_Confirmada',
   'Documento_Comprobatorio','Conferido_Por','Conferido_Em','Observacao'];
 let sh=ss.getSheetByName(SIGV7.vinculos);
 if(!sh){
   sh=ss.insertSheet(SIGV7.vinculos);
   sh.getRange(1,1,1,columns.length).setValues([columns]);
   sh.getRange(1,1,1,columns.length).setBackground('#2e594d').setFontColor('#ffffff').setFontWeight('bold');
   sh.setFrozenRows(1);sh.setColumnWidth(1,360);sh.setColumnWidth(2,215);sh.setColumnWidth(5,300);
 }
 return sh;
}
function sigV7Vinculos_(alert){
 const ss=SpreadsheetApp.getActiveSpreadsheet(),sheet=ss.getSheetByName(SIGV7.vinculos);
 if(!sheet||sheet.getLastRow()<2)return Object.create(null);
 const rows=sigV7Ler_(SIGV7.vinculos,
 ['ID_RIPC','Processo_Compra_Confirmado','Modalidade_Confirmada','Via_Aquisicao_Confirmada','Documento_Comprobatorio','Conferido_Por','Conferido_Em'],alert);
 const index=Object.create(null);
 for(const row of rows){
  const ripcId=row.get('ID_RIPC'),process=sigV7Processo_(row.get('Processo_Compra_Confirmado')),doc=row.get('Documento_Comprobatorio');
  if(!ripcId||!process||!doc||doc.length<6||!row.get('Conferido_Por')||!row.get('Conferido_Em')){
   alert('PENDENCIA','VINCULO_INCOMPLETO',ripcId,SIGV7.vinculos,row.linha,
     'Falta número formal, referência comprobatória, autor ou data da conferência. O vínculo não foi utilizado.');
   continue;
  }
  if(index[ripcId]){
   alert('BLOQUEIO','VINCULO_REPETIDO',ripcId,SIGV7.vinculos,row.linha,'RIPC repetido no cadastro de vínculos conferidos.');
   delete index[ripcId];continue;
  }
  index[ripcId]={processo:process,modalidade:row.get('Modalidade_Confirmada'),
   via:row.get('Via_Aquisicao_Confirmada'),documento:doc,conferido_por:row.get('Conferido_Por'),conferido_em:row.get('Conferido_Em')};
 }
 return index;
}

function sigV7Construir_(){
 const issues=[],push=(gravidade,codigo,ref,source,linha,mensagem)=>{
  if(issues.length<SIGV7.maxAlerts)issues.push({gravidade,codigo,processo:ref,fonte:source,linha,mensagem});
 };
 const arrH=sigV7Ler_(SIGV7.homologados,['Processo_Compra','Procedimento_Detalhamento','Valor_Referencia','Valor_Homologado'],push);
 const arrC=sigV7Ler_(SIGV7.controle,['Processo_Compra','Modalidade_Aquisicao','Valor_Referencia_Processo','Valor_Final_Homologado'],push);
 const arrR=sigV7Ler_(SIGV7.ripc,['ID_RIPC','Processo_Compra','Modalidade_Aquisicao','Valor_RIPC','Objeto_Geral'],push);
 const vinculos=sigV7Vinculos_(push);
 const auto=Object.create(null),control=Object.create(null),ripcs=[],byProcess=Object.create(null),manualUnmatched=[];
 const counts={origem_automatica:arrH.length,cadastro_controle:arrC.length,ripc_manualmente_registrados:arrR.length};
 for(const row of arrH){
  const id=sigV7Processo_(row.get('Processo_Compra'));
  const reference=sigV7Currency_(row.get('Valor_Referencia')),approved=sigV7Currency_(row.get('Valor_Homologado'));
  if(!id||reference===null||approved===null){
    push('BLOQUEIO','HOMOLOGACAO_INVALIDA',row.get('Processo_Compra'),SIGV7.homologados,row.linha,'Identificador ou valores da origem automática inválidos.');continue;
  }
  if(auto[id]){
    push('BLOQUEIO','HOMOLOGACAO_REPETIDA',id,SIGV7.homologados,row.linha,'Processo duplicado na importação automática.');continue;
  }
  const detail=row.get('Procedimento_Detalhamento'),group=row.get('Procedimento_Grupo');
  auto[id]={processo:id,modalidade_automatica:detail,categoria:sigV7Categoria_(detail),grupo:group,
   objeto:row.get('Objeto_Processo'),valor_referencia_centavos:reference,valor_homologado_centavos:approved,
   economia_centavos:reference-approved,situacao_execucao:row.get('Situacao_Execucao'),
   origem_arquivo:row.get('Arquivo_Origem'),origem_linha:row.linha};
  if(approved>reference)push('REVISAO','HOMOLOGADO_SUPERA_REFERENCIA',id,SIGV7.homologados,row.linha,'Valor homologado excede o referencial; verificar se os objetos/itens são comparáveis.');
 }
 for(const row of arrC){
  const id=sigV7Processo_(row.get('Processo_Compra'));
  if(!id){push('ATENCAO','CONTROLE_ID_INCOMPLETO',row.get('Processo_Compra'),SIGV7.controle,row.linha,'Número do processo de compra não padronizado.');continue;}
  if(control[id]){push('ATENCAO','CONTROLE_DUPLICADO',id,SIGV7.controle,row.linha,'Processo repetido no cadastro de controle.');continue;}
  const ref=sigV7Currency_(row.get('Valor_Referencia_Processo'));
  const hom=sigV7Currency_(row.get('Valor_Final_Homologado'));
  const cadastro={id,modalidade_cadastro:row.get('Modalidade_Aquisicao'),referencia_cadastro_centavos:ref,
   homologado_cadastro_centavos:hom,efetivo_cadastro_centavos:sigV7Currency_(row.get('Valor_Efetivo_Processo')),
   status_controle:row.get('Status_Processo'),tipo_controle:row.get('Tipo_Controle_Orcamentario'),
   origem_cadastro:row.get('Origem_Homologacao')};
  control[id]=cadastro;
  if(auto[id]){
   if(ref!==null&&ref!==auto[id].valor_referencia_centavos)
    push('REVISAO','REFERENCIA_CONTROLE_DIVERGENTE',id,SIGV7.controle,row.linha,'Referência do controle diverge do relatório automático.');
   if(hom!==null&&hom!==auto[id].valor_homologado_centavos)
    push('REVISAO','HOMOLOGADO_CONTROLE_DIVERGENTE',id,SIGV7.controle,row.linha,'Valor homologado cadastrado diverge do relatório automático.');
   if(sigV7Categoria_(row.get('Modalidade_Aquisicao'))!=='NAO_COMPROVADA'&&
    sigV7Categoria_(row.get('Modalidade_Aquisicao'))!==auto[id].categoria)
    push('REVISAO','MODALIDADE_CONTROLE_DIVERGENTE',id,SIGV7.controle,row.linha,'Modalidade do controle não corresponde à fonte automática.');
  }else{
   push('INFORMACAO','CONTROLE_SEM_HOMOLOGACAO_AUTOMATICA',id,SIGV7.controle,row.linha,'Não apareceu no arquivo automático; verificar fonte e status antes de assumir homologação.');
  }
 }
 const ids=Object.create(null),modStats=Object.create(null),vias=Object.create(null);
 for(const row of arrR){
  const ripcId=row.get('ID_RIPC'),raw=row.get('Processo_Compra'),originalId=sigV7Processo_(raw);
  const reviewed=vinculos[ripcId]||null;
  if(originalId&&reviewed&&reviewed.processo!==originalId)
   push('REVISAO','VINCULO_DIVERGE_RIPC',originalId,SIGV7.vinculos,0,'Número formal do RIPC diverge da relação conferida; não substituir ligação automaticamente.');
  const id=originalId||reviewed?.processo||'';
  const declared=row.get('Modalidade_Aquisicao'),route=reviewed?.via?sigV7Via_(reviewed.via):sigV7Via_(declared);
  const manualCategory=sigV7Categoria_(reviewed?.modalidade||declared),amount=sigV7Currency_(row.get('Valor_RIPC'));
  modStats[declared||'Não informada']=(modStats[declared||'Não informada']||0)+1;
  vias[route]=(vias[route]||0)+1;
  if(!ripcId||amount===null){push('BLOQUEIO','RIPC_INVALIDO',raw,SIGV7.ripc,row.linha,'Identificador ou valor do RIPC inválido.');continue;}
  if(ids[ripcId]){push('BLOQUEIO','RIPC_DUPLICADO',raw,SIGV7.ripc,row.linha,'RIPC repetido no cadastro.');continue;}
  ids[ripcId]=true;
  const mHom=sigV7Currency_(row.get('Valor_Final_Homologado'));
  const item={
   id_ripc:ripcId,processo_informado:raw,processo_oficial_confirmado:id||null,
   vinculo:originalId?'IDENTIFICADOR_FORMAL_DECLARADO':reviewed?'VINCULO_MANUAL_COM_REFERENCIA':'NAO_VINCULADO_IDENTIFICADOR_ABREVIADO',
   documento_comprobatorio:reviewed?.documento||null,modalidade_conferida:reviewed?.modalidade||null,
   modalidade_manual:declared,via_aquisicao:route,categoria_manual:manualCategory,
   objeto_ripc:row.get('Objeto_Geral'),valor_ripc_centavos:amount,
   homologado_manual_centavos:mHom,doc_repasse:row.get('Doc_Repasse'),dotacao:row.get('Dotacao'),
   linha_origem:row.linha,origem_dado:'PREENCHIMENTO_MANUAL_RIPC',
   origem_homologacao:auto[id]?'IMPORT_PROCESSOS_HOMOLOGADOS':'NAO_COMPROVADA'};
  ripcs.push(item);
  if(!id){
   manualUnmatched.push(item);
   push('PENDENCIA','RIPC_PROCESSO_ABREVIADO',raw||'(vazio)',SIGV7.ripc,row.linha,
    'RIPC manual sem número formal validável. Não vincular ao processo por suposição.');
   continue;
  }
  (byProcess[id]||(byProcess[id]=[])).push(item);
  if(!auto[id]){
   push('PENDENCIA','RIPC_PROCESSO_SEM_FONTE_AUTOMATICA',id,SIGV7.ripc,row.linha,'Processo informado, mas sem homologação na fonte automática. Pode ser SRP, carona, outra modalidade ou relatório incompleto.');
   continue;
  }
  if(manualCategory!=='NAO_COMPROVADA'&&manualCategory!==auto[id].categoria)
   push('REVISAO','MODALIDADE_RIPC_DIVERGENTE',id,SIGV7.ripc,row.linha,
    'RIPC declara '+declared+'; relatório automático: '+auto[id].modalidade_automatica+'.');
  if(mHom!==null&&mHom!==auto[id].valor_homologado_centavos)
   push('REVISAO','HOMOLOGADO_RIPC_MANUAL_DIVERGENTE',id,SIGV7.ripc,row.linha,
    'Valor homologado no RIPC não confere com relatório automático. Não sobrescrever fonte automática.');
 }
 const processos=Object.keys({...auto,...control,...byProcess}).sort().map(id=>{
  const a=auto[id]||null,c=control[id]||null,rs=byProcess[id]||[];
  const rTotal=rs.reduce((s,x)=>s+x.valor_ripc_centavos,0);
  const ref=a?.valor_referencia_centavos??c?.referencia_cadastro_centavos??null;
  const hom=a?.valor_homologado_centavos??c?.homologado_cadastro_centavos??null;
  const status=a?'HOMOLOGACAO_VERIFICADA':c?'CONTROLE_SEM_AUTO':'PROCESSO_RIPC_SEM_AUTO';
  if(a&&rTotal>a.valor_homologado_centavos&&rs.length)
   push('REVISAO','RIPC_SUPERA_HOMOLOGADO',id,SIGV7.ripc,rs[0].linha_origem,
    'Soma do(s) RIPC ligado(s) ao processo supera o homologado automático; verificar abrangência, itens e fases.');
  const differences=issues.filter(x=>x.processo===id&&['REVISAO','BLOQUEIO','PENDENCIA'].includes(x.gravidade));
  return {processo:id,modalidade_automatica:a?.modalidade_automatica||null,
   categoria_licitacao:a?.categoria||c?.modalidade_cadastro||'NÃO COMPROVADA',
   modalidade_controle:c?.modalidade_cadastro||null,objeto:a?.objeto||null,
   situacao:a?.situacao_execucao||c?.status_controle||null,
   valor_referencia_centavos:ref,valor_homologado_centavos:hom,
   economia_centavos:ref!==null&&hom!==null?ref-hom:null,
   total_ripc_vinculado_centavos:rTotal,quantidade_ripc_vinculados:rs.length,
   comparacao_ripc_homologado:a?(rs.length===0?'SEM_RIPC_IDENTIFICADO':rTotal>a.valor_homologado_centavos?'RIPC_MAIOR_HOMOLOGADO':
    rTotal===a.valor_homologado_centavos?'RIPC_IGUAL_HOMOLOGADO':'RIPC_PARCIAL_OU_DISTINTO'):'SEM_BASE_AUTOMATICA',
   confianca_homologacao:a?'AUTOMATICA_IDENTIFICADA':c?'CADASTRO_SECUNDARIO':'SEM_HOMOLOGACAO',
   exige_revisao:differences.length>0,quantidade_alertas:differences.length,
   fonte_primaria:a?'IMPORT_PROCESSOS_HOMOLOGADOS':null};
 });
 const summary={homologados_automaticos:Object.keys(auto).length,processos_no_controle:Object.keys(control).length,
  ripc_total:ripcs.length,ripc_com_numero_formal:ripcs.filter(x=>!!x.processo_oficial_confirmado).length,
  ripc_sem_numero_formal:manualUnmatched.length,
  ripc_com_auto:ripcs.filter(x=>x.processo_oficial_confirmado&&!!auto[x.processo_oficial_confirmado]).length,
  ripc_com_vinculo_documentado:ripcs.filter(x=>x.vinculo==='VINCULO_MANUAL_COM_REFERENCIA').length,
  homologados_com_ripc:processos.filter(x=>x.confianca_homologacao==='AUTOMATICA_IDENTIFICADA'&&x.quantidade_ripc_vinculados>0).length,
  processos_com_revisao:processos.filter(x=>x.exige_revisao).length,
  modalidade_ripc_divergente:issues.filter(x=>x.codigo==='MODALIDADE_RIPC_DIVERGENTE').length,
  diferenca_valor_homologado_ripc:issues.filter(x=>x.codigo==='HOMOLOGADO_RIPC_MANUAL_DIVERGENTE').length,
  ripc_acima_homologado:issues.filter(x=>x.codigo==='RIPC_SUPERA_HOMOLOGADO').length,
  categorias_homologacao:Object.keys(auto).reduce((o,k)=>{const t=auto[k].modalidade_automatica||'Não informada';o[t]=(o[t]||0)+1;return o;},{}),
  modalidades_manuais_ripc:modStats,vias_ripc:vias,
  valor_referencia_auto_centavos:Object.values(auto).reduce((sum,x)=>sum+x.valor_referencia_centavos,0),
  valor_homologado_auto_centavos:Object.values(auto).reduce((sum,x)=>sum+x.valor_homologado_centavos,0)};
 const result={sig_version:'7.0.0',tipo:'AUDITORIA_PROCESSOS_LOCAL',
  gerado_em:new Date().toISOString(),origem:'saldos_2_0 · fontes automáticas + cadastros manuais',
  referencia:'Posição importada, conferir data do arquivo automático de homologação',
  resumo:summary,processos,ripc:ripcs,alertas:issues,
  regras:[
  'Referência estimada e valor homologado são conceitos distintos. Somente o homologado comprova o resultado informado na origem automática; empenho deve ser verificado à parte.',
  'Dispensa por valor não prova, por si só, o procedimento COTEP; essa classificação precisa de comprovação adicional.',
  'Ata de RP não comprova se a aquisição foi gerenciada pelo SIRP ou realizada por carona. Modalidade da licitação e forma de aquisição são atributos distintos.',
  'RIPC é cadastro manual: modalidade, vínculo de processo e valores devem ser comparados à fonte automática antes de serem aceitos.',
  'Processo_Compra abreviado no RIPC não é cruzado automaticamente com processo formal. Isso evita associação indevida.',
  'Vínculos incluídos em SIG_V7_VINCULOS_CONFERIDOS são manuais e possuem referência documental. Essa referência não altera nem autentica a fonte automática.',
  'O total de RIPC por processo pode ser uma execução parcial ou uma aquisição distinta do escopo homologado; divergências exigem revisão, não cancelamento automático.',
  'Ausência de registro na importação automática não prova inexigibilidade, ausência de homologação nem erro no RIPC.'
  ]};
 result.assinatura_geral=sigV7Hash_(JSON.stringify({p:processos.map(x=>[x.processo,x.valor_referencia_centavos,x.valor_homologado_centavos,x.total_ripc_vinculado_centavos]),r:ripcs.map(x=>[x.id_ripc,x.processo_informado,x.valor_ripc_centavos,x.modalidade_manual]).sort(),a:issues.map(x=>[x.codigo,x.processo]).sort()}));
 return result;
}
function sigV7NovaAba_(ss,name,head,rows){
 const sh=ss.getSheetByName(name)||ss.insertSheet(name);sh.clearContents();
 const matrix=[head].concat(rows).map(row=>row.map(x=>x===undefined||x===null?'':x));
 sh.getRange(1,1,matrix.length,head.length).setValues(matrix);
 sh.setFrozenRows(1);sh.getRange(1,1,1,head.length).setBackground('#17334c').setFontColor('#fff').setFontWeight('bold');
 sh.setColumnWidth(1,270);sh.setColumnWidth(2,235);return sh;
}
function sigV7Escrever_(r){
 const ss=SpreadsheetApp.getActiveSpreadsheet(),cent=v=>v===null||v===undefined?'':v/100;
 const sum=r.resumo;
 sigV7NovaAba_(ss,SIGV7.sheets.resumo,['Indicador','Valor'],[
 ['Processos homologados (fonte automática)',sum.homologados_automaticos],['Processos no controle',sum.processos_no_controle],
 ['RIPC manuais',sum.ripc_total],['RIPC com processo formal',sum.ripc_com_numero_formal],
 ['RIPC com processo abreviado sem vínculo',sum.ripc_sem_numero_formal],['RIPC ligados à homologação automática',sum.ripc_com_auto],
 ['RIPC vinculados por conferência documental',sum.ripc_com_vinculo_documentado],
 ['Modalidades do RIPC divergentes',sum.modalidade_ripc_divergente],['RIPC superior ao valor homologado',sum.ripc_acima_homologado],
 ['Divergências de valor homologado informado no RIPC',sum.diferenca_valor_homologado_ripc],
 ['Valor estimado (somatório dos processos automáticos)',cent(sum.valor_referencia_auto_centavos)],
 ['Valor homologado (somatório dos processos automáticos)',cent(sum.valor_homologado_auto_centavos)],
 ['Economia aritmética agregada (R$)',cent(sum.valor_referencia_auto_centavos-sum.valor_homologado_auto_centavos)],
 ['Alertas e pendências',r.alertas.length],['Assinatura da leitura',r.assinatura_geral],
 ['AVISO','RIPC manual não substitui valores homologados da origem automática.']]);
 sigV7NovaAba_(ss,SIGV7.sheets.processos,
 ['Processo','Modalidade origem automática','Modalidade no controle','Referência (R$)','Homologado (R$)','Economia (R$)','RIPC ligado (R$)','Qtd RIPC','Comparação','Confiabilidade','Revisão'],
 r.processos.map(x=>[x.processo,x.modalidade_automatica,x.modalidade_controle,cent(x.valor_referencia_centavos),
 cent(x.valor_homologado_centavos),cent(x.economia_centavos),cent(x.total_ripc_vinculado_centavos),x.quantidade_ripc_vinculados,
 x.comparacao_ripc_homologado,x.confianca_homologacao,x.exige_revisao?'REVISAR':'SEM_ALERTA_DETECTADO']));
 sigV7NovaAba_(ss,SIGV7.sheets.ripc,
 ['RIPC','Processo informado manualmente','Número formal relacionado','Modalidade manual','Via de aquisição','Valor RIPC (R$)','Valor homologado anotado no RIPC (R$)','Fonte','Vinculação','Documento de conferência'],
 r.ripc.map(x=>[x.id_ripc,x.processo_informado,x.processo_oficial_confirmado,x.modalidade_manual,x.via_aquisicao,
 cent(x.valor_ripc_centavos),cent(x.homologado_manual_centavos),x.origem_dado,x.vinculo,x.documento_comprobatorio]));
 sigV7NovaAba_(ss,SIGV7.sheets.alertas,['Gravidade','Código','Processo','Fonte','Linha','Motivo'],
 r.alertas.map(x=>[x.gravidade,x.codigo,x.processo,x.fonte,x.linha,x.mensagem]));
}
function sigV7GerarAuditoria(){
 const lock=LockService.getDocumentLock();
 if(!lock.tryLock(20000))throw Error('Outra auditoria está em andamento.');
 try{
  sigV7CriarModeloVinculos_();const r=sigV7Construir_();sigV7Escrever_(r);
  SpreadsheetApp.getUi().alert('SIG V7: auditoria concluída. '+r.resumo.homologados_automaticos+
   ' homologações automáticas; '+r.resumo.ripc_total+' RIPC manuais; '+r.alertas.length+
   ' apontamentos. Nenhum dado foi enviado ao SIG externo.');
 }finally{lock.releaseLock();}
}
function sigV7BaixarRelatorio(){
 sigV7CriarModeloVinculos_();const r=sigV7Construir_(),json=JSON.stringify(r);
 if(json.length>4500000)throw Error('Relatório supera limite de exportação.');
 const encoded=Utilities.base64Encode(Utilities.newBlob(json,'application/json').getBytes());
 const html='<!doctype html><html><head><meta charset="utf-8"></head><body style="font:14px Arial;padding:22px"><h3>SIG V7 — Auditoria de compras</h3>'+
 '<p>O arquivo é baixado diretamente no navegador, sem transmitir dados para o SIG externo.</p>'+
 '<button id="download">Baixar SIG_V7_PROCESSOS.json</button><script>document.getElementById("download").onclick=()=>{let b=atob("'+encoded+'"),'+
 'u=URL.createObjectURL(new Blob([Uint8Array.from(b,c=>c.charCodeAt(0))],{type:"application/json"})),a=document.createElement("a");'+
 'a.href=u;a.download="SIG_V7_PROCESSOS.json";document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),3000)};</script></body></html>';
 SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutput(html).setWidth(500).setHeight(200),'Exportar auditoria local');
}