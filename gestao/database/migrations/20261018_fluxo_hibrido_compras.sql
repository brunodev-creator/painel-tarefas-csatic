-- SIG Online: fluxo de demandas com fila setorial, tarefas autônomas e tramitação flexível.
ALTER TABLE public.processos ADD COLUMN IF NOT EXISTS tipo_servico text;
ALTER TABLE public.processos ADD COLUMN IF NOT EXISTS dados_servico jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.processos ADD COLUMN IF NOT EXISTS origem_setor text;
ALTER TABLE public.processos DROP CONSTRAINT IF EXISTS processos_tipo_servico_check;
ALTER TABLE public.processos ADD CONSTRAINT processos_tipo_servico_check CHECK
 (tipo_servico IS NULL OR tipo_servico IN ('Registro de Preço','COTEP','Pregão','Elaboração de ARP'));
ALTER TABLE public.processos ADD CONSTRAINT processos_dados_servico_objeto_check CHECK (jsonb_typeof(dados_servico)='object');
ALTER TABLE public.tarefas DROP CONSTRAINT IF EXISTS tarefas_status_check;
ALTER TABLE public.tarefas ADD CONSTRAINT tarefas_status_check CHECK
 (status IN ('Pendente','Em andamento','Aguardando terceiro','Encaminhada','Concluída'));
ALTER TABLE public.tramites ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'Encaminhamento';
ALTER TABLE public.tramites ADD CONSTRAINT tramites_tipo_check CHECK
 (tipo IN ('Encaminhamento','Devolução','Consulta'));
CREATE INDEX IF NOT EXISTS idx_tarefas_fila_sig ON public.tarefas (setor,status,responsavel_auth_id,prazo);

