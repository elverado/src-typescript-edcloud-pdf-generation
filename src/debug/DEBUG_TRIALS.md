# PDF Generation Debug Trials

This document tracks PDF generation test runs for debugging and validation purposes.

## PDF Output Modes

Each test run generates **two PDF versions**:
- **Complete Application** (`output/Complete Application/`) - Full PDF with deep links to Salesforce records, all fields, and checklist items
- **App Lite** (`output/App Lite/`) - Summary PDF with essential fields only, no backend IDs

## Config Inheritance

All school configs now use inheritance from `default.json`:
```
default.json (base)
├── tcs.json (The Chicago School - flagship)
├── illinoiscom.json (adds waitlist fields)
│   └── khsu.json (inherits from illinoiscom)
├── poc.json (adds LACOE field)
├── say.json
├── col.json
└── uws.json (most customized)
```

## File Versioning

PDFs are uploaded to Salesforce with **automatic versioning**:
- First upload creates a new ContentDocument
- Subsequent uploads create new versions (v2, v3, etc.)
- Salesforce maintains full version history

## Purging Old Artifacts

To clean up old PDF files before fresh testing:

```bash
npm run purge:artifacts
```

This deletes all PDF files attached to the trial applications in Salesforce.

## Trial Format

Each trial includes:
- **Date**: When the test was run
- **Application ID**: Salesforce IndividualApplication record ID
- **URL**: Link to the application in Salesforce (if available)
- **Purpose**: What we're testing
- **Result**: Success/Failure and notes
- **Output Files**: Generated PDF filenames (Complete + Lite)
- **Issues Found**: Any problems encountered
- **Resolution**: How issues were resolved

---

## Trial #1

**Date**: 2025-12-01  
**Application ID**: `0iTHn000000YwRtMAK`  
**URL**: https://tcseducationsystem--staging.sandbox.lightning.force.com/lightning/r/IndividualApplication/0iTHn000000YwRtMAK/view  
**Purpose**: Initial test of PDF generation with new filename format (School-Location-Program-Term-Applicant) and alignment with Apex implementation  
**Result**: ✅ **SUCCESS** - PDF generated successfully  
**Output File**: `TCS-Los Angeles-PsyD Clinical Psychology-2025 Fall-Areej Khalid Application.pdf`  
**Applicant**: Areej Khalid  
**School**: The Chicago School  
**Program**: Psy.D. Clinical Psychology  
**Location**: Los Angeles  
**Term**: 2025 Fall

**Command Used**:
```bash
npm run debug:pdf 0iTHn000000YwRtMAK
```

**Issues Found**:
- Many fields not accessible via API (ContactId, LearningProgram, AcademicTerm, Academic_Term__c, etc.)
- ContactId cannot be queried directly from IndividualApplication
- Some related record fields not accessible (EmploymentType, AccountId on PersonEducation)

**Resolution**:
- Used Apex pattern: get Contact/Person info from related records instead of directly from IndividualApplication
- Simplified query to only accessible fields: Id, AccountId, Category, Status, School_Name__c, Program_Name__c, Location__c, Term__c
- Contact name retrieved from Account relationship when ContactId not accessible
- Query Contact separately from PersonEmployment (RelatedPersonId) and PersonEducation (ContactId) when needed
- Removed inaccessible fields from queries (EmploymentType, AccountId on PersonEducation)

**Notes**:
- PDF generation works even with some related record fields inaccessible
- Following working Apex implementation pattern is key
- Many fields accessible in Apex (WITH SYSTEM_MODE) are not accessible via standard API
- Using safe field set confirmed accessible via MCP queries
- PDFs regenerated 2025-12-01 with improved field extraction and boolean/numeric formatting

---

## Trial #2

**Date**: 2025-12-01  
**Application ID**: `IA-0000001663`  
**URL**: _TBD_  
**Purpose**: Additional test case for PDF generation with different application  
**Result**: ✅ **SUCCESS** - PDF generated successfully  
**Output File**: `TCS-Los Angeles-PsyD Clinical Psychology-2025 Fall-Emma Schmidt Application.pdf`  
**Applicant**: Emma Schmidt  
**School**: The Chicago School  
**Program**: Psy.D. Clinical Psychology  
**Location**: Los Angeles  
**Term**: 2025 Fall

