import jsforce, { Connection } from 'jsforce';
import { logger } from '../utils/logger.js';
import { loadSalesforceSecrets } from '../utils/secrets.js';
import { refreshAccessToken, isTokenExpired } from '../utils/token-refresh.js';

export interface SalesforceConfig {
  username?: string;
  password?: string;
  securityToken?: string;
  loginUrl?: string;
  clientId?: string;
  clientSecret?: string;
  instanceUrl?: string;
  accessToken?: string;
  refreshToken?: string;
}

// API version that supports Education Cloud objects like LearningProgram
const SF_API_VERSION = '65.0';

export class SalesforceClient {
  private conn: Connection;
  private config: SalesforceConfig;
  private tokenIssuedAt?: string;

  constructor(config: SalesforceConfig) {
    this.config = config;
    this.conn = new jsforce.Connection({
      loginUrl: config.loginUrl || 'https://login.salesforce.com',
      version: SF_API_VERSION,
    });
  }

  async connect(): Promise<void> {
    try {
      // Priority 1: Refresh token flow (best practice for Connected App)
      if (this.config.clientId && this.config.clientSecret && this.config.refreshToken && this.config.instanceUrl) {
        await this.connectWithRefreshToken();
        return;
      }

      // Priority 2: Access token flow (legacy or manual token)
      if (this.config.accessToken && this.config.instanceUrl) {
        // Check if token might be expired
        if (isTokenExpired(this.tokenIssuedAt)) {
          // Try to refresh if we have refresh token
          if (this.config.refreshToken && this.config.clientId && this.config.clientSecret) {
            logger.info('Access token may be expired, attempting refresh');
            await this.connectWithRefreshToken();
            return;
          }
        }
        
        // Use existing access token
        this.conn = new jsforce.Connection({
          accessToken: this.config.accessToken,
          instanceUrl: this.config.instanceUrl,
          version: SF_API_VERSION,
        });
        logger.info('Connected to Salesforce using access token', { apiVersion: SF_API_VERSION });
        return;
      }

      // Priority 3: Username/password flow (development only)
      if (this.config.username && this.config.password) {
        const passwordWithToken = this.config.password + (this.config.securityToken || '');
        await this.conn.login(this.config.username, passwordWithToken);
        logger.info('Connected to Salesforce using OAuth username/password', { 
          username: this.config.username, 
          apiVersion: SF_API_VERSION 
        });
        return;
      }

      throw new Error(
        'Invalid Salesforce configuration. Provide either:\n' +
        '  - Refresh token flow: clientId, clientSecret, refreshToken, instanceUrl\n' +
        '  - Access token flow: accessToken, instanceUrl\n' +
        '  - Username/password (dev only): username, password, securityToken'
      );
    } catch (error) {
      logger.error('Failed to connect to Salesforce', { error });
      throw error;
    }
  }

  /**
   * Connect using refresh token flow (best practice for Connected App)
   */
  private async connectWithRefreshToken(): Promise<void> {
    if (!this.config.clientId || !this.config.clientSecret || !this.config.refreshToken || !this.config.instanceUrl) {
      throw new Error('Refresh token flow requires clientId, clientSecret, refreshToken, and instanceUrl');
    }

    logger.info('Refreshing Salesforce access token via refresh token flow');

    const tokenData = await refreshAccessToken();

    // Update config with new token
    this.config.accessToken = tokenData.access_token;
    this.config.instanceUrl = tokenData.instance_url;
    if (tokenData.refresh_token) {
      this.config.refreshToken = tokenData.refresh_token;
    }
    this.tokenIssuedAt = tokenData.issued_at || new Date().toISOString();

    // Create connection with new access token
    this.conn = new jsforce.Connection({
      accessToken: tokenData.access_token,
      instanceUrl: tokenData.instance_url,
      version: SF_API_VERSION,
    });

    logger.info('Connected to Salesforce using refreshed access token', { 
      apiVersion: SF_API_VERSION,
      instanceUrl: tokenData.instance_url,
    });
  }

