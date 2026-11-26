FROM node:24.22.3-bookworm-slim@sha256:873f586f3794f52281bd039bf02c048a0be08fde619338f9941bad1eb6b34530 AS build
WORKDIR /src
RUN --mount=type=secret,id=build_ca \
    if [ -f /run/secrets/build_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/build_ca; fi; \
    npm install --global pnpm@11.25.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/worker/package.json apps/worker/
COPY apps/web/package.json apps/web/
COPY packages/foundation/package.json packages/foundation/
RUN --mount=type=secret,id=build_ca \
    if [ -f /run/secrets/build_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/build_ca; fi; \
    pnpm install --frozen-lockfile
COPY tsconfig.base.json ./
COPY apps apps
COPY packages packages
RUN --mount=type=secret,id=build_ca \
    if [ -f /run/secrets/build_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/build_ca; fi; \
    pnpm build && pnpm --filter @km/api deploy --prod /out/api && pnpm --filter @km/worker deploy --prod /out/worker

FROM node:24.22.3-bookworm-slim@sha256:873f586f3794f52281bd039bf02c048a0be08fde619338f9941bad1eb6b34530 AS runtime
WORKDIR /app
RUN install -d -o node -g node -m 0750 /var/lib/km/objects
COPY --from=build /out/api /app/api
COPY --from=build /out/worker /app/worker
COPY --chmod=0644 scripts/storage.mjs /app/storage.mjs
COPY --chmod=0644 scripts/probe.cjs /app/probe.cjs
USER node
CMD ["node", "api/dist/main.js"]

FROM nginxinc/nginx-unprivileged:1.30-alpine@sha256:f5116ed4606f3eb015dd4a8e28cb9b351476dc0ad4bc6e9f93b19cec130cdf03 AS web
COPY --chmod=0644 infra/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /src/apps/web/dist /usr/share/nginx/html

FROM pgvector/pgvector:0.8.2-pg17@sha256:feb68f4f15446397d8cac7f4fe48fe4586de83160d1fc48b46283312d1a33966 AS database
COPY --chmod=0755 infra/00-roles.sh /docker-entrypoint-initdb.d/00-roles.sh
COPY --chmod=0644 infra/*.sql /km-infra/
