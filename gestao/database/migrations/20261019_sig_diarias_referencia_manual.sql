-- Controle temporário de diárias (15XX) para conferência com o Portal Contábil.
-- O registro não substitui cotas, documentos, empenhos ou abatimentos V6.
-- Nunca tratar o valor informado como cota oficialmente disponível em tempo real.
CREATE TABLE IF NOT EXISTS public.sig_cotas_diarias_referencia (
 dotacao_normalizada text PRIMARY KEY CHECK (dotacao_normalizada ~ '^[0-9]{32}$'),
 saldo_informado_centavos bigint NOT NULL CHECK (saldo_informado_centavos >= 0),
 observado_em timestamptz NOT NULL,
 origem text NOT NULL CHECK (length(origem) BETWEEN 5 AND 250),
 justificativa text NOT NULL CHECK (length(justificativa) BETWEEN 5 AND 1000),
 ativo boolean NOT NULL DEFAULT true,
 registrado_em timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.sig_cotas_diarias_referencia IS
 'Exceção documental transitória para diárias no painel de conferência; não é o saldo oficial e não altera V6.';
ALTER TABLE public.sig_cotas_diarias_referencia ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sig_cotas_diarias_referencia FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.sig_cotas_diarias_referencia TO authenticated;
CREATE POLICY sig_diarias_referencia_leitura ON public.sig_cotas_diarias_referencia
 FOR SELECT TO authenticated USING (private.can_view_cota());
-- Aprovação explícita na conversa: consultar R$ 2.085,00 para a única dotação
-- de diárias visível no extrato contábil, mantendo as demais sem saldo confirmado.
INSERT INTO public.sig_cotas_diarias_referencia
 (dotacao_normalizada,saldo_informado_centavos,observado_em,origem,justificativa)
VALUES
 ('12510618113743650001339015006020',208500,
  '2026-10-19T11:54:00-03:00'::timestamptz,
  'Portal Contábil PMMG, print da conta global 998020301',
  'Valor de referência provisório informado pelo usuário em 19/10/2026. Sem método de abatimento para diárias no SIG; excluir diárias da conciliação de empenhos e não presumir zero nas outras dotações.');