  /**
   * Ensure connection is valid, refresh token if needed
   */
  async ensureConnected(): Promise<void> {
    // Check if connection exists and token might be expired
    if (this.conn && this.config.accessToken) {
      if (isTokenExpired(this.tokenIssuedAt)) {
        // Token might be expired, try to refresh
        if (this.config.refreshToken && this.config.clientId && this.config.clientSecret) {
          logger.info('Token may be expired, refreshing connection');
          await this.connectWithRefreshToken();
          return;
        }
      }
      
      // Connection exists and token is likely valid
      return;
    }

    // No connection or no token, establish connection
    await this.connect();
  }

  async query<T = any>(soql: string): Promise<T[]> {
    try {
      await this.ensureConnected();
      const result = await this.conn.query(soql);
      return result.records as T[];
    } catch (error: any) {
      // If error is due to expired token, try refreshing once
      if (error.errorCode === 'INVALID_SESSION_ID' || error.message?.includes('Session expired')) {
        logger.warn('Session expired, attempting to refresh token');
        try {
          await this.connectWithRefreshToken();
          const result = await this.conn.query(soql);
          return result.records as T[];
        } catch (refreshError) {
          logger.error('Failed to refresh token and retry query', { error: refreshError });
          throw refreshError;
        }
      }
      logger.error('SOQL query failed', { soql, error });
      throw error;
    }
  }

  async queryOne<T = any>(soql: string): Promise<T | null> {
    const records = await this.query<T>(soql);
    return records.length > 0 ? records[0] : null;
  }

  async create(sobject: string, record: Record<string, any>): Promise<string> {
    try {
      const result = await this.conn.sobject(sobject).create(record);
      if (!result.success) {
        const errorMessages = Array.isArray(result.errors) 
          ? result.errors.map((e: unknown) => typeof e === 'string' ? e : JSON.stringify(e)).join(', ')
          : String(result.errors || 'Unknown error');
        throw new Error(`Failed to create record: ${errorMessages}`);
      }
      return result.id;
    } catch (error) {
      logger.error('Failed to create record', { sobject, error });
      throw error;
    }
  }

  async update(sobject: string, id: string, record: Record<string, any>): Promise<void> {
    try {
      const result = await this.conn.sobject(sobject).update({ Id: id, ...record });
      if (!result.success) {
        const errorMessages = Array.isArray(result.errors) 
          ? result.errors.map((e: unknown) => typeof e === 'string' ? e : JSON.stringify(e)).join(', ')
          : String(result.errors || 'Unknown error');
        throw new Error(`Failed to update record: ${errorMessages}`);
      }
    } catch (error) {
      logger.error('Failed to update record', { sobject, id, error });
      throw error;
    }
  }

