import puppeteer, { Browser } from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import { readFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import Handlebars from 'handlebars';
import { logger } from '../utils/logger.js';
import { FieldMappingConfig, fieldMappingService } from '../config/field-mappings.js';

export type PDFOutputMode = 'complete' | 'lite';

export interface PDFGenerationOptions {
  applicationId: string;
  applicationData: Record<string, any>;
  schoolId?: string;
  programId?: string;
  templateName?: string;
  outputMode?: PDFOutputMode;
}

export class PDFGenerator {
  private templateDir: string;
  private outputDir: string;

  constructor() {
    const isLambda = !!process.env.AWS_LAMBDA_FUNCTION_NAME;
    
    this.templateDir = process.env.PDF_TEMPLATE_DIR || join(process.cwd(), 'templates');
    // In Lambda, use /tmp which is writable; locally use ./output
    this.outputDir = process.env.PDF_OUTPUT_DIR || (isLambda ? '/tmp/output' : join(process.cwd(), 'output'));
    
    // Ensure output directory exists
    mkdirSync(this.outputDir, { recursive: true });
  }

  async generate(options: PDFGenerationOptions): Promise<string> {
    const { applicationId, applicationData, schoolId, programId, templateName, outputMode = 'complete' } = options;

    try {
      // Get field mapping configuration
      const mapping = fieldMappingService.getMapping(schoolId, programId);
      if (!mapping) {
        throw new Error(`No field mapping found for schoolId: ${schoolId}, programId: ${programId}`);
      }

      // Load template based on output mode
      const template = this.loadTemplate(
        outputMode === 'lite' ? 'application-lite' : (templateName || 'application-default')
      );
      
      // Extract applicant name from application data
      const applicantName = this.extractApplicantName(applicationData);
      
      // Prepare data for template (including filename components for header)
      const templateData = this.prepareTemplateData(applicationData, mapping, applicantName, outputMode);
      
      // Render HTML
      const html = template(templateData);
      
      // Generate PDF with new filename format
      const pdfPath = await this.renderPDF(html, applicationId, applicationData, applicantName, outputMode);
      
      logger.info('PDF generated successfully', { applicationId, applicantName, pdfPath, outputMode });
      return pdfPath;
    } catch (error) {
      logger.error('PDF generation failed', { applicationId, error });
      throw error;
    }
  }

  private loadTemplate(templateName: string): Handlebars.TemplateDelegate {
    const templatePath = join(this.templateDir, `${templateName}.hbs`);
    try {
      const templateContent = readFileSync(templatePath, 'utf-8');
      return Handlebars.compile(templateContent);
    } catch {
      logger.warn('Template not found, using default', { templateName, templatePath });
      // Return a default template
      return Handlebars.compile(this.getDefaultTemplate());
    }
  }

  // Fields to exclude in lite mode (backend IDs and technical fields)
  private liteExcludeFields = [
    'Id', 'AccountId', 'Contact_ID__c', 'Owner__c', 'Opportunity__c',
    'Mogli_Number_from_Contact__c', 'Mogli_Opt_Out__c',
    'Duplicate_Record__c', 'Active__c', 'SIS_Status_Field__c',
    'Character_Statement_Needed__c', 'Manually_Trigger_Checklist_Items__c',
    'ProgramTermApplnTimelineId', 'Applicant_Portal_Status__c'
  ];

  // Essential fields to show in lite mode (only if populated)
  private liteIncludeLabels = [
    'Application Number', 'Application Status', 'Program Name', 'Term', 'Location',
    'Campus Location', 'First Name', 'Last Name', 'Name', 'Mobile', 'Email',
    'Mailing Street', 'Mailing City', 'Mailing State', 'Mailing Postal Code', 'Mailing Country',
    'Citizenship Status', 'Applied Date', 'Application Submitted Date',
    'Admissions Status', 'Decision', 'Applicant Decision', 'Decision Release Date',
    'Admit Contingencies', 'Interview Status', 'Interview Date',
    'First Generation Student', 'International Student',
    'Highest High School GPA', 'Highest College GPA', 'Cumulative GPA',
    'Scholarship', 'Scholarship Amount', 'Scholarship Message', 'Applying for Financial Aid',
    'Deposit Amount', 'Deposit Due Date', 'Deposit Date Passed'
  ];

  private prepareTemplateData(
    data: Record<string, any>, 
    mapping: FieldMappingConfig,
    applicantName?: string,
    outputMode: PDFOutputMode = 'complete'
  ): any {
    // Extract school and program names from actual application data (prioritize real data over mapping defaults)
    const schoolName = data.School_Name__c || data.School_Name_Text__c || data.Account?.Name || mapping.schoolName || 'Unknown School';
    const programName = data.Program_Name__c || data.LearningProgram || mapping.programName || 'Unknown Program';
    
    // Extract filename components for header
    // Pass programName to getSchoolAbbreviation for IllinoisCOM detection
    const schoolAbbrev = this.getSchoolAbbreviation(schoolName as string | undefined, programName as string | undefined);
    const location = this.extractLocation(data);
    const termName = this.extractTermName(data);

    // Log sample field values to debug data availability
    // Check both direct access and via getFieldValue to see which works
    const sampleFields = {
      AppliedDate_direct: data.AppliedDate,
      AppliedDate_getField: this.getFieldValue(data, 'AppliedDate'),
      Decision__c_direct: data.Decision__c,
      Decision__c_getField: this.getFieldValue(data, 'Decision__c'),
      Applicant_Decision__c_direct: data.Applicant_Decision__c,
      Applicant_Decision__c_getField: this.getFieldValue(data, 'Applicant_Decision__c'),
      Decision_Release_Date__c_direct: data.Decision_Release_Date__c,
      Decision_Release_Date__c_getField: this.getFieldValue(data, 'Decision_Release_Date__c'),
      Admit_Contingencies__c_direct: data.Admit_Contingencies__c,
      Admit_Contingencies__c_getField: this.getFieldValue(data, 'Admit_Contingencies__c'),
      Admissions_Status__c_direct: data.Admissions_Status__c,
      Admissions_Status__c_getField: this.getFieldValue(data, 'Admissions_Status__c'),
      First_Generation_Student__c_direct: data.First_Generation_Student__c,
      First_Generation_Student__c_getField: this.getFieldValue(data, 'First_Generation_Student__c'),
      International_Student__c_direct: data.International_Student__c,
      International_Student__c_getField: this.getFieldValue(data, 'International_Student__c'),
      Deposit_Amount__c_direct: data.Deposit_Amount__c,
      Deposit_Amount__c_getField: this.getFieldValue(data, 'Deposit_Amount__c'),
      Application_Submitted_Date__c_direct: data.Application_Submitted_Date__c,
      Application_Submitted_Date__c_getField: this.getFieldValue(data, 'Application_Submitted_Date__c'),
    };

    logger.info('Preparing template data', { 
      schoolName, 
      programName, 
      hasSchoolName: !!data.School_Name__c,
      hasProgramName: !!data.Program_Name__c,
      mappingSchoolName: mapping.schoolName,
      mappingProgramName: mapping.programName,
      availableFields: Object.keys(data).filter(k => !k.startsWith('_') && k !== 'attributes').slice(0, 20),
      hasRelatedRecords: !!data.relatedRecords,
      employmentCount: data.relatedRecords?.Employment?.length || 0,
      highSchoolCount: data.relatedRecords?.HighSchool?.length || 0,
      collegeCount: data.relatedRecords?.College?.length || 0,
      sampleFieldValues: sampleFields
    });

    // Build Salesforce instance URL for deep links
    const instanceUrl = process.env.SF_INSTANCE_URL || 'https://tcseducationsystem--staging.sandbox.lightning.force.com';
    const applicationRecordId = data.Id;
    const applicationUrl = applicationRecordId 
      ? `${instanceUrl}/lightning/r/IndividualApplication/${applicationRecordId}/view`
      : null;
    const opportunityId = data.Opportunity__c;
    const opportunityUrl = opportunityId
      ? `${instanceUrl}/lightning/r/Opportunity/${opportunityId}/view`
      : null;
    const learningProgramId = data.LearningProgramId;
    const programUrl = learningProgramId
      ? `${instanceUrl}/lightning/r/LearningProgram/${learningProgramId}/view`
      : null;

    const isLiteMode = outputMode === 'lite';

    const sections = (mapping.sections || []).map(section => {
      const fields = section.fields
        .map(field => {
          const value = this.getFieldValue(data, field.apiName);
          const formattedValue = this.formatFieldValue(value, field);
          
          // In lite mode, skip excluded fields and empty values
          if (isLiteMode) {
            if (this.liteExcludeFields.includes(field.apiName)) {
              return null;
            }
            // Only include if value is populated and label is in include list
            if (!this.liteIncludeLabels.includes(field.label)) {
              return null;
            }
            if (formattedValue === '—' || formattedValue === '' || formattedValue === null) {
              return null;
            }
          }
          
          // Add deep links for Application ID, Application Number, Opportunity, and Program
          let link: string | undefined;
          if (!isLiteMode) {
            if (applicationUrl && (field.apiName === 'Id' || field.label === 'Application ID')) {
              link = applicationUrl;
            } else if (applicationUrl && (field.apiName === 'Name' || field.label === 'Application Number')) {
              link = applicationUrl;
            } else if (opportunityUrl && (field.apiName === 'Opportunity__c' || field.label === 'Opportunity')) {
              link = opportunityUrl;
            } else if (programUrl && (field.apiName === 'Program_Name__c' || field.label === 'Program Name')) {
              link = programUrl;
            }
          }
          
          return {
            label: field.label,
            value: formattedValue,
            apiName: field.apiName,
            link,
          };
        })
        .filter(field => field !== null);
      
      return {
        name: section.name,
        fields,
      };
    }).filter(section => section.fields.length > 0); // Remove empty sections in lite mode
    
    // Process checklist items if available (only for complete mode)
    const checklistItems = isLiteMode ? [] : this.processChecklistItems((data.relatedRecords?.ChecklistItems || []) as any[]);

    return {
      applicationId: data.Id || data.Name,
      schoolName,
      programName,
      generatedDate: new Date().toLocaleDateString(),
      sections,
      rawData: data, // Include raw data for advanced templates
      // Filename components for header
      schoolAbbrev,
      location,
      applicantName: applicantName || '',
      termName,
      // Checklist items
      checklistItems,
    };
  }

  private processChecklistItems(items: any[]): any[] {
    if (!items || items.length === 0) return [];
    
    return items.map(item => {
      const status = item.Status__c || '—';
      let statusClass = '';
      if (status === 'Completed') {
        statusClass = 'status-completed';
      } else if (status === 'Waived') {
        statusClass = 'status-waived';
      } else {
        statusClass = 'status-pending';
      }
      
      // Format date
      let dateCompleted = '—';
      if (item.Date_Accepted__c) {
        try {
          const date = new Date(item.Date_Accepted__c as string | number | Date);
          dateCompleted = date.toLocaleDateString();
        } catch {
          dateCompleted = item.Date_Accepted__c;
        }
      }
      
      return {
        itemName: item.Checklist_Type_Name__c || item.Name || '—',
        status,
        statusClass,
        dateCompleted,
        completedBy: item.LastModifiedByName || '—',
      };
    });
  }

  /**
   * Extract field value from nested object structure
   * Handles paths like "relatedRecords.Employment[0].Name"
   */
  private getFieldValue(data: Record<string, any>, apiName: string): any {
    if (!apiName) return undefined;

    // Handle nested paths like "relatedRecords.Employment[0].Name"
    if (apiName.includes('.')) {
      const parts = apiName.split('.');
      let current: any = data;
      
      for (const part of parts) {
        // Handle array access like "Employment[0]"
        const arrayMatch = part.match(/^(\w+)\[(\d+)\]$/);
        if (arrayMatch) {
          const [, arrayName, index] = arrayMatch;
          if (current && Array.isArray(current[arrayName]) && current[arrayName][parseInt(index)]) {
            current = current[arrayName][parseInt(index)];
          } else {
            return undefined;
          }
        } else {
          if (current && typeof current === 'object' && part in current) {
            current = current[part];
          } else {
            return undefined;
          }
        }
      }
      return current;
    }

    // Simple field access
    return data[apiName];
  }

  private formatFieldValue(value: any, field: { format?: string; type?: string }): string {
    // Handle null, undefined, and empty strings
    if (value === null || value === undefined || value === '') {
      return '—'; // Use em dash for empty values to match template styling
    }

    // Handle boolean values
    if (typeof value === 'boolean') {
      return value ? 'Yes' : 'No';
    }

    // Handle zero values - they're valid, don't show as empty
    if (typeof value === 'number' && value === 0) {
      return '0';
    }

    if (field.format) {
      // Apply custom formatting
      switch (field.format) {
        case 'date':
          try {
            // Handle ISO date strings and Date objects
            let date: Date;
            if (typeof value === 'string') {
              // Handle ISO date strings (with or without time)
              if (value.includes('T')) {
                date = new Date(value);
              } else {
                // Just a date string like '2024-07-09'
                date = new Date(value + 'T00:00:00');
              }
            } else if (value instanceof Date) {
              date = value;
            } else {
              return String(value);
            }
            // Check if date is valid
            if (isNaN(date.getTime())) {
              return String(value);
            }
            return date.toLocaleDateString();
          } catch (e) {
            logger.warn('Date formatting failed', { value, error: e });
            return String(value);
          }
        case 'currency':
          try {
            const numValue = typeof value === 'string' ? parseFloat(value) : (value as number);
            if (isNaN(numValue)) return String(value);
            return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(numValue);
          } catch {
            return String(value);
          }
        case 'phone':
          return this.formatPhone(value as string);
        default:
          return String(value);
      }
    }

    return String(value);
  }

  private formatPhone(phone: string): string {
    // Simple phone formatting
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 10) {
      return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
    }
    return phone;
  }

  private extractApplicantName(applicationData: Record<string, any>): string | undefined {
    // Try to get name from Contact relationship
    if (applicationData.Contact?.FirstName && applicationData.Contact?.LastName) {
      return `${applicationData.Contact.FirstName} ${applicationData.Contact.LastName}`;
    }
    
    // Try direct fields
    if (applicationData.FirstName && applicationData.LastName) {
      return `${applicationData.FirstName} ${applicationData.LastName}`;
    }
    
    // Try Account/PersonAccount name
    if (applicationData.Account?.Name) {
      return applicationData.Account.Name;
    }
    
    // Try Contact name
    if (applicationData.Contact?.Name) {
      return applicationData.Contact.Name;
    }
    
    return undefined;
  }

  private getSchoolAbbreviation(schoolName?: string, programName?: string): string {
    if (!schoolName) return '';
    
    // Check school name first to distinguish KHSU from IllinoisCOM
    // Both have "Doctor of Osteopathic Medicine" program, but are different institutions
    const schoolMap: Record<string, string> = {
      'The Chicago School': 'TCS',
      'Pacific Oaks': 'POC',
      'Pacific Oaks College': 'POC',
      'Saybrook University': 'SAY',
      'Kansas Health Science University': 'KHSU',
      'University of Western States': 'UWS',
      'The Colleges of Law': 'COL',
      'IllinoisCOM': 'IllinoisCOM',
    };
    
    // Try exact match first
    if (schoolMap[schoolName]) {
      return schoolMap[schoolName];
    }
    
    // Check if program name indicates IllinoisCOM (only if school name doesn't match KHSU)
    // This handles cases where school name might not be set but program name indicates IllinoisCOM
    if (programName && programName.includes('Doctor of Osteopathic Medicine') && 
        schoolName !== 'Kansas Health Science University') {
      return 'IllinoisCOM';
    }

    // Try exact match first
    if (schoolMap[schoolName]) {
      return schoolMap[schoolName];
    }

    // Try partial match
    for (const [key, abbrev] of Object.entries(schoolMap)) {
      if (schoolName.includes(key) || key.includes(schoolName)) {
        return abbrev;
      }
    }

    return '';
  }

  private extractLocation(applicationData: Record<string, any>): string {
    // Try various location fields
    if (applicationData.Location__c) return applicationData.Location__c;
    if (applicationData.Campus__c) return applicationData.Campus__c;
    if (applicationData.ProgramTermApplnTimeline__r?.Location__c) {
      return applicationData.ProgramTermApplnTimeline__r.Location__c;
    }
    if (applicationData.ProgramTermApplnTimeline__r?.Campus__c) {
      return applicationData.ProgramTermApplnTimeline__r.Campus__c;
    }
    
    // Try to extract from Account
    if (applicationData.Account?.BillingCity) {
      return applicationData.Account.BillingCity;
    }
    
    return '';
  }

  private extractProgramName(applicationData: Record<string, any>): string {
    // Try Program_Name__c (most reliable custom field)
    if (applicationData.Program_Name__c) {
      return applicationData.Program_Name__c;
    }
    
    // Try related record from ProgramTermApplnTimeline
    if (applicationData.ProgramTermApplnTimeline__r?.LearningProgram__r?.Name) {
      return applicationData.ProgramTermApplnTimeline__r.LearningProgram__r.Name;
    }
    
    // Try LearningProgram relationship (if accessible)
    if (applicationData.LearningProgram__r?.Name) {
      return applicationData.LearningProgram__r.Name;
    }
    
    // Try LearningProgram field (may not be accessible via API)
    if (applicationData.LearningProgram) {
      return String(applicationData.LearningProgram);
    }
    
    return '';
  }

  private extractTermName(applicationData: Record<string, any>): string {
    // Try direct fields on application first (most reliable)
    if (applicationData.Term__c) {
      return this.formatTermName(applicationData.Term__c as string);
    }
    
    if (applicationData.Academic_Term__c) {
      return this.formatTermName(applicationData.Academic_Term__c as string);
    }
    
    // AcademicTerm may not be accessible via API, but try it if available
    if (applicationData.AcademicTerm) {
      return this.formatTermName(applicationData.AcademicTerm as string);
    }
    
    // Try to get term from ProgramTermApplnTimeline (if queried separately)
    const timeline = applicationData.ProgramTermApplnTimeline__r;
    
    if (timeline) {
      // Try term name field
      if (timeline.Term__c) {
        return this.formatTermName(timeline.Term__c as string);
      }
      
      // Try term relationship
      if (timeline.Term__r?.Name) {
        return this.formatTermName(timeline.Term__r.Name as string);
      }
      
      // Try Academic_Term__c
      if (timeline.Academic_Term__c) {
        return this.formatTermName(timeline.Academic_Term__c as string);
      }
      
      // Try to construct from year and term type
      if (timeline.Term_Year__c && timeline.Term_Type__c) {
        return `${timeline.Term_Year__c} ${timeline.Term_Type__c}`;
      }
    }
    
    return '';
  }

  private formatTermName(termValue: string): string {
    if (!termValue) return '';
    
    // If already in "2025 Fall" format, return as is
    if (/^\d{4}\s+\w+$/.test(termValue.trim())) {
      return termValue.trim();
    }
    
    // Try to extract year and term from various formats
    const yearMatch = termValue.match(/\b(20\d{2})\b/);
    const termMatch = termValue.match(/\b(Fall|Spring|Summer|Winter)\b/i);
    
    if (yearMatch && termMatch) {
      return `${yearMatch[1]} ${termMatch[1]}`;
    }
    
    // If we can't parse it, return truncated version
    return termValue.substring(0, 20).trim();
  }

  private generateFilename(
    applicationId: string,
    applicationData: Record<string, any>,
    applicantName?: string
  ): string {
    const parts: string[] = [];
    
    // School abbreviation - check program name first for special cases like IllinoisCOM
    const schoolName = applicationData.School_Name__c || applicationData.School_Name_Text__c || applicationData.Account?.Name;
    const programNameForAbbrev = applicationData.Program_Name__c || applicationData.LearningProgram;
    const schoolAbbrev = this.getSchoolAbbreviation(schoolName as string | undefined, programNameForAbbrev as string | undefined);
    if (schoolAbbrev) {
      parts.push(schoolAbbrev);
    }
    
    // Location
    const location = this.extractLocation(applicationData);
    if (location) {
      parts.push(location);
    }
    
    // Applicant name (if available) - moved before program and term
    if (applicantName) {
      parts.push(applicantName);
    }
    
    // Program name
    const programName = this.extractProgramName(applicationData);
    if (programName) {
      parts.push(programName);
    }
    
    // Term name
    const termName = this.extractTermName(applicationData);
    if (termName) {
      parts.push(termName);
    }
    
    // Sanitize and join parts
    const filename = parts
      .map(part => part
        .replace(/[^a-zA-Z0-9\s-]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
      )
      .filter(part => part.length > 0)
      .join('-');
    
    // Fallback to application ID if no parts
    if (!filename || filename.length === 0) {
      return `Application-${applicationId}.pdf`;
    }
    
    // Limit total length and add extension
    const maxLength = 200;
    const sanitized = filename.substring(0, maxLength).trim();
    return `${sanitized} Application.pdf`;
  }

  private async renderPDF(
    html: string, 
    applicationId: string, 
    applicationData: Record<string, any>,
    applicantName?: string,
    outputMode: PDFOutputMode = 'complete'
  ): Promise<string> {
    const isLambda = !!process.env.AWS_LAMBDA_FUNCTION_NAME;
    
    let browser: Browser;
    if (isLambda) {
      // Use @sparticuz/chromium for Lambda
      browser = await puppeteer.launch({
        args: chromium.args,
        defaultViewport: { width: 1920, height: 1080 },
        executablePath: await chromium.executablePath(),
        headless: true,
      });
    } else {
      // Local development - use system Chrome or puppeteer's bundled Chrome
      browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      });
    }

    try {
      const page = await browser.newPage();
      // Wait for page to be ready before setting content
      await page.setContent(html, { waitUntil: 'domcontentloaded' });
      
      // Generate filename with format: School-Location-Applicant-Program-Term Application.pdf
      const filename = this.generateFilename(applicationId, applicationData, applicantName);
      
      // Output to different folders based on mode
      const subFolder = outputMode === 'lite' ? 'App Lite' : 'Complete Application';
      const outputPath = join(this.outputDir, subFolder);
      mkdirSync(outputPath, { recursive: true });
      
      const pdfPath = join(outputPath, filename);
      await page.pdf({
        path: pdfPath,
        format: 'Letter',
        printBackground: true,
        margin: {
          top: '0.5in',
          right: '0.5in',
          bottom: '0.5in',
          left: '0.5in',
        },
      });

      return pdfPath;
    } finally {
      await browser.close();
    }
  }

  private getDefaultTemplate(): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; }
    h1 { color: #333; border-bottom: 2px solid #0066cc; padding-bottom: 10px; }
    .section { margin: 20px 0; }
    .section-title { font-size: 18px; font-weight: bold; color: #0066cc; margin-bottom: 10px; }
    .field { margin: 8px 0; }
    .field-label { font-weight: bold; display: inline-block; width: 200px; }
    .field-value { display: inline-block; }
    .header { text-align: center; margin-bottom: 30px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>{{schoolName}} - {{programName}}</h1>
    <p>Application ID: {{applicationId}}</p>
    <p>Generated: {{generatedDate}}</p>
  </div>
  
  {{#each sections}}
  <div class="section">
    <div class="section-title">{{name}}</div>
    {{#each fields}}
    <div class="field">
      <span class="field-label">{{label}}:</span>
      <span class="field-value">{{value}}</span>
    </div>
    {{/each}}
  </div>
  {{/each}}
</body>
</html>
    `;
  }
}

export const pdfGenerator = new PDFGenerator();

