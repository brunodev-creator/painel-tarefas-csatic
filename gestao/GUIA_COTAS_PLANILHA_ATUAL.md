# Cota orçamentária — leitura do DASHBOARD da PLANILHA ATUAL

## Fontes e significado

- Planilha vinculada: `agora vai - PLANILHA ATUAL`, ID `1dxzDySXU1h5BKJkW1_mHpNX9KRwgX6Ol5b_kRqeRrJA`.
- Aba de origem: `DASHBOARD`, cabeçalho na linha 8, dotações a partir da linha 9.
- Tela: SIG Online → **Cota orçamentária** → **Saldos por dotação**.
- Somente os valores provenientes da planilha são apresentados. O snapshot no Supabase não é uma consulta em tempo real ao Google.
- **Orçamentário** = soma de `Total_Repassado_Dotacao`.
- **Valor empenhado** = soma de `TOTAL_EMPENHADO`.
- **Saldo atual** = diferença entre as duas colunas anteriores, conferida contra `Saldo_A_Destinar`.
- Conta global 998020301: `00EE` no BO é apresentado como `EEXX`. Conta de item definido: 998020302.
- Filtros por dotação, tipo e conta; detalhe por dotação e exportação CSV para perfis financeiros.
- O painel DASHBOARD possui cálculos próprios. **Não confundir `TOTAL_EMPENHADO` do DASHBOARD com `valor_abatido_gerencial_centavos` do relatório V6**, que usa regras distintas para abatimento, TDCO e dotações ambíguas.
- Números de uma posição importada não comprovam saldo oficial disponível no SIAFI-MG.

## Como visualizar (já importado)

1. Acesse `https://brunodev-creator.github.io/painel-tarefas-csatic/gestao/`.
2. Entre no ambiente institucional com um perfil autorizado.
3. Clique em **Cota orçamentária**. A página lê somente o snapshot `DASHBOARD` protegido no Supabase.
4. Use **Atualizar consulta** para reler o snapshot do banco e conferir os valores, sem alterar a planilha.

## Como atualizar os dados depois de novas alterações no Google Sheets

1. No arquivo correto, abra **Extensões → Apps Script**.
2. Abra/crie `SIG_FONTE_ATUAL_AppsScript.gs` e substitua o código pelo arquivo de mesmo nome existente em `gestao/integracao/` no GitHub.
3. Salve e execute `sigFonteInstalarMenu` uma vez (autorizando o Google conforme necessário).
4. Na planilha, clique **SIG — Fonte Oficial → Baixar snapshot JSON para SIG**.
5. Entre como administrador no SIG, abra **Motor de Dados** e importe o novo JSON da fonte oficial. A versão V2 inclui seis abas, inclusive o DASHBOARD.
6. Volte para **Cota orçamentária → Atualizar consulta**. Conferir quantidade, origem e posição temporal.

**Ainda é um processo de atualização manual**. A automação direta Google Sheets → Supabase requer configurar autenticação server-side, permissão Google institucional e disparador autorizado; não implementar endpoint público nem publicar credenciais no GitHub.

## Acesso e proteção

- Banco: `public.sig_planilha_snapshots`, RLS habilitada.
- Registro `DASHBOARD`: leitura somente por usuários autenticados, ativos e com perfil autorizado; os demais cinco snapshots seguem restritos aos perfis financeiros.
- Atualizações em lote: RPC `sig_planilha_importar_snapshot`, somente administrador ativo.
- Não incorporar este snapshot diretamente aos processos, tarefas, contratos ou empenhos operacionais.
- A hospedagem de dados internos no piloto depende de aprovação institucional, avaliação de segurança e políticas da PMMG.
