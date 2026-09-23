import { describe, expect, it } from 'vitest';
import { buildCommand, COLLECT_SCRIPT } from '../src/commands';

describe('buildCommand', () => {
  it('runs collect as sh -c <script> for root', () => {
    const cmd = buildCommand({ op: 'collect' }, 'root');
    expect(cmd.startsWith('sh -c ')).toBe(true);
    expect(cmd).toContain(COLLECT_SCRIPT.replace(/'/g, "'\\''"));
  });

  it('wraps collect with sudo for non-root users', () => {
    const cmd = buildCommand({ op: 'collect' }, 'deploy');
    expect(cmd.startsWith('if sudo -n true 2>/dev/null; then sudo -n sh -c ')).toBe(true);
    expect(cmd).toContain('else sh -c ');
    expect(cmd.endsWith('fi')).toBe(true);
  });

  it('builds a docker logs command for root', () => {
    const cmd = buildCommand({ op: 'logs', container: 'my-app_1.prod', lines: 100 }, 'root');
    expect(cmd).toContain('docker logs --timestamps --tail 100');
    expect(cmd).toContain("'my-app_1.prod'");
    expect(cmd).toContain('2>&1');
  });

  it('single-quotes a valid container name', () => {
    const cmd = buildCommand({ op: 'logs', container: 'my.app-1_prod', lines: 10 }, 'root');
    expect(cmd).toContain("'my.app-1_prod'");
  });

  it('accepts a container name starting with a digit (matches the regex)', () => {
    expect(() => buildCommand({ op: 'logs', container: '1starts-with-digit', lines: 10 }, 'root')).not.toThrow();
  });

  it('rejects an unsafe container name', () => {
    expect(() => buildCommand({ op: 'logs', container: '../etc/passwd', lines: 10 }, 'root')).toThrow(/invalid container name/);
    expect(() => buildCommand({ op: 'logs', container: "weird'name", lines: 10 }, 'root')).toThrow(/invalid container name/);
    expect(() => buildCommand({ op: 'logs', container: 'has spaces', lines: 10 }, 'root')).toThrow(/invalid container name/);
    expect(() => buildCommand({ op: 'logs', container: 'app@test', lines: 10 }, 'root')).toThrow(/invalid container name/);
    expect(() => buildCommand({ op: 'logs', container: '', lines: 10 }, 'root')).toThrow(/invalid container name/);
  });

  it('rejects invalid lines counts', () => {
    expect(() => buildCommand({ op: 'logs', container: 'app', lines: 0 }, 'root')).toThrow(/invalid lines/);
    expect(() => buildCommand({ op: 'logs', container: 'app', lines: 5001 }, 'root')).toThrow(/invalid lines/);
    expect(() => buildCommand({ op: 'logs', container: 'app', lines: 1.5 }, 'root')).toThrow(/invalid lines/);
    expect(() => buildCommand({ op: 'logs', container: 'app', lines: -1 }, 'root')).toThrow(/invalid lines/);
  });

  it('accepts boundary line counts', () => {
    expect(() => buildCommand({ op: 'logs', container: 'app', lines: 1 }, 'root')).not.toThrow();
    expect(() => buildCommand({ op: 'logs', container: 'app', lines: 5000 }, 'root')).not.toThrow();
  });

  it('throws for ping (never runs a command)', () => {
    expect(() => buildCommand({ op: 'ping' }, 'root')).toThrow(/ping does not run a command/);
  });

  it('builds the docker system df command for root', () => {
    const cmd = buildCommand({ op: 'dockerDf' }, 'root');
    expect(cmd.startsWith('sh -c ')).toBe(true);
    expect(cmd).toContain("docker system df --format '\\''{{json .}}'\\''");
  });

  it('wraps docker system df with sudo for non-root users', () => {
    const cmd = buildCommand({ op: 'dockerDf' }, 'deploy');
    expect(cmd.startsWith('if sudo -n true 2>/dev/null; then sudo -n sh -c ')).toBe(true);
    expect(cmd).toContain('docker system df');
  });

  it('rejects an unknown op with a clear error', () => {
    expect(() => buildCommand({ op: 'bogus' } as never, 'root')).toThrow(/unknown op/);
  });
});
