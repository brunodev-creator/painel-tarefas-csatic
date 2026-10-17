# SIG CSA-TIC — V7 Auditoria de Processos de Compra e RIPC

## Objetivo

Confrontar modalidades de aquisição e valores informados no `RIPC` (cadastro manual) com as informações de homologação provenientes dos relatórios automaticamente importados pela planilha `saldos_2_0`.

**A V7 NÃO executa compras, não importa dados financeiros ao Supabase, não lê Gmail e não modifica a V5/V6.** A análise ocorre dentro da planilha e é visualizada no SIG com JSON local.

## Regras centrais

1. **Valor de referência não é valor homologado.** Um procedimento de R$ 1.000 de referência e R$ 500 homologados gera economia aritmética de R$ 500; o valor homologado é o parâmetro do resultado, e o empenho depende de conferência posterior nos sistemas oficiais.
2. **Fontes em hierarquia de confiabilidade**: `IMPORT_PROCESSOS_HOMOLOGADOS` (origem automática) > `CONTROLE_PROCESSOS_COMPRA` (controle derivado) > `DESTINACAO_REPASSES` (lançamento manual). Nenhum campo manual prevalece automaticamente sobre o campo extraído.
3. **Modalidade da contratação** (pregão, dispensa, inexigibilidade) e **via de aquisição** (compra em ata/registro de preços, SIRP, adesão/carona, contrato vigente) são conceitos diferentes. `Ata de RP` indica via de registro de preços, **não prova** SIRP ou carona.
4. **Dispensa por valor** não é classificada automaticamente como COTEP sem evidência. Não supor modalidade por nomenclatura abreviada.
5. **Vínculo de processo** só é automático quando existe identificador oficial completo do tipo `1250071 000023/2026` e coincidência exata. Registros do RIPC com valores como `1`, `52` e `60` permanecem sem associação automática.
6. **Comparação de valores**: o somatório de RIPC de um processo formal é confrontado com o valor homologado automático. Igualdade não prova execução completa; RIPC menor pode indicar aquisição parcial; RIPC superior sinaliza **revisão** e não erro definitivo.
7. **Modalidade divergente** sempre gera apontamento com as fontes; o sistema nunca sobrescreve o RIPC original sem decisão humana.

## Resultado do diagnóstico da posição histórica da planilha (junho de 2026)

- 11 homologações importadas automaticamente: 6 pregões, 2 dispensas e 3 dispensas por valor.
- 43 RIPC preenchidos manualmente.
- 5 RIPC possuem número de processo completo e são relacionados com segurança a registro automático.
- 38 RIPC possuem identificador abreviado e exigem referência adicional. Não considerá-los errados apenas por isso.
- Entre os 5 diretamente associados, há **uma divergência de modalidade** no processo `1250071 000023/2026`: relatório automático registra `Dispensa de Licitação - Por valor`, mas o RIPC declara `Pregão`, ainda que o valor homologado e o RIPC sejam R$ 1.230,00.
- Nenhum RIPC com número formal diretamente vinculado ultrapassou o valor homologado da importação na posição estudada.

## Como instalar

1. Faça uma cópia de segurança da `saldos_2_0`.
2. Abra **Extensões → Apps Script**.
3. Crie um arquivo **Script** novo chamado `SIG_V7_Processos`, sem apagar os arquivos existentes.
4. Copie o [código completo SIG_V7_Processos.gs](./integracao/SIG_V7_Processos.gs).
5. Salve; execute a função `sigV7InstalarMenu` uma única vez, revisando as permissões exibidas pelo Google.
6. Atualize o Google Sheets e clique **SIG V7 (processos) → 1. Auditar modalidades e valores**.
7. Revise as cinco abas locais: `SIG_V7_RESUMO`, `SIG_V7_PROCESSOS`, `SIG_V7_RIPC`, `SIG_V7_ALERTAS` e `SIG_V7_VINCULOS_CONFERIDOS`.
8. Se desejar visualizar a auditoria no site, clique no menu **2. Baixar JSON para SIG (local)** e importe na página **Auditoria de Compras V7**.

A interface não envia os dados ao Supabase. Pode salvar uma **cópia criptografada opcional neste navegador** pelo botão `Salvar cópia protegida`. Mantenha os JSON originais como backup.

## Quando o RIPC possui apenas um número abreviado

A aba `SIG_V7_VINCULOS_CONFERIDOS` é criada vazia. Só preencha após verificar documentos oficiais ou referência segura do processo. Para cada vínculo informe:

- `ID_RIPC` copiado exatamente da aba `DESTINACAO_REPASSES`;
- `Processo_Compra_Confirmado` em formato completo (ex. `1250071 000023/2026`);
- `Modalidade_Confirmada` (somente mediante documento);
- `Via_Aquisicao_Confirmada` (por exemplo `SIRP`, `Adesão/Carona`, `Ata de RP` ou `Contrato vigente`); 
- `Documento_Comprobatorio` (referência documental concreta, **não** inventada);
- `Conferido_Por`, `Conferido_Em`, `Observacao`.

**O código aceita como vínculo manual apenas o que possui número formal, referência com ao menos seis caracteres, autor e data da conferência.** Mesmo quando aceito, continua qualificado como vínculo manual, não valida sua autenticidade documental e não altera a planilha original.

Processos de registro de preços de origem externa, por exemplo adesões/carona, podem não existir no relatório de homologações da unidade; portanto, a falta de correspondência **não comprova problema**.

## Segurança e limites

- O script cria/atualiza somente `SIG_V7_*`; não escreve as abas de importação nem faz chamadas de rede.
- Os vínculos conferidos são manuais e exigem revisão humana. Nunca inventar processo, ata ou modalidade.
- A posição da fonte pode estar desatualizada; não concluir existência/ausência atual de homologação apenas pela planilha.
- Este motor ainda não classifica automaticamente origem SIRP/caronas sem informação expressa ou documentação.
- A origem de cada valor deve permanecer identificada; RIPC não é fonte autoritativa de homologação e empenho.
- Uso institucional com dados sensíveis exige autorização apropriada para planilha, navegador e ambientes.
