// Node.js: node gestao/tests/teste_cotep_calculo.cjs
// Motor de cálculo do painel Intenções de COTEP com os dados de validação de 2026 (3016 e 5207).
const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const path=require('node:path');
const source=fs.readFileSync(path.resolve(__dirname,'../assets/cotep.js'),'utf8');
const sandbox={window:{},document:{addEventListener(){}},Intl,Date,Math,Number,String,Map,Set,JSON,globalThis:{}};
vm.runInNewContext(source,sandbox);
const {calcular,saldoSemCotep,CENT}=sandbox.window.SIG_COTEP_CALC;
const ug='1250071';
let seq=0;
const coteps=[],procedimentos=[];
function cotep(numero,situacao,itens){
 const c={id:'c'+(++seq),ano:2026,unidade_gestora:ug,numero,objeto:'Validação '+numero,situacao};coteps.push(c);
 for(const [el,est,hom] of itens)procedimentos.push({id:'i'+(++seq),cotep_id:c.id,ano:2026,unidade_gestora:ug,numero,situacao,elemento_item:el,valor_estimado:est,valor_homologado:hom??null,ativo:true});
 return c;
}
cotep('43/2026','Realizada (a conferir)',[['3016',28658.70]]);
cotep('48/2026','Realizada (a conferir)',[['3016',5450.00]]);
cotep('64/2026','Realizada (a conferir)',[['3016',21937.92]]);
cotep('126/2026','Finalizada',[['3016',2896.14,2896.00]]);
const c130=cotep('130/2026','Em andamento',[['3016',674.95],['5207',23599.00]]);
cotep('95/2026','Realizada (a conferir)',[['5207',40700.00]]);
cotep('122/2026','Fracassada',[[null,0]]);
cotep('901/2026','Realizada (a conferir)',[['3024',20000]]);
cotep('902/2026','Realizada (a conferir)',[['5203',30000]]);
cotep('903/2026','Realizada (a conferir)',[['3964',13130]]);
cotep('904/2026','Realizada (a conferir)',[['3921',10000]]);
const d={limites:[{ano:2026,unidade_gestora:ug,valor_limite:65492.11,padrao:true}],elementos:[{codigo:'5207',descricao:'Equipamentos de informática'}],coteps,procedimentos,
 intencoes:[{id:'p1',ano:2026,unidade_gestora:ug,elemento_item:'3016',valor_estimado:3000,valor_reservado:0,situacao:'Pendente'}]};

let res=calcular(d,2026,ug);
const r3016=res.porCodigo.get('3016'),r5207=res.porCodigo.get('5207');
assert.equal(r3016.limite,CENT(65492.11));
assert.equal(r3016.consumido,CENT(58942.62),'3016 consumido (realizadas; 126/2026 pelo homologado 2.896,00)');
assert.equal(r3016.comprometido,CENT(674.95),'3016 comprometido (130/2026 em andamento)');
assert.equal(r3016.consumido+r3016.comprometido,CENT(59617.57),'3016 consumido + comprometido');
assert.equal(r3016.saldo,CENT(5874.54),'3016 saldo');
assert.equal(r3016.percentual,91.03);
assert.equal(r3016.pendentes_qtd,1);
assert.equal(r3016.alerta.nivel,'elevado');
assert.equal(r5207.consumido+r5207.comprometido,CENT(64299.00),'5207 consumido + comprometido');
assert.equal(r5207.saldo,CENT(1193.11),'5207 saldo');
assert.equal(r5207.coteps.length,2,'5207 vinculado a 95 e 130');
assert.equal(res.itens.length,6,'3016, 5207, 3024, 5203, 3964, 3921 (122/2026 sem código não entra)');
assert.equal(res.itens.reduce((s,r)=>s+r.consumido+r.comprometido,0),CENT(169876.62+2896+674.95+23599),'COTEP 130/2026 não duplicada');
assert.equal(res.itens[0].codigo,'5207','Ordenação por severidade/utilização');

// Saldo disponível para editar a 130/2026 desconsidera o que ela própria ocupa.
assert.equal(saldoSemCotep(d,2026,ug,'3016',c130.id),CENT(5874.54+674.95));
// Reserva aprovada compromete; conversão em COTEP transfere sem duplicar; homologação libera a diferença.
d.intencoes[0].situacao='Reservada';d.intencoes[0].valor_reservado=3000;
assert.equal(calcular(d,2026,ug).porCodigo.get('3016').saldo,CENT(2874.54));
d.intencoes[0].situacao='Em COTEP';d.intencoes[0].valor_reservado=0;
const c131=cotep('131/2026','Em andamento',[['3016',3000]]);
assert.equal(calcular(d,2026,ug).porCodigo.get('3016').saldo,CENT(2874.54),'Sem dupla contagem na conversão');
c131.situacao='Finalizada';procedimentos.at(-1).valor_homologado=2500;
assert.equal(calcular(d,2026,ug).porCodigo.get('3016').saldo,CENT(3374.54),'Homologado libera 500,00');
c131.situacao='Deserta';
assert.equal(calcular(d,2026,ug).porCodigo.get('3016').saldo,CENT(5874.54),'Deserta libera tudo');
// Alertas
d.intencoes.push({id:'p2',ano:2026,unidade_gestora:ug,elemento_item:'5207',valor_estimado:2000,valor_reservado:0,situacao:'Pendente'});
assert.equal(calcular(d,2026,ug).porCodigo.get('5207').alerta.nivel,'insuficiente');
d.intencoes.push({id:'p3',ano:2026,unidade_gestora:ug,elemento_item:'5207',valor_estimado:1193.11,valor_reservado:1193.11,situacao:'Reservada'});
assert.equal(calcular(d,2026,ug).porCodigo.get('5207').alerta.nivel,'atingido');
assert.equal(calcular(d,2027,ug).limite,null,'Sem limite para 2027');
console.log('SIG COTEP: cálculo por elemento-item aprovado (3016 saldo R$ 5.874,54 · 5207 saldo R$ 1.193,11)');
