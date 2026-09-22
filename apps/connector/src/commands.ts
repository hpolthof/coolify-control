// The only commands the connector runs. The dashboard never sends a command string,
// only a `ConnectorOp` (see packages/shared/src/connector.ts); this module owns the
// actual shell text.
import type { ConnectorOp } from '@cc/shared';
import { isSafeContainerName, shellQuote } from './quote';

/**
 * The shell script that collects metrics on the remote server.
 * Moved verbatim from apps/server/src/ssh/collector.ts (COLLECT_SCRIPT).
 */
export const COLLECT_SCRIPT = `#!/bin/sh
echo "@@stat1"; head -n1 /proc/stat
echo "@@net1"; cat /proc/net/dev
sleep 1
echo "@@stat2"; head -n1 /proc/stat
echo "@@net2"; cat /proc/net/dev
echo "@@nproc"; nproc 2>/dev/null || grep -c ^processor /proc/cpuinfo
echo "@@loadavg"; cat /proc/loadavg
echo "@@meminfo"; cat /proc/meminfo
echo "@@uptime"; cat /proc/uptime
echo "@@df"; df -Pk 2>/dev/null
echo "@@os"; (. /etc/os-release 2>/dev/null && echo "$PRETTY_NAME"); uname -r
echo "@@dockerversion"; docker version --format '{{.Server.Version}}' 2>&1
echo "@@ps"; docker ps -a --no-trunc --format '{{json .}}' 2>&1
echo "@@stats"; docker stats --no-stream --no-trunc --format '{{json .}}' 2>&1
echo "@@end"
`;

const MIN_LOG_LINES = 1;
const MAX_LOG_LINES = 5000;

/**
 * Builds the exact command line to run over SSH for the given op, wrapped for
 * non-root users (Coolify supports non-root users with passwordless sudo; users in
 * the docker group work without sudo).
 *
 * Throws a descriptive Error for `ping` (which never runs a command — see ssh.ts)
 * and for invalid `logs` input.
 */
export function buildCommand(op: ConnectorOp, user: string): string {
  return wrapForUser(buildPayload(op), user);
}

function buildPayload(op: ConnectorOp): string {
  switch (op.op) {
    case 'collect':
      return COLLECT_SCRIPT;
    case 'logs':
      return buildLogsPayload(op.container, op.lines);
    case 'ping':
      throw new Error('ping does not run a command');
    default: {
      const exhaustive: never = op;
      throw new Error(`unknown op: ${JSON.stringify(exhaustive)}`);
    }
  }
}

function buildLogsPayload(container: string, lines: number): string {
  if (!isSafeContainerName(container)) {
    throw new Error(`invalid container name: ${JSON.stringify(container)}`);
  }
  if (!Number.isInteger(lines) || lines < MIN_LOG_LINES || lines > MAX_LOG_LINES) {
    throw new Error(`invalid lines: ${JSON.stringify(lines)} (must be an integer 1-5000)`);
  }
  return `docker logs --timestamps --tail ${lines} ${shellQuote(container)} 2>&1`;
}

function wrapForUser(payload: string, user: string): string {
  const quoted = shellQuote(payload);
  if (user === 'root') {
    return `sh -c ${quoted}`;
  }
  return `if sudo -n true 2>/dev/null; then sudo -n sh -c ${quoted}; else sh -c ${quoted}; fi`;
}
