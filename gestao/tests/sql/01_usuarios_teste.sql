-- Contas sintéticas: admin, gestor DTS-1, dois usuários de centros, um inativo.
INSERT INTO auth.users(id) VALUES
 ('00000000-0000-0000-0000-0000000000a1'),('00000000-0000-0000-0000-0000000000b1'),
 ('00000000-0000-0000-0000-0000000000c1'),('00000000-0000-0000-0000-0000000000c2'),
 ('00000000-0000-0000-0000-0000000000d1') ON CONFLICT DO NOTHING;
INSERT INTO public.usuarios(auth_id,nome,setor,role,ativo) VALUES
 ('00000000-0000-0000-0000-0000000000a1','Admin Teste','Compras','admin',true),
 ('00000000-0000-0000-0000-0000000000b1','Gestor DTS-1 Teste','DTS-1','leitura',true),
 ('00000000-0000-0000-0000-0000000000c1','Usuário Centro A','Centro A','compras',true),
 ('00000000-0000-0000-0000-0000000000c2','Usuário Centro B','Centro B','leitura',true),
 ('00000000-0000-0000-0000-0000000000d1','Usuário Inativo','Centro A','leitura',false)
ON CONFLICT DO NOTHING;
