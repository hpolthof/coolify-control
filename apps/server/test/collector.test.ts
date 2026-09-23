import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  parseProcStatCpu,
  cpuPercentBetween,
  parseMeminfo,
  parseLoadavg,
  parseUptime,
  parseDf,
  parseNetDev,
  parseDockerSize,
  parseDockerPair,
  parseDockerLabels,
  parsePercent,
  parseDockerSystemDf,
} from '../src/collect/parsers';
import { parseCollectorOutput, type CollectorOutput } from '../src/collect/collector';

describe('parseProcStatCpu', () => {
  it('parses valid cpu line', () => {
    const result = parseProcStatCpu('cpu  1234 56 890 456789 234 12 34 0 0 0');
    expect(result).toEqual({
      idle: 456789 + 234,
      total: 1234 + 56 + 890 + 456789 + 234 + 12 + 34 + 0,
    });
  });

  it('handles spaces consistently', () => {
    const result = parseProcStatCpu('cpu   1234   56   890   456789   234   12   34   0   0   0');
    expect(result).toBeTruthy();
    expect(result?.idle).toBe(456789 + 234);
  });

  it('rejects invalid lines', () => {
    expect(parseProcStatCpu('foo 1 2 3 4 5 6 7 8')).toBeNull();
    expect(parseProcStatCpu('cpu 1 2 3')).toBeNull();
    expect(parseProcStatCpu('cpu abc def ghi jkl 5 6 7 8')).toBeNull();
  });

  it('handles empty line', () => {
    expect(parseProcStatCpu('')).toBeNull();
  });
});

describe('cpuPercentBetween', () => {
  it('calculates CPU percent correctly', () => {
    const a = { idle: 100000, total: 200000 };
    const b = { idle: 100100, total: 200200 };
    // deltaIdle = 100, deltaTotal = 200
    // percent = (1 - 100/200) * 100 = 50
    const result = cpuPercentBetween(a, b);
    expect(result).toBe(50);
  });

  it('rounds to 1 decimal', () => {
    const a = { idle: 1000000, total: 2000000 };
    const b = { idle: 1000123, total: 2000456 };
    // deltaIdle = 123, deltaTotal = 456
    // percent = (1 - 123/456) * 100 = 73.026... -> 73.0
    const result = cpuPercentBetween(a, b);
    expect(result).toBe(73.0);
  });

  it('clamps to 0-100', () => {
    // Idle increases (shouldn't happen in practice)
    const a = { idle: 100000, total: 200000 };
    const b = { idle: 100100, total: 200100 };
    const result = cpuPercentBetween(a, b);
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThanOrEqual(100);
  });

  it('returns 0 for null inputs', () => {
    expect(cpuPercentBetween(null, null)).toBe(0);
    expect(cpuPercentBetween({ idle: 100, total: 200 }, null)).toBe(0);
    expect(cpuPercentBetween(null, { idle: 100, total: 200 })).toBe(0);
  });

  it('returns 0 when deltaTotal is 0', () => {
    const a = { idle: 100, total: 200 };
    const result = cpuPercentBetween(a, a);
    expect(result).toBe(0);
  });
});

describe('parseMeminfo', () => {
  it('parses typical meminfo output', () => {
    const input = `MemTotal:        16384000 kB
MemAvailable:     8192000 kB
SwapTotal:         4096000 kB
SwapFree:          3072000 kB`;
    const result = parseMeminfo(input);
    expect(result.memTotal).toBe(16384000 * 1024);
    expect(result.memAvailable).toBe(8192000 * 1024);
    expect(result.swapTotal).toBe(4096000 * 1024);
    expect(result.swapFree).toBe(3072000 * 1024);
  });

  it('handles missing fields', () => {
    const input = 'MemTotal:        16384000 kB';
    const result = parseMeminfo(input);
    expect(result.memTotal).toBe(16384000 * 1024);
    expect(result.memAvailable).toBe(0);
    expect(result.swapTotal).toBe(0);
    expect(result.swapFree).toBe(0);
  });

  it('ignores other fields', () => {
    const input = `MemTotal:        16384000 kB
MemFree:          2048000 kB
MemAvailable:     8192000 kB
Buffers:           512000 kB`;
    const result = parseMeminfo(input);
    expect(result.memTotal).toBe(16384000 * 1024);
    expect(result.memAvailable).toBe(8192000 * 1024);
  });

  it('handles malformed lines gracefully', () => {
    const input = `MemTotal:        16384000 kB
BadLine
MemAvailable:     8192000 kB`;
    const result = parseMeminfo(input);
    expect(result.memTotal).toBe(16384000 * 1024);
    expect(result.memAvailable).toBe(8192000 * 1024);
  });
});

