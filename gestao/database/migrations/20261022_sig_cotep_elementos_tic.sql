-- Catálogo dos 15 elementos-itens de TIC do CSA-TIC (13 de consumo + exceções 4002 e 4006),
-- conforme a planilha «Controle Gerencial de COTEPs 2026 e Elementos-Itens TIC» (Classificador
-- Econômico MG de 07/10/2026). Aparecem sempre no painel, mesmo sem COTEP no exercício.
ALTER TABLE public.sig_cotep_elementos ADD COLUMN IF NOT EXISTS grupo text;
ALTER TABLE public.sig_cotep_elementos ADD COLUMN IF NOT EXISTS relacao_tic text;
ALTER TABLE public.sig_cotep_elementos ADD COLUMN IF NOT EXISTS aplicacao text;
ALTER TABLE public.sig_cotep_elementos ADD COLUMN IF NOT EXISTS orientacao text;
ALTER TABLE public.sig_cotep_elementos ADD COLUMN IF NOT EXISTS classificador_url text;
ALTER TABLE public.sig_cotep_elementos ADD COLUMN IF NOT EXISTS ordem integer;
INSERT INTO public.sig_cotep_elementos (codigo, descricao, grupo, relacao_tic, aplicacao, orientacao, classificador_url, ordem) VALUES
 ('3016','Material de informática','TIC','Principal','Materiais e peças para funcionamento, manutenção e aperfeiçoamento de computadores e processamento de dados.','Para determinados discos, placas, memórias, monitores e teclados, observar os requisitos de identificação patrimonial constantes do classificador.','https://drive.google.com/file/d/1Fo8GbzxJm5ThG0FLPsQPsEVjqVkU_X__/view',1),
 ('3015','Material fotográfico, cinematográfico e de comunicação','TIC','Relacionado','Materiais de fotografia, filmagem, gravação, radiofonia e telecomunicações.','Verificar a finalidade de comunicação e a classificação CATMAS do material específico.','https://drive.google.com/file/d/1Fo8GbzxJm5ThG0FLPsQPsEVjqVkU_X__/view',2),
 ('3020','Material elétrico e eletrônico','TIC','Relacionado','Materiais de consumo para instalação, manutenção e reposição de sistemas, aparelhos e equipamentos elétricos e eletrônicos.','Não usar apenas por o produto ser eletrônico: conferir se há item de informática mais específico (3016).','https://drive.google.com/file/d/1Fo8GbzxJm5ThG0FLPsQPsEVjqVkU_X__/view',3),
 ('3022','Ferramentas, ferragens e utensílios','TIC','Complementar','Ferramentas de pequeno porte para manutenção e instalação de infraestrutura de TIC.','Jogos e estojos de ferramentas classificados como permanentes ficam excluídos.','https://drive.google.com/file/d/1Fo8GbzxJm5ThG0FLPsQPsEVjqVkU_X__/view',4),
 ('3005','Material para escritório','TIC','Complementar','Papel, materiais administrativos e determinados suprimentos de impressão, como toner.','A classificação é pela natureza do material; conferir diferença entre expediente e suprimento de informática.','https://drive.google.com/file/d/1Fo8GbzxJm5ThG0FLPsQPsEVjqVkU_X__/view',5),
 ('3017','Artigos para limpeza e higiene','TIC','Complementar','Produtos e materiais de limpeza de ambientes, instalações e equipamentos.','Confirmar a finalidade de limpeza/higiene e o cadastro do produto.','https://drive.google.com/file/d/1Fo8GbzxJm5ThG0FLPsQPsEVjqVkU_X__/view',6),
 ('3019','Material para manutenção e reparos de imóveis de propriedade da Administração Pública','TIC','Condicional','Materiais destinados a reparos e adequações físicas de imóveis públicos relacionados a instalações de TIC.','Excluem-se materiais elétricos classificados no item próprio; não abrange obras e instalações.','https://drive.google.com/file/d/1Fo8GbzxJm5ThG0FLPsQPsEVjqVkU_X__/view',7),
 ('3021','Material para manutenção e reparos de bens de domínio público ou de terceiros','TIC','Condicional','Materiais para conservação e reparos de bens de domínio público ou de terceiros que apoiem instalações de TIC.','Aplica-se conforme titularidade do bem e natureza da intervenção; não se caracteriza como obra.','https://drive.google.com/file/d/1Fo8GbzxJm5ThG0FLPsQPsEVjqVkU_X__/view',8),
 ('3030','Materiais para acondicionamento e embalagem','TIC','Complementar','Embalagem e acondicionamento de componentes, peças e equipamentos.','Somente quando a aquisição tiver essa natureza específica.','https://drive.google.com/file/d/1Fo8GbzxJm5ThG0FLPsQPsEVjqVkU_X__/view',9),
 ('3031','Livros técnicos','TIC','Complementar','Livros técnicos para consulta e uso constante dos servidores da área de TIC.','Não confundir com livros incorporados a acervo bibliográfico permanente.','https://drive.google.com/file/d/1Fo8GbzxJm5ThG0FLPsQPsEVjqVkU_X__/view',10),
 ('3039','Material para confecção em geral','TIC','Condicional','Matérias-primas para confecção, quando empregadas em atividade relacionada à TIC.','Usar apenas quando não houver item de despesa mais específico.','https://drive.google.com/file/d/1Fo8GbzxJm5ThG0FLPsQPsEVjqVkU_X__/view',11),
 ('3041','Material de proteção e segurança','TIC','Condicional','Materiais de consumo diretamente ligados à proteção de pessoas ou bens públicos.','A finalidade de proteção/segurança deve prevalecer; há classificações específicas para usos médico e policial.','https://drive.google.com/file/d/1Fo8GbzxJm5ThG0FLPsQPsEVjqVkU_X__/view',12),
 ('3099','Outros materiais','TIC','Residual','Materiais de consumo que não se enquadram nos itens anteriores.','Somente quando não existir classificação específica aplicável.','https://drive.google.com/file/d/1Fo8GbzxJm5ThG0FLPsQPsEVjqVkU_X__/view',13),
 ('4002','Serviços de tecnologia da informação','TIC','EXCEÇÃO • Serviços TIC','Prestação de serviços de TI; locação de licenças; software como serviço (SaaS/subscrições); hospedagem, suporte, manutenção, segurança da informação, administração de rede e certificação digital.','Natureza 3.3.xx.40.02 para software como serviço. Não confundir com aquisição patrimonial de software; serviços PRODEMGE têm item específico (4003).','https://drive.google.com/file/d/1Fo8GbzxJm5ThG0FLPsQPsEVjqVkU_X__/view',14),
 ('4006','Aquisição de software','TIC','EXCEÇÃO • Ativo / investimento','Aquisição de software pronto junto a terceiros para incorporação ao ativo do Estado, com amortização ao longo de sua vida útil.','Natureza 4.4.xx.40.06. Diferenciar aquisição patrimonial de subscrição/SaaS (4002). Limite legal de dispensa não é cota individual do elemento-item.','https://drive.google.com/file/d/1Fo8GbzxJm5ThG0FLPsQPsEVjqVkU_X__/view',15)

