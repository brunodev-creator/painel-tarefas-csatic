#!/usr/bin/env bash
# Duas sessões da DTS-1 tentam reservar ao mesmo tempo valores que, somados, excedem o saldo.
# A primeira segura a transação aberta por 2 s; a segunda precisa esperar o bloqueio e ser recusada.
set -uo pipefail
DB=$1; P="psql -X -q -At -d $DB"
G=00000000-0000-0000-0000-0000000000b1; C=00000000-0000-0000-0000-0000000000c1
saldo(){ $P -c "select saldo from public.sig_cotep_saldos where ano=2026 and elemento_item='3964'"; }
# 3964 está acima do limite após o teste de exceção; usa-se 3921 (saldo conhecido) com duas intenções novas.
mk(){ $P -c "set role authenticated; select set_config('request.jwt.claim.sub','$C',false);
 select public.sig_cotep_acao(jsonb_build_object('acao','criar_intencao','centro','Centro A','objeto','Concorrência $1','elemento_item','3921','valor_estimado','$2','justificativa','Teste de concorrência'))->>'id'" | tail -1; }
S0=$($P -c "select saldo from public.sig_cotep_saldos where ano=2026 and elemento_item='3921'")
V=$(python3 -c "print(round($S0*0.6,2))")
A=$(mk A "$V"); B=$(mk B "$V")
reserva(){ $P -c "set role authenticated; select set_config('request.jwt.claim.sub','$G',false); begin;
 select public.sig_cotep_acao(jsonb_build_object('acao','reservar','id','$1')); select pg_sleep($2); commit;" >/dev/null 2>"${TMPDIR:-/tmp}/conc_$1.err"; echo $?; }
reserva "$A" 2 > ${TMPDIR:-/tmp}/conc_A.rc & sleep 0.4
RB=$(reserva "$B" 0); wait; RA=$(cat ${TMPDIR:-/tmp}/conc_A.rc)
S1=$($P -c "select saldo from public.sig_cotep_saldos where ano=2026 and elemento_item='3921'")
NRES=$($P -c "select count(*) from public.sig_cotep_intencoes where id in ('$A','$B') and situacao='Reservada'")
if [ "$RA" = 0 ] && [ "$RB" != 0 ] && [ "$NRES" = 1 ] && grep -q "Saldo insuficiente" "${TMPDIR:-/tmp}/conc_$B.err"; then
 echo "PASS  Concorrência: 2 reservas simultâneas de R\$ $V com saldo R\$ $S0 → só uma aprovada (saldo final R\$ $S1)"
else echo "FALHOU concorrência: A=$RA B=$RB reservadas=$NRES saldo=$S1"; cat "${TMPDIR:-/tmp}/conc_$B.err"; exit 1; fi
