#!/usr/bin/env python3
"""Create private, disabled deployment configuration without displaying secrets."""
import argparse
import os
from pathlib import Path
import re
import secrets


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--directory', type=Path, required=True)
    parser.add_argument('--image', required=True, help='Registry image pinned with @sha256:...')
    args = parser.parse_args()
    if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._:/-]+@sha256:[a-f0-9]{64}', args.image):
        parser.error('--image must be a digest-pinned registry image')
    directory = args.directory.resolve()
    directory.mkdir(parents=True, mode=0o700, exist_ok=True)
    if directory.stat().st_mode & 0o077:
        parser.error('The configuration directory must have mode 0700')
    names = ('compose.env', 'runtime.env', 'gateway.env')
    if any((directory / name).exists() for name in names):
        parser.error('Configuration already exists; no file was overwritten')
    db_admin_password, db_password, redis_password, jwt, cookie, gateway, session = [secrets.token_urlsafe(32) for _ in range(7)]
    contents = {
        'compose.env': '\n'.join([
            f'MARKETPLACE_IMAGE={args.image}',
            f'MARKETPLACE_RUNTIME_ENV={directory}/runtime.env',
            f'MARKETPLACE_DB_ADMIN_PASSWORD={db_admin_password}',
            f'MARKETPLACE_DB_PASSWORD={db_password}',
            f'MARKETPLACE_REDIS_PASSWORD={redis_password}', '',
        ]),
        'runtime.env': '\n'.join([
            'NODE_ENV=production', 'MEDUSA_DISABLE_TELEMETRY=true', 'MERCUR_DISABLE_TELEMETRY=true', 'DO_NOT_TRACK=1',
            f'DATABASE_URL=postgresql://marketplace:{db_password}@postgres:5432/marketplace',
            f'REDIS_URL=redis://:{redis_password}@redis:6379/0',
            f'JWT_SECRET={jwt}', f'COOKIE_SECRET={cookie}',
            f'MARKETPLACE_GATEWAY_KEY={gateway}',
            'MARKETPLACE_PUBLIC_ORIGIN=https://confenge.com.br',
            'BACKEND_URL=https://confenge.com.br',
            'MARKETPLACE_PAYMENTS_ENABLED=false', 'MARKETPLACE_PAYMENT_MODE=test',
            'STRIPE_SECRET_KEY=', 'STRIPE_OPERATOR_WEBHOOK_SECRET=', 'STRIPE_SELLERS_WEBHOOK_SECRET=',
            '# Set MARKETPLACE_COMMISSION_BPS only after an explicit commercial decision.',
            'MARKETPLACE_READINESS_PUBLISHABLE_KEY=', '',
        ]),
        'gateway.env': '\n'.join([
            '# Merge these entries into /etc/confenge-web/runtime.env; do not replace that file.',
            'ENGINEERING_MARKETPLACE_MODE=off',
            'ENGINEERING_MARKETPLACE_URL=http://127.0.0.1:19050',
            'ENGINEERING_MARKETPLACE_PUBLISHABLE_KEY=SET_AFTER_SETUP',
            f'ENGINEERING_MARKETPLACE_SESSION_KEY={session}',
            f'ENGINEERING_MARKETPLACE_GATEWAY_KEY={gateway}',
            'ENGINEERING_MARKETPLACE_CONNECT_WEBHOOK_SECRET=', '',
        ]),
    }
    for name in names:
        fd = os.open(directory / name, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, 'w', encoding='utf-8') as target:
            target.write(contents[name])
    print('Created private compose.env, runtime.env and gateway.env; new business and payments remain disabled.')


if __name__ == '__main__':
    main()
