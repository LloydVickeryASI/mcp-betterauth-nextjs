import * as Sentry from '@sentry/nextjs';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  [key: string]: any;
}

class Logger {
  private context: LogContext = {};

  /**
   * Set persistent context that will be included with all logs
   */
  setContext(context: LogContext): void {
    this.context = { ...this.context, ...context };
  }

  /**
   * Clear persistent context
   */
  clearContext(): void {
    this.context = {};
  }

  /**
   * Log a debug message
   */
  debug(message: string, extra?: LogContext): void {
    this.log('debug', message, extra);
  }

  /**
   * Log an info message
   */
  info(message: string, extra?: LogContext): void {
    this.log('info', message, extra);
  }

  /**
   * Log a warning
   */
  warn(message: string, extra?: LogContext): void {
    this.log('warn', message, extra);
  }

  /**
   * Log an error
   */
  error(message: string, error?: Error | unknown, extra?: LogContext): void {
    const context = { ...this.context, ...extra };
    
    // Console log in development
    if (process.env.NODE_ENV === 'development') {
      console.error(`[${new Date().toISOString()}] ERROR: ${message}`, error, context);
    }

    // Send to Sentry as an error
    if (error instanceof Error) {
      Sentry.captureException(error, {
        level: 'error',
        extra: {
          message,
          ...context,
        },
        tags: {
          logger: 'true',
        },
      });
    } else {
      Sentry.captureMessage(message, {
        level: 'error',
        extra: {
          error: error ? String(error) : undefined,
          ...context,
        },
        tags: {
          logger: 'true',
        },
      });
    }

    // Also add as breadcrumb
    Sentry.addBreadcrumb({
      category: 'log',
      level: 'error',
      message,
      data: context,
    });
  }

  /**
   * Internal log method
   */
  private log(level: LogLevel, message: string, extra?: LogContext): void {
    const context = { ...this.context, ...extra };
    const timestamp = new Date().toISOString();

    // Console log in development
    if (process.env.NODE_ENV === 'development') {
      const consoleMethod = level === 'debug' ? 'log' : level;
      console[consoleMethod](`[${timestamp}] ${level.toUpperCase()}: ${message}`, context);
    }

    // Map log levels to Sentry severity
    const sentryLevel = level === 'warn' ? 'warning' : level;

    // Send to Sentry as a log message
    Sentry.captureMessage(message, {
      level: sentryLevel as Sentry.SeverityLevel,
      extra: {
        timestamp,
        ...context,
      },
      tags: {
        logger: 'true',
        logLevel: level,
      },
    });

    // Also add as breadcrumb for context
    Sentry.addBreadcrumb({
      category: 'log',
      level: sentryLevel as Sentry.Breadcrumb['level'],
      message,
      data: context,
      timestamp: Date.now() / 1000,
    });
  }
}

// Create singleton logger instance
export const logger = new Logger();

// Helper function to create a child logger with specific context
export function createLogger(context: LogContext): Logger {
  const childLogger = new Logger();
  childLogger.setContext(context);
  return childLogger;
}

// MCP-specific logger
export const mcpLogger = createLogger({ component: 'mcp' });