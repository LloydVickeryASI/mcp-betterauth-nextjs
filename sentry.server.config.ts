// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: "https://c859fbd0333a7fa199853a79c4e4692e@o4509568257556481.ingest.us.sentry.io/4509738158653440",

  // Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
  tracesSampleRate: 1.0,

  // Enable logs to be sent to Sentry (beta feature)
  enableLogs: true,
  
  // Include request info and user IP
  sendDefaultPii: true,
  
  // Capture all console logs
  beforeSend: (event, hint) => {
    // Log the event being sent to Sentry for debugging
    if (process.env.NODE_ENV === 'development') {
      console.log('[Sentry] Sending event:', event.type || 'error', event.event_id);
    }
    return event;
  },
  
  // Capture console logs as breadcrumbs
  beforeBreadcrumb: (breadcrumb, hint) => {
    if (process.env.NODE_ENV === 'development') {
      console.log('[Sentry] Breadcrumb:', breadcrumb.category, breadcrumb.message);
    }
    return breadcrumb;
  },

  // Setting this option to true will print useful information to the console while you're setting up Sentry.
  debug: process.env.NODE_ENV === 'development',

  // Add integrations for better tracing
  integrations: [
    // Note: httpIntegration is not available in @sentry/nextjs v9
    // It's included by default in the Next.js SDK
  ],

  // Propagate traces to all external APIs using wildcard
  tracePropagationTargets: [
    // Match all external API calls
    /^https:\/\/api\./,
    // Also match any .com API endpoints
    /\.com\/api\//,
    // Specific providers that don't follow the api. pattern
    "app.pandadoc.com",
    // Allow all external requests for maximum flexibility
    /^https:\/\//,
  ],
  
  // Set environment
  environment: process.env.NODE_ENV || 'development',
  
  // Attach stacktrace to messages
  attachStacktrace: true,
});
