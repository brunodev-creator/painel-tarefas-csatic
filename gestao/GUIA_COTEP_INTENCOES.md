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
| 3016 | 43 (R$ 28.247,79 homologado), 48, 64, 126 + 130 em andamento (R$ 674,95) | R$ 59.206,66 | **R$ 6.285,45** |
| 5207 | 95 + 130 em andamento (R$ 23.599,00) | R$ 64.299,00 | **R$ 1.193,11** |

A COTEP 130/2026 é **um** procedimento (`sig_cotep_coteps`) com **dois** lançamentos (3016 e 5207), cada um controlado no seu código. Os demais registros (3024, 5203, 3964, 3921 e 122/2026 fracassada) foram preservados.

**Conciliação das 16 COTEPs (21/10/2026).** Total de 16 COTEPs distintas e 17 lançamentos, sendo 9 finalizadas com valor homologado registrado, 5 fracassadas (046, 056, 088, 118 e 122) e 2 em andamento (129 e 130). Fracassadas mantêm preço de referência apenas histórico, sem abatimento. A COTEP 043/2026 foi corrigida: referência R$ 28.658,70; homologado R$ 28.247,79. O valor estimado de R$ 24.271,00 da fracassada 122/2026 fica sem desdobramento de elemento-item até comprovação.

**COTEPs 129 e 122 classificadas (22/10/2026, migration `20261022_sig_cotep_classificar_122_129.sql`):** 129/2026 (ferramentas, R$ 6.817,05, em andamento) no elemento-item 3022; 122/2026 (fracassada) em 5207 (R$ 23.596,05) e 3016 (R$ 674,95), pelo relançamento 130/2026. Classificação indicativa pelo objeto: a DTS-1 deve confirmar com os itens do Portal e corrigir na própria COTEP se necessário. Restrição `sig_cotep_procedimentos_elemento_obrigatorio`: sem elemento-item só COTEP fracassada, deserta ou cancelada.

**Limite:** o teto de R$ 65.492,11 por elemento-item continua como parâmetro gerencial com validação jurídica institucional pendente. Os dados de histórico não substituem a conferência da mesma natureza/ramo de atividade para fins da Lei nº 14.133/2021.

## Uso
**Centros (qualquer conta ativa do SIG):** abrir *Intenções COTEP*, clicar no cartão do elemento-item e preencher centro, objeto, valor, prioridade e justificativa. O formulário mostra o saldo atual e o saldo se a intenção for aprovada. Para um código que não aparece, use *Outro elemento-item* (o catálogo é aberto). Intenções pendentes ou devolvidas podem ser editadas/canceladas pelo autor.

**DTS-1 (gestores habilitados pelo administrador em *Parâmetros → Gestores DTS-1*):**
- *Fila de intenções*: reservar com um clique (o banco recusa se faltar saldo), analisar (ajustar reserva, liberar, devolver, rejeitar, priorizar, agrupar).
- Selecionar várias intenções → **Gerar COTEP** (aceita vários elementos-itens; informe o número de uma COTEP em andamento para acrescentar intenções a ela).
- *COTEPs*: registrar/editar procedimento com um ou mais elementos-itens, situação e valores; vincular a processo de compra do SIG (modalidade COTEP).
- *Parâmetros*: limite do exercício/UG, catálogo de elementos-itens, centros e gestores.

Alertas no cartão: **utilização elevada** (≥ 80%), **saldo insuficiente** (pendentes > saldo), **limite atingido** e **limite excedido**.

## Perfil DTS-1
- Perfil `dts1` (setor DTS-1), criado pelo administrador em **Usuários**: acessa somente **Intenções COTEP**, **Almoxarifado**, **Cota orçamentária** e **Acompanhar seções**, e abre direto em Intenções COTEP.
- Quem tem esse perfil já é gestor das Intenções COTEP (reserva, prioriza, agrupa, gera e edita COTEPs, parâmetros e acesso de visitante) sem precisar de delegação em *Gestores DTS-1*. Não administra usuários nem gestores.
- Migration: `database/migrations/20261022_perfil_dts1.sql`; a função `gerenciar-usuarios` aceita o novo perfil.

