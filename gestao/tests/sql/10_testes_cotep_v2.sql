-- Testes da migration 20261021_sig_cotep_v2_elemento_item.sql (PostgreSQL local, nunca no Supabase).
-- Ordem: 00_supabase_stub → 01_usuarios_teste → migrations COTEP antigas → 02_historico_validacao → v2 → este arquivo.
\set ON_ERROR_STOP 1
SET client_min_messages TO notice;
CREATE SCHEMA IF NOT EXISTS teste;
GRANT USAGE ON SCHEMA teste TO authenticated;
CREATE OR REPLACE FUNCTION teste.ok(cond boolean, nome text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF cond IS NOT TRUE THEN RAISE EXCEPTION 'FALHOU: %', nome; END IF; RAISE NOTICE 'PASS  %', nome; END $$;
CREATE OR REPLACE FUNCTION teste.falha(p jsonb, trecho text, nome text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE m text;
BEGIN
 BEGIN PERFORM public.sig_cotep_acao(p); EXCEPTION WHEN OTHERS THEN m := SQLERRM; END;
 IF m IS NULL THEN RAISE EXCEPTION 'FALHOU: % (operação deveria ser bloqueada)', nome; END IF;
 IF position(lower(trecho) IN lower(m)) = 0 THEN RAISE EXCEPTION 'FALHOU: % (mensagem inesperada: %)', nome, m; END IF;
 RAISE NOTICE 'PASS  % → %', nome, m;
END $$;
CREATE OR REPLACE FUNCTION teste.como(u text) RETURNS void LANGUAGE sql AS $$ SELECT set_config('request.jwt.claim.sub', u, false) $$;
CREATE OR REPLACE FUNCTION teste.saldo(el text) RETURNS numeric LANGUAGE sql AS $$
 SELECT saldo FROM public.sig_cotep_saldos WHERE ano = 2026 AND unidade_gestora = '1250071' AND elemento_item = el $$;
CREATE OR REPLACE FUNCTION teste.acao(p jsonb) RETURNS jsonb LANGUAGE sql AS $$ SELECT public.sig_cotep_acao(p) $$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA teste TO authenticated;
-- Contas: a1 admin · b1 gestor DTS-1 · c1/c2 centros · d1 inativo
\set ADMIN '00000000-0000-0000-0000-0000000000a1'
\set GESTOR '00000000-0000-0000-0000-0000000000b1'
\set CENTRO_A '00000000-0000-0000-0000-0000000000c1'
\set CENTRO_B '00000000-0000-0000-0000-0000000000c2'
\set INATIVO '00000000-0000-0000-0000-0000000000d1'

SET ROLE authenticated;

-- 1. Saldos de validação após a migração -----------------------------------------------------
SELECT teste.como(:'ADMIN');
SELECT teste.acao(jsonb_build_object('acao','definir_gestor','auth_id',:'GESTOR','ativo',true));
SELECT teste.ok((SELECT count(*) FROM public.sig_cotep_coteps) = 11, '11 COTEPs distintas após consolidação');
SELECT teste.ok((SELECT count(*) FROM public.sig_cotep_procedimentos) = 12, '12 lançamentos preservados');
SELECT teste.ok((SELECT count(*) FROM public.sig_cotep_procedimentos x JOIN public.sig_cotep_coteps c ON c.id = x.cotep_id WHERE c.numero = '130/2026') = 2,
 'COTEP 130/2026: um cabeçalho com dois elementos-itens');
SELECT teste.ok((SELECT (limite, consumido, comprometido, saldo) = (65492.11, 58942.62, 674.95, 5874.54) FROM public.sig_cotep_saldos WHERE elemento_item = '3016'),
 '3016: consumido 58.942,62 + comprometido 674,95 = 59.617,57; saldo 5.874,54');
SELECT teste.ok((SELECT (consumido, comprometido, saldo) = (40700.00, 23599.00, 1193.11) FROM public.sig_cotep_saldos WHERE elemento_item = '5207'),
 '5207: 40.700,00 + 23.599,00 = 64.299,00; saldo 1.193,11');
SELECT teste.ok((SELECT consumido + comprometido FROM public.sig_cotep_saldos WHERE elemento_item = '3016') = 59617.57, '3016 total 59.617,57');
SELECT teste.ok((SELECT sum(consumido + comprometido) FROM public.sig_cotep_saldos) = 169876.62 + 2896.00 + 674.95 + 23599.00,
 'Sem duplicação: soma geral = histórico importado');
SELECT teste.ok((SELECT percentual FROM public.sig_cotep_saldos WHERE elemento_item = '3016') = 91.03, '3016 utilização 91,03%');
SELECT teste.ok((SELECT count(*) FROM public.sig_cotep_saldos WHERE elemento_item IN ('3024','5203','3964','3921')) = 4, 'Demais elementos-itens preservados');
SELECT teste.ok((SELECT pendentes_qtd FROM public.sig_cotep_saldos WHERE elemento_item = '3016') = 1 AND teste.saldo('3016') = 5874.54,
 'Intenção pendente antiga não abate saldo');
SELECT teste.ok((SELECT count(*) FROM public.sig_cotep_elementos) >= 12, 'Catálogo aberto com códigos do histórico e do SIG');

-- 2. Permissões ------------------------------------------------------------------------------
SELECT teste.como(:'INATIVO');
SELECT teste.falha('{"acao":"criar_intencao","centro":"Centro A","objeto":"Teste inativo xx","elemento_item":"3016","valor_estimado":"10","justificativa":"Justificativa ok"}', 'não autorizado', 'Conta inativa bloqueada');
SELECT teste.ok((SELECT count(*) FROM public.sig_cotep_intencoes) = 0, 'RLS: conta inativa não lê intenções');
SELECT teste.como(:'CENTRO_A');
DO $$BEGIN INSERT INTO public.sig_cotep_intencoes(ano,unidade_gestora,centro,objeto,elemento_item,valor_estimado,criado_por)
 VALUES (2026,'1250071','X','Inserção direta','3016',1,auth.uid()); RAISE EXCEPTION 'FALHOU: insert direto permitido';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS  Escrita direta por REST negada'; END$$;
DO $$BEGIN UPDATE public.sig_cotep_limites SET valor_limite = 999999; RAISE EXCEPTION 'FALHOU: update direto permitido';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS  Alteração direta do limite negada'; END$$;
SELECT teste.ok((SELECT count(*) FROM public.sig_cotep_auditoria) = 0, 'RLS: auditoria restrita à DTS-1');
SELECT teste.falha('{"acao":"reservar","id":"00000000-0000-0000-0000-000000000000"}', 'Somente gestor DTS-1', 'Centro não reserva');
SELECT teste.falha('{"acao":"limite","ano":2026,"unidade_gestora":"1250071","valor_limite":"1","base_normativa":"xxxxxxxxxxxx"}', 'Somente gestor DTS-1', 'Centro não altera limite');

-- 3. Fluxo do centro -------------------------------------------------------------------------
SELECT teste.falha('{"acao":"criar_intencao","centro":"Centro A","objeto":"Toner para impressoras","elemento_item":"3016","valor_estimado":"5000"}', 'justificativa', 'Justificativa obrigatória');
SELECT teste.falha('{"acao":"criar_intencao","centro":"Centro A","objeto":"Toner para impressoras","elemento_item":"30","valor_estimado":"5000","justificativa":"Reposição anual"}', '4 dígitos', 'Elemento-item validado');
SELECT (teste.acao('{"acao":"criar_intencao","centro":"centro a","objeto":"Toner para impressoras","elemento_item":"3016","valor_estimado":"5.000,00","justificativa":"Reposição anual do estoque","prioridade":"Alta"}')->>'id') AS int1 \gset
SELECT teste.ok((SELECT centro = 'Centro A' AND situacao = 'Pendente' AND prioridade = 'Alta' AND ano = 2026 AND unidade_gestora = '1250071' AND valor_estimado = 5000
 FROM public.sig_cotep_intencoes WHERE id = :'int1'), 'Intenção criada com UG/ano padrão, centro do catálogo e valor em formato brasileiro');
SELECT teste.falha('{"acao":"criar_intencao","centro":"Centro A","objeto":"Toner para impressoras","elemento_item":"3016","valor_estimado":"5000","justificativa":"Reposição anual do estoque"}', 'idêntica', 'Duplo envio bloqueado');
SELECT teste.ok(teste.saldo('3016') = 5874.54, 'Pendente não abate saldo');
SELECT (teste.acao('{"acao":"criar_intencao","centro":"Centro Novo","objeto":"Cabo de rede categoria 6","elemento_item":"7777","valor_estimado":"300","justificativa":"Expansão da rede local"}')->>'id') AS int_novo \gset
SELECT teste.ok(EXISTS (SELECT 1 FROM public.sig_cotep_elementos WHERE codigo = '7777') AND EXISTS (SELECT 1 FROM public.sig_cotep_centros WHERE nome = 'Centro Novo'),
 'Novo elemento-item e novo centro entram no catálogo');
SELECT teste.como(:'CENTRO_B');
SELECT teste.falha(jsonb_build_object('acao','editar_intencao','id',:'int1','valor_estimado','1'), 'Somente o autor', 'Outro centro não edita');
SELECT teste.falha(jsonb_build_object('acao','cancelar_intencao','id',:'int1'), 'não permitido', 'Outro centro não cancela');
SELECT teste.como(:'CENTRO_A');
SELECT teste.acao(jsonb_build_object('acao','cancelar_intencao','id',:'int_novo','motivo','Registrada por engano'));
SELECT teste.ok((SELECT situacao FROM public.sig_cotep_intencoes WHERE id = :'int_novo') = 'Cancelada', 'Autor cancela a própria intenção');

-- 4. Reservas da DTS-1 -----------------------------------------------------------------------
SELECT teste.como(:'GESTOR');
SELECT teste.acao(jsonb_build_object('acao','reservar','id',:'int1'));
SELECT teste.ok(teste.saldo('3016') = 874.54, 'Reserva de 5.000,00 abate saldo (5.874,54 → 874,54)');
SELECT teste.ok((SELECT comprometido FROM public.sig_cotep_saldos WHERE elemento_item = '3016') = 5674.95, 'Comprometido = COTEP em andamento + reserva');
SELECT teste.como(:'CENTRO_A');
SELECT teste.falha(jsonb_build_object('acao','editar_intencao','id',:'int1','valor_estimado','10'), 'pendentes ou devolvidas', 'Reservada não é editável pelo centro');
SELECT (teste.acao('{"acao":"criar_intencao","centro":"Centro A","objeto":"Papel A4 para expediente","elemento_item":"3016","valor_estimado":"1000","justificativa":"Consumo do semestre"}')->>'id') AS int2 \gset
SELECT teste.como(:'GESTOR');
SELECT teste.falha(jsonb_build_object('acao','reservar','id',:'int2'), 'Saldo insuficiente no elemento-item 3016', 'Reserva acima do saldo bloqueada');
SELECT teste.ok((SELECT situacao FROM public.sig_cotep_intencoes WHERE id = :'int2') = 'Pendente', 'Intenção permanece pendente após bloqueio');
SELECT teste.falha(jsonb_build_object('acao','reservar','id',:'int2','valor','1500'), 'até o valor estimado', 'Reserva não excede o estimado');
SELECT teste.acao(jsonb_build_object('acao','reservar','id',:'int2','valor','800'));
SELECT teste.ok(teste.saldo('3016') = 74.54, 'Reserva parcial de 800,00 (saldo 74,54)');
SELECT teste.acao(jsonb_build_object('acao','liberar_reserva','id',:'int2','motivo','Repriorização'));
SELECT teste.ok(teste.saldo('3016') = 874.54 AND (SELECT situacao FROM public.sig_cotep_intencoes WHERE id = :'int2') = 'Pendente', 'Liberação devolve o valor ao saldo');
SELECT teste.falha(jsonb_build_object('acao','devolver','id',:'int2'), 'motivo', 'Devolução exige motivo');
SELECT teste.acao(jsonb_build_object('acao','decidir','id',:'int2','situacao','Devolvida','observacao','Detalhar especificação'));
SELECT teste.ok((SELECT situacao FROM public.sig_cotep_intencoes WHERE id = :'int2') = 'Devolvida', 'Compatibilidade da ação decidir');
SELECT teste.acao(jsonb_build_object('acao','agrupar','ids',jsonb_build_array(:'int1',:'int2'),'grupo','Suprimentos 2º sem'));
SELECT teste.ok((SELECT count(*) FROM public.sig_cotep_intencoes WHERE grupo = 'Suprimentos 2º sem') = 2, 'Agrupamento de demandas');

-- 5. Intenção vira COTEP sem dupla contagem; homologação libera diferença ---------------------
SELECT (teste.acao(jsonb_build_object('acao','converter_cotep','ids',jsonb_build_array(:'int1'),'numero','131/2026'))->>'cotep_id') AS c131 \gset
SELECT teste.ok(teste.saldo('3016') = 874.54, 'Conversão transfere a reserva: saldo inalterado (sem dupla contagem)');
SELECT teste.ok((SELECT situacao = 'Em COTEP' AND valor_reservado = 0 AND cotep_id = :'c131' FROM public.sig_cotep_intencoes WHERE id = :'int1'), 'Intenção vinculada à COTEP');
SELECT teste.ok((SELECT reservado = 0 AND comprometido_coteps = 5674.95 FROM public.sig_cotep_saldos WHERE elemento_item = '3016'), 'Valor passou da reserva para a COTEP em andamento');
SELECT teste.acao(jsonb_build_object('acao','salvar_cotep','id',:'c131','ano',2026,'unidade_gestora','1250071','numero','131/2026',
 'objeto','Toner para impressoras','situacao','Finalizada','itens',jsonb_build_array(jsonb_build_object('elemento_item','3016','valor_estimado','5000','valor_homologado','4200'))));
SELECT teste.ok(teste.saldo('3016') = 1674.54, 'Homologado 4.200,00 substitui reserva de 5.000,00 e libera 800,00');
SELECT teste.ok((SELECT situacao FROM public.sig_cotep_intencoes WHERE id = :'int1') = 'Finalizada', 'Intenção finalizada com a COTEP');
SELECT teste.ok(EXISTS (SELECT 1 FROM public.sig_cotep_eventos WHERE cotep_id = :'c131' AND descricao LIKE '%liberado R$ 800%'), 'Evento registra o valor liberado');
SELECT teste.falha(jsonb_build_object('acao','salvar_cotep','id',:'c131','ano',2026,'unidade_gestora','1250071','numero','131/2026',
 'objeto','Toner para impressoras','situacao','Finalizada','itens',jsonb_build_array(jsonb_build_object('elemento_item','3016','valor_estimado','5000'))),
 'homologado', 'Finalizar exige homologado');

-- COTEP 130/2026 (dois elementos-itens) homologada com valores próprios por código.
SELECT id AS c130 FROM public.sig_cotep_coteps WHERE numero = '130/2026' \gset
SELECT id AS i130a FROM public.sig_cotep_procedimentos WHERE numero = '130/2026' AND elemento_item = '3016' \gset
SELECT id AS i130b FROM public.sig_cotep_procedimentos WHERE numero = '130/2026' AND elemento_item = '5207' \gset
SELECT teste.acao(jsonb_build_object('acao','salvar_cotep','id',:'c130','ano',2026,'unidade_gestora','1250071','numero','130/2026',
 'objeto','Objeto de validação 130/2026','situacao','Finalizada','itens',jsonb_build_array(
  jsonb_build_object('id',:'i130a','elemento_item','3016','valor_estimado','674.95','valor_homologado','600.00'),
  jsonb_build_object('id',:'i130b','elemento_item','5207','valor_estimado','23599.00','valor_homologado','23000.00'))));
SELECT teste.ok(teste.saldo('3016') = 1749.49 AND teste.saldo('5207') = 1792.11, 'COTEP 130/2026 finalizada: cada elemento-item libera a sua diferença');
SELECT teste.ok((SELECT count(*) FROM public.sig_cotep_procedimentos WHERE numero = '130/2026' AND situacao = 'Finalizada') = 2, 'Situação única espelhada nos dois itens');

-- 6. Deserta / fracassada liberam valor e devolvem intenções à fila ---------------------------
SELECT teste.como(:'CENTRO_B');
SELECT (teste.acao('{"acao":"criar_intencao","centro":"Centro B","objeto":"Monitores 24 polegadas","elemento_item":"5207","valor_estimado":"1500","justificativa":"Substituição de equipamentos"}')->>'id') AS int3 \gset
SELECT teste.como(:'GESTOR');
SELECT (teste.acao(jsonb_build_object('acao','converter_cotep','ids',jsonb_build_array(:'int3'),'numero','140/2026','objeto','Monitores para o Centro B'))->>'cotep_id') AS c140 \gset
SELECT teste.ok(teste.saldo('5207') = 292.11, 'Conversão direta de pendente compromete o valor (saldo 292,11)');
SELECT teste.acao(jsonb_build_object('acao','salvar_cotep','id',:'c140','ano',2026,'unidade_gestora','1250071','numero','140/2026',
 'objeto','Monitores para o Centro B','situacao','Deserta','itens',jsonb_build_array(jsonb_build_object('elemento_item','5207','valor_estimado','1500'))));
SELECT teste.ok(teste.saldo('5207') = 1792.11, 'COTEP deserta libera o valor');
SELECT teste.ok((SELECT situacao = 'Pendente' AND cotep_id IS NULL FROM public.sig_cotep_intencoes WHERE id = :'int3'), 'Intenção volta à fila sem reserva');
SELECT teste.falha(jsonb_build_object('acao','salvar_cotep','id',:'c140','ano',2026,'unidade_gestora','1250071','numero','140/2026',
 'objeto','Monitores para o Centro B','situacao','Em andamento','itens',jsonb_build_array(jsonb_build_object('elemento_item','5207','valor_estimado','5000'))),
 'Saldo insuficiente no elemento-item 5207', 'Reabrir COTEP acima do saldo bloqueado');
SELECT teste.falha('{"acao":"salvar_cotep","ano":2026,"unidade_gestora":"1250071","numero":"150/2026","objeto":"Notebooks para o centro","situacao":"Em andamento","itens":[{"elemento_item":"5207","valor_estimado":"9000"}]}',
 'Saldo insuficiente', 'Nova COTEP acima do saldo bloqueada');
SELECT teste.falha('{"acao":"salvar_cotep","ano":2026,"unidade_gestora":"1250071","numero":"130/2026","objeto":"Duplicada xx","situacao":"Em andamento","itens":[{"elemento_item":"3016","valor_estimado":"1"}]}',
 'já está cadastrada', 'Número de COTEP duplicado bloqueado');
SELECT teste.falha('{"acao":"salvar_cotep","ano":2026,"unidade_gestora":"1250071","numero":"151/2026","objeto":"Itens repetidos","situacao":"Em andamento","itens":[{"elemento_item":"3016","valor_estimado":"1"},{"elemento_item":"3016","valor_estimado":"1"}]}',
 'repetido', 'Elemento-item repetido na mesma COTEP bloqueado');

-- 7. Exceção ao limite só por administrador, com justificativa --------------------------------
SELECT teste.falha('{"acao":"salvar_cotep","ano":2026,"unidade_gestora":"1250071","numero":"152/2026","objeto":"Registro histórico excedente","situacao":"Finalizada","justificativa_excecao":"Registro de fato já homologado no Portal","itens":[{"elemento_item":"3964","valor_estimado":"60000","valor_homologado":"60000"}]}',
 'Somente administrador', 'Gestor não registra exceção');
SELECT teste.como(:'ADMIN');
SELECT teste.acao('{"acao":"salvar_cotep","ano":2026,"unidade_gestora":"1250071","numero":"152/2026","objeto":"Registro histórico excedente","situacao":"Finalizada","justificativa_excecao":"Registro de fato já homologado no Portal","itens":[{"elemento_item":"3964","valor_estimado":"60000","valor_homologado":"60000"}]}');
SELECT teste.ok(teste.saldo('3964') < 0 AND EXISTS (SELECT 1 FROM public.sig_cotep_eventos WHERE descricao LIKE '%EXCEÇÃO AO LIMITE%'), 'Exceção registrada e saldo negativo exposto');
SELECT teste.ok(coalesce(current_setting('sig.cotep_excecao', true),'') = '', 'Exceção não vaza para a sessão');
SELECT teste.como(:'GESTOR');
SELECT teste.falha('{"acao":"limite","ano":2026,"unidade_gestora":"1250071","valor_limite":"65492,11","base_normativa":"Lei 14.133/2021 art. 75 II","validacao_juridica":"Validada","documento_validacao":"Parecer xx/2026"}',
 'Somente administrador', 'Validação jurídica restrita ao administrador');
SELECT teste.acao('{"acao":"limite","ano":2027,"unidade_gestora":"1250071","valor_limite":"68000","base_normativa":"Referência provisória para 2027"}');
SELECT teste.ok((SELECT valor_limite FROM public.sig_cotep_limites WHERE ano = 2027) = 68000 AND (SELECT valor_limite FROM public.sig_cotep_limites WHERE ano = 2026) = 65492.11,
 'Limite parametrizado por exercício');

-- 8. Histórico preservado ----------------------------------------------------------------------
RESET ROLE;
DO $$BEGIN DELETE FROM public.sig_cotep_coteps; RAISE EXCEPTION 'FALHOU: exclusão permitida';
EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'FALHOU%' THEN RAISE; END IF; RAISE NOTICE 'PASS  Exclusão bloqueada até para o dono do banco'; END$$;
SELECT teste.ok((SELECT count(*) FROM public.sig_cotep_auditoria WHERE tabela = 'sig_cotep_intencoes') >= 8, 'Auditoria de dados registra antes/depois');
SELECT teste.ok((SELECT count(*) FROM public.sig_cotep_eventos WHERE intencao_id = :'int1') >= 4, 'Trilha legível da intenção (registro, reserva, COTEP, finalização)');
SELECT teste.ok(NOT EXISTS (
  SELECT 1 FROM public.sig_cotep_saldos s
  WHERE s.saldo <> s.limite - s.consumido - s.comprometido OR s.comprometido <> s.comprometido_coteps + s.reservado), 'Consistência: saldo = limite − consumido − comprometido');
\echo 'TODOS OS TESTES SQL PASSARAM'
