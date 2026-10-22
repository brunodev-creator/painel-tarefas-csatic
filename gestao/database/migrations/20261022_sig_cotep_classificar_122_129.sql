-- Pendências de elemento-item das COTEPs 122/2026 e 129/2026 e restauração da regra de integridade.
-- A migration 20261022012418 (cotep_2026_historico_sem_elemento_com_valor) passou a aceitar COTEP
-- «Em andamento» sem elemento-item: nesse caso o valor não abate o saldo de nenhum código.

-- 129/2026 — «Aquisição de ferramentas» (R$ 6.817,05, em andamento): elemento-item 3022,
-- Ferramentas, ferragens e utensílios (Classificador MG 07/10/2026). Classificação pelo objeto.
UPDATE public.sig_cotep_procedimentos x SET elemento_item = '3022', atualizado_em = now()
FROM public.sig_cotep_coteps c
WHERE c.id = x.cotep_id AND c.ano = 2026 AND c.numero = '129/2026' AND x.elemento_item IS NULL;
UPDATE public.sig_cotep_coteps SET documento = concat_ws(' | ', documento,
 'Classificada em 22/10/2026 no elemento-item 3022 (ferramentas) pelo objeto.'),
 atualizado_em = now()
WHERE ano = 2026 AND numero = '129/2026';

-- 122/2026 — «Impressora 3D e suprimentos» (R$ 24.271,00, fracassada): relançada como 130/2026,
-- que tem a impressora em 5207 e os suprimentos em 3016. Rateio indicativo pela 130; fracassada não abate saldo.
UPDATE public.sig_cotep_procedimentos x SET elemento_item = '5207', valor_estimado = 23596.05, atualizado_em = now()
FROM public.sig_cotep_coteps c
WHERE c.id = x.cotep_id AND c.ano = 2026 AND c.numero = '122/2026' AND x.elemento_item IS NULL;
INSERT INTO public.sig_cotep_procedimentos (cotep_id, ano, numero, unidade_gestora, elemento_item, objeto, situacao, valor_estimado, documento)
SELECT c.id, c.ano, c.numero, c.unidade_gestora, '3016', c.objeto, c.situacao, 674.95,
 'Suprimentos da impressora 3D (rateio indicativo pela COTEP 130/2026).'
FROM public.sig_cotep_coteps c
WHERE c.ano = 2026 AND c.numero = '122/2026'
  AND NOT EXISTS (SELECT 1 FROM public.sig_cotep_procedimentos x WHERE x.cotep_id = c.id AND x.elemento_item = '3016');
UPDATE public.sig_cotep_coteps SET documento = concat_ws(' | ', documento,
 'Classificada em 22/10/2026 em 5207 (impressora 3D) e 3016 (suprimentos), conforme o relançamento 130/2026.'),
 atualizado_em = now()
WHERE ano = 2026 AND numero = '122/2026';

SELECT private.sig_cotep_evento('Classificação', 'COTEP 129/2026 classificada no elemento-item 3022 (ferramentas).', NULL, id, NULL, '3022', 6817.05, NULL)
FROM public.sig_cotep_coteps WHERE ano = 2026 AND numero = '129/2026';
SELECT private.sig_cotep_evento('Classificação', 'COTEP 122/2026 (fracassada) classificada em 5207 e 3016 pelo relançamento 130/2026.', NULL, id, NULL, NULL, NULL, NULL)
FROM public.sig_cotep_coteps WHERE ano = 2026 AND numero = '122/2026';

-- Regra restaurada: sem elemento-item só COTEP fracassada, deserta ou cancelada (que não ocupam limite).
-- Restrição adicional (a anterior, mais permissiva, permanece e passa a ser redundante).
ALTER TABLE public.sig_cotep_procedimentos ADD CONSTRAINT sig_cotep_procedimentos_elemento_obrigatorio
 CHECK (elemento_item IS NOT NULL OR situacao IN ('Fracassada','Deserta','Cancelada'));
