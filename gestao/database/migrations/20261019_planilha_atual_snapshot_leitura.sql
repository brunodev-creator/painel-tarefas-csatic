-- SIG CSA-TIC: espelho financeiro/processual SOMENTE LEITURA da PLANILHA ATUAL.
-- Não modifica public.processos, tarefas, empenhos, aipc nem contratos.
CREATE TABLE IF NOT EXISTS public.sig_planilha_snapshots (
 aba text PRIMARY KEY,
 origem_id text NOT NULL,
 cabecalhos jsonb NOT NULL CHECK (jsonb_typeof(cabecalhos)='array'),
 linhas jsonb NOT NULL CHECK (jsonb_typeof(linhas)='array'),
 quantidade integer NOT NULL CHECK(quantidade>=0 AND quantidade<=3000),
 gerado_em timestamptz NOT NULL,
 importado_em timestamptz NOT NULL DEFAULT now(),
 importado_por uuid
);
CREATE INDEX IF NOT EXISTS sig_planilha_snapshots_importado_idx
 ON public.sig_planilha_snapshots(importado_em DESC);
ALTER TABLE public.sig_planilha_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sig_planilha_snapshots FROM PUBLIC,anon;
GRANT SELECT ON public.sig_planilha_snapshots TO authenticated;
DROP POLICY IF EXISTS sig_planilha_snapshots_leitura ON public.sig_planilha_snapshots;
CREATE POLICY sig_planilha_snapshots_leitura ON public.sig_planilha_snapshots
 FOR SELECT TO authenticated USING(private.is_active() AND private.can_finance());

CREATE OR REPLACE FUNCTION public.sig_planilha_importar_snapshot(p_documento jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $f$
DECLARE source_id constant text := '1dxzDySXU1h5BKJkW1_mHpNX9KRwgX6Ol5b_kRqeRrJA';
DECLARE sheets constant text[] := ARRAY[
 'CONTROLE_PROCESSOS_COMPRA','IMPORT_PROCESSOS_COMPRA',
 'IMPORT_PROCESSOS_HOMOLOGADOS','IMPORT_EXECUCAO_DESPESA_BO',
 'SALDO_ATUAL_DOTACOES_EMPENHOS'];
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
  p_documento->>'origem_id' IS DISTINCT FROM source_id THEN
  RAISE EXCEPTION 'Identificador da planilha incompatível com a fonte oficial'; END IF;
 IF jsonb_typeof(p_documento->'abas')<>'array' OR
  jsonb_array_length(p_documento->'abas')<>5 THEN
  RAISE EXCEPTION 'O arquivo deve incluir exatamente as cinco abas configuradas'; END IF;
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
 RETURN jsonb_build_object('abas',5,'origem_id',source_id,'gerado_em',generated);
END $f$;
REVOKE ALL ON FUNCTION public.sig_planilha_importar_snapshot(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sig_planilha_importar_snapshot(jsonb) TO authenticated;
COMMENT ON TABLE public.sig_planilha_snapshots IS
 'Snapshot SOMENTE CONSULTA: fonte oficial agora vai - PLANILHA ATUAL. Não integra/processa registros operacionais do SIG.';
