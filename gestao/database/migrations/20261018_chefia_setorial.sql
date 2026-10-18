-- Escopo da chefia setorial e consistencia dos destinatarios de tarefas.
-- Perfil chefia: edita exclusivamente o setor que consta no seu cadastro.
CREATE OR REPLACE FUNCTION private.can_edit(s text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $f$
 SELECT EXISTS (
  SELECT 1 FROM public.usuarios u
  WHERE u.auth_id = auth.uid() AND u.ativo
   AND (
    u.role = 'admin'
    OR (u.role = 'chefia' AND u.setor = s)
    OR (s = 'Compras' AND u.role = 'compras')
    OR (s = 'Licitação' AND u.role = 'licitacao')
    OR (s = 'SOFI' AND u.role = 'sofi')
   )
 );
$f$;

-- Para edicoes comuns, setor novo e antigo devem estar autorizados.
-- Encaminhamentos intersetoriais continuam sendo feitos pelo RPC existente.
DROP POLICY IF EXISTS processos_alterar ON public.processos;
CREATE POLICY processos_alterar ON public.processos
FOR UPDATE TO authenticated
USING (private.can_edit(setor))
WITH CHECK (private.can_edit(setor));

CREATE OR REPLACE FUNCTION private.validar_destinatario_tarefa_setorial()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $f$
DECLARE membro_setor text;
BEGIN
 IF NEW.responsavel_auth_id IS NULL THEN RETURN NEW; END IF;
 SELECT u.setor INTO membro_setor
 FROM public.usuarios u
 WHERE u.auth_id = NEW.responsavel_auth_id AND u.ativo = true
  AND u.role IN ('admin','chefia','compras','licitacao','sofi');
 IF membro_setor IS NULL OR membro_setor IS DISTINCT FROM NEW.setor THEN
  RAISE EXCEPTION 'Militar destinatario deve estar ativo e cadastrado na mesma secao da tarefa';
 END IF;
 RETURN NEW;
END;
$f$;

REVOKE ALL ON FUNCTION private.validar_destinatario_tarefa_setorial() FROM PUBLIC;
DROP TRIGGER IF EXISTS validar_destinatario_tarefa_setorial ON public.tarefas;
CREATE TRIGGER validar_destinatario_tarefa_setorial
BEFORE INSERT OR UPDATE OF setor,responsavel_auth_id
ON public.tarefas FOR EACH ROW EXECUTE FUNCTION private.validar_destinatario_tarefa_setorial();

CREATE INDEX IF NOT EXISTS ix_tarefas_setor_responsavel_status
ON public.tarefas(setor,responsavel_auth_id,status);
