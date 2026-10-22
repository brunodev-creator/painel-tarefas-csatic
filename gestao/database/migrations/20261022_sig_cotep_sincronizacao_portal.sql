-- Sincronização diária das COTEPs a partir da «agora vai - PLANILHA ATUAL» (aba CONTROLE_PROCESSOS_COMPRA,
-- alimentada pelo Portal de Compras). Um Apps Script com gatilho diário envia as linhas de
-- «Dispensa de Licitação - Por valor» para public.sig_cotep_sincronizar_portal, autenticado por token.
--   • COTEP já cadastrada com um elemento-item: atualiza estimado, homologado e situação (oficiais).
--   • COTEP com vários elementos-itens homologada: gera pendência para a DTS-1 distribuir o homologado.
--   • COTEP nova: classifica sozinha quando todos os códigos CATMAS já são conhecidos em um único
--     elemento-item; senão gera pendência «classificar». Nunca grava valor sem elemento-item.
-- Os gatilhos de limite continuam valendo: atualização que estoure o saldo vira pendência.
-- Planilha defasada nunca reabre COTEP já encerrada no SIG.

-- 1. Token de integração (somente hash é guardado) -------------------------------------------
CREATE TABLE IF NOT EXISTS public.sig_integracao_tokens (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 nome text NOT NULL UNIQUE CHECK (length(trim(nome)) BETWEEN 3 AND 60),
 token_hash text NOT NULL,
 ativo boolean NOT NULL DEFAULT true,
 criado_por uuid REFERENCES auth.users(id),
 criado_em timestamptz NOT NULL DEFAULT now(),
 ultimo_uso timestamptz
);
ALTER TABLE public.sig_integracao_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sig_integracao_tokens FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.sig_integracao_gerar_token(p_nome text DEFAULT 'planilha-agora-vai') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $f$
DECLARE v_token text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
BEGIN
 IF NOT private.sig_cotep_admin() THEN RAISE EXCEPTION 'Somente administrador gera token de integração'; END IF;
 INSERT INTO public.sig_integracao_tokens (nome, token_hash, ativo, criado_por)
 VALUES (trim(p_nome), encode(sha256(convert_to(v_token, 'UTF8')), 'hex'), true, auth.uid())
 ON CONFLICT (nome) DO UPDATE SET token_hash = excluded.token_hash, ativo = true, criado_por = excluded.criado_por, criado_em = now(), ultimo_uso = NULL;
 RETURN jsonb_build_object('nome', trim(p_nome), 'token', v_token,
  'aviso', 'Copie agora: o token não é exibido novamente. Gerar outro invalida este.');
