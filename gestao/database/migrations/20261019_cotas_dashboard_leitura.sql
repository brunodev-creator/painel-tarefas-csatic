-- Acesso ao espelho DASHBOARD de cotas: somente perfis explicitamente autorizados.
-- Demais snapshots continuam exclusivos a perfis financeiros.
CREATE OR REPLACE FUNCTION private.can_view_cota()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $c$
 SELECT EXISTS (
  SELECT 1 FROM public.usuarios u
   WHERE u.auth_id=auth.uid() AND u.ativo
     AND u.role IN ('admin','chefia','sofi','chefe_sofi','compras','licitacao','chefe_compras','chefe_licitacao')
 );
$c$;
REVOKE ALL ON FUNCTION private.can_view_cota() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.can_view_cota() TO authenticated;
DROP POLICY IF EXISTS sig_planilha_dashboard_leitura ON public.sig_planilha_snapshots;
CREATE POLICY sig_planilha_dashboard_leitura
 ON public.sig_planilha_snapshots FOR SELECT TO authenticated
 USING (aba='DASHBOARD' AND private.can_view_cota());

-- Seis abas, incluindo o DASHBOARD A8:V. Somente administradores ativos importam.
CREATE OR REPLACE FUNCTION public.sig_planilha_importar_snapshot(p_documento jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $f$
DECLARE source_id constant text := '1dxzDySXU1h5BKJkW1_mHpNX9KRwgX6Ol5b_kRqeRrJA';
DECLARE sheets constant text[] := ARRAY[
 'CONTROLE_PROCESSOS_COMPRA','IMPORT_PROCESSOS_COMPRA',
 'IMPORT_PROCESSOS_HOMOLOGADOS','IMPORT_EXECUCAO_DESPESA_BO',
 'SALDO_ATUAL_DOTACOES_EMPENHOS','DASHBOARD'];
DECLARE uid uuid:=auth.uid();
DECLARE entry jsonb; header jsonb; records jsonb;
DECLARE kind text; generated timestamptz;
DECLARE n integer; seen text[]:=ARRAY[]::text[];
BEGIN
 IF uid IS NULL OR NOT EXISTS(
  SELECT 1 FROM public.usuarios u WHERE u.auth_id=uid
   AND u.ativo AND u.role='admin'
 ) THEN RAISE EXCEPTION 'Somente administradores ativos podem importar os dados da planilha'; END IF;
 IF p_documento IS NULL OR jsonb_typeof(p_documento)<>'object' OR
  p_documento->>'origem_id' IS DISTINCT FROM source_id OR
  p_documento->>'formato' IS DISTINCT FROM 'SIG_FONTE_ATUAL_V2' THEN
  RAISE EXCEPTION 'Identificador da planilha incompatível com a fonte oficial'; END IF;
 IF jsonb_typeof(p_documento->'abas')<>'array' OR
  jsonb_array_length(p_documento->'abas')<>6 THEN
  RAISE EXCEPTION 'O arquivo deve incluir exatamente as seis abas configuradas'; END IF;
 IF octet_length(p_documento::text)>10000000 THEN
  RAISE EXCEPTION 'Arquivo JSON excede o limite de 10 MB'; END IF;
 BEGIN generated:=(p_documento->>'gerado_em')::timestamptz;
 EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION 'Data de geração inválida'; END;
 IF generated IS NULL OR generated>now()+interval '15 minutes' OR
  generated<now()-interval '30 days' THEN RAISE EXCEPTION 'Data do arquivo fora do período permitido'; END IF;
 FOR entry IN SELECT value FROM jsonb_array_elements(p_documento->'abas') LOOP
  kind:=entry->>'aba';header:=entry->'cabecalhos';records:=entry->'linhas';
  IF kind IS NULL OR NOT kind=ANY(sheets) OR kind=ANY(seen) THEN
    RAISE EXCEPTION 'Aba inválida ou duplicada no arquivo: %',coalesce(kind,'—'); END IF;
  seen:=array_append(seen,kind);
  IF jsonb_typeof(header)<>'array' OR jsonb_typeof(records)<>'array' OR
    jsonb_array_length(header)<1 OR jsonb_array_length(header)>60 OR
    jsonb_array_length(records)>3000 THEN
    RAISE EXCEPTION 'Estrutura inválida ou dados acima do limite na aba %',kind; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(records) x
     WHERE jsonb_typeof(x)<>'array' OR jsonb_array_length(x)>60) THEN
    RAISE EXCEPTION 'Linha inválida na aba %',kind; END IF;
  IF kind='DASHBOARD' AND NOT (header @> '["Dotacao","Total_Repassado_Dotacao","TOTAL_EMPENHADO","Saldo_A_Destinar"]'::jsonb) THEN
    RAISE EXCEPTION 'Cabeçalhos obrigatórios ausentes no DASHBOARD'; END IF;
  n:=jsonb_array_length(records);
  INSERT INTO public.sig_planilha_snapshots
   (aba,origem_id,cabecalhos,linhas,quantidade,gerado_em,importado_em,importado_por)
  VALUES(kind,source_id,header,records,n,generated,now(),uid)
  ON CONFLICT(aba) DO UPDATE
   SET origem_id=excluded.origem_id,cabecalhos=excluded.cabecalhos,
    linhas=excluded.linhas,quantidade=excluded.quantidade,
    gerado_em=excluded.gerado_em,importado_em=excluded.importado_em,
    importado_por=excluded.importado_por;
 END LOOP;
 RETURN jsonb_build_object('abas',6,'origem_id',source_id,'gerado_em',generated);
END $f$;