describe('parseLoadavg', () => {
  it('parses loadavg correctly', () => {
    const result = parseLoadavg('1.23 2.45 3.67 2/512 12345');
    expect(result).toEqual([1.23, 2.45, 3.67]);
  });

  it('handles space variations', () => {
    const result = parseLoadavg('  1.23   2.45   3.67  2/512 12345  ');
    expect(result).toEqual([1.23, 2.45, 3.67]);
  });

  it('handles missing values', () => {
    const result = parseLoadavg('1.23');
    expect(result[0]).toBe(1.23);
    expect(result[1]).toBe(0);
    expect(result[2]).toBe(0);
  });

  it('handles invalid input', () => {
    const result = parseLoadavg('abc def ghi');
    expect(result).toEqual([0, 0, 0]);
  });
});

describe('parseUptime', () => {
  it('parses uptime correctly', () => {
    const result = parseUptime('86400.50 691200.00');
    expect(result).toBe(86400);
  });

  it('rounds down', () => {
    const result = parseUptime('12345.99 98760.00');
    expect(result).toBe(12345);
  });

  it('handles invalid input', () => {
    const result = parseUptime('abc def');
    expect(result).toBe(0);
  });

  it('handles empty input', () => {
    const result = parseUptime('');
    expect(result).toBe(0);
  });
});

describe('parseDf', () => {
  it('parses df output correctly', () => {
    const input = `Filesystem 1B-blocks Used Available Capacity Mounted on
/dev/sda1 1000000 400000 600000 40% /
/dev/sdb1 2000000 800000 1200000 40% /var`;
    const result = parseDf(input);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      mount: '/',
      total: 400000 + 600000,
      used: 400000,
      percent: 40,
    });
    expect(result[1]).toEqual({
      mount: '/var',
      total: 800000 + 1200000,
      used: 800000,
      percent: 40,
    });
  });

  it('skips ignored mount paths', () => {
    const input = `Filesystem 1B-blocks Used Available Capacity Mounted on
/dev/sda1 1000000 400000 600000 40% /
/dev/sdb1 2000000 800000 1200000 40% /var/lib/docker/volumes
/dev/sdc1 1000000 300000 700000 30% /snap
/dev/sdd1 1000000 500000 500000 50% /boot/efi`;
    const result = parseDf(input);
    expect(result).toHaveLength(1);
    expect(result[0].mount).toBe('/');
  });

  it('dedupes by filesystem', () => {
    const input = `Filesystem 1B-blocks Used Available Capacity Mounted on
/dev/sda1 1000000 400000 600000 40% /
/dev/sda1 1000000 400000 600000 40% /alt-mount`;
    const result = parseDf(input);
    expect(result).toHaveLength(1);
  });

  it('calculates percent correctly', () => {
    const input = `Filesystem 1B-blocks Used Available Capacity Mounted on
/dev/sda1 1000 250 750 25% /`;
    const result = parseDf(input);
    expect(result[0].percent).toBe(25);
  });

  it('skips header', () => {
    const input = `Filesystem 1B-blocks Used Available Capacity Mounted on`;
    const result = parseDf(input);
    expect(result).toHaveLength(0);
  });

  it('parses BusyBox `df -Pk` output (1024-blocks header, values already in 1K blocks)', () => {
    const input = `Filesystem           1024-blocks      Used Available Use% Mounted on
/dev/sda1               10255636   4159604   5559516  43% /
tmpfs                     512000         0    512000   0% /dev/shm`;
    const result = parseDf(input);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      mount: '/',
      total: 4159604 * 1024 + 5559516 * 1024,
      used: 4159604 * 1024,
      percent: 42.8,
    });
  });
});