END $f$;
REVOKE ALL ON FUNCTION public.sig_integracao_gerar_token(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sig_integracao_gerar_token(text) TO authenticated;

-- 2. Registro das execuções, pendências e mapa CATMAS → elemento-item ------------------------
CREATE TABLE IF NOT EXISTS public.sig_cotep_sincronizacoes (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 executado_em timestamptz NOT NULL DEFAULT now(),
 origem text NOT NULL,
 linhas integer NOT NULL DEFAULT 0,
 atualizadas integer NOT NULL DEFAULT 0,
 criadas integer NOT NULL DEFAULT 0,
 sem_alteracao integer NOT NULL DEFAULT 0,
 pendencias integer NOT NULL DEFAULT 0,
 detalhes jsonb
);
CREATE TABLE IF NOT EXISTS public.sig_cotep_pendencias (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 ano integer NOT NULL,
 unidade_gestora text NOT NULL,
 numero text NOT NULL,
 tipo text NOT NULL CHECK (tipo IN ('classificar','distribuir_homologado','saldo_insuficiente','divergencia')),
 objeto text,
 valor_referencia numeric(14,2),
 valor_homologado numeric(14,2),
 situacao_portal text,
 codigos_itens text,
 materiais text,
 mensagem text,
 resolvida boolean NOT NULL DEFAULT false,
 criada_em timestamptz NOT NULL DEFAULT now(),
 atualizada_em timestamptz NOT NULL DEFAULT now(),
 resolvida_em timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS sig_cotep_pendencias_aberta ON public.sig_cotep_pendencias(ano, unidade_gestora, numero, tipo) WHERE NOT resolvida;
CREATE TABLE IF NOT EXISTS public.sig_cotep_catmas (
 codigo text PRIMARY KEY,
 elemento_item text NOT NULL CHECK (elemento_item ~ '^[0-9]{4}$'),
 origem text,
 atualizado_em timestamptz NOT NULL DEFAULT now()
);
DO $do$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['sig_cotep_sincronizacoes','sig_cotep_pendencias','sig_cotep_catmas'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', t);
  EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
  EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (private.sig_cotep_ativo())', t || '_ler', t);
 END LOOP;
END $do$;
REVOKE ALL ON SEQUENCE public.sig_cotep_sincronizacoes_id_seq FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE TRIGGER sig_cotep_auditoria_trg AFTER INSERT OR UPDATE ON public.sig_cotep_pendencias
 FOR EACH ROW EXECUTE FUNCTION private.sig_cotep_auditar();

-- Pendência some sozinha quando a DTS-1 cadastra a COTEP (ou a reclassifica).
CREATE OR REPLACE FUNCTION private.sig_cotep_resolver_pendencias() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $f$
BEGIN
 UPDATE public.sig_cotep_pendencias SET resolvida = true, resolvida_em = now(), atualizada_em = now()
 WHERE NOT resolvida AND tipo = 'classificar' AND ano = NEW.ano AND unidade_gestora = NEW.unidade_gestora AND numero = NEW.numero;
 RETURN NEW;
END $f$;
REVOKE ALL ON FUNCTION private.sig_cotep_resolver_pendencias() FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE TRIGGER sig_cotep_resolver_pendencias AFTER INSERT ON public.sig_cotep_coteps
 FOR EACH ROW EXECUTE FUNCTION private.sig_cotep_resolver_pendencias();

-- Valor monetário vindo da planilha: número ou texto «R$ 1.234,56».
CREATE OR REPLACE FUNCTION private.sig_cotep_num(v jsonb) RETURNS numeric
LANGUAGE plpgsql IMMUTABLE SET search_path TO '' AS $f$
DECLARE s text;
BEGIN
 IF v IS NULL OR jsonb_typeof(v) = 'null' THEN RETURN NULL; END IF;
 IF jsonb_typeof(v) = 'number' THEN RETURN round((v #>> '{}')::numeric, 2); END IF;
 s := regexp_replace(v #>> '{}', '[^0-9,.-]', '', 'g');
 IF s = '' THEN RETURN NULL; END IF;
 IF s ~ ',' THEN s := replace(replace(s, '.', ''), ',', '.'); END IF;
 RETURN round(s::numeric, 2);
EXCEPTION WHEN OTHERS THEN RETURN NULL;
END $f$;
REVOKE ALL ON FUNCTION private.sig_cotep_num(jsonb) FROM PUBLIC, anon, authenticated;

-- 3. Sincronização --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sig_cotep_sincronizar_portal(p_token text, p_linhas jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $f$
DECLARE
 r jsonb; v_proc text; v_ano int; v_ug text; v_num text; v_vref numeric; v_vhom numeric; v_sit text; v_exec text;
 v_codigos text; v_alvo text; c public.sig_cotep_coteps%ROWTYPE; v_itens int; it public.sig_cotep_procedimentos%ROWTYPE;
 v_els text[]; v_atual int := 0; v_criad int := 0; v_igual int := 0; v_pend int := 0; v_lin int := 0;
 v_log jsonb := '[]'; v_msg text;
BEGIN
 IF p_token IS NULL OR NOT EXISTS (SELECT 1 FROM public.sig_integracao_tokens
   WHERE ativo AND token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')) THEN
  RAISE EXCEPTION 'Token de integração inválido' USING ERRCODE = 'insufficient_privilege';
 END IF;
 IF jsonb_typeof(p_linhas) IS DISTINCT FROM 'array' OR jsonb_array_length(p_linhas) > 3000 THEN
  RAISE EXCEPTION 'Envie a lista de processos (no máximo 3000 linhas)'; END IF;
 UPDATE public.sig_integracao_tokens SET ultimo_uso = now() WHERE token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
 PERFORM pg_advisory_xact_lock(hashtextextended('sig_cotep_sincronizar_portal', 0));

 -- Aprende CATMAS → elemento-item com as COTEPs já classificadas em um único elemento-item.
 FOR r IN SELECT value FROM jsonb_array_elements(p_linhas) LOOP
  v_proc := trim(coalesce(r->>'processo',''));
  CONTINUE WHEN v_proc !~ '^[0-9]{5,9} [0-9]+/[0-9]{4}$' OR coalesce(r->>'detalhamento','') !~* 'por valor';
  v_ug := split_part(v_proc,' ',1); v_ano := split_part(v_proc,'/',2)::int;
  v_num := ltrim(split_part(split_part(v_proc,' ',2),'/',1),'0') || '/' || v_ano;
  SELECT array_agg(DISTINCT x.elemento_item) INTO v_els FROM public.sig_cotep_procedimentos x JOIN public.sig_cotep_coteps k ON k.id = x.cotep_id
   WHERE k.ano = v_ano AND k.unidade_gestora = v_ug AND k.numero = v_num AND x.ativo AND x.elemento_item IS NOT NULL;
  IF array_length(v_els,1) = 1 THEN
   INSERT INTO public.sig_cotep_catmas (codigo, elemento_item, origem)
   SELECT trim(cod), v_els[1], 'COTEP ' || v_num FROM unnest(string_to_array(coalesce(r->>'codigos_itens',''), ',')) cod WHERE trim(cod) <> ''
   ON CONFLICT (codigo) DO NOTHING;
  END IF;
 END LOOP;

 FOR r IN SELECT value FROM jsonb_array_elements(p_linhas) LOOP
  v_proc := trim(coalesce(r->>'processo',''));
  CONTINUE WHEN v_proc !~ '^[0-9]{5,9} [0-9]+/[0-9]{4}$' OR coalesce(r->>'detalhamento','') !~* 'por valor';
  v_lin := v_lin + 1;
  v_ug := split_part(v_proc,' ',1); v_ano := split_part(v_proc,'/',2)::int;
  v_num := ltrim(split_part(split_part(v_proc,' ',2),'/',1),'0') || '/' || v_ano;
  v_vref := private.sig_cotep_num(r->'valor_referencia'); v_vhom := private.sig_cotep_num(r->'valor_homologado');
  v_exec := coalesce(r->>'situacao_execucao',''); v_sit := coalesce(r->>'status','');
  v_codigos := nullif(trim(coalesce(r->>'codigos_itens','')),'');
  v_alvo := CASE WHEN coalesce(v_vhom,0) > 0 THEN 'Finalizada'
                 WHEN v_exec ~* 'não executado' OR v_sit ~* 'fracass|desert|cancel' THEN
                   CASE WHEN v_sit ~* 'desert' THEN 'Deserta' WHEN v_sit ~* 'cancel' THEN 'Cancelada' ELSE 'Fracassada' END
                 ELSE 'Em andamento' END;
  SELECT * INTO c FROM public.sig_cotep_coteps WHERE ano = v_ano AND unidade_gestora = v_ug AND numero = v_num FOR UPDATE;
  BEGIN
   IF FOUND THEN
    SELECT count(*) INTO v_itens FROM public.sig_cotep_procedimentos WHERE cotep_id = c.id AND ativo AND elemento_item IS NOT NULL;
    IF v_itens = 1 THEN
     SELECT * INTO it FROM public.sig_cotep_procedimentos WHERE cotep_id = c.id AND ativo AND elemento_item IS NOT NULL FOR UPDATE;
     IF c.situacao <> 'Em andamento' AND v_alvo = 'Em andamento' THEN
      v_igual := v_igual + 1;  -- planilha defasada: nunca reabre COTEP já encerrada no SIG
     ELSIF c.situacao = v_alvo AND it.valor_estimado IS NOT DISTINCT FROM coalesce(v_vref, it.valor_estimado)
        AND (v_alvo <> 'Finalizada' OR it.valor_homologado IS NOT DISTINCT FROM v_vhom) THEN
      v_igual := v_igual + 1;
     ELSE
      -- Valores primeiro (situação antiga), situação depois: mesma ordem da RPC de COTEP.
      UPDATE public.sig_cotep_procedimentos SET valor_estimado = coalesce(v_vref, valor_estimado),
       valor_homologado = CASE WHEN v_alvo = 'Finalizada' THEN v_vhom ELSE valor_homologado END, atualizado_em = now()
      WHERE id = it.id;
      UPDATE public.sig_cotep_coteps SET situacao = v_alvo, atualizado_em = now() WHERE id = c.id;
      PERFORM private.sig_cotep_sincronizar_intencoes(c.id);
      PERFORM private.sig_cotep_evento('Sincronização', concat('COTEP ', v_num, ' atualizada pela planilha: ', c.situacao, ' → ', v_alvo,
        ' · estimado ', private.sig_cotep_brl(it.valor_estimado), ' → ', private.sig_cotep_brl(coalesce(v_vref, it.valor_estimado)),
        CASE WHEN v_alvo = 'Finalizada' THEN ' · homologado ' || private.sig_cotep_brl(v_vhom) ELSE '' END),
        NULL, c.id, it.id, it.elemento_item, coalesce(v_vhom, v_vref), r);
      v_atual := v_atual + 1;
     END IF;
    ELSIF v_alvo = 'Finalizada' AND (c.situacao <> 'Finalizada' OR EXISTS (SELECT 1 FROM public.sig_cotep_procedimentos
        WHERE cotep_id = c.id AND ativo AND elemento_item IS NOT NULL AND valor_homologado IS NULL)) THEN
     INSERT INTO public.sig_cotep_pendencias (ano, unidade_gestora, numero, tipo, objeto, valor_referencia, valor_homologado, situacao_portal, codigos_itens, materiais, mensagem)
     VALUES (v_ano, v_ug, v_num, 'distribuir_homologado', r->>'objeto', v_vref, v_vhom, v_exec, v_codigos, r->>'materiais',
      'Homologada no Portal com vários elementos-itens: informe o homologado de cada código na COTEP.')
     ON CONFLICT (ano, unidade_gestora, numero, tipo) WHERE NOT resolvida DO UPDATE SET valor_homologado = excluded.valor_homologado, atualizada_em = now();
     v_pend := v_pend + 1;
    ELSE
     v_igual := v_igual + 1;
    END IF;
   ELSE
    -- COTEP nova: classifica pelos códigos CATMAS conhecidos; senão, pendência para a DTS-1.
    SELECT array_agg(DISTINCT m.elemento_item) INTO v_els FROM unnest(string_to_array(coalesce(v_codigos,''), ',')) cod
     JOIN public.sig_cotep_catmas m ON m.codigo = trim(cod);
    IF v_codigos IS NOT NULL AND array_length(v_els,1) = 1 AND NOT EXISTS (
       SELECT 1 FROM unnest(string_to_array(v_codigos, ',')) cod WHERE trim(cod) <> '' AND NOT EXISTS (SELECT 1 FROM public.sig_cotep_catmas m WHERE m.codigo = trim(cod))) THEN
     INSERT INTO public.sig_cotep_coteps (ano, unidade_gestora, numero, objeto, situacao, documento)
     VALUES (v_ano, v_ug, v_num, left(coalesce(nullif(trim(r->>'objeto'),''), 'COTEP ' || v_num || ' (objeto não informado)'), 1500), 'Em andamento',
      'Criada pela sincronização diária com a PLANILHA ATUAL (Portal de Compras); elemento-item pelos códigos CATMAS ' || v_codigos || '.')
     RETURNING * INTO c;
     INSERT INTO public.sig_cotep_procedimentos (cotep_id, ano, numero, unidade_gestora, elemento_item, objeto, situacao, valor_estimado, valor_homologado)
     VALUES (c.id, c.ano, c.numero, c.unidade_gestora, v_els[1], c.objeto, c.situacao, coalesce(v_vref, 0), CASE WHEN v_alvo = 'Finalizada' THEN v_vhom END)
     RETURNING * INTO it;
     IF v_alvo <> 'Em andamento' THEN UPDATE public.sig_cotep_coteps SET situacao = v_alvo WHERE id = c.id; END IF;
     PERFORM private.sig_cotep_evento('Sincronização', concat('COTEP ', v_num, ' criada pela planilha no elemento-item ', v_els[1], ' (', v_alvo, ').'),
      NULL, c.id, it.id, v_els[1], coalesce(v_vhom, v_vref), r);
     v_criad := v_criad + 1;
    ELSE
     INSERT INTO public.sig_cotep_pendencias (ano, unidade_gestora, numero, tipo, objeto, valor_referencia, valor_homologado, situacao_portal, codigos_itens, materiais, mensagem)
     VALUES (v_ano, v_ug, v_num, 'classificar', r->>'objeto', v_vref, v_vhom, v_exec, v_codigos, r->>'materiais',
      'COTEP do Portal ainda não cadastrada no SIG: informe o elemento-item de cada código.')
     ON CONFLICT (ano, unidade_gestora, numero, tipo) WHERE NOT resolvida DO UPDATE SET valor_referencia = excluded.valor_referencia,
      valor_homologado = excluded.valor_homologado, situacao_portal = excluded.situacao_portal, atualizada_em = now();
     v_pend := v_pend + 1;
    END IF;
   END IF;
  EXCEPTION WHEN OTHERS THEN
   v_msg := SQLERRM;
   INSERT INTO public.sig_cotep_pendencias (ano, unidade_gestora, numero, tipo, objeto, valor_referencia, valor_homologado, situacao_portal, codigos_itens, materiais, mensagem)
   VALUES (v_ano, v_ug, v_num, CASE WHEN v_msg ~* 'saldo insuficiente' THEN 'saldo_insuficiente' ELSE 'divergencia' END,
    r->>'objeto', v_vref, v_vhom, v_exec, v_codigos, r->>'materiais', left(v_msg, 500))
   ON CONFLICT (ano, unidade_gestora, numero, tipo) WHERE NOT resolvida DO UPDATE SET mensagem = excluded.mensagem, atualizada_em = now();
   v_pend := v_pend + 1;
   v_log := v_log || jsonb_build_object('numero', v_num, 'erro', left(v_msg, 300));
  END;
 END LOOP;
 INSERT INTO public.sig_cotep_sincronizacoes (origem, linhas, atualizadas, criadas, sem_alteracao, pendencias, detalhes)
 VALUES ('PLANILHA ATUAL · CONTROLE_PROCESSOS_COMPRA', v_lin, v_atual, v_criad, v_igual, v_pend, v_log);
 RETURN jsonb_build_object('ok', true, 'cotep_lidas', v_lin, 'atualizadas', v_atual, 'criadas', v_criad,
  'sem_alteracao', v_igual, 'pendencias', v_pend, 'erros', v_log);
END $f$;
REVOKE ALL ON FUNCTION public.sig_cotep_sincronizar_portal(text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sig_cotep_sincronizar_portal(text, jsonb) TO anon, authenticated;
