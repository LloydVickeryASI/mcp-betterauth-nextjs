/**
 * Centralized OAuth scope definitions for all providers
 * This is the single source of truth for OAuth scopes used across the application
 */

export const OAUTH_SCOPES = {
  microsoft: [
    "openid",
    "profile", 
    "email",
    "User.Read"
  ],
  
  hubspot: [
    "crm.objects.companies.read",
    "crm.objects.companies.write",
    "crm.objects.contacts.read",
    "crm.objects.contacts.write",
    "crm.objects.deals.read",
    "crm.objects.deals.write",
    "crm.objects.invoices.read",
    "crm.objects.invoices.write",
    "crm.objects.line_items.read",
    "crm.objects.line_items.write",
    "crm.objects.owners.read",
    "crm.objects.quotes.read",
    "crm.objects.quotes.write",
    "crm.schemas.invoices.read",
    "crm.schemas.invoices.write",
    "files",
    "files.ui_hidden.read",
    "forms-uploaded-files",
    "oauth",
    "sales-email-read",
    "tickets"
  ],
  
  pandadoc: [
    "read+write"
  ],
  
  xero: [
    "openid",
    "profile",
    "email",
    "accounting.contacts.read",
    "accounting.transactions",
    "offline_access"
  ],
  
  slack: [
    "channels:read",
    "chat:write",
    "users:read"
  ]
} as const;

/**
 * Get OAuth scopes for a specific provider
 * @param provider The OAuth provider name
 * @returns Array of scope strings or empty array if provider not found
 */
export function getOAuthScopes(provider: keyof typeof OAUTH_SCOPES): readonly string[] {
  return OAUTH_SCOPES[provider] || [];
}

/**
 * Format scopes for OAuth request (space-separated string)
 * @param provider The OAuth provider name
 * @returns Space-separated scope string
 */
export function getOAuthScopeString(provider: keyof typeof OAUTH_SCOPES): string {
  return getOAuthScopes(provider).join(' ');
}

// Type exports for TypeScript
export type OAuthProvider = keyof typeof OAUTH_SCOPES;
export type OAuthScopeArray = typeof OAUTH_SCOPES[OAuthProvider];