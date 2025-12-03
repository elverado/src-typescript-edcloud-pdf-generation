#!/usr/bin/env tsx
/**
 * Debug script to test PDF generation with sample applications
 * 
 * Usage:
 *   npm run debug:pdf IA-0000001566
 *   or
 *   tsx src/debug/test-pdf.ts IA-0000001566
 * 
 * Note: Requires .env file with Salesforce credentials OR Salesforce CLI authentication
 */

import dotenv from 'dotenv';
import { execSync } from 'child_process';
import { getSalesforceClient } from '../salesforce/client.js';
import { pdfGenerator } from '../pdf/generator.js';
import { fieldMappingService } from '../config/field-mappings.js';
import { logger } from '../utils/logger.js';

dotenv.config();

// Try to get Salesforce CLI access token if .env is not configured
function tryGetSalesforceCliToken(): { accessToken?: string; instanceUrl?: string } {
  try {
    const result = execSync('sf org display --target-org staging --json 2>/dev/null', { encoding: 'utf-8' });
    const orgInfo = JSON.parse(result);
    if (orgInfo.result?.accessToken && orgInfo.result?.instanceUrl) {
      return {
        accessToken: orgInfo.result.accessToken,
        instanceUrl: orgInfo.result.instanceUrl,
      };
    }
  } catch {
    // CLI not available or not authenticated
  }
  return {};
}

interface TestConfig {
  applicationId: string;
  schoolId?: string;
  programId?: string;
  templateName?: string;
}

const SAMPLE_APPLICATIONS: Record<string, TestConfig> = {
  'IA-0000001566': {
    applicationId: 'IA-0000001566',
  },
  'IA-0000001663': {
    applicationId: 'IA-0000001663',
  },
  'IA-0000001664': {
    applicationId: 'IA-0000001664',
  },
  '0iTHn000000YwRtMAK': {
    applicationId: '0iTHn000000YwRtMAK',
  },
  // Add more sample applications here as needed
};

