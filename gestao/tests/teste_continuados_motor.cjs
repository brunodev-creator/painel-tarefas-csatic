// Motor de Contratos Continuados validado com recorte real da «agora vai - PLANILHA ATUAL» (posição de 22/10/2026).
// Uso: node gestao/tests/teste_continuados_motor.cjs
'use strict';
const M=require('../assets/continuados-motor.js');
const F=require('./fixtures/continuados_planilha_20261022.json');
let ok=0,falhas=0;
const t=(cond,nome,extra='')=>{if(cond){ok++;console.log('PASS  '+nome);}else{falhas++;console.log('FALHOU '+nome+(extra?' → '+extra:''));}};
const correcoes=Object.fromEntries(F.correcoes.filter(c=>c.Status==='APROVADO').map(c=>[c.Chave_Empenho,{original:c.Dotacao_Original,corrigida:c.Dotacao_Corrigida}]));
const OPT={hoje:'2026-10-22',exercicio:2026,mesesAlvo:['2026-11','2026-12']};
const base={movimentos:F.movimentos,correcoes};
const A=M.analisar(base,OPT);
const porProc=(p,cnpj)=>A.contratos.find(c=>c.processos.includes(p)&&(!cnpj||String(c.cnpj).includes(cnpj)));
const brl=M.brl;

// 1. Consolidação: saldo por empenho e execução mensal batem com a planilha
const movs=F.movimentos.map(r=>M.normalizarMovimento(r,correcoes));
const saldoChave={};movs.forEach(m=>{saldoChave[m.chave]=(saldoChave[m.chave]||0)+m.empenho+m.ajuste-m.conformidade;});
const difs=F.controle.filter(c=>Math.abs((saldoChave[c.Chave_Empenho]||0)-M.C(c.Saldo_Atual_Empenho))>1);
t(!difs.length,'Saldo de cada empenho (movimentos) = Saldo_Atual_Empenho da planilha ('+F.controle.length+' empenhos)',difs.map(d=>d.Chave_Empenho).join(','));
const MES={Jan:'01',Feb:'02',Mar:'03',Apr:'04',May:'05',Jun:'06',Jul:'07',Aug:'08',Sep:'09',Oct:'10',Nov:'11',Dec:'12'};
const anoMes=s=>{const m=/^\w{3} (\w{3}) \d{2} (\d{4})/.exec(s);return m?m[2]+'-'+MES[m[1]]:String(s).slice(0,7);};
const execPlan={};F.execucao_mensal.forEach(r=>{const k=r.Chave_Empenho+'@'+anoMes(r.Ano_Mes);execPlan[k]=(execPlan[k]||0)+M.C(r.Valor_Conformidade_Mes);});
const execSig={};movs.filter(m=>/CONFORMIDADE/.test(m.tipo)).forEach(m=>{const k=m.chave+'@'+m.mes;execSig[k]=(execSig[k]||0)+m.conformidade;});
const difMes=Object.keys({...execPlan,...execSig}).filter(k=>(execPlan[k]||0)!==(execSig[k]||0));
t(!difMes.length,'Execução mensal consolidada = EXECUCAO_MENSAL_SERVICOS_CONTINUOS (mês de referência da planilha)',difMes.slice(0,5).join(','));

// 2. Contrato com múltiplos empenhos e processo ≠ contrato
const pd=porProc('1250071 000085/2021');
t(pd&&pd.grupos.reduce((n,g)=>n+g.empenhos.length,0)>=5,'PD CASE (000085/2021): 5 empenhos reunidos em um contrato, separados por linha orçamentária');
t(pd&&pd.grupos.some(g=>g.tdco)&&pd.grupos.some(g=>!g.tdco),'PD CASE: linha TDCO (UE 1050003) separada das linhas da UE 1250070');
const rede=A.contratos.find(c=>c.numeroContrato==='8000034');
t(rede&&rede.processos.length===2,'Contrato 8000034 (Rede IP lote 9) reúne os processos 000036/2020 e 000037/2020');
t(A.contratos.filter(c=>c.processos.includes('1250071 000022/2025')).length===1&&porProc('1250071 000139/2025').processos.length===1,'Fornecedores diferentes nunca se misturam; processos distintos sem número de contrato ficam separados');
// Correção histórica 0000→0001 aprovada
t(movs.filter(m=>m.chave==='2026|1250071|56').every(m=>m.dotacaoCorrigida&&/2060\.0001\.3390\.4002/.test(m.dotacao)),'Correção histórica aprovada (empenho 56: 0000→0001) aplicada pela comparação de dígitos');

