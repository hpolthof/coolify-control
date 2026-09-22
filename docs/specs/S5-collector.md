# S5: metrics collector script and parsers

One shell script runs per server per tick over SSH and prints marked sections. Pure parsers turn the output into
typed data. No I/O in this module.

## You own
- `apps/server/src/ssh/collector.ts`
- `apps/server/src/ssh/parsers.ts`
- `apps/server/test/collector.test.ts`
- `apps/server/test/fixtures/collector-output.txt` (realistic sample output you write by hand, incl. docker JSON lines)

## Exports (contract)
```ts
// ssh/collector.ts
export const COLLECT_SCRIPT: string;          // the raw POSIX sh script below
export const COLLECT_COMMAND: string;         // `sh -c ${shellQuote(COLLECT_SCRIPT)}` (import shellQuote from './quote')
export function parseCollectorOutput(stdout: string): CollectorOutput;

export interface RawContainer {
  id: string; name: string; image: string; state: string; status: string;
  labels: Record<string, string>;
}
export interface RawContainerStats {
  id: string; name: string; cpuPercent: number; memUsed: number; memLimit: number; memPercent: number;
  netRx: number; netTx: number; blockRead: number; blockWrite: number; pids: number;
}
export interface CollectorOutput {
  cpuPercent: number | null;   // from the two /proc/stat samples
  cpuCores: number;
  load: [number, number, number];
  memTotal: number; memAvailable: number; swapTotal: number; swapFree: number; // bytes
  uptimeSec: number;
  disks: DiskUsage[];          // from @cc/shared
  netRxBps: number | null; netTxBps: number | null; // from the two /proc/net/dev samples (1s apart)
  os: string | null; kernel: string | null; dockerVersion: string | null;
  containers: RawContainer[];
  stats: RawContainerStats[];
  errors: string[];            // e.g. "docker: permission denied", "section df missing"
}
```
`ssh/parsers.ts` exports the individual pure helpers (all tested):
`parseProcStatCpu(line): { idle: number; total: number } | null`, `cpuPercentBetween(a, b): number`,
`parseMeminfo(text)`, `parseLoadavg(text)`, `parseUptime(text)`, `parseDf(text): DiskUsage[]`,
`parseNetDev(text): { rx: number; tx: number }` (sum all interfaces except `lo`, `docker*`, `br-*`, `veth*`, `virbr*`,
`cni*`, `flannel*`, `cali*`, `tun*`, `wg*` is **kept**), `parseDockerSize(s: string): number` (handles `B`, `kB`, `KB`,
`KiB`, `MB`, `MiB`, `GB`, `GiB`, `TB`, `TiB`, decimals; SI units ×1000, binary ×1024; `--` or empty → 0),
`parseDockerPair(s: string): [number, number]` (e.g. `"12.3MiB / 1.94GiB"`), `parseDockerLabels(s): Record<string,string>`
(comma separated `k=v`; values can contain `=`), `parsePercent(s)` (`"0.05%"` → 0.05, `--` → 0).

## The script
```sh
echo "@@stat1"; head -n1 /proc/stat
echo "@@net1"; cat /proc/net/dev
sleep 1
echo "@@stat2"; head -n1 /proc/stat
echo "@@net2"; cat /proc/net/dev
echo "@@nproc"; nproc 2>/dev/null || grep -c ^processor /proc/cpuinfo
echo "@@loadavg"; cat /proc/loadavg
echo "@@meminfo"; cat /proc/meminfo
echo "@@uptime"; cat /proc/uptime
echo "@@df"; df -P -B1 -x tmpfs -x devtmpfs -x overlay -x squashfs -x efivarfs -x nsfs 2>/dev/null
echo "@@os"; (. /etc/os-release 2>/dev/null && echo "$PRETTY_NAME"); uname -r
echo "@@dockerversion"; docker version --format '{{.Server.Version}}' 2>&1
echo "@@ps"; docker ps -a --no-trunc --format '{{json .}}' 2>&1
echo "@@stats"; docker stats --no-stream --no-trunc --format '{{json .}}' 2>&1
echo "@@end"
```
## Parsing rules
- Split on lines equal to `@@<name>`; missing sections add an error and use safe defaults (0 / null / []).
- CPU: `/proc/stat` first line `cpu  user nice system idle iowait irq softirq steal …`; idle = idle + iowait,
  total = sum of the first 8 fields; percent = `(1 - Δidle/Δtotal) * 100`, clamped 0–100, rounded 1 decimal.
- df: skip header; columns `Filesystem 1B-blocks Used Available Capacity Mounted-on`; ignore mounts under
  `/var/lib/docker`, `/snap`, `/boot/efi`, `/run`; `percent = used/(used+available)*100`; dedupe by filesystem.
- os section: line 1 PRETTY_NAME (may be missing), last line kernel.
- dockerversion: if output contains `permission denied` or `command not found`/`not found`, set null and push an
  error. Same check for `ps` and `stats` (then containers/stats = []).
- `docker ps` JSON: fields `ID`, `Names`, `Image`, `State`, `Status`, `Labels`. Use the first name when `Names`
  has commas. `id` = first 12 chars.
- `docker stats` JSON: `ID`/`Container`, `Name`, `CPUPerc`, `MemUsage`, `MemPerc`, `NetIO`, `BlockIO`, `PIDs`.
- Ignore lines that are not valid JSON inside ps/stats sections.

## Tests
`apps/server/test/collector.test.ts`: every parser helper + a full `parseCollectorOutput` on the fixture, plus a
fixture variant where docker prints `permission denied while trying to connect to the Docker daemon socket`.
Run `npx vitest run --root apps/server test/collector.test.ts` and make it pass.