describe('parseNetDev', () => {
  it('parses network interfaces correctly', () => {
    const input = `Inter-|   Receive                                                |  Transmit
 face |bytes    packets errs drop fifo frame compressed multicast|bytes    packets errs drop fifo colls carrier compressed
  eth0: 1000000 100 0 0 0 0 0 0 2000000 200 0 0 0 0 0 0`;
    const result = parseNetDev(input);
    expect(result.rx).toBe(1000000);
    expect(result.tx).toBe(2000000);
  });

  it('sums multiple interfaces', () => {
    const input = `    lo: 100 0 0 0 0 0 0 0 100 0 0 0 0 0 0 0
  eth0: 1000000 0 0 0 0 0 0 0 2000000 0 0 0 0 0 0 0
  eth1: 500000 0 0 0 0 0 0 0 1000000 0 0 0 0 0 0 0`;
    const result = parseNetDev(input);
    // lo is skipped, so: eth0 + eth1
    expect(result.rx).toBe(1000000 + 500000);
    expect(result.tx).toBe(2000000 + 1000000);
  });

  it('skips virtual interfaces', () => {
    const input = `    lo: 100 0 0 0 0 0 0 0 100 0 0 0 0 0 0 0
  eth0: 1000 0 0 0 0 0 0 0 2000 0 0 0 0 0 0 0
docker0: 500 0 0 0 0 0 0 0 600 0 0 0 0 0 0 0
 veth1a: 300 0 0 0 0 0 0 0 400 0 0 0 0 0 0 0
  br-1a: 200 0 0 0 0 0 0 0 300 0 0 0 0 0 0 0`;
    const result = parseNetDev(input);
    expect(result.rx).toBe(1000);
    expect(result.tx).toBe(2000);
  });

  it('handles malformed lines', () => {
    const input = `Inter-|   Receive                                                |  Transmit
 face |bytes
  eth0: 1000 0 0 0 0 0 0 0 2000 0 0 0 0 0 0 0`;
    const result = parseNetDev(input);
    expect(result.rx).toBe(1000);
    expect(result.tx).toBe(2000);
  });
});

describe('parseDockerSize', () => {
  it('parses binary units', () => {
    expect(parseDockerSize('1KiB')).toBe(1024);
    expect(parseDockerSize('1MiB')).toBe(1024 * 1024);
    expect(parseDockerSize('1GiB')).toBe(1024 * 1024 * 1024);
  });

  it('parses SI units', () => {
    expect(parseDockerSize('1kB')).toBe(1000);
    expect(parseDockerSize('1MB')).toBe(1000000);
    expect(parseDockerSize('1GB')).toBe(1000000000);
  });

  it('handles decimals', () => {
    expect(parseDockerSize('1.5KiB')).toBe(Math.round(1.5 * 1024));
    expect(parseDockerSize('2.5MiB')).toBe(Math.round(2.5 * 1024 * 1024));
  });

  it('handles B unit', () => {
    expect(parseDockerSize('512B')).toBe(512);
  });

  it('handles dashes and empty', () => {
    expect(parseDockerSize('--')).toBe(0);
    expect(parseDockerSize('')).toBe(0);
    expect(parseDockerSize('  ')).toBe(0);
  });

  it('handles invalid input', () => {
    expect(parseDockerSize('invalid')).toBe(0);
    expect(parseDockerSize('12XB')).toBe(0);
  });
});

