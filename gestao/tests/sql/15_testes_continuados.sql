-- Contratos Continuados (migration 20261022_sig_contratos_continuados.sql): sincronização, RLS, manifestação.
\set ON_ERROR_STOP 1
INSERT INTO auth.users(id) VALUES ('00000000-0000-0000-0000-0000000000f1'),('00000000-0000-0000-0000-0000000000f2'),('00000000-0000-0000-0000-0000000000f3') ON CONFLICT DO NOTHING;
INSERT INTO public.usuarios(auth_id,nome,setor,role,ativo) VALUES
 ('00000000-0000-0000-0000-0000000000f1','Fiscal Um','Centro A','leitura',true),
 ('00000000-0000-0000-0000-0000000000f2','Fiscal Dois','Compras','compras',true),
 ('00000000-0000-0000-0000-0000000000f3','Analista SOFI','SOFI','sofi',true) ON CONFLICT DO NOTHING;
CREATE OR REPLACE FUNCTION teste.cont_payload(extra jsonb DEFAULT '[]') RETURNS jsonb LANGUAGE sql AS $$
 SELECT jsonb_build_object('origem_id','1dxzDySXU1h5BKJkW1_mHpNX9KRwgX6Ol5b_kRqeRrJA','gerado_em','2026-10-22T08:02:53-03:00',
  'empenhos', '[
   {"chave_empenho":"2026|1250071|56","controlar":"SIM","processo":"1250071 000085/2021","cnpj":"01.234.567/0001-00","planilha":{"Valor_Reforco_Sugerido":434681.43}},
   {"chave_empenho":"2026|1250071|88","controlar":"SIM","processo":"1250071 000085/2021","cnpj":"01.234.567/0001-00"},
   {"chave_empenho":"2026|1250071|48","controlar":"SIM","processo":"1250071 000037/2020"},
   {"chave_empenho":"2026|1250071|53","controlar":"SIM","processo":"1250071 000036/2020"},
   {"chave_empenho":"2026|1250071|17","controlar":"NÃO","processo":"1250071 000085/2021"}]'::jsonb,
  'movimentos', '[
   {"id":"m56a","chave_empenho":"2026|1250071|56","tipo":"EMPENHO_INICIAL","data":"2026-03-02","mes":"2026-03","valor_empenho":1000000,"processo":"1250071 000085/2021","cnpj":"01.234.567/0001-00","objeto_contrato":"Serviços de TI","dotacao":"1251.10.302.135.2060.0000.3390.4002.60.2.0","unidade_contabil":"1250070.0","tdco":"NÃO"},
   {"id":"m56b","chave_empenho":"2026|1250071|56","tipo":"CONFORMIDADE_ORCAMENTARIA","data":"2026-04-10","mes":"2026-04","valor_conformidade":"350.000,00","processo":"1250071 000085/2021","cnpj":"01.234.567/0001-00","objeto_contrato":"Serviços de TI","dotacao":"1251.10.302.135.2060.0000.3390.4002.60.2.0"},
   {"id":"m56b","chave_empenho":"2026|1250071|56","tipo":"CONFORMIDADE_ORCAMENTARIA","data":"2026-04-10","mes":"2026-04","valor_conformidade":350000,"processo":"1250071 000085/2021","cnpj":"01.234.567/0001-00","objeto_contrato":"Serviços de TI"},
   {"id":"m88a","chave_empenho":"2026|1250071|88","tipo":"EMPENHO_INICIAL","data":"2026-03-05","mes":"2026-03","valor_empenho":475000,"processo":"1250071 000085/2021","cnpj":"01.234.567/0001-00","objeto_contrato":"Serviços de TI","dotacao":"1251.06.181.137.4365.0001.3390.4002.73.1.0"},
   {"id":"m48a","chave_empenho":"2026|1250071|48","tipo":"EMPENHO_INICIAL","data":"2026-02-10","mes":"2026-02","valor_empenho":186381.36,"processo":"1250071 000037/2020","cnpj":"76.535.764/0001-43","objeto_contrato":"Adesão Rede IP - Contrato 8000034 - Lote 9"},
   {"id":"m53a","chave_empenho":"2026|1250071|53","tipo":"EMPENHO_INICIAL","data":"2026-02-10","mes":"2026-02","valor_empenho":44314.00,"processo":"1250071 000036/2020","cnpj":"76.535.764/0001-43","objeto_contrato":"Adesão Rede IP - Contrato 8000034 - Lote 9"},
   {"id":"m17a","chave_empenho":"2026|1250071|17","tipo":"EMPENHO_INICIAL","data":"2026-02-10","mes":"2026-02","valor_empenho":10,"processo":"1250071 000085/2021","cnpj":"01.234.567/0001-00","objeto_contrato":"Serviços de TI"}]'::jsonb || extra,
  'correcoes','[{"chave_empenho":"2026|1250071|56","original":"1251.1030213520600000.3390.4002.60.2.0","corrigida":"1251.10.302.135.2060.0001.3390.4002.60.2.0","status":"APROVADO"}]'::jsonb)
