// JSON-lines logger. Never logs key contents or the connector token.

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVELS: LogLevel[] = ['debug', 'info', 'warn', 'error'];

export interface Logger {
  debug(msg: string, fields?: Record<string, unknown>): void;
  info(msg: string, fields?: Record<string, unknown>): void;
  warn(msg: string, fields?: Record<string, unknown>): void;
  error(msg: string, fields?: Record<string, unknown>): void;
}

export function normalizeLogLevel(value: string | undefined): LogLevel {
  if (value === 'debug' || value === 'info' || value === 'warn' || value === 'error') return value;
  return 'info';
}

export function createLogger(level: LogLevel = 'info', write: (line: string) => void = (l) => process.stdout.write(l)): Logger {
  const threshold = LEVELS.indexOf(level);

  function log(lvl: LogLevel, msg: string, fields?: Record<string, unknown>): void {
    if (LEVELS.indexOf(lvl) < threshold) return;
    const record = { level: lvl, time: new Date().toISOString(), msg, ...fields };
    write(JSON.stringify(record) + '\n');
  }

  return {
    debug: (msg, fields) => log('debug', msg, fields),
    info: (msg, fields) => log('info', msg, fields),
    warn: (msg, fields) => log('warn', msg, fields),
    error: (msg, fields) => log('error', msg, fields),
  };
}
