-- SIG / Licitacao: demonstrativo temporario de contrato RP e registro de ate 50 numeros de especificacoes.
-- Este modulo NAO produz contrato com validade juridica, assinaturas ou empenhos.
CREATE TABLE IF NOT EXISTS public.licitacao_demo (
 processo_id uuid PRIMARY KEY REFERENCES public.processos(id) ON DELETE CASCADE,
 contrato_gerado_em timestamptz,
 contrato_origem text NOT NULL DEFAULT 'SEI 112570830 - MODELO DE CONTRATO RP BENS v1.2025.01',
 contrato_dados jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(contrato_dados)='object'),
 especificacoes jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(especificacoes)='array'),
 status text NOT NULL DEFAULT 'nao_iniciado' CHECK (status IN ('nao_iniciado','contrato_gerado','especificacoes_salvas','encaminhado')),
 atualizado_por uuid,
 atualizado_em timestamptz NOT NULL DEFAULT now(),
 CHECK (jsonb_array_length(especificacoes)<=50)
);
ALTER TABLE public.licitacao_demo ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.licitacao_demo FROM PUBLIC,anon;
GRANT SELECT ON public.licitacao_demo TO authenticated;
DROP POLICY IF EXISTS licitacao_demo_leitura ON public.licitacao_demo;
CREATE POLICY licitacao_demo_leitura ON public.licitacao_demo
 FOR SELECT TO authenticated USING (private.aipc_pode_visualizar());

CREATE OR REPLACE FUNCTION private.licitacao_demo_pode_editar()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $f$
 SELECT EXISTS (SELECT 1 FROM public.usuarios u WHERE u.auth_id=auth.uid() AND u.ativo
  AND u.setor='Licitação' AND u.role IN ('licitacao','chefe_licitacao','chefia','admin'));
$f$;

CREATE OR REPLACE FUNCTION public.gerar_contrato_demonstrativo(p_processo_id uuid)
RETURNS public.licitacao_demo
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $f$
DECLARE pr public.processos%rowtype;
DECLARE dados jsonb;
DECLARE saved public.licitacao_demo%rowtype;
BEGIN
 IF NOT private.licitacao_demo_pode_editar() THEN RAISE EXCEPTION 'Somente a Licitação pode gerar contrato demonstrativo'; END IF;
 SELECT * INTO pr FROM public.processos WHERE id=p_processo_id FOR SHARE;
 IF NOT FOUND OR pr.setor<>'Licitação' OR pr.status IN ('Concluído','Cancelado')
 THEN RAISE EXCEPTION 'Processo não está ativo na Licitação'; END IF;
 SELECT jsonb_build_object(
  'numero_sig',pr.numero,'objeto',pr.objeto,'modalidade',coalesce(pr.tipo_servico,pr.modalidade),
  'numero_processo_compras',a.numero_processo_compras,'aipc',coalesce(a.dados,'{}'::jsonb))
 INTO dados
 FROM (SELECT pr.id) ref LEFT JOIN public.aipc a ON a.processo_id=ref.id;
 INSERT INTO public.licitacao_demo(processo_id,contrato_gerado_em,contrato_dados,status,atualizado_por,atualizado_em)
 VALUES(pr.id,now(),dados,'contrato_gerado',auth.uid(),now())
 ON CONFLICT (processo_id) DO UPDATE
  SET contrato_gerado_em=EXCLUDED.contrato_gerado_em,
   contrato_dados=EXCLUDED.contrato_dados,
   status=CASE WHEN public.licitacao_demo.status='encaminhado' THEN 'contrato_gerado'
           WHEN jsonb_array_length(public.licitacao_demo.especificacoes)>0 THEN 'especificacoes_salvas'
           ELSE 'contrato_gerado' END,
   atualizado_por=auth.uid(),atualizado_em=now()
 RETURNING * INTO saved;
 RETURN saved;
END $f$;

