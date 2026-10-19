-- SIG: snapshots de conciliação V6, atômicos e com acesso por perfil.
-- Não altera processos, empenhos operacionais nem dotações oficiais.
DROP POLICY IF EXISTS sig_planilha_v6_leitura ON public.sig_planilha_snapshots;
CREATE POLICY sig_planilha_v6_leitura ON public.sig_planilha_snapshots
FOR SELECT TO authenticated USING (
 aba IN ('SIG_V6_RESUMO','SIG_V6_DOTACOES','SIG_V6_ABATIMENTOS',
         'SIG_V6_ALERTAS','SIG_V6_CORRECOES_APROVADAS','SIG_V6_ALOCACOES_APROVADAS')
 AND private.can_view_cota()
);

CREATE OR REPLACE FUNCTION private.sig_br_centavos(valor text)
RETURNS bigint LANGUAGE plpgsql IMMUTABLE SET search_path TO '' AS $m$
DECLARE s text;
BEGIN
 s:=btrim(coalesce(valor,''));
 s:=regexp_replace(s,'^R\$\s*','','g');
 IF s !~ '^-?([0-9]{1,3}(\.[0-9]{3})+|[0-9]+)(,[0-9]{1,2})?$' THEN
   RAISE EXCEPTION 'Valor monetário brasileiro inválido no snapshot';
 END IF;
 RETURN (replace(replace(s,'.',''),',','.')::numeric * 100)::bigint;
