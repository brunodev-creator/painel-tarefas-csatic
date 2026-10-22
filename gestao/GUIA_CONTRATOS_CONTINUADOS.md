# SIG — Contratos Continuados (22/10/2026)

Módulo para os fiscais acompanharem seus contratos e informarem **quanto saldo adicional precisam até 31/12**, com foco em **novembro e dezembro de 2026** (período parametrizável para os exercícios seguintes). A análise já está pronta quando o fiscal abre o contrato; o único campo dele é:

> **Saldo adicional necessário até 31/12/2026 — R$**
> Informe quanto precisa acrescentar ao saldo disponível para atender à demanda até o fim do exercício.

Menu: **Contratos continuados** (todos os perfis com conta ativa; cada um vê o que as regras permitem).

## Fonte de dados

Somente a **«agora vai - PLANILHA ATUAL»**:

| Aba | Uso |
|---|---|
| `BASE_EXECUCAO_EMPENHOS` | Movimentos (empenho inicial, reforço, anulação, conformidade e anulação de conformidade), com `ID_Execucao`, data, mês de referência, dotação e unidade contábil. Base de todo o cálculo. |
| `SELECAO_SERVICOS_CONTINUOS` | Quais empenhos são controlados (`Controlar`) e média manual, quando houver. |
| `CONTROLE_SERVICOS_CONTINUOS` | Indicadores da regra anterior, guardados só para comparação no painel («Planilha (regra anterior)»). |
| `SIG_V6_CORRECOES_APROVADAS` | Correções históricas aprovadas de dotação (0000→0001). |
| `SIG_V6_ABATIMENTOS` / `SIG_V6_DOTACOES` (snapshots já existentes no SIG) | Disponibilidade orçamentária compatível, na visão gerencial (perfis financeiros). |

`EXECUCAO_MENSAL_SERVICOS_CONTINUOS` e `ALERTAS_SERVICOS_CONTINUOS` são derivadas da mesma base: o teste do motor confere que a consolidação mensal do SIG é **idêntica** à `EXECUCAO_MENSAL_SERVICOS_CONTINUOS` e que o saldo de cada empenho é **igual** ao `Saldo_Atual_Empenho` da planilha (39 empenhos do recorte; 67 na base completa, sem diferença).

**Limitação declarada:** o código Apps Script que gera `CONTROLE_SERVICOS_CONTINUOS` não está no repositório nem foi acessado. A regra anterior foi **reconstruída a partir dos dados** e conferida linha a linha:
`Media_Mensal_Historica = Total_Conformidade ÷ Qtd_Meses_Com_Conformidade`; `Media_Mensal_Ultimos_3_Meses` = média dos 3 últimos meses **com** conformidade; referência = últimos 3 meses quando há ≥ 3 meses, senão histórica (ou a manual); `Valor_Reforco_Sugerido = máx(0, referência × cobertura − saldo)`; `Valor_Reforco_Ate_Fim_Exercicio = máx(0, referência × 3 − saldo)` (outubro, novembro e dezembro), **por empenho**.

## Regras do SIG (motor `assets/continuados-motor.js`)

1. **Contrato ≠ processo ≠ fornecedor.** Contrato = número explícito no objeto («Contrato 8000034») + CNPJ; sem número, processo + CNPJ. Ex.: o contrato 8000034 (Rede IP, lote 9) reúne os processos 000036/2020 e 000037/2020; fornecedores diferentes nunca se misturam.
2. **Consolidação sem duplicidade.** Movimentos deduplicados por `ID_Execucao`; conformidades somadas por mês de referência e por **linha orçamentária** = contrato + unidade contábil + dotação até o elemento-item. Fontes do mesmo elemento-item e unidade são consolidadas (a execução pode migrar de fonte, como no contrato Motorola 139/2025, 60.2 → 10.1) e o detalhamento por fonte aparece no painel; **elementos, ações e unidades contábeis (TDCO) nunca se misturam** e o saldo de uma linha não cobre outra.
3. **Médias explicáveis.** Meses sem conformidade dentro do período de execução contam como zero. Referência = maior entre a média do exercício e a dos últimos 3 meses **fechados** (critério prudencial), com a frase «Referência calculada com base na execução de julho a setembro». Média manual da planilha prevalece quando informada.
4. **Periodicidade.** Pagamento único/anual (1 mês com conformidade e objeto anual/licença ou ≥ 90% do empenhado pago) **não vira mensalidade**. Histórico curto (1–2 meses) = estimativa de baixa confiança. Sem conformidade = sem estimativa: a necessidade fica com o fiscal. Empenho sem valor líquido não entra.
5. **Projeção sequencial.** Mês corrente: só o **restante** (referência − já conformado no mês), sem descontar de novo o que a base já reflete. Depois novembro e dezembro: o saldo usado em um mês não volta no seguinte. Vigência informada pela gestão encerra a projeção.
6. **Cinco grandezas separadas:** despesa projetada · saldo utilizável dos empenhos · necessidade de empenho/reforço · disponibilidade orçamentária compatível (V6, não oficial) · necessidade de orçamento adicional (**só** quando a cota de todos os empenhos da linha é identificada; TDCO ou cota não identificada ficam como necessidade de empenho/reforço).
7. **Conformidade não é competência** nem comprovação de nota paga — o painel avisa isso junto da «última conformidade».

## Inconsistências corrigidas (demonstradas com os dados de 22/10/2026)

