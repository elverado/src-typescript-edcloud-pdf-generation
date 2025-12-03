import { logger } from './logger.js';
import { loadSalesforceSecrets, clearSecretsCache } from './secrets.js';

export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  instance_url: string;
  issued_at?: string;
  signature?: string;
}

/**
 * Refresh Salesforce access token using refresh token
 * Returns new access token and optionally a new refresh token
 */
export async function refreshAccessToken(): Promise<TokenResponse> {
  const secrets = await loadSalesforceSecrets();

  if (!secrets.SF_CLIENT_ID || !secrets.SF_CLIENT_SECRET || !secrets.SF_REFRESH_TOKEN || !secrets.SF_INSTANCE_URL) {
    throw new Error(
      'Refresh token flow requires SF_CLIENT_ID, SF_CLIENT_SECRET, SF_REFRESH_TOKEN, and SF_INSTANCE_URL'
    );
  }

  const tokenUrl = `${secrets.SF_INSTANCE_URL}/services/oauth2/token`;

  logger.info('Refreshing Salesforce access token', {
    instanceUrl: secrets.SF_INSTANCE_URL,
  });

  try {
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: secrets.SF_CLIENT_ID,
        client_secret: secrets.SF_CLIENT_SECRET,
        refresh_token: secrets.SF_REFRESH_TOKEN,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('Token refresh failed', {
        status: response.status,
        statusText: response.statusText,
        error: errorText,
      });
      throw new Error(`Token refresh failed: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const tokenData = (await response.json()) as TokenResponse;

    logger.info('Successfully refreshed access token', {
      instanceUrl: tokenData.instance_url,
      hasNewRefreshToken: !!tokenData.refresh_token,
    });

    // Clear secrets cache so next load gets fresh data
    clearSecretsCache();

    return tokenData;
  } catch (error: any) {
    logger.error('Failed to refresh access token', {
      error: error.message,
      instanceUrl: secrets.SF_INSTANCE_URL,
    });
    throw error;
  }
}

/**
 * Check if an access token is expired or about to expire
 * Salesforce access tokens typically expire in 2 hours
 * We'll refresh if token is older than 1.5 hours (90 minutes)
 */
export function isTokenExpired(issuedAt?: string): boolean {
  if (!issuedAt) {
    // If we don't know when it was issued, assume it might be expired
    return true;
  }

  const issuedTime = new Date(issuedAt).getTime();
  const now = Date.now();
  const ageMinutes = (now - issuedTime) / (1000 * 60);
  
  // Refresh if token is older than 90 minutes (tokens expire in ~120 minutes)
  return ageMinutes > 90;
}






