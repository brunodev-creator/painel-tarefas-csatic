-- SIG CSA-TIC: isolamento de leitura para as chefias setoriais.
-- Admin e perfis operacionais preservam as regras anteriores.
-- Sempre que a tabela nao possui setor/referencia verificavel, negar chefias.

CREATE OR REPLACE FUNCTION private.is_section_chief()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $f$
 SELECT EXISTS (SELECT 1 FROM public.usuarios u
  WHERE u.auth_id=auth.uid() AND u.ativo
  AND u.role IN ('chefia','chefe_compras','chefe_licitacao','chefe_sofi'));
$f$;

CREATE OR REPLACE FUNCTION private.can_read_section(s text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $f$
 SELECT EXISTS (SELECT 1 FROM public.usuarios u
  WHERE u.auth_id=auth.uid() AND u.ativo
  AND (
    u.role NOT IN ('chefia','chefe_compras','chefe_licitacao','chefe_sofi')
    OR (u.role='chefia' AND u.setor=s)
    OR (u.role='chefe_compras' AND u.setor='Compras' AND s='Compras')
    OR (u.role='chefe_licitacao' AND u.setor='Licitação' AND s='Licitação')
    OR (u.role='chefe_sofi' AND u.setor='SOFI' AND s='SOFI')
  ));
$f$;

CREATE OR REPLACE FUNCTION private.can_read_process(p uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $f$
 SELECT EXISTS (SELECT 1 FROM public.processos proc
  WHERE proc.id=p AND private.can_read_section(proc.setor));
$f$;

CREATE OR REPLACE FUNCTION private.can_read_task(t uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $f$
 SELECT EXISTS (SELECT 1 FROM public.tarefas task
  WHERE task.id=t AND private.can_read_section(task.setor));
$f$;

-- Dados essenciais ao painel: permissao de leitura na origem.
ALTER POLICY processos_leitura ON public.processos
 USING (private.can_read_section(setor));
ALTER POLICY tarefas_leitura ON public.tarefas
 USING (private.can_read_section(setor));
ALTER POLICY usuarios_diretorio ON public.usuarios
 USING (private.is_active() AND ativo=true AND private.can_read_section(setor));
-- usuarios_ve_proprio ainda autoriza visualizar apenas a propria conta ativa.

-- Historicos sempre vinculados ao setor atual do respectivo processo.
ALTER POLICY eventos_leitura ON public.eventos
 USING (private.can_read_process(processo_id));
ALTER POLICY tramites_leitura ON public.tramites
 USING (private.can_read_process(processo_id));

-- Nao exibir avisos de processos/tarefas cuja leitura nao e mais autorizada.
ALTER POLICY notificacoes_ler_proprias ON public.notificacoes
 USING (
  destinatario_auth_id=auth.uid() AND private.is_active()
  AND (processo_id IS NULL OR private.can_read_process(processo_id))
  AND (tarefa_id IS NULL OR private.can_read_task(tarefa_id))
 );

-- Sem 'setor' ou outra chave de setor confiavel: negar acesso aos chefes.
ALTER POLICY contratos_leitura ON public.contratos
 USING (private.is_active() AND NOT private.is_section_chief());
ALTER POLICY repasses_leitura ON public.repasses
 USING (private.is_active() AND NOT private.is_section_chief());
ALTER POLICY competencias_contratuais_read ON public.competencias_contratuais
 USING (private.can_finance() AND NOT private.is_section_chief());

-- Empenhos/solicitacoes com processo vinculado: somente setor do processo.
ALTER POLICY empenhos_leitura ON public.empenhos
 USING (private.is_active() AND
        (NOT private.is_section_chief() OR
         (processo_id IS NOT NULL AND private.can_read_process(processo_id))));
ALTER POLICY sol_empenho_read ON public.solicitacoes_empenho
 USING (private.can_finance() AND private.can_read_process(processo_id));

-- Bloquear execucao direta dos helpers a clientes: somente via RLS.
REVOKE ALL ON FUNCTION private.is_section_chief() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.can_read_section(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.can_read_process(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.can_read_task(uuid) FROM PUBLIC;
-- Autorizacao pela role authenticated e feita implicitamente pelo owner da policy.
GRANT EXECUTE ON FUNCTION private.is_section_chief() TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_read_section(text) TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_read_process(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_read_task(uuid) TO authenticated;
