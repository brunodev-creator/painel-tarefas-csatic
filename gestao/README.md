# SIG CSA-TIC — Sistema Integrado de Gestão | MVP v1.0

**Protótipo funcional, responsivo e gratuito** para acompanhamento de Compras, Licitação, SOFI e contratos continuados. Nenhum serviço comercial de IA é necessário. Por padrão o site inicia com **dados inteiramente fictícios** e armazenamento isolado no navegador.

## O que já funciona

- Painel geral: processos abertos, bloqueios, tarefas atrasadas, processos aguardando empenho, carga por setor.
- Processos: cadastro, edição, responsável, setor, prazos, etapa, situação, motivo do bloqueio, próxima providência, detalhe e histórico.
- Tarefas: cadastro, vínculo a processo, responsável, prioridade, prazo, atualização.
- SOFI: repasses, dotações, empenhos e valores estimados, com alertas sobre limitações dos cálculos.
- Contratos: vigência, custo mensal estimado, saldo do empenho informado, meta de cobertura e alertas.
- Assistente de consultas: regras determinísticas e explicáveis, sem enviar documentos para IA externa.
- Exportação/importação de JSON de demonstração e versão responsiva para dispositivos móveis.
- Conexão com Supabase (PostgreSQL + Auth) **opcional**, permitindo banco compartilhado com login e sincronização por atualização de 60 s.

## Como abrir agora

Abra `index.html` no navegador ou sirva a pasta com:

```bash
python3 -m http.server 8080
# endereço local http://localhost:8080
```

> No modo demonstrativo as edições ficam **somente no navegador utilizado**; não são compartilhadas entre aparelhos. Não coloque dados reais, internos, pessoais ou sigilosos na demonstração hospedada publicamente.

## Como ativar o banco de dados compartilhado

1. Obtenha a aprovação institucional para o tratamento/hospedagem dos dados e defina um administrador do ambiente.
2. Crie um **novo** projeto Supabase no plano gratuito, na organização escolhida pelo titular da conta. A plataforma gratuita possui limites e não equivale a uma infraestrutura homologada para produção.
3. No editor SQL do projeto, execute `database/schema.sql` **num banco novo**. Ele cria as tabelas vazias e políticas RLS, sem migrar o XLSX original.
4. Em Supabase Auth, crie/convide os usuários internos autorizados; o responsável pelo projeto deverá associar cada UUID de Auth à tabela `usuarios`. Exemplo comentado no final do SQL.
5. Em Authentication > Providers, restrinja inscrições e confirme as opções de segurança autorizadas. Não deixe auto cadastro indiscriminado.
6. No site, clique **Conexão e ajustes**, preencha a **Project URL** e a chave **pública publishable/anon**. **Nunca** use `service_role`, `sb_secret_` ou senha administrativa no navegador.
7. Faça login por e-mail/senha. Usuários autorizados carregam os dados do banco. O sistema consulta alterações a cada 60 s enquanto aberto e oferece atualização manual.

### Limitações relevantes do MVP

- Este sistema ainda **não importa automaticamente** dados do Armazém/BO, SIAD, SEI, Google Drive ou a planilha de 39 abas. Essas integrações exigem APIs/permissões e rotina de ETL com reconciliação antes do uso institucional.
- Os registros financeiros são simplificados; **não** substituem lançamentos oficiais, saldo disponível, conformidade ou as regras específicas de execução orçamentária.
- O assistente realiza consultas guiadas por palavras-chave; **não** é um LLM. IA local baseada em Ollama pode ser adicionada depois em servidor autorizado.
- Responsáveis são campos textuais nesta fase. Para produção, devem referenciar usuários e unidades com identidade institucional estável.
- Histórico do banco gera eventos automáticos de criação/alteração de processos. O protótipo não é substituto do SEI nem de trilhas oficiais.
- Não possui uploads de documentos, assinaturas eletrônicas, OCR, importação financeira automatizada, notificações push ou interface administrativa para criação de contas.
- Segurança exige auditoria adicional (RLS, acesso por setor, rede, MFA, backup, proteção contra abuso e classificação de informação). A primeira versão permite que usuários autenticados visualizem processos dos três setores; isso **não** é adequado para registros restritos sem políticas adicionais.
- O banco é consultado por paginação simplificada até 1.000 registros/tabela. Antes de uso com volume real será necessária paginação completa.
- Não há garantia de disponibilidade nos planos gratuitos e é necessário backup independente sob governança institucional.

## Arquitetura

```
index.html + assets/styles.css + assets/app.js
                  ↕
           API Supabase Auth
                  ↕
         PostgREST + RLS
                  ↕
           PostgreSQL
```

A interface é HTML/CSS/JavaScript nativo (sem npm, frameworks pagos ou build). Pode ser hospedada em GitHub Pages ou Cloudflare Pages. Quando conectada, todas as mutações são autorizadas pelo banco e não apenas pela interface.

## Dados da planilha que orientarão a migração

Arquivo analisado: `saldos_2_0.xlsx` (39 abas), com `DESTINACAO_REPASSES`, `ITENS_AQUISICAO`, `IMPORT_SALDOS_BO`, `INDICE_EMPENHOS`, `CONTROLE_SERVICOS_CONTINUOS` etc. **Nenhuma linha real foi importada neste protótipo**. A migração deverá preservar números completos como texto, origem, competência, documento de repasse, dotação, RIPC e chave de empenho, associando todos os movimentos oficiais a uma camada imutável de staging.

## Próxima evolução recomendada

Adicionar `documentos`, `alocacoes_repasse`, `itens`, `movimentos_empenho`, `contratos_aditivos`, `parcelas_contratuais` e `import_jobs` após validação de modelo de dados com Compras, Licitação e SOFI. Construir conciliação automática e painéis de SLA antes de habilitar a IA generativa.

---
Desenvolvido como prova de conceito. Custos de licenças e APIs do MVP: R$ 0. Infraestrutura e manutenção podem gerar custos na operação.