CREATE OR REPLACE FUNCTION public.salvar_especificacoes_demonstrativas(p_processo_id uuid,p_numeros text[])
RETURNS public.licitacao_demo
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $f$
DECLARE pr public.processos%rowtype;
DECLARE saved public.licitacao_demo%rowtype;
DECLARE numeros text[];
BEGIN
 IF NOT private.licitacao_demo_pode_editar() THEN RAISE EXCEPTION 'Somente a Licitação pode registrar especificações'; END IF;
 SELECT * INTO pr FROM public.processos WHERE id=p_processo_id FOR SHARE;
 IF NOT FOUND OR pr.setor<>'Licitação' OR pr.status IN ('Concluído','Cancelado')
 THEN RAISE EXCEPTION 'Processo não está ativo na Licitação'; END IF;
 SELECT * INTO saved FROM public.licitacao_demo WHERE processo_id=pr.id FOR UPDATE;
 IF NOT FOUND OR saved.contrato_gerado_em IS NULL THEN
  RAISE EXCEPTION 'Gere o contrato demonstrativo antes de registrar especificações'; END IF;
 IF p_numeros IS NULL OR array_length(p_numeros,1) IS NULL OR
  array_length(p_numeros,1)>50 OR array_position(p_numeros,NULL) IS NOT NULL THEN
  RAISE EXCEPTION 'Informe de 1 a 50 números de especificações'; END IF;
 SELECT array_agg(btrim(n) ORDER BY pos)
 INTO numeros FROM unnest(p_numeros) WITH ORDINALITY AS t(n,pos);
 IF EXISTS (SELECT 1 FROM unnest(numeros) n WHERE length(n)=0 OR length(n)>120)
  THEN RAISE EXCEPTION 'Todos os números das especificações devem ser preenchidos (máximo 120 caracteres)'; END IF;
 IF (SELECT count(DISTINCT lower(n)) FROM unnest(numeros) AS n)<>array_length(numeros,1)
  THEN RAISE EXCEPTION 'Não repita o mesmo número de especificação'; END IF;
 UPDATE public.licitacao_demo
 SET especificacoes=to_jsonb(numeros),status='especificacoes_salvas',
   atualizado_por=auth.uid(),atualizado_em=now()
 WHERE processo_id=pr.id RETURNING * INTO saved;
 RETURN saved;
END $f$;

REVOKE ALL ON FUNCTION public.gerar_contrato_demonstrativo(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.salvar_especificacoes_demonstrativas(uuid,text[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.gerar_contrato_demonstrativo(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.salvar_especificacoes_demonstrativas(uuid,text[]) TO authenticated;

CREATE OR REPLACE FUNCTION private.licitacao_demo_validar_envio_sofi()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $f$
BEGIN
 IF OLD.setor='Licitação' AND NEW.setor='SOFI' AND NOT EXISTS (
  SELECT 1 FROM public.licitacao_demo d
   WHERE d.processo_id=OLD.id AND d.contrato_gerado_em IS NOT NULL
    AND d.status='especificacoes_salvas'
    AND jsonb_array_length(d.especificacoes) BETWEEN 1 AND 50
    AND NOT EXISTS (
     SELECT 1 FROM jsonb_array_elements_text(d.especificacoes) x WHERE length(btrim(x))=0
    )
 ) THEN
  RAISE EXCEPTION 'Para encaminhar à SOFI, gere o contrato demonstrativo e registre de 1 a 50 números de especificações';
 END IF;
 RETURN NEW;
END $f$;
DROP TRIGGER IF EXISTS licitacao_demo_validar_envio_sofi ON public.processos;
CREATE TRIGGER licitacao_demo_validar_envio_sofi
 BEFORE UPDATE OF setor ON public.processos FOR EACH ROW
 EXECUTE FUNCTION private.licitacao_demo_validar_envio_sofi();

CREATE OR REPLACE FUNCTION private.licitacao_demo_marcar_encaminhado()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $f$
BEGIN
 IF OLD.setor='Licitação' AND NEW.setor='SOFI' THEN
  UPDATE public.licitacao_demo SET status='encaminhado',atualizado_em=now()
  WHERE processo_id=NEW.id;
 END IF;
 RETURN NEW;
END $f$;
DROP TRIGGER IF EXISTS licitacao_demo_marcar_encaminhado ON public.processos;
CREATE TRIGGER licitacao_demo_marcar_encaminhado
 AFTER UPDATE OF setor ON public.processos FOR EACH ROW
 EXECUTE FUNCTION private.licitacao_demo_marcar_encaminhado();
