import { providers } from './config';

export interface SystemApiKeyStatus {
  provider: string;
  configured: boolean;
  envVar: string;
}

/**
 * Validates system API keys on startup and returns their status
 */
export function validateSystemApiKeys(): SystemApiKeyStatus[] {
  const results: SystemApiKeyStatus[] = [];
  
  for (const [provider, config] of Object.entries(providers)) {
    if (config.authMethods.systemApiKey) {
      const envVar = config.authMethods.systemApiKey.envVar;
      const configured = !!process.env[envVar];
      
      results.push({
        provider,
        configured,
        envVar
      });
      
      if (configured) {
        console.log(`✓ System API key configured for ${provider}`);
      }
    }
  }
  
  return results;
}

/**
 * Logs system API key configuration status
 */
export function logSystemApiKeyStatus(): void {
  const statuses = validateSystemApiKeys();
  
  if (statuses.length === 0) {
    console.log('No system API keys configured in provider definitions');
    return;
  }
  
  console.log('\n=== System API Key Status ===');
  
  const configured = statuses.filter(s => s.configured);
  const notConfigured = statuses.filter(s => !s.configured);
  
  if (configured.length > 0) {
    console.log('\nConfigured:');
    configured.forEach(status => {
      console.log(`  ✓ ${status.provider} (${status.envVar})`);
    });
  }
  
  if (notConfigured.length > 0) {
    console.log('\nNot configured (optional):');
    notConfigured.forEach(status => {
      console.log(`  - ${status.provider} (${status.envVar})`);
    });
  }
  
  console.log('\n===========================\n');
}