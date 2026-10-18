-- A tabela de processos usa autorizacao de UPDATE por coluna; incluir os campos novos.
GRANT UPDATE (tipo_servico,dados_servico) ON public.processos TO authenticated;
