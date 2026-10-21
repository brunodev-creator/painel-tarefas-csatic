-- SIG CSA-TIC: planejamento compartilhado de COTEPs. Nenhum dado real é semeado neste piloto.
-- Reserva é GERENCIAL, nunca substitui aferição legal por ramo, exercício e UG.
CREATE TABLE IF NOT EXISTS public.sig_cotep_gestores (
 auth_id uuid PRIMARY KEY REFERENCES auth.users(id),
 ativo boolean NOT NULL DEFAULT true,
 atribuido_por uuid REFERENCES auth.users(id),
 atribuido_em timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.sig_cotep_bases (
 ano integer NOT NULL CHECK(ano BETWEEN 2020 AND 2100),
 unidade_gestora text NOT NULL CHECK(unidade_gestora ~ '^[0-9]{5,9}$'),
 categoria text NOT NULL CHECK(categoria IN ('geral','engenharia')),
 teto_referencia numeric(14,2) NOT NULL CHECK(teto_referencia>0),
 conferida boolean NOT NULL DEFAULT false,
 documento_conferencia text,
 conferida_por uuid REFERENCES auth.users(id),
 conferida_em timestamptz,
 PRIMARY KEY(ano,unidade_gestora,categoria),
 CHECK(NOT conferida OR length(trim(coalesce(documento_conferencia,'')))>=8)
);
CREATE TABLE IF NOT EXISTS public.sig_cotep_intencoes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 ano integer NOT NULL CHECK(ano BETWEEN 2020 AND 2100),
 unidade_gestora text NOT NULL CHECK(unidade_gestora ~ '^[0-9]{5,9}$'),
 centro text NOT NULL CHECK(length(trim(centro)) BETWEEN 2 AND 120),
 objeto text NOT NULL CHECK(length(trim(objeto)) BETWEEN 8 AND 1500),
 elemento_item text NOT NULL CHECK(elemento_item ~ '^[0-9]{4}$'),
 ramo_atividade text,
 categoria text CHECK(categoria IN ('geral','engenharia')),
 valor_estimado numeric(14,2) NOT NULL CHECK(valor_estimado>0),
 valor_reservado numeric(14,2) NOT NULL DEFAULT 0 CHECK(valor_reservado>=0),
 situacao text NOT NULL DEFAULT 'Pendente' CHECK(situacao IN ('Pendente','Reservada','Devolvida','Rejeitada','Cancelada','Finalizada')),
 necessidade_ate date,
 reserva_ate date,
 justificativa text,
 observacao_gestor text,
 cotep_numero text,
 criado_por uuid NOT NULL REFERENCES auth.users(id),
 decidido_por uuid REFERENCES auth.users(id),
 criado_em timestamptz NOT NULL DEFAULT now(),
 atualizado_em timestamptz NOT NULL DEFAULT now(),
 CHECK((situacao='Reservada' AND valor_reservado>0 AND ramo_atividade IS NOT NULL AND categoria IS NOT NULL AND reserva_ate IS NOT NULL)
  OR (situacao<>'Reservada' AND valor_reservado=0))
);
CREATE INDEX IF NOT EXISTS idx_sig_cotep_intencoes_chave ON public.sig_cotep_intencoes(ano,unidade_gestora,ramo_atividade,categoria,situacao);
CREATE TABLE IF NOT EXISTS public.sig_cotep_procedimentos (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 ano integer NOT NULL CHECK(ano BETWEEN 2020 AND 2100),
 numero text NOT NULL CHECK(length(trim(numero)) BETWEEN 1 AND 35),
 unidade_gestora text NOT NULL CHECK(unidade_gestora ~ '^[0-9]{5,9}$'),
 elemento_item text NOT NULL CHECK(elemento_item ~ '^[0-9]{4}$'),
 ramo_atividade text,
 categoria text CHECK(categoria IN ('geral','engenharia')),
 objeto text NOT NULL CHECK(length(trim(objeto)) BETWEEN 8 AND 1500),
 situacao text NOT NULL CHECK(situacao IN ('Em andamento','Finalizada','Fracassada','Cancelada')),
 valor_estimado numeric(14,2) NOT NULL CHECK(valor_estimado>=0),
 valor_homologado numeric(14,2) CHECK(valor_homologado>=0),
 documento text,
 atualizado_por uuid REFERENCES auth.users(id),
 atualizado_em timestamptz NOT NULL DEFAULT now(),
 UNIQUE (ano,numero,unidade_gestora,elemento_item),
 CHECK(situacao<>'Finalizada' OR valor_homologado IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_sig_cotep_procedimentos_chave ON public.sig_cotep_procedimentos(ano,unidade_gestora,ramo_atividade,categoria);
CREATE TABLE IF NOT EXISTS public.sig_cotep_eventos (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 intencao_id uuid REFERENCES public.sig_cotep_intencoes(id),
 procedimento_id uuid REFERENCES public.sig_cotep_procedimentos(id),
 tipo text NOT NULL,
 descricao text NOT NULL,
 autor uuid NOT NULL REFERENCES auth.users(id),
 criado_em timestamptz NOT NULL DEFAULT now()
);
-- Somente visualização autenticada e autorizada. Nenhuma escrita direta por REST.
DO $do$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['sig_cotep_gestores','sig_cotep_bases','sig_cotep_intencoes','sig_cotep_procedimentos','sig_cotep_eventos'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated',t);
 END LOOP;
END $do$;
GRANT SELECT ON public.sig_cotep_bases, public.sig_cotep_intencoes, public.sig_cotep_procedimentos, public.sig_cotep_eventos TO authenticated;
GRANT SELECT ON public.sig_cotep_gestores TO authenticated;
CREATE OR REPLACE FUNCTION private.sig_cotep_ativo() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $f$ SELECT auth.uid() IS NOT NULL AND EXISTS(SELECT 1 FROM public.usuarios u WHERE u.auth_id=auth.uid() AND u.ativo); $f$;
CREATE OR REPLACE FUNCTION private.sig_cotep_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $f$ SELECT EXISTS(SELECT 1 FROM public.usuarios u WHERE u.auth_id=auth.uid() AND u.ativo AND u.role='admin'); $f$;
CREATE OR REPLACE FUNCTION private.sig_cotep_gestor() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $f$ SELECT private.sig_cotep_admin() OR EXISTS(SELECT 1 FROM public.sig_cotep_gestores g JOIN public.usuarios u ON u.auth_id=g.auth_id WHERE g.auth_id=auth.uid() AND g.ativo AND u.ativo); $f$;
REVOKE ALL ON FUNCTION private.sig_cotep_ativo(), private.sig_cotep_admin(), private.sig_cotep_gestor() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.sig_cotep_ativo(), private.sig_cotep_admin(), private.sig_cotep_gestor() TO authenticated;
CREATE POLICY sig_cotep_bases_ler ON public.sig_cotep_bases FOR SELECT TO authenticated USING(private.sig_cotep_ativo());
CREATE POLICY sig_cotep_intencoes_ler ON public.sig_cotep_intencoes FOR SELECT TO authenticated USING(private.sig_cotep_ativo());
CREATE POLICY sig_cotep_procedimentos_ler ON public.sig_cotep_procedimentos FOR SELECT TO authenticated USING(private.sig_cotep_ativo());
CREATE POLICY sig_cotep_eventos_ler ON public.sig_cotep_eventos FOR SELECT TO authenticated USING(private.sig_cotep_ativo());
CREATE POLICY sig_cotep_gestores_ler ON public.sig_cotep_gestores FOR SELECT TO authenticated USING(private.sig_cotep_ativo());
-- Um RPC único para manter as mudanças sujeitas às mesmas validações e trilha.
CREATE OR REPLACE FUNCTION public.sig_cotep_acao(p jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE
 ac text:=p->>'acao'; uid uuid:=auth.uid(); gestor boolean;
 i public.sig_cotep_intencoes%ROWTYPE;
 proc public.sig_cotep_procedimentos%ROWTYPE;
 v_id uuid; v_ano int; v_ug text; v_cat text; v_ramo text;
 v_valor numeric(14,2); v_teto numeric(14,2); v_ocupado numeric(14,2);
 v_situacao text; v_doc text;
BEGIN
 IF NOT private.sig_cotep_ativo() THEN RAISE EXCEPTION 'Acesso não autorizado ao SIG'; END IF;
 gestor:=private.sig_cotep_gestor();
 IF ac='criar_intencao' THEN
  v_ano:=(p->>'ano')::integer;v_ug:=trim(p->>'unidade_gestora');
  v_valor:=(p->>'valor_estimado')::numeric;
  IF v_ano NOT BETWEEN 2020 AND 2100 OR v_ug !~ '^[0-9]{5,9}$'
     OR v_valor<=0 OR length(trim(coalesce(p->>'centro','')))<2
     OR length(trim(coalesce(p->>'objeto','')))<8
     OR coalesce(p->>'elemento_item','') !~ '^[0-9]{4}$'
  THEN RAISE EXCEPTION 'Revise centro, objeto, elemento-item, valor, ano e unidade gestora';END IF;
  INSERT INTO public.sig_cotep_intencoes
  (ano,unidade_gestora,centro,objeto,elemento_item,valor_estimado,necessidade_ate,justificativa,criado_por)
  VALUES (v_ano,v_ug,trim(p->>'centro'),trim(p->>'objeto'),trim(p->>'elemento_item'),v_valor,
    nullif(p->>'necessidade_ate','')::date,left(coalesce(p->>'justificativa',''),2000),uid)
  RETURNING id INTO v_id;
  INSERT INTO public.sig_cotep_eventos(intencao_id,tipo,descricao,autor) VALUES(v_id,'Intenção','Intenção registrada pelo centro',uid);
  RETURN jsonb_build_object('id',v_id,'situacao','Pendente');
 END IF;
 IF ac='definir_gestor' THEN
  IF NOT private.sig_cotep_admin() THEN RAISE EXCEPTION 'Somente administrador pode atribuir gestores';END IF;
  v_id:=(p->>'auth_id')::uuid;
  IF NOT EXISTS(SELECT 1 FROM public.usuarios WHERE auth_id=v_id AND ativo) THEN RAISE EXCEPTION 'Usuário inexistente ou inativo';END IF;
  INSERT INTO public.sig_cotep_gestores(auth_id,ativo,atribuido_por)
  VALUES(v_id,coalesce((p->>'ativo')::boolean,true),uid)
  ON CONFLICT(auth_id) DO UPDATE SET ativo=excluded.ativo,atribuido_por=uid,atribuido_em=now();
  RETURN jsonb_build_object('ok',true);
 END IF;
 IF NOT gestor THEN RAISE EXCEPTION 'Somente gestor DTS-1 autorizado pode realizar esta operação';END IF;
 IF ac='base' THEN
  v_ano:=(p->>'ano')::integer;v_ug:=trim(p->>'unidade_gestora');v_cat:=p->>'categoria';
  v_valor:=(p->>'teto_referencia')::numeric;v_doc:=trim(coalesce(p->>'documento',''));
  IF v_ano NOT BETWEEN 2020 AND 2100 OR v_ug !~ '^[0-9]{5,9}$' OR v_cat NOT IN ('geral','engenharia')
    OR v_valor<=0 OR length(v_doc)<8 THEN RAISE EXCEPTION 'Informe parâmetros e documentação da conferência da base';END IF;
  INSERT INTO public.sig_cotep_bases(ano,unidade_gestora,categoria,teto_referencia,conferida,documento_conferencia,conferida_por,conferida_em)
  VALUES(v_ano,v_ug,v_cat,v_valor,true,v_doc,uid,now())
  ON CONFLICT(ano,unidade_gestora,categoria) DO UPDATE
  SET teto_referencia=excluded.teto_referencia,conferida=true,documento_conferencia=excluded.documento_conferencia,conferida_por=uid,conferida_em=now();
  INSERT INTO public.sig_cotep_eventos(tipo,descricao,autor) VALUES('Base conferida',concat(v_ano,' UG ',v_ug,' ',v_cat,': ',v_doc),uid);
  RETURN jsonb_build_object('ok',true);
 END IF;
 IF ac='procedimento' THEN
  v_ano:=(p->>'ano')::integer;v_ug:=trim(p->>'unidade_gestora');v_cat:=nullif(p->>'categoria','');
  v_ramo:=nullif(trim(coalesce(p->>'ramo_atividade','')),'');
  v_situacao:=p->>'situacao';v_valor:=(p->>'valor_estimado')::numeric;
  IF v_ano NOT BETWEEN 2020 AND 2100 OR v_ug !~ '^[0-9]{5,9}$'
   OR coalesce(p->>'elemento_item','') !~ '^[0-9]{4}$'
   OR length(trim(coalesce(p->>'objeto','')))<8 OR length(trim(coalesce(p->>'numero','')))<1
   OR v_situacao NOT IN ('Em andamento','Finalizada','Fracassada','Cancelada')
   OR v_valor<0 OR (v_cat IS NOT NULL AND v_cat NOT IN ('geral','engenharia'))
  THEN RAISE EXCEPTION 'Campos do procedimento inválidos';END IF;
  IF v_situacao='Finalizada' AND nullif(p->>'valor_homologado','') IS NULL THEN
    RAISE EXCEPTION 'Informe o valor final homologado/negociado';END IF;
  INSERT INTO public.sig_cotep_procedimentos
  (ano,numero,unidade_gestora,elemento_item,ramo_atividade,categoria,objeto,situacao,valor_estimado,valor_homologado,documento,atualizado_por)
  VALUES(v_ano,trim(p->>'numero'),v_ug,trim(p->>'elemento_item'),v_ramo,v_cat,trim(p->>'objeto'),
   v_situacao,v_valor,nullif(p->>'valor_homologado','')::numeric,left(coalesce(p->>'documento',''),1000),uid)
  ON CONFLICT(ano,numero,unidade_gestora,elemento_item) DO UPDATE SET
   ramo_atividade=excluded.ramo_atividade,categoria=excluded.categoria,objeto=excluded.objeto,
   situacao=excluded.situacao,valor_estimado=excluded.valor_estimado,valor_homologado=excluded.valor_homologado,
   documento=excluded.documento,atualizado_por=uid,atualizado_em=now()
  RETURNING id INTO v_id;
  INSERT INTO public.sig_cotep_eventos(procedimento_id,tipo,descricao,autor)
  VALUES(v_id,'Procedimento',concat('COTEP ',trim(p->>'numero'),' ',v_situacao,' | valor homologado ',coalesce(p->>'valor_homologado','—')),uid);
  RETURN jsonb_build_object('id',v_id,'ok',true);
 END IF;
 IF ac='decidir' THEN
  v_id:=(p->>'id')::uuid;
  SELECT * INTO i FROM public.sig_cotep_intencoes WHERE id=v_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Intenção não localizada';END IF;
  v_situacao:=p->>'situacao';
  IF v_situacao NOT IN ('Reservada','Devolvida','Rejeitada','Cancelada','Finalizada') THEN RAISE EXCEPTION 'Decisão inválida';END IF;
  IF i.situacao IN ('Cancelada','Rejeitada','Finalizada') THEN RAISE EXCEPTION 'Intenção encerrada não pode ser modificada';END IF;
  IF v_situacao='Reservada' THEN
   v_ramo:=nullif(trim(coalesce(p->>'ramo_atividade','')),'');
   v_cat:=p->>'categoria';
   v_valor:=coalesce(nullif(p->>'valor_reservado','')::numeric,i.valor_estimado);
   IF i.situacao='Reservada' OR v_ramo IS NULL OR v_cat NOT IN ('geral','engenharia')
    OR v_valor<=0 OR v_valor>i.valor_estimado OR nullif(p->>'reserva_ate','') IS NULL
   THEN RAISE EXCEPTION 'Reserva exige ramo, categoria, valor e validade; não é possível duplicar a reserva';END IF;
   -- Exclusão mútua de aprovações para o mesmo ramo/UG/exercício.
   PERFORM pg_advisory_xact_lock(hashtextextended(concat(i.ano,'|',i.unidade_gestora,'|',v_cat,'|',lower(v_ramo)),0));
   SELECT teto_referencia INTO v_teto FROM public.sig_cotep_bases
    WHERE ano=i.ano AND unidade_gestora=i.unidade_gestora AND categoria=v_cat AND conferida=true FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'Base anual/UG não conferida pela DTS-1: não há saldo gerencial validado'; END IF;
   -- Sem classificações anteriores, não se presume segurança jurídica.
   IF EXISTS(SELECT 1 FROM public.sig_cotep_procedimentos x WHERE x.ano=i.ano AND x.unidade_gestora=i.unidade_gestora
     AND x.elemento_item=i.elemento_item AND x.situacao IN ('Em andamento','Finalizada') AND
     (x.ramo_atividade IS NULL OR x.categoria IS NULL))
   THEN RAISE EXCEPTION 'Há procedimentos desse elemento-item sem ramo/categoria: classifique-os antes de reservar';END IF;
   SELECT COALESCE(sum(CASE WHEN situacao='Finalizada' THEN valor_homologado ELSE valor_estimado END),0)
    INTO v_ocupado FROM public.sig_cotep_procedimentos
    WHERE ano=i.ano AND unidade_gestora=i.unidade_gestora AND categoria=v_cat AND lower(ramo_atividade)=lower(v_ramo)
     AND situacao IN ('Em andamento','Finalizada');
   SELECT v_ocupado+coalesce(sum(valor_reservado),0) INTO v_ocupado
    FROM public.sig_cotep_intencoes
    WHERE ano=i.ano AND unidade_gestora=i.unidade_gestora AND categoria=v_cat
     AND lower(ramo_atividade)=lower(v_ramo) AND situacao='Reservada';
   IF v_ocupado+v_valor>v_teto THEN
    RAISE EXCEPTION 'Saldo gerencial insuficiente: ocupado R$ %, solicitado R$ %, referência R$ %',v_ocupado,v_valor,v_teto;
   END IF;
   UPDATE public.sig_cotep_intencoes
    SET situacao='Reservada',ramo_atividade=v_ramo,categoria=v_cat,valor_reservado=v_valor,
    reserva_ate=(p->>'reserva_ate')::date,decidido_por=uid,observacao_gestor=left(coalesce(p->>'observacao',''),2000),atualizado_em=now()
    WHERE id=v_id;
  ELSIF v_situacao='Finalizada' THEN
   IF i.situacao<>'Reservada' OR nullif(trim(coalesce(p->>'cotep_numero','')),'') IS NULL OR NOT EXISTS (
     SELECT 1 FROM public.sig_cotep_procedimentos x
     WHERE x.ano=i.ano AND x.unidade_gestora=i.unidade_gestora AND x.elemento_item=i.elemento_item
       AND x.numero=trim(p->>'cotep_numero') AND x.situacao='Finalizada'
   ) THEN RAISE EXCEPTION 'Finalize somente após vincular COTEP finalizada e registrada no histórico';END IF;
   UPDATE public.sig_cotep_intencoes SET situacao='Finalizada',valor_reservado=0,
    cotep_numero=trim(p->>'cotep_numero'),observacao_gestor=left(coalesce(p->>'observacao',''),2000),
    decidido_por=uid,atualizado_em=now() WHERE id=v_id;
  ELSE
   UPDATE public.sig_cotep_intencoes SET situacao=v_situacao,valor_reservado=0,reserva_ate=NULL,
    observacao_gestor=left(coalesce(p->>'observacao',''),2000),decidido_por=uid,atualizado_em=now()
    WHERE id=v_id;
  END IF;
  INSERT INTO public.sig_cotep_eventos(intencao_id,tipo,descricao,autor)
   VALUES(v_id,v_situacao,coalesce(nullif(trim(p->>'observacao'),''),'Decisão registrada pela DTS-1'),uid);
  RETURN jsonb_build_object('ok',true,'situacao',v_situacao);
 END IF;
 RAISE EXCEPTION 'Ação desconhecida';
END $fn$;
REVOKE ALL ON FUNCTION public.sig_cotep_acao(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sig_cotep_acao(jsonb) TO authenticated;
COMMENT ON TABLE public.sig_cotep_intencoes IS 'Reservas internas de planejamento, sem efeito jurídico de empenho ou de saldo legal';