**Command Used**:
```bash
npm run debug:pdf IA-0000001663
```

**Issues Found**:
- Query failed when using Name field (IA-0000001663) instead of Id

**Resolution**:
- Added support for both Id (18-char) and Name (IA-0000001663) lookups
- Query uses `WHERE Id = '...'` for Ids and `WHERE Name = '...'` for names

**Notes**:
- Successfully generated PDF with Name-based lookup
- Same field access limitations as Trial 1

---

## Trial #3

**Date**: 2025-12-01  
**Application ID**: `IA-0000001664`  
**URL**: _TBD_  
**Purpose**: Additional test case for PDF generation with different program and location  
**Result**: ✅ **SUCCESS** - PDF generated successfully  
**Output File**: `TCS-Washington DC-MA Forensic Psychology Professional Counselor Licensure Track-2025 Fall-Maimouna Doumbia Application.pdf`  
**Applicant**: Maimouna Doumbia  
**School**: The Chicago School  
**Program**: MA Forensic Psychology Professional Counselor Licensure Track  
**Location**: Washington DC  
**Term**: 2025 Fall

**Command Used**:
```bash
npm run debug:pdf IA-0000001664
```

**Issues Found**:
- None

**Notes**:
- Successfully generated PDF with different program and location
- Filename correctly includes full program name and location

---

## Key Learnings

1. **Field Access Limitations**: Many fields accessible via MCP server are not accessible via jsforce API due to permissions/field-level security
2. **Apex Pattern**: Following the working Apex implementation pattern:
   - Don't query ContactId directly from IndividualApplication
   - Get Contact/Person info from related records (PersonEmployment uses RelatedPersonId, PersonEducation uses ContactId)
   - Query Contact separately when needed
3. **Query Simplification**: Only query fields that are known to work via API
4. **Name vs Id Lookup**: Support both Id (18-char) and Name (IA-0000001663) lookups for applications
5. **Graceful Degradation**: PDF generation works even when some related record fields are inaccessible

---

## Common Issues & Solutions

### Issue: Application not found
**Solution**: Verify application ID is correct and exists in the org

### Issue: Missing fields in filename
**Solution**: Check field mappings and ensure queries include necessary relationship fields

### Issue: PDF generation timeout
**Solution**: Check Puppeteer configuration and increase timeout if needed

### Issue: Template not found
**Solution**: Verify template file exists in `templates/` directory

### Issue: Field not accessible via API
**Solution**: 
- Check field-level security and permissions
- Use alternative fields or relationships
- Query related records separately if needed

---

## Field Extraction Reference

### School Abbreviations
- The Chicago School → TCS
- Pacific Oaks / Pacific Oaks College → POC
- Saybrook University → SAY
- Kansas Health Science University → KHSU
- University of Western States → UWS
- The Colleges of Law → COL

### Required Fields for Filename
- `School_Name__c` or `Account.Name` - For school abbreviation
- `Location__c` or `Campus__c` or `ProgramTermApplnTimeline__r.Location__c` - For location
- `Program_Name__c` or `LearningProgram__c` or `ProgramTermApplnTimeline__r.LearningProgram__r.Name` - For program
- `Term__c` or `AcademicTerm` or `ProgramTermApplnTimeline__r.Term__c` - For term
- `Contact.FirstName` and `Contact.LastName` - For applicant name (retrieved from related records)

### Accessible Fields (via API)
- `Id`, `AccountId`, `Category`, `Status`
- `School_Name__c`, `Program_Name__c`
- `Location__c`, `Term__c`
- `Account.Id`, `Account.Name`, `Account.BillingCity`

### Inaccessible Fields (via API)
- `ContactId` (must get from related records)
- `LearningProgram` (use `Program_Name__c` instead)
- `AcademicTerm`, `Academic_Term__c`
- `ProgramTermApplnTimelineId`
- `EmploymentType` on PersonEmployment
- `AccountId` on PersonEducation (use `InstitutionAccountId` instead)

---

## School-Specific Test Cases

### The Chicago School (TCS)