describe('parseDockerSystemDf', () => {
  it('parses a normal docker system df --format json output', () => {
    const stdout = [
      '{"Type":"Images","TotalCount":"12","Active":"5","Size":"4.1GB","Reclaimable":"2.3GB (56%)"}',
      '{"Type":"Containers","TotalCount":"6","Active":"5","Size":"365B","Reclaimable":"0B (0%)"}',
      '{"Type":"Local Volumes","TotalCount":"3","Active":"1","Size":"3.1GB","Reclaimable":"3.1GB (100%)"}',
      '{"Type":"Build Cache","TotalCount":"26","Active":"0","Size":"1.2GB","Reclaimable":"1.2GB"}',
      '',
    ].join('\n');

    const result = parseDockerSystemDf(stdout);

    expect(result.images).toEqual({ count: 12, active: 5, size: 4_100_000_000, reclaimable: 2_300_000_000 });
    expect(result.containers).toEqual({ count: 6, active: 5, size: 365, reclaimable: 0 });
    expect(result.volumes).toEqual({ count: 3, active: 1, size: 3_100_000_000, reclaimable: 3_100_000_000 });
    expect(result.buildCache).toEqual({ count: 26, active: 0, size: 1_200_000_000, reclaimable: 1_200_000_000 });
    expect(result.reclaimable).toBe(2_300_000_000 + 0 + 3_100_000_000 + 1_200_000_000);
  });

  it('treats a missing type (e.g. no build cache yet) as all zeros', () => {
    const stdout = [
      '{"Type":"Images","TotalCount":"1","Active":"1","Size":"100MB","Reclaimable":"0B (0%)"}',
      '{"Type":"Containers","TotalCount":"1","Active":"1","Size":"1MB","Reclaimable":"0B (0%)"}',
      '{"Type":"Local Volumes","TotalCount":"0","Active":"0","Size":"0B","Reclaimable":"0B"}',
    ].join('\n');

    const result = parseDockerSystemDf(stdout);

    expect(result.buildCache).toEqual({ count: 0, active: 0, size: 0, reclaimable: 0 });
    expect(result.volumes).toEqual({ count: 0, active: 0, size: 0, reclaimable: 0 });
  });

  it('handles a fully empty 0B volumes line', () => {
    const stdout = '{"Type":"Local Volumes","TotalCount":"0","Active":"0","Size":"0B","Reclaimable":"0B"}';
    const result = parseDockerSystemDf(stdout);
    expect(result.volumes).toEqual({ count: 0, active: 0, size: 0, reclaimable: 0 });
  });

  it('ignores blank lines and malformed JSON', () => {
    const stdout = '\n\nnot json\n{"Type":"Images","TotalCount":"2","Active":"1","Size":"1GB","Reclaimable":"500MB (50%)"}\n';
    const result = parseDockerSystemDf(stdout);
    expect(result.images).toEqual({ count: 2, active: 1, size: 1_000_000_000, reclaimable: 500_000_000 });
  });

  it('returns all zeros for empty stdout', () => {
    const result = parseDockerSystemDf('');
    expect(result.images).toEqual({ count: 0, active: 0, size: 0, reclaimable: 0 });
    expect(result.reclaimable).toBe(0);
  });
});

describe('parseDockerPair', () => {
  it('parses memory pair', () => {
    const result = parseDockerPair('256MiB / 2GiB');
    expect(result[0]).toBe(256 * 1024 * 1024);
    expect(result[1]).toBe(2 * 1024 * 1024 * 1024);
  });

  it('parses network pair', () => {
    const result = parseDockerPair('1.5MiB / 2.3MiB');
    expect(result[0]).toBe(Math.round(1.5 * 1024 * 1024));
    expect(result[1]).toBe(Math.round(2.3 * 1024 * 1024));
  });

  it('handles empty parts', () => {
    const result = parseDockerPair('');
    expect(result).toEqual([0, 0]);
  });

  it('handles single part', () => {
    const result = parseDockerPair('256MiB');
    expect(result[0]).toBe(256 * 1024 * 1024);
    expect(result[1]).toBe(0);
  });
});

