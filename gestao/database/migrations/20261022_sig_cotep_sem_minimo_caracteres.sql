-- Intenções e COTEPs: textos só precisam estar preenchidos (sem mínimo de caracteres).
-- Mantidos: tamanhos máximos, código de acesso do visitante (6) e justificativa de exceção ao limite (20).

-- 1. Restrições das tabelas ------------------------------------------------------------------
ALTER TABLE public.sig_cotep_intencoes DROP CONSTRAINT IF EXISTS sig_cotep_intencoes_centro_check;
ALTER TABLE public.sig_cotep_intencoes ADD CONSTRAINT sig_cotep_intencoes_centro_check CHECK (length(trim(centro)) BETWEEN 1 AND 120);
ALTER TABLE public.sig_cotep_intencoes DROP CONSTRAINT IF EXISTS sig_cotep_intencoes_objeto_check;
ALTER TABLE public.sig_cotep_intencoes ADD CONSTRAINT sig_cotep_intencoes_objeto_check CHECK (length(trim(objeto)) BETWEEN 1 AND 1500);
ALTER TABLE public.sig_cotep_intencoes DROP CONSTRAINT IF EXISTS sig_cotep_intencoes_grupo_check;
ALTER TABLE public.sig_cotep_intencoes ADD CONSTRAINT sig_cotep_intencoes_grupo_check CHECK (grupo IS NULL OR length(trim(grupo)) BETWEEN 1 AND 60);
ALTER TABLE public.sig_cotep_intencoes DROP CONSTRAINT IF EXISTS sig_cotep_intencoes_origem_check;
ALTER TABLE public.sig_cotep_intencoes ADD CONSTRAINT sig_cotep_intencoes_origem_check CHECK (
 (origem = 'SIG' AND criado_por IS NOT NULL) OR
 (origem = 'Visitante' AND length(trim(coalesce(solicitante_nome,''))) >= 1 AND length(trim(coalesce(solicitante_contato,''))) >= 1));
ALTER TABLE public.sig_cotep_coteps DROP CONSTRAINT IF EXISTS sig_cotep_coteps_objeto_check;
ALTER TABLE public.sig_cotep_coteps ADD CONSTRAINT sig_cotep_coteps_objeto_check CHECK (length(trim(objeto)) BETWEEN 1 AND 1500);
ALTER TABLE public.sig_cotep_procedimentos DROP CONSTRAINT IF EXISTS sig_cotep_procedimentos_objeto_check;
ALTER TABLE public.sig_cotep_procedimentos ADD CONSTRAINT sig_cotep_procedimentos_objeto_check CHECK (length(trim(objeto)) BETWEEN 1 AND 1500);
ALTER TABLE public.sig_cotep_limites DROP CONSTRAINT IF EXISTS sig_cotep_limites_base_normativa_check;
ALTER TABLE public.sig_cotep_limites ADD CONSTRAINT sig_cotep_limites_base_normativa_check CHECK (length(trim(base_normativa)) >= 1);
ALTER TABLE public.sig_cotep_elementos DROP CONSTRAINT IF EXISTS sig_cotep_elementos_descricao_check;
ALTER TABLE public.sig_cotep_elementos ADD CONSTRAINT sig_cotep_elementos_descricao_check CHECK (descricao IS NULL OR length(trim(descricao)) BETWEEN 1 AND 200);
ALTER TABLE public.sig_cotep_centros DROP CONSTRAINT IF EXISTS sig_cotep_centros_nome_check;
ALTER TABLE public.sig_cotep_centros ADD CONSTRAINT sig_cotep_centros_nome_check CHECK (length(trim(nome)) BETWEEN 1 AND 120);

-- 2. Validações das RPCs: troca só os limiares, preservando o restante da definição vigente --
DO $do$
DECLARE
 f text; def text; novo text; par text[];
 trocas jsonb := jsonb_build_object(
  'public.sig_cotep_acao(jsonb)', jsonb_build_array(
   jsonb_build_array('length(coalesce(v_centro,'''')) < 2', 'length(coalesce(v_centro,'''')) < 1'),
   jsonb_build_array('length(coalesce(v_txt,'''')) < 8', 'length(coalesce(v_txt,'''')) < 1'),
   jsonb_build_array('i.justificativa, ''''))) < 10', 'i.justificativa, ''''))) < 1'),
   jsonb_build_array('length(trim(coalesce(p->>''motivo'',''''))) < 5', 'length(trim(coalesce(p->>''motivo'',''''))) < 1'),
   jsonb_build_array('length(trim(coalesce(p->>''objeto'',''''))) < 8', 'length(trim(coalesce(p->>''objeto'',''''))) < 1'),
   jsonb_build_array('length(trim(coalesce(p->>''base_normativa'',''''))) < 10', 'length(trim(coalesce(p->>''base_normativa'',''''))) < 1'),
   jsonb_build_array('length(v_txt) < 2', 'length(v_txt) < 1'),
   jsonb_build_array(' (mínimo 8 caracteres)', ''),
   jsonb_build_array(' (mínimo 10 caracteres)', '')),
  'public.sig_cotep_publico_intencao(jsonb)', jsonb_build_array(
   jsonb_build_array('length(v_centro) < 2', 'length(v_centro) < 1'),
   jsonb_build_array('length(v_nome) < 3', 'length(v_nome) < 1'),
   jsonb_build_array('length(v_contato) < 5', 'length(v_contato) < 1'),
   jsonb_build_array('length(v_txt) < 8', 'length(v_txt) < 1'),
   jsonb_build_array('length(trim(coalesce(p->>''justificativa'',''''))) < 10', 'length(trim(coalesce(p->>''justificativa'',''''))) < 1'),
   jsonb_build_array(' (mínimo 8 caracteres)', ''),
   jsonb_build_array(' (mínimo 10 caracteres)', '')));
 t jsonb;
BEGIN
 FOR f IN SELECT jsonb_object_keys(trocas) LOOP
  def := pg_get_functiondef(f::regprocedure); novo := def;
  FOR t IN SELECT value FROM jsonb_array_elements(trocas->f) LOOP
   IF t->>1 <> '' AND position(t->>0 IN novo) = 0 THEN
    RAISE EXCEPTION 'Trecho não encontrado em %: %', f, t->>0;
   END IF;
   novo := replace(novo, t->>0, t->>1);
  END LOOP;
  EXECUTE novo;
 END LOOP;
END $do$;
