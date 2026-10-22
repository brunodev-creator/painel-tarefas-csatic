-- Descrições oficiais (Classificador Econômico da Despesa – SEPLAG/MG, atualizado em 07/10/2026)
-- para os elementos-itens do histórico que estavam sem descrição no catálogo.
UPDATE public.sig_cotep_elementos AS e SET descricao = v.descricao, aplicacao = v.aplicacao, orientacao = v.orientacao,
 classificador_url = 'https://drive.google.com/file/d/1Fo8GbzxJm5ThG0FLPsQPsEVjqVkU_X__/view', atualizado_em = now()
FROM (VALUES
 ('3024','Peças e acessórios para equipamentos e outros materiais permanentes',
  'Materiais para conservação, recuperação e reparo de equipamentos, de material permanente e respectivas peças de reposição.',
  'Excluem-se peças e acessórios para equipamento de informática, classificados em item específico (30-16).'),
 ('3964','Serviços de mapeamento e georreferenciamento',
  'Serviços de mapeamento e georreferenciamento em geral, tais como aerolevantamento, produção de ortofotos, serviços de engenharia de fotogrametria e outros geo-serviços, medição de terrenos, estudos, projetos e levantamentos topográficos.',
  NULL),
 ('5203','Armamento e equipamento de uso policial',
  'Armamentos em geral e equipamentos de manobra, proteção e segurança, desde que considerados material permanente, e outros que tenham emprego em suporte às atividades policiais.',
  NULL)
) AS v(codigo, descricao, aplicacao, orientacao)
WHERE e.codigo = v.codigo;
