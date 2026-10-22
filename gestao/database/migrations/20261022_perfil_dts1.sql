-- Perfil DTS-1: gestão das Intenções de COTEP + consulta de Almoxarifado, Cota orçamentária
-- e Acompanhar seções. Quem tem o perfil é gestor COTEP automaticamente (sem delegação manual).
ALTER TABLE public.usuarios DROP CONSTRAINT IF EXISTS usuarios_role_check;
ALTER TABLE public.usuarios ADD CONSTRAINT usuarios_role_check CHECK (role = ANY (ARRAY['admin','chefia','compras','licitacao','sofi','leitura',
 'chefe_compras','chefe_licitacao','chefe_sofi','dts1']));
ALTER TABLE public.usuarios ADD CONSTRAINT usuarios_dts1_setor_check CHECK (role <> 'dts1' OR setor = 'DTS-1');

-- Cota orçamentária e Almoxarifado (sig_almox_destinacoes) usam a mesma regra de leitura.
CREATE OR REPLACE FUNCTION private.can_view_cota() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $function$
 SELECT EXISTS (
  SELECT 1 FROM public.usuarios u
   WHERE u.auth_id=auth.uid() AND u.ativo
     AND u.role IN ('admin','chefia','sofi','chefe_sofi','compras','licitacao','chefe_compras','chefe_licitacao','dts1')
 );
$function$;

CREATE OR REPLACE FUNCTION private.sig_cotep_gestor() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $f$ SELECT private.sig_cotep_admin()
 OR EXISTS(SELECT 1 FROM public.usuarios u WHERE u.auth_id=auth.uid() AND u.ativo AND u.role='dts1')
 OR EXISTS(SELECT 1 FROM public.sig_cotep_gestores g JOIN public.usuarios u ON u.auth_id=g.auth_id WHERE g.auth_id=auth.uid() AND g.ativo AND u.ativo); $f$;
