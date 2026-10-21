# SIG — Intenções de COTEP (v2, 21/10/2026)

Ferramenta central da DTS-1 para controlar o **limite anual de COTEP por elemento-item**, organizar as intenções dos centros e impedir que novas intenções ou COTEPs comprometam valores já consumidos ou reservados.

## Critério de controle (operacional PMMG)
- Unidade de controle: **elemento-item** (ex.: 3016, 5207).
- Limite parametrizado por **exercício e unidade gestora** em `sig_cotep_limites` (2026 / UG 1250071: **R$ 65.492,11** por elemento-item).
- A base normativa fica registrada no parâmetro e marcada como **«Pendente» de validação jurídica institucional**. Somente o administrador registra a validação, com documento (parecer/nota técnica).

| Grandeza | Regra |
|---|---|
| Consumido | COTEPs realizadas: `Finalizada` pelo valor homologado/negociado; `Realizada (a conferir)` pelo valor informado até a DTS-1 confirmar o homologado |
| Comprometido | COTEPs `Em andamento` (estimado do item) + intenções com reserva aprovada |
| Saldo | limite − consumido − comprometido |
| Intenções pendentes | exibidas à parte; **não abatem** o saldo |
| Fracassada / Deserta / Cancelada | não ocupam limite; intenções vinculadas voltam à fila como pendentes |

Sem dupla contagem: ao gerar a COTEP, a reserva da intenção é **transferida** para o item da COTEP (a intenção fica `Em COTEP`, com reserva zero). Ao finalizar, o homologado substitui o estimado e a diferença é liberada automaticamente (o evento informa o valor liberado).

## Validação com os dados de 2026
| Elemento-item | COTEPs | Consumido + comprometido | Saldo |
|---|---|---|---|
| 3016 | 43, 48, 64, 126 (R$ 2.896,00 homologado) + 130 em andamento (R$ 674,95) | R$ 59.617,57 | **R$ 5.874,54** |
| 5207 | 95 + 130 em andamento (R$ 23.599,00) | R$ 64.299,00 | **R$ 1.193,11** |

A COTEP 130/2026 é **um** procedimento (`sig_cotep_coteps`) com **dois** lançamentos (3016 e 5207), cada um controlado no seu código. Os demais registros (3024, 5203, 3964, 3921 e 122/2026 fracassada) foram preservados.

## Uso
**Centros (qualquer conta ativa do SIG):** abrir *Intenções COTEP*, clicar no cartão do elemento-item e preencher centro, objeto, valor, prioridade e justificativa. O formulário mostra o saldo atual e o saldo se a intenção for aprovada. Para um código que não aparece, use *Outro elemento-item* (o catálogo é aberto). Intenções pendentes ou devolvidas podem ser editadas/canceladas pelo autor.

**DTS-1 (gestores habilitados pelo administrador em *Parâmetros → Gestores DTS-1*):**
- *Fila de intenções*: reservar com um clique (o banco recusa se faltar saldo), analisar (ajustar reserva, liberar, devolver, rejeitar, priorizar, agrupar).
- Selecionar várias intenções → **Gerar COTEP** (aceita vários elementos-itens; informe o número de uma COTEP em andamento para acrescentar intenções a ela).
- *COTEPs*: registrar/editar procedimento com um ou mais elementos-itens, situação e valores; vincular a processo de compra do SIG (modalidade COTEP).
- *Parâmetros*: limite do exercício/UG, catálogo de elementos-itens, centros e gestores.

Alertas no cartão: **utilização elevada** (≥ 80%), **saldo insuficiente** (pendentes > saldo), **limite atingido** e **limite excedido**.

## Segurança e integridade
- Escrita somente pela RPC `sig_cotep_acao` (SECURITY DEFINER, valida conta ativa, gestor e administrador). Tabelas com RLS e apenas SELECT para contas ativas; auditoria visível só à DTS-1.
- **Concorrência:** cada alteração que aumenta o valor ocupado obtém bloqueio transacional por (exercício, UG, elemento-item) e o gatilho `sig_cotep_*_limite` reconfere o saldo antes do COMMIT. Duas reservas simultâneas que juntas excedem o saldo: só a primeira é aceita.
- Exceção ao limite (registrar fato já homologado acima do teto): somente administrador, com justificativa ≥ 20 caracteres, registrada no histórico.
- Nenhum registro pode ser excluído (gatilho bloqueia DELETE); itens retirados de uma COTEP são inativados.
- Histórico: `sig_cotep_eventos` (trilha legível com valor e elemento-item) e `sig_cotep_auditoria` (antes/depois de cada linha).
- Não altera V5/V6/V7, AIPC, processos, empenhos, cotas ou almoxarifado; a tabela antiga `sig_cotep_bases` foi mantida apenas para consulta.

## Implantação
1. No Supabase (SQL Editor), aplicar `database/migrations/20261021_sig_cotep_v2_elemento_item.sql` (transação única; pode ser reaplicada).
2. Conferir: `select * from sig_cotep_saldos where ano = 2026 order by elemento_item;` — 3016 saldo 5.874,54 e 5207 saldo 1.193,11.
3. Administrador confirma gestores DTS-1 e, após manifestação jurídica, marca o limite como «Validada».
4. DTS-1 confirma o homologado das COTEPs «Realizada (a conferir)» (43, 48, 64, 95 e outras) e a UG provisória 1250071.

## Testes
- `node gestao/tests/teste_cotep_calculo.cjs` — motor de cálculo com os dados de validação.
- `gestao/tests/sql/run.sh` — PostgreSQL local (≥ 15) com simulação do Supabase: aplica as migrations sobre o histórico importado e executa 64 verificações (saldos, permissões, RLS, conversão sem dupla contagem, liberação de diferença, exceção, exclusão bloqueada) e o teste de concorrência com duas sessões simultâneas.
- `gestao/tests/smoke.html?auto` — inclui 5 testes do painel em modo demonstração (desktop e celular 375 px).