END $m$;
REVOKE ALL ON FUNCTION private.sig_br_centavos(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.sig_planilha_importar_snapshot(p_documento jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $f$
DECLARE source_id constant text := '1dxzDySXU1h5BKJkW1_mHpNX9KRwgX6Ol5b_kRqeRrJA';
DECLARE sheets constant text[] := ARRAY[
 'CONTROLE_PROCESSOS_COMPRA','IMPORT_PROCESSOS_COMPRA',
 'IMPORT_PROCESSOS_HOMOLOGADOS','IMPORT_EXECUCAO_DESPESA_BO',
 'SALDO_ATUAL_DOTACOES_EMPENHOS','DASHBOARD',
 'SIG_V6_RESUMO','SIG_V6_DOTACOES','SIG_V6_ABATIMENTOS',
 'SIG_V6_ALERTAS','SIG_V6_CORRECOES_APROVADAS','SIG_V6_ALOCACOES_APROVADAS'
];
DECLARE uid uuid:=auth.uid();
DECLARE entry jsonb; header jsonb; records jsonb; kind text;
DECLARE geracao timestamptz; seen text[]:=ARRAY[]::text[];
DECLARE dash jsonb; resumo jsonb; dots jsonb; empenhos jsonb; alocacoes jsonb;
DECLARE cota bigint; gasto bigint; diferenca bigint; v6_gasto bigint; v6_cota bigint; v6_dif bigint;
DECLARE qtd_dot integer; qtd_emps integer; qtd_abatidos integer; qtd_global integer; qtd_especifica integer;
DECLARE esperado integer; cont integer; total_emp integer;
BEGIN
 IF uid IS NULL OR NOT EXISTS(
  SELECT 1 FROM public.usuarios u WHERE u.auth_id=uid AND u.ativo AND u.role='admin'
 ) THEN RAISE EXCEPTION 'Somente administradores ativos podem importar os dados'; END IF;
 IF p_documento IS NULL OR jsonb_typeof(p_documento)<>'object'
 OR p_documento->>'origem_id' IS DISTINCT FROM source_id
 OR p_documento->>'formato' IS DISTINCT FROM 'SIG_FONTE_ATUAL_V3' THEN
  RAISE EXCEPTION 'Use o exportador V3 da PLANILHA ATUAL (12 abas completas)'; END IF;
 IF jsonb_typeof(p_documento->'abas') IS DISTINCT FROM 'array' OR
    jsonb_array_length(p_documento->'abas')<>12 THEN
  RAISE EXCEPTION 'São necessárias as 12 abas da fonte e da conciliação V6'; END IF;
 IF octet_length(p_documento::text)>10000000 THEN
   RAISE EXCEPTION 'Arquivo JSON excede 10 MB'; END IF;
 BEGIN geracao:=(p_documento->>'gerado_em')::timestamptz;
 EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'Data de geração inválida'; END;
 IF geracao IS NULL OR geracao>now()+interval '15 minutes'
 OR geracao<now()-interval '30 days' THEN
   RAISE EXCEPTION 'Data de geração fora do período permitido'; END IF;
 FOR entry IN SELECT value FROM jsonb_array_elements(p_documento->'abas') LOOP
  kind:=entry->>'aba';header:=entry->'cabecalhos';records:=entry->'linhas';
  IF kind IS NULL OR NOT kind=ANY(sheets) OR kind=ANY(seen) THEN
    RAISE EXCEPTION 'Aba desconhecida/duplicada: %',coalesce(kind,'—'); END IF;
  seen:=array_append(seen,kind);
  IF jsonb_typeof(header) IS DISTINCT FROM 'array'
  OR jsonb_typeof(records) IS DISTINCT FROM 'array'
  OR jsonb_array_length(header)<1 OR jsonb_array_length(header)>60
  OR jsonb_array_length(records)>3000 THEN
    RAISE EXCEPTION 'Limites/cabeçalhos inválidos na aba %',kind; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(records) x WHERE
       jsonb_typeof(x) IS DISTINCT FROM 'array'
       OR jsonb_array_length(x)>60) THEN
    RAISE EXCEPTION 'Linha inválida na aba %',kind; END IF;
  IF kind='DASHBOARD' THEN
    IF NOT(header @> '["Dotacao","Total_Repassado_Dotacao","TOTAL_EMPENHADO","Saldo_A_Destinar"]'::jsonb)
       OR (header->>0)<>'Dotacao' OR (header->>1)<>'Total_Repassado_Dotacao'
       OR (header->>2)<>'TOTAL_EMPENHADO' OR (header->>3)<>'Saldo_A_Destinar' THEN
      RAISE EXCEPTION 'Cabeçalhos ou ordem inesperada no DASHBOARD'; END IF;
    dash:=records;
  ELSIF kind='SIG_V6_RESUMO' THEN
    IF header->>0<>'Indicador' OR header->>1<>'Valor' THEN RAISE EXCEPTION 'Resumo V6 inválido'; END IF;
    resumo:=records;
  ELSIF kind='SIG_V6_DOTACOES' THEN
    IF header->>0<>'Dotação' OR header->>6<>'Documentos' OR header->>12<>'Abatido gerencial (R$)'
      OR header->>13<>'Diferença gerencial NÃO OFICIAL (R$)' THEN
      RAISE EXCEPTION 'Estrutura das dotações V6 inválida'; END IF;
    dots:=records;
  ELSIF kind='SIG_V6_ABATIMENTOS' THEN
    IF header->>0<>'Chave empenho' OR header->>5<>'Dotação utilizada para abate'
      OR header->>6<>'Valor líquido empenhado (R$)' OR header->>7<>'Resultado' THEN
      RAISE EXCEPTION 'Estrutura de abatimentos V6 inválida'; END IF;
    empenhos:=records;
  ELSIF kind='SIG_V6_ALOCACOES_APROVADAS' THEN
    IF header->>0<>'Chave_Empenho' OR header->>6<>'Status' THEN
      RAISE EXCEPTION 'Estrutura das alocações manuais inválida'; END IF;
    alocacoes:=records;
  END IF;
 END LOOP;
 IF array_length(seen,1)<>12 OR dash IS NULL OR resumo IS NULL
 OR dots IS NULL OR empenhos IS NULL OR alocacoes IS NULL THEN
   RAISE EXCEPTION 'Relatórios completos não foram informados'; END IF;
 SELECT count(*), sum(private.sig_br_centavos(r->>1)),
        sum(private.sig_br_centavos(r->>2)), sum(private.sig_br_centavos(r->>3))
 INTO qtd_dot,cota,gasto,diferenca
 FROM jsonb_array_elements(dash) AS r;
 IF qtd_dot=0 OR cota IS NULL OR gasto IS NULL OR diferenca IS NULL
 OR cota-gasto<>diferenca THEN RAISE EXCEPTION 'Totais do DASHBOARD divergentes'; END IF;
 SELECT count(*) FILTER (WHERE (r->>6)::int>0),
        sum(private.sig_br_centavos(r->>1)) FILTER(WHERE (r->>6)::int>0),
        sum(private.sig_br_centavos(r->>12)) FILTER(WHERE (r->>6)::int>0),
        sum(private.sig_br_centavos(r->>13)) FILTER(WHERE (r->>6)::int>0)
 INTO cont,v6_cota,v6_gasto,v6_dif
 FROM jsonb_array_elements(dots) AS r;
 IF qtd_dot<>cont OR cota<>v6_cota OR gasto<>v6_gasto OR diferenca<>v6_dif THEN
   RAISE EXCEPTION 'Dotações da V6 divergem do DASHBOARD'; END IF;
 SELECT count(*),count(*) FILTER (WHERE r->>7 IN ('ABATIDO_GLOBAL','ABATIDO_ESPECIFICA')),
        count(*) FILTER (WHERE r->>7='ABATIDO_GLOBAL'),
        count(*) FILTER (WHERE r->>7='ABATIDO_ESPECIFICA')
 INTO qtd_emps,qtd_abatidos,qtd_global,qtd_especifica
 FROM jsonb_array_elements(empenhos) AS r;
 IF qtd_emps=0 OR EXISTS(
     SELECT 1 FROM jsonb_array_elements(empenhos) r
     GROUP BY r->>0 HAVING count(*)<>1 OR r->>0=''
   ) OR EXISTS(
      SELECT 1 FROM jsonb_array_elements(empenhos) r
      WHERE (r->>7 IN ('ABATIDO_GLOBAL','ABATIDO_ESPECIFICA'))<>(coalesce(r->>5,'')<>'')
   ) THEN RAISE EXCEPTION 'Duplicidade ou classificação de empenho inconsistente'; END IF;
 SELECT (r->>1)::integer INTO total_emp FROM jsonb_array_elements(resumo) r WHERE r->>0='Empenhos no índice';
 SELECT (r->>1)::integer INTO esperado FROM jsonb_array_elements(resumo) r WHERE r->>0='Empenhos atribuídos segundo regra V6';
 IF total_emp IS DISTINCT FROM qtd_emps OR esperado IS DISTINCT FROM qtd_abatidos THEN
   RAISE EXCEPTION 'Quantidade de empenhos diverge da conciliação'; END IF;
 SELECT (r->>1)::integer INTO esperado FROM jsonb_array_elements(resumo) r WHERE r->>0='Empenhos na global';
 IF esperado IS DISTINCT FROM qtd_global THEN RAISE EXCEPTION 'Global V6 divergente'; END IF;
 SELECT (r->>1)::integer INTO esperado FROM jsonb_array_elements(resumo) r WHERE r->>0='Empenhos na específica';
 IF esperado IS DISTINCT FROM qtd_especifica THEN RAISE EXCEPTION 'Específica V6 divergente'; END IF;
 SELECT private.sig_br_centavos(r->>1) INTO v6_gasto FROM jsonb_array_elements(resumo) r WHERE r->>0='Abatimento gerencial (R$)';
 IF v6_gasto IS DISTINCT FROM gasto THEN RAISE EXCEPTION 'Total abatido divergente do resumo V6'; END IF;
 IF EXISTS (SELECT 1 FROM jsonb_array_elements(alocacoes) a WHERE a->>6='APROVADO'
   AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(empenhos) e
     WHERE e->>0=a->>0 AND e->>7 IN ('ABATIDO_GLOBAL','ABATIDO_ESPECIFICA'))) THEN
   RAISE EXCEPTION 'Alocação aprovada sem empenho abatido correspondente'; END IF;
 -- Gravação transacional: somente após todas as verificações do lote completo.
 FOR entry IN SELECT value FROM jsonb_array_elements(p_documento->'abas') LOOP
   kind:=entry->>'aba';header:=entry->'cabecalhos';records:=entry->'linhas';
   INSERT INTO public.sig_planilha_snapshots
     (aba,origem_id,cabecalhos,linhas,quantidade,gerado_em,importado_em,importado_por)
   VALUES(kind,source_id,header,records,jsonb_array_length(records),geracao,now(),uid)
   ON CONFLICT(aba) DO UPDATE SET origem_id=excluded.origem_id,
     cabecalhos=excluded.cabecalhos,linhas=excluded.linhas,quantidade=excluded.quantidade,
     gerado_em=excluded.gerado_em,importado_em=excluded.importado_em,importado_por=excluded.importado_por;
 END LOOP;
 RETURN jsonb_build_object('abas',12,'origem_id',source_id,'gerado_em',geracao,
    'dotacoes',qtd_dot,'empenhos',qtd_emps,'abatidos',qtd_abatidos,'cota_centavos',cota,
    'abatimento_centavos',gasto,'diferenca_centavos',diferenca);
END $f$;
REVOKE ALL ON FUNCTION public.sig_planilha_importar_snapshot(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sig_planilha_importar_snapshot(jsonb) TO authenticated;