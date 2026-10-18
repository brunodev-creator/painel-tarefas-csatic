-- SIG Online: AIPC em rascunho (sem número) e finalização explícita.
-- Preserva AIPC existentes como 'pronta'; nenhuma exclusão de documentos.
ALTER TABLE public.aipc
 DROP CONSTRAINT IF EXISTS aipc_numero_processo_compras_check;
ALTER TABLE public.aipc ALTER COLUMN numero_processo_compras DROP NOT NULL;
ALTER TABLE public.aipc
 ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'rascunho';
UPDATE public.aipc SET status='pronta'
 WHERE nullif(btrim(coalesce(numero_processo_compras,'')),'') IS NOT NULL
   AND status='rascunho';
ALTER TABLE public.aipc
 ADD CONSTRAINT aipc_status_valido_check CHECK (status IN ('rascunho','pronta'));
ALTER TABLE public.aipc
 ADD CONSTRAINT aipc_pronta_com_numero_check CHECK (
  status <> 'pronta' OR nullif(btrim(coalesce(numero_processo_compras,'')),'') IS NOT NULL
 );

CREATE OR REPLACE FUNCTION private.aipc_set_auditoria()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $f$
BEGIN
 NEW.numero_processo_compras:=nullif(btrim(coalesce(NEW.numero_processo_compras,'')),'');
 IF NEW.status='pronta' AND NEW.numero_processo_compras IS NULL THEN
  RAISE EXCEPTION 'Informe o número do Processo de Compras para finalizar a AIPC';
 END IF;
 IF TG_OP='INSERT' THEN
  NEW.criado_por:=auth.uid();
  NEW.criado_em:=now();
 END IF;
 NEW.atualizado_por:=auth.uid();
 NEW.atualizado_em:=now();
 RETURN NEW;
END $f$;

-- Salva um rascunho incompleto ou finaliza de maneira atômica. O retorno
-- confirma o salvamento para que o cliente possa mostrar o horário real.
CREATE OR REPLACE FUNCTION public.salvar_aipc(
 p_processo_id uuid,
 p_numero text,
 p_dados jsonb,
 p_finalizar boolean DEFAULT false
) RETURNS public.aipc
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $f$
DECLARE item public.aipc%rowtype;
DECLARE processo_setor text;
DECLARE num text := nullif(btrim(coalesce(p_numero,'')),'');
DECLARE situação text;
BEGIN
 IF auth.uid() IS NULL OR NOT private.is_active() THEN
  RAISE EXCEPTION 'Sessão não autorizada';
 END IF;
 SELECT p.setor INTO processo_setor
 FROM public.processos p WHERE p.id=p_processo_id FOR SHARE;
 IF NOT FOUND OR NOT private.can_edit(processo_setor) THEN
  RAISE EXCEPTION 'Sem permissão para editar AIPC nesta seção';
 END IF;
 IF p_dados IS NULL OR jsonb_typeof(p_dados)<>'object' THEN
  RAISE EXCEPTION 'Dados da AIPC inválidos';
 END IF;
 IF char_length(coalesce(num,''))>120 THEN
  RAISE EXCEPTION 'Número do Processo de Compras maior que 120 caracteres';
 END IF;
 IF p_finalizar AND num IS NULL THEN
  RAISE EXCEPTION 'Informe o Número do Processo de Compras para finalizar a AIPC';
 END IF;
 SELECT a.* INTO item FROM public.aipc a
 WHERE a.processo_id=p_processo_id FOR UPDATE;
 situação:=CASE
  WHEN p_finalizar THEN 'pronta'
  WHEN FOUND AND item.status='pronta' AND num IS NOT NULL THEN 'pronta'
  ELSE 'rascunho' END;
 INSERT INTO public.aipc (processo_id,numero_processo_compras,dados,status)
 VALUES (p_processo_id,num,p_dados,situação)
 ON CONFLICT (processo_id) DO UPDATE
 SET numero_processo_compras=EXCLUDED.numero_processo_compras,
     dados=EXCLUDED.dados,
     status=EXCLUDED.status
 RETURNING * INTO item;
 RETURN item;
END $f$;

REVOKE ALL ON FUNCTION public.salvar_aipc(uuid,text,jsonb,boolean)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.salvar_aipc(uuid,text,jsonb,boolean)
 TO authenticated;

-- Somente AIPC FINALIZADA libera encaminhamento das modalidades pertinentes.
CREATE OR REPLACE FUNCTION private.aipc_bloquear_envio_incompleto()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $f$
DECLARE modalidade text;
BEGIN
 IF NEW.setor IS NOT DISTINCT FROM OLD.setor THEN RETURN NEW; END IF;
 modalidade := lower(btrim(coalesce(nullif(OLD.tipo_servico,''),OLD.modalidade,'')));
 IF modalidade IN (
  'cotep','pregão','pregao','registro de preço','registro de preco',
  'adesão arp','adesao arp','registro de preços','registro de precos'
 ) AND NOT EXISTS (
  SELECT 1 FROM public.aipc a
  WHERE a.processo_id=OLD.id AND a.status='pronta'
    AND nullif(btrim(coalesce(a.numero_processo_compras,'')),'') IS NOT NULL
 ) THEN
  RAISE EXCEPTION 'Finalize a AIPC com o Número do Processo de Compras antes de encaminhar esta aquisição';
 END IF;
 RETURN NEW;
END $f$;
