# Cota orçamentária — Conciliação V6 na PLANILHA ATUAL

## Posição conciliada de 19/10/2026

- Origem: planilha `agora vai - PLANILHA ATUAL`, ID `1dxzDySXU1h5BKJkW1_mHpNX9KRwgX6Ol5b_kRqeRrJA`.
- 43 dotações com cota, 192 empenhos indexados, 328 documentos de repasse, 43 RIPC (aba ITENS_AQUISICAO sem registros no momento).
- Cota líquida BO: **R$ 88.250.822,15**.
- Abatimento gerencial por regra V6: **R$ 85.299.157,14**, em 180 empenhos.
- Diferença gerencial NÃO OFICIAL: **R$ 2.951.665,01**.
- Duas correções históricas 0000→0001 aprovadas foram recuperadas da planilha anterior, conferidas por chave e contra as cotas atuais e copiadas para `SIG_V6_CORRECOES_APROVADAS`.
- Dois TDCO (R$ 2.337.647,59) excluídos do abatimento, um empenho ambíguo não abatido e três empenhos sem cota correspondente após validar as correções.
- 50 alertas para conferência, 0 bloqueios. A ausência dos itens de RIPC explica grande parte dos alertas; não significa que os empenhos estejam ausentes.
- Backup anterior à alteração: `DASHBOARD_BACKUP_20261019` na mesma planilha.

## Relação das abas

- `SIG_V6_RESUMO` — consolidação numérica e limites.
- `SIG_V6_REPASSES` — repasse por ano, documento e dotação (sem repetir `Valor_Total_Repasse` do RIPC).
- `SIG_V6_DOTACOES` — valor da cota, RIPC, empenhos, abatimento gerencial e diferença por dotação.
- `SIG_V6_EMPENHOS` — índice normalizado e rastreabilidade dos empenhos.
- `SIG_V6_ABATIMENTOS` — classificação de cada empenho como global, específica, TDCO, ambíguo, sem cota ou zero.
- `SIG_V6_CONTINUOS` — referência auxiliar de serviços continuados.
- `SIG_V6_ALERTAS` — inconsistências a conferir.
- `SIG_V6_CORRECOES_APROVADAS` — correções documentadas por empenho; nunca deduzir correção automaticamente.
- `DASHBOARD` — resumo legado com valores de abatimento e diferença agora atualizados pela V6, **não equivalentes a saldo oficial**.

**Atenção:** o `DASHBOARD` legado é reconstruído por outras rotinas da planilha, ainda fora do GitHub. Uma nova execução dessas rotinas pode sobrescrever os valores V6 até que o motor seja instalado/encadeado corretamente.

## Instalação do motor V6 para atualizações futuras

O arquivo do motor preparado no GitHub é [SIG_V6_Conciliacao_Atual.gs](./integracao/SIG_V6_Conciliacao_Atual.gs). A conexão atual permite editar os dados do Google Sheets, mas **não instala arquivos Apps Script no projeto vinculado**.

1. Abra a PLANILHA ATUAL → **Extensões → Apps Script**.
2. Crie arquivo `SIG_V6_Conciliacao_Atual.gs`. Cole o código do GitHub. Evite criar uma segunda definição `SIGV6` se já existir outra instalação V6 no mesmo projeto.
3. Salve, selecione e execute `sigV6InstalarMenu` apenas uma vez e autorize as permissões do Google.
4. Reabra a planilha e clique **SIG V6 (conciliação) → Gerar conciliação local**. Confira `SIG_V6_RESUMO`, `SIG_V6_ABATIMENTOS` e `SIG_V6_ALERTAS`.
5. Compare a posição esperada com 43 dotações, 192 empenhos e 180 abatimentos da base de 19/10/2026. Em importações posteriores, esses números podem mudar legitimamente.
6. Somente após conferência, use **SIG V6 (conciliação) → Publicar abatimentos no DASHBOARD (após conferência)**. A ação exige confirmação, verifica os códigos e os valores de cotas e cria backup antes de atualizar o Dashboard.

A análise diária V6 é opcional. Ela atualiza apenas abas `SIG_V6_*`. A publicação no DASHBOARD permanece manual para evitar lançar resultados ambíguos automaticamente.

## Atualização do SIG

1. Execute a conciliação V6 e publique, com conferência, o Dashboard, se os controles permitirem.
2. Na planilha correta, instale/atualize também [SIG_FONTE_ATUAL_AppsScript.gs](./integracao/SIG_FONTE_ATUAL_AppsScript.gs) e execute o menu **SIG — Fonte Oficial → Baixar snapshot JSON para SIG**.
3. No SIG, como administrador, abra **Motor de Dados → Importar JSON da fonte oficial**. O formato V2 exige seis abas, inclusive `DASHBOARD`.
4. Abra **Cota orçamentária → Atualizar consulta**. Verifique data, valores e alertas da planilha.

O snapshot inicial de 19/10/2026 já foi atualizado diretamente no Supabase, portanto não exige importação manual adicional **para a posição atual**. Não existe sincronização contínua Google Sheets → Supabase; um clique em "Atualizar consulta" apenas consulta a última posição importada.

## Regras e segurança

- `SIG_V6` não altera abas de importação, `INDICE_EMPENHOS`, cadastros, tarefas, contratos nem históricos.
- Dotação global BO `00EE` é normalizada `EE00` para chave, exibida `EEXX`; itens específicos `EE01..EE99` mantidos separados.
- Empenhos com correspondente somente na específica abatem específica; somente na global, abatem global. Se ambas existirem, **nenhum abate automático**.
- TDCO e empenhos fora da UE 1250070 não são abatidos.
- Corrigir `0000` para `0001` apenas por registro aprovado, código original exato, alvo idêntico exceto pela mudança autorizada e cota existente.
- Cada empenho é abatido no máximo uma vez; RIPC não é descontado novamente.
- Valores gerenciais não substituem SIAFI-MG nem demonstram disponibilidade oficial para empenhar.
- Supabase aplica RLS e perfis autorizados à leitura do snapshot. A edição de código e utilização de dados reais dependem de autorização institucional e avaliação de segurança.
