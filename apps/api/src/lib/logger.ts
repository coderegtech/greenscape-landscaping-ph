import { pino } from 'pino';

export function createLogger(level: string, pretty: boolean) {
  return pino({
    level,
    redact: { paths: ['req.headers.authorization', 'req.headers.cookie', '*.password', '*.token'], censor: '[redacted]' },
    ...(pretty ? { transport: { target: 'pino-pretty', options: { singleLine: true } } } : {}),
  });
}
export type Logger = ReturnType<typeof createLogger>;
