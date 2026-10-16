# SIG CSA-TIC · Versão 3 — operação piloto

## Entregas

- **Avisos dentro do sistema**: tabela `public.notificacoes`; inserção automática quando um processo é encaminhado a um destinatário e quando uma tarefa é atribuída ou reatribuída. A leitura é restrita ao destinatário, por RLS. O usuário pode marcar avisos como lidos.
- **Recebimentos**: fila pessoal, do setor e geral (chefia/admin); exibe objeto, prioridade, responsável, motivo, providência e prazo. Botão para iniciar a tarefa correspondente.
- **Pendências**: alertas calculados a partir de bloqueio declarado, prazo vencido, falta de responsável individual ou tempo sem movimentação (padrão: cinco dias corridos; ajustável).
- **Painel da chefia**: indicadores por setor, tarefas vencidas e gargalos, acessível aos perfis `admin` e `chefia`.
- **Atualização**: consulta dos dados aproximadamente a cada 30 segundos enquanto a página está aberta e visível, sem modal ativo. **Não é push, SMS ou e-mail**.

## Banco de dados

Migrações instaladas:
- `sig_v3_notificacoes_pessoais`
- `sig_v3_harden_tasks_seed_existing_receipt_notice`
- `sig_v3_notificar_reatribuicao_tarefa`

A tabela de avisos bloqueia escrita direta pelo navegador, exceto a coluna `lida_em` do destinatário autenticado. A criação de avisos ocorre em gatilhos de banco protegidos.

## Regras de acompanhamento

O status `Bloqueado` só deve ser escolhido quando houver motivo registrado. O alerta de falta de movimentação é heurístico, não comprova atraso ou falha de servidor. A supervisão deve examinar dependências externas, prazos legais, feriados e peculiaridades de cada modalidade antes de concluir pela existência de gargalo.

## Migração futura de saldos_2_0

**Ainda não importar o arquivo real para este ambiente público de testes.** Etapas propostas:

1. Definir fontes autorizadas e a classificação dos dados da PMMG.
2. Criar uma área de staging com lote/arquivo, hash SHA-256, aba, linha original e data de extração; assegurar importações idempotentes.
3. Normalizar dotações e repasses, vincular documentos/RIPC aos processos e reconciliar empenhos e reforços com o registro oficial.
4. Produzir relatório de divergências antes de promover dados à base operacional. Nunca interpretar saldo não destinado automaticamente como disponibilidade para empenho.
5. Aplicar controles de acesso mais específicos para dados financeiros e sigilosos, com backup testado, retenção e validação institucional da hospedagem.

## Limites desta versão

A funcionalidade de avisos exige que o usuário abra o SIG: não há notificações push em segundo plano. O painel de alertas emprega dias corridos, não dias úteis. A versão permanece piloto, sem aprovação de uso institucional e sem importação dos dados reais da planilha.

## Próximo teste funcional

1. Entrar como Licitação no celular.
2. Abrir **Avisos** (há um aviso histórico do processo demonstrativo).
3. Conferir **Recebimentos → Minha fila** e selecionar **Iniciar atendimento**, se a tarefa ainda estiver pendente.
4. Entrar como administrador no computador e abrir **Pendências** e **Painel da chefia**.
5. Criar e encaminhar um novo processo **fictício** para confirmar que um novo aviso é gerado pelo gatilho.
