-- Apenas chefias e administradores distribuem tarefas a outros militares.
-- Tarefas geradas por encaminhamento do processo continuam funcionando.
CREATE OR REPLACE FUNCTION private.autorizar_distribuicao_tarefa()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $f$
DECLARE perfil text;
DECLARE secao text;
BEGIN
 -- Importacoes autorizadas por service role ficam fora do fluxo de usuarios.
 IF auth.uid() IS NULL THEN RETURN NEW; END IF;
 SELECT role,setor INTO perfil,secao
 FROM public.usuarios WHERE auth_id=auth.uid() AND ativo;
 IF perfil IS NULL THEN RAISE EXCEPTION 'Usuario sem perfil ativo'; END IF;
 IF perfil='admin' OR (perfil='chefia' AND secao=NEW.setor) THEN RETURN NEW; END IF;

 IF TG_OP='UPDATE' THEN
  IF NEW.responsavel_auth_id IS DISTINCT FROM OLD.responsavel_auth_id
   OR NEW.responsavel IS DISTINCT FROM OLD.responsavel
   OR NEW.setor IS DISTINCT FROM OLD.setor THEN
   RAISE EXCEPTION 'Apenas a chefia da secao pode redistribuir tarefas';
  END IF;
  RETURN NEW;
 END IF;

 -- Militares nao chefes podem criar tarefa na propria fila, mas
 -- nao atribui-la a outro militar.
 IF NEW.responsavel_auth_id IS NULL OR NEW.responsavel_auth_id=auth.uid() THEN
  RETURN NEW;
 END IF;

 -- Encaminhar processo (RPC) cria automaticamente uma tarefa de destino.
 IF NEW.processo_id IS NOT NULL AND EXISTS (
  SELECT 1 FROM public.tramites tr
  WHERE tr.processo_id=NEW.processo_id
   AND tr.destino=NEW.setor
   AND tr.destinatario_auth_id=NEW.responsavel_auth_id
   AND tr.criado_em>=now()-interval '10 seconds'
 ) THEN RETURN NEW; END IF;

 RAISE EXCEPTION 'Somente a chefia da secao pode distribuir tarefas a outros militares';
END;
$f$;

REVOKE ALL ON FUNCTION private.autorizar_distribuicao_tarefa() FROM PUBLIC;
DROP TRIGGER IF EXISTS autorizar_distribuicao_tarefa ON public.tarefas;
CREATE TRIGGER autorizar_distribuicao_tarefa
BEFORE INSERT OR UPDATE OF setor,responsavel_auth_id,responsavel
ON public.tarefas FOR EACH ROW EXECUTE FUNCTION private.autorizar_distribuicao_tarefa();
