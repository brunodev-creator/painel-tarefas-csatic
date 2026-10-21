-- Simulação mínima do ambiente Supabase para testar as migrations COTEP em PostgreSQL local (>=15).
-- NÃO aplicar no Supabase: auth, roles e usuarios já existem lá.
DO $$BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
END$$;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS private;
GRANT USAGE ON SCHEMA public, private, auth TO anon, authenticated;
CREATE TABLE IF NOT EXISTS auth.users(id uuid PRIMARY KEY);
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated;
CREATE TABLE IF NOT EXISTS public.usuarios(
 auth_id uuid PRIMARY KEY REFERENCES auth.users(id), nome text NOT NULL, email text,
 setor text, role text NOT NULL DEFAULT 'leitura', ativo boolean NOT NULL DEFAULT true);
CREATE TABLE IF NOT EXISTS public.processos(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), numero text, objeto text, modalidade text);
ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.usuarios TO authenticated;
CREATE POLICY usuarios_ler ON public.usuarios FOR SELECT TO authenticated USING(true);