$$;

-- 1. Autenticação da sincronização
SET ROLE anon;
DO $$BEGIN PERFORM public.sig_cont_sincronizar('token-invalido', teste.cont_payload()); RAISE EXCEPTION 'FALHOU: token inválido aceito';
EXCEPTION WHEN raise_exception THEN IF SQLERRM ~ 'FALHOU' THEN RAISE; END IF; RAISE NOTICE 'PASS  Continuados: token inválido recusado'; END$$;
RESET ROLE;
SET ROLE authenticated;
SELECT teste.como('00000000-0000-0000-0000-0000000000f3');
DO $$BEGIN PERFORM public.sig_cont_sincronizar(NULL, teste.cont_payload()); RAISE EXCEPTION 'FALHOU: SOFI sincronizou sem token';
EXCEPTION WHEN raise_exception THEN IF SQLERRM ~ 'FALHOU' THEN RAISE; END IF; RAISE NOTICE 'PASS  Continuados: sem token só administrador sincroniza'; END$$;
SELECT teste.como('00000000-0000-0000-0000-0000000000a1');
SELECT public.sig_integracao_gerar_token('planilha-agora-vai')->>'token' AS tokc \gset
DO $$BEGIN PERFORM public.sig_cont_sincronizar(NULL, jsonb_set(teste.cont_payload(),'{empenhos}','[]')); RAISE EXCEPTION 'FALHOU: retrato vazio aceito';
EXCEPTION WHEN raise_exception THEN IF SQLERRM ~ 'FALHOU' THEN RAISE; END IF; RAISE NOTICE 'PASS  Continuados: retrato sem empenhos recusado (não esvazia o módulo)'; END$$;
DO $$BEGIN PERFORM public.sig_cont_sincronizar(NULL, jsonb_set(teste.cont_payload(),'{origem_id}','"outra"')); RAISE EXCEPTION 'FALHOU: outra planilha aceita';
EXCEPTION WHEN raise_exception THEN IF SQLERRM ~ 'FALHOU' THEN RAISE; END IF; RAISE NOTICE 'PASS  Continuados: somente a PLANILHA ATUAL é aceita'; END$$;
RESET ROLE;
SET ROLE anon;
SELECT public.sig_cont_sincronizar(:'tokc', teste.cont_payload()) AS s1 \gset
RESET ROLE;
SELECT teste.ok((:'s1'::jsonb->>'movimentos')::int = 5, 'Continuados: movimento repetido (mesmo ID_Execucao) e empenho não controlado ignorados');
SELECT teste.ok((SELECT count(*) = 2 FROM public.sig_cont_contratos WHERE ativo), 'Continuados: 2 contratos derivados');
SELECT teste.ok((SELECT processos @> ARRAY['1250071 000036/2020','1250071 000037/2020'] FROM public.sig_cont_contratos WHERE chave = 'CT:8000034:76535764000143'),
 'Continuados: contrato 8000034 reúne dois processos (processo ≠ contrato)');
