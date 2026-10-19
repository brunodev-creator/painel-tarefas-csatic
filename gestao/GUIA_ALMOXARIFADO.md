# Almoxarifado — SIG CSA-TIC / DTS / PMMG

## Escopo (primeira entrega de 19/10/2026)

Tela integrada no **SIG existente**; usa a navegação, sessão Supabase, perfis e estilo institucional. Não contém controle de estoque, distribuição, recebimento, entrega ou inventário. Os registros são **consultas RIPC**, não atestados de entrega.

- `gestao/assets/almoxarifado.js`: mapa vetorial aproximado com 17 áreas clicáveis (RMBH + RPMs 4–19), fallback IBGE, filtros, pesquisa, ordenação, paginação e detalhes.
- `gestao/assets/institucional.css`: estilos institucionais e responsivos.
- `gestao/assets/maps/rpm-regioes-aproximadas.json`: **17 polígonos SVG traçados da imagem fornecida**, sem georreferenciamento e sem homologação; selecionáveis por toda a área.
- `gestao/assets/maps/mg-ibge-contorno.geojson`: polígono estadual do IBGE, usado como fallback se o traçado ilustrativo não carregar.
- `gestao/assets/maps/rpm-limites-manifest.json`: pendência explícita de homologação das fronteiras das RPM.
- `gestao/database/migrations/20261019_sig_almox_destinacoes_leitura.sql`: cria tabela exclusiva de consulta `sig_almox_destinacoes` (sem alteração de tabelas existentes) e sua primeira carga RIPC.
- `gestao/database/migrations/20261019_sig_almox_enriquecer_processos.sql`: associa registros da aba `CONTROLE_PROCESSOS_COMPRA` por processo de compra e copia seu número completo e estado.

## Origem, classificação e limitação dos dados

Origem: planilha [agora vai - PLANILHA ATUAL](https://docs.google.com/spreadsheets/d/1dxzDySXU1h5BKJkW1_mHpNX9KRwgX6Ol5b_kRqeRrJA/edit), abas **DESTINACAO_REPASSES** e **CONTROLE_PROCESSOS_COMPRA**. A consulta de 19/10/2026 encontrou **43 linhas RIPC únicas**. Dessas, **17** continham menção textual explícita a uma RPM na coluna `Destino`; **26** não identificavam RPM, e **permanecem sem classificação**. Não se infere RPM pelo local de compras, unidade executora, município sozinho ou região da dotação.

A lista territorial é composta por **19 RPM** e **17 seletores**: 16 RPM individuais (4ª a 19ª) + RMBH, que agrupa as 1ª, 2ª e 3ª. No filtro RMBH o número original continua preservado.

A `chave_origem` RIPC é chave primária: cada registro é único. A identificação de processo permite computar processos distintos, sem multiplicar o processo quando ele destina materiais a várias RPM. O campo `valor_ripc` é **valor de destinação no RIPC**, e não valor total da licitação/contrato. Não se presume divisão automática de valores e quantitativos entre unidades.

`quantidade`, `situacao_entrega` e `data_aquisicao` foram deixados como **NULL** porque os campos não existiam/estavam vazios nas origens examinadas. O status **OK** de validação RIPC **NÃO** é indicação de entrega. A situação do processo de compra, quando conhecida, pode ser filtrada separadamente.

Dados são uma **fotografia importada** e **não sincronizam automaticamente** com a planilha após alteração. “Atualizar consulta” relê o banco, não executa o Apps Script nem importa a planilha novamente. Para atualizar, uma rotina de ingestão futura deverá refazer a projeção a partir das abas originais, sempre com verificação de integridade e classificação explícita.

## Mapa e fonte cartográfica

O mapa principal agora apresenta **17 formas vetoriais aproximadas**, desenhadas por segmentação das cores e contornos da imagem de referência enviada pelo usuário. Todas as formas podem ser clicadas, inclusive a RMBH unificada. São uma **representação ilustrativa**, não áreas homologadas ou um GeoJSON georreferenciado. O contorno real do estado derivado do IBGE fica como fallback, sem substituir o status de aproximação da camada regional. Zoom, deslocamento, foco e seleção foram mantidos.

**Falta:** conjunto vetorial oficial/validado com **19 feições poligonais** (1 por RPM), sistema de referência declarado, revisão territorial e documento de homologação pela PMMG. Os municípios e eventuais sobreposições deverão ser revisados institucionalmente. Só depois de validar os polígonos contra o limite do estado e a cobertura das 19 RPM será possível desenhar as **17 áreas clicáveis reais**, mesclando visualmente a RMBH sem unir os cadastros. A vetorização de referência pode ser usada para navegação visual, mas **não** será designada como limite oficial, usada para geocodificar unidades ou determinar automaticamente RPM a partir de coordenadas.

## Segurança

- Somente usuários autenticados com papéis que já podiam consultar cota orçamentária podem abrir Almoxarifado.
- Na tabela própria, a política `SELECT` usa `private.can_view_cota()`. Leitura anônima e escrita por `authenticated` ficam revogadas. A tabela não contém senhas nem credenciais.
- Nenhuma migração altera `processos`, `aipc`, `repasses`, `empenhos`, contratos, SOFI ou V6.
- No modo demonstração, o mapa e os seletores podem aparecer, mas **nenhuma aquisição institucional real** é exibida.

## Testes realizados

- Confirmação da integridade dos 17 polígonos esquemáticos, com 17 IDs únicos, e do GeoJSON de contorno de Minas Gerais no fallback.
- 19 RPM representadas por 17 seletores; RMBH 1–3, 12ª e 19ª individuais.
- 43 chaves RIPC únicas, 17 classificadas, 26 não classificadas.
- Filtros de ano, situação do processo de compra, tipo, destino, pesquisa e paginação, inclusive registros ausentes.
- Consulta e detalhe dos registros, preservando campos NULL de entrega/quantidade.
- Integridade da navegação e sintaxe JavaScript.
- Política RLS: SELECT anônimo não permitido, SELECT autenticado sob política, sem escrita para perfis clientes.

## Para a próxima etapa

1. Opcionalmente substituir a vetorização **aproximada** por GeoJSON/SVG **georreferenciado e validado** para as 19 RPM atuais, após conferência territorial institucional.
2. Obter uma fonte oficial de **quantidade, empenho, entrega, recebimento e destino individual**, caso a organização autorize a integração.
3. Implementar sincronização segura da nova tabela de leitura com a fonte primária, incluindo revisão de classificações e atualização de status.
