#!/usr/bin/env bash
set -euo pipefail
case "$1" in
  start)
    scan="$2"
    mkdir -p "$scan/signatures"
    chmod 755 "$scan"
    marker="$(printf %s KM-WIKI-LOCAL-SIGNATURE | od -An -v -tx1 | tr -d ' \n')"
    printf 'KnowledgeManagerIntegration:0:*:%s\n' "$marker" > "$scan/signatures/wiki.ndb"
    cat > "$scan/clamd.conf" <<CONFIG
Foreground yes
DatabaseDirectory $scan/signatures
LocalSocket $scan/clamd.sock
LocalSocketMode 666
FixStaleSocket yes
StreamMaxLength 10M
CONFIG
    clamd --version
    clamd --config-file="$scan/clamd.conf" > "$scan/clamd.log" 2>&1 &
    printf '%s\n' "$!" > "$scan/pid"
    for _ in {1..80}; do
      if [[ -S "$scan/clamd.sock" ]]; then exit 0; fi
      kill -0 "$(cat "$scan/pid")" || break
      sleep .2
    done
    cat "$scan/clamd.log" >&2
    exit 1
    ;;
  stop)
    scan="$2"
    if [[ -f "$scan/pid" ]]; then
      kill "$(cat "$scan/pid")" 2>/dev/null || true
      for _ in {1..50}; do
        [[ -S "$scan/clamd.sock" ]] || break
        sleep .1
      done
      rm -f "$scan/pid" "$scan/clamd.sock"
    fi
    ;;
  *) exit 2 ;;
esac
