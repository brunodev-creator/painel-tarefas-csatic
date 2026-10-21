-- SIG CSA-TIC · Intenções de COTEP v2 (21/10/2026)
-- Critério operacional PMMG: o ELEMENTO-ITEM é a unidade de controle do limite anual de COTEP
-- (dispensa por valor), parametrizado por exercício e unidade gestora em sig_cotep_limites.
-- A base normativa fica configurável e marcada como «Pendente» de validação jurídica institucional.
--
--   consumido    = COTEPs realizadas (Finalizada: valor homologado/negociado;
--                  Realizada (a conferir): valor informado até a confirmação do homologado)
--   comprometido = COTEPs em andamento (valor estimado do item) + intenções com reserva aprovada
--   saldo        = limite − consumido − comprometido
--   pendentes    = intenções não aprovadas (não abatem o saldo)
--
-- Uma COTEP passa a ter cabeçalho próprio (sig_cotep_coteps) e um lançamento por elemento-item
-- (sig_cotep_procedimentos, tabela existente). Ao converter intenções em COTEP a reserva é
-- TRANSFERIDA para o item (nunca somada duas vezes). Ao finalizar, o valor homologado substitui
-- o estimado e a diferença é liberada. Fracassada, deserta ou cancelada liberam todo o valor.
--
-- Mantém todos os registros históricos. A tabela sig_cotep_bases (modelo antigo por ramo/categoria)
-- é preservada apenas para consulta e deixa de bloquear reservas.
-- Pré-requisito: migrations 20261021 anteriores do módulo COTEP. Aplicar em transação única.
BEGIN;

-- 1. Parâmetro do limite anual por exercício e UG -------------------------------------------
CREATE TABLE IF NOT EXISTS public.sig_cotep_limites (
 ano integer NOT NULL CHECK (ano BETWEEN 2020 AND 2100),
 unidade_gestora text NOT NULL CHECK (unidade_gestora ~ '^[0-9]{5,9}$'),
 valor_limite numeric(14,2) NOT NULL CHECK (valor_limite > 0),
 unidade_controle text NOT NULL DEFAULT 'elemento_item' CHECK (unidade_controle = 'elemento_item'),
 base_normativa text NOT NULL CHECK (length(trim(base_normativa)) >= 10),
 validacao_juridica text NOT NULL DEFAULT 'Pendente' CHECK (validacao_juridica IN ('Pendente','Validada')),
 documento_validacao text,
 padrao boolean NOT NULL DEFAULT true,
 atualizado_por uuid REFERENCES auth.users(id),
 atualizado_em timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (ano, unidade_gestora),
 CHECK (validacao_juridica = 'Pendente' OR length(trim(coalesce(documento_validacao,''))) >= 8)
);
CREATE UNIQUE INDEX IF NOT EXISTS sig_cotep_limites_padrao_ano ON public.sig_cotep_limites(ano) WHERE padrao;
COMMENT ON TABLE public.sig_cotep_limites IS 'Limite anual de COTEP por elemento-item, por exercício e UG (critério operacional PMMG, sujeito a validação jurídica)';
INSERT INTO public.sig_cotep_limites (ano, unidade_gestora, valor_limite, base_normativa, validacao_juridica, padrao)
VALUES (2026, '1250071', 65492.11,
 'Critério operacional PMMG: limite de dispensa por valor (Lei 14.133/2021, art. 75, II, valor atualizado para 2026) controlado por elemento-item. UG 1250071 adotada como referência provisória do histórico importado.',
 'Pendente', true)
ON CONFLICT (ano, unidade_gestora) DO NOTHING;

-- 2. Catálogo aberto de elementos-itens e de centros -----------------------------------------
CREATE TABLE IF NOT EXISTS public.sig_cotep_elementos (
 codigo text PRIMARY KEY CHECK (codigo ~ '^[0-9]{4}$'),
 descricao text CHECK (descricao IS NULL OR length(trim(descricao)) BETWEEN 3 AND 200),
 ativo boolean NOT NULL DEFAULT true,
 criado_por uuid REFERENCES auth.users(id),
 criado_em timestamptz NOT NULL DEFAULT now(),
 atualizado_em timestamptz NOT NULL DEFAULT now()
);
-- Descrições já usadas pelo SIG (assets/cotas-descricoes.js); os demais códigos entram sem descrição.
INSERT INTO public.sig_cotep_elementos (codigo, descricao) VALUES
 ('3913','Tarifas de água e esgoto'),
 ('3921','Reparos de equipamentos, instalações e material permanente'),
 ('4002','Serviços de tecnologia da informação'),
 ('4003','Serviços de informática · PRODEMGE'),
 ('4004','Serviços de telecomunicações'),
 ('4005','Rede IP Multisserviços · dados e voz'),
 ('5206','Equipamentos de comunicação e telefonia'),
 ('5207','Equipamentos de informática'),
 ('3016',NULL),('3024',NULL),('3964',NULL),('5203',NULL)
ON CONFLICT (codigo) DO NOTHING;
INSERT INTO public.sig_cotep_elementos (codigo)
 SELECT elemento_item FROM public.sig_cotep_procedimentos WHERE elemento_item IS NOT NULL
 UNION SELECT elemento_item FROM public.sig_cotep_intencoes
