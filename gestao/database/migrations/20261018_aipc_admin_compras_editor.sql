-- Administrador lotado na Compras mantém edição do documento de sua seção;
-- administrador lotado fora da Compras permanece sem essa permissão.
CREATE OR REPLACE FUNCTION private.aipc_pode_editar()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $f$
 SELECT EXISTS(SELECT 1 FROM public.usuarios u WHERE u.auth_id=auth.uid()
  AND u.ativo AND u.setor='Compras'
  AND u.role IN ('admin','compras','chefe_compras','chefia'));
$f$;
