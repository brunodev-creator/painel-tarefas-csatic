# Auditoria de UX — SIG CSA-TIC (`gestao/`)

Data: 19/10/2026 · Escopo: código em `gestao/` (branch `main`, commit `38c0986`) e uso real em modo demonstração (dados fictícios), em 1440px e 375px.

**Teste aplicado a cada achado:** *isso reduz cliques, campos, digitação ou dúvida do militar?*

---

## 1. Mapa técnico

| Item | Situação encontrada |
|---|---|
| Stack | Site estático (HTML + CSS + JavaScript puro, sem framework, sem etapa de build). Hospedado no GitHub Pages. |
| Backend | Supabase: PostgreSQL com RLS, Auth (GoTrue), REST/PostgREST, RPCs e Edge Function `gerenciar-usuarios` (Deno). Chave **pública** embutida em `app.js`; `service_role` nunca vai ao navegador. |
| Arquivos principais | `gestao/index.html` (casca), `assets/app.js` (≈2.150 linhas: estado, telas, formulários, regras de UI, camada REST), `assets/styles.css` (base antiga, paleta azul/verde), `assets/institucional.css` (sobrescreve com a paleta grafite + cáqui), `assets/login-*.{css,js}`. Módulos em arquivos próprios: `almoxarifado.js`, `cotas*.js`, `fonte-planilha.js`, `v6.js` (conciliação), `v7.js` (auditoria de compras), `vault.js` (cofre local cifrado), `version-watch.js`. |
| Modos | **Institucional** (padrão: exige login) e **demonstração** (dados fictícios no `localStorage`, escolhido explicitamente em Configurações). |
| Autenticação | E-mail + senha no Supabase Auth; convite por e-mail com definição de senha (≥ 12 caracteres); recuperação por link; sessão em `sessionStorage`, renovação por `refresh_token`. Perfil (`usuarios.role/setor/ativo`) lido do banco após o login; conta inativa é desconectada. |
| Permissões | Perfis `admin`, `chefia`, `chefe_compras`, `chefe_licitacao`, `chefe_sofi`, `compras`, `licitacao`, `sofi`, `leitura`. Menus por perfil em `SIG_ROLE_MENUS`; escrita por `canWrite(setor)`, finanças por `canFinance()`, AIPC só pela Compras (`canEditAipc`). A UI esconde, mas **a autorização real está no banco (RLS + RPCs)**. Admin tem "Visualizar como" (prévia somente leitura). |
| Leitura de dados | `fetchCloud()` carrega 14 tabelas (`processos`, `tarefas`, `tramites`, `eventos`, `aipc`, `aipc_revisoes`, `empenhos`, `solicitacoes_empenho`, `contratos`, `competencias_contratuais`, `repasses`, `notificacoes`, `usuarios`, `licitacao_demo`) em duas etapas (rápida + complementar). Acompanhamento intersetorial via RPCs `listar_processos_compartilhados` / `historico_processos_compartilhados`. |
| Escrita | `persist()` (POST/PATCH com controle otimista `updated_at`), e RPCs atômicas: `encaminhar_demanda` (tramitação + tarefa de destino + histórico), `assumir_tarefa`, `salvar_aipc`, `registrar_ocorrencia`, `gerar_contrato_demonstrativo`, `salvar_especificacoes_demonstrativas`. |
| Regras financeiras (UI) | Destinado ≤ recebido no repasse; executado ≤ empenhado; solicitação só vira "Empenhado" com empenho vinculado; competência única por contrato; avisos de que nada substitui SIAFI/SIAD. |
| Trilhas de auditoria | Tabelas `eventos` (linha do tempo), `tramites` (encaminhamentos), `aipc_revisoes`; conclusão de tarefa exige justificativa (≥ 8 caracteres) e registra autor/data; tarefa concluída não reabre. |
| Testes | O README cita `tests/test_ui.py`, `test_v2.py`, `test_cloud_v2.py`, mas **a pasta `tests/` não existe no repositório**. Há apenas `window.SIG_TEST` exposto para testes. |

### Menus (ordem exibida por perfil)

- **Compras:** Avisos · Minhas tarefas · Compras · Almoxarifado · Cota orçamentária · Processos · Assistente
- **Licitação / SOFI:** idem, trocando "Compras" pela própria seção
- **Chefias:** + Painel da chefia
- **Leitura:** Avisos · Minhas tarefas · Processos · Assistente
- **Admin:** os 18 menus (inclui Pendências, Visão geral, Motor de Dados, Conciliação V6, Auditoria V7, Contratos, Recebimentos, Usuários)

---

## 2. Tarefas mais frequentes — caminho atual e atrito

Contagem a partir da tela inicial do perfil, em cliques (C) e campos digitados/escolhidos (F).

