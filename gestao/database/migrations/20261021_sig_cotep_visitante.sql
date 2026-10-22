-- SIG CSA-TIC · Intenções de COTEP: acesso de VISITANTE (sem conta).
-- O visitante entra pelo botão «COTEP» da tela de login e só alcança duas funções públicas:
--   sig_cotep_publico_dados(codigo)      → painel por elemento-item (sem contatos nem trilha interna)
--   sig_cotep_publico_intencao(p jsonb)  → registra intenção PENDENTE (nunca reserva saldo)
-- Nenhuma tabela é liberada ao papel anon. A DTS-1 pode desligar o acesso ou exigir um código
-- compartilhado (sig_cotep_acao, ação 'acesso_publico'). Há limite de envios por hora.
-- Pré-requisito: 20261021_sig_cotep_v2_elemento_item.sql.

-- 1. Parâmetro do acesso público (linha única) -----------------------------------------------
CREATE TABLE IF NOT EXISTS public.sig_cotep_acesso_publico (
 id boolean PRIMARY KEY DEFAULT true CHECK (id),
 ativo boolean NOT NULL DEFAULT true,
 codigo_hash text,
 limite_por_hora integer NOT NULL DEFAULT 60 CHECK (limite_por_hora BETWEEN 1 AND 1000),
 atualizado_por uuid REFERENCES auth.users(id),
 atualizado_em timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.sig_cotep_acesso_publico (id) VALUES (true) ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.sig_cotep_acesso_publico ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sig_cotep_acesso_publico FROM PUBLIC, anon, authenticated;
GRANT SELECT (ativo, limite_por_hora, atualizado_em) ON public.sig_cotep_acesso_publico TO authenticated;
CREATE POLICY sig_cotep_acesso_publico_ler ON public.sig_cotep_acesso_publico FOR SELECT TO authenticated USING (private.sig_cotep_ativo());
CREATE OR REPLACE TRIGGER sig_cotep_auditoria_trg AFTER INSERT OR UPDATE ON public.sig_cotep_acesso_publico
 FOR EACH ROW EXECUTE FUNCTION private.sig_cotep_auditar();

-- 2. Intenções de visitante: identificação do solicitante sem conta --------------------------
ALTER TABLE public.sig_cotep_intencoes ALTER COLUMN criado_por DROP NOT NULL;
ALTER TABLE public.sig_cotep_eventos ALTER COLUMN autor DROP NOT NULL;
ALTER TABLE public.sig_cotep_intencoes ADD COLUMN IF NOT EXISTS origem text NOT NULL DEFAULT 'SIG';
ALTER TABLE public.sig_cotep_intencoes ADD COLUMN IF NOT EXISTS solicitante_nome text;
ALTER TABLE public.sig_cotep_intencoes ADD COLUMN IF NOT EXISTS solicitante_contato text;
ALTER TABLE public.sig_cotep_intencoes ADD COLUMN IF NOT EXISTS origem_ref text;
ALTER TABLE public.sig_cotep_intencoes ADD CONSTRAINT sig_cotep_intencoes_origem_check CHECK (
 (origem = 'SIG' AND criado_por IS NOT NULL)
 OR (origem = 'Visitante' AND length(trim(coalesce(solicitante_nome,''))) >= 3 AND length(trim(coalesce(solicitante_contato,''))) >= 5));
CREATE INDEX IF NOT EXISTS idx_sig_cotep_int_visitante ON public.sig_cotep_intencoes(origem, criado_em DESC);

-- 3. Funções públicas ------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.sig_cotep_codigo_hash(p text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path TO '' AS $f$
 SELECT encode(sha256(convert_to('sig_cotep_visitante|' || trim(p), 'UTF8')), 'hex')
$f$;

CREATE OR REPLACE FUNCTION private.sig_cotep_publico_liberado(p_codigo text) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $f$
DECLARE a public.sig_cotep_acesso_publico%ROWTYPE;
BEGIN
 SELECT * INTO a FROM public.sig_cotep_acesso_publico WHERE id;
 IF NOT FOUND OR NOT a.ativo THEN RAISE EXCEPTION 'Acesso de visitante ao COTEP desativado pela DTS-1'; END IF;
 IF a.codigo_hash IS NOT NULL AND a.codigo_hash IS DISTINCT FROM private.sig_cotep_codigo_hash(coalesce(p_codigo,'')) THEN
  RAISE EXCEPTION 'Código de acesso COTEP inválido' USING HINT = 'codigo';
 END IF;
END $f$;

CREATE OR REPLACE FUNCTION public.sig_cotep_publico_dados(p_codigo text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $f$
DECLARE v_ano int := extract(year FROM now() AT TIME ZONE 'America/Sao_Paulo')::int;
BEGIN
 PERFORM private.sig_cotep_publico_liberado(p_codigo);
 RETURN jsonb_build_object(
  'limites', coalesce((SELECT jsonb_agg(jsonb_build_object('ano',ano,'unidade_gestora',unidade_gestora,'valor_limite',valor_limite,
     'base_normativa',base_normativa,'validacao_juridica',validacao_juridica,'padrao',padrao)) FROM public.sig_cotep_limites WHERE ano >= v_ano - 1), '[]'),
  'elementos', coalesce((SELECT jsonb_agg(jsonb_build_object('codigo',codigo,'descricao',descricao,'ativo',ativo)) FROM public.sig_cotep_elementos WHERE ativo), '[]'),
  'centros', coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'nome',nome,'ativo',ativo)) FROM public.sig_cotep_centros WHERE ativo), '[]'),
  'coteps', coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'ano',ano,'unidade_gestora',unidade_gestora,'numero',numero,'objeto',objeto,'situacao',situacao))
     FROM public.sig_cotep_coteps WHERE ano >= v_ano - 1), '[]'),
  'procedimentos', coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'cotep_id',cotep_id,'ano',ano,'unidade_gestora',unidade_gestora,'numero',numero,
     'situacao',situacao,'elemento_item',elemento_item,'valor_estimado',valor_estimado,'valor_homologado',valor_homologado,'ativo',ativo))
     FROM public.sig_cotep_procedimentos WHERE ano >= v_ano - 1), '[]'),
  -- Sem contatos, autores, observações internas ou trilha de auditoria.
  'intencoes', coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'ano',ano,'unidade_gestora',unidade_gestora,'centro',centro,'objeto',objeto,
     'elemento_item',elemento_item,'valor_estimado',valor_estimado,'valor_reservado',valor_reservado,'situacao',situacao,'prioridade',prioridade,
     'cotep_numero',cotep_numero,'cotep_id',cotep_id,'origem',origem,'criado_em',criado_em,'atualizado_em',atualizado_em))
     FROM public.sig_cotep_intencoes WHERE ano >= v_ano - 1), '[]'),
  'saldos', coalesce((SELECT jsonb_agg(to_jsonb(s)) FROM public.sig_cotep_saldos s WHERE ano >= v_ano - 1), '[]'));
