import { apiClient, type ApiRequestOptions, type ApiResponse } from "@/lib/external-api-helpers";
import type { ProviderToolContext } from "./create-provider-tool";

/**
 * Simplified API helper for provider tools
 * Automatically includes context information (userId, accountId, provider)
 */
export class ProviderApiHelper {
  constructor(private context: ProviderToolContext) {}
  
  async get<T = any>(
    path: string,
    operation: string,
    options?: Omit<ApiRequestOptions, 'method'>
  ): Promise<ApiResponse<T>> {
    return apiClient.get<T>(
      this.context.provider,
      this.context.session.userId,
      this.context.accountId,
      path,
      operation,
      {
        ...options,
        authMethod: this.context.authMethod,
        userToken: this.context.session.token
      }
    );
  }
  
  async post<T = any>(
    path: string,
    operation: string,
    body: any,
    options?: Omit<ApiRequestOptions, 'method' | 'body'>
  ): Promise<ApiResponse<T>> {
    return apiClient.post<T>(
      this.context.provider,
      this.context.session.userId,
      this.context.accountId,
      path,
      operation,
      body,
      {
        ...options,
        authMethod: this.context.authMethod
      }
    );
  }
  
  async put<T = any>(
    path: string,
    operation: string,
    body: any,
    options?: Omit<ApiRequestOptions, 'method' | 'body'>
  ): Promise<ApiResponse<T>> {
    return apiClient.request<T>(
      this.context.provider,
      this.context.session.userId,
      this.context.accountId,
      path,
      operation,
      { ...options, method: 'PUT', body, authMethod: this.context.authMethod, userToken: this.context.session.token }
    );
  }
  
  async delete<T = any>(
    path: string,
    operation: string,
    options?: Omit<ApiRequestOptions, 'method'>
  ): Promise<ApiResponse<T>> {
    return apiClient.request<T>(
      this.context.provider,
      this.context.session.userId,
      this.context.accountId,
      path,
      operation,
      { ...options, method: 'DELETE', authMethod: this.context.authMethod, userToken: this.context.session.token }
    );
  }
  
  async patch<T = any>(
    path: string,
    operation: string,
    body: any,
    options?: Omit<ApiRequestOptions, 'method' | 'body'>
  ): Promise<ApiResponse<T>> {
    return apiClient.request<T>(
      this.context.provider,
      this.context.session.userId,
      this.context.accountId,
      path,
      operation,
      { ...options, method: 'PATCH', body, authMethod: this.context.authMethod, userToken: this.context.session.token }
    );
  }
}