| # | Tarefa | Caminho atual | C / F | Atrito |
|---|---|---|---|---|
| 1 | **Saber o que fazer hoje** | Militar cai em "Compras" (ou "Minhas tarefas"). Precisa abrir também *Minhas tarefas*, *Fila disponível* e o sino de *Avisos*. "Pendências" (processos parados) **só existe no menu do admin**. | 3–4 C, 3 telas | Não há um lugar único com "o que exige ação agora". Processos parados não aparecem para quem pode agir. |
| 2 | **Assumir tarefa da fila** | Minhas tarefas → aba *Fila disponível* → Assumir | 3 C | A aba padrão *Minhas tarefas* abre **vazia** quando nada foi atribuído — sem pista de que há itens na fila. Abas sem contagem. |
| 3 | **Concluir tarefa** | Minhas tarefas → Concluir → justificativa → Concluir | 3 C / 1 F | Aceitável. No celular, a tabela de 7 colunas exige rolagem horizontal até o botão. |
| 4 | **Criar tarefa vinculada a processo** | Detalhe do processo → + Tarefa → 7 campos | 2 C / 4–7 F | Título, prazo e prioridade **não aproveitam** os dados do processo (próxima providência, prazo, prioridade). |
| 5 | **Encaminhar processo** | Minhas tarefas → Encaminhar → 6 campos (destino e prazo já sugeridos) | 2 C / 2–4 F | Trocar o *Destino* dispara **erro de JavaScript** (`f-destinatario_auth_id` inexistente). Motivo e próxima ação sempre digitados. |
| 6 | **Nova demanda de Compras** | Compras → + Nova demanda → 8 campos visíveis + 10 em "Mais detalhes" | 2 C / 4–8 F | Bom uso de campos por modalidade. Responsável já preenchido. |
| 7 | **Preencher AIPC** | Tarefa → Preencher AIPC → até 34 campos + 6 por item | 2 C / 10–40 F | Objeto, valor, dotação, modalidade e SEI já vêm do processo (bom). **Chefe da Compras, ordenadores, unidade executora e preposto são redigitados em toda AIPC**, embora quase não mudem. |
| 8 | **Solicitação de empenho (SOFI)** | SOFI → Solicitar → 7 campos | 2 C / 3–5 F | Dotação vem do processo apenas se aberto pela linha; ao trocar o processo no seletor, nada é preenchido. Valor começa em **0**, mesmo havendo valor homologado e empenhos registrados. |

---

## 3. Achados

### 3.1 Dados digitados mais de uma vez

| Dado | Onde é digitado | Observação |
|---|---|---|
| Objeto, valor, dotação, modalidade, SEI | Processo → AIPC → Solicitação de empenho → Empenho | AIPC já reaproveita; solicitação/empenho reaproveitam só parcialmente. |
| Chefe da Compras, ordenador e substituto, unidade executora, preposto | Toda AIPC | Mesmos nomes a cada processo. |
| Próxima providência / prazo / prioridade | Processo e depois na tarefa | Tarefa não herda do processo. |
| Números de especificação de empenho | Digitados um a um (até 50) na Licitação | Já existem no SIAD/planilha — candidato a integração. |
| Itens (código SIAD, descrição, quantidade, valores) | AIPC, e de novo no SIAD/Portal de Compras | Candidato a integração/importação. |
| Saldos, empenhos, repasses | Lançados à mão + importados da PLANILHA ATUAL (V5/V6) | Duas fontes da mesma informação. |

### 3.2 Campos que poderiam ser preenchidos automaticamente

- Tarefa criada a partir de processo: título ← próxima providência, prazo ← prazo do processo (se futuro), prioridade ← prioridade do processo.
- AIPC nova: seção "Preposto e responsáveis" e "Unidade executora" ← última AIPC registrada (editável).
- Solicitação de empenho: dotação ← processo escolhido; valor ← valor homologado − empenhos ativos/encerrados do processo (já calculado em `moneyToCommit`).
- Empenho: dotação ← processo escolhido.
- Responsável/autor: já é automático (sessão) — manter.

### 3.3 Inconsistências visuais

- **Duas paletas sobrepostas:** `styles.css` (azul-marinho/verde-água) e `institucional.css` (grafite/cáqui). Sobram traços da antiga: foco dos campos verde-água (`#20a99c`), ícones de KPI vermelho/azul, barra de progresso e textos de atraso com cores fixas no JavaScript (11 `style="…"` em `app.js`).
- **Sete variantes de cartão de indicador** (`kpi`, `v4-kpi`, `v5-metric`, `v3-tile`, `sig-chief-stat`, `sig-buy-metric`, `budget-card`), com tamanhos e pesos diferentes.
- **Quatro estados vazios diferentes** (`empty()`, `.table-empty`, `.sig-buy-empty`, `.sig-chief-empty`).
- Botões: `.btn.small` com ~28px de altura e fonte 11px; primário com gradiente só em parte das telas.
- Tipografia: mistura de 10px, 10,5px, 11px e 12px para textos de apoio; duas famílias (DM Sans, Manrope) carregadas por `@import` (bloqueia renderização).
- Mensagens: todo toast tem o mesmo visual — sucesso e erro são indistinguíveis; somem em 3,5s.
- Código morto: `financeView`, `contractsView` e `recebimentosView` não são chamados.

### 3.4 Responsividade e acessibilidade

