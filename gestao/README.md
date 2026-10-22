# SIG CSA-TIC — versão 2.0 (piloto)

Sistema web de gestão de Compras, Licitação, SOFI, tarefas, contratos e fluxo de processos. A versão web usa PostgreSQL/Supabase (custo de licença zero dentro das cotas gratuitas), autenticação de usuários e trilha de eventos.

## Novos recursos v2

- **Gestão de usuários**: área do administrador para convidar por e-mail, alterar perfil, setor e desativar acesso sem executar SQL; Supabase Edge Function `gerenciar-usuarios`, que valida a identidade e a função de administrador no servidor.
- **Encaminhamento registrado**: formulário próprio para setor de destino, destinatário, motivo, prazo e próxima providência.
- **Transação atômica no PostgreSQL**: função RPC `encaminhar_processo` atualiza o setor e o responsável, insere o trâmite, tarefa recebida e evento histórico, ou não aplica nenhuma mudança em caso de erro. Inclui proteção contra edição concorrente.
- **Recebimentos**: consulta separada para minha fila, meu setor e todos (chefia/administrador).
- **Minhas tarefas**: filtro por responsável autenticado e alternativa para consultar todas as tarefas.
- **Ocorrências**: função RPC `registrar_ocorrencia`, com identidade do autor imposta pelo servidor; inserção direta no histórico foi bloqueada.
- **Primeiro acesso**: o link de convite permite definir senha de pelo menos 12 caracteres no próprio sistema (fluxo de links do tipo convite/recuperação).

## Endereço

`https://brunodev-creator.github.io/painel-tarefas-csatic/gestao/`

Ao abrir em novo aparelho, o sistema já conhece a URL do ambiente piloto e sua chave **pública** do Supabase, mas sempre exige login. As configurações podem ser alteradas pelo próprio usuário. A chave de serviço (`service_role`) não foi publicada no site.

## Convites: passo de configuração no Supabase

Em Supabase > Authentication > URL Configuration, configure a Site URL e a lista de Redirect URLs para permitir:

`https://brunodev-creator.github.io/painel-tarefas-csatic/gestao/`

Se o serviço de e-mail do projeto impuser limite de envio (plano gratuito), aguarde a recuperação da cota ou configure SMTP autorizado. **Não compartilhe senhas por mensagem**.

## Modelo de permissões

- `admin`: convidar, editar e desativar perfis, ver setores e encaminhar processos.
- `chefia`: ver dados e editar/encaminhar processos dos três setores, sem administrar usuários.
- `compras`, `licitacao`, `sofi`: edição dos registros do próprio setor; SOFI tem atribuições financeiras.
- `leitura`: consulta sem edição.

Perfis são guardados no banco e verificados por RLS e funções protegidas. O setor de um processo não pode ser alterado por um PATCH comum da API; use a RPC atômica para tramitar. As contas existentes de Auth só passam a ser autorizadas depois do cadastro na tabela `usuarios`.

## Cuidados

- **Piloto somente com dados fictícios ou devidamente anonimizados.** Hospedagem externa de dados institucionais requer autorização da PMMG e revisão de segurança, backup, disponibilidade e privacidade.
- Convites por e-mail e troca de senha dependem da configuração do Auth e do provedor de e-mail. Sucesso no formulário não significa que a mensagem já chegou à caixa de entrada.
- **Contratos continuados**: análise automática da execução dos serviços continuados (PLANILHA ATUAL), projeção para novembro/dezembro e campo único do fiscal («saldo adicional necessário até 31/12»), com visão gerencial DTS-1/SOFI. Guia: [Contratos Continuados](./GUIA_CONTRATOS_CONTINUADOS.md).
- **Cota orçamentária**: há um snapshot autenticado do `DASHBOARD` da `agora vai - PLANILHA ATUAL`, separado dos dados operacionais. Os valores são históricos, não substituem a conciliação V6 nem demonstram saldo oficial do SIAFI-MG. Guia: [Cotas da PLANILHA ATUAL](./GUIA_COTAS_PLANILHA_ATUAL.md).
- O assistente utiliza consultas programadas, não uma API paga de IA.
- Regras de autorização protegem o banco; a versão 2 ainda precisa de testes de penetração e procedimento de recuperação de incidentes antes de uso operacional.

## Estrutura

- `index.html` / `assets/app.js` / `assets/styles.css`: site estático.
- `functions/gerenciar-usuarios/index.ts`: função Supabase Deno, publicada no ambiente de teste.
- `database/schema.sql`: esquema inicial; migrações v2 foram aplicadas diretamente ao banco de testes.
- `tests/smoke.html` + `tests/smoke.js`: testes de fumaça no navegador, sem dependências, sobre o modo demonstração (36 verificações: menus de 6 perfis, celular 375px, painel inicial, tarefas, autopreenchimento, busca global, assistente, correções do lote de UX, Intenções de COTEP e Contratos continuados). O módulo COTEP também tem `tests/teste_cotep_calculo.cjs` (Node) e `tests/sql/run.sh` (PostgreSQL local); ver [GUIA_COTEP_INTENCOES.md](./GUIA_COTEP_INTENCOES.md). Contratos continuados: `tests/teste_continuados_motor.cjs` e `tests/sql/15_testes_continuados.sql`; ver [GUIA_CONTRATOS_CONTINUADOS.md](./GUIA_CONTRATOS_CONTINUADOS.md).

Não é necessário instalar dependências de frontend. Para testes locais, execute `python3 -m http.server 8080` na pasta raiz.

### Testes

1. Na raiz do repositório: `python3 -m http.server 8080` (no Windows: `py -m http.server 8080`).
2. Abra `http://localhost:8080/gestao/tests/smoke.html` e clique em **Executar testes** (ou use `?auto` na URL).
3. O título da aba mostra `PASS n/n` ou `FAIL`; o detalhe fica em `window.SMOKE_RESULT`.

Os testes usam somente dados fictícios do modo demonstração e restauram o `localStorage` ao final. Não cobrem o login real nem o banco Supabase: valide esses fluxos manualmente no ambiente piloto.