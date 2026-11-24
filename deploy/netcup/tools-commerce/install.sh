#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "$0")"
for f in confenge-tools-subscriptions.service confenge-tools-subscriptions.timer confenge-tools-subscriptions-alert.service; do
  install -o root -g root -m 0644 "$f" "/etc/systemd/system/$f"
done
systemctl daemon-reload
# Installation never enables charging, and never starts the timer implicitly.
systemctl cat confenge-tools-subscriptions.timer >/dev/null
printf '%s\n' 'Installed. After authorized review: systemctl enable --now confenge-tools-subscriptions.timer'
