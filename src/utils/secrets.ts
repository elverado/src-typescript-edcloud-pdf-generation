import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { logger } from './logger.js';

export interface SalesforceSecrets {
  SF_CLIENT_ID?: string;
  SF_CLIENT_SECRET?: string;
  SF_REFRESH_TOKEN?: string;
  SF_INSTANCE_URL?: string;
  SF_ACCESS_TOKEN?: string; // Optional: for backward compatibility
}

let secretsCache: SalesforceSecrets | null = null;
let secretsCacheTime: number = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Load Salesforce credentials from AWS Secrets Manager
 * Caches results for 5 minutes to reduce API calls
 */
export async function loadSalesforceSecrets(): Promise<SalesforceSecrets> {
  const secretsArn = process.env.SECRETS_ARN;
  
  if (!secretsArn) {
    logger.warn('SECRETS_ARN not set, falling back to environment variables');
    return {
      SF_CLIENT_ID: process.env.SF_CLIENT_ID,
      SF_CLIENT_SECRET: process.env.SF_CLIENT_SECRET,
      SF_REFRESH_TOKEN: process.env.SF_REFRESH_TOKEN,
      SF_INSTANCE_URL: process.env.SF_INSTANCE_URL,
      SF_ACCESS_TOKEN: process.env.SF_ACCESS_TOKEN,
    };
  }

  // Check cache
  const now = Date.now();
  if (secretsCache && (now - secretsCacheTime) < CACHE_TTL) {
    logger.debug('Using cached secrets');
    return secretsCache;
  }

  try {
    const client = new SecretsManagerClient({
      region: process.env.AWS_REGION || 'us-east-2',
    });

    const command = new GetSecretValueCommand({
      SecretId: secretsArn,
    });

    const response = await client.send(command);
    
    if (!response.SecretString) {
      throw new Error('Secret value is empty');
    }

    const secrets = JSON.parse(response.SecretString) as SalesforceSecrets;
    
    // Validate required fields
    if (!secrets.SF_INSTANCE_URL) {
      throw new Error('SF_INSTANCE_URL is required in secret');
    }

    // For Connected App, we need either:
    // 1. Refresh token flow: CLIENT_ID, CLIENT_SECRET, REFRESH_TOKEN, INSTANCE_URL
    // 2. Access token flow (legacy): ACCESS_TOKEN, INSTANCE_URL
    const hasRefreshTokenFlow = secrets.SF_CLIENT_ID && secrets.SF_CLIENT_SECRET && secrets.SF_REFRESH_TOKEN;
    const hasAccessTokenFlow = secrets.SF_ACCESS_TOKEN;

    if (!hasRefreshTokenFlow && !hasAccessTokenFlow) {
      throw new Error(
        'Secret must contain either (SF_CLIENT_ID, SF_CLIENT_SECRET, SF_REFRESH_TOKEN) or SF_ACCESS_TOKEN'
      );
    }

    // Cache the secrets
    secretsCache = secrets;
    secretsCacheTime = now;

    logger.info('Loaded Salesforce secrets from AWS Secrets Manager', {
      hasRefreshToken: !!secrets.SF_REFRESH_TOKEN,
      hasAccessToken: !!secrets.SF_ACCESS_TOKEN,
      instanceUrl: secrets.SF_INSTANCE_URL,
    });

    return secrets;
  } catch (error: any) {
    logger.error('Failed to load secrets from AWS Secrets Manager', {
      error: error.message,
      secretsArn,
    });
    throw error;
  }
}

/**
 * Clear the secrets cache (useful for testing or after token refresh)
 */
export function clearSecretsCache(): void {
  secretsCache = null;
  secretsCacheTime = 0;
}






