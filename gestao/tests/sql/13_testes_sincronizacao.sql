-- Sincronização diária com a PLANILHA ATUAL (migration 20261022_sig_cotep_sincronizacao_portal.sql).
\set ON_ERROR_STOP 1
INSERT INTO public.sig_cotep_coteps (ano, unidade_gestora, numero, objeto, situacao) VALUES
 (2026,'1250071','950/2026','Sincronização: COTEP em andamento','Em andamento'),
 (2026,'1250071','953/2026','Sincronização: COTEP para estourar o limite','Em andamento');
INSERT INTO public.sig_cotep_procedimentos (cotep_id, ano, numero, unidade_gestora, elemento_item, objeto, situacao, valor_estimado)
SELECT id, ano, numero, unidade_gestora, '3024', objeto, situacao, 1000 FROM public.sig_cotep_coteps WHERE numero IN ('950/2026','953/2026');

SET ROLE anon;
DO $$BEGIN PERFORM public.sig_cotep_sincronizar_portal('x', '[]'); RAISE EXCEPTION 'FALHOU: token inválido aceito';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS  Sincronização recusa token inválido'; END$$;
DO $$BEGIN PERFORM public.sig_integracao_gerar_token('t'); RAISE EXCEPTION 'FALHOU: visitante gerou token';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS  Visitante não gera token'; END$$;
RESET ROLE;
SET ROLE authenticated;
SELECT teste.como('00000000-0000-0000-0000-0000000000e1');
DO $$BEGIN PERFORM public.sig_integracao_gerar_token('teste'); RAISE EXCEPTION 'FALHOU: não administrador gerou token';
EXCEPTION WHEN raise_exception THEN IF SQLERRM ~ 'FALHOU' THEN RAISE; END IF; RAISE NOTICE 'PASS  Só administrador gera token'; END$$;
SELECT teste.como('00000000-0000-0000-0000-0000000000a1');
SELECT public.sig_integracao_gerar_token('teste')->>'token' AS tok \gset
RESET ROLE;
SELECT teste.ok((SELECT token_hash <> :'tok' AND length(token_hash) = 64 FROM public.sig_integracao_tokens WHERE nome = 'teste'), 'Token guardado só como hash');

SET ROLE anon;
SELECT public.sig_cotep_sincronizar_portal(:'tok', '[
 {"processo":"1250071 000950/2026","detalhamento":"Dispensa de Licitação - Por valor","objeto":"x","valor_referencia":"R$ 1.000,00","valor_homologado":"R$ 900,50","situacao_execucao":"Homologado","codigos_itens":"111, 222"},
 {"processo":"1250071 000951/2026","detalhamento":"Dispensa de Licitação - Por valor","objeto":"Nova com códigos conhecidos","valor_referencia":500,"valor_homologado":0,"situacao_execucao":"Em andamento","codigos_itens":"222"},
 {"processo":"1250071 000952/2026","detalhamento":"Dispensa de Licitação - Por valor","objeto":"Nova com código desconhecido","valor_referencia":"R$ 700,00","situacao_execucao":"Em andamento","codigos_itens":"999"},
 {"processo":"1250071 000953/2026","detalhamento":"Dispensa de Licitação - Por valor","objeto":"x","valor_referencia":"R$ 999.999,00","situacao_execucao":"Em andamento","codigos_itens":"333"},
 {"processo":"1250071 000954/2026","detalhamento":"Pregão Eletrônico","objeto":"Não é COTEP","valor_referencia":100}
]'::jsonb) AS r1 \gset
RESET ROLE;
SELECT teste.ok((SELECT situacao = 'Finalizada' FROM public.sig_cotep_coteps WHERE numero = '950/2026'), 'Homologada no Portal vira Finalizada');
SELECT teste.ok((SELECT valor_homologado = 900.50 FROM public.sig_cotep_procedimentos WHERE numero = '950/2026'), 'Homologado oficial gravado (libera a diferença)');
SELECT teste.ok((SELECT elemento_item = '3024' AND valor_estimado = 500 FROM public.sig_cotep_procedimentos WHERE numero = '951/2026'), 'COTEP nova classificada pelos códigos CATMAS já conhecidos');
SELECT teste.ok(NOT EXISTS (SELECT 1 FROM public.sig_cotep_coteps WHERE numero = '952/2026'), 'Código desconhecido não cria COTEP sem elemento-item');
SELECT teste.ok(EXISTS (SELECT 1 FROM public.sig_cotep_pendencias WHERE numero = '952/2026' AND tipo = 'classificar' AND NOT resolvida), 'Código desconhecido gera pendência para a DTS-1');
SELECT teste.ok((SELECT valor_estimado = 1000 FROM public.sig_cotep_procedimentos WHERE numero = '953/2026'), 'Atualização que estoura o limite não é gravada');
SELECT teste.ok(EXISTS (SELECT 1 FROM public.sig_cotep_pendencias WHERE numero = '953/2026' AND tipo = 'saldo_insuficiente'), 'Estouro do limite vira pendência');
SELECT teste.ok(NOT EXISTS (SELECT 1 FROM public.sig_cotep_coteps WHERE numero = '954/2026'), 'Outras modalidades são ignoradas');
SELECT teste.ok((SELECT linhas = 4 AND atualizadas = 1 AND criadas = 1 AND pendencias = 2 FROM public.sig_cotep_sincronizacoes ORDER BY id DESC LIMIT 1), 'Execução registrada com os totais');
SELECT teste.ok(NOT EXISTS (SELECT 1 FROM public.sig_cotep_saldos WHERE elemento_item = '3024' AND saldo < 0), 'Sincronização não deixa saldo negativo');

