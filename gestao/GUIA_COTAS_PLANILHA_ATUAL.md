# SIG — Conferência contábil-gerencial V6

## Posição publicada (BO de 19/10/2026)

Planilha vinculada: [agora vai - PLANILHA ATUAL](https://docs.google.com/spreadsheets/d/1dxzDySXU1h5BKJkW1_mHpNX9KRwgX6Ol5b_kRqeRrJA/edit).

| Indicador | Valor |
| --- | ---: |
| Dotações com cota | 43 |
| Documentos de repasse | 328 |
| Empenhos indexados | 192 |
| Abatidos na global (conta 998020301) | 105 |
| Abatidos na específica (conta 998020302) | 79 |
| TDCO excluídos do abatimento | 2 |
| Valor líquido zero — não abatidos | 6 |
| Empenhos com valor positivo sem alocação | 0 |
| Correções históricas de dotação 0000 → 0001 aprovadas | 5 |
| Alocações manuais aprovadas | 1 |
| Alertas pendentes de conferência | 46 |
| Cota líquida BO | R$ 88.250.822,15 |
| Abatimento gerencial V6 | R$ 85.819.873,38 |
| Diferença gerencial **NÃO OFICIAL** | R$ 2.430.948,77 |

O empenho **19/2026** foi alocado **manualmente à cota específica 3921**, no valor de R$ 96.469,63. Resta R$ 352,78 nesta cota. A cota global 39XX de R$ 21.400,00 continua atribuída ao empenho 215/2026 e não houve duplo abatimento. Essa decisão está documentada em `SIG_V6_ALOCACOES_APROVADAS`.

As correções históricas dos empenhos 18, 56, 169, 212 e 217 estão registradas em `SIG_V6_CORRECOES_APROVADAS`; as dotações importadas originais não foram substituídas.

## O que o SIG permite conferir

Acesse [SIG CSA-TIC](https://brunodev-creator.github.io/painel-tarefas-csatic/gestao/) → **Cota orçamentária**.

- Visão geral com 43 dotações, cotas, abatimentos gerenciais e diferenças.
- Detalhe de cada dotação: lista dos empenhos que abateram aquela cota e respectivos valores.
- Relação de 192 empenhos, com filtros por número, processo, dotação e resultado; veja os oito excluídos e as regras aplicadas.
- Resumos de global/específica, TDCO, correções históricas, alocação manual e alertas de conciliação.
- No detalhe de uma dotação, campo opcional para informar o valor obtido em outro sistema contábil e visualizar a diferença **(contábil − gerencial SIG)**. Esse valor não é transmitido nem gravado.
- Exportação de dotações e, para perfis financeiros, dos empenhos em CSV.
- Identificação separada de **data da posição BO** e **data da extração/importação no SIG**.

**Os valores V6 são gerenciais.** Não são saldo disponível no SIAFI-MG, não comprovam a posição atual de um documento de repasse nem substituem a conferência da unidade contábil.

## Proteção e rastreabilidade

O Supabase guarda 12 snapshots em `public.sig_planilha_snapshots`: as seis fontes anteriores mais `SIG_V6_RESUMO`, `SIG_V6_DOTACOES`, `SIG_V6_ABATIMENTOS`, `SIG_V6_ALERTAS`, `SIG_V6_CORRECOES_APROVADAS` e `SIG_V6_ALOCACOES_APROVADAS`.

Acesso de leitura condicionado à autenticação e perfil autorizado, com RLS. A importação utiliza RPC de uso exclusivo de administradores ativos. A versão V3 exige **todas as 12 abas no mesmo arquivo**, verifica quantidades de empenhos e os totais entre resumo, dotações e Dashboard e grava os registros atomicamente. O SIG exibe erro, e não totais parciais, caso a conciliação não corresponda ao Dashboard.

O snapshot da posição de 19/10/2026 já está sincronizado; dados operacionais (compras, licitações, contratos, empenhos editáveis) não foram sobrescritos.

## Como atualizar após novos lançamentos

**O motor está atualizado no GitHub, mas os arquivos Apps Script ainda precisam ser instalados ou substituídos no projeto vinculado à planilha.** Não foram automaticamente implantados no editor do Google.

1. Abra a planilha → **Extensões → Apps Script**.
2. Atualize o conteúdo de [SIG_V6_Conciliacao_Atual.gs](./integracao/SIG_V6_Conciliacao_Atual.gs) no projeto. O motor preserva correções 0000→0001 com cota global ou específica e decisões manuais aprovadas com dotação e valor idênticos.
3. Execute `sigV6InstalarMenu` apenas se o menu ainda não estiver instalado; depois **SIG V6 (conciliação) → Gerar conciliação local**.
4. Confira `SIG_V6_RESUMO`, `SIG_V6_DOTACOES`, `SIG_V6_ABATIMENTOS`, `SIG_V6_ALERTAS`. Resolva os alertas pertinentes.
5. Quando estiver validado, execute **Publicar abatimentos no DASHBOARD (após conferência)**. A ação faz backup do Dashboard, verifica dotações e exige confirmação.
6. Atualize também [SIG_FONTE_ATUAL_AppsScript.gs](./integracao/SIG_FONTE_ATUAL_AppsScript.gs), que agora gera `SIG_FONTE_ATUAL_V3` com 12 abas e recusa totals divergentes.
7. Exporte o JSON no Google Sheets, entre como administrador no SIG → **Motor de Dados → Importar JSON da fonte oficial**. Não use o exportador V2 antigo.
8. Volte à **Cota orçamentária → Atualizar consulta**, verificando data BO, número de registros, totais e decisões.

**Não há sincronização Google Sheets → Supabase em tempo real**. O botão "Atualizar consulta" apenas relê o último conjunto importado no banco. Rotinas legadas da planilha podem recalcular o Dashboard sem passar pelo motor V6; em tal situação, o exportador V3 bloqueia a importação até que os relatórios sejam consistentes.

A hospedagem e uso de dados institucionais devem seguir as autorizações e políticas de segurança aplicáveis da PMMG.


## Exceção temporária: diárias (19/10/2026)

Por decisão expressa do responsável, as dotações de diárias militares do elemento `3390.15` deixam de integrar **o quadro principal de cotas e o subtotal gerencial operacional do SIG**. Todas aparecem em uma **tabela específica de diárias**, inclusive a dotação `3390.1501` de cota zero.

A única dotação de diárias presente no extrato contábil fornecido foi `1251.06.181.137.4365.0001.3390.15XX.60.2.0` (normalizada `12510618113743650001339015006020`), com referência provisória de **R$ 2.085,00**, consulta ao Portal Contábil de 19/10/2026 às 11h54. Esse valor está armazenado separadamente em `public.sig_cotas_diarias_referencia` com origem, justificativa, data e RLS. É uma **referência manual histórica**, não um abatimento nem uma atualização ao saldo oficial. A entrada pode se tornar desatualizada: conferir novamente no Portal Contábil.

As dotações `2500 · 3390.15XX · 10.1.0` e `2061 · 3390.15XX · 60.2.0`, não visualizadas no extrato contábil apresentado, são exibidas na tabela de diárias como **não confirmadas**, sem presumir saldo de zero. A específica `4365 · 3390.1501` também fica separada e sem referência contábil confirmada.

**Totais da visualização gerencial com posição da planilha em 19/10/2026:**

| Indicador | Valor |
| --- | ---: |
| Cota BO original, inclusive diárias | R$ 88.250.822,15 |
| Abatimento gerencial V6 original | R$ 85.819.873,38 |
| Diferença gerencial V6 original (imutável) | R$ 2.430.948,77 |
| Cota BO do quadro principal, **sem diárias** | R$ 87.993.199,35 |
| Abatimento V6 do quadro principal, **sem diárias** | R$ 85.819.873,38 |
| Diferença V6 do quadro principal, **sem diárias** | R$ 2.173.325,97 |
| Referência manual de diárias considerada na consulta | R$ 2.085,00 |
| **Referência total de conferência, NÃO OFICIAL** | **R$ 2.175.410,97** |

O quadro principal passa a conter 39 dotações (23 com diferença distinta de zero na posição analisada). A tabela separada apresenta quatro dotações de `3390.15`. A opção "Mostrar todas" abrange apenas as 39 dotações **não-diárias**. O campo de pesquisa e o CSV do quadro principal também não trazem diárias.

**Integridade:** a fonte `DASHBOARD`, as abas `SIG_V6_*`, os registros de empenhos e o snapshot original do Supabase são preservados. Nenhum abatimento artificial foi lançado ou apresentado como real. O ajuste é exclusivamente de **apresentação e referência de conferência**, até existir método verificável de tratamento das diárias.


## Descrição resumida das dotações (interface)

O menu **Cota orçamentária → Saldos por dotação** apresenta agora a coluna
**Descrição da despesa** ao lado da classificação. O rótulo é derivado da
**natureza/elemento-item** e a linha menor explica a **função/subfunção**
(segurança pública, administração, saúde ou ensino fundamental).

Exemplos: `3390.15XX` (diárias militares), `3390.3913` (tarifas de água e
esgoto), `3390.3921` (reparos de equipamentos), `3390.4003` (serviços
PRODEMGE), `3390.4004` (telecomunicações), `3390.4005` (Rede IP
Multisserviços), `4490.5206` (comunicação e telefonia) e `4490.5207`
(equipamentos de informática). Classificações globais mostram apenas o
elemento, sem presumir um item ou bem específico.

As descrições constam também da tabela separada de diárias, dos detalhes
da dotação, da busca por texto sem acentos e do CSV de cotas. A tabela de
empenhos continua indicando dotação original, dotação utilizada e processo.

**Limite:** o código informa a *natureza orçamentária*, mas não permite
determinar fornecedor, contrato, item comprado, destino da aquisição ou
saldo oficial. As descrições são auxiliares e não alteram nenhuma regra
de abatimento da V6, o snapshot, ou a apresentação separada das diárias.
O catálogo de leitura pode ser atualizado em
[`cotas-descricoes.js`](./assets/cotas-descricoes.js).