describe('parseDockerLabels', () => {
  it('parses simple labels', () => {
    const result = parseDockerLabels('app=my-app,env=prod');
    expect(result).toEqual({ app: 'my-app', env: 'prod' });
  });

  it('handles values with equals', () => {
    const result = parseDockerLabels('foo=bar=baz,qux=quux');
    expect(result).toEqual({ foo: 'bar=baz', qux: 'quux' });
  });

  it('ignores malformed entries', () => {
    const result = parseDockerLabels('app=my-app,broken,env=prod');
    expect(result.app).toBe('my-app');
    expect(result.env).toBe('prod');
    expect(Object.keys(result)).toHaveLength(2);
  });

  it('handles empty string', () => {
    const result = parseDockerLabels('');
    expect(result).toEqual({});
  });

  it('handles spaces around values', () => {
    const result = parseDockerLabels(' app = my-app , env = prod ');
    expect(result.app).toBe('my-app');
    expect(result.env).toBe('prod');
  });
});

describe('parsePercent', () => {
  it('parses percentage with %', () => {
    expect(parsePercent('12.34%')).toBe(12.34);
    expect(parsePercent('50%')).toBe(50);
    expect(parsePercent('0.05%')).toBe(0.05);
  });

  it('parses percentage without %', () => {
    expect(parsePercent('12.34')).toBe(12.34);
  });

  it('handles dashes', () => {
    expect(parsePercent('--')).toBe(0);
  });

  it('handles spaces', () => {
    expect(parsePercent('  12.34%  ')).toBe(12.34);
  });

  it('handles invalid input', () => {
    expect(parsePercent('invalid')).toBe(0);
    expect(parsePercent('abc%')).toBe(0);
  });
});

