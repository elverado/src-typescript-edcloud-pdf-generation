# Field Differences by School

This document tracks field availability differences across schools. Some fields may be available for certain schools but not others due to:
- Custom field configurations per school
- Field-level security settings
- School-specific implementations

## Config Inheritance Structure

All school configs now use inheritance from `default.json`:

```
default.json (base - ~400 lines of common fields)
├── tcs.json        → The Chicago School (flagship)
├── illinoiscom.json → IllinoisCOM (adds waitlist fields)
│   └── khsu.json   → Kansas Health Science University (inherits from illinoiscom)
├── poc.json        → Pacific Oaks College (adds LACOE field)
├── say.json        → Saybrook University
├── col.json        → The Colleges of Law
└── uws.json        → University of Western States (most customized)
```

**Note:** KHSU inherits from IllinoisCOM (not directly from default) because both medical schools share waitlist-related fields.

## Field Availability Matrix

### The Chicago School (TCS) - Flagship
**Config:** `tcs.json` extends `default`

**Unique Fields (added to default):**
- `Acknowledge_Statement_Signature__c` ✅

**All Standard Fields:** ✅ Inherited from default.json

---

### Kansas Health Science University (KHSU)
**Config:** `khsu.json` extends `illinoiscom`

KHSU offers "Doctor of Osteopathic Medicine" program and inherits all fields from IllinoisCOM config, including waitlist fields.

**Inherited from IllinoisCOM:**
- `Waitlist_Activated__c` ✅
- `Date_Waitlist_Activated__c` ✅
- All standard fields from default.json

**Mapping Priority:** School name takes priority over program name, so KHSU applications use `khsu.json` even though the program name matches IllinoisCOM.

---

### IllinoisCOM (Illinois College of Osteopathic Medicine)
**Config:** `illinoiscom.json` extends `default`
**Program:** Doctor of Osteopathic Medicine

**Unique Fields (added to default):**
- `Waitlist_Activated__c` ✅
- `Date_Waitlist_Activated__c` ✅
- `Acknowledge_Statement_Signature__c` ✅
- `ProgramTermApplnTimeline__c` ✅

**Potentially Unavailable:**
- `Interview_Declined__c` - Field does not exist on IndividualApplication object

---

### Pacific Oaks College (POC)
**Config:** `poc.json` extends `default`

**Unique Fields (added to default):**
- `LACOE_Student__c` ✅ (POC-specific field for LA County Office of Education students)
- `Acknowledge_Statement_Signature__c` ✅
- `ProgramTermApplnTimeline__c` ✅

**Potentially Unavailable:**
- `Specialty__c` - Field does not exist on IndividualApplication object
- `Admissions_Status__c` - May be null for POC applications

---

### Saybrook University (SAY)
**Config:** `say.json` extends `default`

**Unique Fields (added to default):**
- `Acknowledge_Statement_Signature__c` ✅
- `ProgramTermApplnTimeline__c` ✅

**Notable Field Values:**
- `Highest_College_GPA__c` ✅ (often populated, e.g., 3.60)
- `Full_Part_Time__c` ✅ (e.g., "Full Time")
- `Applying_for_Financial_Aid__c` ✅ (e.g., "Yes")
- `How_did_you_hear_about_us__c` ✅ (e.g., "Faculty Referral")
- `Scholarship_Message__c` ✅ (can contain detailed scholarship information)

**Potentially Unavailable:**
- `Specialty__c` - Field does not exist on IndividualApplication object

---

### University of Western States (UWS)
**Config:** `uws.json` extends `default`

**Most customized config with unique sections and fields.**

**Unique Academic Fields:**
- `Has_Bachelors__c` ✅
- `Pursue_BS_Human_Bio__c` ✅
- `Graduated_from_Prior_Degree_Program__c` ✅
- `Current_Student__c` ✅
- `Wish_to_Withdraw__c` ✅

**UWS-Specific Section (added via `addSections`):**
- `Relative_Attended__c` ✅
- `Relationship_to_Attending_Relative__c` ✅
- `Relative_Employed__c` ✅
- `Relationship_to_Employed_Relative__c` ✅

**Additional Information Fields:**
- `Conviction_Detail__c` ✅
- `Academic_Sanction__c` ✅
- `Academic_Sanction_Detail__c` ✅
- `Acknowledge_Statement_Signature__c` ✅
- `ProgramTermApplnTimeline__c` ✅

**Potentially Unavailable:**
- `Specialty__c` - Field does not exist on IndividualApplication object

