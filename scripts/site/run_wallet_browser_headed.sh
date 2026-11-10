#!/usr/bin/env bash
set -euo pipefail

if [ -z "${DISPLAY:-}" ]; then
  echo "WALLET_BROWSER_BLOCKED: headed browser requires DISPLAY" >&2
  exit 1
fi
if [ "$#" -eq 0 ]; then
  echo "WALLET_BROWSER_BLOCKED: headed browser requires a test command" >&2
  exit 1
fi

openbox --sm-disable >/tmp/wallet-browser-openbox.log 2>&1 &
wm_pid=$!

cleanup() {
  kill "$wm_pid" 2>/dev/null || true
  wait "$wm_pid" 2>/dev/null || true
}
trap cleanup EXIT

wm_failed() {
  echo "WALLET_BROWSER_BLOCKED: $1" >&2
  tail -n 20 /tmp/wallet-browser-openbox.log >&2 || true
  exit 1
}

for _ in $(seq 1 15); do
  if ! kill -0 "$wm_pid" 2>/dev/null; then
    wm_failed "Openbox exited before becoming ready"
  fi
  if xprop -root _NET_SUPPORTING_WM_CHECK 2>/dev/null | grep -Eq 'window id #[[:space:]]*0x[0-9a-fA-F]+'; then
    "$@"
    exit 0
  fi
  sleep 1
done

wm_failed "Openbox did not advertise _NET_SUPPORTING_WM_CHECK"
