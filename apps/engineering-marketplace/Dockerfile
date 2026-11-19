ARG NODE_IMAGE=node:22.22.2-bookworm-slim
FROM ${NODE_IMAGE} AS build
WORKDIR /build
ENV MEDUSA_DISABLE_TELEMETRY=true MERCUR_DISABLE_TELEMETRY=true DO_NOT_TRACK=1
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --engine-strict --ignore-scripts --legacy-peer-deps --no-audit --no-fund
COPY medusa-config.ts tsconfig.json ./
COPY src ./src
COPY config ./config
COPY scripts ./scripts
# Compilation loads configuration but does not connect to these dummy services.
# No deployment credential is accepted as a build argument or copied in a layer.
RUN NODE_ENV=development DATABASE_URL=postgresql://build:unused@127.0.0.1:5432/build JWT_SECRET=build-only-placeholder-not-a-deployment-key COOKIE_SECRET=build-only-placeholder-not-a-deployment-key MARKETPLACE_PAYMENTS_ENABLED=false npm run build
# Preserve runtime CJS and JSON resources independently of TypeScript's emit.
RUN cp -R config .medusa/server/ && test -f .medusa/server/medusa-config.js && test -f .medusa/server/config/domain.cjs && test -f .medusa/server/config/intents.json && npm prune --omit=dev --engine-strict --ignore-scripts --legacy-peer-deps --no-audit --no-fund

FROM ${NODE_IMAGE} AS runtime
WORKDIR /app
ENV NODE_ENV=production MEDUSA_DISABLE_TELEMETRY=true MERCUR_DISABLE_TELEMETRY=true DO_NOT_TRACK=1 NODE_OPTIONS=--max-old-space-size=1536
COPY --from=build --chown=node:node /build/.medusa/server ./
COPY --from=build --chown=node:node /build/node_modules ./node_modules
COPY --from=build --chown=node:node /build/scripts ./scripts
USER node
EXPOSE 9000
ENTRYPOINT ["node", "/app/scripts/medusa.cjs"]
CMD ["start", "--host", "0.0.0.0", "--port", "9000"]
