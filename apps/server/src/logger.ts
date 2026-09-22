import pino, { type Logger } from 'pino';

export function createLogger(level: string): Logger {
  const pretty = process.env.NODE_ENV !== 'production' && process.stdout.isTTY;
  return pino({
    level,
    redact: ['req.headers.authorization', 'req.headers.cookie', '*.password', '*.privateKey', '*.token'],
    ...(pretty ? { transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss' } } } : {}),
  });
}