SET ROLE anon;
SELECT public.sig_cotep_sincronizar_portal(:'tok', '[{"processo":"1250071 000950/2026","detalhamento":"Dispensa de Licitação - Por valor","valor_referencia":"R$ 1.000,00","valor_homologado":"R$ 900,50","situacao_execucao":"Homologado"}]'::jsonb) AS r2 \gset
RESET ROLE;
SELECT teste.ok((:'r2'::jsonb->>'sem_alteracao')::int = 1 AND (:'r2'::jsonb->>'atualizadas')::int = 0, 'Reexecução idempotente');

SET ROLE anon;
SELECT public.sig_cotep_sincronizar_portal(:'tok', '[{"processo":"1250071 000950/2026","detalhamento":"Dispensa de Licitação - Por valor","valor_referencia":"R$ 1.000,00","valor_homologado":"","situacao_execucao":"Em andamento"}]'::jsonb);
RESET ROLE;
SELECT teste.ok((SELECT situacao = 'Finalizada' FROM public.sig_cotep_coteps WHERE numero = '950/2026'), 'Planilha defasada não reabre COTEP finalizada');

-- A DTS-1 cadastra a COTEP 952: a pendência é encerrada automaticamente.
SET ROLE authenticated;
SELECT teste.como('00000000-0000-0000-0000-0000000000e1');
SELECT teste.acao('{"acao":"salvar_cotep","ano":2026,"unidade_gestora":"1250071","numero":"952/2026","objeto":"Nova com código desconhecido","situacao":"Em andamento","itens":[{"elemento_item":"3921","valor_estimado":"700"}]}');
SELECT teste.ok((SELECT count(*) FROM public.sig_cotep_pendencias WHERE numero = '952/2026' AND NOT resolvida) = 0, 'Cadastrar a COTEP encerra a pendência');
SELECT teste.ok((SELECT count(*) FROM public.sig_cotep_pendencias) >= 1, 'Gestor lê as pendências');
RESET ROLE;
SET ROLE anon;
DO $$BEGIN PERFORM 1 FROM public.sig_cotep_pendencias; RAISE EXCEPTION 'FALHOU: visitante leu pendências';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS  Visitante não lê pendências'; END$$;
DO $$BEGIN PERFORM 1 FROM public.sig_integracao_tokens; RAISE EXCEPTION 'FALHOU: visitante leu tokens';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS  Tokens inacessíveis ao visitante'; END$$;
RESET ROLE;
\echo 'TESTES DA SINCRONIZAÇÃO DIÁRIA PASSARAM'
