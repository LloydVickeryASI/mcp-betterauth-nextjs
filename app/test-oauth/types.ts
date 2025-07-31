export interface EnvironmentInfo {
  authHubUrl?: string;
  currentUrl: string;
  isPreview: boolean;
  isProduction: boolean;
  isLocal: boolean;
}

export interface OAuthFlowInfo {
  redirectUri?: string;
  stateGenerated?: boolean;
  callbackExpected?: string;
}

export interface Session {
  user: {
    id: string;
    email: string;
    name: string;
    emailVerified: boolean;
    createdAt: Date;
    updatedAt: Date;
    image?: string | null;
  };
  session: {
    id: string;
    userId: string;
    expiresAt: Date;
    ipAddress?: string | null;
    userAgent?: string | null;
  };
}