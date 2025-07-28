export function isNoAuthMode(): boolean {
  const noAuth = process.env.NO_AUTH === 'true';
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  if (noAuth && !isDevelopment) {
    console.error('⚠️  WARNING: NO_AUTH mode is only available in development environment');
    return false;
  }
  
  if (noAuth) {
    console.warn('🚨 Running in NO_AUTH mode - This should only be used for testing!');
  }
  
  return noAuth && isDevelopment;
}

export const TEST_USER_EMAIL = 'lvickery@asi.co.nz';