#### Trial #4 - TCS Application 1
**Date**: 2025-12-01  
**Application ID**: `0iTHn000000YwRtMAK` / `IA-0000001566`  
**URL**: https://tcseducationsystem--staging.sandbox.lightning.force.com/lightning/r/IndividualApplication/0iTHn000000YwRtMAK/view  
**Purpose**: Initial TCS test case with comprehensive field mapping  
**Result**: ✅ **SUCCESS**  
**Output File**: `TCS-Los Angeles-Areej Khalid-PsyD Clinical Psychology-2025 Fall Application.pdf`  
**Applicant**: Areej Khalid  
**School**: The Chicago School  
**Program**: Psy.D. Clinical Psychology  
**Location**: Los Angeles  
**Term**: 2025 Fall  
**Command**: `npm run debug:pdf 0iTHn000000YwRtMAK`

#### Trial #5 - TCS Application 2
**Date**: 2025-12-01  
**Application ID**: `IA-0000001663`  
**Purpose**: Additional TCS test case  
**Result**: ✅ **SUCCESS**  
**Output File**: `TCS-Los Angeles-Emma Schmidt-PsyD Clinical Psychology-2025 Fall Application.pdf`  
**Applicant**: Emma Schmidt  
**School**: The Chicago School  
**Program**: Psy.D. Clinical Psychology  
**Location**: Los Angeles  
**Term**: 2025 Fall  
**Command**: `npm run debug:pdf IA-0000001663`

#### Trial #6 - TCS Application 3
**Date**: 2025-12-01  
**Application ID**: `IA-0000001664`  
**Purpose**: TCS test case with different program and location  
**Result**: ✅ **SUCCESS**  
**Output File**: `TCS-Washington DC-Maimouna Doumbia-MA Forensic Psychology Professional Counselor Licensure Track-2025 Fall Application.pdf`  
**Applicant**: Maimouna Doumbia  
**School**: The Chicago School  
**Program**: MA Forensic Psychology Professional Counselor Licensure Track  
**Location**: Washington DC  
**Term**: 2025 Fall  
**Command**: `npm run debug:pdf IA-0000001664`

---

### Kansas Health Science University (KHSU)

#### Trial #7 - KHSU Application (Doctor of Osteopathic Medicine)
**Date**: 2025-12-01  
**Application ID**: `IA-0000189256`  
**Purpose**: Test KHSU-specific field mapping for "Doctor of Osteopathic Medicine" program  
**Result**: ✅ **SUCCESS**  
**Output File**: `KHSU-Wichita-Dustin Ness-Doctor of Osteopathic Medicine-2025 Fall Application.pdf`  
**Applicant**: Dustin Ness  
**School**: Kansas Health Science University  
**Program**: Doctor of Osteopathic Medicine  
**Location**: Wichita  
**Term**: 2025 Fall  
**Command**: `npm run debug:pdf IA-0000189256`  
**Notes**: 
- Uses school name-based mapping (`khsu.json`)
- School name takes priority over program name to distinguish from IllinoisCOM
- School abbreviation correctly shows "KHSU"
- Both KHSU and IllinoisCOM offer "Doctor of Osteopathic Medicine" but are distinct institutions

---

### IllinoisCOM (Program-Specific Mapping)

