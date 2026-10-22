-- Perfil DTS-1: gestor COTEP automático e leitura de cota/almoxarifado.
\set ON_ERROR_STOP 1
INSERT INTO auth.users(id) VALUES ('00000000-0000-0000-0000-0000000000e1') ON CONFLICT DO NOTHING;
INSERT INTO public.usuarios(auth_id,nome,setor,role,ativo) VALUES ('00000000-0000-0000-0000-0000000000e1','Gestor perfil DTS-1','DTS-1','dts1',true);
DO $$BEGIN INSERT INTO public.usuarios(auth_id,nome,setor,role,ativo) VALUES ('00000000-0000-0000-0000-0000000000a1','x','Compras','dts1',true) ON CONFLICT (auth_id) DO UPDATE SET role='dts1', setor='Compras';
 RAISE EXCEPTION 'FALHOU: dts1 fora do setor DTS-1'; EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS  Perfil DTS-1 exige setor DTS-1'; END$$;
SET ROLE authenticated;
SELECT teste.como('00000000-0000-0000-0000-0000000000e1');
SELECT teste.ok(private.sig_cotep_gestor(), 'Perfil DTS-1 é gestor COTEP sem delegação manual');
SELECT teste.ok(private.can_view_cota(), 'Perfil DTS-1 lê Cota orçamentária e Almoxarifado');
SELECT (teste.acao('{"acao":"criar_intencao","centro":"Centro A","objeto":"Teste do perfil DTS-1","elemento_item":"3024","valor_estimado":"100","justificativa":"Teste do perfil DTS-1"}')->>'id') AS dt1 \gset
SELECT teste.acao(jsonb_build_object('acao','reservar','id',:'dt1'));
SELECT teste.ok((SELECT situacao FROM public.sig_cotep_intencoes WHERE id = :'dt1') = 'Reservada', 'Perfil DTS-1 aprova reservas');
SELECT teste.falha('{"acao":"definir_gestor","auth_id":"00000000-0000-0000-0000-0000000000c1"}', 'administrador', 'Perfil DTS-1 não administra gestores');
RESET ROLE;
\echo 'TESTES DO PERFIL DTS-1 PASSARAM'