## Acesso de visitante (sem conta)
- Na tela de login, abaixo de **Entrar**, o botão **COTEP** abre o SIG em modo visitante: só o menu *Intenções de COTEP* aparece (busca, perfil, demais menus e configurações ficam ocultos). O botão *Sair · entrar com conta* volta ao login.
- O visitante consulta o painel por elemento-item e registra intenções informando **nome (posto/graduação)** e **contato**; a intenção entra como *Pendente* (origem «Visitante») e nunca reserva saldo. A DTS-1 vê o solicitante e o contato na análise.
- O banco libera ao visitante apenas `sig_cotep_publico_status`, `sig_cotep_publico_dados` (sem contatos, autores ou trilha interna) e `sig_cotep_publico_intencao`. Tabelas e a RPC interna continuam fechadas ao papel anônimo.
- Proteções: limite global por hora (padrão 60) e de 10 envios/hora por rede, bloqueio de envio duplicado e, opcionalmente, **código de acesso** definido pela DTS-1 em *Parâmetros → Acesso de visitante* (também é possível desativar o acesso).
- Migration: `database/migrations/20261021_sig_cotep_visitante.sql`.

## Segurança e integridade
- Escrita somente pela RPC `sig_cotep_acao` (SECURITY DEFINER, valida conta ativa, gestor e administrador). Tabelas com RLS e apenas SELECT para contas ativas; auditoria visível só à DTS-1.
- **Concorrência:** cada alteração que aumenta o valor ocupado obtém bloqueio transacional por (exercício, UG, elemento-item) e o gatilho `sig_cotep_*_limite` reconfere o saldo antes do COMMIT. Duas reservas simultâneas que juntas excedem o saldo: só a primeira é aceita.
- Exceção ao limite (registrar fato já homologado acima do teto): somente administrador, com justificativa ≥ 20 caracteres, registrada no histórico.
- Nenhum registro pode ser excluído (gatilho bloqueia DELETE); itens retirados de uma COTEP são inativados.
- Histórico: `sig_cotep_eventos` (trilha legível com valor e elemento-item) e `sig_cotep_auditoria` (antes/depois de cada linha).
- Não altera V5/V6/V7, AIPC, processos, empenhos, cotas ou almoxarifado; a tabela antiga `sig_cotep_bases` foi mantida apenas para consulta.

## Implantação
1. No Supabase (SQL Editor), aplicar `database/migrations/20261021_sig_cotep_v2_elemento_item.sql` (transação única; pode ser reaplicada).
2. Conferir: `select * from sig_cotep_saldos where ano = 2026 order by elemento_item;` — 3016 saldo 6.285,45 e 5207 saldo 1.193,11 (3022 com a 129/2026 em andamento: comprometido 6.817,05).
3. Administrador confirma gestores DTS-1 e, após manifestação jurídica, marca o limite como «Validada».
4. Homologações das COTEPs 23, 43, 48, 49, 64, 65, 92, 95 e 126/2026 registradas; DTS-1 deve validar a UG provisória 1250071.

## Testes
- `node gestao/tests/teste_cotep_calculo.cjs` — motor de cálculo com os dados de validação.
- `gestao/tests/sql/run.sh` — PostgreSQL local (≥ 15) com simulação do Supabase: aplica as migrations sobre o histórico importado e executa 64 verificações (saldos, permissões, RLS, conversão sem dupla contagem, liberação de diferença, exceção, exclusão bloqueada) e o teste de concorrência com duas sessões simultâneas.
- `gestao/tests/smoke.html?auto` — inclui 5 testes do painel em modo demonstração (desktop e celular 375 px).

## Atualização automática diária (PLANILHA ATUAL → SIG)

- O painel lê direto do banco e se recarrega sozinho a cada 5 minutos enquanto estiver aberto.
- A aba **CONTROLE_PROCESSOS_COMPRA** da «agora vai - PLANILHA ATUAL» é enviada todo dia (≈ 6h) pelo Apps Script
  `integracao/SIG_SINCRONIZACAO_DIARIA.gs` para a RPC `sig_cotep_sincronizar_portal` (autenticada por token; só o hash fica no banco).
- Regras: COTEP com um elemento-item é atualizada (estimado, homologado, situação); homologação libera a diferença.
  COTEP com vários elementos-itens homologada vira pendência «distribuir homologado». COTEP nova é criada só quando
  todos os códigos CATMAS já são conhecidos num único elemento-item; senão vira pendência «classificar».
  Estouro de limite vira pendência «saldo insuficiente». Planilha defasada nunca reabre COTEP encerrada.
- Pendências aparecem no topo do painel para a DTS-1; cadastrar a COTEP encerra a pendência automaticamente.
- Instalação: administrador gera o token em Parâmetros → «Gerar token de integração»; na planilha, colar o script,
  executar `sigSyncConfigurar` (cola o token) e `sigSyncInstalarGatilhoDiario`.