END $f$;

CREATE OR REPLACE FUNCTION public.sig_cotep_publico_intencao(p jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $f$
DECLARE
 a public.sig_cotep_acesso_publico%ROWTYPE;
 v_ano int := extract(year FROM now() AT TIME ZONE 'America/Sao_Paulo')::int;
 v_ug text; v_el text; v_valor numeric(14,2); v_txt text; v_centro text; v_nome text; v_contato text; v_ref text; v_id uuid;
BEGIN
 PERFORM private.sig_cotep_publico_liberado(p->>'codigo');
 SELECT * INTO a FROM public.sig_cotep_acesso_publico WHERE id;
 -- Limite de envios: global por hora e por origem de rede (hash, nunca o IP em claro).
 v_ref := encode(sha256(convert_to(coalesce(split_part(current_setting('request.headers', true)::json->>'x-forwarded-for', ',', 1), 'sem-ip'), 'UTF8')), 'hex');
 PERFORM pg_advisory_xact_lock(hashtextextended('sig_cotep_visitante', 0));
 IF (SELECT count(*) FROM public.sig_cotep_intencoes WHERE origem = 'Visitante' AND criado_em > now() - interval '1 hour') >= a.limite_por_hora THEN
  RAISE EXCEPTION 'Muitas intenções registradas na última hora. Tente novamente mais tarde.'; END IF;
 IF (SELECT count(*) FROM public.sig_cotep_intencoes WHERE origem = 'Visitante' AND origem_ref = v_ref AND criado_em > now() - interval '1 hour') >= 10 THEN
  RAISE EXCEPTION 'Limite de 10 intenções por hora a partir desta rede atingido.'; END IF;
 v_ug := (SELECT unidade_gestora FROM public.sig_cotep_limites WHERE ano = v_ano AND padrao);
 IF v_ug IS NULL THEN RAISE EXCEPTION 'Limite anual de COTEP de % ainda não foi configurado pela DTS-1', v_ano; END IF;
 v_el := trim(coalesce(p->>'elemento_item',''));
 IF v_el !~ '^[0-9]{4}$' THEN RAISE EXCEPTION 'Informe o elemento-item com 4 dígitos (ex.: 3016)'; END IF;
 IF EXISTS (SELECT 1 FROM public.sig_cotep_elementos WHERE codigo = v_el AND NOT ativo) THEN RAISE EXCEPTION 'Elemento-item % está inativo no catálogo', v_el; END IF;
 v_centro := left(trim(coalesce(p->>'centro','')), 120);
 IF length(v_centro) < 2 THEN RAISE EXCEPTION 'Informe o centro solicitante'; END IF;
 SELECT nome INTO v_txt FROM public.sig_cotep_centros WHERE lower(trim(nome)) = lower(v_centro) AND ativo;
 v_centro := coalesce(v_txt, v_centro);
 v_nome := left(trim(coalesce(p->>'solicitante_nome','')), 120);
 v_contato := left(trim(coalesce(p->>'solicitante_contato','')), 160);
 IF length(v_nome) < 3 THEN RAISE EXCEPTION 'Informe seu nome (posto/graduação e nome)'; END IF;
 IF length(v_contato) < 5 THEN RAISE EXCEPTION 'Informe um contato (e-mail funcional ou telefone)'; END IF;
 v_valor := private.sig_cotep_valor(p->>'valor_estimado');
 IF v_valor IS NULL OR v_valor <= 0 THEN RAISE EXCEPTION 'Informe o valor estimado'; END IF;
 v_txt := left(trim(coalesce(p->>'objeto','')), 1500);
 IF length(v_txt) < 8 THEN RAISE EXCEPTION 'Descreva o objeto (mínimo 8 caracteres)'; END IF;
 IF length(trim(coalesce(p->>'justificativa',''))) < 10 THEN RAISE EXCEPTION 'Informe a justificativa (mínimo 10 caracteres)'; END IF;
 IF coalesce(p->>'prioridade','Média') NOT IN ('Alta','Média','Baixa') THEN RAISE EXCEPTION 'Prioridade inválida'; END IF;
 IF EXISTS (SELECT 1 FROM public.sig_cotep_intencoes WHERE origem = 'Visitante' AND origem_ref = v_ref AND elemento_item = v_el
   AND lower(trim(objeto)) = lower(v_txt) AND valor_estimado = v_valor AND criado_em > now() - interval '10 minutes') THEN
  RAISE EXCEPTION 'Intenção idêntica registrada há poucos minutos; confira a lista antes de repetir'; END IF;
 INSERT INTO public.sig_cotep_intencoes (ano, unidade_gestora, centro, objeto, elemento_item, valor_estimado, justificativa, prioridade,
  origem, solicitante_nome, solicitante_contato, origem_ref)
 VALUES (v_ano, v_ug, v_centro, v_txt, v_el, v_valor, left(trim(p->>'justificativa'), 2000), coalesce(p->>'prioridade','Média'),
  'Visitante', v_nome, v_contato, v_ref)
 RETURNING id INTO v_id;
 PERFORM private.sig_cotep_evento('Intenção', concat('Intenção registrada por visitante: ', v_nome, ' (', v_centro, ')'), v_id, NULL, NULL, v_el, v_valor, NULL);
 RETURN jsonb_build_object('ok', true, 'id', v_id, 'situacao', 'Pendente');
END $f$;

REVOKE ALL ON FUNCTION private.sig_cotep_codigo_hash(text), private.sig_cotep_publico_liberado(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sig_cotep_publico_dados(text), public.sig_cotep_publico_intencao(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sig_cotep_publico_dados(text), public.sig_cotep_publico_intencao(jsonb) TO anon, authenticated;

-- 4. Parâmetro gerido pela DTS-1 -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sig_cotep_acesso_publico_definir(p jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $f$
BEGIN
 IF NOT private.sig_cotep_ativo() OR NOT private.sig_cotep_gestor() THEN
  RAISE EXCEPTION 'Somente gestor DTS-1 autorizado pode alterar o acesso de visitante'; END IF;
 IF p ? 'codigo' AND length(trim(coalesce(p->>'codigo',''))) BETWEEN 1 AND 5 THEN
  RAISE EXCEPTION 'O código de acesso deve ter ao menos 6 caracteres (ou ficar vazio para dispensá-lo)'; END IF;
 UPDATE public.sig_cotep_acesso_publico SET
  ativo = coalesce((p->>'ativo')::boolean, ativo),
  codigo_hash = CASE WHEN NOT (p ? 'codigo') THEN codigo_hash
                     WHEN trim(coalesce(p->>'codigo','')) = '' THEN NULL
                     ELSE private.sig_cotep_codigo_hash(p->>'codigo') END,
  limite_por_hora = coalesce(nullif(p->>'limite_por_hora','')::int, limite_por_hora),
  atualizado_por = auth.uid(), atualizado_em = now()
 WHERE id;
 PERFORM private.sig_cotep_evento('Parâmetro', concat('Acesso de visitante ',
  CASE WHEN coalesce((p->>'ativo')::boolean, true) THEN 'ativo' ELSE 'desativado' END,
  CASE WHEN p ? 'codigo' THEN CASE WHEN trim(coalesce(p->>'codigo','')) = '' THEN ' · sem código' ELSE ' · código alterado' END ELSE '' END),
  NULL, NULL, NULL, NULL, NULL, NULL);
 RETURN jsonb_build_object('ok', true);
END $f$;
REVOKE ALL ON FUNCTION public.sig_cotep_acesso_publico_definir(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sig_cotep_acesso_publico_definir(jsonb) TO authenticated;
-- Saber se o código é exigido (sem revelar o código) para o formulário do visitante.
CREATE OR REPLACE FUNCTION public.sig_cotep_publico_status() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $f$
 SELECT jsonb_build_object('ativo', coalesce(bool_or(ativo), false), 'exige_codigo', coalesce(bool_or(codigo_hash IS NOT NULL), false))
 FROM public.sig_cotep_acesso_publico
$f$;
REVOKE ALL ON FUNCTION public.sig_cotep_publico_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sig_cotep_publico_status() TO anon, authenticated;
