# SIG CSA-TIC — Versão 4: SOFI e contratos

## Alterações implementadas

A versão 4 adicionou à infraestrutura gratuita já existente:

- Tela SOFI com processos recebidos, situação, prazo, responsável e próxima ação;
- Solicitações de empenho próprias, com valor, dotação, processo, pendências, status e vínculo opcional/obrigatório com empenho quando marcada como **Empenhado**;
- Registros de empenhos e repasses continuam disponíveis; cifras cadastradas **não representam saldos oficiais**;
- Competências mensais de contratos (previsto, executado informado, situação, documento);
- Projeção de cobertura financeira por contrato, combinando competências registradas e custo mensal estimado;
- Alertas de cobertura e de vigência a vencer nos próximos 60 dias;
- Conclusão de tarefas com justificativa mínima, data e trilha de auditoria (quando vinculada a processo);
- Ao encaminhar um processo **Licitação → SOFI**, a situação sugerida é **Aguardando empenho**, alterável antes de confirmar.

## Regras importantes

1. O banco continua separado por entidades. A solicitação de empenho **não é** o empenho.
2. Marcar uma solicitação como *Empenhado* exige relacioná-la a um empenho com estado ativo ou encerrado, vinculado ao **mesmo processo e dotação**. Isso valida consistência cadastral, **não substitui confirmação na fonte oficial**.
3. Apenas usuários da SOFI, administração e chefia podem acessar as novas tabelas financeiras; políticas RLS validam isso no banco.
4. Uma tarefa concluída precisa de justificativa e não pode perder os dados da conclusão.
5. Competências são gravadas como primeiro dia do mês, com uma linha por contrato/mês.
6. A cobertura projetada utiliza o saldo manual do contrato e a previsão dos meses seguintes, com preenchimento pelo custo médio **quando não existe competência lançada**.
7. Nenhum dado de `saldos_2_0` foi importado ao banco hospedado. Não inserir dados institucionais sem autorização e avaliação de segurança.

## Teste recomendado — ciclo completo

**No computador (administrador):** entre em Processos → TESTE-001/2026, atualmente na Licitação. No celular (perfil Licitação), abra o processo e finalize a tarefa de análise com descrição do resultado. Depois, use *Encaminhar* para **SOFI**, com motivo e próxima ação, podendo usar **Fila da SOFI** até criar um usuário do setor.

**No computador (administrador):** verifique Recebimentos → Todos e SOFI. A nova linha deve aparecer como aguardando empenho. Crie uma solicitação demonstrativa (valor e dotação fictícios). Se quiser testar a etapa *Empenhado*, registre primeiro um empenho demonstrativo com mesmo processo/dotação e estado Ativo.

**Contratos:** cadastre contrato demonstrativo, depois adicione competências e confira a projeção e os alertas. Use um número fictício `CT-DEMO-V4`.

## Migração de dados históricos

A próxima fase requer definir fontes autorizadas, chaves de documento/repasse/dotação, regras de conciliação e validação institucional. A importação automática da planilha deve ser idempotente e trabalhar com staging, lote, arquivo e erros de validação. Não converter diretamente a diferença de repasses em saldo disponível para empenhar.

## Testes e limites da versão

- Validação de sintaxe JavaScript e execução simulada das novas telas.
- Migrações de banco verificadas; inserção e encerramento em **transações revertidas** não alteraram dados existentes.
- **Pendente**: teste real de escrita financeira via navegador com sessão autenticada; teste completo de Licitação → SOFI com usuário operacional da SOFI.
- Notificações continuam internas ao SIG, sem push com aplicativo fechado.
- Versão piloto não homologada; segurança administrativa e backup precisam de revisão antes da operação institucional.
