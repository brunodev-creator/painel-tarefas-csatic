-- AIPC compartilhada entre Compras, Licitação e SOFI.
-- Leitura para perfis ativos; edição EXCLUSIVA da Compras, mesmo quando o
-- processo estiver em Licitação ou SOFI. Rascunhos continuam sem número.
CREATE OR REPLACE FUNCTION private.aipc_pode_visualizar()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $f$
 SELECT EXISTS(SELECT 1 FROM public.usuarios u WHERE u.auth_id=auth.uid()
  AND u.ativo AND u.role IN
   ('admin','compras','licitacao','sofi','chefia','chefe_compras','chefe_licitacao','chefe_sofi','leitura'));
$f$;

CREATE OR REPLACE FUNCTION private.aipc_pode_editar()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $f$
 SELECT EXISTS(SELECT 1 FROM public.usuarios u WHERE u.auth_id=auth.uid()
  AND u.ativo AND u.setor='Compras'
  AND u.role IN ('compras','chefe_compras','chefia'));
$f$;

DROP POLICY IF EXISTS aipc_ler_setor ON public.aipc;
DROP POLICY IF EXISTS aipc_criar_setor ON public.aipc;
DROP POLICY IF EXISTS aipc_editar_setor ON public.aipc;
CREATE POLICY aipc_visualizacao_intersetorial ON public.aipc
 FOR SELECT TO authenticated USING (private.aipc_pode_visualizar());
CREATE POLICY aipc_criacao_compras ON public.aipc
 FOR INSERT TO authenticated WITH CHECK (private.aipc_pode_editar());
CREATE POLICY aipc_edicao_compras ON public.aipc
 FOR UPDATE TO authenticated USING (private.aipc_pode_editar())
 WITH CHECK (private.aipc_pode_editar());

-- Reforce a restrição inclusive para gravações via RPC SECURITY DEFINER.
CREATE OR REPLACE FUNCTION public.salvar_aipc(
 p_processo_id uuid,p_numero text,p_dados jsonb,p_finalizar boolean DEFAULT false
) RETURNS public.aipc
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $f$
DECLARE item public.aipc%rowtype;
DECLARE processo_id_real uuid;
DECLARE num text:=nullif(btrim(coalesce(p_numero,'')),'');
DECLARE situacao text;
BEGIN
 IF NOT private.aipc_pode_editar() THEN
  RAISE EXCEPTION 'Somente a Seção de Compras pode criar ou editar a AIPC';
 END IF;
 SELECT p.id INTO processo_id_real FROM public.processos p
 WHERE p.id=p_processo_id FOR SHARE;
 IF processo_id_real IS NULL THEN
  RAISE EXCEPTION 'Processo de aquisição não encontrado';
 END IF;
 IF p_dados IS NULL OR jsonb_typeof(p_dados)<>'object' THEN
  RAISE EXCEPTION 'Dados da AIPC inválidos';
 END IF;
 IF char_length(coalesce(num,''))>120 THEN
  RAISE EXCEPTION 'Número do Processo de Compras maior que 120 caracteres';
 END IF;
 IF p_finalizar AND num IS NULL THEN
  RAISE EXCEPTION 'Informe o Número do Processo de Compras para finalizar a AIPC';
 END IF;
 SELECT a.* INTO item FROM public.aipc a
 WHERE a.processo_id=p_processo_id FOR UPDATE;
 situacao:=CASE WHEN p_finalizar THEN 'pronta'
  WHEN FOUND AND item.status='pronta' AND num IS NOT NULL THEN 'pronta'
  ELSE 'rascunho' END;
 INSERT INTO public.aipc(processo_id,numero_processo_compras,dados,status)
 VALUES (p_processo_id,num,p_dados,situacao)
 ON CONFLICT(processo_id) DO UPDATE
 SET numero_processo_compras=EXCLUDED.numero_processo_compras,
     dados=EXCLUDED.dados,status=EXCLUDED.status
 RETURNING * INTO item;
 RETURN item;
END $f$;
REVOKE ALL ON FUNCTION public.salvar_aipc(uuid,text,jsonb,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.salvar_aipc(uuid,text,jsonb,boolean) TO authenticated;

-- Mantém trilha de revisões quando uma AIPC já pronta for alterada.
CREATE TABLE IF NOT EXISTS public.aipc_revisoes(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 processo_id uuid NOT NULL REFERENCES public.processos(id) ON DELETE CASCADE,
 numero_anterior text,
 dados_anteriores jsonb NOT NULL,
 status_anterior text NOT NULL,
 alterado_por uuid DEFAULT auth.uid(),
 alterado_em timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.aipc_revisoes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.aipc_revisoes FROM PUBLIC,anon;
GRANT SELECT ON public.aipc_revisoes TO authenticated;
DROP POLICY IF EXISTS aipc_revisoes_consultar ON public.aipc_revisoes;
CREATE POLICY aipc_revisoes_consultar ON public.aipc_revisoes
 FOR SELECT TO authenticated USING (private.aipc_pode_visualizar());

CREATE OR REPLACE FUNCTION private.registrar_revisao_aipc()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $f$
DECLARE autor text;
BEGIN
 IF OLD.status='pronta' AND
 (OLD.dados IS DISTINCT FROM NEW.dados
  OR OLD.numero_processo_compras IS DISTINCT FROM NEW.numero_processo_compras
  OR OLD.status IS DISTINCT FROM NEW.status) THEN
  INSERT INTO public.aipc_revisoes
   (processo_id,numero_anterior,dados_anteriores,status_anterior,alterado_por)
  VALUES (OLD.processo_id,OLD.numero_processo_compras,OLD.dados,OLD.status,auth.uid());
  SELECT nome INTO autor FROM public.usuarios WHERE auth_id=auth.uid();
  INSERT INTO public.eventos(processo_id,tipo,descricao,usuario,actor_id)
  VALUES (OLD.processo_id,'Revisão da AIPC',
   'AIPC alterada após finalização pela Seção de Compras; versão anterior preservada.',
   coalesce(autor,'Seção de Compras'),auth.uid());
 END IF;
 RETURN NEW;
END $f$;
DROP TRIGGER IF EXISTS registrar_revisao_aipc ON public.aipc;
CREATE TRIGGER registrar_revisao_aipc
 AFTER UPDATE ON public.aipc FOR EACH ROW EXECUTE FUNCTION private.registrar_revisao_aipc();
