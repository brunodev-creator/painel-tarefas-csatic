-- SIG CSA-TIC — Contratos Continuados (exercício parametrizado; foco em novembro/dezembro de 2026).
-- Fonte financeira única: «agora vai - PLANILHA ATUAL» (BASE_EXECUCAO_EMPENHOS, CONTROLE/SELECAO_SERVICOS_CONTINUOS,
-- SIG_V6_CORRECOES_APROVADAS). O Apps Script integracao/SIG_CONTINUADOS_SINCRONIZACAO.gs envia o retrato atual para
-- public.sig_cont_sincronizar, autenticado pelo mesmo token de integração da planilha (sig_integracao_tokens).
--   • Cada retrato importado ganha um número (sig_cont_sincronizacoes.id); a análise lê só o retrato vigente,
--     deduplicado por ID_Execucao: reimportar não duplica, e os retratos anteriores ficam como histórico.
--   • Contratos e vínculos de fiscais são preservados (nunca excluídos; somem do retrato → ativo=false).
--   • Manifestações dos fiscais ficam em tabela própria, só de inclusão: a sincronização nunca as toca.
-- Nada aqui altera saldo contábil, empenho, cota ou a planilha.
-- Requer: private.is_active(), public.usuarios, public.sig_integracao_tokens (20261022_sig_cotep_sincronizacao_portal.sql).