SELECT teste.ok(EXISTS (SELECT 1 FROM public.sig_cont_contratos WHERE chave = 'PR:1250071 000085/2021:01234567000100'), 'Continuados: contrato sem número explícito = processo + fornecedor');
SELECT teste.ok((SELECT valor_conformidade = 350000 FROM public.sig_cont_movimentos WHERE id_execucao = 'm56b'), 'Continuados: valor «350.000,00» convertido corretamente');
SELECT teste.ok((SELECT count(*) = 1 FROM public.sig_cont_correcoes), 'Continuados: correção histórica aprovada importada');
SELECT teste.ok(NOT EXISTS (SELECT 1 FROM public.sig_cont_movimentos WHERE chave_empenho = '2026|1250071|17'), 'Continuados: empenho com Controlar = NÃO fica fora');

-- 2. RLS antes do vínculo
SET ROLE authenticated;
SELECT teste.como('00000000-0000-0000-0000-0000000000f1');
SELECT teste.ok((SELECT count(*) = 0 FROM public.sig_cont_contratos) AND (SELECT count(*) = 0 FROM public.sig_cont_movimentos), 'Continuados: usuário sem vínculo não vê contratos nem movimentos');
DO $$BEGIN PERFORM public.sig_cont_registrar_necessidade('PR:1250071 000085/2021:01234567000100', 1000); RAISE EXCEPTION 'FALHOU: não fiscal registrou';
EXCEPTION WHEN raise_exception THEN IF SQLERRM ~ 'FALHOU' THEN RAISE; END IF; RAISE NOTICE 'PASS  Continuados: sem vínculo não registra necessidade'; END$$;
DO $$BEGIN PERFORM public.sig_cont_vincular_fiscal('PR:1250071 000085/2021:01234567000100', '00000000-0000-0000-0000-0000000000f1'); RAISE EXCEPTION 'FALHOU: fiscal se vinculou';
EXCEPTION WHEN raise_exception THEN IF SQLERRM ~ 'FALHOU' THEN RAISE; END IF; RAISE NOTICE 'PASS  Continuados: só administrador gerencia vínculos'; END$$;
SELECT teste.como('00000000-0000-0000-0000-0000000000f3');
SELECT teste.ok((SELECT count(*) = 2 FROM public.sig_cont_contratos), 'Continuados: SOFI (gestão) vê todos os contratos');
DO $$BEGIN PERFORM public.sig_cont_registrar_necessidade('PR:1250071 000085/2021:01234567000100', 1000); RAISE EXCEPTION 'FALHOU: gestão registrou como fiscal';
EXCEPTION WHEN raise_exception THEN IF SQLERRM ~ 'FALHOU' THEN RAISE; END IF; RAISE NOTICE 'PASS  Continuados: gestão não registra manifestação em nome do fiscal'; END$$;

-- 3. Vínculo e manifestação
SELECT teste.como('00000000-0000-0000-0000-0000000000a1');
SELECT public.sig_cont_vincular_fiscal('PR:1250071 000085/2021:01234567000100', '00000000-0000-0000-0000-0000000000f1', 'Fiscal', true);
SELECT teste.como('00000000-0000-0000-0000-0000000000f1');
SELECT teste.ok((SELECT count(*) = 1 FROM public.sig_cont_contratos) AND (SELECT count(*) = 3 FROM public.sig_cont_movimentos), 'Continuados: fiscal vê só o próprio contrato e seus movimentos');
SELECT teste.ok((SELECT count(*) = 2 FROM public.sig_cont_empenhos), 'Continuados: fiscal vê só os empenhos do próprio contrato');
SELECT teste.ok((public.sig_cont_registrar_necessidade('PR:1250071 000085/2021:01234567000100', 0, 1222003.59, 'cont-1.0.0')->>'valor')::numeric = 0, 'Continuados: valor zero registrado (avaliou e não precisa)');
SELECT teste.ok((public.sig_cont_registrar_necessidade('PR:1250071 000085/2021:01234567000100', 0)->>'sem_alteracao')::boolean, 'Continuados: mesmo valor não duplica o histórico');
SELECT public.sig_cont_registrar_necessidade('PR:1250071 000085/2021:01234567000100', 150000.50);
SELECT teste.ok((SELECT count(*) = 2 FROM public.sig_cont_manifestacoes) AND (SELECT valor = 150000.50 FROM public.sig_cont_manifestacoes ORDER BY registrado_em DESC, id DESC LIMIT 1),
 'Continuados: alteração gera histórico (0 → 150.000,50)');
