import * as Sentry from '@sentry/nextjs';

// Export Sentry's built-in logger
export const { logger } = Sentry;

// Helper to add structured context to logs
export function withContext<T extends Record<string, any>>(context: T) {
  return (strings: TemplateStringsArray, ...values: any[]) => {
    // Build the message from template
    let message = '';
    strings.forEach((str, i) => {
      message += str;
      if (i < values.length) {
        message += String(values[i]);
      }
    });
    
    // Return object with message and context for use with Sentry logger
    return { message, ...context };
  };
}

// Create specialized loggers with preset context
export const mcpLogger = {
  trace: (message: string, context?: Record<string, any>) => 
    logger.trace(message, { component: 'mcp', ...context }),
  debug: (message: string, context?: Record<string, any>) => 
    logger.debug(message, { component: 'mcp', ...context }),
  info: (message: string, context?: Record<string, any>) => 
    logger.info(message, { component: 'mcp', ...context }),
  warn: (message: string, context?: Record<string, any>) => 
    logger.warn(message, { component: 'mcp', ...context }),
  error: (message: string, context?: Record<string, any>) => 
    logger.error(message, { component: 'mcp', ...context }),
  fatal: (message: string, context?: Record<string, any>) => 
    logger.fatal(message, { component: 'mcp', ...context }),
  fmt: logger.fmt,
};

// Helper to create a logger with specific context
export function createLogger(baseContext: Record<string, any>) {
  return {
    trace: (message: string, context?: Record<string, any>) => 
      logger.trace(message, { ...baseContext, ...context }),
    debug: (message: string, context?: Record<string, any>) => 
      logger.debug(message, { ...baseContext, ...context }),
    info: (message: string, context?: Record<string, any>) => 
      logger.info(message, { ...baseContext, ...context }),
    warn: (message: string, context?: Record<string, any>) => 
      logger.warn(message, { ...baseContext, ...context }),
    error: (message: string, context?: Record<string, any>) => 
      logger.error(message, { ...baseContext, ...context }),
    fatal: (message: string, context?: Record<string, any>) => 
      logger.fatal(message, { ...baseContext, ...context }),
    fmt: logger.fmt,
  };
}