- **Tabelas no celular:** `min-width: 840px` → rolagem horizontal; botões de ação ficam fora da tela. Na aba vazia, a mensagem "Nenhuma tarefa nesta fila" fica **escondida** à direita (verificado em 375px).
- No celular, a tela inicial empilha botões, aviso de demonstração e 4 KPIs antes de qualquer item acionável.
- **Contraste insuficiente** (WCAG AA 4,5:1): rodapés de KPI `#8b98a7` (~2,9:1), cabeçalhos de tabela `#8290a2` (~3,3:1), estado vazio `#91a0af` (~2,6:1).
- Foco: `textarea` sem anel de foco institucional; modal não devolve o foco ao botão de origem.
- Navegação: item ativo do menu sem `aria-current`; botão "Atualizar" (↻) só com `title`.
- Alvos de toque: `.btn.small` abaixo de 44px.
- Envio de formulários: botão não indica "Salvando…" nem bloqueia duplo clique visualmente (há trava `busy`, mas sem retorno).

---

## 4. Melhorias priorizadas (impacto × risco)

| Prioridade | Melhoria | Impacto | Risco | Lote |
|---|---|---|---|---|
| 1 | Painel **"Exige sua ação agora"** no topo da tela inicial de cada perfil (atrasadas, vencendo em 3 dias, fila da seção, processos parados da seção, avisos não lidos), com ação de 1 clique | Alto | Baixo (só leitura + ações já existentes) | **1** |
| 2 | Tabelas viram **cartões no celular** (sem rolagem horizontal) | Alto | Baixo (CSS + rótulos) | **1** |
| 3 | **Abas de tarefas com contagem** e atalho para a fila quando "Minhas tarefas" está vazia | Alto | Baixo | **1** |
| 4 | **Autopreenchimento**: tarefa ← processo; solicitação de empenho/empenho ← processo; AIPC ← responsáveis da última AIPC | Alto | Baixo (valores editáveis, nada é salvo sem confirmação) | **1** |
| 5 | **Feedback**: botão "Salvando…" durante o envio; toasts distintos para sucesso e erro, erro com mais tempo e `role=alert` | Médio | Baixo | **1** |
| 6 | **Tokens de design** (cor, espaçamento, tipografia, raio, foco) + componentes base unificados; contraste AA; alvos de toque 44px no celular | Médio | Baixo | **1** |
| 7 | Correção do erro ao trocar o destino no encaminhamento | Médio | Muito baixo | **1** |
| 8 | Acessibilidade: `aria-current` no menu, rótulo no botão Atualizar, devolução de foco ao fechar modal | Médio | Muito baixo | **1** |
| 9 | Unificar os 7 cartões de indicador e 4 estados vazios em um componente | Médio | Médio (muitas telas) | 2 |
| 10 | Remover cores fixas do JS e código morto (`financeView` etc.) | Baixo | Baixo | 2 |
| 11 | Detalhe do processo com ações contextuais (só o próximo passo em destaque) e "Concluir e encaminhar" em um único fluxo | Alto | Médio (envolve RPC de tramitação) | 2 |
| 12 | Busca global (número do processo/SEI de qualquer tela) | Alto | Médio | 2 |
| 13 | Fontes locais em vez de `@import` do Google | Baixo | Baixo | 2 |
| 14 | Recriar a suíte de testes citada no README (Playwright ou similar) | Médio | Baixo | 2 |
| 15 | Sugestão de motivo/próxima ação no encaminhamento a partir do fluxo padrão de cada seção | Médio | **Regra de negócio** → proposta | — |
| 16 | Importar itens/números de especificação do SIAD/Portal de Compras | Muito alto | **Integração** → proposta | — |

### Andamento

| Lote | Itens | Situação |
|---|---|---|
| 1 | 1–8 + correções (avatar abria convite, assistente ignorava perguntas, erro ao trocar destino) | Concluído — branch `feat/ux-revisao` |
| 2 | 11 (próximo passo + "Concluir e encaminhar") e 12 (busca global) | Concluído — branch `feat/ux-revisao-lote2` |
| 3 | 9, 10, 13, 14 (componentes unificados, código morto, carregamento de fontes, testes de fumaça) | Concluído — branch `feat/ux-revisao-lote3` |

### Fora do escopo (dependem de autorização ou integração)

- **SIAD / SEI:** número do processo SEI, link e documentos (hoje digitados), códigos SIAD dos itens da AIPC, números das especificações de empenho e dos empenhos — importar eliminaria a digitação nas etapas 7 e 8.
- **Portal de Compras MG / SIRP:** número e situação do pregão/COTEP, atas de registro de preço (saldo, vigência, órgão gerenciador) — alimentaria os campos por modalidade da Compras.
- **PNCP:** publicação de contratos e atas; preencheria vigências e fornecedores em Contratos.
- **Google Planilhas (PLANILHA ATUAL):** já há extratores Apps Script (V5/V6/V7) com carga manual de JSON; uma sincronização agendada removeria o passo "baixar JSON e enviar".
- **Regras de negócio** (precisam de decisão da chefia): sugestão automática de texto no encaminhamento; reabrir tarefa concluída; prazo padrão por tipo de etapa; aprovação/assinatura — nada disso deve ser automatizado sem autoridade humana.