SELECT teste.ok((SELECT registrado_nome = 'Fiscal Um' AND registrado_por = '00000000-0000-0000-0000-0000000000f1' FROM public.sig_cont_manifestacoes LIMIT 1), 'Continuados: usuário e nome registrados automaticamente');
DO $$BEGIN PERFORM public.sig_cont_registrar_necessidade('PR:1250071 000085/2021:01234567000100', -1); RAISE EXCEPTION 'FALHOU: valor negativo';
EXCEPTION WHEN raise_exception THEN IF SQLERRM ~ 'FALHOU' THEN RAISE; END IF; RAISE NOTICE 'PASS  Continuados: valor negativo recusado'; END$$;
DO $$BEGIN PERFORM public.sig_cont_registrar_necessidade('PR:1250071 000085/2021:01234567000100', 10.005); RAISE EXCEPTION 'FALHOU: 3 casas';
EXCEPTION WHEN raise_exception THEN IF SQLERRM ~ 'FALHOU' THEN RAISE; END IF; RAISE NOTICE 'PASS  Continuados: mais de 2 casas decimais recusado'; END$$;
DO $$BEGIN PERFORM public.sig_cont_registrar_necessidade('CT:8000034:76535764000143', 10); RAISE EXCEPTION 'FALHOU: outro contrato';
EXCEPTION WHEN raise_exception THEN IF SQLERRM ~ 'FALHOU' THEN RAISE; END IF; RAISE NOTICE 'PASS  Continuados: fiscal não registra em contrato alheio'; END$$;
DO $$BEGIN INSERT INTO public.sig_cont_manifestacoes(exercicio,contrato_chave,valor,registrado_por) VALUES (2026,'CT:8000034:76535764000143',1,auth.uid()); RAISE EXCEPTION 'FALHOU: insert direto';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS  Continuados: gravação direta na tabela bloqueada (só RPC)'; END$$;
DO $$BEGIN PERFORM public.sig_cont_atualizar_contrato('PR:1250071 000085/2021:01234567000100', '2026-12-31', 'x'); RAISE EXCEPTION 'FALHOU: fiscal alterou contrato';
EXCEPTION WHEN raise_exception THEN IF SQLERRM ~ 'FALHOU' THEN RAISE; END IF; RAISE NOTICE 'PASS  Continuados: fiscal não altera dados do contrato (campo único é a necessidade)'; END$$;
SELECT teste.como('00000000-0000-0000-0000-0000000000c2');
SELECT teste.ok((SELECT count(*) = 0 FROM public.sig_cont_manifestacoes), 'Continuados: terceiro sem vínculo não vê manifestações');
RESET ROLE;
DO $$BEGIN UPDATE public.sig_cont_manifestacoes SET valor = 1; RAISE EXCEPTION 'FALHOU: histórico alterado';
EXCEPTION WHEN raise_exception THEN IF SQLERRM ~ 'FALHOU' THEN RAISE; END IF; RAISE NOTICE 'PASS  Continuados: histórico de manifestações imutável (nem o dono do banco altera)'; END$$;

