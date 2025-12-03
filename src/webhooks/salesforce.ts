import express from 'express';
import { logger } from '../utils/logger.js';
import { getSalesforceClient } from '../salesforce/client.js';
import { pdfGenerator } from '../pdf/generator.js';
import { fieldMappingService } from '../config/field-mappings.js';

export const salesforceRouter = express.Router();

interface WebhookPayload {
  applicationId: string;
  // School identification (use either schoolId or schoolName)
  schoolId?: string;        // AccountId
  schoolName?: string;      // School_Name__c field value
  // Program identification (use either programId or programName)
  programId?: string;      // Program record ID
  programName?: string;     // LearningProgram or related program name
  // Optional parameters
  networkName?: string;     // Community network name (for template selection)
  documentTitle?: string;   // PDF document title (if not provided, will be generated)
  templateName?: string;    // Template name (if not provided, will be derived)
  // Legacy Apex Invocable compatibility
  pageName?: string;        // Legacy: pageName parameter (maps to templateName)
}

// Main webhook handler function (shared between routes)
const handleApplicationWebhook = async (req: express.Request, res: express.Response) => {
  try {
    const payload: WebhookPayload = req.body;
    const { 
      applicationId, 
      schoolId, 
      schoolName, 
      programId, 
      programName,
      networkName,
      documentTitle: _documentTitle,
      templateName,
      pageName: _pageName  // Legacy support
    } = payload;

    if (!applicationId) {
      return res.status(400).json({ error: 'applicationId is required' });
    }

    logger.info('PDF generation requested', { 
      applicationId, 
      schoolId, 
      schoolName, 
      programId, 
      programName,
      networkName 
    });

    // Connect to Salesforce
    const sfClient = await getSalesforceClient();
    await sfClient.connect();

    // If schoolName provided but not schoolId, query to get schoolId
    let resolvedSchoolId = schoolId;
    if (schoolName && !schoolId) {
      const schoolQuery = `
        SELECT Id, Name
        FROM Account
        WHERE Name = '${schoolName.replace(/'/g, "''")}'
        LIMIT 1
      `;
      const schools = await sfClient.query(schoolQuery);
      if (schools.length > 0) {
        resolvedSchoolId = schools[0].Id;
        logger.info('Resolved schoolName to schoolId', { schoolName, schoolId: resolvedSchoolId });
      }
    }

    // If programName provided but not programId, try to resolve
    let resolvedProgramId = programId;
    if (programName && !programId) {
      // Try to find program from application record
      const appQuery = `
        SELECT LearningProgram__c, ProgramTermApplnTimeline__r.LearningProgram__r.Id
        FROM IndividualApplication
        WHERE Id = '${applicationId}'
        LIMIT 1
      `;
      const apps = await sfClient.query(appQuery);
      if (apps.length > 0 && apps[0].LearningProgram__c) {
        resolvedProgramId = apps[0].LearningProgram__c;
      } else if (apps.length > 0 && apps[0].ProgramTermApplnTimeline__r?.LearningProgram__r?.Id) {
        resolvedProgramId = apps[0].ProgramTermApplnTimeline__r.LearningProgram__r.Id;
      }
    }

    // Get field mapping to determine which fields to query
    // Pass programName to support program-specific mappings (e.g., IllinoisCOM)
    let mapping = fieldMappingService.getMapping(resolvedSchoolId, resolvedProgramId, schoolName, programName);
    if (!mapping) {
      // Try with schoolName/programName as fallback
      const fallbackMapping = fieldMappingService.getMapping(undefined, resolvedProgramId, schoolName, programName);
      if (!fallbackMapping) {
        return res.status(400).json({ 
          error: `No field mapping found for schoolId: ${resolvedSchoolId}, schoolName: ${schoolName}, programId: ${resolvedProgramId}, programName: ${programName}` 
        });
      }
      // Use fallback mapping
      mapping = fallbackMapping;
      logger.warn('Using fallback field mapping', { resolvedSchoolId, resolvedProgramId, schoolName, programName });
    }

    // Build dynamic SOQL query based on field mapping
    // Note: relatedRecords fields are not valid in SOQL - they're populated after query
    const fields = fieldMappingService.getAllFields(mapping);
    // Filter out relatedRecords fields and Contact relationship fields (they're not valid in SOQL)
    // Also filter out fields that don't exist (like Specialty__c)
    const invalidFields = ['Specialty__c', 'ProgramTermApplnTimeline__c'];
    const soqlFields = fields.filter((f: string) => 
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
    
    // Combine field mapping fields with common fields
    const allFields = [...new Set([...commonFields, ...soqlFields])];

    // Query IndividualApplication with comprehensive field list
    // Note: Some fields may not be accessible via API - query will fail gracefully for those
    // We'll build the query and catch any field access errors
    const applicationQuery = `
      SELECT ${allFields.join(', ')},
        Account.Id, Account.Name, Account.BillingCity
      FROM IndividualApplication 
      WHERE Id = '${applicationId}'
    `;
    let applications: any[];
    try {
      applications = await sfClient.query(applicationQuery);
      logger.info('Application query successful', { fieldCount: allFields.length });
    } catch (queryError: any) {
      // If query fails due to inaccessible fields, try with confirmed accessible fields only
      if (queryError.errorCode === 'INVALID_FIELD') {
        logger.warn('Some fields not accessible, retrying with confirmed accessible fields', { error: queryError.message });
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
          WHERE Id = '${applicationId}'
        `;
        applications = await sfClient.query(safeQuery);
        logger.info('Used safe field set', { fieldCount: safeFields.length });
      } else {
        throw queryError;
      }
    }
    
    if (applications.length === 0) {
      return res.status(404).json({ error: 'Application not found' });
    }

    const application = applications[0];
    
    // Query Contact separately using Contact_ID__c (Contact relationship doesn't exist on IndividualApplication)
    if (application.Contact_ID__c) {
      try {
        const contactQuery = `
          SELECT Id, FirstName, LastName, Name, MobilePhone, Email,
                 MailingStreet, MailingCity, MailingState, MailingPostalCode, MailingCountry
          FROM Contact
          WHERE Id = '${application.Contact_ID__c}'
          LIMIT 1
        `;
        const contacts = await sfClient.query(contactQuery);
        if (contacts.length > 0) {
          application.Contact = contacts[0];
          logger.info('Retrieved Contact from Contact_ID__c', { contactId: application.Contact.Id });
        }
      } catch (err) {
        logger.warn('Failed to query Contact', { error: err, contactId: application.Contact_ID__c });
        // Try PersonEmployment as fallback
        try {
          const employmentQuery = `
            SELECT RelatedPersonId
            FROM PersonEmployment
            WHERE Individual_Application__c = '${applicationId}'
            LIMIT 1
          `;
          const employment = await sfClient.query(employmentQuery);
          if (employment.length > 0 && employment[0].RelatedPersonId) {
            const contactQuery = `SELECT Id, FirstName, LastName, Name, MobilePhone, Email, MailingStreet, MailingCity, MailingState, MailingPostalCode, MailingCountry FROM Contact WHERE Id = '${employment[0].RelatedPersonId}' LIMIT 1`;
            const contacts = await sfClient.query(contactQuery);
            if (contacts.length > 0) {
              application.Contact = contacts[0];
            }
          }
        } catch (err2) {
          logger.warn('Failed to get Contact from related records', { error: err2 });
        }
      }
    }

    // Query related records (based on existing Apex implementation)
    const relatedRecords: Record<string, any[]> = {};

    // Query PersonEmployment - matching Apex implementation
    try {
      const employmentQuery = `
        SELECT Id, RelatedPersonId, Name, Position, Sector__c
        FROM PersonEmployment
        WHERE Individual_Application__c = '${application.Id}'
      `;
      relatedRecords.Employment = await sfClient.query(employmentQuery);
      logger.info('PersonEmployment records found', { count: relatedRecords.Employment.length });
    } catch (error) {
      logger.warn('Failed to query PersonEmployment', { error, applicationId });
      relatedRecords.Employment = [];
    }

    // Query High School Education - matching Apex implementation
    try {
      const highSchoolQuery = `
        SELECT Id, ContactId, GraduationDate, Status, Name,
               EducationLevel, CumulativeGPA, IdentifierIssuer,
               Educational_Institution__c, InstitutionAccountId
        FROM PersonEducation
        WHERE Individual_Application__c = '${application.Id}'
          AND EducationLevel IN ('No Formal Education', 'High School Diploma')
      `;
      const highSchool = await sfClient.query(highSchoolQuery);
      relatedRecords.HighSchool = highSchool.length > 0 ? highSchool : [{}];
      logger.info('HighSchool education records found', { count: highSchool.length });
    } catch (error) {
      logger.warn('Failed to query HighSchool education', { error, applicationId });
      relatedRecords.HighSchool = [{}];
    }

    // Query College Education - matching Apex implementation
    // Note: CumulativeGPA is not accessible via API (Apex uses WITH SYSTEM_MODE)
    try {
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
    } catch (error) {
      logger.warn('Failed to query College education', { error, applicationId });
      relatedRecords.College = [];
    }

    // Query Checklist Items - matching test-pdf.ts implementation
    try {
      const checklistQuery = `
        SELECT Id, Name, Checklist_Type_Name__c, Status__c, 
               Date_Accepted__c, LastModifiedBy.Name
        FROM Checklist_Item__c
        WHERE Individual_Application__c = '${application.Id}'
        ORDER BY Checklist_Type_Name__c, Name
      `;
      const checklistItems = await sfClient.query(checklistQuery);
      relatedRecords.ChecklistItems = checklistItems.map((item: any) => ({
        ...item,
        LastModifiedByName: item.LastModifiedBy?.Name || '—',
      }));
      logger.info('Checklist items found', { count: relatedRecords.ChecklistItems.length });
    } catch (error) {
      logger.warn('Failed to query Checklist Items', { error, applicationId });
      relatedRecords.ChecklistItems = [];
    }

    // Combine application data with related records
    const applicationData = {
      ...application,
      relatedRecords,
    };

    // Generate PDF
    const pdfPath = await pdfGenerator.generate({
      applicationId,
      applicationData,
      schoolId,
      programId,
      templateName,
    });

    // Upload PDF back to Salesforce
    const uploadResult = await sfClient.uploadFile(
      `Application PDF - ${applicationId}`,
      pdfPath,
      applicationId
    );

    logger.info('PDF generated and uploaded', { 
      applicationId, 
      contentVersionId: uploadResult.contentVersionId,
      contentDocumentId: uploadResult.contentDocumentId,
      isNewVersion: uploadResult.isNewVersion,
      pdfPath 
    });

    return res.json({
      success: true,
      applicationId,
      contentVersionId: uploadResult.contentVersionId,
      contentDocumentId: uploadResult.contentDocumentId,
      isNewVersion: uploadResult.isNewVersion,
      pdfPath,
    });
  } catch (error: any) {
    logger.error('PDF generation failed', { error: error.message, stack: error.stack });
    return res.status(500).json({ 
      error: 'PDF generation failed', 
      message: error.message 
    });
  }
};

// Webhook endpoint routes - support multiple paths for API Gateway compatibility
salesforceRouter.post('/application', handleApplicationWebhook);
salesforceRouter.post('/', handleApplicationWebhook);  // Handle /webhook/salesforce directly

// Direct PDF generation endpoint
salesforceRouter.post('/pdf/generate', (req, res) => {
  try {
    const { applicationId } = req.body;

    if (!applicationId) {
      return res.status(400).json({ error: 'applicationId is required' });
    }

    // This endpoint redirects to the main webhook handler
    // For now, return an error indicating this endpoint needs implementation
    return res.status(501).json({ 
      error: 'Not implemented', 
      message: 'Use /webhook/application or /api/webhook/application instead' 
    });
  } catch (error: any) {
    logger.error('PDF generation endpoint error', { error: error.message });
    return res.status(500).json({ error: 'PDF generation failed', message: error.message });
  }
});