#### Trial #8 - IllinoisCOM Application
**Date**: 2025-12-01  
**Application ID**: `IA-0000189775`  
**Purpose**: Test program-specific field mapping for IllinoisCOM (Doctor of Osteopathic Medicine)  
**Result**: ✅ **SUCCESS**  
**Output File**: `IllinoisCOM-Wichita-David Dat Huy Huynh-Doctor of Osteopathic Medicine-2025 Fall Application.pdf`  
**Applicant**: David Dat Huy Huynh  
**School**: IllinoisCOM (mapped via program name when school name doesn't match KHSU)  
**Program**: Doctor of Osteopathic Medicine  
**Location**: Wichita  
**Term**: 2025 Fall  
**Command**: `npm run debug:pdf IA-0000189775`  
**Notes**: 
- Uses program name-based mapping (`illinoiscom.json`) when school name is not "Kansas Health Science University"
- Program name "Doctor of Osteopathic Medicine" triggers IllinoisCOM mapping only if school name doesn't match KHSU
- School abbreviation should show "IllinoisCOM" (updated logic prioritizes school name first)

---

### The Colleges of Law (COL)

#### Trial #9 - COL Application
**Date**: 2025-12-01  
**Application ID**: `IA-0000158358`  
**Purpose**: Test COL-specific field mapping  
**Result**: ✅ **SUCCESS**  
**Output File**: `COL-Ventura-Omar Reyes-Juris Doctor-2024 Fall Application.pdf`  
**Applicant**: Omar Reyes  
**School**: The Colleges of Law  
**Program**: Juris Doctor  
**Location**: Ventura  
**Term**: 2024 Fall JD Ground  
**Command**: `npm run debug:pdf IA-0000158358`  
**Notes**: 
- Uses school name-based mapping (`col.json`)
- School abbreviation correctly shows "COL"

---

### Pacific Oaks College (POC)

#### Trial #10 - POC Application
**Date**: 2025-12-01  
**Application ID**: `IA-0000169604`  
**Purpose**: Test POC-specific field mapping including LACOE_Student__c field  
**Result**: ✅ **SUCCESS**  
**Output File**: `POC-Online-Xiomara y Reyes-Bachelor of Social Work-2024 Summer Application.pdf`  
**Applicant**: Xiomara y Reyes  
**School**: Pacific Oaks College  
**Program**: Bachelor of Social Work  
**Location**: Online  
**Term**: 2024 Summer 2 Session  
**Command**: `npm run debug:pdf IA-0000169604`  
**Notes**: 
- Uses school name-based mapping (`poc.json`)
- Includes POC-specific field: `LACOE_Student__c`
- School abbreviation correctly shows "POC"

---

### University of Western States (UWS)

#### Trial #11 - UWS Application
**Date**: 2025-12-01  
**Application ID**: `IA-0000217624`  
**Purpose**: Test UWS-specific field mapping including UWS-specific fields  
**Result**: ✅ **SUCCESS**  
**Output File**: `UWS-UWS Online-Jamie L Kratky-MS Human Nutrition and Functional Medicine-2025 Summer Application.pdf`  
**Applicant**: Jamie L Kratky  
**School**: University of Western States  
**Program**: MS Human Nutrition and Functional Medicine  
**Location**: UWS Online  
**Term**: Summer Term 2025  
**Command**: `npm run debug:pdf IA-0000217624`  
**Notes**: 
- Uses school name-based mapping (`uws.json`)
- Includes UWS-specific fields:
  - `Relative_Attended__c`
  - `Relationship_to_Attending_Relative__c`
  - `Relative_Employed__c`
  - `Relationship_to_Employed_Relative__c`
  - `Graduated_from_Prior_Degree_Program__c`
  - `Conviction_Detail__c`
  - `Academic_Sanction__c`
  - `Academic_Sanction_Detail__c`
  - `Has_Bachelors__c`
  - `Pursue_BS_Human_Bio__c`
  - `Current_Student__c`
  - `Wish_to_Withdraw__c`
- School abbreviation correctly shows "UWS"

---

### Saybrook University (SAY)

#### Trial #12 - SAY Application
**Date**: 2025-12-01  
**Application ID**: `IA-0000002075`  
**Purpose**: Test SAY-specific field mapping  
**Result**: ✅ **SUCCESS**  
**Output File**: `SAY-Hybrid Online-Elvira Arlene Laguna-Ph.D. Transformative Social Change-2025 Fall Application.pdf`  
**Applicant**: Elvira Arlene Laguna  
**School**: Saybrook University  
**Program**: Ph.D. Transformative Social Change  
**Location**: Hybrid Online  
**Term**: 2025 Fall 1 15-Weeks  
**Command**: `npm run debug:pdf IA-0000002075`  
**Notes**: 
- Uses school name-based mapping (`say.json`)
- Includes populated GPA fields (`Highest_College_GPA__c`: 3.60)
- Includes detailed scholarship message
- `Full_Part_Time__c`: "Full Time"
- `Applying_for_Financial_Aid__c`: "Yes"
- `Interview_Date__c`: populated (2025-07-15)
- `Decision_Release_Date__c`: populated (2025-07-18)
- School abbreviation correctly shows "SAY"

---

## Quick Reference: Test All Schools

To test PDF generation for all schools, run:

```bash
# The Chicago School (TCS) - 3 test applications
npm run debug:pdf IA-0000001566
npm run debug:pdf IA-0000001663
npm run debug:pdf IA-0000001664

# Kansas Health Science University (KHSU) - inherits from illinoiscom
npm run debug:pdf IA-0000189256

# KHSU Application (shows in KHSU folder due to school name priority)
npm run debug:pdf IA-0000189775

# The Colleges of Law (COL)
npm run debug:pdf IA-0000158358

# Pacific Oaks College (POC) - includes LACOE field
npm run debug:pdf IA-0000169604

# University of Western States (UWS) - most customized config
npm run debug:pdf IA-0000217624

# Saybrook University (SAY)
npm run debug:pdf IA-0000002075
```

### Output Folders

After running tests, check:
- `output/Complete Application/` - Full PDFs with deep links
- `output/App Lite/` - Summary PDFs

### Expected Files per School

| School | Complete | Lite |
|--------|----------|------|
| TCS | 3 PDFs | 3 PDFs |
| KHSU | 2 PDFs | 2 PDFs |
| COL | 1 PDF | 1 PDF |
| POC | 1 PDF | 1 PDF |
| UWS | 1 PDF | 1 PDF |
| SAY | 1 PDF | 1 PDF |
| **Total** | **9 PDFs** | **9 PDFs** |

---

## AWS Lambda Deployment Trials

### Trial #13 - Lambda Remote Connectivity Test

**Date**: 2025-12-03  
**Environment**: AWS Lambda (staging)  
**Endpoint**: `https://urnfgdtgu6.execute-api.us-east-2.amazonaws.com`  
**Purpose**: Validate Lambda deployment and Salesforce connectivity from AWS  
**Result**: ✅ **SUCCESS** after fixes

**Health Check Command**:
```powershell
curl -s https://urnfgdtgu6.execute-api.us-east-2.amazonaws.com/health | ConvertFrom-Json | Format-List
```

**Health Check Response**:
```
status     : healthy
timestamp  : 12/3/2025 3:12:37 AM
salesforce : connected
```

**Issues Found**:
1. **Winston file logging crash** - Lambda tried to create `/var/task/log` directory (read-only)
2. **PDFGenerator output directory crash** - Lambda tried to create `/var/task/output` directory (read-only)

**Resolution**:
1. Modified `src/utils/logger.ts` to disable file transports in Lambda (console only)
2. Modified `src/pdf/generator.ts` to use `/tmp/output` in Lambda environment

**Key Learnings**:
- Lambda `/var/task` is read-only; only `/tmp` is writable
- Check for `AWS_LAMBDA_FUNCTION_NAME` env var to detect Lambda environment
- CloudWatch Logs captures console output, so file logging is unnecessary in Lambda

**CloudWatch Logs Command**:
```bash
aws logs tail /aws/lambda/pdf-service-staging --since 10m --region us-east-2
```

**Test Application IDs** (same as local trials):
```bash
# Test webhook with existing application IDs
curl -X POST https://urnfgdtgu6.execute-api.us-east-2.amazonaws.com/webhook/salesforce/application \
  -H "Content-Type: application/json" \
  -d '{"applicationId": "IA-0000001566"}'  # TCS - Areej Khalid

curl -X POST https://urnfgdtgu6.execute-api.us-east-2.amazonaws.com/webhook/salesforce/application \
  -H "Content-Type: application/json" \
  -d '{"applicationId": "IA-0000001663"}'  # TCS - Emma Schmidt

curl -X POST https://urnfgdtgu6.execute-api.us-east-2.amazonaws.com/webhook/salesforce/application \
  -H "Content-Type: application/json" \
  -d '{"applicationId": "IA-0000001664"}'  # TCS - Maimouna Doumbia
```

**Notes**:
- Lambda function name: `pdf-service-staging`
- API Gateway endpoint auto-generated by Terraform
- Secrets stored in AWS Secrets Manager: `pdf-service/staging/salesforce`
- Memory: 2048 MB, Timeout: 15 minutes

**Additional Issues Fixed**:
1. **Express route mismatch** - API Gateway sends to `/webhook/salesforce`, added root route handler
2. **Field mappings not loading** - Added hardcoded fallback config when JSON files fail to load
3. **Puppeteer Chrome not found** - Set `PUPPETEER_CACHE_DIR` before installing Chrome in Dockerfile
4. **Application Name vs ID** - Use 18-char Salesforce IDs, not Name values like `IA-0000001566`