describe('parseCollectorOutput', () => {
  it('parses complete fixture output', () => {
    const fixture = readFileSync(
      join(__dirname, 'fixtures', 'collector-output.txt'),
      'utf-8'
    );
    const result = parseCollectorOutput(fixture);

    // Basic checks
    expect(result.cpuCores).toBe(8);
    expect(result.cpuPercent).toBeGreaterThanOrEqual(0);
    expect(result.cpuPercent).toBeLessThanOrEqual(100);
    expect(result.load).toHaveLength(3);
    expect(result.load[0]).toBeCloseTo(1.23);
    expect(result.memTotal).toBe(16384000 * 1024);
    expect(result.memAvailable).toBe(8192000 * 1024);
    expect(result.swapTotal).toBe(4096000 * 1024);
    expect(result.swapFree).toBe(3072000 * 1024);
    expect(result.uptimeSec).toBe(86400);
    expect(result.os).toBe('Ubuntu 22.04.1 LTS');
    expect(result.kernel).toContain('5.15.0');
    expect(result.dockerVersion).toBe('24.0.0');

    // Network rates should be close to 1000 bytes/sec (difference between 1s samples)
    expect(result.netRxBps).toBeTruthy();
    expect(result.netTxBps).toBeTruthy();

    // Disks
    expect(result.disks.length).toBeGreaterThan(0);
    const rootDisk = result.disks.find((d) => d.mount === '/');
    expect(rootDisk).toBeTruthy();
    expect(rootDisk?.used).toBe(549755813888);
    expect(rootDisk?.percent).toBe(50);

    // Containers
    expect(result.containers).toHaveLength(3);
    const myApp = result.containers.find((c) => c.name === 'my-app-1');
    expect(myApp).toBeTruthy();
    if (myApp) {
      expect(myApp.state).toBe('running');
      expect(myApp.labels.app).toBe('my-app');
      expect(myApp.labels.env).toBe('prod');
    }

    const withAlias = result.containers.find((c) => c.name === 'my-service-1');
    expect(withAlias).toBeTruthy(); // uses first name from comma-separated list

    // Stats
    expect(result.stats).toHaveLength(2);
    const appStats = result.stats.find((s) => s.name === 'my-app-1');
    expect(appStats).toBeTruthy();
    expect(appStats?.cpuPercent).toBe(12.34);
    expect(appStats?.memUsed).toBe(256 * 1024 * 1024);
    expect(appStats?.memLimit).toBe(2 * 1024 * 1024 * 1024);
    expect(appStats?.pids).toBe(42);

    // No errors in complete output
    expect(result.errors).toHaveLength(0);
  });

  it('handles docker permission denied', () => {
    const output = `@@stat1
cpu  1234 56 890 456789 234 12 34 0 0 0
@@stat2
cpu  1244 56 900 456889 235 12 35 0 0 0
@@nproc
8
@@loadavg
1.23 2.45 3.67 2/512 12345
@@meminfo
MemTotal:        16384000 kB
MemAvailable:     8192000 kB
SwapTotal:         4096000 kB
SwapFree:          3072000 kB
@@uptime
86400.50 691200.00
@@df
Filesystem 1B-blocks Used Available Capacity Mounted on
/dev/sda1 1000000000 400000000 600000000 40% /
@@net1
eth0: 1000000 0 0 0 0 0 0 0 2000000 0 0 0 0 0 0 0
@@net2
eth0: 1001000 0 0 0 0 0 0 0 2001000 0 0 0 0 0 0 0
@@os
Ubuntu 22.04.1 LTS
5.15.0-67-generic
@@dockerversion
permission denied while trying to connect to the Docker daemon socket
@@ps
permission denied
@@stats
permission denied
@@end`;

    const result = parseCollectorOutput(output);
    expect(result.dockerVersion).toBeNull();
    expect(result.containers).toHaveLength(0);
    expect(result.stats).toHaveLength(0);
    expect(result.errors).toContain(
      'docker: permission denied while trying to connect to the Docker daemon socket'
    );
    expect(result.errors.some((e) => e.includes('docker ps'))).toBe(true);
    expect(result.errors.some((e) => e.includes('docker stats'))).toBe(true);
  });

  it('handles missing sections', () => {
    const output = `@@stat1
cpu  1234 56 890 456789 234 12 34 0 0 0
@@nproc
8
@@end`;

    const result = parseCollectorOutput(output);
    expect(result.cpuPercent).toBeNull();
    expect(result.memTotal).toBe(0);
    expect(result.netRxBps).toBeNull();
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some((e) => e.includes('stat2 missing'))).toBe(true);
    expect(result.errors.some((e) => e.includes('meminfo missing'))).toBe(true);
  });

  it('handles malformed JSON in docker ps/stats', () => {
    const output = `@@stat1
cpu  1234 56 890 456789 234 12 34 0 0 0
@@stat2
cpu  1244 56 900 456889 235 12 35 0 0 0
@@nproc
8
@@loadavg
1.23 2.45 3.67 2/512 12345
@@meminfo
MemTotal:        16384000 kB
MemAvailable:     8192000 kB
SwapTotal:         4096000 kB
SwapFree:          3072000 kB
@@uptime
86400.50 691200.00
@@df
Filesystem 1B-blocks Used Available Capacity Mounted on
/dev/sda1 1000000000 400000000 600000000 40% /
@@net1
eth0: 1000000 0 0 0 0 0 0 0 2000000 0 0 0 0 0 0 0
@@net2
eth0: 1001000 0 0 0 0 0 0 0 2001000 0 0 0 0 0 0 0
@@os
Ubuntu 22.04.1 LTS
5.15.0-67-generic
@@dockerversion
24.0.0
@@ps
{"ID":"abc123","Names":"app","Image":"nginx","State":"running","Status":"Up 1 hour","Labels":""}
not valid json
{"ID":"xyz789","Names":"db","Image":"postgres","State":"running","Status":"Up 2 hours","Labels":""}
@@stats
{"Container":"abc123","Name":"app","CPUPerc":"5%","MemUsage":"128MiB / 512MiB","MemPerc":"25%","NetIO":"10MiB / 5MiB","BlockIO":"5MiB / 2MiB","PIDs":"10"}
this is not json at all
@@end`;

    const result = parseCollectorOutput(output);
    expect(result.containers).toHaveLength(2);
    expect(result.stats).toHaveLength(1);
    expect(result.errors).toHaveLength(0); // malformed lines are silently ignored
  });
});
