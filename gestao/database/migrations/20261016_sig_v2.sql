-- SIG CSA-TIC v2: executar após database/schema.sql, em banco novo. Nunca armazene segredos no arquivo.
alter table public.processos add column if not exists responsavel_auth_id uuid references auth.users(id) on delete set null;
alter table public.tarefas add column if not exists responsavel_auth_id uuid references auth.users(id) on delete set null;
create table if not exists public.tramites(id uuid primary key default gen_random_uuid(),processo_id uuid not null references public.processos(id) on delete cascade,origem text not null check(origem in ('Compras','Licitação','SOFI')),destino text not null check(destino in ('Compras','Licitação','SOFI')),motivo text not null check(length(trim(motivo)) between 8 and 3000),proxima_acao text not null check(length(trim(proxima_acao)) between 5 and 2000),responsavel_destino text not null,destinatario_auth_id uuid references auth.users(id) on delete set null,prazo date,status_destino text not null,encaminhado_por uuid not null references auth.users(id),criado_em timestamptz not null default now());
create index if not exists ix_tramites_processo_data on public.tramites(processo_id,criado_em desc);
create index if not exists ix_tramites_destino_data on public.tramites(destino,criado_em desc);
create index if not exists ix_tarefas_responsavel_auth_id on public.tarefas(responsavel_auth_id);
alter table public.tramites enable row level security;
grant select on public.tramites to authenticated;
create policy tramites_leitura on public.tramites for select to authenticated using(private.is_active());
create policy usuarios_diretorio on public.usuarios for select to authenticated using(private.is_active() and ativo=true);
revoke insert on public.eventos from authenticated;
drop policy if exists eventos_inserir on public.eventos;
revoke update on public.processos from authenticated;
grant update (numero,objeto,modalidade,etapa,status,prioridade,data_entrada,prazo,valor_estimado,valor_homologado,dotacao,referencia_sei,proxima_acao,bloqueio_motivo) on public.processos to authenticated;

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
  if dest_role not in ('admin','chefia') and
    dest_role <> (case p_destino when 'Compras' then 'compras' when 'Licitação' then 'licitacao' else 'sofi' end) then
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
$function$
;
CREATE OR REPLACE FUNCTION private.registrar_ocorrencia(p_processo_id uuid, p_tipo text, p_descricao text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 p_setor text;
 autor_nome text;
 event_id uuid;
begin
 if not private.is_active() then
  raise exception 'Usuário não autorizado';
 end if;
 select setor into p_setor from public.processos where id=p_processo_id;
 if not found or not private.can_edit(p_setor) then
  raise exception 'Sem autorização para registrar ocorrência';
 end if;
 if p_tipo not in ('Recebimento','Diligência','Pendência','Conformidade','Empenho','Observação') then
  raise exception 'Tipo inválido';
 end if;
 if length(trim(coalesce(p_descricao,''))) < 8 then
  raise exception 'Descreva o ocorrido em pelo menos 8 caracteres';
 end if;
 select nome into autor_nome from public.usuarios where auth_id=auth.uid() and ativo;
 insert into public.eventos(processo_id,tipo,descricao,usuario,actor_id)
 values (p_processo_id,p_tipo,trim(p_descricao),coalesce(autor_nome,'Usuário'),auth.uid())
 returning id into event_id;
 return event_id;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.encaminhar_processo(p_processo_id uuid, p_destino text, p_destinatario_auth_id uuid, p_motivo text, p_proxima_acao text, p_prazo date, p_status text, p_versao timestamp with time zone)
 RETURNS uuid
 LANGUAGE sql
 SET search_path TO ''
AS $function$
 select private.encaminhar_processo($1,$2,$3,$4,$5,$6,$7,$8);
$function$
;
CREATE OR REPLACE FUNCTION public.registrar_ocorrencia(p_processo_id uuid, p_tipo text, p_descricao text)
 RETURNS uuid
 LANGUAGE sql
 SET search_path TO ''
AS $function$
 select private.registrar_ocorrencia($1,$2,$3);
$function$
;
revoke all on function private.encaminhar_processo(uuid,text,uuid,text,text,date,text,timestamptz) from public,anon;
revoke all on function private.registrar_ocorrencia(uuid,text,text) from public,anon;
grant execute on function private.encaminhar_processo(uuid,text,uuid,text,text,date,text,timestamptz) to authenticated;
grant execute on function private.registrar_ocorrencia(uuid,text,text) to authenticated;
revoke all on function public.encaminhar_processo(uuid,text,uuid,text,text,date,text,timestamptz) from public,anon;
revoke all on function public.registrar_ocorrencia(uuid,text,text) from public,anon;
grant execute on function public.encaminhar_processo(uuid,text,uuid,text,text,date,text,timestamptz) to authenticated;
grant execute on function public.registrar_ocorrencia(uuid,text,text) to authenticated;
