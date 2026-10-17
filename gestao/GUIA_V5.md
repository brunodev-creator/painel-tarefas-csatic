# SIG CSA-TIC V5 — Motor de Dados da planilha saldos_2_0

**Esta versão NÃO conecta o Gmail restrito e NÃO transmite dados reais ao Supabase.** A planilha existente continua realizando sua importação normal por Apps Script.

## Instalação sem quebrar o Apps Script já existente

1. Abra a planilha `saldos_2_0` e escolha **Extensões → Apps Script**.
2. No menu de arquivos, clique **+ → Script**, nomeie `SIG_V5_AppsScript` e cole todo o conteúdo de [SIG_V5_AppsScript.gs](./integracao/SIG_V5_AppsScript.gs).
3. Clique **Salvar**.
4. No seletor de funções do editor, execute **sigV5InstalarMenu** uma única vez, autorizando os escopos que o Google apresentar. A função cria um acionador `onOpen` próprio, sem sobrescrever eventual `onOpen()` já existente.
5. Reabra/atualize a planilha: aparece o menu **SIG V5 (prévia)**.
6. Clique **Gerar análise (sem envio)**. Consulte a aba **SIG_V5_PREVIA** (nova aba; nenhuma das 39 originais é alterada).
7. Se a prévia não contiver bloqueios e você desejar estabelecer o ponto de comparação, clique **Registrar versão conferida**. Isso cria/atualiza **SIG_V5_ESTADO** e acrescenta eventos em **SIG_V5_HISTORICO** dentro da mesma planilha.
8. Após uma nova importação do BO, clique **Baixar relatório JSON**. O relatório contém métricas, assinatura e alertas, não as linhas originais. No site do SIG, abra **Motor de Dados** e selecione `SIG_V5_PREVIA.json`.

## Correção de consolidação de cotas — 17/10/2026

A chave `Ano|Doc_Repasse|Dotacao` identifica uma **posição financeira consolidada**, não uma movimentação isolada. A aba `IMPORT_SALDOS_BO` pode conter créditos e anulações para a mesma chave. A versão anterior gerava bloqueio incorreto.

A versão atual preserva **todas as linhas de movimentação** na contagem, soma os valores com sinal para construir o líquido e registra uma posição por chave no histórico. Exemplo verificado: +R$ 5.000,00 e −R$ 2.030,00 = **R$ 2.970,00**. Não apague uma das linhas.

A assinatura das movimentações inclui a `Linha_Original` da cota, que preserva a data da operação. Movimentos iguais em datas distintas não são tratados como duplicação. Se houver duas linhas exatamente idênticas, a V5 mantém um bloqueio preventivo para revisão, sem apagar o dado.

A prévia passa a mostrar **registros físicos**, **posições únicas** e **movimentações consolidadas**, além de uma tabela com chaves, linhas de origem e valores líquidos. O JSON também exibe os agrupamentos localmente.

**Atualização:** substitua apenas o conteúdo do arquivo `SIG_V5_AppsScript.gs` pelo código atualizado no GitHub, salve e rode novamente *Gerar análise (sem envio)*. Não é necessário executar `sigV5InstalarMenu` novamente nem editar `Código.gs`.

## O que o extrator interpreta

- `IMPORT_SALDOS_BO`: cota, ano, documento de repasse e dotação, com chave `Ano|Doc_Repasse|Dotacao`, que pode conter múltiplas movimentações assinadas e um valor líquido consolidado.
- `DESTINACAO_REPASSES`: registros RIPC identificados por `ID_RIPC`.
- `IMPORT_EXECUCAO_DESPESA_BO`: linhas da execução identificadas por assinatura de conteúdo; a primeira versão **não contabiliza automaticamente** movimentos nem os trata como fluxo incremental.
- `IMPORT_PROCESSOS_HOMOLOGADOS` e `CONTROLE_PROCESSOS_COMPRA`: processos e situação.
- `INDICE_EMPENHOS`: empenhos e saldos informados.
- `CONTROLE_SERVICOS_CONTINUOS`: cobertura/alerta do cadastro.

Identifica: colunas obrigatórias ausentes, campos essenciais vazios, valores monetários inválidos, chaves duplicadas e alterações desde a última versão registrada (novos, alterados e registros ausentes na posição atual).

**Importante:** o registro `AUSENTE_NA_POSICAO` significa que uma chave não apareceu no arquivo/posição mais recente; não comprova exclusão, anulação ou estorno. Datas e nomes de arquivo são excluídos da assinatura de conteúdo para não gerar mudanças artificiais.

## Regras de confidencialidade

- O Apps Script executa **dentro do Google Sheets ao qual o usuário já tem acesso**; não acessa a caixa de e-mail e não faz `UrlFetchApp`.
- A função de análise escreve somente `SIG_V5_PREVIA`; o armazenamento do histórico é executado **somente mediante confirmação**.
- O arquivo JSON de prévia é baixado pelo navegador via `HtmlService`; o usuário escolhe se deseja abri-lo no SIG.
- Na V5, o navegador lê esse JSON localmente e **não envia ao banco**. Não há credenciais ou chaves secretas no script.
- O código-fonte é público no GitHub. Não inclua dados, tokens, senhas ou conteúdo institucional no repositório.
- Ainda não há autorização técnica confirmada para transmissão automática de dados financeiros institucionais ao Supabase. Essa etapa deve ser submetida à área competente.

## Limitações e próximas validações

- O Apps Script ainda precisa ser executado pelo usuário na planilha verdadeira para confirmar escopos, formatação, cabeçalhos e desempenho; testes de sintaxe e de interpretação com dados fictícios não equivalem a homologação.
- Não deriva saldo oficial nem reconcilia integralmente a execução da despesa. A comparação por chave/assinatura deve ser validada antes de uso financeiro.
- A diferença entre cotas e destinações não pode ser utilizada isoladamente como disponibilidade para empenhar.
- Relatórios cumulativos não devem ser somados entre versões.
- Uma etapa posterior (V6) poderá enviar **somente dados previamente aprovados e minimizados**, via canal autenticado, para uma base operacional autorizada.
