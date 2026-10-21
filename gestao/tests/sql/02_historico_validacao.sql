-- Reproduz o estado importado em 21/10/2026 (12 lançamentos, 11 COTEPs) ANTES da migration v2.
-- Valores de 3016 e 5207 conforme validação informada pela DTS-1; os quatro lançamentos dos demais
-- elementos-itens (3024, 5203, 3964, 3921) usam valores SINTÉTICOS que somam R$ 73.130,00,
-- apenas para fechar o total importado de R$ 169.876,62 em «Realizada (a conferir)».
INSERT INTO public.sig_cotep_procedimentos(ano,numero,unidade_gestora,elemento_item,objeto,situacao,valor_estimado,valor_homologado,documento) VALUES
 (2026,'43/2026','1250071','3016','Objeto de validação 43/2026','Realizada (a conferir)',28658.70,NULL,'UG provisória'),
 (2026,'48/2026','1250071','3016','Objeto de validação 48/2026','Realizada (a conferir)',5450.00,NULL,'UG provisória'),
 (2026,'64/2026','1250071','3016','Objeto de validação 64/2026','Realizada (a conferir)',21937.92,NULL,'UG provisória'),
 (2026,'126/2026','1250071','3016','Objeto de validação 126/2026','Finalizada',2896.14,2896.00,'UG provisória'),
 (2026,'130/2026','1250071','3016','Objeto de validação 130/2026','Em andamento',674.95,NULL,'UG provisória'),
 (2026,'95/2026','1250071','5207','Objeto de validação 95/2026','Realizada (a conferir)',40700.00,NULL,'UG provisória'),
 (2026,'130/2026','1250071','5207','Objeto de validação 130/2026','Em andamento',23599.00,NULL,'UG provisória'),
 (2026,'122/2026','1250071',NULL,'Objeto de validação 122/2026','Fracassada',0,NULL,'UG provisória'),
 (2026,'901/2026','1250071','3024','Lançamento sintético 3024','Realizada (a conferir)',20000.00,NULL,'SINTÉTICO'),
 (2026,'902/2026','1250071','5203','Lançamento sintético 5203','Realizada (a conferir)',30000.00,NULL,'SINTÉTICO'),
 (2026,'903/2026','1250071','3964','Lançamento sintético 3964','Realizada (a conferir)',13130.00,NULL,'SINTÉTICO'),
 (2026,'904/2026','1250071','3921','Lançamento sintético 3921','Realizada (a conferir)',10000.00,NULL,'SINTÉTICO');
INSERT INTO public.sig_cotep_eventos(procedimento_id,tipo,descricao,autor)
 SELECT id,'Importação','Importação histórica (fixture de teste)','00000000-0000-0000-0000-0000000000a1' FROM public.sig_cotep_procedimentos;
-- Intenção pendente do modelo antigo (sem prioridade).
INSERT INTO public.sig_cotep_intencoes(ano,unidade_gestora,centro,objeto,elemento_item,valor_estimado,justificativa,criado_por)
 VALUES (2026,'1250071','Centro A','Ferramentas elétricas para manutenção','3016',3000,'Demanda antiga','00000000-0000-0000-0000-0000000000c1');
