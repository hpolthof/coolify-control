import type { LogLine } from '@cc/shared';

/**
 * Strip ANSI escape sequences from text.
 * Matches: ESC [ ... (letter) where ... is 0-9;?
 */
export function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;?]*[ -\/]*[@-~]/g, '');
}

/**
 * Parse Docker log lines with timestamps.
 * Expected format: `2026-09-22T10:00:00.123456789Z message`
 * Lines without timestamps get ts: null.
 */
export function parseDockerLogLines(text: string): LogLine[] {
  const lines = text.split('\n');
  const result: LogLine[] = [];

  for (const line of lines) {
    if (!line) continue;

    // Docker logs start with ISO 8601 timestamp
    const timestampMatch = line.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z)\s+(.*)$/);

    if (timestampMatch) {
      result.push({
        ts: timestampMatch[1],
        text: stripAnsi(timestampMatch[2]),
        stream: 'unknown',
      });
    } else {
      // Line without timestamp
      result.push({
        ts: null,
        text: stripAnsi(line),
        stream: 'unknown',
      });
    }
  }

  return result;
}
