-- Finalização de status: tarefa encaminhada é histórico e não pode ser reaberta.
CREATE OR REPLACE FUNCTION private.auditar_status_tarefa()
RETURNS trigger LANGUAGE plpgsql SET search_path TO ''
AS $f$
BEGIN
 IF OLD.status='Concluída' THEN
  IF NEW.status IS DISTINCT FROM OLD.status OR
     NEW.conclusao_observacao IS DISTINCT FROM OLD.conclusao_observacao OR
     NEW.concluida_em IS DISTINCT FROM OLD.concluida_em OR
     NEW.concluida_por IS DISTINCT FROM OLD.concluida_por THEN
   RAISE EXCEPTION 'Conclusão registrada não pode ser removida ou alterada';
  END IF;
  RETURN NEW;
 END IF;
 IF OLD.status='Encaminhada' AND NEW.status IS DISTINCT FROM OLD.status THEN
  RAISE EXCEPTION 'Tarefa encaminhada não pode ser reaberta; crie nova etapa no processo';
 END IF;
 IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
 IF NEW.status='Concluída' THEN
  IF length(trim(coalesce(NEW.conclusao_observacao,'')))<8 THEN
   RAISE EXCEPTION 'Descreva a providência realizada (mínimo 8 caracteres)';
  END IF;
  NEW.concluida_em:=now();
  NEW.concluida_por:=auth.uid();
 END IF;
 RETURN NEW;
END;
$f$;
