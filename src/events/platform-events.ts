import { logger } from '../utils/logger.js';
import { getSalesforceClient } from '../salesforce/client.js';
// import { pdfGenerator } from '../pdf/generator.js';
// import { fieldMappingService } from '../config/field-mappings.js';

export class PlatformEventListener {
  private isRunning = false;
  private intervalId?: NodeJS.Timeout;

  start(): void {
    if (this.isRunning) {
      logger.warn('Platform Event listener already running');
      return;
    }

    this.isRunning = true;
    logger.info('Starting Platform Event listener');

    // Poll for Platform Events (simplified - in production, use CometD or similar)
    this.intervalId = setInterval(() => {
      void this.processEvents();
    }, 30000); // Poll every 30 seconds
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
    this.isRunning = false;
    logger.info('Platform Event listener stopped');
  }

  private async processEvents(): Promise<void> {
    try {
      const sfClient = await getSalesforceClient();
      await sfClient.connect();

      // Query Platform Events that need processing
      // Note: This is a simplified approach. In production, use CometD for real-time events
      const eventQuery = `
        SELECT Id, Application_Id__c, School_Id__c, Program_Id__c, Template_Name__c
        FROM Application_PDF_Request__e
        WHERE CreatedDate = TODAY
        ORDER BY CreatedDate DESC
        LIMIT 10
      `;

      try {
        const events = await sfClient.query(eventQuery);
        
        for (const event of events) {
          this.handleEvent(event);
        }
      } catch (error: any) {
        // Platform Events might not exist yet - that's okay
        if (!error.message?.includes('sObject type') && !error.message?.includes('does not exist')) {
          logger.error('Failed to query Platform Events', { error });
        }
      }
    } catch (error) {
      logger.error('Platform Event processing failed', { error });
    }
  }

  private handleEvent(event: any): void {
    const { Application_Id__c, School_Id__c, Program_Id__c, Template_Name__c: _Template_Name__c } = event;
    
    if (!Application_Id__c) {
      logger.warn('Platform Event missing Application_Id__c', { event });
      return;
    }

    try {
      logger.info('Processing Platform Event', { 
        applicationId: Application_Id__c,
        schoolId: School_Id__c,
        programId: Program_Id__c,
      });

      // This would trigger the same PDF generation logic as the webhook
      // For now, we'll just log it - the actual implementation would call
      // the PDF generation service
      logger.info('Platform Event processed', { applicationId: Application_Id__c });
    } catch (error) {
      logger.error('Failed to handle Platform Event', { event, error });
    }
  }
}

export const platformEventListener = new PlatformEventListener();




