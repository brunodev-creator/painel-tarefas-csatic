-- Textos curtos aceitos (migration 20261022_sig_cotep_sem_minimo_caracteres.sql); vazio continua recusado.
\set ON_ERROR_STOP 1
UPDATE public.sig_cotep_acesso_publico SET ativo = true, codigo_hash = NULL;
SET ROLE anon;
SELECT (public.sig_cotep_publico_intencao('{"centro":"D","objeto":"Teste","elemento_item":"3017","valor_estimado":"1000","justificativa":"x","solicitante_nome":"T","solicitante_contato":"T"}')->>'id') AS curto \gset
DO $$BEGIN PERFORM public.sig_cotep_publico_intencao('{"centro":"D","objeto":"  ","elemento_item":"3017","valor_estimado":"10","justificativa":"x","solicitante_nome":"T","solicitante_contato":"T"}');
 RAISE EXCEPTION 'FALHOU: objeto vazio aceito'; EXCEPTION WHEN raise_exception THEN IF SQLERRM ~ 'FALHOU' THEN RAISE; END IF; RAISE NOTICE 'PASS  Objeto vazio continua recusado'; END$$;
RESET ROLE;
SELECT teste.ok((SELECT objeto = 'Teste' AND situacao = 'Pendente' FROM public.sig_cotep_intencoes WHERE id = :'curto'), 'Visitante registra objeto curto («Teste»)');
SET ROLE authenticated;
SELECT teste.como('00000000-0000-0000-0000-0000000000e1');
SELECT teste.ok((teste.acao('{"acao":"criar_intencao","centro":"D","objeto":"TV","elemento_item":"3024","valor_estimado":"10","justificativa":"x"}')->>'id') IS NOT NULL, 'Usuário registra objeto e justificativa curtos');
SELECT teste.acao(jsonb_build_object('acao','devolver','id',:'curto','motivo','ok'));
SELECT teste.ok((SELECT situacao FROM public.sig_cotep_intencoes WHERE id = :'curto') = 'Devolvida', 'Motivo curto aceito na devolução');
SELECT teste.ok((teste.acao('{"acao":"salvar_cotep","ano":2026,"unidade_gestora":"1250071","numero":"960/2026","objeto":"Cabo","situacao":"Em andamento","itens":[{"elemento_item":"3024","valor_estimado":"5"}]}')->>'id') IS NOT NULL, 'COTEP com objeto curto');
RESET ROLE;
\echo 'TESTES SEM MÍNIMO DE CARACTERES PASSARAM'