  async uploadFile(title: string, filePath: string, parentId: string, _contentType: string = 'application/pdf'): Promise<{ contentVersionId: string; contentDocumentId: string; isNewVersion: boolean }> {
    try {
      const fs = await import('fs');
      const path = await import('path');
      
      const fileContent = await fs.promises.readFile(filePath);
      const fileName = path.basename(filePath);
      
      logger.info('Uploading file to Salesforce', { title, fileName, parentId, size: fileContent.length });
      
      // Check if a file with this title already exists on this record
      // Query ContentDocumentLink to find existing files linked to this record
      // Escape single quotes in SOQL (use '' not \')
      const escapedParentId = parentId.replace(/'/g, "''");
      const escapedTitle = title.replace(/'/g, "''");
      let existingContentDocumentId: string | null = null;
      try {
        const existingFiles = await this.query<{ ContentDocumentId: string; ContentDocument: { Title: string; LatestPublishedVersionId: string } }>(
          `SELECT ContentDocumentId, ContentDocument.Title, ContentDocument.LatestPublishedVersionId 
           FROM ContentDocumentLink 
           WHERE LinkedEntityId = '${escapedParentId}' 
           AND ContentDocument.Title = '${escapedTitle}'
           LIMIT 1`
        );
        
        if (existingFiles.length > 0) {
          existingContentDocumentId = existingFiles[0].ContentDocumentId;
          logger.info('Found existing file, will create new version', { 
            existingContentDocumentId, 
            title,
            parentId 
          });
        }
      } catch (queryError) {
        logger.warn('Could not check for existing file, will create new', { error: queryError });
      }
      
      let result: { success: boolean; id?: string; errors?: string[] };
      
      if (existingContentDocumentId) {
        // Create a new version of the existing ContentDocument
        result = await this.conn.sobject('ContentVersion').create({
          Title: title,
          PathOnClient: fileName,
          VersionData: fileContent.toString('base64'),
          ContentDocumentId: existingContentDocumentId, // Link to existing document
          ContentLocation: 'S',
          ReasonForChange: `Updated ${new Date().toISOString()}`,
        }) as { success: boolean; id?: string; errors?: string[] };
      } else {
        // Create new ContentVersion - this automatically creates ContentDocument and ContentDocumentLink
        result = await this.conn.sobject('ContentVersion').create({
          Title: title,
          PathOnClient: fileName,
          VersionData: fileContent.toString('base64'),
          FirstPublishLocationId: parentId,
          ContentLocation: 'S',
        }) as { success: boolean; id?: string; errors?: string[] };
      }
      
      if (!result.success) {
        throw new Error(`Failed to create ContentVersion: ${(result as any).errors?.join(', ')}`);
      }
      
      const contentVersionId = result.id as string;
      
      // Query the ContentDocumentId from the created ContentVersion
      const cvQuery = await this.query<{ ContentDocumentId: string; VersionNumber: string }>(
        `SELECT ContentDocumentId, VersionNumber FROM ContentVersion WHERE Id = '${contentVersionId}'`
      );
      
      const contentDocumentId = cvQuery.length > 0 ? cvQuery[0].ContentDocumentId : '';
      const versionNumber = cvQuery.length > 0 ? cvQuery[0].VersionNumber : '1';
      
      logger.info('File uploaded successfully', { 
        contentVersionId, 
        contentDocumentId, 
        parentId,
        title,
        versionNumber,
        isNewVersion: !!existingContentDocumentId
      });
      
      return { contentVersionId, contentDocumentId, isNewVersion: !!existingContentDocumentId };
    } catch (error) {
      logger.error('Failed to upload file to Salesforce', { title, filePath, parentId, error });
      throw error;
    }
  }

  /**
   * Delete all ContentDocuments attached to a record
   * Useful for cleaning up old PDF versions before uploading fresh ones
   */
  async purgeAttachedFiles(parentId: string, titlePattern?: string): Promise<{ deleted: number; errors: string[] }> {
    const errors: string[] = [];
    let deleted = 0;
    
    try {
      // Query ContentDocumentLinks for this record
      // Escape single quotes in SOQL (use '' not \')
      const escapedParentId = parentId.replace(/'/g, "''");
      const query = `
        SELECT ContentDocumentId, ContentDocument.Title 
        FROM ContentDocumentLink 
        WHERE LinkedEntityId = '${escapedParentId}'
      `;
      
      const links = await this.query<{ ContentDocumentId: string; ContentDocument: { Title: string } }>(query);
      
      if (links.length === 0) {
        logger.info('No attached files found to purge', { parentId });
        return { deleted: 0, errors: [] };
      }
      
      // Filter by title pattern if provided
      const toDelete = titlePattern 
        ? links.filter(link => link.ContentDocument?.Title?.includes(titlePattern))
        : links;
      
      logger.info('Purging attached files', { 
        parentId, 
        totalFiles: links.length, 
        toDelete: toDelete.length,
        titlePattern 
      });
      
      // Delete each ContentDocument (this also deletes all versions and links)
      for (const link of toDelete) {
        try {
          const result = await this.conn.sobject('ContentDocument').destroy(link.ContentDocumentId);
          if (result.success) {
            deleted++;
            logger.info('Deleted ContentDocument', { 
              contentDocumentId: link.ContentDocumentId, 
              title: link.ContentDocument?.Title 
            });
          } else {
            const error = `Failed to delete ${link.ContentDocumentId}: ${(result as any).errors?.join(', ')}`;
            errors.push(error);
            logger.warn(error);
          }
        } catch (err: any) {
          const error = `Error deleting ${link.ContentDocumentId}: ${err.message}`;
          errors.push(error);
          logger.error(error);
        }
      }
      
      logger.info('Purge completed', { parentId, deleted, errors: errors.length });
      return { deleted, errors };
    } catch (error: any) {
      logger.error('Failed to purge attached files', { parentId, error: error.message });
      throw error;
    }
  }

  getConnection(): Connection {
    return this.conn;
  }

  getInstanceUrl(): string {
    return this.conn.instanceUrl || '';
  }
}

// Singleton instance
let clientInstance: SalesforceClient | null = null;
let clientConfigPromise: Promise<SalesforceConfig> | null = null;

/**
 * Load Salesforce configuration from AWS Secrets Manager or environment variables
 */
async function loadSalesforceConfig(): Promise<SalesforceConfig> {
  try {
    // Try to load from AWS Secrets Manager first
    const secrets = await loadSalesforceSecrets();
    
    return {
      clientId: secrets.SF_CLIENT_ID,
      clientSecret: secrets.SF_CLIENT_SECRET,
      refreshToken: secrets.SF_REFRESH_TOKEN,
      instanceUrl: secrets.SF_INSTANCE_URL,
      accessToken: secrets.SF_ACCESS_TOKEN, // Legacy support
      // Fallback to environment variables if not in secrets
      username: process.env.SF_USERNAME,
      password: process.env.SF_PASSWORD,
      securityToken: process.env.SF_SECURITY_TOKEN,
      loginUrl: process.env.SF_LOGIN_URL,
    };
  } catch (error) {
    logger.warn('Failed to load secrets from AWS Secrets Manager, falling back to environment variables', { error });
    
    // Fallback to environment variables
    return {
      username: process.env.SF_USERNAME,
      password: process.env.SF_PASSWORD,
      securityToken: process.env.SF_SECURITY_TOKEN,
      loginUrl: process.env.SF_LOGIN_URL,
      clientId: process.env.SF_CLIENT_ID,
      clientSecret: process.env.SF_CLIENT_SECRET,
      refreshToken: process.env.SF_REFRESH_TOKEN,
      instanceUrl: process.env.SF_INSTANCE_URL,
      accessToken: process.env.SF_ACCESS_TOKEN,
    };
  }
}

/**
 * Get or create Salesforce client instance
 * Loads configuration from AWS Secrets Manager if SECRETS_ARN is set
 * 
 * Thread-safe: Uses double-check locking pattern to prevent race conditions
 * when multiple concurrent callers try to create the instance
 */
export async function getSalesforceClient(): Promise<SalesforceClient> {
  // First check (fast path - no await)
  if (!clientInstance) {
    // Ensure we only load config once, even if called concurrently
    if (!clientConfigPromise) {
      clientConfigPromise = loadSalesforceConfig();
    }
    
    // Await the config loading (may yield control to other callers)
    const config = await clientConfigPromise;
    
    // Second check (after await) - another caller may have created instance while we awaited
    if (!clientInstance) {
      clientInstance = new SalesforceClient(config);
    }
  }
  return clientInstance;
}

/**
 * Reset the client instance (useful for testing or after token refresh)
 */
export function resetSalesforceClient(): void {
  clientInstance = null;
  clientConfigPromise = null;
}

