import { describe, it, expect } from 'vitest';
import { stripAnsi, parseDockerLogLines } from '../src/routes/logs';

describe('stripAnsi', () => {
  it('removes ANSI color codes', () => {
    expect(stripAnsi('\x1b[32mgreen\x1b[0m')).toBe('green');
    expect(stripAnsi('\x1b[1;31mbold red\x1b[0m')).toBe('bold red');
  });

  it('removes multiple ANSI sequences', () => {
    expect(stripAnsi('\x1b[32mgreen\x1b[0m text \x1b[33myellow\x1b[0m')).toBe('green text yellow');
  });

  it('handles text without ANSI codes', () => {
    expect(stripAnsi('plain text')).toBe('plain text');
  });

  it('handles empty string', () => {
    expect(stripAnsi('')).toBe('');
  });
});

describe('parseDockerLogLines', () => {
  it('parses lines with docker timestamps', () => {
    const text = '2026-09-22T10:00:00.123456789Z hello world';
    const result = parseDockerLogLines(text);
    expect(result).toHaveLength(1);
    expect(result[0].ts).toBe('2026-09-22T10:00:00.123456789Z');
    expect(result[0].text).toBe('hello world');
    expect(result[0].stream).toBe('unknown');
  });

  it('parses multiple lines', () => {
    const text = `2026-09-22T10:00:00.123456789Z line 1
2026-09-22T10:00:01.123456789Z line 2`;
    const result = parseDockerLogLines(text);
    expect(result).toHaveLength(2);
    expect(result[0].ts).toBe('2026-09-22T10:00:00.123456789Z');
    expect(result[1].ts).toBe('2026-09-22T10:00:01.123456789Z');
  });

  it('handles lines without timestamps', () => {
    const text = 'no timestamp line';
    const result = parseDockerLogLines(text);
    expect(result).toHaveLength(1);
    expect(result[0].ts).toBeNull();
    expect(result[0].text).toBe('no timestamp line');
  });

  it('strips ANSI codes from log text', () => {
    const text = '2026-09-22T10:00:00.123456789Z \x1b[32mgreen\x1b[0m';
    const result = parseDockerLogLines(text);
    expect(result[0].text).toBe('green');
  });

  it('ignores empty lines', () => {
    const text = `2026-09-22T10:00:00.123456789Z line 1

2026-09-22T10:00:02.123456789Z line 3`;
    const result = parseDockerLogLines(text);
    expect(result).toHaveLength(2);
  });

  it('handles trailing newlines', () => {
    const text = '2026-09-22T10:00:00.123456789Z line 1\n';
    const result = parseDockerLogLines(text);
    expect(result).toHaveLength(1);
  });
});