-- Administrador vê todos; funcionários só têm acesso aos registros internos do próprio setor.
-- A visão intersetorial completa-se pelo RPC com informações resumidas e autorizadas.
CREATE OR REPLACE FUNCTION private.can_read_section(s text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $f$
 SELECT EXISTS (SELECT 1 FROM public.usuarios u WHERE u.auth_id=auth.uid() AND u.ativo
  AND (u.role='admin'
   OR (u.role IN ('compras','chefe_compras') AND u.setor='Compras' AND s='Compras')
   OR (u.role IN ('licitacao','chefe_licitacao') AND u.setor='Licitação' AND s='Licitação')
   OR (u.role IN ('sofi','chefe_sofi') AND u.setor='SOFI' AND s='SOFI')
   OR (u.role='chefia' AND u.setor=s)));
$f$;

-- Responsável de uma nova demanda: própria fila, o autor, ou outro membro apenas pela chefia.
CREATE OR REPLACE FUNCTION private.validar_demanda_inicial()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $f$
DECLARE ator public.usuarios%rowtype;
DECLARE pessoa public.usuarios%rowtype;
BEGIN
 IF TG_OP='UPDATE' THEN
  IF NEW.origem_setor IS DISTINCT FROM OLD.origem_setor THEN
   RAISE EXCEPTION 'Setor de origem não pode ser modificado';
  END IF;
  RETURN NEW;
 END IF;
 NEW.origem_setor:=NEW.setor;
 IF auth.uid() IS NULL THEN RETURN NEW; END IF;
 SELECT * INTO ator FROM public.usuarios WHERE auth_id=auth.uid() AND ativo;
 IF NOT FOUND OR NOT private.can_edit(NEW.setor) THEN RAISE EXCEPTION 'Sem autorização para cadastrar demanda'; END IF;
 IF NEW.responsavel_auth_id IS NULL THEN
  NEW.responsavel:='Fila da '||NEW.setor;
 ELSE
  SELECT * INTO pessoa FROM public.usuarios
   WHERE auth_id=NEW.responsavel_auth_id AND ativo AND setor=NEW.setor;
  IF NOT FOUND THEN RAISE EXCEPTION 'O responsável deve ser militar da seção'; END IF;
  IF ator.role NOT IN ('admin','chefia','chefe_compras','chefe_licitacao','chefe_sofi')
     AND pessoa.auth_id<>auth.uid() THEN
   RAISE EXCEPTION 'Somente a chefia pode atribuir a demanda a outro militar';
  END IF;
  NEW.responsavel:=pessoa.nome;
 END IF;
 RETURN NEW;
END;
$f$;

DROP TRIGGER IF EXISTS validar_demanda_inicial ON public.processos;
CREATE TRIGGER validar_demanda_inicial BEFORE INSERT OR UPDATE OF origem_setor
ON public.processos FOR EACH ROW EXECUTE FUNCTION private.validar_demanda_inicial();

CREATE OR REPLACE FUNCTION private.gerar_tarefa_demanda_nova()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $f$
BEGIN
 INSERT INTO public.tarefas
  (processo_id,titulo,descricao,setor,responsavel,responsavel_auth_id,prioridade,status,prazo)
 VALUES
  (NEW.id,'Iniciar aquisição: '||left(NEW.objeto,130),
   'Demanda inicial cadastrada no SIG. Procedimento: '||coalesce(NEW.tipo_servico,NEW.modalidade),
   NEW.setor,NEW.responsavel,NEW.responsavel_auth_id,NEW.prioridade,'Pendente',NEW.prazo);
 RETURN NEW;
END;
$f$;
DROP TRIGGER IF EXISTS gerar_tarefa_demanda_nova ON public.processos;
CREATE TRIGGER gerar_tarefa_demanda_nova AFTER INSERT ON public.processos
FOR EACH ROW EXECUTE FUNCTION private.gerar_tarefa_demanda_nova();

-- Qualquer militar cria tarefa para si ou para fila; somente chefe redistribui.
-- Tarefas atribuídas não podem ser modificadas por colegas.
CREATE OR REPLACE FUNCTION private.autorizar_distribuicao_tarefa()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $f$
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
$f$;

-- Assunção atômica: somente uma pessoa pode retirar a tarefa da fila.
CREATE OR REPLACE FUNCTION public.assumir_tarefa(p_tarefa_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $f$
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
 IF t.responsavel_auth_id IS NOT NULL OR t.status<>'Pendente' THEN
  RAISE EXCEPTION 'Tarefa já assumida ou indisponível';
 END IF;
 UPDATE public.tarefas
 SET responsavel_auth_id=u.auth_id,responsavel=u.nome
 WHERE id=t.id;
 RETURN t.id;
END;
$f$;
REVOKE ALL ON FUNCTION public.assumir_tarefa(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assumir_tarefa(uuid) TO authenticated;

-- Tramitação livre entre seções. A tarefa original é preservada como "Encaminhada";
-- a nova tarefa é aberta na fila do destino, sem atribuição arbitrária entre setores.
CREATE OR REPLACE FUNCTION public.encaminhar_demanda(
 p_processo_id uuid,p_destino text,p_motivo text,p_proxima_acao text,
 p_prazo date,p_versao timestamptz,p_tipo text DEFAULT 'Encaminhamento',
 p_tarefa_origem uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $f$
DECLARE p public.processos%rowtype;
DECLARE tarefa public.tarefas%rowtype;
DECLARE u public.usuarios%rowtype;
DECLARE tr uuid;
BEGIN
 SELECT * INTO u FROM public.usuarios WHERE auth_id=auth.uid() AND ativo;
 IF NOT FOUND THEN RAISE EXCEPTION 'Conta não habilitada'; END IF;
 IF p_destino NOT IN ('Compras','Licitação','SOFI') OR
    p_tipo NOT IN ('Encaminhamento','Devolução','Consulta') OR
    length(trim(coalesce(p_motivo,'')))<8 OR
    length(trim(coalesce(p_proxima_acao,'')))<5 THEN
  RAISE EXCEPTION 'Destino, tipo, motivo ou próxima providência inválidos';
 END IF;
 SELECT * INTO p FROM public.processos WHERE id=p_processo_id FOR UPDATE;
 IF NOT FOUND OR NOT private.can_edit(p.setor) OR p.setor=p_destino THEN
  RAISE EXCEPTION 'Tramitação não autorizada ou destino igual à origem';
 END IF;
 IF p.status IN ('Concluído','Cancelado') OR p.updated_at IS DISTINCT FROM p_versao THEN
  RAISE EXCEPTION 'Processo encerrado ou alterado por outro militar; atualize a tela';
 END IF;
 IF p_tarefa_origem IS NOT NULL THEN
  SELECT * INTO tarefa FROM public.tarefas WHERE id=p_tarefa_origem AND
   processo_id=p.id AND setor=p.setor FOR UPDATE;
  IF NOT FOUND OR tarefa.status IN ('Concluída','Encaminhada') THEN
   RAISE EXCEPTION 'Tarefa de origem indisponível';
  END IF;
  IF u.role<>'admin' AND NOT (
   (u.role IN ('chefia','chefe_compras','chefe_licitacao','chefe_sofi')
     AND u.setor=p.setor)
   OR tarefa.responsavel_auth_id=auth.uid()) THEN
   RAISE EXCEPTION 'Somente o responsável ou chefe pode encaminhar esta tarefa';
  END IF;
  UPDATE public.tarefas SET status='Encaminhada' WHERE id=tarefa.id;
 END IF;
 UPDATE public.processos
 SET setor=p_destino,etapa=CASE WHEN p_tipo='Devolução'
   THEN 'Devolvido para '||p_destino ELSE 'Recebido pela '||p_destino END,
  responsavel='Fila da '||p_destino,responsavel_auth_id=NULL,
  status=CASE WHEN p_destino='SOFI' THEN 'Aguardando empenho' ELSE 'Aguardando providência' END,
  proxima_acao=trim(p_proxima_acao),prazo=p_prazo,bloqueio_motivo=NULL
 WHERE id=p.id;
 INSERT INTO public.tramites
 (processo_id,origem,destino,tipo,motivo,proxima_acao,
  responsavel_destino,destinatario_auth_id,prazo,status_destino,encaminhado_por)
 VALUES
 (p.id,p.setor,p_destino,p_tipo,trim(p_motivo),trim(p_proxima_acao),
  'Fila da '||p_destino,NULL,p_prazo,
  'Aguardando providência',auth.uid()) RETURNING id INTO tr;
 INSERT INTO public.tarefas
 (processo_id,titulo,descricao,setor,responsavel,responsavel_auth_id,
  prioridade,status,prazo)
 VALUES (p.id,CASE WHEN p_tipo='Devolução' THEN 'Corrigir ' ELSE 'Atender ' END||
   p.numero||': '||left(trim(p_proxima_acao),110),
   left(trim(p_motivo),3000),p_destino,'Fila da '||p_destino,NULL,
   p.prioridade,'Pendente',p_prazo);
 INSERT INTO public.eventos(processo_id,tipo,descricao,usuario,actor_id)
 VALUES (p.id,CASE WHEN p_tipo='Devolução' THEN 'Devolução' ELSE 'Encaminhamento' END,
  p.setor||' → '||p_destino||'. Providência: '||trim(p_proxima_acao),
  u.nome,auth.uid());
 -- Avisar chefias do setor receptor.
 INSERT INTO public.notificacoes(destinatario_auth_id,processo_id,tipo,titulo,mensagem)
 SELECT chef.auth_id,p.id,'tramite','Nova demanda na fila de '||p_destino,
  'Processo '||p.numero||' recebido para providências.'
 FROM public.usuarios chef WHERE chef.ativo AND chef.setor=p_destino
  AND chef.role IN ('chefia','chefe_compras','chefe_licitacao','chefe_sofi');
 RETURN tr;
END;
$f$;
REVOKE ALL ON FUNCTION public.encaminhar_demanda(uuid,text,text,text,date,timestamptz,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.encaminhar_demanda(uuid,text,text,text,date,timestamptz,text,uuid) TO authenticated;

-- Dados compartilhados mínimos, sem tarefas individuais nem documentos internos.
CREATE OR REPLACE FUNCTION public.listar_processos_compartilhados()
RETURNS TABLE (id uuid, numero text, objeto text, modalidade text,
 tipo_servico text,origem_setor text,setor text,etapa text,status text,
 proxima_acao text,prazo date,updated_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $f$
 SELECT p.id,p.numero,p.objeto,p.modalidade,p.tipo_servico,p.origem_setor,
 p.setor,p.etapa,p.status,p.proxima_acao,p.prazo,p.updated_at
 FROM public.processos p
 WHERE EXISTS (SELECT 1 FROM public.usuarios u WHERE u.auth_id=auth.uid() AND u.ativo)
 ORDER BY p.updated_at DESC;
$f$;
REVOKE ALL ON FUNCTION public.listar_processos_compartilhados() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.listar_processos_compartilhados() TO authenticated;

CREATE OR REPLACE FUNCTION public.historico_processos_compartilhados()
RETURNS TABLE (processo_id uuid,origem text,destino text,tipo text,criado_em timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $f$
 SELECT t.processo_id,t.origem,t.destino,t.tipo,t.criado_em FROM public.tramites t
 WHERE EXISTS (SELECT 1 FROM public.usuarios u WHERE u.auth_id=auth.uid() AND u.ativo)
 ORDER BY t.criado_em DESC;
$f$;
REVOKE ALL ON FUNCTION public.historico_processos_compartilhados() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.historico_processos_compartilhados() TO authenticated;
