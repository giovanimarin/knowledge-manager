FROM node:24.22.3-trixie-slim@sha256:4d00acb4bcc42c454c4eb801526f7ad7f772ea3bd4fd168c5cc2e384abcbb9d4 AS build
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

FROM node:24.22.3-trixie-slim@sha256:4d00acb4bcc42c454c4eb801526f7ad7f772ea3bd4fd168c5cc2e384abcbb9d4 AS runtime
WORKDIR /app
RUN install -d -o node -g node -m 0750 /var/lib/km /var/lib/km/objects
COPY --chown=node:node --from=build /out/api /app/api
COPY --chown=node:node --from=build /out/worker /app/worker
COPY --chmod=0644 scripts/storage.mjs /app/storage.mjs
COPY --chmod=0644 scripts/probe.cjs /app/probe.cjs
USER node
CMD ["node", "api/dist/main.js"]

FROM node:24.22.3-trixie-slim@sha256:4d00acb4bcc42c454c4eb801526f7ad7f772ea3bd4fd168c5cc2e384abcbb9d4 AS web
WORKDIR /app
COPY --chown=node:node --from=build /src/apps/web/dist /app/site
COPY --chmod=0644 scripts/serve-web.mjs /app/serve-web.mjs
USER node
CMD ["node", "serve-web.mjs"]

FROM postgres:17.10-alpine@sha256:742f40ea20b9ff2ff31db5458d127452988a2164df9e17441e191f3b72252193 AS postgres-base

FROM node:24.22.3-trixie-slim@sha256:4d00acb4bcc42c454c4eb801526f7ad7f772ea3bd4fd168c5cc2e384abcbb9d4 AS vector-build
RUN --mount=type=secret,id=build_ca,mode=0444 \
    set -eu; \
    sed -i 's|http://deb.debian.org|https://deb.debian.org|g' /etc/apt/sources.list.d/debian.sources; \
    if [ -f /run/secrets/build_ca ]; then \
      printf 'Acquire::https::CaInfo "/run/secrets/build_ca";\n' > /etc/apt/apt.conf.d/99-build-ca; \
    fi; \
    apt-get -o APT::Update::Error-Mode=any update; apt-get install -y --no-install-recommends gcc make musl-tools libc6-dev; \
    rm -rf /var/lib/apt/lists/* /etc/apt/apt.conf.d/99-build-ca
COPY --from=postgres-base /usr/local/bin/pg_config /usr/local/bin/pg_config
COPY --from=postgres-base /usr/local/include/postgresql /usr/local/include/postgresql
COPY --from=postgres-base /usr/local/lib/postgresql/pgxs /usr/local/lib/postgresql/pgxs
ADD --checksum=sha256:69f4019389af05dc1c9548deb8628e62878e6e207c03907f2b8af2016472cdaa https://codeload.github.com/pgvector/pgvector/tar.gz/refs/tags/v0.8.2 /tmp/pgvector.tgz
RUN mkdir /vector && tar -xzf /tmp/pgvector.tgz -C /vector --strip-components=1 \
    && make -C /vector -j2 CC=musl-gcc OPTFLAGS="" with_llvm=no \
    && make -C /vector install DESTDIR=/vector-out OPTFLAGS="" with_llvm=no \
    && cp /vector/LICENSE /vector-out/usr/local/share/postgresql/extension/pgvector.LICENSE

FROM postgres-base AS database
RUN rm /usr/local/bin/gosu \
    && install -d -o postgres -g postgres -m 0700 /var/lib/postgresql/data \
    && install -d -o postgres -g postgres -m 0755 /km-infra
COPY --from=vector-build /vector-out/usr/local/ /usr/local/
COPY --chmod=0755 infra/00-roles.sh /docker-entrypoint-initdb.d/00-roles.sh
COPY --chown=postgres:postgres --chmod=0644 infra/*.sql /km-infra/
USER postgres
