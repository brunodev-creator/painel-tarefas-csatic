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
