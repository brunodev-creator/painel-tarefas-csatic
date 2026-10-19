/* Interpretação visual da classificação orçamentária MG. Somente leitura.
 * Os títulos expressam a natureza do gasto; não substituem o objeto de empenho ou contrato. */
(()=>{
'use strict';
const itens=Object.freeze({
 '3390.15XX':'Diárias de militares',
 '3390.1501':'Diárias de militares',
 '3390.30XX':'Material de consumo',
 '3390.35XX':'Serviços de consultoria',
 '3390.36XX':'Serviços de terceiros · pessoa física',
 '3390.39XX':'Serviços de terceiros · pessoa jurídica',
 '3390.3913':'Tarifas de água e esgoto',
 '3390.3921':'Reparos de equipamentos, instalações e material permanente',
 '3390.40XX':'Serviços de tecnologia da informação (TIC)',
 '3390.4002':'Serviços de tecnologia da informação',
 '3390.4003':'Serviços de informática · PRODEMGE',
 '3390.4004':'Serviços de telecomunicações',
 '3390.4005':'Rede IP Multisserviços · dados e voz',
 '3390.9202':'Despesas de exercícios anteriores',
 '4490.40XX':'Serviços de TIC · despesa de capital',
 '4490.4006':'Aquisição de software',
 '4490.4007':'Aquisição de software desenvolvido pela PRODEMGE',
 '4490.52XX':'Equipamentos e material permanente',
 '4490.5206':'Equipamentos de comunicação e telefonia',
 '4490.5207':'Equipamentos de informática'
});
const funcao=Object.freeze({
 '06.122':'Administração geral · segurança pública',
 '06.181':'Policiamento · segurança pública',
 '10.302':'Assistência hospitalar e ambulatorial · saúde',
 '12.361':'Ensino fundamental · educação'
});
function descrever(parts) {
 if(!Array.isArray(parts)||parts.length!==11)return {titulo:'Despesa orçamentária',area:'Área não identificada'};
 const natureza=String(parts[6]||''),item=String(parts[7]||'');
 const key=natureza+'.'+item;
 const title=itens[key]||itens[natureza+'.'+item.slice(0,2)+'XX']||'Despesa do elemento '+key;
 const area=funcao[String(parts[1]||'')+'.'+String(parts[2]||'')]||'Área funcional não classificada';
 return {titulo:title,area};
}
function textoBusca(value) {
 return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/\s+/g,'');
}
window.SIG_COTAS_DESC=Object.freeze({descrever,textoBusca});
})();