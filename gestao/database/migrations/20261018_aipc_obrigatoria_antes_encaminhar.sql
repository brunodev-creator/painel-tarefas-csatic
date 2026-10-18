-- AIPC - Autorizacao de Instauracao de Processo de Compras
-- Origem: formulario institucional PMMG / CSA-TIC. Os campos adicionais sao opcionais;
-- numero do Processo de Compras e o unico campo obrigatorio da AIPC.
CREATE TABLE IF NOT EXISTS public.aipc (
 processo_id uuid PRIMARY KEY REFERENCES public.processos(id) ON DELETE CASCADE,
 numero_processo_compras text NOT NULL CHECK (length(btrim(numero_processo_compras)) > 0),
 dados jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(dados)='object'),
 criado_por uuid NOT NULL DEFAULT auth.uid(),
 atualizado_por uuid NOT NULL DEFAULT auth.uid(),
 criado_em timestamptz NOT NULL DEFAULT now(),
 atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_aipc_numero_processo ON public.aipc (numero_processo_compras);
ALTER TABLE public.aipc ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON public.aipc TO authenticated;
GRANT UPDATE (numero_processo_compras,dados) ON public.aipc TO authenticated;
REVOKE ALL ON public.aipc FROM anon;
CREATE OR REPLACE FUNCTION private.aipc_set_auditoria()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $f$
BEGIN
 NEW.numero_processo_compras := btrim(NEW.numero_processo_compras);
 IF length(NEW.numero_processo_compras)=0 THEN RAISE EXCEPTION 'Informe o número do Processo de Compras da AIPC'; END IF;
 IF TG_OP='INSERT' THEN
  NEW.criado_por := auth.uid();
  NEW.criado_em := now();
 END IF;
 NEW.atualizado_por := auth.uid();
 NEW.atualizado_em := now();
 RETURN NEW;
END $f$;
CREATE TRIGGER aipc_set_auditoria BEFORE INSERT OR UPDATE ON public.aipc
 FOR EACH ROW EXECUTE FUNCTION private.aipc_set_auditoria();
CREATE POLICY aipc_ler_setor ON public.aipc FOR SELECT TO authenticated
 USING (private.can_edit((SELECT p.setor FROM public.processos p WHERE p.id=processo_id)));
CREATE POLICY aipc_criar_setor ON public.aipc FOR INSERT TO authenticated
 WITH CHECK (private.can_edit((SELECT p.setor FROM public.processos p WHERE p.id=processo_id)));
CREATE POLICY aipc_editar_setor ON public.aipc FOR UPDATE TO authenticated
 USING (private.can_edit((SELECT p.setor FROM public.processos p WHERE p.id=processo_id)))
 WITH CHECK (private.can_edit((SELECT p.setor FROM public.processos p WHERE p.id=processo_id)));

-- Validacao no banco, inclusive se o cliente tentar burlar a interface.
-- AIPC e requerida SOMENTE nas modalidades Pregao, Registro de Preco e COTEP.
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
  SELECT 1 FROM public.aipc a WHERE a.processo_id=OLD.id
   AND length(btrim(a.numero_processo_compras))>0
 ) THEN
  RAISE EXCEPTION 'Antes de encaminhar esta aquisição, preencha e salve a AIPC com o número do Processo de Compras';
 END IF;
 RETURN NEW;
END $f$;
CREATE TRIGGER aipc_exigir_antes_tramitar
 BEFORE UPDATE OF setor ON public.processos
 FOR EACH ROW EXECUTE FUNCTION private.aipc_bloquear_envio_incompleto();
