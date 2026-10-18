-- Fluxo antigo tinha atribuicao direta no destino e nao faz parte do modelo hibrido.
-- O SIG usa public.encaminhar_demanda, que cria tarefa na fila da secao de destino.
REVOKE ALL ON FUNCTION public.encaminhar_processo(uuid,text,uuid,text,text,date,text,timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.encaminhar_processo(uuid,text,uuid,text,text,date,text,timestamptz) FROM PUBLIC, anon, authenticated;