-- 1. Tabelas ---------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sig_cont_parametros (
 exercicio integer PRIMARY KEY CHECK (exercicio BETWEEN 2020 AND 2100),
 meses_alvo text[] NOT NULL CHECK (cardinality(meses_alvo) BETWEEN 1 AND 12),
 atualizado_por uuid,
 atualizado_em timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.sig_cont_parametros (exercicio, meses_alvo) VALUES (2026, ARRAY['2026-11','2026-12'])
 ON CONFLICT (exercicio) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.sig_cont_contratos (
 chave text PRIMARY KEY CHECK (chave ~ '^(CT|PR):'),
 titulo text,
 objeto text,
 fornecedor text,
 cnpj text,
 processos text[] NOT NULL DEFAULT '{}',
 numero_contrato text,
 vigencia_fim date,
 observacao text CHECK (observacao IS NULL OR length(observacao) <= 1000),
 ativo boolean NOT NULL DEFAULT true,
 criado_em timestamptz NOT NULL DEFAULT now(),
 atualizado_em timestamptz NOT NULL DEFAULT now(),
 atualizado_por uuid
);

CREATE TABLE IF NOT EXISTS public.sig_cont_empenhos (
 chave_empenho text PRIMARY KEY,
 contratos text[] NOT NULL DEFAULT '{}',
 processo text, dotacao text, apelido text, especificacao text, fornecedor text, cnpj text,
 controlar boolean NOT NULL DEFAULT true,
 media_manual numeric(16,2),
 planilha jsonb,            -- indicadores originais de CONTROLE_SERVICOS_CONTINUOS (para comparação)
 ativo boolean NOT NULL DEFAULT true,
 atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sig_cont_empenhos_contratos_idx ON public.sig_cont_empenhos USING gin (contratos);

CREATE TABLE IF NOT EXISTS public.sig_cont_movimentos (
 id text PRIMARY KEY,       -- retrato:ID_Execucao
 retrato bigint NOT NULL,   -- sig_cont_sincronizacoes.id do retrato importado
 id_execucao text NOT NULL, -- ID_Execucao da BASE_EXECUCAO_EMPENHOS
 chave_empenho text NOT NULL,
 contrato_chave text NOT NULL,
 tipo text NOT NULL,
 data date,
 mes text CHECK (mes IS NULL OR mes ~ '^[0-9]{4}-[0-9]{2}$'),
 valor_empenho numeric(16,2) NOT NULL DEFAULT 0,
 valor_conformidade numeric(16,2) NOT NULL DEFAULT 0,
 valor_ajuste numeric(16,2) NOT NULL DEFAULT 0,
 processo text, cnpj text, fornecedor text, objeto_contrato text, especificacao text,
 dotacao text, unidade_contabil text, tdco boolean NOT NULL DEFAULT false,
 importado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sig_cont_movimentos_contrato_idx ON public.sig_cont_movimentos (contrato_chave);
CREATE INDEX IF NOT EXISTS sig_cont_movimentos_retrato_idx ON public.sig_cont_movimentos (retrato, contrato_chave);

CREATE TABLE IF NOT EXISTS public.sig_cont_correcoes (
 chave_empenho text PRIMARY KEY,
 original text NOT NULL,
 corrigida text NOT NULL,
 ativo boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.sig_cont_sincronizacoes (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 executado_em timestamptz NOT NULL DEFAULT now(),
 origem text NOT NULL,
 gerado_em timestamptz,
 hash text,
 empenhos integer NOT NULL DEFAULT 0,
 movimentos integer NOT NULL DEFAULT 0,
 contratos integer NOT NULL DEFAULT 0,
 contratos_novos integer NOT NULL DEFAULT 0,
 sem_alteracao boolean NOT NULL DEFAULT false,
 autor uuid,
 detalhes jsonb
);

CREATE TABLE IF NOT EXISTS public.sig_cont_fiscais (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 contrato_chave text NOT NULL REFERENCES public.sig_cont_contratos(chave),
 auth_id uuid NOT NULL REFERENCES public.usuarios(auth_id),
 papel text NOT NULL DEFAULT 'Fiscal' CHECK (papel IN ('Fiscal','Fiscal suplente','Gestor do contrato')),
 ativo boolean NOT NULL DEFAULT true,
 criado_por uuid, criado_em timestamptz NOT NULL DEFAULT now(),
 atualizado_por uuid, atualizado_em timestamptz NOT NULL DEFAULT now(),
 UNIQUE (contrato_chave, auth_id)
);
CREATE INDEX IF NOT EXISTS sig_cont_fiscais_auth_idx ON public.sig_cont_fiscais (auth_id) WHERE ativo;

-- Manifestação do fiscal: «Saldo adicional necessário até 31/12» (complemento ao saldo disponível).
-- Só inclusão: cada salvamento é uma nova linha; a atual é a mais recente do contrato no exercício.
-- Ausência de linha = fiscal ainda não informou; valor 0 = avaliou e não precisa de complemento.
CREATE TABLE IF NOT EXISTS public.sig_cont_manifestacoes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 exercicio integer NOT NULL,
 contrato_chave text NOT NULL REFERENCES public.sig_cont_contratos(chave),
 valor numeric(16,2) NOT NULL CHECK (valor >= 0 AND valor < 1000000000),
 sugestao_sistema numeric(16,2),   -- estimativa exibida no momento (rastreabilidade; nunca é a manifestação)
 analise_versao text,
 registrado_por uuid NOT NULL,
 registrado_nome text,
 registrado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sig_cont_manifestacoes_contrato_idx ON public.sig_cont_manifestacoes (exercicio, contrato_chave, registrado_em DESC);

CREATE TABLE IF NOT EXISTS public.sig_cont_eventos (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 tipo text NOT NULL,
 contrato_chave text,
 descricao text NOT NULL,
 valor numeric(16,2),
 dados jsonb,
 autor uuid,
 autor_nome text,
 criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sig_cont_eventos_contrato_idx ON public.sig_cont_eventos (contrato_chave, criado_em DESC);

-- 2. Regras de acesso ------------------------------------------------------------------------------
-- Gestão/consolidação: administrador, DTS-1, SOFI (analista e chefe) e chefia.
CREATE OR REPLACE FUNCTION private.sig_cont_gestao() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $f$
 SELECT EXISTS (SELECT 1 FROM public.usuarios u WHERE u.auth_id = auth.uid() AND u.ativo
  AND u.role IN ('admin','dts1','sofi','chefe_sofi','chefia'));
$f$;
CREATE OR REPLACE FUNCTION private.sig_cont_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $f$
 SELECT EXISTS (SELECT 1 FROM public.usuarios u WHERE u.auth_id = auth.uid() AND u.ativo AND u.role = 'admin');
$f$;
CREATE OR REPLACE FUNCTION private.sig_cont_fiscal(p_contrato text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $f$
 SELECT EXISTS (SELECT 1 FROM public.sig_cont_fiscais f JOIN public.usuarios u ON u.auth_id = f.auth_id
  WHERE f.contrato_chave = p_contrato AND f.auth_id = auth.uid() AND f.ativo AND u.ativo);
$f$;
CREATE OR REPLACE FUNCTION private.sig_cont_pode_ver(p_contrato text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $f$
 SELECT private.sig_cont_gestao() OR private.sig_cont_fiscal(p_contrato);
$f$;
REVOKE ALL ON FUNCTION private.sig_cont_gestao(), private.sig_cont_admin(), private.sig_cont_fiscal(text),
 private.sig_cont_pode_ver(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.sig_cont_gestao(), private.sig_cont_admin(), private.sig_cont_fiscal(text),
 private.sig_cont_pode_ver(text) TO authenticated;

DO $do$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['sig_cont_parametros','sig_cont_contratos','sig_cont_empenhos','sig_cont_movimentos','sig_cont_correcoes',
  'sig_cont_sincronizacoes','sig_cont_fiscais','sig_cont_manifestacoes','sig_cont_eventos'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', t);
  EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_ler', t);
 END LOOP;
END $do$;
REVOKE ALL ON SEQUENCE public.sig_cont_sincronizacoes_id_seq, public.sig_cont_eventos_id_seq FROM PUBLIC, anon, authenticated;

CREATE POLICY sig_cont_parametros_ler ON public.sig_cont_parametros FOR SELECT TO authenticated USING (private.is_active());
CREATE POLICY sig_cont_sincronizacoes_ler ON public.sig_cont_sincronizacoes FOR SELECT TO authenticated USING (private.is_active());
CREATE POLICY sig_cont_correcoes_ler ON public.sig_cont_correcoes FOR SELECT TO authenticated USING (private.is_active());
CREATE POLICY sig_cont_contratos_ler ON public.sig_cont_contratos FOR SELECT TO authenticated USING (private.sig_cont_pode_ver(chave));
CREATE POLICY sig_cont_movimentos_ler ON public.sig_cont_movimentos FOR SELECT TO authenticated USING (private.sig_cont_pode_ver(contrato_chave));
CREATE POLICY sig_cont_manifestacoes_ler ON public.sig_cont_manifestacoes FOR SELECT TO authenticated USING (private.sig_cont_pode_ver(contrato_chave));
CREATE POLICY sig_cont_eventos_ler ON public.sig_cont_eventos FOR SELECT TO authenticated
 USING (private.sig_cont_gestao() OR (contrato_chave IS NOT NULL AND private.sig_cont_fiscal(contrato_chave)));
CREATE POLICY sig_cont_empenhos_ler ON public.sig_cont_empenhos FOR SELECT TO authenticated
 USING (private.sig_cont_gestao() OR EXISTS (SELECT 1 FROM unnest(contratos) c WHERE private.sig_cont_fiscal(c)));
CREATE POLICY sig_cont_fiscais_ler ON public.sig_cont_fiscais FOR SELECT TO authenticated
 USING (private.sig_cont_gestao() OR (auth_id = auth.uid() AND private.is_active()));

-- Manifestação é histórico: sem alteração nem exclusão, nem mesmo por função privilegiada.
CREATE OR REPLACE FUNCTION private.sig_cont_somente_inclusao() RETURNS trigger
LANGUAGE plpgsql SET search_path TO '' AS $f$
BEGIN
 RAISE EXCEPTION 'Histórico de manifestações e eventos não pode ser alterado nem excluído. Registre um novo valor.';
END $f$;
DROP TRIGGER IF EXISTS sig_cont_manifestacoes_imutavel ON public.sig_cont_manifestacoes;
CREATE TRIGGER sig_cont_manifestacoes_imutavel BEFORE UPDATE OR DELETE ON public.sig_cont_manifestacoes
 FOR EACH ROW EXECUTE FUNCTION private.sig_cont_somente_inclusao();
DROP TRIGGER IF EXISTS sig_cont_eventos_imutavel ON public.sig_cont_eventos;
CREATE TRIGGER sig_cont_eventos_imutavel BEFORE UPDATE OR DELETE ON public.sig_cont_eventos
 FOR EACH ROW EXECUTE FUNCTION private.sig_cont_somente_inclusao();

-- 3. Auxiliares ------------------------------------------------------------------------------------
-- Mesma regra do motor (assets/continuados-motor.js → contratoChave): número de contrato explícito
-- no objeto + fornecedor; senão processo + fornecedor. Nunca agrupa só por fornecedor.
CREATE OR REPLACE FUNCTION private.sig_cont_contrato_chave(p_processo text, p_cnpj text, p_objeto text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path TO '' AS $f$
 SELECT CASE WHEN coalesce(p_objeto,'') ~* 'contrato\s*(n[º°o.]*\s*)?[0-9]{6,}'
  THEN 'CT:' || substring(p_objeto from '(?i)contrato\s*(?:n[º°o.]*\s*)?([0-9]{6,})') || ':' || coalesce(nullif(regexp_replace(coalesce(p_cnpj,''),'\D','','g'),''),'sem-cnpj')
  ELSE 'PR:' || coalesce(nullif(btrim(coalesce(p_processo,'')),''),'sem-processo') || ':' || coalesce(nullif(regexp_replace(coalesce(p_cnpj,''),'\D','','g'),''),'sem-cnpj')
 END;
$f$;
CREATE OR REPLACE FUNCTION private.sig_cont_num(v jsonb) RETURNS numeric
LANGUAGE plpgsql IMMUTABLE SET search_path TO '' AS $f$
DECLARE s text;
BEGIN
 IF v IS NULL OR jsonb_typeof(v) = 'null' THEN RETURN 0; END IF;
 IF jsonb_typeof(v) = 'number' THEN RETURN round((v #>> '{}')::numeric, 2); END IF;
 s := regexp_replace(v #>> '{}', '[^0-9,.-]', '', 'g');
 IF s = '' OR s = '-' THEN RETURN 0; END IF;
 IF s ~ ',' THEN s := replace(replace(s, '.', ''), ',', '.'); END IF;
 RETURN round(s::numeric, 2);
END $f$;
CREATE OR REPLACE FUNCTION private.sig_cont_usuario_nome() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $f$
 SELECT nome FROM public.usuarios WHERE auth_id = auth.uid();
$f$;
CREATE OR REPLACE FUNCTION private.sig_cont_evento(p_tipo text, p_contrato text, p_descricao text, p_valor numeric, p_dados jsonb) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path TO '' AS $f$
 INSERT INTO public.sig_cont_eventos (tipo, contrato_chave, descricao, valor, dados, autor, autor_nome)
 VALUES (p_tipo, p_contrato, left(p_descricao, 2000), p_valor, p_dados, auth.uid(), private.sig_cont_usuario_nome());
$f$;
REVOKE ALL ON FUNCTION private.sig_cont_contrato_chave(text,text,text), private.sig_cont_num(jsonb), private.sig_cont_usuario_nome(),
 private.sig_cont_evento(text,text,text,numeric,jsonb), private.sig_cont_somente_inclusao() FROM PUBLIC, anon, authenticated;

-- 4. Sincronização (planilha → SIG) -----------------------------------------------------------------
-- p_dados: {origem_id, gerado_em, empenhos:[...], movimentos:[...], correcoes:[...]} (ver SIG_CONTINUADOS_SINCRONIZACAO.gs).
-- Autenticação: token de integração (Apps Script) ou sessão de administrador ativo.
-- 4a'. Movimentos dos empenhos controlados (_mov), deduplicados por ID_Execucao.
CREATE OR REPLACE FUNCTION private.sig_cont_sync_mov(p_dados jsonb) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $f$
DECLARE v_mov int;
BEGIN
 CREATE TEMP TABLE _mov ON COMMIT DROP AS
 SELECT DISTINCT ON (btrim(m.id)) btrim(m.id) AS id, btrim(m.chave_empenho) AS chave_empenho,
  upper(btrim(coalesce(m.tipo, ''))) AS tipo,
  CASE WHEN m.data ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' THEN left(m.data, 10)::date END AS data,
  coalesce(substring(m.mes FROM '^[0-9]{4}-[0-9]{2}'), substring(m.data FROM '^[0-9]{4}-[0-9]{2}')) AS mes,
  private.sig_cont_num(m.valor_empenho) AS valor_empenho, private.sig_cont_num(m.valor_conformidade) AS valor_conformidade,
  private.sig_cont_num(m.valor_ajuste) AS valor_ajuste,
  coalesce(nullif(btrim(m.processo), ''), e.processo) AS processo, coalesce(nullif(btrim(m.cnpj), ''), e.cnpj) AS cnpj,
  left(coalesce(nullif(btrim(m.fornecedor), ''), e.fornecedor), 200) AS fornecedor,
  left(coalesce(nullif(btrim(m.objeto_contrato), ''), e.objeto_contrato), 600) AS objeto_contrato,
  left(coalesce(nullif(btrim(m.especificacao), ''), e.especificacao), 600) AS especificacao,
  nullif(btrim(m.dotacao), '') AS dotacao, regexp_replace(btrim(coalesce(m.unidade_contabil, '')), '[.]0$', '') AS unidade_contabil,
  upper(coalesce(m.tdco, '')) IN ('SIM', 'TRUE') AS tdco
 FROM jsonb_to_recordset(p_dados->'movimentos') AS m(id text, chave_empenho text, tipo text, data text, mes text,
  valor_empenho jsonb, valor_conformidade jsonb, valor_ajuste jsonb, processo text, cnpj text, fornecedor text,
  objeto_contrato text, especificacao text, dotacao text, unidade_contabil text, tdco text)
 JOIN pg_temp._emp e ON e.chave_empenho = btrim(m.chave_empenho) AND e.controlar
 WHERE coalesce(btrim(m.id), '') <> '';
 GET DIAGNOSTICS v_mov = ROW_COUNT;
 RETURN v_mov;
END $f$;

-- 4a. Retrato normalizado em tabelas temporárias da transação (_emp, _mov).
CREATE OR REPLACE FUNCTION private.sig_cont_sync_preparar(p_dados jsonb) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $f$
BEGIN
 DROP TABLE IF EXISTS pg_temp._emp, pg_temp._mov, pg_temp._ctr;
 -- Empenhos controlados (SELECAO_SERVICOS_CONTINUOS.Controlar = SIM; ausente = SIM).
 CREATE TEMP TABLE _emp ON COMMIT DROP AS
 SELECT DISTINCT ON (btrim(x.chave_empenho)) btrim(x.chave_empenho) AS chave_empenho,
  upper(btrim(coalesce(x.controlar, 'SIM'))) NOT IN ('NÃO', 'NAO') AS controlar,
  nullif(btrim(x.processo), '') AS processo, nullif(btrim(x.dotacao), '') AS dotacao,
  left(nullif(btrim(x.apelido), ''), 300) AS apelido, left(nullif(btrim(x.especificacao), ''), 600) AS especificacao,
  left(nullif(btrim(x.fornecedor), ''), 200) AS fornecedor, nullif(btrim(x.cnpj), '') AS cnpj,
  left(nullif(btrim(x.objeto_contrato), ''), 600) AS objeto_contrato,
  nullif(private.sig_cont_num(x.media_manual), 0) AS media_manual,
  CASE WHEN jsonb_typeof(x.planilha) = 'object' THEN x.planilha END AS planilha
 FROM jsonb_to_recordset(p_dados->'empenhos') AS x(chave_empenho text, controlar text, processo text, dotacao text,
  apelido text, especificacao text, fornecedor text, cnpj text, objeto_contrato text, media_manual jsonb, planilha jsonb)
 WHERE coalesce(btrim(x.chave_empenho), '') ~ '^[0-9]{4}[|][0-9]+[|][0-9]+$';

 RETURN private.sig_cont_sync_mov(p_dados);
END $f$;

-- 4b. Contratos do retrato (preserva vigência, observação e vínculos de fiscais; ausentes ficam inativos).
CREATE OR REPLACE FUNCTION private.sig_cont_sync_contratos() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $f$
DECLARE v_ctr int; v_novos int;
BEGIN
 CREATE TEMP TABLE _ctr ON COMMIT DROP AS
 SELECT private.sig_cont_contrato_chave(processo, cnpj, objeto_contrato) AS chave, m.* FROM pg_temp._mov m;
 SELECT count(DISTINCT chave) INTO v_novos FROM pg_temp._ctr c WHERE NOT EXISTS (SELECT 1 FROM public.sig_cont_contratos x WHERE x.chave = c.chave);
 INSERT INTO public.sig_cont_contratos AS t (chave, titulo, objeto, fornecedor, cnpj, processos, numero_contrato, ativo, atualizado_em)
 SELECT chave,
  left((array_agg(coalesce(especificacao, objeto_contrato) ORDER BY data NULLS LAST) FILTER (WHERE coalesce(especificacao, objeto_contrato) IS NOT NULL))[1],300),
  (array_agg(objeto_contrato ORDER BY data NULLS LAST) FILTER (WHERE objeto_contrato IS NOT NULL))[1],
  (array_agg(fornecedor) FILTER (WHERE fornecedor IS NOT NULL))[1],
  (array_agg(cnpj) FILTER (WHERE cnpj IS NOT NULL))[1],
  array_agg(DISTINCT processo) FILTER (WHERE processo IS NOT NULL),
  CASE WHEN chave LIKE 'CT:%' THEN split_part(chave, ':', 2) END, true, now()
 FROM pg_temp._ctr GROUP BY chave
 ON CONFLICT (chave) DO UPDATE SET titulo = excluded.titulo, objeto = excluded.objeto, fornecedor = excluded.fornecedor,
  cnpj = excluded.cnpj, processos = excluded.processos, numero_contrato = excluded.numero_contrato, ativo = true, atualizado_em = now();
 UPDATE public.sig_cont_contratos SET ativo = false, atualizado_em = now()
  WHERE ativo AND chave NOT IN (SELECT chave FROM pg_temp._ctr);
 GET DIAGNOSTICS v_ctr = ROW_COUNT;
 RETURN jsonb_build_object('contratos_novos', v_novos, 'contratos_inativados', v_ctr);
END $f$;

-- 4c. Grava o retrato: movimentos (novo retrato numerado), empenhos e correções aprovadas.
CREATE OR REPLACE FUNCTION private.sig_cont_sync_gravar(p_dados jsonb, p_retrato bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $f$
DECLARE v_emp int; v_r jsonb;
BEGIN
 v_r := private.sig_cont_sync_contratos();
 INSERT INTO public.sig_cont_movimentos (id, retrato, id_execucao, chave_empenho, contrato_chave, tipo, data, mes, valor_empenho, valor_conformidade,
  valor_ajuste, processo, cnpj, fornecedor, objeto_contrato, especificacao, dotacao, unidade_contabil, tdco)
 SELECT p_retrato || ':' || id, p_retrato, id, chave_empenho, chave, tipo, data, mes, valor_empenho, valor_conformidade,
  valor_ajuste, processo, cnpj, fornecedor, objeto_contrato, especificacao, dotacao, nullif(unidade_contabil,''), tdco FROM pg_temp._ctr;
 INSERT INTO public.sig_cont_empenhos AS t (chave_empenho, contratos, processo, dotacao, apelido, especificacao, fornecedor, cnpj, controlar, media_manual, planilha, ativo, atualizado_em)
 SELECT e.chave_empenho, coalesce((SELECT array_agg(DISTINCT c.chave) FROM pg_temp._ctr c WHERE c.chave_empenho = e.chave_empenho), '{}'),
  e.processo, e.dotacao, e.apelido, e.especificacao, e.fornecedor, e.cnpj, e.controlar, e.media_manual, e.planilha, e.controlar, now()
 FROM pg_temp._emp e
 ON CONFLICT (chave_empenho) DO UPDATE SET contratos = excluded.contratos, processo = excluded.processo, dotacao = excluded.dotacao,
  apelido = excluded.apelido, especificacao = excluded.especificacao, fornecedor = excluded.fornecedor, cnpj = excluded.cnpj,
  controlar = excluded.controlar, media_manual = excluded.media_manual, planilha = excluded.planilha, ativo = excluded.ativo, atualizado_em = now();
 UPDATE public.sig_cont_empenhos SET ativo = false, atualizado_em = now() WHERE ativo AND chave_empenho NOT IN (SELECT chave_empenho FROM pg_temp._emp);
 SELECT count(*) INTO v_emp FROM pg_temp._emp WHERE controlar;
 IF jsonb_typeof(p_dados->'correcoes') = 'array' THEN
  CREATE TEMP TABLE _cor ON COMMIT DROP AS
  SELECT DISTINCT ON (btrim(c.chave_empenho)) btrim(c.chave_empenho) AS chave_empenho, btrim(c.original) AS original, btrim(c.corrigida) AS corrigida
  FROM jsonb_to_recordset(p_dados->'correcoes') AS c(chave_empenho text, original text, corrigida text, status text)
  WHERE coalesce(btrim(c.chave_empenho),'') <> '' AND coalesce(btrim(c.original),'') <> '' AND coalesce(btrim(c.corrigida),'') <> ''
   AND upper(coalesce(c.status,'APROVADO')) = 'APROVADO';
  INSERT INTO public.sig_cont_correcoes AS t (chave_empenho, original, corrigida, ativo)
  SELECT chave_empenho, original, corrigida, true FROM pg_temp._cor
  ON CONFLICT (chave_empenho) DO UPDATE SET original = excluded.original, corrigida = excluded.corrigida, ativo = true;
  UPDATE public.sig_cont_correcoes SET ativo = false WHERE ativo AND chave_empenho NOT IN (SELECT chave_empenho FROM pg_temp._cor);
 END IF;
 RETURN v_r || jsonb_build_object('empenhos', v_emp);
END $f$;
REVOKE ALL ON FUNCTION private.sig_cont_sync_mov(jsonb), private.sig_cont_sync_preparar(jsonb), private.sig_cont_sync_contratos(),
 private.sig_cont_sync_gravar(jsonb, bigint) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.sig_cont_sincronizar(p_token text, p_dados jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $f$
DECLARE
 v_origem text; v_hash text; v_gerado timestamptz; v_ultimo text; v_mov int; v_r jsonb; v_emp int; v_ctr int; v_novos int; v_ignorados int; v_ret bigint;
 v_fonte constant text := '1dxzDySXU1h5BKJkW1_mHpNX9KRwgX6Ol5b_kRqeRrJA';
BEGIN
 IF p_token IS NOT NULL AND btrim(p_token) <> '' THEN
  UPDATE public.sig_integracao_tokens SET ultimo_uso = now()
   WHERE ativo AND token_hash = encode(sha256(convert_to(btrim(p_token), 'UTF8')), 'hex');
  IF NOT FOUND THEN RAISE EXCEPTION 'Token de integração inválido ou revogado'; END IF;
  v_origem := 'planilha';
 ELSIF private.sig_cont_admin() THEN
  v_origem := 'administrador';
 ELSE
  RAISE EXCEPTION 'Sincronização permitida somente com token de integração ou por administrador';
 END IF;
 IF p_dados IS NULL OR jsonb_typeof(p_dados) <> 'object' OR p_dados->>'origem_id' IS DISTINCT FROM v_fonte THEN
  RAISE EXCEPTION 'Origem incompatível: use a «agora vai - PLANILHA ATUAL»'; END IF;
 IF jsonb_typeof(p_dados->'movimentos') <> 'array' OR jsonb_typeof(p_dados->'empenhos') <> 'array' THEN
  RAISE EXCEPTION 'Estrutura inválida: movimentos e empenhos são obrigatórios'; END IF;
 IF jsonb_array_length(p_dados->'movimentos') > 20000 OR jsonb_array_length(p_dados->'empenhos') > 3000 THEN
  RAISE EXCEPTION 'Volume acima do limite de segurança da sincronização'; END IF;
 IF jsonb_array_length(p_dados->'empenhos') = 0 THEN
  RAISE EXCEPTION 'Nenhum empenho de serviço continuado no retrato: sincronização recusada para não esvaziar o módulo'; END IF;
 BEGIN v_gerado := (p_dados->>'gerado_em')::timestamptz; EXCEPTION WHEN OTHERS THEN v_gerado := NULL; END;

 PERFORM pg_advisory_xact_lock(hashtextextended('sig_cont_sincronizar', 0));
 v_hash := md5(coalesce(p_dados->'empenhos','[]')::text || coalesce(p_dados->'movimentos','[]')::text || coalesce(p_dados->'correcoes','[]')::text);
 SELECT hash INTO v_ultimo FROM public.sig_cont_sincronizacoes ORDER BY id DESC LIMIT 1;
 IF v_ultimo IS NOT DISTINCT FROM v_hash THEN
  INSERT INTO public.sig_cont_sincronizacoes (origem, gerado_em, hash, sem_alteracao, autor,
   empenhos, movimentos, contratos)
  SELECT v_origem, v_gerado, v_hash, true, auth.uid(),
   (SELECT count(*) FROM public.sig_cont_empenhos WHERE ativo),
   (SELECT count(*) FROM public.sig_cont_movimentos WHERE retrato = (SELECT max(retrato) FROM public.sig_cont_movimentos)),
   (SELECT count(*) FROM public.sig_cont_contratos WHERE ativo);
  RETURN jsonb_build_object('sem_alteracao', true, 'mensagem', 'Retrato idêntico ao último sincronizado.');
 END IF;

 v_mov := private.sig_cont_sync_preparar(p_dados);
 v_ignorados := jsonb_array_length(p_dados->'movimentos') - v_mov;
 INSERT INTO public.sig_cont_sincronizacoes (origem, gerado_em, hash, autor) VALUES (v_origem, v_gerado, v_hash, auth.uid()) RETURNING id INTO v_ret;
 v_r := private.sig_cont_sync_gravar(p_dados, v_ret);
 v_emp := (v_r->>'empenhos')::int; v_novos := (v_r->>'contratos_novos')::int; v_ctr := (v_r->>'contratos_inativados')::int;

 UPDATE public.sig_cont_sincronizacoes SET empenhos = v_emp, movimentos = v_mov, contratos_novos = v_novos,
  contratos = (SELECT count(*) FROM public.sig_cont_contratos WHERE ativo),
  detalhes = jsonb_build_object('movimentos_ignorados', v_ignorados, 'contratos_inativados', v_ctr) WHERE id = v_ret;
 PERFORM private.sig_cont_evento('Sincronização', NULL,
  concat('Retrato da planilha importado: ', v_emp, ' empenhos, ', v_mov, ' movimentos, ', v_novos, ' contrato(s) novo(s).'), NULL,
  jsonb_build_object('origem', v_origem, 'gerado_em', v_gerado));
 RETURN jsonb_build_object('sem_alteracao', false, 'retrato', v_ret, 'empenhos', v_emp, 'movimentos', v_mov, 'contratos_novos', v_novos,
  'contratos_inativados', v_ctr, 'movimentos_ignorados', v_ignorados);
END $f$;
REVOKE ALL ON FUNCTION public.sig_cont_sincronizar(text, jsonb) FROM PUBLIC;
-- anon: o Apps Script chama com a chave pública + token; a função valida o token antes de qualquer leitura/escrita.
GRANT EXECUTE ON FUNCTION public.sig_cont_sincronizar(text, jsonb) TO anon, authenticated;

-- 5. Manifestação do fiscal --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sig_cont_registrar_necessidade(p_contrato text, p_valor numeric, p_sugestao numeric DEFAULT NULL,
 p_versao text DEFAULT NULL, p_exercicio integer DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $f$
DECLARE v_ex int; v_atual numeric; v_id uuid; v_nome text; v_titulo text;
BEGIN
 IF auth.uid() IS NULL OR NOT private.is_active() THEN RAISE EXCEPTION 'Usuário não autorizado'; END IF;
 IF NOT private.sig_cont_fiscal(p_contrato) THEN
  RAISE EXCEPTION 'Somente o fiscal vinculado a este contrato pode registrar a necessidade'; END IF;
 IF p_valor IS NULL OR p_valor < 0 OR p_valor >= 1000000000 OR p_valor <> round(p_valor, 2) THEN
  RAISE EXCEPTION 'Informe um valor em reais, igual ou maior que zero, com até 2 casas decimais'; END IF;
 SELECT titulo INTO v_titulo FROM public.sig_cont_contratos WHERE chave = p_contrato;
 IF NOT FOUND THEN RAISE EXCEPTION 'Contrato não encontrado'; END IF;
 v_ex := coalesce(p_exercicio, (SELECT max(exercicio) FROM public.sig_cont_parametros), extract(year FROM now())::int);
 IF NOT EXISTS (SELECT 1 FROM public.sig_cont_parametros WHERE exercicio = v_ex) THEN RAISE EXCEPTION 'Exercício % não parametrizado', v_ex; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('sig_cont_manifestacao|' || v_ex || '|' || p_contrato, 0));
 SELECT valor INTO v_atual FROM public.sig_cont_manifestacoes WHERE exercicio = v_ex AND contrato_chave = p_contrato
  ORDER BY registrado_em DESC, id DESC LIMIT 1;
 IF FOUND AND v_atual = p_valor THEN
  RETURN jsonb_build_object('sem_alteracao', true, 'valor', v_atual);
 END IF;
 v_nome := private.sig_cont_usuario_nome();
 INSERT INTO public.sig_cont_manifestacoes (exercicio, contrato_chave, valor, sugestao_sistema, analise_versao, registrado_por, registrado_nome)
 VALUES (v_ex, p_contrato, p_valor, CASE WHEN p_sugestao >= 0 THEN round(p_sugestao, 2) END, left(p_versao, 40), auth.uid(), v_nome)
 RETURNING id INTO v_id;
 PERFORM private.sig_cont_evento(CASE WHEN v_atual IS NULL THEN 'Manifestação registrada' ELSE 'Manifestação atualizada' END, p_contrato,
  concat(coalesce(v_nome,'Fiscal'), CASE WHEN v_atual IS NULL THEN ' informou ' ELSE ' alterou de ' || private.sig_cotep_brl(v_atual) || ' para ' END,
   private.sig_cotep_brl(p_valor), ' de saldo adicional necessário até 31/12/', v_ex, '.'), p_valor,
  jsonb_build_object('anterior', v_atual, 'sugestao_sistema', p_sugestao, 'exercicio', v_ex));
 RETURN jsonb_build_object('id', v_id, 'valor', p_valor, 'anterior', v_atual, 'exercicio', v_ex, 'registrado_nome', v_nome);
END $f$;
REVOKE ALL ON FUNCTION public.sig_cont_registrar_necessidade(text, numeric, numeric, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sig_cont_registrar_necessidade(text, numeric, numeric, text, integer) TO authenticated;

-- 6. Vínculos fiscal ↔ contrato (administração) -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sig_cont_vincular_fiscal(p_contrato text, p_auth_id uuid, p_papel text DEFAULT 'Fiscal', p_ativo boolean DEFAULT true) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $f$
DECLARE v_nome text;
BEGIN
 IF NOT private.sig_cont_admin() THEN RAISE EXCEPTION 'Somente o administrador gerencia os vínculos de fiscais'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.sig_cont_contratos WHERE chave = p_contrato) THEN RAISE EXCEPTION 'Contrato não encontrado'; END IF;
 SELECT nome INTO v_nome FROM public.usuarios WHERE auth_id = p_auth_id AND (ativo OR NOT p_ativo);
 IF NOT FOUND THEN RAISE EXCEPTION 'Usuário inexistente ou inativo'; END IF;
 IF coalesce(p_papel,'') NOT IN ('Fiscal','Fiscal suplente','Gestor do contrato') THEN RAISE EXCEPTION 'Papel inválido'; END IF;
 INSERT INTO public.sig_cont_fiscais (contrato_chave, auth_id, papel, ativo, criado_por, atualizado_por)
 VALUES (p_contrato, p_auth_id, p_papel, p_ativo, auth.uid(), auth.uid())
 ON CONFLICT (contrato_chave, auth_id) DO UPDATE SET papel = excluded.papel, ativo = excluded.ativo, atualizado_por = auth.uid(), atualizado_em = now();
 PERFORM private.sig_cont_evento(CASE WHEN p_ativo THEN 'Fiscal vinculado' ELSE 'Fiscal desvinculado' END, p_contrato,
  concat(v_nome, CASE WHEN p_ativo THEN ' vinculado como ' || p_papel ELSE ' desvinculado' END, '.'), NULL, jsonb_build_object('auth_id', p_auth_id));
 RETURN jsonb_build_object('contrato', p_contrato, 'auth_id', p_auth_id, 'ativo', p_ativo);
END $f$;
REVOKE ALL ON FUNCTION public.sig_cont_vincular_fiscal(text, uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sig_cont_vincular_fiscal(text, uuid, text, boolean) TO authenticated;

-- 7. Dados complementares do contrato (gestão): vigência e observação --------------------------------
CREATE OR REPLACE FUNCTION public.sig_cont_atualizar_contrato(p_contrato text, p_vigencia_fim date, p_observacao text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $f$
BEGIN
 IF NOT private.sig_cont_gestao() THEN RAISE EXCEPTION 'Somente a gestão (DTS-1, SOFI, chefia ou administrador) altera dados do contrato'; END IF;
 UPDATE public.sig_cont_contratos SET vigencia_fim = p_vigencia_fim, observacao = nullif(btrim(coalesce(p_observacao,'')),''),
  atualizado_por = auth.uid(), atualizado_em = now() WHERE chave = p_contrato;
 IF NOT FOUND THEN RAISE EXCEPTION 'Contrato não encontrado'; END IF;
 PERFORM private.sig_cont_evento('Contrato atualizado', p_contrato, concat('Vigência: ', coalesce(to_char(p_vigencia_fim,'DD/MM/YYYY'),'não informada'), '.'), NULL, NULL);
 RETURN jsonb_build_object('contrato', p_contrato);
END $f$;
REVOKE ALL ON FUNCTION public.sig_cont_atualizar_contrato(text, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sig_cont_atualizar_contrato(text, date, text) TO authenticated;

-- 8. Período de projeção (parametrizado por exercício) -----------------------------------------------
CREATE OR REPLACE FUNCTION public.sig_cont_definir_parametros(p_exercicio integer, p_meses text[]) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $f$
BEGIN
 IF NOT private.sig_cont_admin() THEN RAISE EXCEPTION 'Somente o administrador define o período de projeção'; END IF;
 IF p_meses IS NULL OR cardinality(p_meses) = 0 OR EXISTS (SELECT 1 FROM unnest(p_meses) m WHERE m !~ ('^' || p_exercicio || '-(0[1-9]|1[0-2])$')) THEN
  RAISE EXCEPTION 'Meses devem ser do próprio exercício, no formato AAAA-MM'; END IF;
 INSERT INTO public.sig_cont_parametros (exercicio, meses_alvo, atualizado_por) VALUES (p_exercicio, (SELECT array_agg(DISTINCT m ORDER BY m) FROM unnest(p_meses) m), auth.uid())
 ON CONFLICT (exercicio) DO UPDATE SET meses_alvo = excluded.meses_alvo, atualizado_por = auth.uid(), atualizado_em = now();
 PERFORM private.sig_cont_evento('Parâmetros', NULL, concat('Período de projeção de ', p_exercicio, ': ', array_to_string(p_meses, ', ')), NULL, NULL);
 RETURN jsonb_build_object('exercicio', p_exercicio, 'meses', p_meses);
END $f$;
REVOKE ALL ON FUNCTION public.sig_cont_definir_parametros(integer, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sig_cont_definir_parametros(integer, text[]) TO authenticated;

COMMENT ON TABLE public.sig_cont_movimentos IS 'Retrato da BASE_EXECUCAO_EMPENHOS (serviços continuados controlados). Somente leitura; substituído a cada sincronização.';
COMMENT ON TABLE public.sig_cont_manifestacoes IS 'Saldo adicional necessário informado pelo fiscal até 31/12. Só inclusão; nunca alterado pela sincronização.';