---

### The Colleges of Law (COL)
**Config:** `col.json` extends `default`
**Program:** Juris Doctor

**Unique Fields:**
- `Acknowledge_Statement_Signature__c` ✅

**Notable Field Values:**
- `Scholarship__c` ✅ (can be `true` for COL students with scholarships)
- `How_did_you_hear_about_us__c` ✅ (e.g., "Alumni Referral")

**Potentially Unavailable:**
- `Specialty__c` - Field does not exist on IndividualApplication object
- `Admissions_Status__c` - May be null for COL applications

---

## Common Fields (All Schools)

All schools inherit these fields from `default.json`:

### Application Information
- `Id`, `Name`, `Category`, `Status`
- `Active__c`, `SIS_Status_Field__c`
- `Program_Name__c`, `Term__c`, `Location__c`, `Campus_Location__c`
- `Secondary_Location_Preference__c`, `Tertiary_Location_Preference__c`
- `Owner__c`, `Opportunity__c`, `Duplicate_Record__c`

### Applicant Details (Contact Fields)
- `Contact.FirstName`, `Contact.LastName`, `Contact.Name`
- `Contact.MobilePhone`, `Contact.Email`
- `Contact.MailingStreet`, `Contact.MailingCity`, `Contact.MailingState`
- `Contact.MailingPostalCode`, `Contact.MailingCountry`
- `Contact_ID__c`, `Mogli_Number_from_Contact__c`, `Mogli_Opt_Out__c`
- `Citizenship_Status__c`

### Application Dates
- `AppliedDate`, `Application_Submitted_Date__c`
- `Date_Application_Reviewable__c`, `Date_Application_Accepted__c`
- `Date_Future_Start_Deposited__c`, `Date_Waitlisted__c`

### Admissions Status
- `Admissions_Status__c`, `Decision__c`, `Applicant_Decision__c`
- `Decision_Release_Date__c`, `Admit_Contingencies__c`, `File_Closed_Reason__c`

### Interview Information
- `Interview_Status__c`, `Interview_Date__c`
- `Interview_Invite_Date__c`, `Interview_Invite_Sent_Date__c`
- `Invite_to_Secondary_Application__c`

### Academic Information
- `Highest_HS_GPA__c`, `Highest_College_GPA__c`, `Cumulative_GPA__c`
- `Verified_GPA_Blank__c`, `First_Generation_Student__c`
- `Seeking_Transfer_Credit__c`, `Enrolled_in_AA_T_or_AS_T_degree_transfer__c`
- `Initiating_Articulation_Agreement__c`, `Graduate_Level_Program__c`
- `Full_Part_Time__c`

### Financial Information
- `Scholarship__c`, `Scholarship_Amount__c`, `Scholarship_Message__c`
- `Applying_for_Financial_Aid__c`
- `Deposit_Amount__c`, `Deposit_Due_Date__c`, `Deposit_Date_Passed__c`

### Additional Information
- `International_Student__c`, `Has_Previously_Applied__c`
- `How_did_you_hear_about_us__c`, `Character_Statement_Needed__c`
- `Manually_Trigger_Checklist_Items__c`, `Conviction__c`

### Related Records
- Employment: `relatedRecords.Employment[0].*`
- High School: `relatedRecords.HighSchool[0].*`
- College: `relatedRecords.College[0].*`
- Checklist Items: Queried separately and displayed in Complete Application PDF

---

## How to Diagnose Field Availability

1. **Check Config Inheritance:**
   ```bash
   # Review the config file to see what it extends
   cat config/field-mappings/khsu.json
   # Output: { "extends": "illinoiscom", ... }
   ```

2. **Use SF CLI to Query Fields:**
   ```bash
   sf data query --query "SELECT Id, Field__c FROM IndividualApplication WHERE Id = '...'" --target-org staging
   ```

3. **Test with Debug Script:**
   ```bash
   npm run debug:pdf <ApplicationId>
   # Review logs for INVALID_FIELD errors
   # Check PDF output for missing data
   ```

4. **Update Configuration:**
   - Add fields to school-specific `overrideSections` if needed
   - Use `addSections` for entirely new sections
   - Update this document with findings

---

## Notes

- Fields marked with ✅ have been confirmed via SOQL query
- Fields may be available but return `null` if not populated on the record
- Some fields may require additional permission set configuration
- Contact fields are queried separately via `Contact_ID__c` and merged into application data
- The inheritance system reduces config duplication from ~400 lines per file to ~5-145 lines
