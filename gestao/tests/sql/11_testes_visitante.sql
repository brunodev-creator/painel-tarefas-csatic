-- Testes do acesso de visitante (papel anon, sem conta). Executar após 10_testes_cotep_v2.sql.
\set ON_ERROR_STOP 1
CREATE OR REPLACE FUNCTION teste.falha_pub(p jsonb, trecho text, nome text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE m text;
BEGIN
 BEGIN PERFORM public.sig_cotep_publico_intencao(p); EXCEPTION WHEN OTHERS THEN m := SQLERRM; END;
 IF m IS NULL OR position(lower(trecho) IN lower(m)) = 0 THEN RAISE EXCEPTION 'FALHOU: % (%)', nome, coalesce(m,'sem erro'); END IF;
 RAISE NOTICE 'PASS  % → %', nome, m;
END $$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA teste TO anon;
GRANT USAGE ON SCHEMA teste TO anon;
SET ROLE anon;
SELECT set_config('request.jwt.claim.sub', '', false);
SELECT teste.ok((public.sig_cotep_publico_status()->>'ativo')::boolean AND NOT (public.sig_cotep_publico_status()->>'exige_codigo')::boolean, 'Visitante: acesso ativo e sem código por padrão');
SELECT teste.ok(jsonb_array_length(public.sig_cotep_publico_dados()->'saldos') >= 6, 'Visitante lê o painel por elemento-item');
SELECT teste.ok(NOT (public.sig_cotep_publico_dados()->'intencoes')::text LIKE '%solicitante_contato%' AND NOT (public.sig_cotep_publico_dados()->'intencoes')::text LIKE '%criado_por%', 'Painel público sem contatos nem autores');
DO $$BEGIN PERFORM 1 FROM public.sig_cotep_intencoes; RAISE EXCEPTION 'FALHOU: anon leu a tabela';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS  Tabelas continuam fechadas ao papel anon'; END$$;
DO $$BEGIN PERFORM public.sig_cotep_acao('{"acao":"reservar"}'); RAISE EXCEPTION 'FALHOU: anon chamou a RPC interna';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS  RPC interna (reservar, COTEP, parâmetros) negada ao visitante'; END$$;
SELECT teste.falha_pub('{"centro":"Centro Visitante","objeto":"Teclados e mouses","elemento_item":"5207","valor_estimado":"500","justificativa":"Reposição de periféricos"}', 'nome', 'Visitante precisa se identificar');
SELECT (public.sig_cotep_publico_intencao('{"centro":"Centro Visitante","objeto":"Teclados e mouses","elemento_item":"5207","valor_estimado":"500,00","justificativa":"Reposição de periféricos","solicitante_nome":"Sd Fulano","solicitante_contato":"fulano@pmmg.mg.gov.br"}')->>'id') AS vis1 \gset
RESET ROLE;
SELECT teste.ok((SELECT origem = 'Visitante' AND situacao = 'Pendente' AND criado_por IS NULL AND solicitante_nome = 'Sd Fulano' FROM public.sig_cotep_intencoes WHERE id = :'vis1'), 'Intenção de visitante registrada como pendente, com solicitante');
SELECT teste.ok(EXISTS (SELECT 1 FROM public.sig_cotep_eventos WHERE intencao_id = :'vis1' AND autor IS NULL), 'Histórico registra o visitante');
SET ROLE anon;
SELECT teste.falha_pub('{"centro":"Centro Visitante","objeto":"Teclados e mouses","elemento_item":"5207","valor_estimado":"500,00","justificativa":"Reposição de periféricos","solicitante_nome":"Sd Fulano","solicitante_contato":"fulano@pmmg.mg.gov.br"}', 'idêntica', 'Duplo envio do visitante bloqueado');
RESET ROLE;
SET ROLE authenticated;
SELECT teste.como(:'CENTRO_A');
DO $$BEGIN PERFORM public.sig_cotep_acesso_publico_definir('{"codigo":"segredo123"}'); RAISE EXCEPTION 'FALHOU: centro alterou acesso';
EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'FALHOU%' THEN RAISE; END IF; RAISE NOTICE 'PASS  Só a DTS-1 define o acesso de visitante'; END$$;
SELECT teste.como(:'GESTOR');
SELECT public.sig_cotep_acesso_publico_definir('{"codigo":"segredo123"}');
RESET ROLE; SET ROLE anon;
SELECT teste.ok((public.sig_cotep_publico_status()->>'exige_codigo')::boolean, 'Código passa a ser exigido');
DO $$BEGIN PERFORM public.sig_cotep_publico_dados('errado'); RAISE EXCEPTION 'FALHOU: código errado aceito';
EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'FALHOU%' THEN RAISE; END IF; RAISE NOTICE 'PASS  Código inválido recusado'; END$$;
SELECT teste.ok(public.sig_cotep_publico_dados('segredo123') ? 'saldos', 'Código correto libera o painel');
RESET ROLE; SET ROLE authenticated; SELECT teste.como(:'GESTOR');
SELECT public.sig_cotep_acesso_publico_definir('{"ativo":false}');
RESET ROLE; SET ROLE anon;
DO $$BEGIN PERFORM public.sig_cotep_publico_dados('segredo123'); RAISE EXCEPTION 'FALHOU: acesso desativado funcionou';
EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'FALHOU%' THEN RAISE; END IF; RAISE NOTICE 'PASS  DTS-1 desativa o acesso de visitante'; END$$;
RESET ROLE;
\echo 'TESTES DO VISITANTE PASSARAM'
