-- SIG CSA-TIC / DTS — conciliação das COTEPs de 2026.
-- Histórico pode registrar valor estimado mesmo quando o elemento-item ainda
-- não foi comprovado, evitando confundir ausência de classificação com R$ 0.
-- Apenas COTEPs em andamento, fracassadas, desertas ou canceladas podem ficar
-- sem elemento-item. Finalizadas EXIGEM elemento-item e homologação.
-- IMPORTANTE: sem classificação, o valor em andamento NÃO participa da
-- visão sig_cotep_saldos; o frontend apresenta alerta destacado.
-- A classificação definitiva de 129/2026 deve ser realizada por item antes
-- de novas reservas no mesmo ramo de atividade.
ALTER TABLE public.sig_cotep_procedimentos
 DROP CONSTRAINT IF EXISTS sig_cotep_procedimentos_sem_elemento_check;

ALTER TABLE public.sig_cotep_procedimentos
 ADD CONSTRAINT sig_cotep_procedimentos_sem_elemento_check
 CHECK (
   elemento_item IS NOT NULL
   OR (
     situacao IN ('Em andamento','Fracassada','Deserta','Cancelada')
     AND valor_homologado IS NULL
   )
 );

COMMENT ON CONSTRAINT sig_cotep_procedimentos_sem_elemento_check
 ON public.sig_cotep_procedimentos IS
 'Permite histórico estimado positivo sem elemento-item confirmado; tais registros não entram em saldo por elemento-item até classificação. Apenas Em andamento e estados sem contratação, nunca Finalizada.';
