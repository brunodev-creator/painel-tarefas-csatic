# SIG CSA-TIC — V6 Conciliação Orçamentária Local

## Objetivo e escopo

A V6 lê diretamente a planilha `saldos_2_0` após a importação que já ocorre pelo Apps Script existente. **Não acessa o Gmail restrito, não faz `UrlFetchApp`, não chama o Supabase e não publica dados financeiros em repositórios.**

O processamento identifica diferenças entre **cota líquida**, **destinação em RIPC**, **saldo informado de empenhos** e **indicação de reforço de serviços**. Nenhum desses indicadores é automaticamente disponibilidade orçamentária, nem autorização para empenho.

## Instalar sem modificar a rotina que recebe e-mails

1. Faça uma cópia de segurança da planilha.
2. Abra a planilha e vá a **Extensões → Apps Script**.
3. Crie um arquivo **Script** chamado `SIG_V6_Conciliacao`.
4. Cole o código completo do arquivo [SIG_V6_Conciliacao.gs](./integracao/SIG_V6_Conciliacao.gs).
5. Salve e execute uma única vez a função `sigV6InstalarMenu`, conferindo as permissões pedidas.
6. Atualize a planilha. Abra o menu **SIG V6 (conciliação)** e clique **1. Gerar conciliação local**.
7. Confira as abas geradas: `SIG_V6_RESUMO`, `SIG_V6_REPASSES`, `SIG_V6_DOTACOES`, `SIG_V6_EMPENHOS`, `SIG_V6_CONTINUOS`, `SIG_V6_ALERTAS`.
8. Somente após conferir essas informações, selecione **2. Baixar JSON para SIG (local)** e abra o arquivo em **Conciliação V6** no [SIG CSA-TIC](https://brunodev-creator.github.io/painel-tarefas-csatic/gestao/).

O JSON é lido pela interface do seu navegador, em memória, **sem enviar os dados financeiros ao banco compartilhado**. É descartado ao recarregar a página.

## Ativar conferência diária opcional (apenas depois de validar)

Após confirmar o resultado manual, selecione **SIG V6 (conciliação) → 3. Ativar análise automática diária**.

O menu solicitará uma **hora entre 0 e 23**, no fuso definido pela planilha. Escolha uma hora posterior à importação habitual do Armazém. O horário é aproximado, conforme o Apps Script. A rotina compara a assinatura dos registros e só recria as abas V6 quando detectar uma nova posição; mantém o log `SIG_V6_LOG_AUTOMATICO`. **Não altera as 39 abas de origem**. Para desligar use **4. Desativar análise automática**.

Não configure a execução automática para registrar versões "conferidas" da V5: isso continuaria exigindo conferência humana, justamente para evitar aprovação automática de dados incorretos.

## Regras de interpretação verificadas

- **Cotas**: são movimentos, com créditos e anulações, e podem repetir `Ano|Doc_Repasse|Dotacao`. O saldo líquido é a soma algébrica.
- **RIPC**: soma por `ID_RIPC` apenas uma vez; `Valor_Total_Repasse` NÃO é somado, porque pode se repetir. `Valor_RIPC` é um valor em **reais**, mesmo quando aparece como inteiro (`1141390` = **R$ 1.141.390,00**). A conversão para centavos é somente interna, para evitar erros de ponto flutuante.
- **Itens de RIPC**: `Valor_Total` também está em reais e é comparado à soma das linhas do RIPC.
- **Dotações**: agrupadas por código; formas compactadas de empenho somente são normalizadas quando encontram correspondência exata já existente entre as cotas. Não é feita associação especulativa de códigos diferentes.
- **Empenhos**: o `INDICE_EMPENHOS` fornece o líquido e o saldo informado por `Chave_Empenho`. A V6 pode agrupar por dotação, mas **não deduz** que um empenho pertence a determinado documento de repasse ou RIPC.
- **Serviços continuados**: permanecem "prováveis" quando assim classificados na planilha. A sugestão de reforço precisa de conferência contratual e orçamentária.

## Resultado de validação com a posição de 30/06/2026 (histórico, não atual)

- 148 documentos de repasse identificados.
- 43 RIPC e 61 itens.
- 101 empenhos, 53 controles de serviços prováveis.
- Cotas líquidas: **R$ 68.135.366,09**.
- RIPC: **R$ 48.144.440,60**.
- Diferença informativa: **R$ 19.990.925,49**.
- Três alertas de `RIPC_SUPERA_DOCUMENTO`, referentes aos documentos 62, 96 e 115. São exceções de conciliação documental, **não irregularidades comprovadas**.
- A V6 reconheceu 54 empenhos em dotações conciliáveis às cotas por normalização conservadora. Os demais devem manter vínculos próprios.

## Limitações

1. Esta versão ainda NÃO sincroniza dados financeiros reais ao PostgreSQL externo, por depender de autorização institucional de segurança e hospedagem.
2. A V6 não substitui conciliação contábil, conformidade nem consulta aos registros oficiais BO/SIAD/SEI.
3. O agendamento diário observa mudanças na **planilha**, não observa o fim de cada execução do importador de e-mails. Se o importador terminar depois da rotina V6, a atualização aparecerá na próxima conferência.
4. Os alertas são heurísticos; o histórico de fluxos negativos é preservado sem concluir irregularidade.
5. Para produtividade multiusuário com dados reais, será necessário implantar uma base autorizada e um fluxo de publicação/validação dos registros.