| Inconsistência da regra anterior | Exemplo real | Correção |
|---|---|---|
| Chave `ano|UG|número` reúne dois empenhos TDCO distintos | `2026|1250071|1`: PRODEMGE (4490.4007, R$ 434.421,32) + Motorola (3390.3921 fonte 95.1, R$ 367.215,48) somados em R$ 801.636,80 | Separação por processo/dotação de cada movimento; soma preservada |
| Médias por empenho somadas em períodos incompatíveis | Motorola 139/2025: 9 empenhos esgotados da fonte 60.2, cada um projetando 3× a própria média | Média por linha, sobre a série consolidada do contrato |
| Pagamento anual repetido como mensalidade | Licenças TQS (1 ano): planilha projetava R$ 106.522,08 | Pagamento único: reforço 0, fiscal informa se houver renovação |
| Meses sem conformidade ignorados na média | Empenho 56 (PD CASE): R$ 485.850,86 → R$ 369.195,99 | Zeros dentro da execução entram na média |
| Outubro contado inteiro mesmo já pago | Todos os contratos (`× 3 meses − saldo`) | Mês corrente = só o restante |

Total «reforço até o fim do exercício» somando os empenhos da planilha: **R$ 16.843.860,06**. Estimativa do SIG para os mesmos 67 empenhos (36 contratos): **R$ 7.239.259,75** (restante de outubro R$ 841.808,22 · novembro R$ 2.702.107,84 · dezembro R$ 3.695.343,69). 20 contratos com falta, 4 com saldo justo, 8 cobertos, 3 de pagamento único e 1 sem histórico. A diferença vem das correções acima; os valores continuam **estimativas** para planejamento, não saldo oficial.

## Manifestação do fiscal, atendimento e planejamento

- Vazio = ainda não avaliou · **0** = avaliou e não precisa · valor positivo = necessidade. O valor é um **complemento**: o saldo disponível não é descontado de novo.
- «Preencher com a sugestão» só preenche o campo; nada é registrado sem **Salvar necessidade**. Cada salvamento é uma nova linha (usuário, nome, data, sugestão exibida na ocasião); o histórico não pode ser alterado nem excluído.
- **Atendimento:** reforços e empenhos **importados** após a primeira manifestação positiva. Solicitado preservado; atendido e pendente separados (atendida / parcial / pendente). Aprovação isolada não conta.
- **Planejamento sem dupla contagem:** para cada contrato, o pendente do fiscal **ou** (se não houver manifestação) a estimativa do sistema, com o total de cada origem identificado.

## Permissões (banco: RLS + RPC `SECURITY DEFINER`)

| Quem | Pode |
|---|---|
| Fiscal vinculado (qualquer perfil ativo) | Ver os próprios contratos, movimentos e histórico; registrar/alterar a necessidade (RPC `sig_cont_registrar_necessidade`) |
| Administrador | Vincular/desvincular fiscais (`sig_cont_vincular_fiscal`), definir o período (`sig_cont_definir_parametros`), sincronizar sem token |
| Gestão: administrador, DTS-1, SOFI, chefe da SOFI, chefia | Visão gerencial de todos os contratos, relatório CSV/impressão, vigência e observação (`sig_cont_atualizar_contrato`) |
| Demais | Nada além do aviso de que não há contrato vinculado |

A gestão **não** registra manifestação em nome do fiscal. Tabelas sem `INSERT/UPDATE/DELETE` para usuários: toda escrita passa pelas RPCs.

## Atualização automática

1. `integracao/SIG_CONTINUADOS_SINCRONIZACAO.gs` (mesmo projeto Apps Script e mesmo token de `SIG_SINCRONIZACAO_DIARIA.gs`): executar `sigContInstalarGatilho` uma vez. Roda **a cada hora**; retrato idêntico só é conferido.
2. RPC `sig_cont_sincronizar`: valida token e origem, recusa retrato vazio, numera o retrato (histórico preservado), atualiza contratos (ausentes ficam inativos, nunca excluídos) e **não toca** em manifestações e vínculos.
3. O painel relê o retrato vigente a cada 5 minutos e mostra «Planilha atualizada em … · importada em …».

**Situação em 22/10/2026:** migration aplicada no Supabase e carga inicial feita (retrato 1: 67 empenhos, 569 movimentos, 36 contratos; posição da planilha de 22/10/2026 08:02). Na carga inicial as descrições foram truncadas em 160 caracteres; a primeira execução do Apps Script envia os textos completos como novo retrato. **Pendente para o administrador:** instalar o script na planilha e vincular os fiscais em *Contratos continuados → Fiscais e parâmetros*.

## Testes

- `node gestao/tests/teste_continuados_motor.cjs` — 28 verificações com recorte real (`tests/fixtures/continuados_planilha_20261022.json`): consolidação = planilha, múltiplos empenhos, processo ≠ contrato, chave TDCO separada, TDCO sem compensação, novembro→dezembro sequencial, pagamento anual, histórico insuficiente, zeros na média, manifestação zero, atendimento parcial, planejamento sem dupla contagem, reimportação com duplicatas, período parametrizado, vigência.
- `gestao/tests/sql/run.sh` — `15_testes_continuados.sql`: 41 verificações de token, origem, retrato vazio, RLS por fiscal/gestão/terceiro, só RPC grava, histórico imutável, reimportação sem duplicar e sem perder manifestação/vínculo.
- `gestao/tests/smoke.html?auto` — 4 testes de interface (fiscal, campo único vazio × zero × valor, sugestão não salva sozinha, gestão, celular 375 px).
