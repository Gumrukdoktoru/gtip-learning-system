type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function currentThreshold(): number {
  if (process.env.NODE_ENV === 'test') {
    return LEVEL_ORDER.error;
  }

  return process.env.NODE_ENV === 'production'
    ? LEVEL_ORDER.info
    : LEVEL_ORDER.debug;
}

function write(level: LogLevel, message: string, context?: unknown): void {
  if (LEVEL_ORDER[level] < currentThreshold()) {
    return;
  }

  const entry = {
    level,
    time: new Date().toISOString(),
    message,
    ...(context === undefined ? {} : { context }),
  };

  const line = JSON.stringify(entry);

  if (level === 'error' || level === 'warn') {
    process.stderr.write(`${line}\n`);
  } else {
    process.stdout.write(`${line}\n`);
  }
}

export const logger = {
  debug: (message: string, context?: unknown): void =>
    write('debug', message, context),
  info: (message: string, context?: unknown): void =>
    write('info', message, context),
  warn: (message: string, context?: unknown): void =>
    write('warn', message, context),
  error: (message: string, context?: unknown): void =>
    write('error', message, context),
};
