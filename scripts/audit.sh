#!/usr/bin/env bash
set -euo pipefail
mkdir -p artifacts/audit
output="$(cd artifacts/audit && pwd)"
scratch="$(mktemp -d)"
trap 'rm -rf -- "$scratch"' EXIT
scanner='aquasec/trivy:0.69.3@sha256:bcc376de8d77cfe086a917230e818dc9f8528e3c852f7b1aff648949b6258d1c'
export COMPOSE_PROJECT_NAME=km-audit
export KM_APP_PASSWORD=unused-ci-placeholder
export KM_DB_PASSWORD=unused-ci-placeholder
export OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=
compose() {
  if [[ -n "${KM_BUILD_CA:-}" ]]; then
    docker compose -f compose.yaml -f infra/compose.proxy.yaml "$@"
  else
    docker compose "$@"
  fi
}
trivy() {
  local ca_args=()
  if [[ -n "${KM_BUILD_CA:-}" ]]; then
    ca_args=(--mount "type=bind,src=$KM_BUILD_CA,dst=/km-ca.pem,readonly" --env SSL_CERT_FILE=/km-ca.pem)
  fi
  docker run --rm "${ca_args[@]}" \
    --mount "type=bind,src=$scratch,dst=/scan" \
    --mount "type=bind,src=$output,dst=/results" \
    --mount "type=bind,src=$PWD,dst=/repo,readonly" \
    "$scanner" --cache-dir /scan/cache "$@"
}
status=0
pnpm audit --audit-level high > "$output/dependency-audit.txt" || status=1
pnpm -r licenses list --json > "$output/npm-licenses.json"
node scripts/license-check.mjs "$output/npm-licenses.json" || status=1
compose build api web db
compose pull redis
trivy fs --scanners secret --skip-dirs node_modules,artifacts,test-results,playwright-report,backups --skip-files ".env*" \
  --format json --output /results/secrets.json --exit-code 1 /repo || status=1
trivy fs --format cyclonedx --output /results/workspace.cdx.json /repo
mapfile -t images < <(compose config --images | sort -u)
for image in "${images[@]}"; do
  name="${image%%@*}"
  name="${name//\//-}"
  name="${name//:/-}"
  docker save "$image" -o "$scratch/image.tar"
  trivy image --input /scan/image.tar --format cyclonedx --output "/results/$name.cdx.json"
  trivy image --input /scan/image.tar --scanners vuln --severity CRITICAL --db-repository ghcr.io/aquasecurity/trivy-db:2 \
    --format json --output "/results/$name.scan.json" --exit-code 1 || status=1
  trivy image --input /scan/image.tar --scanners license \
    --format json --output "/results/$name.licenses.json"
  rm "$scratch/image.tar"
done
cat "$output/dependency-audit.txt"
exit "$status"