// 3. Inconsistência corrigida: chave 2026|1250071|1 reunia dois empenhos TDCO distintos (PRODEMGE e Motorola)
const prod=porProc('1250071 000022/2025'),moto=porProc('1250071 000139/2025');
const gProd=prod.grupos.find(g=>g.empenhos.includes('2026|1250071|1')),gMoto=moto.grupos.find(g=>g.empenhos.includes('2026|1250071|1'));
t(gProd&&gMoto&&gProd.saldo===43442132&&gMoto.saldo===36721548,'Chave 2026|1250071|1 separada: PRODEMGE R$ 434.421,32 + Motorola R$ 367.215,48',brl(gProd?.saldo||0)+' / '+brl(gMoto?.saldo||0));
t(gProd.saldo+gMoto.saldo===M.C(F.controle.find(c=>c.Chave_Empenho==='2026|1250071|1').Saldo_Atual_Empenho),'… e a soma continua igual ao saldo da planilha (R$ 801.636,80)');

// 4. TDCO: saldo de outra unidade não cobre a despesa da execução direta
const direta=prod.grupos.find(g=>!g.tdco),tdco=prod.grupos.find(g=>g.tdco);
const sobraTdco=tdco.projecao[tdco.projecao.length-1].saldoFim;
t(direta.reforcoTotal>0&&sobraTdco>0&&prod.reforcoTotal===direta.reforcoTotal,'000022/2025: reforço da UE 1250070 ('+brl(direta.reforcoTotal)+') não é compensado pela sobra projetada do TDCO ('+brl(sobraTdco)+')');

// 5. Projeção sequencial: saldo consumido em novembro não volta em dezembro
const chips=porProc('1250071 000162/2022'),gc=chips.grupos[0];
const [out,nov,dez]=gc.projecao;
t(out.mes==='2026-10'&&out.despesa===Math.max(0,gc.referencia-gc.execMesAtual),'Mês corrente: projeta apenas o restante não conformado (sem descontar de novo o que já foi pago)');
t(nov.saldoInicio===out.saldoFim&&dez.saldoInicio===nov.saldoFim,'Saldo de dezembro parte do saldo que sobrou de novembro');
t(nov.reforco===0&&dez.reforco===dez.despesa-Math.max(0,nov.saldoFim),'Chips 000162/2022: novembro coberto; dezembro com reforço de '+brl(dez.reforco));
t(/O saldo cobre novembro\. Para dezembro, o reforço estimado é de R\$/.test(chips.resumo),'Resumo automático: «'+chips.resumo+'»');

// 6. Faturamento anual/único não vira mensalidade
const tqs=porProc('1250071 000207/2022');
const planTqs=M.C(F.controle.find(c=>c.Chave_Empenho==='2026|1250071|102').Valor_Reforco_Ate_Fim_Exercicio);
t(tqs.situacao.nivel==='unico'&&tqs.reforcoTotal===0,'Licenças TQS por 1 ano: pagamento único, reforço 0 (planilha projetava '+brl(planTqs)+')');

// 7. Histórico insuficiente × sem histórico × gasto zero
const sup=porProc('1250071 000054/2021');
t(sup.situacao.nivel==='sem_dados'&&sup.reforcoTotal===null&&/avaliação do fiscal/.test(sup.resumo),'000054/2021 sem conformidade: sem estimativa; necessidade fica com o fiscal');
const cert=porProc('1250071 000071/2025');
t(cert.grupos.some(g=>g.periodicidade==='insuficiente'&&g.confianca==='baixa'),'Certificação digital (1 mês com conformidade): histórico insuficiente, confiança baixa');
const g56=pd.grupos.find(g=>g.empenhos.includes('2026|1250071|56'));
t(g56.serie.some(x=>x.valor===0)&&g56.mediaHistorica===Math.round(g56.serie.reduce((s,x)=>s+x.valor,0)/g56.serie.length),'Meses sem conformidade dentro da execução contam como zero na média (regra anterior ignorava)');
const plan56=M.C(F.controle.find(c=>c.Chave_Empenho==='2026|1250071|56').Media_Mensal_Ultimos_3_Meses);
t(g56.referencia<plan56,'Empenho 56: referência '+brl(g56.referencia)+' < média «últimos 3 meses com conformidade» da planilha '+brl(plan56));

