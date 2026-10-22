#!/usr/bin/env bash
# Executa a suíte SQL do módulo COTEP num PostgreSQL local descartável (>=15).
# Uso: PGHOST=/caminho/socket PGPORT=5433 PGUSER=postgres gestao/tests/sql/run.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
DB=${SIG_TEST_DB:-sig_cotep_teste}
P="psql -v ON_ERROR_STOP=1 -q -X"
$P -d postgres -c "DROP DATABASE IF EXISTS $DB" -c "CREATE DATABASE $DB" >/dev/null
for f in tests/sql/00_supabase_stub.sql tests/sql/01_usuarios_teste.sql \
  database/migrations/20261021_sig_cotep_intencoes_reservas.sql database/migrations/20261021_sig_cotep_hardening.sql \
  database/migrations/20261021_cotep_historico_sem_homologacao.sql database/migrations/20261021_cotep_historico_edicao_estavel.sql \
  tests/sql/02_historico_validacao.sql database/migrations/20261021_sig_cotep_v2_elemento_item.sql database/migrations/20261021_sig_cotep_visitante.sql database/migrations/20261022_perfil_dts1.sql; do
  $P -d $DB -f "$f" >/dev/null 2>&1 || { echo "Falha ao aplicar $f"; $P -d $DB -f "$f"; exit 1; }
done
cat tests/sql/10_testes_cotep_v2.sql tests/sql/11_testes_visitante.sql tests/sql/12_testes_perfil_dts1.sql | $P -d $DB 2>&1 | grep -E "PASS|FALHOU|ERROR|TODOS|TESTES" | sed -E 's/^(psql:[^ ]* )?NOTICE:  //'
bash tests/sql/concorrencia.sh "$DB"
