import * as Sentry from '@sentry/nextjs';

export interface LogContext {
  provider: string;
  operation: string;
  userId?: string;
  requestId?: string;
  [key: string]: any;
}

export interface ApiRequestLog {
  timestamp: Date;
  provider: string;
  operation: string;
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: any;
  context?: LogContext;
}

export interface ApiResponseLog extends ApiRequestLog {
  duration: number;
  status: number;
  responseHeaders?: Record<string, string>;
  responseBody?: any;
  error?: any;
}

export class ApiLogger {
  private isDevelopment = process.env.NODE_ENV === 'development';
  
  logRequest(log: ApiRequestLog): void {
    const sanitizedLog = this.sanitizeLog(log);
    
    if (this.isDevelopment) {
      console.log('[API Request]', {
        ...sanitizedLog,
        timestamp: log.timestamp.toISOString(),
      });
    }
    
    // Add breadcrumb to Sentry
    Sentry.addBreadcrumb({
      category: 'api.request',
      message: `${log.method} ${log.provider}:${log.operation}`,
      level: 'info',
      data: sanitizedLog,
    });
  }
  
  logResponse(log: ApiResponseLog): void {
    const sanitizedLog = this.sanitizeLog(log);
    const isError = log.status >= 400 || log.error;
    
    if (this.isDevelopment) {
      const logFn = isError ? console.error : console.log;
      logFn('[API Response]', {
        ...sanitizedLog,
        timestamp: log.timestamp.toISOString(),
        duration: `${log.duration}ms`,
      });
    }
    
    // Add breadcrumb to Sentry
    Sentry.addBreadcrumb({
      category: 'api.response',
      message: `${log.status} ${log.provider}:${log.operation}`,
      level: isError ? 'error' : 'info',
      data: {
        ...sanitizedLog,
        duration: log.duration,
      },
    });
    
    // Log errors to Sentry
    if (isError && log.error) {
      Sentry.captureException(log.error, {
        tags: {
          provider: log.provider,
          operation: log.operation,
          status: log.status,
        },
        contexts: {
          api: {
            url: log.url,
            method: log.method,
            duration: log.duration,
          },
        },
        extra: sanitizedLog,
      });
    }
  }
  
  private sanitizeLog(log: any): any {
    const sensitiveKeys = [
      'authorization',
      'api-key',
      'apikey',
      'x-api-key',
      'secret',
      'password',
      'token',
      'client_secret',
      'refresh_token',
    ];
    
    const sanitize = (obj: any): any => {
      if (!obj || typeof obj !== 'object') return obj;
      
      const result: any = Array.isArray(obj) ? [] : {};
      
      for (const [key, value] of Object.entries(obj)) {
        const lowerKey = key.toLowerCase();
        
        if (sensitiveKeys.some(sensitive => lowerKey.includes(sensitive))) {
          result[key] = '[REDACTED]';
        } else if (typeof value === 'object') {
          result[key] = sanitize(value);
        } else {
          result[key] = value;
        }
      }
      
      return result;
    };
    
    return sanitize(log);
  }
  
  createRequestLogger(
    context: LogContext
  ): (req: ApiRequestLog) => (res: ApiResponseLog) => void {
    return (request: ApiRequestLog) => {
      const startTime = Date.now();
      const fullRequest = { ...request, context };
      
      this.logRequest(fullRequest);
      
      return (response: ApiResponseLog) => {
        const duration = Date.now() - startTime;
        this.logResponse({
          ...fullRequest,
          ...response,
          duration,
          context,
        });
      };
    };
  }
}

// Singleton instance
export const apiLogger = new ApiLogger();

// Middleware for automatic logging
export function withLogging<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  provider: string,
  operation: string
): T {
  return (async (...args: Parameters<T>) => {
    const timestamp = new Date();
    const logResponse = apiLogger.createRequestLogger({ provider, operation });
    
    try {
      const result = await fn(...args);
      
      // Log successful response
      logResponse({
        timestamp,
        provider,
        operation,
        method: 'UNKNOWN',
        url: 'UNKNOWN',
      })({
        timestamp,
        provider,
        operation,
        method: 'UNKNOWN',
        url: 'UNKNOWN',
        duration: 0,
        status: 200,
      });
      
      return result;
    } catch (error) {
      // Log error response
      logResponse({
        timestamp,
        provider,
        operation,
        method: 'UNKNOWN',
        url: 'UNKNOWN',
      })({
        timestamp,
        provider,
        operation,
        method: 'UNKNOWN',
        url: 'UNKNOWN',
        duration: 0,
        status: (error as any).response?.status || 0,
        error,
      });
      
      throw error;
    }
  }) as T;
}