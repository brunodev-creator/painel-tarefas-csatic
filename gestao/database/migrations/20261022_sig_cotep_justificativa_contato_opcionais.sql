-- Intenções: justificativa e contato do visitante passam a ser opcionais (vazio é gravado como nulo).
ALTER TABLE public.sig_cotep_intencoes DROP CONSTRAINT IF EXISTS sig_cotep_intencoes_origem_check;
ALTER TABLE public.sig_cotep_intencoes ADD CONSTRAINT sig_cotep_intencoes_origem_check CHECK (
 (origem = 'SIG' AND criado_por IS NOT NULL) OR
 (origem = 'Visitante' AND length(trim(coalesce(solicitante_nome,''))) >= 1));

DO $do$
DECLARE
 f text; novo text; t jsonb;
 trocas jsonb := jsonb_build_object(
  'public.sig_cotep_acao(jsonb)', jsonb_build_array(
   jsonb_build_array('IF length(trim(coalesce(p->>''justificativa'', i.justificativa, ''''))) < 1 THEN', 'IF false THEN'),
   jsonb_build_array('left(trim(p->>''justificativa''), 2000)', 'left(nullif(trim(p->>''justificativa''),''''), 2000)'),
   jsonb_build_array('justificativa = left(trim(coalesce(p->>''justificativa'', justificativa)), 2000)', 'justificativa = left(nullif(trim(coalesce(p->>''justificativa'', justificativa)),''''), 2000)')),
  'public.sig_cotep_publico_intencao(jsonb)', jsonb_build_array(
   jsonb_build_array(' IF length(v_contato) < 1 THEN RAISE EXCEPTION ''Informe um contato (e-mail funcional ou telefone)''; END IF;', ''),
   jsonb_build_array(' IF length(trim(coalesce(p->>''justificativa'',''''))) < 1 THEN RAISE EXCEPTION ''Informe a justificativa''; END IF;', ''),
   jsonb_build_array('left(trim(p->>''justificativa''), 2000)', 'left(nullif(trim(p->>''justificativa''),''''), 2000)'),
   jsonb_build_array('''Visitante'', v_nome, v_contato, v_ref)', '''Visitante'', v_nome, nullif(v_contato,''''), v_ref)')));
BEGIN
 FOR f IN SELECT jsonb_object_keys(trocas) LOOP
  novo := pg_get_functiondef(f::regprocedure);
  FOR t IN SELECT value FROM jsonb_array_elements(trocas->f) LOOP
   IF position(t->>0 IN novo) = 0 THEN RAISE EXCEPTION 'Trecho não encontrado em %: %', f, t->>0; END IF;
   novo := replace(novo, t->>0, t->>1);
  END LOOP;
  EXECUTE novo;
 END LOOP;
END $do$;
