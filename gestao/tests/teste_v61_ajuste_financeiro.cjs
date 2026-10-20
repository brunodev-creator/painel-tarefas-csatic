// Node.js: node gestao/tests/teste_v61_ajuste_financeiro.cjs
// Testes sintéticos: não contém valores ou identificadores reais de empenhos.
const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const path=require('node:path');
const source=fs.readFileSync(path.resolve(__dirname,'../integracao/SIG_V6_Conciliacao_Atual.gs'),'utf8');
const library=vm.runInNewContext(source+'\n({ajustar:sigV6AplicarAjustesAssinados_,mapa:sigV6MapaAjustesOrcamentarios_})');
const row=values=>({linha:4,get:key=>String(values[key]??'')});
const origin=()=>row({Chave_Empenho:'2026|1234567|42',Total_Ajustes:'20,00',Total_Empenho_Inicial:'1000,00',Total_Reforco:'0',Total_Anulacao_Empenho:'0'});
const negative={'2026|1234567|42':{assinado:-2000,absoluto:2000,linhas:[100]}};
const positive={'2026|1234567|42':{assinado:2000,absoluto:2000,linhas:[100]}};
const blocks=[];
const alert=(...args)=>blocks.push(args);
assert.deepEqual([library.ajustar(origin(),100000,negative,alert).liquido,library.ajustar(origin(),100000,negative,alert).delta],[98000,-2000]);
const already=library.ajustar(origin(),98000,negative,alert);
assert.equal(already.liquido,98000);
assert.equal(already.delta,0);
assert.equal(already.estado,'JA_CONTABILIZADO');
assert.equal(library.ajustar(origin(),100000,positive,alert).liquido,102000);
assert.equal(library.ajustar(origin(),99000,negative,alert).estado,'PENDENTE');
assert.ok(blocks.some(x=>x[1]==='AJUSTE_AMBIGUO'));
const raws=[
 row({'Tipo da especificação':'Ajuste financeiro RP','Ano Empenho':'2026','Código Unidade Compra':'1234567','Número do Empenho':'42','Valor Despesa Empenhada':'-700,00'}),
 row({'Tipo da especificação':'Ajuste financeiro orçamentário','Ano Empenho':'2026','Código Unidade Compra':'1234567','Número do Empenho':'42','Valor Despesa Empenhada':'-20,00'})
];
const map=library.mapa(raws,alert);
assert.equal(Object.keys(map).length,1);
assert.equal(map['2026|1234567|42'].assinado,-2000);
console.log('SIG V6.1: testes de ajuste financeiro aprovados');
