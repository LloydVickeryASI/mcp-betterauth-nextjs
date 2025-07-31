import * as Sentry from '@sentry/nextjs';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Validate critical OAuth secrets at startup (Node.js runtime only)
    try {
      const { validateOAuthSecrets } = await import('./lib/auth/oauth-helpers');
      validateOAuthSecrets();
    } catch (error) {
      console.error('Critical configuration error:', error);
      process.exit(1);
    }
    
    await import('./sentry.server.config');
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

export const onRequestError = Sentry.captureRequestError;
