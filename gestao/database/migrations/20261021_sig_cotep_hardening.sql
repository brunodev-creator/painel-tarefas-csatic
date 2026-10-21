-- Endurecimento de leitura de gestores e serialização da inclusão de procedimentos.
DROP POLICY IF EXISTS sig_cotep_gestores_ler ON public.sig_cotep_gestores;
CREATE POLICY sig_cotep_gestores_ler ON public.sig_cotep_gestores
 FOR SELECT TO authenticated USING(
   private.sig_cotep_ativo() AND (auth_id=auth.uid() OR private.sig_cotep_admin())
 );
CREATE OR REPLACE FUNCTION private.sig_cotep_serializar_procedimento()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $fn$
BEGIN
 IF NEW.ramo_atividade IS NOT NULL AND NEW.categoria IS NOT NULL THEN
  PERFORM pg_advisory_xact_lock(hashtextextended(concat(
   NEW.ano,'|',NEW.unidade_gestora,'|',NEW.categoria,'|',lower(NEW.ramo_atividade)
  ),0));
 END IF;
 RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS sig_cotep_procedimento_lock ON public.sig_cotep_procedimentos;
CREATE TRIGGER sig_cotep_procedimento_lock BEFORE INSERT OR UPDATE ON public.sig_cotep_procedimentos
 FOR EACH ROW EXECUTE FUNCTION private.sig_cotep_serializar_procedimento();
REVOKE ALL ON FUNCTION private.sig_cotep_serializar_procedimento() FROM PUBLIC, anon, authenticated;
-- Todos os lançamentos exigem a RPC. Negamos escrita direta, inclusive em sequências.
REVOKE ALL ON SEQUENCE public.sig_cotep_eventos_id_seq FROM PUBLIC, anon, authenticated;
