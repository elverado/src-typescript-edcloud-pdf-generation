#!/usr/bin/env tsx
/**
 * Purge old PDF artifacts from Salesforce for all debug trial applications
 * 
 * Usage:
 *   npm run purge:artifacts
 *   or
 *   npx tsx src/debug/purge-artifacts.ts
 */

import dotenv from 'dotenv';
import { getSalesforceClient } from '../salesforce/client.js';
import { logger } from '../utils/logger.js';

dotenv.config();

// All application IDs from DEBUG_TRIALS.md
const TRIAL_APPLICATIONS = [
  'IA-0000001566', // TCS - Areej Khalid
  'IA-0000001663', // TCS - Emma Schmidt
  'IA-0000001664', // TCS - Maimouna Doumbia
  'IA-0000189256', // KHSU - Dustin Ness
  'IA-0000189775', // KHSU - David Huynh
  'IA-0000158358', // COL - Omar Reyes
  'IA-0000169604', // POC - Xiomara Reyes
  'IA-0000217624', // UWS - Jamie Kratky
  'IA-0000002075', // SAY - Elvira Laguna
];

async function purgeAllArtifacts(): Promise<void> {
  console.log('\n🗑️  Purging old PDF artifacts from Salesforce...\n');
  
  try {
    // Connect to Salesforce
    const sfClient = await getSalesforceClient();
    await sfClient.connect();
    logger.info('Connected to Salesforce');
    
    let totalDeleted = 0;
    const results: { appId: string; deleted: number; errors: string[] }[] = [];
    
    for (const appId of TRIAL_APPLICATIONS) {
      console.log(`Processing ${appId}...`);
      
      // First, get the actual Salesforce ID from the application name
      // Escape single quotes in SOQL (use '' not \')
      const escapedAppId = appId.replace(/'/g, "''");
      const apps = await sfClient.query<{ Id: string; Name: string }>(
        `SELECT Id, Name FROM IndividualApplication WHERE Name = '${escapedAppId}' LIMIT 1`
      );
      
      if (apps.length === 0) {
        console.log(`  ⚠️  Application not found: ${appId}`);
        results.push({ appId, deleted: 0, errors: ['Application not found'] });
        continue;
      }
      
      const sfId = apps[0].Id;
      
      // Purge all PDF files attached to this application
      // Only delete files that match the "Application" pattern (our generated PDFs)
      const { deleted, errors } = await sfClient.purgeAttachedFiles(sfId, 'Application');
      
      totalDeleted += deleted;
      results.push({ appId, deleted, errors });
      
      if (deleted > 0) {
        console.log(`  ✅ Deleted ${deleted} file(s)`);
      } else if (errors.length > 0) {
        console.log(`  ❌ Errors: ${errors.join(', ')}`);
      } else {
        console.log(`  ℹ️  No matching files found`);
      }
    }
    
    // Summary
    console.log('\n' + '='.repeat(50));
    console.log('📊 Summary:');
    console.log(`   Total applications processed: ${TRIAL_APPLICATIONS.length}`);
    console.log(`   Total files deleted: ${totalDeleted}`);
    
    const errorCount = results.filter(r => r.errors.length > 0).length;
    if (errorCount > 0) {
      console.log(`   Applications with errors: ${errorCount}`);
    }
    
    console.log('='.repeat(50) + '\n');
    
    logger.info('Purge completed', { totalDeleted, applicationCount: TRIAL_APPLICATIONS.length });
    
  } catch (error: any) {
    logger.error('Purge failed', { error: error.message, stack: error.stack });
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

// Run the purge
purgeAllArtifacts()
  .then(() => {
    console.log('✅ Purge completed successfully\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Purge failed:', error.message);
    process.exit(1);
  });

