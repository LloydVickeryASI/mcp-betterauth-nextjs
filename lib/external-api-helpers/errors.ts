export enum ApiErrorCode {
  // Client errors
  BAD_REQUEST = 'BAD_REQUEST',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT = 'CONFLICT',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  
  // Rate limiting
  RATE_LIMITED = 'RATE_LIMITED',
  QUOTA_EXCEEDED = 'QUOTA_EXCEEDED',
  
  // Server errors
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  GATEWAY_TIMEOUT = 'GATEWAY_TIMEOUT',
  
  // Network errors
  NETWORK_ERROR = 'NETWORK_ERROR',
  TIMEOUT = 'TIMEOUT',
  
  // Auth errors
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  TOKEN_INVALID = 'TOKEN_INVALID',
  
  // Unknown
  UNKNOWN = 'UNKNOWN',
}

export interface ApiErrorDetails {
  provider: string;
  operation: string;
  originalError?: any;
  retryable: boolean;
  retryAfter?: number;
  context?: Record<string, any>;
}

export class ApiError extends Error {
  constructor(
    public code: ApiErrorCode,
    message: string,
    public details: ApiErrorDetails
  ) {
    super(message);
    this.name = 'ApiError';
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      provider: this.details.provider,
      operation: this.details.operation,
      retryable: this.details.retryable,
      retryAfter: this.details.retryAfter,
      context: this.details.context,
    };
  }
}

export function mapProviderError(
  provider: string,
  operation: string,
  error: any
): ApiError {
  const baseDetails: ApiErrorDetails = {
    provider,
    operation,
    originalError: error,
    retryable: false,
  };

  // Handle Axios-like errors
  if (error.response) {
    const status = error.response.status;
    const data = error.response.data;

    switch (status) {
      case 400:
        return new ApiError(
          ApiErrorCode.BAD_REQUEST,
          data?.message || 'Bad request',
          baseDetails
        );
      
      case 401:
        return new ApiError(
          ApiErrorCode.UNAUTHORIZED,
          'Authentication required',
          { ...baseDetails, retryable: false }
        );
      
      case 403:
        return new ApiError(
          ApiErrorCode.FORBIDDEN,
          'Access forbidden',
          baseDetails
        );
      
      case 404:
        return new ApiError(
          ApiErrorCode.NOT_FOUND,
          'Resource not found',
          baseDetails
        );
      
      case 409:
        return new ApiError(
          ApiErrorCode.CONFLICT,
          data?.message || 'Resource conflict',
          baseDetails
        );
      
      case 422:
        return new ApiError(
          ApiErrorCode.VALIDATION_ERROR,
          data?.message || 'Validation failed',
          { ...baseDetails, context: data?.errors }
        );
      
      case 429:
        const retryAfter = error.response?.headers?.['retry-after'];
        return new ApiError(
          ApiErrorCode.RATE_LIMITED,
          'Rate limit exceeded',
          {
            ...baseDetails,
            retryable: true,
            retryAfter: retryAfter ? parseInt(retryAfter, 10) : undefined,
          }
        );
      
      case 500:
        return new ApiError(
          ApiErrorCode.INTERNAL_ERROR,
          'Internal server error',
          { ...baseDetails, retryable: true }
        );
      
      case 502:
      case 503:
        return new ApiError(
          ApiErrorCode.SERVICE_UNAVAILABLE,
          'Service temporarily unavailable',
          { ...baseDetails, retryable: true }
        );
      
      case 504:
        return new ApiError(
          ApiErrorCode.GATEWAY_TIMEOUT,
          'Gateway timeout',
          { ...baseDetails, retryable: true }
        );
      
      default:
        return new ApiError(
          ApiErrorCode.UNKNOWN,
          `Unexpected error: ${status}`,
          baseDetails
        );
    }
  }

  // Handle network errors
  if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
    return new ApiError(
      ApiErrorCode.NETWORK_ERROR,
      'Network connection failed',
      { ...baseDetails, retryable: true }
    );
  }

  if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
    return new ApiError(
      ApiErrorCode.TIMEOUT,
      'Request timeout',
      { ...baseDetails, retryable: true }
    );
  }

  // Default unknown error
  return new ApiError(
    ApiErrorCode.UNKNOWN,
    error.message || 'Unknown error occurred',
    baseDetails
  );
}

// Provider-specific error mappers
export const providerErrorMappers: Record<
  string,
  (operation: string, error: any) => ApiError
> = {
  hubspot: (operation: string, error: any) => {
    // HubSpot-specific error handling
    if (error.response?.data?.category === 'VALIDATION_ERROR') {
      return new ApiError(
        ApiErrorCode.VALIDATION_ERROR,
        error.response.data.message,
        {
          provider: 'hubspot',
          operation,
          originalError: error,
          retryable: false,
          context: error.response.data.errors,
        }
      );
    }
    
    return mapProviderError('hubspot', operation, error);
  },
  
  pandadoc: (operation: string, error: any) => {
    // PandaDoc-specific error handling
    if (error.response?.status === 402) {
      return new ApiError(
        ApiErrorCode.QUOTA_EXCEEDED,
        'PandaDoc quota exceeded',
        {
          provider: 'pandadoc',
          operation,
          originalError: error,
          retryable: false,
        }
      );
    }
    
    return mapProviderError('pandadoc', operation, error);
  },
  
  xero: (operation: string, error: any) => {
    // Xero-specific error handling
    if (error.response?.status === 403 && error.response?.data?.Message?.includes('token')) {
      return new ApiError(
        ApiErrorCode.TOKEN_INVALID,
        'Xero token has expired or is invalid',
        {
          provider: 'xero',
          operation,
          originalError: error,
          retryable: false,
        }
      );
    }
    
    // Handle Xero validation errors
    if (error.response?.status === 400 && error.response?.data?.Elements) {
      const validationErrors = error.response.data.Elements
        .flatMap((el: any) => el.ValidationErrors || [])
        .map((err: any) => err.Message);
        
      return new ApiError(
        ApiErrorCode.VALIDATION_ERROR,
        validationErrors.join(', ') || 'Validation error',
        {
          provider: 'xero',
          operation,
          originalError: error,
          retryable: false,
          context: error.response.data.Elements,
        }
      );
    }
    
    return mapProviderError('xero', operation, error);
  },
};