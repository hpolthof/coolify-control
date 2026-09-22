# Coolify Control connector — runs on the Coolify host, dials out to the dashboard over a
# WebSocket and runs a fixed set of SSH operations. Build context is the repo root:
#   docker build -f connector.Dockerfile -t coolify-control-connector:dev .
#
# The runtime is distroless (glibc + C++ runtime only) with a stripped Node binary, the connector and
# cloudflared: no shell, no package manager, no npm. The connector never needs a local shell; commands
# run on servers over SSH.

FROM node:24-bookworm-slim AS build
WORKDIR /app

# Only what apps/connector needs to install and build: the workspace root manifest/lockfile,
# @cc/shared (its only workspace dependency) and its own sources.
COPY package.json package-lock.json ./
COPY packages/shared packages/shared
COPY apps/connector apps/connector

RUN npm ci --workspace apps/connector --include-workspace-root=false
RUN npm run build --workspace apps/connector
RUN npm prune --omit=dev --workspace apps/connector --include-workspace-root=false

# The official Node binary ships with symbols; stripping saves ~18 MB and changes nothing at runtime.
RUN apt-get update \
    && apt-get install -y --no-install-recommends binutils \
    && cp /usr/local/bin/node /node \
    && strip /node \
    && /node -e "process.exit(0)"

# cloudflared, pinned to one release and verified against the SHA256 published in its release notes
# (https://github.com/cloudflare/cloudflared/releases). To upgrade: bump the version and both checksums.
FROM debian:bookworm-slim AS cloudflared
ARG TARGETARCH
ARG CLOUDFLARED_VERSION=2026.9.1
ARG CLOUDFLARED_SHA256_AMD64=03f1f25d1cc93b9ad6c60569d44060bc4f17ed97075760ed8cfca4b12dcd68cc
ARG CLOUDFLARED_SHA256_ARM64=3d97437c71848bd8df68041e12436b484a661d95073ea1937f01a845ce88faa3
RUN set -eu; \
    case "${TARGETARCH}" in \
      amd64) sha="${CLOUDFLARED_SHA256_AMD64}" ;; \
      arm64) sha="${CLOUDFLARED_SHA256_ARM64}" ;; \
      *) echo "unsupported architecture: ${TARGETARCH}" >&2; exit 1 ;; \
    esac; \
    apt-get update; \
    apt-get install -y --no-install-recommends ca-certificates curl; \
    curl -fsSL -o /cloudflared \
      "https://github.com/cloudflare/cloudflared/releases/download/${CLOUDFLARED_VERSION}/cloudflared-linux-${TARGETARCH}"; \
    echo "${sha}  /cloudflared" | sha256sum -c -; \
    chmod 755 /cloudflared; \
    /cloudflared --version

FROM gcr.io/distroless/cc-debian12:nonroot AS runtime
WORKDIR /app

COPY --from=build /node /usr/local/bin/node
COPY --from=cloudflared /cloudflared /usr/local/bin/cloudflared
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/apps/connector/dist /app/dist
COPY --from=build /app/apps/connector/package.json /app/package.json

ENV NODE_ENV=production
ENV CC_KEYS_DIR=/keys
ENV CC_CLOUDFLARED=/usr/local/bin/cloudflared

# Coolify's key files are owned by uid 9999, mode 600.
USER 9999:9999

ENTRYPOINT ["/usr/local/bin/node"]
CMD ["/app/dist/index.js"]