ON CONFLICT (codigo) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.sig_cotep_centros (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 nome text NOT NULL CHECK (length(trim(nome)) BETWEEN 2 AND 120),
 ativo boolean NOT NULL DEFAULT true,
 criado_por uuid REFERENCES auth.users(id),
 criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS sig_cotep_centros_nome ON public.sig_cotep_centros (lower(trim(nome)));
INSERT INTO public.sig_cotep_centros (nome)
 SELECT DISTINCT ON (lower(trim(centro))) trim(centro) FROM public.sig_cotep_intencoes ORDER BY lower(trim(centro)), criado_em
ON CONFLICT DO NOTHING;

-- 3. Cabeçalho da COTEP: um registro por procedimento, vários elementos-itens -----------------
CREATE TABLE IF NOT EXISTS public.sig_cotep_coteps (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 ano integer NOT NULL CHECK (ano BETWEEN 2020 AND 2100),
 unidade_gestora text NOT NULL CHECK (unidade_gestora ~ '^[0-9]{5,9}$'),
 numero text NOT NULL CHECK (length(trim(numero)) BETWEEN 1 AND 35),
 objeto text NOT NULL CHECK (length(trim(objeto)) BETWEEN 8 AND 1500),
 situacao text NOT NULL DEFAULT 'Em andamento'
  CHECK (situacao IN ('Em andamento','Finalizada','Realizada (a conferir)','Fracassada','Deserta','Cancelada')),
 documento text,
 processo_id uuid REFERENCES public.processos(id) ON DELETE SET NULL,
 criado_por uuid REFERENCES auth.users(id),
 atualizado_por uuid REFERENCES auth.users(id),
 criado_em timestamptz NOT NULL DEFAULT now(),
 atualizado_em timestamptz NOT NULL DEFAULT now(),
 UNIQUE (ano, unidade_gestora, numero)
);
COMMENT ON TABLE public.sig_cotep_coteps IS 'COTEP (procedimento). Valores ficam nos lançamentos por elemento-item em sig_cotep_procedimentos';

-- Consolida os lançamentos existentes por (ano, UG, número). Situações divergentes viram
-- «Em andamento» (se houver item em andamento) ou «Realizada (a conferir)», para conferência.
INSERT INTO public.sig_cotep_coteps (ano, unidade_gestora, numero, objeto, situacao, documento, criado_por, atualizado_por, criado_em, atualizado_em)
SELECT ano, unidade_gestora, numero,
 (array_agg(objeto ORDER BY atualizado_em, id))[1],
 CASE WHEN count(DISTINCT situacao) = 1 THEN min(situacao)
      WHEN bool_or(situacao = 'Em andamento') THEN 'Em andamento'
      ELSE 'Realizada (a conferir)' END,
 nullif(string_agg(DISTINCT nullif(trim(documento),''), ' | '), ''),
 (array_agg(atualizado_por ORDER BY atualizado_em, id))[1],
 (array_agg(atualizado_por ORDER BY atualizado_em DESC, id))[1],
 min(atualizado_em), max(atualizado_em)
FROM public.sig_cotep_procedimentos
GROUP BY ano, unidade_gestora, numero
ON CONFLICT (ano, unidade_gestora, numero) DO NOTHING;

-- 4. Lançamentos por elemento-item (tabela existente) ----------------------------------------
ALTER TABLE public.sig_cotep_procedimentos ADD COLUMN IF NOT EXISTS cotep_id uuid REFERENCES public.sig_cotep_coteps(id);
ALTER TABLE public.sig_cotep_procedimentos ADD COLUMN IF NOT EXISTS ativo boolean NOT NULL DEFAULT true;
UPDATE public.sig_cotep_procedimentos x SET cotep_id = c.id
 FROM public.sig_cotep_coteps c
 WHERE x.cotep_id IS NULL AND c.ano = x.ano AND c.unidade_gestora = x.unidade_gestora AND c.numero = x.numero;
ALTER TABLE public.sig_cotep_procedimentos ALTER COLUMN cotep_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sig_cotep_proc_cotep ON public.sig_cotep_procedimentos(cotep_id);
CREATE INDEX IF NOT EXISTS idx_sig_cotep_proc_elemento ON public.sig_cotep_procedimentos(ano, unidade_gestora, elemento_item);
ALTER TABLE public.sig_cotep_procedimentos DROP CONSTRAINT IF EXISTS sig_cotep_procedimentos_situacao_check;
ALTER TABLE public.sig_cotep_procedimentos ADD CONSTRAINT sig_cotep_procedimentos_situacao_check
 CHECK (situacao IN ('Em andamento','Finalizada','Realizada (a conferir)','Fracassada','Deserta','Cancelada'));
ALTER TABLE public.sig_cotep_procedimentos DROP CONSTRAINT IF EXISTS sig_cotep_procedimentos_check;
ALTER TABLE public.sig_cotep_procedimentos DROP CONSTRAINT IF EXISTS sig_cotep_procedimentos_homologado_check;
ALTER TABLE public.sig_cotep_procedimentos ADD CONSTRAINT sig_cotep_procedimentos_homologado_check
 CHECK (situacao <> 'Finalizada' OR NOT ativo OR valor_homologado IS NOT NULL);
ALTER TABLE public.sig_cotep_procedimentos DROP CONSTRAINT IF EXISTS sig_cotep_procedimentos_sem_elemento_check;
ALTER TABLE public.sig_cotep_procedimentos ADD CONSTRAINT sig_cotep_procedimentos_sem_elemento_check
 CHECK (elemento_item IS NOT NULL OR (situacao IN ('Fracassada','Deserta','Cancelada') AND valor_estimado = 0 AND valor_homologado IS NULL));
COMMENT ON TABLE public.sig_cotep_procedimentos IS 'Lançamento de uma COTEP por elemento-item. ano/UG/número/objeto/situação são espelhados do cabeçalho';

-- 5. Intenções: prioridade, agrupamento e vínculo com a COTEP --------------------------------
ALTER TABLE public.sig_cotep_intencoes ADD COLUMN IF NOT EXISTS prioridade text NOT NULL DEFAULT 'Média';
ALTER TABLE public.sig_cotep_intencoes ADD COLUMN IF NOT EXISTS grupo text;
ALTER TABLE public.sig_cotep_intencoes ADD COLUMN IF NOT EXISTS cotep_id uuid REFERENCES public.sig_cotep_coteps(id);
ALTER TABLE public.sig_cotep_intencoes DROP CONSTRAINT IF EXISTS sig_cotep_intencoes_prioridade_check;
ALTER TABLE public.sig_cotep_intencoes ADD CONSTRAINT sig_cotep_intencoes_prioridade_check CHECK (prioridade IN ('Alta','Média','Baixa'));
ALTER TABLE public.sig_cotep_intencoes DROP CONSTRAINT IF EXISTS sig_cotep_intencoes_grupo_check;
ALTER TABLE public.sig_cotep_intencoes ADD CONSTRAINT sig_cotep_intencoes_grupo_check CHECK (grupo IS NULL OR length(trim(grupo)) BETWEEN 2 AND 60);
UPDATE public.sig_cotep_intencoes i SET cotep_id = c.id
 FROM public.sig_cotep_coteps c
 WHERE i.cotep_id IS NULL AND i.cotep_numero IS NOT NULL
  AND c.ano = i.ano AND c.unidade_gestora = i.unidade_gestora AND c.numero = i.cotep_numero;
ALTER TABLE public.sig_cotep_intencoes DROP CONSTRAINT IF EXISTS sig_cotep_intencoes_situacao_check;
ALTER TABLE public.sig_cotep_intencoes ADD CONSTRAINT sig_cotep_intencoes_situacao_check
 CHECK (situacao IN ('Pendente','Reservada','Em COTEP','Devolvida','Rejeitada','Cancelada','Finalizada'));
-- A reserva deixa de exigir ramo/categoria: o controle é por elemento-item.
ALTER TABLE public.sig_cotep_intencoes DROP CONSTRAINT IF EXISTS sig_cotep_intencoes_check;
ALTER TABLE public.sig_cotep_intencoes DROP CONSTRAINT IF EXISTS sig_cotep_intencoes_reserva_check;
ALTER TABLE public.sig_cotep_intencoes ADD CONSTRAINT sig_cotep_intencoes_reserva_check CHECK (
 (situacao = 'Reservada' AND valor_reservado > 0 AND valor_reservado <= valor_estimado)
 OR (situacao <> 'Reservada' AND valor_reservado = 0));
ALTER TABLE public.sig_cotep_intencoes DROP CONSTRAINT IF EXISTS sig_cotep_intencoes_vinculo_check;
ALTER TABLE public.sig_cotep_intencoes ADD CONSTRAINT sig_cotep_intencoes_vinculo_check CHECK (situacao <> 'Em COTEP' OR cotep_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_sig_cotep_int_elemento ON public.sig_cotep_intencoes(ano, unidade_gestora, elemento_item, situacao);
CREATE INDEX IF NOT EXISTS idx_sig_cotep_int_cotep ON public.sig_cotep_intencoes(cotep_id);

-- 6. Eventos legíveis e auditoria completa de dados --------------------------------------------
ALTER TABLE public.sig_cotep_eventos ADD COLUMN IF NOT EXISTS cotep_id uuid REFERENCES public.sig_cotep_coteps(id);
ALTER TABLE public.sig_cotep_eventos ADD COLUMN IF NOT EXISTS elemento_item text;
ALTER TABLE public.sig_cotep_eventos ADD COLUMN IF NOT EXISTS valor numeric(14,2);
ALTER TABLE public.sig_cotep_eventos ADD COLUMN IF NOT EXISTS dados jsonb;
UPDATE public.sig_cotep_eventos e SET cotep_id = x.cotep_id, elemento_item = coalesce(e.elemento_item, x.elemento_item)
 FROM public.sig_cotep_procedimentos x WHERE e.procedimento_id = x.id AND e.cotep_id IS NULL;
UPDATE public.sig_cotep_eventos e SET elemento_item = i.elemento_item
 FROM public.sig_cotep_intencoes i WHERE e.intencao_id = i.id AND e.elemento_item IS NULL;
CREATE INDEX IF NOT EXISTS idx_sig_cotep_eventos_elemento ON public.sig_cotep_eventos(elemento_item, criado_em DESC);

CREATE TABLE IF NOT EXISTS public.sig_cotep_auditoria (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 tabela text NOT NULL,
 registro text NOT NULL,
 operacao text NOT NULL,
 antes jsonb,
 depois jsonb,
 autor uuid,
 em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sig_cotep_auditoria_registro ON public.sig_cotep_auditoria(tabela, registro);

CREATE OR REPLACE FUNCTION private.sig_cotep_auditar() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $fn$
DECLARE k text;
BEGIN
 IF TG_OP = 'DELETE' THEN
  RAISE EXCEPTION 'Registros do módulo COTEP não podem ser excluídos (preservação do histórico). Use cancelamento ou inativação.';
 END IF;
 k := coalesce(to_jsonb(NEW)->>'id', to_jsonb(NEW)->>'codigo', to_jsonb(NEW)->>'auth_id',
               concat(to_jsonb(NEW)->>'ano','|',to_jsonb(NEW)->>'unidade_gestora'));
 IF TG_OP = 'UPDATE' AND to_jsonb(OLD) = to_jsonb(NEW) THEN RETURN NEW; END IF;
 INSERT INTO public.sig_cotep_auditoria (tabela, registro, operacao, antes, depois, autor)
 VALUES (TG_TABLE_NAME, k, TG_OP, CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) END, to_jsonb(NEW), auth.uid());
 RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION private.sig_cotep_auditar() FROM PUBLIC, anon, authenticated;
DO $do$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['sig_cotep_limites','sig_cotep_elementos','sig_cotep_centros','sig_cotep_coteps',
   'sig_cotep_procedimentos','sig_cotep_intencoes','sig_cotep_gestores'] LOOP
  EXECUTE format('DROP TRIGGER IF EXISTS sig_cotep_auditoria_trg ON public.%I', t);
  EXECUTE format('CREATE TRIGGER sig_cotep_auditoria_trg AFTER INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION private.sig_cotep_auditar()', t);
  EXECUTE format('DROP TRIGGER IF EXISTS sig_cotep_sem_exclusao ON public.%I', t);
  EXECUTE format('CREATE TRIGGER sig_cotep_sem_exclusao BEFORE DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION private.sig_cotep_auditar()', t);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['sig_cotep_eventos','sig_cotep_auditoria','sig_cotep_bases'] LOOP
  EXECUTE format('DROP TRIGGER IF EXISTS sig_cotep_sem_exclusao ON public.%I', t);
  EXECUTE format('CREATE TRIGGER sig_cotep_sem_exclusao BEFORE DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION private.sig_cotep_auditar()', t);
 END LOOP;
END $do$;

-- 7. Núcleo financeiro ----------------------------------------------------------------------
-- Quanto um lançamento ocupa do limite, conforme a situação da COTEP.
CREATE OR REPLACE FUNCTION private.sig_cotep_contrib(p_situacao text, p_estimado numeric, p_homologado numeric, p_ativo boolean)
RETURNS numeric LANGUAGE sql IMMUTABLE SET search_path TO '' AS $f$
 SELECT CASE
  WHEN NOT coalesce(p_ativo, true) THEN 0
  WHEN p_situacao = 'Em andamento' THEN coalesce(p_estimado, 0)
  WHEN p_situacao = 'Finalizada' THEN coalesce(p_homologado, p_estimado, 0)
  WHEN p_situacao = 'Realizada (a conferir)' THEN coalesce(p_homologado, p_estimado, 0)
  ELSE 0 END::numeric(14,2)
$f$;

-- Exclusão mútua por (exercício, UG, elemento-item): serializa reservas e lançamentos concorrentes.
CREATE OR REPLACE FUNCTION private.sig_cotep_lock(p_ano integer, p_ug text, p_elemento text)
RETURNS void LANGUAGE sql VOLATILE SET search_path TO '' AS $f$
 SELECT pg_advisory_xact_lock(hashtextextended(concat('sig_cotep|', p_ano, '|', p_ug, '|', p_elemento), 0))
$f$;

CREATE OR REPLACE FUNCTION private.sig_cotep_saldo(p_ano integer, p_ug text, p_elemento text)
RETURNS TABLE (limite numeric, consumido numeric, comprometido_coteps numeric, reservado numeric, saldo numeric)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO '' AS $f$
BEGIN
 SELECT l.valor_limite INTO limite FROM public.sig_cotep_limites l WHERE l.ano = p_ano AND l.unidade_gestora = p_ug;
 SELECT coalesce(sum(private.sig_cotep_contrib(x.situacao, x.valor_estimado, x.valor_homologado, x.ativo))
          FILTER (WHERE x.situacao IN ('Finalizada','Realizada (a conferir)')), 0),
        coalesce(sum(private.sig_cotep_contrib(x.situacao, x.valor_estimado, x.valor_homologado, x.ativo))
          FILTER (WHERE x.situacao = 'Em andamento'), 0)
   INTO consumido, comprometido_coteps
   FROM public.sig_cotep_procedimentos x
  WHERE x.ano = p_ano AND x.unidade_gestora = p_ug AND x.elemento_item = p_elemento;
 SELECT coalesce(sum(i.valor_reservado), 0) INTO reservado FROM public.sig_cotep_intencoes i
  WHERE i.ano = p_ano AND i.unidade_gestora = p_ug AND i.elemento_item = p_elemento AND i.situacao = 'Reservada';
 saldo := limite - consumido - comprometido_coteps - reservado;
 RETURN NEXT;
END $f$;

CREATE OR REPLACE FUNCTION private.sig_cotep_brl(v numeric) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path TO '' AS $f$
 SELECT 'R$ ' || translate(to_char(coalesce(v,0), 'FM999,999,999,990.00'), ',.', '.,')
$f$;

-- Verificação final, executada pelos gatilhos sempre que um valor ocupado AUMENTA.
CREATE OR REPLACE FUNCTION private.sig_cotep_verificar(p_ano integer, p_ug text, p_elemento text)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO '' AS $f$
DECLARE s record;
BEGIN
 PERFORM private.sig_cotep_lock(p_ano, p_ug, p_elemento);
 SELECT * INTO s FROM private.sig_cotep_saldo(p_ano, p_ug, p_elemento);
 IF s.limite IS NULL THEN
  RAISE EXCEPTION 'Limite anual de COTEP não configurado para % / UG %. Cadastre-o em Parâmetros.', p_ano, p_ug;
 END IF;
 IF s.saldo < 0 AND coalesce(current_setting('sig.cotep_excecao', true), '') <> 'on' THEN
  RAISE EXCEPTION 'Saldo insuficiente no elemento-item %: limite %, consumido %, comprometido %, excedente %.',
   p_elemento, private.sig_cotep_brl(s.limite), private.sig_cotep_brl(s.consumido),
   private.sig_cotep_brl(s.comprometido_coteps + s.reservado), private.sig_cotep_brl(-s.saldo)
   USING ERRCODE = 'check_violation';
 END IF;
END $f$;

-- Espelha no lançamento os dados do cabeçalho (garante situação única para todos os itens).
CREATE OR REPLACE FUNCTION private.sig_cotep_item_espelho() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $f$
DECLARE c public.sig_cotep_coteps%ROWTYPE;
BEGIN
 SELECT * INTO c FROM public.sig_cotep_coteps WHERE id = NEW.cotep_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'COTEP do lançamento não localizada'; END IF;
 NEW.ano := c.ano; NEW.unidade_gestora := c.unidade_gestora; NEW.numero := c.numero;
 NEW.objeto := c.objeto; NEW.situacao := c.situacao;
 RETURN NEW;
END $f$;
DROP TRIGGER IF EXISTS sig_cotep_item_espelho ON public.sig_cotep_procedimentos;
CREATE TRIGGER sig_cotep_item_espelho BEFORE INSERT OR UPDATE ON public.sig_cotep_procedimentos
 FOR EACH ROW EXECUTE FUNCTION private.sig_cotep_item_espelho();
-- O antigo bloqueio por ramo/categoria é substituído pelo bloqueio por elemento-item.
DROP TRIGGER IF EXISTS sig_cotep_procedimento_lock ON public.sig_cotep_procedimentos;

CREATE OR REPLACE FUNCTION private.sig_cotep_item_limite() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $f$
DECLARE antes numeric := 0; depois numeric;
BEGIN
 IF NEW.elemento_item IS NULL THEN RETURN NEW; END IF;
 depois := private.sig_cotep_contrib(NEW.situacao, NEW.valor_estimado, NEW.valor_homologado, NEW.ativo);
 IF TG_OP = 'UPDATE' AND OLD.elemento_item IS NOT DISTINCT FROM NEW.elemento_item
    AND OLD.ano = NEW.ano AND OLD.unidade_gestora = NEW.unidade_gestora THEN
  antes := private.sig_cotep_contrib(OLD.situacao, OLD.valor_estimado, OLD.valor_homologado, OLD.ativo);
 END IF;
 IF depois > antes THEN PERFORM private.sig_cotep_verificar(NEW.ano, NEW.unidade_gestora, NEW.elemento_item); END IF;
 RETURN NEW;
END $f$;
DROP TRIGGER IF EXISTS sig_cotep_item_limite ON public.sig_cotep_procedimentos;
CREATE TRIGGER sig_cotep_item_limite AFTER INSERT OR UPDATE ON public.sig_cotep_procedimentos
 FOR EACH ROW EXECUTE FUNCTION private.sig_cotep_item_limite();

CREATE OR REPLACE FUNCTION private.sig_cotep_cabecalho_espelho() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $f$
BEGIN
 IF (OLD.ano, OLD.unidade_gestora, OLD.numero, OLD.objeto, OLD.situacao)
    IS DISTINCT FROM (NEW.ano, NEW.unidade_gestora, NEW.numero, NEW.objeto, NEW.situacao) THEN
  UPDATE public.sig_cotep_procedimentos SET atualizado_em = now() WHERE cotep_id = NEW.id;
 END IF;
 RETURN NEW;
END $f$;
DROP TRIGGER IF EXISTS sig_cotep_cabecalho_espelho ON public.sig_cotep_coteps;
CREATE TRIGGER sig_cotep_cabecalho_espelho AFTER UPDATE ON public.sig_cotep_coteps
 FOR EACH ROW EXECUTE FUNCTION private.sig_cotep_cabecalho_espelho();

CREATE OR REPLACE FUNCTION private.sig_cotep_intencao_limite() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $f$
BEGIN
 IF NEW.situacao = 'Reservada' AND (TG_OP = 'INSERT' OR OLD.situacao <> 'Reservada'
    OR NEW.valor_reservado > OLD.valor_reservado OR OLD.elemento_item <> NEW.elemento_item
    OR OLD.ano <> NEW.ano OR OLD.unidade_gestora <> NEW.unidade_gestora) THEN
  PERFORM private.sig_cotep_verificar(NEW.ano, NEW.unidade_gestora, NEW.elemento_item);
 END IF;
 RETURN NEW;
END $f$;
DROP TRIGGER IF EXISTS sig_cotep_intencao_limite ON public.sig_cotep_intencoes;
CREATE TRIGGER sig_cotep_intencao_limite AFTER INSERT OR UPDATE ON public.sig_cotep_intencoes
 FOR EACH ROW EXECUTE FUNCTION private.sig_cotep_intencao_limite();

REVOKE ALL ON FUNCTION private.sig_cotep_saldo(integer,text,text), private.sig_cotep_verificar(integer,text,text),
 private.sig_cotep_lock(integer,text,text), private.sig_cotep_item_espelho(), private.sig_cotep_item_limite(),
 private.sig_cotep_cabecalho_espelho(), private.sig_cotep_intencao_limite() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.sig_cotep_contrib(text,numeric,numeric,boolean) TO authenticated;

-- 8. Painel consolidado (respeita RLS do usuário: security_invoker) ---------------------------
CREATE OR REPLACE VIEW public.sig_cotep_saldos WITH (security_invoker = true) AS
WITH chaves AS (
 SELECT ano, unidade_gestora, elemento_item FROM public.sig_cotep_procedimentos WHERE elemento_item IS NOT NULL
 UNION SELECT ano, unidade_gestora, elemento_item FROM public.sig_cotep_intencoes
), itens AS (
 SELECT ano, unidade_gestora, elemento_item,
  sum(private.sig_cotep_contrib(situacao, valor_estimado, valor_homologado, ativo)) FILTER (WHERE situacao IN ('Finalizada','Realizada (a conferir)')) AS consumido,
  sum(private.sig_cotep_contrib(situacao, valor_estimado, valor_homologado, ativo)) FILTER (WHERE situacao = 'Em andamento') AS comprometido_coteps,
  count(DISTINCT cotep_id) FILTER (WHERE ativo) AS coteps,
  count(*) FILTER (WHERE ativo AND situacao = 'Realizada (a conferir)') AS a_conferir
 FROM public.sig_cotep_procedimentos WHERE elemento_item IS NOT NULL GROUP BY 1,2,3
), ints AS (
 SELECT ano, unidade_gestora, elemento_item,
  sum(valor_reservado) FILTER (WHERE situacao = 'Reservada') AS reservado,
  count(*) FILTER (WHERE situacao IN ('Pendente','Devolvida')) AS pendentes_qtd,
  sum(valor_estimado) FILTER (WHERE situacao IN ('Pendente','Devolvida')) AS pendentes_valor,
  count(*) AS intencoes
 FROM public.sig_cotep_intencoes GROUP BY 1,2,3
)
SELECT k.ano, k.unidade_gestora, k.elemento_item, e.descricao,
 l.valor_limite AS limite,
 coalesce(t.consumido,0)::numeric(14,2) AS consumido,
 (coalesce(t.comprometido_coteps,0) + coalesce(n.reservado,0))::numeric(14,2) AS comprometido,
 coalesce(t.comprometido_coteps,0)::numeric(14,2) AS comprometido_coteps,
 coalesce(n.reservado,0)::numeric(14,2) AS reservado,
 (l.valor_limite - coalesce(t.consumido,0) - coalesce(t.comprometido_coteps,0) - coalesce(n.reservado,0))::numeric(14,2) AS saldo,
 round(100 * (coalesce(t.consumido,0) + coalesce(t.comprometido_coteps,0) + coalesce(n.reservado,0)) / nullif(l.valor_limite,0), 2) AS percentual,
 coalesce(n.pendentes_qtd,0) AS pendentes_qtd, coalesce(n.pendentes_valor,0)::numeric(14,2) AS pendentes_valor,
 coalesce(t.coteps,0) AS coteps, coalesce(n.intencoes,0) AS intencoes, coalesce(t.a_conferir,0) AS a_conferir
FROM chaves k
LEFT JOIN itens t USING (ano, unidade_gestora, elemento_item)
LEFT JOIN ints n USING (ano, unidade_gestora, elemento_item)
LEFT JOIN public.sig_cotep_limites l ON l.ano = k.ano AND l.unidade_gestora = k.unidade_gestora
LEFT JOIN public.sig_cotep_elementos e ON e.codigo = k.elemento_item;

-- 9. Permissões: leitura para contas ativas; escrita somente pela RPC -------------------------
DO $do$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['sig_cotep_limites','sig_cotep_elementos','sig_cotep_centros','sig_cotep_coteps','sig_cotep_auditoria'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', t);
 END LOOP;
END $do$;
GRANT SELECT ON public.sig_cotep_limites, public.sig_cotep_elementos, public.sig_cotep_centros,
 public.sig_cotep_coteps, public.sig_cotep_auditoria TO authenticated;
REVOKE ALL ON public.sig_cotep_saldos FROM PUBLIC, anon;
GRANT SELECT ON public.sig_cotep_saldos TO authenticated;
REVOKE ALL ON SEQUENCE public.sig_cotep_auditoria_id_seq FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS sig_cotep_limites_ler ON public.sig_cotep_limites;
CREATE POLICY sig_cotep_limites_ler ON public.sig_cotep_limites FOR SELECT TO authenticated USING (private.sig_cotep_ativo());
DROP POLICY IF EXISTS sig_cotep_elementos_ler ON public.sig_cotep_elementos;
CREATE POLICY sig_cotep_elementos_ler ON public.sig_cotep_elementos FOR SELECT TO authenticated USING (private.sig_cotep_ativo());
DROP POLICY IF EXISTS sig_cotep_centros_ler ON public.sig_cotep_centros;
CREATE POLICY sig_cotep_centros_ler ON public.sig_cotep_centros FOR SELECT TO authenticated USING (private.sig_cotep_ativo());
DROP POLICY IF EXISTS sig_cotep_coteps_ler ON public.sig_cotep_coteps;
CREATE POLICY sig_cotep_coteps_ler ON public.sig_cotep_coteps FOR SELECT TO authenticated USING (private.sig_cotep_ativo());
DROP POLICY IF EXISTS sig_cotep_auditoria_ler ON public.sig_cotep_auditoria;
CREATE POLICY sig_cotep_auditoria_ler ON public.sig_cotep_auditoria FOR SELECT TO authenticated USING (private.sig_cotep_gestor());

-- 10. RPC única de escrita ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.sig_cotep_valor(t text) RETURNS numeric
LANGUAGE plpgsql IMMUTABLE SET search_path TO '' AS $f$
DECLARE s text := trim(coalesce(t,''));
BEGIN
 IF s = '' THEN RETURN NULL; END IF;
 IF s ~ '^[0-9]{1,3}(\.[0-9]{3})+(,[0-9]{1,2})?$' OR s ~ '^[0-9]+,[0-9]{1,2}$' THEN s := replace(replace(s,'.',''),',','.'); END IF;
 IF s !~ '^[0-9]+(\.[0-9]{1,2})?$' THEN RAISE EXCEPTION 'Valor monetário inválido: %', t; END IF;
 RETURN s::numeric(14,2);
END $f$;

CREATE OR REPLACE FUNCTION private.sig_cotep_evento(p_tipo text, p_descricao text, p_intencao uuid, p_cotep uuid,
 p_item uuid, p_elemento text, p_valor numeric, p_dados jsonb) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path TO '' AS $f$
 INSERT INTO public.sig_cotep_eventos (tipo, descricao, intencao_id, cotep_id, procedimento_id, elemento_item, valor, dados, autor)
 VALUES (p_tipo, left(p_descricao, 2000), p_intencao, p_cotep, p_item, p_elemento, p_valor, p_dados, auth.uid())
$f$;

-- Ajusta as intenções vinculadas quando a situação da COTEP muda.
CREATE OR REPLACE FUNCTION private.sig_cotep_sincronizar_intencoes(p_cotep uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $f$
DECLARE c public.sig_cotep_coteps%ROWTYPE; r record;
BEGIN
 SELECT * INTO c FROM public.sig_cotep_coteps WHERE id = p_cotep;
 FOR r IN SELECT id, situacao, elemento_item FROM public.sig_cotep_intencoes WHERE cotep_id = p_cotep FOR UPDATE LOOP
  IF c.situacao = 'Em andamento' AND r.situacao = 'Finalizada' THEN
   UPDATE public.sig_cotep_intencoes SET situacao = 'Em COTEP', atualizado_em = now() WHERE id = r.id;
   PERFORM private.sig_cotep_evento('Em COTEP', concat('COTEP ', c.numero, ' reaberta'), r.id, c.id, NULL, r.elemento_item, NULL, NULL);
  ELSIF c.situacao IN ('Finalizada','Realizada (a conferir)') AND r.situacao = 'Em COTEP' THEN
   UPDATE public.sig_cotep_intencoes SET situacao = 'Finalizada', atualizado_em = now() WHERE id = r.id;
   PERFORM private.sig_cotep_evento('Finalizada', concat('COTEP ', c.numero, ' realizada'), r.id, c.id, NULL, r.elemento_item, NULL, NULL);
  ELSIF c.situacao IN ('Fracassada','Deserta','Cancelada') AND r.situacao IN ('Em COTEP','Finalizada') THEN
   UPDATE public.sig_cotep_intencoes SET situacao = 'Pendente', cotep_id = NULL, atualizado_em = now(),
    observacao_gestor = left(concat('COTEP ', c.numero, ' ', lower(c.situacao), ': intenção devolvida à fila sem reserva. ', observacao_gestor), 2000)
   WHERE id = r.id;
   PERFORM private.sig_cotep_evento('Liberação', concat('COTEP ', c.numero, ' ', lower(c.situacao), ': valor liberado e intenção de volta à fila'), r.id, c.id, NULL, r.elemento_item, NULL, NULL);
  END IF;
 END LOOP;
END $f$;

CREATE OR REPLACE FUNCTION public.sig_cotep_acao(p jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $fn$
DECLARE
 ac text := p->>'acao'; uid uuid := auth.uid(); gestor boolean; admin boolean;
 i public.sig_cotep_intencoes%ROWTYPE;
 c public.sig_cotep_coteps%ROWTYPE;
 c_old public.sig_cotep_coteps%ROWTYPE;
 it public.sig_cotep_procedimentos%ROWTYPE;
 v_id uuid; v_ano int; v_ug text; v_el text; v_valor numeric(14,2); v_hom numeric(14,2);
 v_txt text; v_centro text; v_ids uuid[]; v_els text[]; v_item jsonb; v_seen text[] := '{}';
 v_ativo boolean; v_n int; s record; v_msg text := ''; v_antes numeric; v_depois numeric; v_liberado numeric := 0;
BEGIN
 IF NOT private.sig_cotep_ativo() THEN RAISE EXCEPTION 'Acesso não autorizado ao SIG'; END IF;
 gestor := private.sig_cotep_gestor(); admin := private.sig_cotep_admin();

 -- Compatibilidade com o formulário antigo de decisão.
 IF ac = 'decidir' THEN
  RETURN public.sig_cotep_acao(p - 'acao' || jsonb_build_object('acao',
   CASE p->>'situacao' WHEN 'Reservada' THEN 'reservar' WHEN 'Devolvida' THEN 'devolver'
    WHEN 'Rejeitada' THEN 'rejeitar' WHEN 'Cancelada' THEN 'cancelar_intencao' ELSE 'acao_invalida' END,
   'valor', p->>'valor_reservado', 'motivo', p->>'observacao'));
 END IF;

 -- ===== Ações de qualquer conta ativa (centros) =====
 IF ac IN ('criar_intencao','editar_intencao') THEN
  IF ac = 'editar_intencao' THEN
   SELECT * INTO i FROM public.sig_cotep_intencoes WHERE id = (p->>'id')::uuid FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'Intenção não localizada'; END IF;
   IF i.criado_por <> uid AND NOT gestor THEN RAISE EXCEPTION 'Somente o autor ou a DTS-1 pode editar a intenção'; END IF;
   IF i.situacao NOT IN ('Pendente','Devolvida') THEN RAISE EXCEPTION 'Somente intenções pendentes ou devolvidas podem ser editadas'; END IF;
  END IF;
  v_ano := coalesce(nullif(p->>'ano','')::int, i.ano, extract(year FROM now() AT TIME ZONE 'America/Sao_Paulo')::int);
  v_ug := coalesce(nullif(trim(coalesce(p->>'unidade_gestora','')),''), i.unidade_gestora,
   (SELECT unidade_gestora FROM public.sig_cotep_limites WHERE ano = v_ano AND padrao));
  IF v_ug IS NULL OR NOT EXISTS (SELECT 1 FROM public.sig_cotep_limites WHERE ano = v_ano AND unidade_gestora = v_ug) THEN
   RAISE EXCEPTION 'Limite anual de COTEP de % ainda não foi configurado pela DTS-1 para esta UG', v_ano;
  END IF;
  v_el := coalesce(nullif(trim(coalesce(p->>'elemento_item','')),''), i.elemento_item);
  IF coalesce(v_el,'') !~ '^[0-9]{4}$' THEN RAISE EXCEPTION 'Informe o elemento-item com 4 dígitos (ex.: 3016)'; END IF;
  IF EXISTS (SELECT 1 FROM public.sig_cotep_elementos WHERE codigo = v_el AND NOT ativo) THEN
   RAISE EXCEPTION 'Elemento-item % está inativo no catálogo', v_el; END IF;
  INSERT INTO public.sig_cotep_elementos (codigo, criado_por) VALUES (v_el, uid) ON CONFLICT (codigo) DO NOTHING;
  v_centro := coalesce(nullif(trim(coalesce(p->>'centro','')),''), i.centro);
  IF length(coalesce(v_centro,'')) < 2 THEN RAISE EXCEPTION 'Informe o centro solicitante'; END IF;
  SELECT nome, ativo INTO s FROM public.sig_cotep_centros WHERE lower(trim(nome)) = lower(v_centro);
  IF FOUND THEN
   IF NOT s.ativo THEN RAISE EXCEPTION 'Centro % está inativo; escolha outro ou fale com a DTS-1', s.nome; END IF;
   v_centro := s.nome;
  ELSE
   INSERT INTO public.sig_cotep_centros (nome, criado_por) VALUES (v_centro, uid);
  END IF;
  v_valor := coalesce(private.sig_cotep_valor(p->>'valor_estimado'), i.valor_estimado);
  IF v_valor IS NULL OR v_valor <= 0 THEN RAISE EXCEPTION 'Informe o valor estimado'; END IF;
  v_txt := coalesce(nullif(trim(coalesce(p->>'objeto','')),''), i.objeto);
  IF length(coalesce(v_txt,'')) < 8 THEN RAISE EXCEPTION 'Descreva o objeto (mínimo 8 caracteres)'; END IF;
  IF length(trim(coalesce(p->>'justificativa', i.justificativa, ''))) < 10 THEN
   RAISE EXCEPTION 'Informe a justificativa (mínimo 10 caracteres)'; END IF;
  IF coalesce(p->>'prioridade', i.prioridade, 'Média') NOT IN ('Alta','Média','Baixa') THEN RAISE EXCEPTION 'Prioridade inválida'; END IF;
  IF ac = 'criar_intencao' THEN
   -- Evita duplicidade por duplo clique ou reenvio.
   IF EXISTS (SELECT 1 FROM public.sig_cotep_intencoes WHERE criado_por = uid AND elemento_item = v_el
     AND lower(trim(objeto)) = lower(v_txt) AND valor_estimado = v_valor AND situacao = 'Pendente'
     AND criado_em > now() - interval '10 minutes') THEN
    RAISE EXCEPTION 'Intenção idêntica registrada há poucos minutos; confira a lista antes de repetir';
   END IF;
   INSERT INTO public.sig_cotep_intencoes (ano, unidade_gestora, centro, objeto, elemento_item, valor_estimado,
    necessidade_ate, justificativa, prioridade, criado_por)
   VALUES (v_ano, v_ug, v_centro, v_txt, v_el, v_valor, nullif(p->>'necessidade_ate','')::date,
    left(trim(p->>'justificativa'), 2000), coalesce(p->>'prioridade','Média'), uid)
   RETURNING id INTO v_id;
   PERFORM private.sig_cotep_evento('Intenção', concat('Intenção registrada por ', v_centro), v_id, NULL, NULL, v_el, v_valor, NULL);
  ELSE
   UPDATE public.sig_cotep_intencoes SET ano = v_ano, unidade_gestora = v_ug, centro = v_centro, objeto = v_txt,
    elemento_item = v_el, valor_estimado = v_valor,
    necessidade_ate = CASE WHEN p ? 'necessidade_ate' THEN nullif(p->>'necessidade_ate','')::date ELSE necessidade_ate END,
    justificativa = left(trim(coalesce(p->>'justificativa', justificativa)), 2000),
    prioridade = coalesce(p->>'prioridade', prioridade), situacao = 'Pendente', atualizado_em = now()
   WHERE id = i.id RETURNING id INTO v_id;
   PERFORM private.sig_cotep_evento('Edição', CASE WHEN i.situacao = 'Devolvida' THEN 'Intenção ajustada e reenviada à DTS-1' ELSE 'Intenção editada' END,
    v_id, NULL, NULL, v_el, v_valor, jsonb_build_object('antes', to_jsonb(i)));
  END IF;
  RETURN jsonb_build_object('ok', true, 'id', v_id, 'situacao', 'Pendente');
 END IF;

 IF ac = 'cancelar_intencao' THEN
  SELECT * INTO i FROM public.sig_cotep_intencoes WHERE id = (p->>'id')::uuid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Intenção não localizada'; END IF;
  IF NOT (gestor AND i.situacao IN ('Pendente','Devolvida','Reservada'))
     AND NOT (i.criado_por = uid AND i.situacao IN ('Pendente','Devolvida')) THEN
   RAISE EXCEPTION 'Cancelamento não permitido nesta situação (%)', i.situacao; END IF;
  UPDATE public.sig_cotep_intencoes SET situacao = 'Cancelada', valor_reservado = 0, reserva_ate = NULL,
   observacao_gestor = left(coalesce(nullif(trim(p->>'motivo'),''), observacao_gestor), 2000), decidido_por = uid, atualizado_em = now()
  WHERE id = i.id;
  PERFORM private.sig_cotep_evento('Cancelada', coalesce(nullif(trim(p->>'motivo'),''), 'Intenção cancelada'), i.id, NULL, NULL, i.elemento_item,
   CASE WHEN i.situacao = 'Reservada' THEN i.valor_reservado END, NULL);
  RETURN jsonb_build_object('ok', true, 'situacao', 'Cancelada');
 END IF;

 IF ac = 'definir_gestor' THEN
  IF NOT admin THEN RAISE EXCEPTION 'Somente administrador pode atribuir gestores'; END IF;
  v_id := (p->>'auth_id')::uuid;
  IF NOT EXISTS (SELECT 1 FROM public.usuarios WHERE auth_id = v_id AND ativo) THEN RAISE EXCEPTION 'Usuário inexistente ou inativo'; END IF;
  INSERT INTO public.sig_cotep_gestores (auth_id, ativo, atribuido_por) VALUES (v_id, coalesce((p->>'ativo')::boolean, true), uid)
  ON CONFLICT (auth_id) DO UPDATE SET ativo = excluded.ativo, atribuido_por = uid, atribuido_em = now();
  PERFORM private.sig_cotep_evento('Gestor DTS-1', concat(CASE WHEN coalesce((p->>'ativo')::boolean, true) THEN 'Gestão atribuída a ' ELSE 'Gestão revogada de ' END,
   (SELECT nome FROM public.usuarios WHERE auth_id = v_id)), NULL, NULL, NULL, NULL, NULL, NULL);
  RETURN jsonb_build_object('ok', true);
 END IF;

 -- ===== Ações exclusivas da DTS-1 =====
 IF NOT gestor THEN RAISE EXCEPTION 'Somente gestor DTS-1 autorizado pode realizar esta operação'; END IF;

 IF ac = 'reservar' THEN
  SELECT * INTO i FROM public.sig_cotep_intencoes WHERE id = (p->>'id')::uuid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Intenção não localizada'; END IF;
  IF i.situacao NOT IN ('Pendente','Reservada') THEN RAISE EXCEPTION 'Só é possível reservar intenção pendente (situação atual: %)', i.situacao; END IF;
  v_valor := coalesce(private.sig_cotep_valor(p->>'valor'), i.valor_estimado);
  IF v_valor <= 0 OR v_valor > i.valor_estimado THEN
   RAISE EXCEPTION 'A reserva deve ser maior que zero e até o valor estimado (%)', private.sig_cotep_brl(i.valor_estimado); END IF;
  PERFORM private.sig_cotep_lock(i.ano, i.unidade_gestora, i.elemento_item);
  UPDATE public.sig_cotep_intencoes SET situacao = 'Reservada', valor_reservado = v_valor,
   reserva_ate = CASE WHEN p ? 'reserva_ate' THEN nullif(p->>'reserva_ate','')::date ELSE reserva_ate END,
   observacao_gestor = left(coalesce(nullif(trim(p->>'motivo'),''), observacao_gestor), 2000), decidido_por = uid, atualizado_em = now()
  WHERE id = i.id;  -- o gatilho sig_cotep_intencao_limite bloqueia se faltar saldo
  SELECT * INTO s FROM private.sig_cotep_saldo(i.ano, i.unidade_gestora, i.elemento_item);
  PERFORM private.sig_cotep_evento(CASE WHEN i.situacao = 'Reservada' THEN 'Reserva ajustada' ELSE 'Reserva' END,
   concat('Reserva de ', private.sig_cotep_brl(v_valor), ' aprovada; saldo do elemento-item ', private.sig_cotep_brl(s.saldo)),
   i.id, NULL, NULL, i.elemento_item, v_valor, jsonb_build_object('reserva_anterior', i.valor_reservado, 'saldo_apos', s.saldo));
  RETURN jsonb_build_object('ok', true, 'situacao', 'Reservada', 'saldo', s.saldo);
 END IF;

 IF ac IN ('liberar_reserva','devolver','rejeitar') THEN
  SELECT * INTO i FROM public.sig_cotep_intencoes WHERE id = (p->>'id')::uuid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Intenção não localizada'; END IF;
  IF ac = 'liberar_reserva' AND i.situacao <> 'Reservada' THEN RAISE EXCEPTION 'A intenção não possui reserva ativa'; END IF;
  IF ac <> 'liberar_reserva' AND i.situacao NOT IN ('Pendente','Reservada','Devolvida') THEN
   RAISE EXCEPTION 'Ação não permitida na situação %', i.situacao; END IF;
  IF ac <> 'liberar_reserva' AND length(trim(coalesce(p->>'motivo',''))) < 5 THEN
   RAISE EXCEPTION 'Informe o motivo para o centro solicitante'; END IF;
  v_txt := CASE ac WHEN 'liberar_reserva' THEN 'Pendente' WHEN 'devolver' THEN 'Devolvida' ELSE 'Rejeitada' END;
  UPDATE public.sig_cotep_intencoes SET situacao = v_txt, valor_reservado = 0, reserva_ate = NULL,
   observacao_gestor = left(coalesce(nullif(trim(p->>'motivo'),''), observacao_gestor), 2000), decidido_por = uid, atualizado_em = now()
  WHERE id = i.id;
  PERFORM private.sig_cotep_evento(CASE ac WHEN 'liberar_reserva' THEN 'Liberação' ELSE v_txt END,
   coalesce(nullif(trim(p->>'motivo'),''), 'Reserva liberada'), i.id, NULL, NULL, i.elemento_item,
   CASE WHEN i.situacao = 'Reservada' THEN i.valor_reservado END, NULL);
  RETURN jsonb_build_object('ok', true, 'situacao', v_txt);
 END IF;

 IF ac IN ('priorizar','agrupar') THEN
  v_ids := CASE WHEN p ? 'ids' THEN ARRAY(SELECT jsonb_array_elements_text(p->'ids')::uuid) ELSE ARRAY[(p->>'id')::uuid] END;
  IF coalesce(array_length(v_ids,1),0) = 0 THEN RAISE EXCEPTION 'Selecione ao menos uma intenção'; END IF;
  IF p->>'prioridade' IS NOT NULL AND p->>'prioridade' NOT IN ('Alta','Média','Baixa') THEN RAISE EXCEPTION 'Prioridade inválida'; END IF;
  FOR i IN SELECT * FROM public.sig_cotep_intencoes WHERE id = ANY(v_ids) ORDER BY id FOR UPDATE LOOP
   IF i.situacao NOT IN ('Pendente','Reservada','Devolvida') THEN
    RAISE EXCEPTION 'Intenção de % (%) não pode ser alterada na situação %', i.centro, i.elemento_item, i.situacao; END IF;
   UPDATE public.sig_cotep_intencoes SET
    prioridade = coalesce(p->>'prioridade', prioridade),
    grupo = CASE WHEN p ? 'grupo' THEN nullif(trim(p->>'grupo'),'') ELSE grupo END,
    observacao_gestor = left(coalesce(nullif(trim(p->>'motivo'),''), observacao_gestor), 2000), atualizado_em = now()
   WHERE id = i.id;
   PERFORM private.sig_cotep_evento(CASE ac WHEN 'agrupar' THEN 'Agrupamento' ELSE 'Priorização' END,
    concat_ws(' · ', CASE WHEN p ? 'prioridade' THEN 'Prioridade ' || (p->>'prioridade') END,
     CASE WHEN p ? 'grupo' THEN coalesce('Grupo ' || nullif(trim(p->>'grupo'),''), 'Removida do grupo') END, nullif(trim(p->>'motivo'),'')),
    i.id, NULL, NULL, i.elemento_item, NULL, NULL);
  END LOOP;
  IF NOT FOUND THEN RAISE EXCEPTION 'Intenções não localizadas'; END IF;
  RETURN jsonb_build_object('ok', true);
 END IF;

 IF ac = 'converter_cotep' THEN
  -- Agrupa intenções (pendentes ou reservadas) numa COTEP em andamento, nova ou existente.
  v_ids := ARRAY(SELECT jsonb_array_elements_text(coalesce(p->'ids','[]'::jsonb))::uuid);
  IF coalesce(array_length(v_ids,1),0) = 0 THEN RAISE EXCEPTION 'Selecione as intenções que formarão a COTEP'; END IF;
  SELECT min(ano), min(unidade_gestora), count(DISTINCT (ano, unidade_gestora)), array_agg(DISTINCT elemento_item ORDER BY elemento_item)
   INTO v_ano, v_ug, v_n, v_els FROM public.sig_cotep_intencoes WHERE id = ANY(v_ids);
  IF v_n IS DISTINCT FROM 1 THEN RAISE EXCEPTION 'As intenções devem ser do mesmo exercício e da mesma UG'; END IF;
  FOREACH v_el IN ARRAY v_els LOOP PERFORM private.sig_cotep_lock(v_ano, v_ug, v_el); END LOOP;
  IF (SELECT count(*) FROM public.sig_cotep_intencoes WHERE id = ANY(v_ids)) <> array_length(v_ids,1) THEN
   RAISE EXCEPTION 'Intenção não localizada'; END IF;
  PERFORM 1 FROM public.sig_cotep_intencoes WHERE id = ANY(v_ids) ORDER BY id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM public.sig_cotep_intencoes WHERE id = ANY(v_ids) AND situacao NOT IN ('Pendente','Reservada')) THEN
   RAISE EXCEPTION 'Somente intenções pendentes ou reservadas podem formar uma COTEP'; END IF;
  v_txt := trim(coalesce(p->>'numero',''));
  IF length(v_txt) < 1 THEN RAISE EXCEPTION 'Informe o número da COTEP (ex.: 131/2026)'; END IF;
  SELECT * INTO c FROM public.sig_cotep_coteps WHERE ano = v_ano AND unidade_gestora = v_ug AND numero = v_txt FOR UPDATE;
  IF FOUND THEN
   IF c.situacao <> 'Em andamento' THEN RAISE EXCEPTION 'A COTEP % já está %; não recebe novas intenções', c.numero, lower(c.situacao); END IF;
  ELSE
   INSERT INTO public.sig_cotep_coteps (ano, unidade_gestora, numero, objeto, situacao, documento, processo_id, criado_por, atualizado_por)
   VALUES (v_ano, v_ug, v_txt,
    coalesce(nullif(trim(p->>'objeto'),''), (SELECT string_agg(objeto, '; ' ORDER BY criado_em) FROM public.sig_cotep_intencoes WHERE id = ANY(v_ids))),
    'Em andamento', nullif(trim(coalesce(p->>'documento','')),''), nullif(p->>'processo_id','')::uuid, uid, uid)
   RETURNING * INTO c;
   PERFORM private.sig_cotep_evento('COTEP', concat('COTEP ', c.numero, ' aberta a partir de ', array_length(v_ids,1), ' intenção(ões)'), NULL, c.id, NULL, NULL, NULL, NULL);
  END IF;
  -- Primeiro libera as reservas (transferência), depois lança o valor no item: nunca soma duas vezes.
  FOREACH v_el IN ARRAY v_els LOOP
   SELECT coalesce(sum(CASE WHEN situacao = 'Reservada' THEN valor_reservado ELSE valor_estimado END),0),
     jsonb_agg(jsonb_build_object('id', id, 'valor', CASE WHEN situacao = 'Reservada' THEN valor_reservado ELSE valor_estimado END, 'situacao', situacao))
    INTO v_valor, v_item FROM public.sig_cotep_intencoes WHERE id = ANY(v_ids) AND elemento_item = v_el;
   UPDATE public.sig_cotep_intencoes SET situacao = 'Em COTEP', valor_reservado = 0, cotep_id = c.id, cotep_numero = c.numero,
    decidido_por = uid, atualizado_em = now() WHERE id = ANY(v_ids) AND elemento_item = v_el;
   it := NULL;
   SELECT * INTO it FROM public.sig_cotep_procedimentos WHERE cotep_id = c.id AND elemento_item = v_el FOR UPDATE;
   IF it.id IS NOT NULL THEN
    UPDATE public.sig_cotep_procedimentos SET valor_estimado = CASE WHEN it.ativo THEN it.valor_estimado ELSE 0 END + v_valor,
     ativo = true, atualizado_por = uid, atualizado_em = now() WHERE id = it.id;
   ELSE
    INSERT INTO public.sig_cotep_procedimentos (cotep_id, ano, numero, unidade_gestora, elemento_item, objeto, situacao, valor_estimado, atualizado_por)
    VALUES (c.id, c.ano, c.numero, c.unidade_gestora, v_el, c.objeto, c.situacao, v_valor, uid) RETURNING * INTO it;
   END IF;
   PERFORM private.sig_cotep_evento('Em COTEP',
     concat('Vinculada à COTEP ', c.numero, CASE WHEN x->>'situacao' = 'Reservada' THEN ' (reserva transferida para o item, sem dupla contagem)' ELSE ' (valor lançado no item)' END),
     (x->>'id')::uuid, c.id, it.id, v_el, (x->>'valor')::numeric, NULL)
    FROM jsonb_array_elements(v_item) x;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'cotep_id', c.id, 'numero', c.numero);
 END IF;

 IF ac = 'salvar_cotep' THEN
  v_ano := (p->>'ano')::int; v_ug := trim(coalesce(p->>'unidade_gestora','')); v_txt := trim(coalesce(p->>'numero',''));
  IF v_ano NOT BETWEEN 2020 AND 2100 OR v_ug !~ '^[0-9]{5,9}$' OR length(v_txt) < 1
   OR length(trim(coalesce(p->>'objeto',''))) < 8
   OR coalesce(p->>'situacao','') NOT IN ('Em andamento','Finalizada','Realizada (a conferir)','Fracassada','Deserta','Cancelada') THEN
   RAISE EXCEPTION 'Revise exercício, UG, número, objeto (mín. 8 caracteres) e situação da COTEP'; END IF;
  IF jsonb_typeof(p->'itens') <> 'array' THEN RAISE EXCEPTION 'Informe os elementos-itens da COTEP'; END IF;
  IF p->>'situacao' = 'Finalizada' AND EXISTS (SELECT 1 FROM jsonb_array_elements(p->'itens') x
     WHERE coalesce((x->>'ativo')::boolean, true) AND nullif(trim(coalesce(x->>'valor_homologado','')),'') IS NULL) THEN
   RAISE EXCEPTION 'Para finalizar, informe o valor homologado/negociado de cada elemento-item'; END IF;
  IF nullif(p->>'id','') IS NOT NULL THEN
   SELECT * INTO c_old FROM public.sig_cotep_coteps WHERE id = (p->>'id')::uuid FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'COTEP não localizada'; END IF;
  ELSIF EXISTS (SELECT 1 FROM public.sig_cotep_coteps WHERE ano = v_ano AND unidade_gestora = v_ug AND numero = v_txt) THEN
   RAISE EXCEPTION 'A COTEP % já está cadastrada; abra-a para editar', v_txt;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.sig_cotep_limites WHERE ano = v_ano AND unidade_gestora = v_ug) THEN
   RAISE EXCEPTION 'Limite anual de COTEP não configurado para % / UG %', v_ano, v_ug; END IF;
  -- Bloqueia todos os elementos afetados (antigos e novos) em ordem fixa, evitando impasse.
  SELECT array_agg(DISTINCT e ORDER BY e) INTO v_els FROM (
   SELECT nullif(trim(x->>'elemento_item'),'') e FROM jsonb_array_elements(p->'itens') x
   UNION SELECT elemento_item FROM public.sig_cotep_procedimentos WHERE cotep_id = c_old.id) z WHERE e IS NOT NULL;
  IF v_els IS NOT NULL THEN
   FOREACH v_el IN ARRAY v_els LOOP
    IF v_el !~ '^[0-9]{4}$' THEN RAISE EXCEPTION 'Elemento-item inválido: %', v_el; END IF;
    PERFORM private.sig_cotep_lock(v_ano, v_ug, v_el);
    IF c_old.id IS NOT NULL AND (c_old.ano <> v_ano OR c_old.unidade_gestora <> v_ug) THEN
     PERFORM private.sig_cotep_lock(c_old.ano, c_old.unidade_gestora, v_el); END IF;
   END LOOP;
  END IF;
  IF nullif(trim(coalesce(p->>'justificativa_excecao','')),'') IS NOT NULL THEN
   IF NOT admin THEN RAISE EXCEPTION 'Somente administrador pode registrar exceção ao limite'; END IF;
   IF length(trim(p->>'justificativa_excecao')) < 20 THEN RAISE EXCEPTION 'Justifique a exceção ao limite (mínimo 20 caracteres)'; END IF;
   PERFORM set_config('sig.cotep_excecao', 'on', true);
  END IF;
  -- Saldo ocupado antes (para informar o valor liberado).
  SELECT coalesce(sum(private.sig_cotep_contrib(situacao, valor_estimado, valor_homologado, ativo)),0) INTO v_antes
   FROM public.sig_cotep_procedimentos WHERE cotep_id = c_old.id;
  IF c_old.id IS NULL THEN
   INSERT INTO public.sig_cotep_coteps (ano, unidade_gestora, numero, objeto, situacao, documento, processo_id, criado_por, atualizado_por)
   VALUES (v_ano, v_ug, v_txt, trim(p->>'objeto'), 'Em andamento', nullif(trim(coalesce(p->>'documento','')),''),
    nullif(p->>'processo_id','')::uuid, uid, uid) RETURNING * INTO c;
  ELSE
   c := c_old;
  END IF;
  -- Itens: valores primeiro (com a situação antiga), situação depois (cabeçalho espelha nos itens).
  FOR v_item IN SELECT * FROM jsonb_array_elements(p->'itens') LOOP
   v_el := nullif(trim(coalesce(v_item->>'elemento_item','')),'');
   IF v_el IS NOT NULL AND v_el = ANY(v_seen) THEN RAISE EXCEPTION 'Elemento-item % repetido na COTEP', v_el; END IF;
   v_seen := v_seen || coalesce(v_el, '');
   v_valor := coalesce(private.sig_cotep_valor(v_item->>'valor_estimado'), 0);
   v_hom := private.sig_cotep_valor(v_item->>'valor_homologado');
   v_ativo := coalesce((v_item->>'ativo')::boolean, true);
   IF v_el IS NOT NULL THEN
    INSERT INTO public.sig_cotep_elementos (codigo, criado_por) VALUES (v_el, uid) ON CONFLICT (codigo) DO NOTHING;
   END IF;
   it := NULL;
   IF nullif(v_item->>'id','') IS NOT NULL THEN
    SELECT * INTO it FROM public.sig_cotep_procedimentos WHERE id = (v_item->>'id')::uuid AND cotep_id = c.id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Lançamento não pertence a esta COTEP'; END IF;
   ELSE
    SELECT * INTO it FROM public.sig_cotep_procedimentos WHERE cotep_id = c.id AND elemento_item IS NOT DISTINCT FROM v_el FOR UPDATE;
   END IF;
   IF it.id IS NULL THEN
    INSERT INTO public.sig_cotep_procedimentos (cotep_id, ano, numero, unidade_gestora, elemento_item, objeto, situacao,
     valor_estimado, valor_homologado, ativo, documento, atualizado_por)
    VALUES (c.id, c.ano, c.numero, c.unidade_gestora, v_el, c.objeto, c.situacao, v_valor, v_hom, v_ativo,
     nullif(trim(coalesce(p->>'documento','')),''), uid);
   ELSE
    UPDATE public.sig_cotep_procedimentos SET elemento_item = v_el, valor_estimado = v_valor, valor_homologado = v_hom,
     ativo = v_ativo, atualizado_por = uid, atualizado_em = now() WHERE id = it.id;
   END IF;
  END LOOP;
  -- Lançamentos ausentes do formulário são inativados (nunca excluídos).
  UPDATE public.sig_cotep_procedimentos SET ativo = false, atualizado_por = uid, atualizado_em = now()
   WHERE cotep_id = c.id AND ativo AND coalesce(elemento_item,'') <> ALL(v_seen);
  IF p->>'situacao' NOT IN ('Fracassada','Deserta','Cancelada')
     AND NOT EXISTS (SELECT 1 FROM public.sig_cotep_procedimentos WHERE cotep_id = c.id AND ativo AND elemento_item IS NOT NULL) THEN
   RAISE EXCEPTION 'Informe ao menos um elemento-item com valor'; END IF;
  IF p->>'situacao' = 'Finalizada' AND EXISTS (SELECT 1 FROM public.sig_cotep_procedimentos WHERE cotep_id = c.id AND ativo AND valor_homologado IS NULL) THEN
   RAISE EXCEPTION 'Para finalizar, informe o valor homologado/negociado de cada elemento-item'; END IF;
  UPDATE public.sig_cotep_coteps SET ano = v_ano, unidade_gestora = v_ug, numero = v_txt, objeto = trim(p->>'objeto'),
   situacao = p->>'situacao', documento = nullif(trim(coalesce(p->>'documento','')),''),
   processo_id = nullif(p->>'processo_id','')::uuid, atualizado_por = uid, atualizado_em = now()
  WHERE id = c.id RETURNING * INTO c;
  PERFORM private.sig_cotep_sincronizar_intencoes(c.id);
  SELECT coalesce(sum(private.sig_cotep_contrib(situacao, valor_estimado, valor_homologado, ativo)),0) INTO v_depois
   FROM public.sig_cotep_procedimentos WHERE cotep_id = c.id;
  v_liberado := greatest(v_antes - v_depois, 0);
  PERFORM private.sig_cotep_evento(CASE WHEN c_old.id IS NULL THEN 'COTEP' WHEN c_old.situacao <> c.situacao THEN c.situacao ELSE 'COTEP atualizada' END,
   concat('COTEP ', c.numero, CASE WHEN c_old.id IS NOT NULL AND c_old.situacao <> c.situacao THEN concat(': ', c_old.situacao, ' → ', c.situacao) ELSE concat(' · ', c.situacao) END,
    CASE WHEN v_liberado > 0 THEN concat(' · liberado ', private.sig_cotep_brl(v_liberado)) ELSE '' END,
    CASE WHEN current_setting('sig.cotep_excecao', true) = 'on' THEN concat(' · EXCEÇÃO AO LIMITE: ', trim(p->>'justificativa_excecao')) ELSE '' END),
   NULL, c.id, NULL, NULL, v_depois,
   jsonb_build_object('antes', to_jsonb(c_old), 'ocupado_antes', v_antes, 'ocupado_depois', v_depois,
    'itens', (SELECT jsonb_agg(jsonb_build_object('elemento_item', elemento_item, 'estimado', valor_estimado, 'homologado', valor_homologado, 'ativo', ativo))
              FROM public.sig_cotep_procedimentos WHERE cotep_id = c.id)));
  PERFORM set_config('sig.cotep_excecao', '', true);
  RETURN jsonb_build_object('ok', true, 'id', c.id, 'liberado', v_liberado);
 END IF;

 IF ac = 'limite' THEN
  v_ano := (p->>'ano')::int; v_ug := trim(coalesce(p->>'unidade_gestora','')); v_valor := private.sig_cotep_valor(p->>'valor_limite');
  IF v_ano NOT BETWEEN 2020 AND 2100 OR v_ug !~ '^[0-9]{5,9}$' OR coalesce(v_valor,0) <= 0
   OR length(trim(coalesce(p->>'base_normativa',''))) < 10 THEN
   RAISE EXCEPTION 'Informe exercício, UG, valor do limite e base normativa'; END IF;
  IF coalesce(p->>'validacao_juridica','Pendente') = 'Validada' AND NOT admin THEN
   RAISE EXCEPTION 'Somente administrador registra a validação jurídica institucional'; END IF;
  IF coalesce((p->>'padrao')::boolean, true) THEN
   UPDATE public.sig_cotep_limites SET padrao = false WHERE ano = v_ano AND unidade_gestora <> v_ug AND padrao;
  END IF;
  INSERT INTO public.sig_cotep_limites (ano, unidade_gestora, valor_limite, base_normativa, validacao_juridica, documento_validacao, padrao, atualizado_por)
  VALUES (v_ano, v_ug, v_valor, trim(p->>'base_normativa'), coalesce(p->>'validacao_juridica','Pendente'),
   nullif(trim(coalesce(p->>'documento_validacao','')),''), coalesce((p->>'padrao')::boolean, true), uid)
  ON CONFLICT (ano, unidade_gestora) DO UPDATE SET valor_limite = excluded.valor_limite, base_normativa = excluded.base_normativa,
   validacao_juridica = excluded.validacao_juridica, documento_validacao = excluded.documento_validacao, padrao = excluded.padrao,
   atualizado_por = uid, atualizado_em = now();
  PERFORM private.sig_cotep_evento('Parâmetro', concat('Limite ', v_ano, ' / UG ', v_ug, ': ', private.sig_cotep_brl(v_valor),
   ' por elemento-item · validação jurídica ', coalesce(p->>'validacao_juridica','Pendente')), NULL, NULL, NULL, NULL, v_valor, NULL);
  RETURN jsonb_build_object('ok', true);
 END IF;

 IF ac = 'elemento' THEN
  v_el := trim(coalesce(p->>'codigo',''));
  IF v_el !~ '^[0-9]{4}$' THEN RAISE EXCEPTION 'Código do elemento-item deve ter 4 dígitos'; END IF;
  INSERT INTO public.sig_cotep_elementos (codigo, descricao, ativo, criado_por)
  VALUES (v_el, nullif(trim(coalesce(p->>'descricao','')),''), coalesce((p->>'ativo')::boolean, true), uid)
  ON CONFLICT (codigo) DO UPDATE SET descricao = excluded.descricao, ativo = excluded.ativo, atualizado_em = now();
  PERFORM private.sig_cotep_evento('Catálogo', concat('Elemento-item ', v_el, ' atualizado'), NULL, NULL, NULL, v_el, NULL, NULL);
  RETURN jsonb_build_object('ok', true);
 END IF;

 IF ac = 'centro' THEN
  v_txt := trim(coalesce(p->>'nome',''));
  IF length(v_txt) < 2 THEN RAISE EXCEPTION 'Informe o nome do centro'; END IF;
  IF nullif(p->>'id','') IS NOT NULL THEN
   UPDATE public.sig_cotep_centros SET nome = v_txt, ativo = coalesce((p->>'ativo')::boolean, ativo) WHERE id = (p->>'id')::uuid;
  ELSE
   INSERT INTO public.sig_cotep_centros (nome, ativo, criado_por) VALUES (v_txt, coalesce((p->>'ativo')::boolean, true), uid)
   ON CONFLICT ((lower(trim(nome)))) DO UPDATE SET ativo = excluded.ativo;
  END IF;
  PERFORM private.sig_cotep_evento('Catálogo', concat('Centro ', v_txt, ' atualizado'), NULL, NULL, NULL, NULL, NULL, NULL);
  RETURN jsonb_build_object('ok', true);
 END IF;

 RAISE EXCEPTION 'Ação desconhecida: %', coalesce(ac, '(vazia)');
END $fn$;
REVOKE ALL ON FUNCTION public.sig_cotep_acao(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sig_cotep_acao(jsonb) TO authenticated;
REVOKE ALL ON FUNCTION private.sig_cotep_valor(text), private.sig_cotep_evento(text,text,uuid,uuid,uuid,text,numeric,jsonb),
 private.sig_cotep_sincronizar_intencoes(uuid) FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.sig_cotep_intencoes IS 'Intenções dos centros. Reserva aprovada pela DTS-1 abate o saldo do elemento-item; ao formar COTEP a reserva é transferida ao item';
COMMIT;
