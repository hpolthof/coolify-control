#!/usr/bin/env bash
# Local test environment without a real Coolify:
#   - a throwaway sshd container with the local Docker socket; it plays every "server"
#     (coolify-host via 127.0.0.1:2222, web-prod-01 via its container IP, edge-01 via fake cloudflared)
#   - .dev/keys: a Coolify-style key dir (one working key, one unrelated key) for the connector
#   - dummy containers named like Coolify resources
#   - prints the commands to start the mock Coolify API, the dashboard and the connector
#
# Usage:
#   scripts/dev-env.sh up      # create everything
#   scripts/dev-env.sh down    # remove containers
#   node scripts/mock-coolify.mjs 8900   (with MOCK_REMOTE_IP printed by `up`)
set -euo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)/.dev"
NAMES=(app-api-104522 app-web-104511 db-pg db-redis plausible-svc-plaus plausible-db-svc-plaus app-wiki-9921)

down() {
  docker rm -f cc-sshd "${NAMES[@]}" >/dev/null 2>&1 || true
}

up() {
  down
  mkdir -p "$DIR"
  [ -f "$DIR/id_test" ] || ssh-keygen -q -t ed25519 -N '' -f "$DIR/id_test"

  docker run -d --name cc-sshd -p 127.0.0.1:2222:22 \
    -v /var/run/docker.sock:/var/run/docker.sock \
    -e PUB="$(cat "$DIR/id_test.pub")" alpine:3 sh -c '
      apk add --no-cache openssh docker-cli >/dev/null &&
      ssh-keygen -A &&
      mkdir -p /root/.ssh /data/coolify/ssh/keys &&
      echo "$PUB" > /root/.ssh/authorized_keys && chmod 600 /root/.ssh/authorized_keys &&
      sed -i "s/^#\?PermitRootLogin.*/PermitRootLogin prohibit-password/; s/^#\?AllowTcpForwarding.*/AllowTcpForwarding yes/" /etc/ssh/sshd_config &&
      passwd -u root >/dev/null 2>&1; exec /usr/sbin/sshd -D -e' >/dev/null

  until docker exec cc-sshd test -x /usr/sbin/sshd 2>/dev/null && docker exec cc-sshd pgrep sshd >/dev/null 2>&1; do sleep 1; done
  mkdir -p "$DIR/keys"
  cp "$DIR/id_test" "$DIR/keys/ssh_key@devkey"
  [ -f "$DIR/keys/ssh_key@otherkey" ] || ssh-keygen -q -t ed25519 -N '' -f "$DIR/keys/ssh_key@otherkey"
  rm -f "$DIR/keys/"*.pub
  chmod 600 "$DIR/keys/"*

  for n in "${NAMES[@]}"; do
    docker run -d --name "$n" --label cc-test=1 alpine:3 sh -c 'while true; do sleep 1; done' >/dev/null
  done
  docker stop db-redis >/dev/null

  local ip
  ip="$(docker inspect cc-sshd --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}')"
  cat <<EOF
Ready.
  1. Mock Coolify:  MOCK_REMOTE_IP=$ip node scripts/mock-coolify.mjs 8900
  2. Dashboard:     COOLIFY_URL=http://localhost:8900 COOLIFY_TOKEN=dev ADMIN_USERNAME=admin ADMIN_PASSWORD=secret123 npm run dev --workspace apps/server
  3. Connector:     create a token in Settings → Connector, then
                    CC_URL=http://localhost:8080 CC_TOKEN=<token> CC_KEYS_DIR=$DIR/keys CC_LOCAL_PORT=2222 \
                    CC_CLOUDFLARED=$(cd "$(dirname "$0")" && pwd)/fake-cloudflared.mjs npm run dev --workspace apps/connector
EOF
}

case "${1:-up}" in
  up) up ;;
  down) down ;;
  *) echo "usage: $0 up|down" >&2; exit 1 ;;
esac
