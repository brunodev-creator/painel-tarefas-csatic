-- Permite preservar resultados historicos ainda não comprovados como homologados.
ALTER TABLE public.sig_cotep_procedimentos ALTER COLUMN elemento_item DROP NOT NULL;
ALTER TABLE public.sig_cotep_procedimentos DROP CONSTRAINT IF EXISTS sig_cotep_procedimentos_situacao_check;
ALTER TABLE public.sig_cotep_procedimentos ADD CONSTRAINT sig_cotep_procedimentos_situacao_check CHECK (situacao IN ('Em andamento','Finalizada','Fracassada','Cancelada','Realizada (a conferir)'));
ALTER TABLE public.sig_cotep_procedimentos ADD CONSTRAINT sig_cotep_procedimentos_sem_elemento_check CHECK (elemento_item IS NOT NULL OR (situacao='Fracassada' AND valor_estimado=0 AND valor_homologado IS NULL));
CREATE UNIQUE INDEX IF NOT EXISTS sig_cotep_sem_elemento_unico ON public.sig_cotep_procedimentos(ano,numero,unidade_gestora) WHERE elemento_item IS NULL;
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
   OR (coalesce(p->>'elemento_item','') !~ '^[0-9]{4}$' AND NOT (v_situacao='Fracassada' AND nullif(trim(coalesce(p->>'elemento_item','')),'') IS NULL))
   OR length(trim(coalesce(p->>'objeto','')))<8 OR length(trim(coalesce(p->>'numero','')))<1
   OR v_situacao NOT IN ('Em andamento','Finalizada','Fracassada','Cancelada','Realizada (a conferir)')
   OR v_valor<0 OR (v_cat IS NOT NULL AND v_cat NOT IN ('geral','engenharia'))
  THEN RAISE EXCEPTION 'Campos do procedimento inválidos';END IF;
  IF v_situacao='Finalizada' AND nullif(p->>'valor_homologado','') IS NULL THEN
    RAISE EXCEPTION 'Informe o valor final homologado/negociado';END IF;
  INSERT INTO public.sig_cotep_procedimentos
  (ano,numero,unidade_gestora,elemento_item,ramo_atividade,categoria,objeto,situacao,valor_estimado,valor_homologado,documento,atualizado_por)
  VALUES(v_ano,trim(p->>'numero'),v_ug,nullif(trim(coalesce(p->>'elemento_item','')),''),v_ramo,v_cat,trim(p->>'objeto'),
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
     AND x.situacao IN ('Em andamento','Finalizada','Realizada (a conferir)') AND
     (x.situacao='Realizada (a conferir)' OR x.ramo_atividade IS NULL OR x.categoria IS NULL))
   THEN RAISE EXCEPTION 'Há procedimentos históricos da UG/ano ainda sem homologação ou ramo/categoria conferidos: concilie antes de reservar';END IF;
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
