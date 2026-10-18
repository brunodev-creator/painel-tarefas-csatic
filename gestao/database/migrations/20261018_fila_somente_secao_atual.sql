-- Evita assumir tarefa antiga de processo transferido.
CREATE OR REPLACE FUNCTION public.assumir_tarefa(p_tarefa_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE t public.tarefas%rowtype;
DECLARE u public.usuarios%rowtype;
BEGIN
 SELECT * INTO u FROM public.usuarios WHERE auth_id=auth.uid() AND ativo;
 IF NOT FOUND THEN RAISE EXCEPTION 'Perfil não autorizado'; END IF;
 SELECT * INTO t FROM public.tarefas WHERE id=p_tarefa_id FOR UPDATE;
 IF NOT FOUND OR NOT private.can_edit(t.setor) OR
   (u.role<>'admin' AND u.setor<>t.setor) THEN
  RAISE EXCEPTION 'Tarefa indisponível na sua seção';
 END IF;
 IF t.processo_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM public.processos proc
  WHERE proc.id=t.processo_id AND proc.setor=t.setor
 ) THEN
  RAISE EXCEPTION 'A demanda foi encaminhada a outra seção; esta tarefa não pode ser assumida';
 END IF;
 IF t.responsavel_auth_id IS NOT NULL OR t.status<>'Pendente' THEN
  RAISE EXCEPTION 'Tarefa já assumida ou indisponível';
 END IF;
 UPDATE public.tarefas
 SET responsavel_auth_id=u.auth_id,responsavel=u.nome
 WHERE id=t.id;
 RETURN t.id;
END;
$function$
