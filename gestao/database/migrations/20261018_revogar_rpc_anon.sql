-- Supabase concede EXECUTE ao role anon por padrao, mesmo apos REVOKE PUBLIC.
-- Restringir os novos RPCs de escrita e consulta a contas autenticadas.
REVOKE EXECUTE ON FUNCTION public.assumir_tarefa(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.encaminhar_demanda(uuid,text,text,text,date,timestamptz,text,uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.listar_processos_compartilhados() FROM anon;
REVOKE EXECUTE ON FUNCTION public.historico_processos_compartilhados() FROM anon;