async function testPDFGeneration(applicationIdOrKey: string): Promise<void> {
  try {
    logger.info('Starting PDF generation test', { applicationIdOrKey });

    // Get test config (either from samples or use as direct ID)
    const config = SAMPLE_APPLICATIONS[applicationIdOrKey] || {
      applicationId: applicationIdOrKey,
    };

    const { applicationId, schoolId, programId, templateName } = config;

    // Connect to Salesforce
    logger.info('Connecting to Salesforce...');
    
    // Try to use Salesforce CLI token if .env is not configured
    if (!process.env.SF_USERNAME && !process.env.SF_ACCESS_TOKEN) {
      const cliToken = tryGetSalesforceCliToken();
      if (cliToken.accessToken && cliToken.instanceUrl) {
        process.env.SF_ACCESS_TOKEN = cliToken.accessToken;
        process.env.SF_INSTANCE_URL = cliToken.instanceUrl;
        logger.info('Using Salesforce CLI access token');
      }
    }
    
    const sfClient = await getSalesforceClient();
    await sfClient.connect();
    logger.info('Connected to Salesforce');

    // Query application first to get programName for mapping lookup
    // Support both Id (18-char) and Name (IA-0000001663) lookups
    const isIdForLookup = /^[a-zA-Z0-9]{15,18}$/.test(applicationId);
    const whereClauseForLookup = isIdForLookup 
      ? `WHERE Id = '${applicationId}'`
      : `WHERE Name = '${applicationId}'`;
    
    const quickQuery = `
      SELECT Program_Name__c, School_Name__c, Account.Name
      FROM IndividualApplication 
      ${whereClauseForLookup}
      LIMIT 1
    `;
    
    let programName: string | undefined;
    let schoolName: string | undefined;
    try {
      const quickResult = await sfClient.query(quickQuery);
      if (quickResult.length > 0) {
        programName = quickResult[0].Program_Name__c;
        schoolName = quickResult[0].School_Name__c || quickResult[0].Account?.Name;
        logger.info('Retrieved program and school names for mapping lookup', { programName, schoolName });
      }
    } catch (error) {
      logger.warn('Failed to query program name for mapping lookup', { error });
    }

    // Get field mapping to determine which fields to query
    // Pass programName to support program-specific mappings (e.g., IllinoisCOM)
    const mapping = fieldMappingService.getMapping(schoolId, programId, schoolName, programName);
    if (!mapping) {
      logger.warn('No field mapping found, using default', { schoolId, programId, schoolName, programName });
    } else {
      logger.info('Using field mapping', { 
        mappingSchoolName: mapping.schoolName, 
        mappingProgramName: mapping.programName 
      });
    }

    // Build dynamic SOQL query based on field mapping
    // Note: relatedRecords fields are not valid in SOQL - they're populated after query
    const fields = mapping ? fieldMappingService.getAllFields(mapping) : [];
    // Filter out relatedRecords fields and Contact relationship fields (they're not valid in SOQL)
    // Also filter out fields that don't exist (like Specialty__c)
    const invalidFields = ['Specialty__c', 'ProgramTermApplnTimeline__c'];
    const soqlFields = fields.filter(f => 
      !f.startsWith('relatedRecords.') && 
      !f.startsWith('Contact.') &&
      !invalidFields.includes(f)
    );
    
    // Comprehensive list of ALL fields that might be needed across all schools
    // Based on field mappings and MCP query results
    const commonFields = [
      // Standard fields
      'Id', 'Name', 'AccountId', 'Category', 'Status',
      'AppliedDate', 'ApprovedDate', 'PaymentDate',
      // Application info
      'School_Name__c', 'Program_Name__c', 'Location__c', 'Campus__c', 'Term__c',
      'Campus_Location__c', 'School_Name_Text__c',
      // Decision fields
      'Decision__c', 'Applicant_Decision__c', 'Decision_Release_Date__c',
      'Admit_Contingencies__c', 'Applicant_Portal_Status__c',
      'Admissions_Status__c', 'File_Closed_Reason__c',
      // Dates
      'Application_Submitted_Date__c', 'Date_Application_Reviewable__c',
      'Date_Application_Accepted__c', 'Date_Future_Start_Deposited__c',
      'Date_Waitlisted__c',
      // Academic
      'First_Generation_Student__c', 'Seeking_Transfer_Credit__c',
      'Cumulative_GPA__c', 'Highest_HS_GPA__c', 'Highest_College_GPA__c',
      'Verified_GPA_Blank__c',
      'Enrolled_in_AA_T_or_AS_T_degree_transfer__c', 'Initiating_Articulation_Agreement__c',
      'Graduate_Level_Program__c', 'Full_Part_Time__c',
      // Financial
      'Deposit_Due_Date__c', 'Deposit_Amount__c', 'Deposit_Date_Passed__c',
      'Scholarship__c', 'Scholarship_Amount__c', 'Scholarship_Message__c',
      'Applying_for_Financial_Aid__c',
      // Interview
      'Interview_Status__c', 'Interview_Date__c', 'Interview_Invite_Date__c',
      'Interview_Invite_Sent_Date__c', 'Invite_to_Secondary_Application__c',
      // Other
      'International_Student__c', 'Citizenship_Status__c',
      'Has_Previously_Applied__c', 'How_did_you_hear_about_us__c',
      'Character_Statement_Needed__c', 'Manually_Trigger_Checklist_Items__c',
      'Conviction__c', 'Acknowledge_Statement_Signature__c',
      'Active__c', 'SIS_Status_Field__c',
      'Secondary_Location_Preference__c', 'Tertiary_Location_Preference__c',
      'Owner__c', 'Opportunity__c', 'Duplicate_Record__c',
      'Contact_ID__c', 'Mogli_Number_from_Contact__c', 'Mogli_Opt_Out__c'
    ];
    
    const allFields = [...new Set([...commonFields, ...soqlFields])];

    // Query IndividualApplication with accessible fields only
    // Get related data through separate queries since relationships may not be accessible
    // Note: Following Apex pattern - only query fields that are accessible via API
    // Many fields may not be accessible via API due to permissions/field-level security
    // Using only fields we know work from MCP testing
    // Support both Id (18-char) and Name (IA-0000001663) lookups
    const isId = /^[a-zA-Z0-9]{15,18}$/.test(applicationId);
    const whereClause = isId 
      ? `WHERE Id = '${applicationId}'`
      : `WHERE Name = '${applicationId}'`;
    
    const applicationQuery = `
      SELECT ${allFields.join(', ')},
        Account.Id, Account.Name, Account.BillingCity
      FROM IndividualApplication 
      ${whereClause}
    `;
    
    logger.info('Querying application', { query: applicationQuery });
    let applications: any[];
    try {
      applications = await sfClient.query(applicationQuery);
      logger.info('Application query successful with comprehensive fields', { 
        fieldCount: allFields.length,
        recordCount: applications.length 
      });
    } catch (queryError: any) {
      // If query fails due to inaccessible fields, try with safe field set
      if (queryError.errorCode === 'INVALID_FIELD') {
        logger.warn('Some fields not accessible, retrying with safe field set', { error: queryError.message });
        // Use only fields confirmed accessible via MCP query
        // Expanded to include all fields that work across schools
        const safeFields = [
          'Id', 'Name', 'AccountId', 'Category', 'Status',
          'AppliedDate', 'Application_Submitted_Date__c',
          'Date_Application_Reviewable__c', 'Date_Application_Accepted__c',
          'Date_Future_Start_Deposited__c', 'Date_Waitlisted__c',
          'School_Name__c', 'Program_Name__c', 'Location__c', 'Campus__c', 'Term__c',
          'Campus_Location__c',
          'Decision__c', 'Applicant_Decision__c', 'Decision_Release_Date__c',
          'Admit_Contingencies__c', 'Admissions_Status__c', 'File_Closed_Reason__c',
          'Interview_Status__c', 'Interview_Date__c', 'Interview_Invite_Date__c',
          'Interview_Invite_Sent_Date__c', 'Invite_to_Secondary_Application__c',
          'Highest_HS_GPA__c', 'Highest_College_GPA__c', 'Cumulative_GPA__c',
          'Verified_GPA_Blank__c',
          'First_Generation_Student__c', 'Seeking_Transfer_Credit__c',
          'Enrolled_in_AA_T_or_AS_T_degree_transfer__c', 'Initiating_Articulation_Agreement__c',
          'Graduate_Level_Program__c', 'Full_Part_Time__c',
          'Scholarship__c', 'Scholarship_Amount__c', 'Scholarship_Message__c',
          'Applying_for_Financial_Aid__c',
          'Deposit_Amount__c', 'Deposit_Due_Date__c', 'Deposit_Date_Passed__c',
          'International_Student__c', 'Citizenship_Status__c',
          'Has_Previously_Applied__c', 'How_did_you_hear_about_us__c',
          'Character_Statement_Needed__c', 'Manually_Trigger_Checklist_Items__c',
          'Conviction__c', 'Acknowledge_Statement_Signature__c',
          'Active__c', 'SIS_Status_Field__c',
          'Secondary_Location_Preference__c', 'Tertiary_Location_Preference__c',
          'Owner__c', 'Opportunity__c', 'Duplicate_Record__c',
          'Contact_ID__c', 'Mogli_Number_from_Contact__c', 'Mogli_Opt_Out__c'
        ];
        const safeQuery = `
          SELECT ${safeFields.join(', ')},
            Account.Id, Account.Name, Account.BillingCity
          FROM IndividualApplication 
          ${whereClause}
        `;
        applications = await sfClient.query(safeQuery);
        logger.info('Used safe field set', { fieldCount: safeFields.length });
      } else {
        throw queryError;
      }
    }
    
    if (applications.length === 0) {
      throw new Error(`Application not found: ${applicationId}`);
    }

    const application = applications[0];
    
    // Query Contact separately using Contact_ID__c (Contact relationship doesn't exist on IndividualApplication)
    // Include all legacy PDF fields: Name, Contact, Physical/Mailing Address, Military, Compliance
    let contact: any = null;
    if (application.Contact_ID__c) {
      try {
        const contactQuery = `
          SELECT Id, FirstName, MiddleName, LastName, Name, Salutation,
                 Preferred_First_Name__c, Former_Last_Name__c,
                 Email, MobilePhone, HomePhone, OtherPhone,
                 Preferred_Phone_Type__c, Secondary_Preferred_Phone_Type__c,
                 MailingStreet, MailingCity, MailingState, MailingPostalCode, MailingCountry,
                 OtherStreet, OtherCity, OtherState, OtherPostalCode, OtherCountry,
                 Military_Status__c, Citizenship_Status__c,
                 Visa_Needed_to_Study__c, Own_a_US_Visa__c, Reported_Visa_Type__c,
                 Enrolled_in_other_U_S_Institution__c, SSN__c,
                 Birthdate, Birth_Country__c, Birth_City__c, Birth_State__c,
                 Sex__c, GenderIdentity, Pronouns, Sexual_Orientation__c,
                 Ethnicity__c, Race__c, Is_English_Primary_Language__c
          FROM Contact
          WHERE Id = '${application.Contact_ID__c}'
          LIMIT 1
        `;
        const contacts = await sfClient.query(contactQuery);
        if (contacts.length > 0) {
          contact = contacts[0];
          application.Contact = contact; // Attach to application for template processing
          logger.info('Retrieved Contact from Contact_ID__c', { contactId: contact.Id });
        }
      } catch (err) {
        logger.warn('Failed to query Contact', { error: err, contactId: application.Contact_ID__c });
      }
    }
    
    logger.info('Application found', { 
      applicationId: application.Id,
      contactName: contact?.Name,
      accountName: application.Account?.Name,
      schoolName: application.School_Name__c,
      hasContact: !!contact
    });

    // Query related records (based on existing Apex implementation)
    const relatedRecords: Record<string, any[]> = {};

    // Query PersonEmployment - use RelatedPersonId (not ContactId) per Apex implementation
    // Note: Some fields like EmploymentType may not be accessible via API
    // Note: Relationship fields may not be accessible, query Contact separately if needed
    try {
      const employmentQuery = `
        SELECT Id, RelatedPersonId, Name, Position, Sector__c
        FROM PersonEmployment
        WHERE Individual_Application__c = '${application.Id}'
      `;
      relatedRecords.Employment = await sfClient.query(employmentQuery);
      logger.info('Employment records found', { count: relatedRecords.Employment.length });
      
      // Get Contact/Person info from first employment record if not already in query result
      if (!contact && relatedRecords.Employment.length > 0 && relatedRecords.Employment[0].RelatedPersonId) {
        try {
          const personQuery = `SELECT Id, FirstName, MiddleName, LastName, Name, Salutation, Preferred_First_Name__c, Former_Last_Name__c, Email, MobilePhone, HomePhone, OtherPhone, Preferred_Phone_Type__c, Secondary_Preferred_Phone_Type__c, MailingStreet, MailingCity, MailingState, MailingPostalCode, MailingCountry, OtherStreet, OtherCity, OtherState, OtherPostalCode, OtherCountry, Military_Status__c, Citizenship_Status__c, Visa_Needed_to_Study__c, Own_a_US_Visa__c, Reported_Visa_Type__c, Enrolled_in_other_U_S_Institution__c, SSN__c, Birthdate, Birth_Country__c, Birth_City__c, Birth_State__c, Sex__c, GenderIdentity, Pronouns, Sexual_Orientation__c, Ethnicity__c, Race__c, Is_English_Primary_Language__c FROM Contact WHERE Id = '${relatedRecords.Employment[0].RelatedPersonId}' LIMIT 1`;
          const persons = await sfClient.query(personQuery);
          if (persons.length > 0) {
            contact = persons[0];
            application.Contact = contact; // Attach to application for template processing
            logger.info('Retrieved Contact from PersonEmployment', { contactId: contact.Id });
          }
        } catch (err) {
          logger.warn('Failed to query Contact from RelatedPersonId', { error: err });
        }
      }
    } catch (error) {
      logger.warn('Failed to query PersonEmployment', { error, applicationId });
      relatedRecords.Employment = [];
    }

    // Query High School Education - use ContactId per Apex implementation
    // Note: CumulativeGPA is not accessible via API (Apex uses WITH SYSTEM_MODE)
    try {
      const highSchoolQuery = `
        SELECT Id, ContactId, GraduationDate, Status, Name,
               EducationLevel, IdentifierIssuer,
               Educational_Institution__c
        FROM PersonEducation
        WHERE Individual_Application__c = '${application.Id}'
          AND EducationLevel IN ('No Formal Education', 'High School Diploma')
      `;
      const highSchool = await sfClient.query(highSchoolQuery);
      relatedRecords.HighSchool = highSchool.length > 0 ? highSchool : [{}];
      logger.info('High school education records found', { count: highSchool.length });
      
      // Get Contact/Person info from high school record if not already found
      if (!contact && highSchool.length > 0 && highSchool[0].ContactId) {
        try {
          const personQuery = `SELECT Id, FirstName, MiddleName, LastName, Name, Salutation, Preferred_First_Name__c, Former_Last_Name__c, Email, MobilePhone, HomePhone, OtherPhone, Preferred_Phone_Type__c, Secondary_Preferred_Phone_Type__c, MailingStreet, MailingCity, MailingState, MailingPostalCode, MailingCountry, OtherStreet, OtherCity, OtherState, OtherPostalCode, OtherCountry, Military_Status__c, Citizenship_Status__c, Visa_Needed_to_Study__c, Own_a_US_Visa__c, Reported_Visa_Type__c, Enrolled_in_other_U_S_Institution__c, SSN__c, Birthdate, Birth_Country__c, Birth_City__c, Birth_State__c, Sex__c, GenderIdentity, Pronouns, Sexual_Orientation__c, Ethnicity__c, Race__c, Is_English_Primary_Language__c FROM Contact WHERE Id = '${highSchool[0].ContactId}' LIMIT 1`;
          const persons = await sfClient.query(personQuery);
          if (persons.length > 0) {
            contact = persons[0];
            application.Contact = contact; // Attach to application for template processing
            logger.info('Retrieved Contact from PersonEducation (HighSchool)', { contactId: contact.Id });
          }
        } catch (err) {
          logger.warn('Failed to query Contact from PersonEducation', { error: err });
        }
      }
    } catch (error) {
      logger.warn('Failed to query HighSchool education', { error, applicationId });
      relatedRecords.HighSchool = [{}];
    }

    // Query College Education - use ContactId per Apex implementation
    // Note: CumulativeGPA is not accessible via API (Apex uses WITH SYSTEM_MODE)
    try {
      // Escape single quotes in SOQL string values
      const collegeQuery = `
        SELECT Id, ContactId, GraduationDate, Status, Name,
               EducationLevel, IdentifierIssuer,
               Educational_Institution__c
        FROM PersonEducation
        WHERE Individual_Application__c = '${application.Id}'
          AND EducationLevel IN (
            'Some College No Degree',
            'Associate\\'s Degree',
            'Bachelor\\'s Degree',
            'Master\\'s Degree',
            'Doctorate Degree'
          )
      `;
      relatedRecords.College = await sfClient.query(collegeQuery);
      logger.info('College education records found', { count: relatedRecords.College.length });
      
      // Get Contact/Person info from college record if not already found
      if (!contact && relatedRecords.College.length > 0 && relatedRecords.College[0].ContactId) {
        try {
          const personQuery = `SELECT Id, FirstName, MiddleName, LastName, Name, Salutation, Preferred_First_Name__c, Former_Last_Name__c, Email, MobilePhone, HomePhone, OtherPhone, Preferred_Phone_Type__c, Secondary_Preferred_Phone_Type__c, MailingStreet, MailingCity, MailingState, MailingPostalCode, MailingCountry, OtherStreet, OtherCity, OtherState, OtherPostalCode, OtherCountry, Military_Status__c, Citizenship_Status__c, Visa_Needed_to_Study__c, Own_a_US_Visa__c, Reported_Visa_Type__c, Enrolled_in_other_U_S_Institution__c, SSN__c, Birthdate, Birth_Country__c, Birth_City__c, Birth_State__c, Sex__c, GenderIdentity, Pronouns, Sexual_Orientation__c, Ethnicity__c, Race__c, Is_English_Primary_Language__c FROM Contact WHERE Id = '${relatedRecords.College[0].ContactId}' LIMIT 1`;
          const persons = await sfClient.query(personQuery);
          if (persons.length > 0) {
            contact = persons[0];
            application.Contact = contact; // Attach to application for template processing
            logger.info('Retrieved Contact from PersonEducation (College)', { contactId: contact.Id });
          }
        } catch (err) {
          logger.warn('Failed to query Contact from PersonEducation', { error: err });
        }
      }
    } catch (error) {
      logger.warn('Failed to query College education', { error, applicationId });
      relatedRecords.College = [];
    }

    // Query Checklist Items with User names for "Completed By"
    try {
      const checklistQuery = `
        SELECT Id, Name, Status__c, Date_Accepted__c, Date_Submitted__c, 
               Checklist_Type_Name__c, LastModifiedById, LastModifiedBy.Name
        FROM Checklist_Item__c
        WHERE Individual_Application__c = '${application.Id}'
        ORDER BY LastModifiedDate DESC
      `;
      const checklistItems = await sfClient.query(checklistQuery);
      // Add LastModifiedByName for easier template access
      relatedRecords.ChecklistItems = checklistItems.map((item: any) => ({
        ...item,
        LastModifiedByName: item.LastModifiedBy?.Name || '—',
      }));
      logger.info('Checklist items found', { count: relatedRecords.ChecklistItems.length });
    } catch (error) {
      logger.warn('Failed to query Checklist Items', { error, applicationId });
      relatedRecords.ChecklistItems = [];
    }

    // Query LearningProgram ID by Program Name for deep linking
    let learningProgramId: string | null = null;
    if (application.Program_Name__c) {
      try {
        const programQuery = `
          SELECT Id FROM LearningProgram 
          WHERE Name = '${application.Program_Name__c.replace(/'/g, "''")}'
          LIMIT 1
        `;
        const programs = await sfClient.query(programQuery);
        if (programs.length > 0) {
          learningProgramId = programs[0].Id;
          logger.info('LearningProgram ID found', { programName: application.Program_Name__c, learningProgramId });
        }
      } catch (error) {
        logger.warn('Failed to query LearningProgram', { error, programName: application.Program_Name__c });
      }
    }

    // Ensure Contact is attached to application data (may have been retrieved from query or related records)
    if (contact && !application.Contact) {
      application.Contact = contact;
    }
    
    // Combine application data with related records
    const applicationData = {
      ...application,
      relatedRecords,
      LearningProgramId: learningProgramId,
    };

    // Generate Complete Application PDF
    logger.info('Generating Complete Application PDF...');
    const completePdfPath = await pdfGenerator.generate({
      applicationId,
      applicationData,
      schoolId,
      programId,
      templateName,
      outputMode: 'complete',
    });

    logger.info('✅ Complete Application PDF generated!', { 
      applicationId, 
      pdfPath: completePdfPath,
    });

    // Upload Complete Application PDF to Salesforce
    let uploadResult: { contentVersionId: string; contentDocumentId: string; isNewVersion: boolean } | null = null;
    try {
      logger.info('Uploading Complete Application PDF to Salesforce...', { 
        applicationId: application.Id,
        pdfPath: completePdfPath 
      });
      
      // Extract filename for title (remove path)
      const path = await import('path');
      const pdfTitle = path.basename(completePdfPath, '.pdf');
      
      uploadResult = await sfClient.uploadFile(
        pdfTitle,
        completePdfPath,
        String(application.Id) // Parent record = IndividualApplication
      );
      
      logger.info('✅ PDF uploaded to Salesforce successfully', {
        applicationId: application.Id,
        applicationName: application.Name,
        contentVersionId: uploadResult.contentVersionId,
        contentDocumentId: uploadResult.contentDocumentId,
        isNewVersion: uploadResult.isNewVersion,
        pdfTitle,
      });
      
      const versionLabel = uploadResult.isNewVersion ? '📤 New version added' : '📤 Uploaded';
      console.log(`   ${versionLabel}: ContentDocument ${uploadResult.contentDocumentId}`);
    } catch (uploadError: any) {
      logger.error('❌ Failed to upload PDF to Salesforce', {
        applicationId: application.Id,
        applicationName: application.Name,
        pdfPath: completePdfPath,
        error: uploadError.message,
        stack: uploadError.stack,
      });
      console.error(`   ❌ Upload failed: ${uploadError.message}`);
    }

    // Generate App Lite PDF
    logger.info('Generating App Lite PDF...');
    const litePdfPath = await pdfGenerator.generate({
      applicationId,
      applicationData,
      schoolId,
      programId,
      outputMode: 'lite',
    });

    logger.info('✅ App Lite PDF generated!', { 
      applicationId, 
      pdfPath: litePdfPath,
    });

    console.log('\n📄 PDFs Generated:');
    console.log(`   Complete: ${completePdfPath}`);
    console.log(`   Lite:     ${litePdfPath}`);
    if (uploadResult) {
      const instanceUrl = process.env.SF_INSTANCE_URL || 'https://login.salesforce.com';
      // Convert .my.salesforce.com to .lightning.force.com for UI links
      const lightningUrl = instanceUrl.replace('.my.salesforce.com', '.lightning.force.com');
      console.log(`   📤 Uploaded: ${lightningUrl}/lightning/r/ContentDocument/${uploadResult.contentDocumentId}/view`);
    }
    console.log();

  } catch (error: any) {
    logger.error('PDF generation test failed', { error: error.message, stack: error.stack });
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

// Main execution
const applicationIdOrKey = process.argv[2];

if (!applicationIdOrKey) {
  console.error('Usage: npm run debug:pdf <application-id-or-key>');
  console.error('\nAvailable sample applications:');
  Object.keys(SAMPLE_APPLICATIONS).forEach(key => {
    console.error(`  - ${key}`);
  });
  process.exit(1);
}

testPDFGeneration(applicationIdOrKey)
  .then(() => {
    logger.info('Test completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    logger.error('Test failed', { error });
    process.exit(1);
  });