-- 4. Reimportação: sem duplicidade e sem perda da manifestação
SET ROLE anon;
SELECT teste.ok((public.sig_cont_sincronizar(:'tokc', teste.cont_payload())->>'sem_alteracao')::boolean, 'Continuados: retrato idêntico reconhecido (sem alteração)');
SELECT public.sig_cont_sincronizar(:'tokc', jsonb_set(teste.cont_payload('[{"id":"m56c","chave_empenho":"2026|1250071|56","tipo":"REFORCO_EMPENHO","data":"2026-10-30","mes":"2026-10","valor_empenho":100000,"processo":"1250071 000085/2021","cnpj":"01.234.567/0001-00","objeto_contrato":"Serviços de TI"}]'),
 '{empenhos}', (teste.cont_payload()->'empenhos') - 2 - 2)) AS s2 \gset
RESET ROLE;
SELECT teste.ok((SELECT count(*) = 4 FROM public.sig_cont_movimentos WHERE retrato = (:'s2'::jsonb->>'retrato')::bigint)
 AND (SELECT count(*) = 1 FROM public.sig_cont_movimentos WHERE retrato = (:'s2'::jsonb->>'retrato')::bigint AND id_execucao = 'm56b'),
 'Continuados: reimportação gera novo retrato sem duplicar movimentos');
SELECT teste.ok((SELECT count(DISTINCT retrato) = 2 FROM public.sig_cont_movimentos), 'Continuados: retrato anterior preservado como histórico');
SELECT teste.ok((SELECT count(*) = 2 FROM public.sig_cont_manifestacoes), 'Continuados: reimportação preserva as manifestações');
SELECT teste.ok((SELECT ativo FROM public.sig_cont_fiscais LIMIT 1), 'Continuados: reimportação preserva o vínculo do fiscal');
SELECT teste.ok((SELECT NOT ativo FROM public.sig_cont_contratos WHERE chave = 'CT:8000034:76535764000143'), 'Continuados: contrato fora do retrato fica inativo (não é excluído)');
SET ROLE authenticated;
SELECT teste.como('00000000-0000-0000-0000-0000000000e1');
SELECT teste.ok((public.sig_cont_atualizar_contrato('PR:1250071 000085/2021:01234567000100', '2027-03-31', 'Vigência conferida')->>'contrato') IS NOT NULL, 'Continuados: DTS-1 registra vigência do contrato');
DO $$BEGIN PERFORM public.sig_cont_definir_parametros(2026, ARRAY['2026-11','2026-12']); RAISE EXCEPTION 'FALHOU: DTS-1 alterou parâmetros';
EXCEPTION WHEN raise_exception THEN IF SQLERRM ~ 'FALHOU' THEN RAISE; END IF; RAISE NOTICE 'PASS  Continuados: período de projeção só pelo administrador'; END$$;
SELECT teste.como('00000000-0000-0000-0000-0000000000a1');
DO $$BEGIN PERFORM public.sig_cont_definir_parametros(2027, ARRAY['2026-12']); RAISE EXCEPTION 'FALHOU: mês de outro exercício';
EXCEPTION WHEN raise_exception THEN IF SQLERRM ~ 'FALHOU' THEN RAISE; END IF; RAISE NOTICE 'PASS  Continuados: meses fora do exercício recusados'; END$$;
SELECT teste.ok((public.sig_cont_definir_parametros(2027, ARRAY['2027-12','2027-11'])->>'exercicio')::int = 2027, 'Continuados: exercício seguinte parametrizável');
SELECT teste.ok((SELECT meses_alvo = ARRAY['2027-11','2027-12'] FROM public.sig_cont_parametros WHERE exercicio = 2027), 'Continuados: meses ordenados');
RESET ROLE;
SELECT teste.ok((SELECT count(*) >= 5 FROM public.sig_cont_eventos), 'Continuados: trilha de eventos registrada');
DO $$BEGIN RAISE NOTICE 'TESTES CONTRATOS CONTINUADOS PASSARAM'; END$$;
