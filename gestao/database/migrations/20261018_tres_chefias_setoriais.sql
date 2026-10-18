
-- Tres chefias setoriais novas e independentes; perfil 'chefia' permanece disponivel.
ALTER TABLE public.usuarios DROP CONSTRAINT IF EXISTS usuarios_role_check;
ALTER TABLE public.usuarios ADD CONSTRAINT usuarios_role_check CHECK (
 role IN ('admin','chefia','compras','licitacao','sofi','leitura',
          'chefe_compras','chefe_licitacao','chefe_sofi')
);
ALTER TABLE public.usuarios DROP CONSTRAINT IF EXISTS usuarios_chefe_setor_check;
ALTER TABLE public.usuarios ADD CONSTRAINT usuarios_chefe_setor_check CHECK (
 (role<>'chefe_compras' OR setor='Compras') AND
 (role<>'chefe_licitacao' OR setor='Licitação') AND
 (role<>'chefe_sofi' OR setor='SOFI')
);

CREATE OR REPLACE FUNCTION private.can_edit(s text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $fn$
 SELECT EXISTS (
  SELECT 1 FROM public.usuarios u
  WHERE u.auth_id=auth.uid() AND u.ativo AND (
   u.role='admin'
   OR (u.role='chefia' AND u.setor=s)
   OR (u.role='chefe_compras' AND s='Compras' AND u.setor=s)
   OR (u.role='chefe_licitacao' AND s='Licitação' AND u.setor=s)
   OR (u.role='chefe_sofi' AND s='SOFI' AND u.setor=s)
   OR (u.role='compras' AND s='Compras')
   OR (u.role='licitacao' AND s='Licitação')
   OR (u.role='sofi' AND s='SOFI')
  )
 );
$fn$;

CREATE OR REPLACE FUNCTION private.can_finance()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $fn$
 SELECT EXISTS (SELECT 1 FROM public.usuarios u
 WHERE u.auth_id=auth.uid() AND u.ativo
  AND u.role IN ('admin','chefia','sofi','chefe_sofi'));
$fn$;

CREATE OR REPLACE FUNCTION private.validar_destinatario_tarefa_setorial()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE valid_user boolean;
BEGIN
 IF NEW.responsavel_auth_id IS NULL THEN RETURN NEW; END IF;
 SELECT EXISTS (
  SELECT 1 FROM public.usuarios u
  WHERE u.auth_id=NEW.responsavel_auth_id AND u.ativo
    AND u.setor=NEW.setor
    AND (
     (NEW.setor='Compras' AND u.role IN ('admin','chefia','compras','chefe_compras'))
     OR (NEW.setor='Licitação' AND u.role IN ('admin','chefia','licitacao','chefe_licitacao'))
     OR (NEW.setor='SOFI' AND u.role IN ('admin','chefia','sofi','chefe_sofi'))
    )
 ) INTO valid_user;
 IF NOT valid_user THEN
  RAISE EXCEPTION 'Destinatario deve estar ativo e cadastrado na mesma secao';
 END IF;
 RETURN NEW;
END;
$fn$;

CREATE OR REPLACE FUNCTION private.autorizar_distribuicao_tarefa()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE perfil text;
DECLARE secao text;
BEGIN
 IF auth.uid() IS NULL THEN RETURN NEW; END IF;
 SELECT role,setor INTO perfil,secao FROM public.usuarios
 WHERE auth_id=auth.uid() AND ativo;
 IF perfil IS NULL THEN RAISE EXCEPTION 'Usuario sem perfil ativo'; END IF;
 IF perfil='admin' OR
  (perfil IN ('chefia','chefe_compras','chefe_licitacao','chefe_sofi') AND
   secao=NEW.setor AND
   (perfil='chefia' OR (perfil='chefe_compras' AND secao='Compras') OR
    (perfil='chefe_licitacao' AND secao='Licitação') OR
    (perfil='chefe_sofi' AND secao='SOFI'))) THEN
  RETURN NEW;
 END IF;

 IF TG_OP='UPDATE' THEN
  IF NEW.responsavel_auth_id IS DISTINCT FROM OLD.responsavel_auth_id
   OR NEW.responsavel IS DISTINCT FROM OLD.responsavel
   OR NEW.setor IS DISTINCT FROM OLD.setor THEN
   RAISE EXCEPTION 'Apenas o chefe da secao pode redistribuir tarefas';
  END IF;
  RETURN NEW;
 END IF;

 IF NEW.responsavel_auth_id IS NULL OR NEW.responsavel_auth_id=auth.uid() THEN
  RETURN NEW;
 END IF;
 -- Fluxo ja autorizado de tramitar processos gera tarefa automatica.
 IF NEW.processo_id IS NOT NULL AND EXISTS (
  SELECT 1 FROM public.tramites tr
  WHERE tr.processo_id=NEW.processo_id AND tr.destino=NEW.setor
   AND tr.destinatario_auth_id=NEW.responsavel_auth_id
   AND tr.criado_em>=now()-interval '10 seconds'
 ) THEN RETURN NEW; END IF;
 RAISE EXCEPTION 'Somente chefias da secao podem distribuir tarefas a outros militares';
END;
$fn$;

-- Mantem todo o fluxo de tramitação vigente; atualiza somente validação de destinatario.
CREATE OR REPLACE FUNCTION private.encaminhar_processo(p_processo_id uuid, p_destino text, p_destinatario_auth_id uuid, p_motivo text, p_proxima_acao text, p_prazo date, p_status text, p_versao timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 proc public.processos%rowtype;
 autor_nome text;
 dest_nome text;
 dest_role text;
 novo_id uuid;
begin
 if auth.uid() is null or not private.is_active() then
  raise exception 'Usuário não autorizado';
 end if;
 if p_destino not in ('Compras','Licitação','SOFI') then
  raise exception 'Setor de destino inválido';
 end if;
 if p_status not in ('Em andamento','Aguardando providência','Aguardando documentação','Aguardando empenho','Bloqueado') then
  raise exception 'Situação inválida';
 end if;
 if length(trim(coalesce(p_motivo,''))) < 8 then
  raise exception 'Explique o motivo do encaminhamento (mínimo 8 caracteres)';
 end if;
 if length(trim(coalesce(p_proxima_acao,''))) < 5 then
  raise exception 'Informe a próxima providência';
 end if;
 select * into proc from public.processos where id=p_processo_id for update;
 if not found then
  raise exception 'Processo não encontrado';
 end if;
 if not private.can_edit(proc.setor) then
  raise exception 'Sem permissão para encaminhar este processo';
 end if;
 if proc.status in ('Concluído','Cancelado') then
  raise exception 'Processo encerrado não pode ser encaminhado';
 end if;
 if proc.updated_at is distinct from p_versao then
  raise exception 'Processo alterado por outro usuário; atualize antes de encaminhar';
 end if;
 select nome into autor_nome from public.usuarios where auth_id=auth.uid() and ativo;
 if p_destinatario_auth_id is not null then
  select nome,role into dest_nome,dest_role
    from public.usuarios where auth_id=p_destinatario_auth_id and ativo;
  if not found then
   raise exception 'Destinatário inativo ou não cadastrado';
  end if;
  if not exists (
   select 1 from public.usuarios u
   where u.auth_id=p_destinatario_auth_id and u.ativo
    and u.setor=p_destino
    and (
     (p_destino='Compras' and u.role in ('compras','chefe_compras','chefia','admin'))
     or (p_destino='Licitação' and u.role in ('licitacao','chefe_licitacao','chefia','admin'))
     or (p_destino='SOFI' and u.role in ('sofi','chefe_sofi','chefia','admin'))
    )
  ) then
   raise exception 'Destinatário não pertence ao setor informado';
  end if;
 else
  dest_nome := 'Fila da '||p_destino;
 end if;
 update public.processos
  set setor=p_destino, responsavel=dest_nome,
    responsavel_auth_id=p_destinatario_auth_id,
    etapa='Recebido pela '||p_destino, status=p_status,
    proxima_acao=trim(p_proxima_acao), prazo=p_prazo,
    bloqueio_motivo=case when p_status='Bloqueado' then trim(p_motivo) else null end
  where id=p_processo_id;
 insert into public.tramites
  (processo_id,origem,destino,motivo,proxima_acao,responsavel_destino,destinatario_auth_id,prazo,status_destino,encaminhado_por)
 values
  (p_processo_id,proc.setor,p_destino,trim(p_motivo),trim(p_proxima_acao),dest_nome,p_destinatario_auth_id,p_prazo,p_status,auth.uid())
 returning id into novo_id;
 insert into public.tarefas
  (processo_id,titulo,descricao,setor,responsavel,responsavel_auth_id,prioridade,status,prazo)
 values
  (p_processo_id,'Receber '||proc.numero||': '||left(trim(p_proxima_acao),110),
   'Encaminhado por '||coalesce(autor_nome,'usuário')||' da '||proc.setor||'. Motivo: '||trim(p_motivo),
   p_destino,dest_nome,p_destinatario_auth_id,proc.prioridade,'Pendente',p_prazo);
 insert into public.eventos(processo_id,tipo,descricao,usuario,actor_id)
 values
  (p_processo_id,'Encaminhamento',proc.setor||' → '||p_destino||
   ' | Destinatário: '||dest_nome||' | Motivo: '||trim(p_motivo)||
   ' | Providência: '||trim(p_proxima_acao),coalesce(autor_nome,'Usuário'),auth.uid());
 return novo_id;
end;
$function$;
