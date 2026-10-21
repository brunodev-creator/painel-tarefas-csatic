# SIG — Intenções e reservas de COTEP (21/10/2026)

## Acesso e operação
O menu **Intenções COTEP** foi integrado a todas as contas ativas do SIG. Qualquer usuário autenticado pode consultar e registrar intenção do centro, com exercício, UG, centro, elemento-item, objeto, valor estimado, data da necessidade e justificativa.

A intenção começa Pendente, sem bloquear saldo. A DTS-1, mediante gestores habilitados pelo administrador em **Gestores DTS-1**, decide se devolve, rejeita, cancela, reserva ou finaliza. Os gestores também cadastram COTEPs por elemento-item, com estimativas e resultados finais.

Todos os usuários ativos podem visualizar as intenções de outros centros. O módulo não libera reservas automaticamente ao vencer a validade; a DTS-1 deve conferir e atualizar cada caso. Existe exportação CSV de intenções.

## Critério de reserva e legalidade
Elemento-item é um indicador gerencial, NÃO é uma unidade autônoma de limite legal de dispensa. Ao aprovar, o gestor deve definir o **ramo de atividade**, categoria (geral/engenharia), valor e validade da reserva, vinculados à UG e ao exercício.

A aprovação confronta: (a) procedimentos finalizados, pelo valor homologado/negociado; (b) procedimentos em andamento, pela estimativa; (c) intenções já reservadas, pelo valor reservado. Fracassados e cancelados não ocupam reserva gerencial. A validação só abrange dados efetivamente cadastrados na base. O sistema não presume valores jurídicos oficiais.

É obrigatório cadastrar uma BASE CONFERIDA da UG, exercício e categoria, incluindo referência documental da conferência no Portal de Compras e demais fontes relevantes. O algoritmo bloqueia a reserva se encontrar QUALQUER procedimento da mesma UG e exercício em andamento ou finalizado sem ramo/categoria, ou histórico «Realizada (a conferir)» com resultado desconhecido. Assim, a simples classificação contábil diferente não libera saldo de ramo possivelmente comum. O gestor não deve confirmar a base sem conferência integral e documental.

A reserva é transacional, com bloqueio de concorrência por exercício, UG, categoria e ramo. O sistema ainda não integra o Portal de Compras e não atesta a disponibilidade legal ou orçamentária oficial.

## COTEP 126/2026 — correção confirmada pelo responsável
- Elemento-item: **3016**.
- Situação: **Finalizada**.
- Valor homologado e negociado: **R$ 2.896,00**.
- Estimativa publicada no aviso: R$ 2.896,14 (conferir fonte oficial).
- Ao cadastrar o histórico, usar **R$ 2.896,00** no campo *Valor final homologado*, não no campo de estimativa.
- UG, ramo e categoria exigem confirmação própria.

A COTEP 130/2026 possui lançamentos em 3016 e 5207 no mesmo procedimento. Não duplicar o total. A COTEP 122/2026 foi registrada no levantamento como fracassada. Ferramentas elétricas segue como intenção sem número/valor/código confirmados.

**Histórico transferido em 21/10/2026 por autorização expressa do usuário:** 12 lançamentos, 11 COTEPs distintas, 12 eventos de auditoria. Importação em operação única, apenas no banco do piloto; o repositório público contém somente estrutura e orientações, não a lista real. Fonte: planilha [Controle Gerencial de COTEPs 2026](https://docs.google.com/spreadsheets/d/1wkXSDV1ZCEfaKdB49mZnOu8VS2EGkPxku6fvgtVBB5M/edit), aba COTEPs 2026, linhas 7 a 18.

- **8 linhas «Realizada (a conferir)»**: R$ 169.876,62 de valores informados, sem inventar valor homologado ou o tipo exato do valor informado.
- **1 linha «Finalizada» (126/2026)**: R$ 2.896,00 homologado e negociado; estimativa do aviso R$ 2.896,14.
- **2 linhas «Em andamento» (130/2026)**: R$ 24.273,95 divididos em 3016 e 5207.
- **1 linha «Fracassada» (122/2026)**: sem elemento-item e sem valor informados, respeitados com NULL e referência técnica zero.
- **Total de valores conhecidos: R$ 197.046,57**; não corresponde ao limite jurídico já consumido.

**Cuidado:** a planilha não traz a UG individual de cada lançamento. Por isso, a unidade **1250071 foi atribuída como referência operacional PROVISÓRIA** a todos os registros, com aviso no campo documental de cada linha; não está comprovada. Ramo de atividade e categoria também ficam sem preenchimento até revisão pela DTS-1. Bases anuais não foram marcadas como conferidas, e o sistema não libera reservas baseadas no histórico parcial.

A observação da COTEP 126/2026 foi atualizada manualmente na planilha (célula K16), preservando F16 = R$ 2.896,00 e fórmulas. O SIG não sincroniza automaticamente com a planilha. Antes de compartilhar o módulo operacional com todos os centros, validar formalmente o ambiente externo, perfis e governança de dados.

## Banco e permissões
Tabelas: sig_cotep_intencoes, sig_cotep_procedimentos, sig_cotep_bases, sig_cotep_gestores e sig_cotep_eventos.
- RLS e SELECT exclusivo para contas ativas; identificação de gestores visível apenas ao próprio gestor e ao administrador.
- Sem INSERT, UPDATE ou DELETE diretamente por REST para contas autenticadas. Toda escrita passa pelo RPC sig_cotep_acao, com autenticação e controle de função (usuário x gestor x administrador).
- Trilhas registradas em sig_cotep_eventos. Locks transacionais para reserva e alteração de procedimentos no mesmo agrupamento.
- Não modifica V5/V6/V6.1/V7, AIPC, processos, empenhos, cotas ou almoxarifado.

Arquivos:
- gestao/database/migrations/20261021_sig_cotep_intencoes_reservas.sql
- gestao/database/migrations/20261021_sig_cotep_hardening.sql
- gestao/database/migrations/20261021_cotep_historico_sem_homologacao.sql
- gestao/database/migrations/20261021_cotep_historico_edicao_estavel.sql
- gestao/assets/cotep.js
- gestao/assets/cotep.css
- gestao/index.html
- gestao/assets/app.js

## Validações
- Quatro migrations aplicadas com sucesso no projeto Supabase piloto.
- Sintaxe dos JavaScript verificada.
- Transação reversível no banco criou intenção de teste, validou base fictícia e reservou valor sem deixar dados persistidos.
- Um usuário setorial sem autorização tentou validar base e recebeu bloqueio do banco.
- Teste do componente com dados em memória confirmou formatação de valor homologado.
- Importação conferida com consulta SQL: 12 registros, 11 números únicos, somas por situação reconciliadas com a planilha, e 12 eventos de auditoria.
- **Ainda não foi executado teste funcional real no navegador com diferentes contas e celulares.**

## Ativação operacional
1. Confirmar aprovação institucional de segurança para o ambiente externo de dados.
2. Convidar militares dos centros para o SIG.
3. Administrador delega os responsáveis DTS-1 em Gestores DTS-1.
4. DTS-1 reconcilia os procedimentos históricos e confere a base por ramo, UG e exercício.
5. Só após validar a base, aprovar reservas; conferir periodicamente e ao final de cada COTEP.