// 8. Manifestação zero, atendimento parcial e planejamento sem dupla contagem
const manifestacoes=[
 {exercicio:2026,contrato_chave:chips.chave,valor:0,registrado_em:'2026-10-20T10:00:00-03:00',registrado_nome:'Fiscal A'},
 {exercicio:2026,contrato_chave:prod.chave,valor:1500000,registrado_em:'2026-09-15T10:00:00-03:00',registrado_nome:'Fiscal B'},
 {exercicio:2026,contrato_chave:prod.chave,valor:2000000,registrado_em:'2026-09-20T10:00:00-03:00',registrado_nome:'Fiscal B'}];
const B=M.analisar({...base,manifestacoes},OPT);
const bChips=B.contratos.find(c=>c.chave===chips.chave),bProd=B.contratos.find(c=>c.chave===prod.chave);
t(bChips.manifestacao.valor===0&&!bChips.atendimento,'Manifestação igual a zero registrada como avaliação (não como ausência)');
t(bProd.atendimento&&bProd.atendimento.status==='parcial'&&bProd.atendimento.recebido>0,'000022/2025: reforços importados após 15/09 reconhecidos como atendimento parcial ('+brl(bProd.atendimento?.atendido||0)+')');
t(bProd.manifestacao.original===150000000&&bProd.atendimento.solicitado===200000000&&bProd.atendimento.atendido+bProd.atendimento.pendente===200000000,'Valor solicitado preservado; atendido e pendente separados');
const semM=B.contratos.filter(c=>!c.manifestacao).reduce((s,c)=>s+(c.reforcoTotal||0),0);
t(B.totais.planejamento.total===bProd.atendimento.pendente+semM&&B.totais.planejamento.sistema===semM,'Planejamento = pendente do fiscal + estimativa só dos contratos sem manifestação (sem somar os dois)');
t(bProd.reforcoTotal===prod.reforcoTotal,'A estimativa do sistema muda com os dados, nunca com a manifestação');

// 9. Reimportação: movimento repetido não duplica
const C=M.analisar({movimentos:F.movimentos.concat(F.movimentos.slice(0,40)),correcoes},OPT);
t(C.duplicadosIgnorados===40&&C.totais.sistema===A.totais.sistema&&C.contratos.length===A.contratos.length,'Reimportação com 40 movimentos repetidos: resultado idêntico');

// 10. Período parametrizado
const D=M.analisar(base,{hoje:'2026-10-22',exercicio:2026,mesesAlvo:['2026-12']});
const dChips=D.contratos.find(c=>c.chave===chips.chave);
t(D.mesesProjecao.join()==='2026-10,2026-11,2026-12'&&dChips.porMes.filter(p=>p.alvo).map(p=>p.mes).join()==='2026-12','Meses-alvo parametrizáveis (exercícios seguintes): só dezembro em foco, sequência preservada');
const E=M.analisar({movimentos:F.movimentos.map(r=>({...r,Chave_Empenho:r.Chave_Empenho.replace(/^2026/,'2027'),Mes_Referencia:r.Mes_Referencia.replace(/^2026/,'2027'),Data_Efetivacao:r.Data_Efetivacao.replace(/^2026/,'2027')}))},{hoje:'2027-10-22',exercicio:2027});
t(E.contratos.length===A.contratos.length&&E.mesesAlvo.join()==='2027-11,2027-12','Exercício 2027 com padrão nov/dez');

// 11. Vigência: meses após o fim não são projetados
const V=M.analisar({...base,contratos:[{chave:chips.chave,vigencia_fim:'2026-11-30'}]},OPT);
const vChips=V.contratos.find(c=>c.chave===chips.chave);
t(vChips.porMes.find(p=>p.mes==='2026-12').despesa===0,'Vigência informada até 30/11: dezembro sem despesa projetada');

console.log((falhas?'FALHOU ':'TODOS OS ')+ok+' teste(s) do motor de contratos continuados'+(falhas?' — '+falhas+' falha(s)':' PASSARAM'));
process.exitCode=falhas?1:0;