ON CONFLICT (codigo) DO UPDATE SET descricao = excluded.descricao, grupo = excluded.grupo, relacao_tic = excluded.relacao_tic,
 aplicacao = excluded.aplicacao, orientacao = excluded.orientacao, classificador_url = excluded.classificador_url,
 ordem = excluded.ordem, ativo = true, atualizado_em = now();

-- Painel do visitante passa a receber os dados de orientação do catálogo.
CREATE OR REPLACE FUNCTION public.sig_cotep_publico_dados(p_codigo text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $f$
DECLARE v_ano int := extract(year FROM now() AT TIME ZONE 'America/Sao_Paulo')::int;
BEGIN
 PERFORM private.sig_cotep_publico_liberado(p_codigo);
 RETURN jsonb_build_object(
  'limites', coalesce((SELECT jsonb_agg(jsonb_build_object('ano',ano,'unidade_gestora',unidade_gestora,'valor_limite',valor_limite,
     'base_normativa',base_normativa,'validacao_juridica',validacao_juridica,'padrao',padrao)) FROM public.sig_cotep_limites WHERE ano >= v_ano - 1), '[]'),
  'elementos', coalesce((SELECT jsonb_agg(jsonb_build_object('codigo',codigo,'descricao',descricao,'ativo',ativo,'grupo',grupo,'relacao_tic',relacao_tic,
     'aplicacao',aplicacao,'orientacao',orientacao,'classificador_url',classificador_url,'ordem',ordem)) FROM public.sig_cotep_elementos WHERE ativo), '[]'),
  'centros', coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'nome',nome,'ativo',ativo)) FROM public.sig_cotep_centros WHERE ativo), '[]'),
  'coteps', coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'ano',ano,'unidade_gestora',unidade_gestora,'numero',numero,'objeto',objeto,'situacao',situacao))
     FROM public.sig_cotep_coteps WHERE ano >= v_ano - 1), '[]'),
  'procedimentos', coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'cotep_id',cotep_id,'ano',ano,'unidade_gestora',unidade_gestora,'numero',numero,
     'situacao',situacao,'elemento_item',elemento_item,'valor_estimado',valor_estimado,'valor_homologado',valor_homologado,'ativo',ativo))
     FROM public.sig_cotep_procedimentos WHERE ano >= v_ano - 1), '[]'),
  'intencoes', coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'ano',ano,'unidade_gestora',unidade_gestora,'centro',centro,'objeto',objeto,
     'elemento_item',elemento_item,'valor_estimado',valor_estimado,'valor_reservado',valor_reservado,'situacao',situacao,'prioridade',prioridade,
     'cotep_numero',cotep_numero,'cotep_id',cotep_id,'origem',origem,'criado_em',criado_em,'atualizado_em',atualizado_em))
     FROM public.sig_cotep_intencoes WHERE ano >= v_ano - 1), '[]'),
  'saldos', coalesce((SELECT jsonb_agg(to_jsonb(s)) FROM public.sig_cotep_saldos s WHERE ano >= v_ano - 1), '[]'));
END $f$;
