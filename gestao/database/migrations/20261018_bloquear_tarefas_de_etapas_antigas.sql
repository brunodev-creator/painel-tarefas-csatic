CREATE OR REPLACE FUNCTION private.autorizar_distribuicao_tarefa()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE ator public.usuarios%rowtype;
DECLARE pessoa public.usuarios%rowtype;
DECLARE chefe boolean;
BEGIN
 IF auth.uid() IS NULL THEN RETURN NEW; END IF;
 SELECT * INTO ator FROM public.usuarios WHERE auth_id=auth.uid() AND ativo;
 IF NOT FOUND THEN RAISE EXCEPTION 'Usuário sem perfil ativo'; END IF;
 chefe := ator.role='admin' OR
 (ator.role IN ('chefia','chefe_compras','chefe_licitacao','chefe_sofi')
  AND ator.setor=NEW.setor
  AND (ator.role='chefia'
   OR (ator.role='chefe_compras' AND NEW.setor='Compras')
   OR (ator.role='chefe_licitacao' AND NEW.setor='Licitação')
   OR (ator.role='chefe_sofi' AND NEW.setor='SOFI')));
 IF NEW.responsavel_auth_id IS NOT NULL THEN
  SELECT * INTO pessoa FROM public.usuarios u
  WHERE u.auth_id=NEW.responsavel_auth_id AND u.ativo AND u.setor=NEW.setor
   AND u.role IN ('admin','chefia','compras','licitacao','sofi',
                  'chefe_compras','chefe_licitacao','chefe_sofi');
  IF NOT FOUND THEN RAISE EXCEPTION 'Destinatário não está ativo na seção da tarefa'; END IF;
  NEW.responsavel:=pessoa.nome;
 ELSE
  NEW.responsavel:='Fila da '||NEW.setor;
 END IF;
 IF TG_OP='UPDATE' AND OLD.processo_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.processos p
   WHERE p.id=OLD.processo_id AND p.setor=OLD.setor)
  AND (NEW.responsavel_auth_id IS DISTINCT FROM OLD.responsavel_auth_id
       OR NEW.status IS DISTINCT FROM OLD.status) THEN
  RAISE EXCEPTION 'Tarefa de etapa anterior não pode ser assumida ou redistribuída';
 END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.processo_id IS NOT NULL AND NOT EXISTS (
   SELECT 1 FROM public.processos p WHERE p.id=NEW.processo_id AND p.setor=NEW.setor)
   THEN RAISE EXCEPTION 'Tarefa nova deve ser vinculada a processo da sua seção'; END IF;
  IF NOT chefe AND NEW.responsavel_auth_id IS NOT NULL AND NEW.responsavel_auth_id<>auth.uid() THEN
   -- Permitido apenas quando a tramitação acabou de gerar a tarefa automaticamente.
   IF NOT EXISTS (SELECT 1 FROM public.tramites tr
    WHERE tr.processo_id=NEW.processo_id AND tr.destino=NEW.setor
      AND tr.destinatario_auth_id=NEW.responsavel_auth_id
      AND tr.criado_em>=now()-interval '10 seconds') THEN
    RAISE EXCEPTION 'Militar pode criar tarefa apenas para si ou para a fila';
   END IF;
  END IF;
  RETURN NEW;
 END IF;
 IF NEW.setor IS DISTINCT FROM OLD.setor OR NEW.processo_id IS DISTINCT FROM OLD.processo_id THEN
  RAISE EXCEPTION 'Não é possível trocar a seção ou processo de uma tarefa; use a tramitação';
 END IF;
 IF chefe THEN RETURN NEW; END IF;
 IF OLD.responsavel_auth_id IS NULL AND NEW.responsavel_auth_id=auth.uid()
   AND NEW.status=OLD.status AND OLD.status='Pendente' THEN
  RETURN NEW;
 END IF;
 IF OLD.responsavel_auth_id IS DISTINCT FROM NEW.responsavel_auth_id THEN
  RAISE EXCEPTION 'Só o chefe pode redistribuir tarefa atribuída';
 END IF;
 IF OLD.responsavel_auth_id IS DISTINCT FROM auth.uid() THEN
  RAISE EXCEPTION 'Somente o responsável pode alterar a tarefa';
 END IF;
 IF NEW.status='Encaminhada' AND OLD.status<>'Encaminhada' THEN
  RAISE EXCEPTION 'Use Encaminhar para tramitar a demanda';
 END IF;
 RETURN NEW;
END;
$function$
