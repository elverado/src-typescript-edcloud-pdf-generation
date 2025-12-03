# Debug Scripts

Debug scripts for testing PDF generation locally.

## Test PDF Generation

Test PDF generation with a specific application ID:

```bash
npm run debug:pdf IA-0000001566
```

Or directly with tsx:

```bash
tsx src/debug/test-pdf.ts IA-0000001566
```

## Sample Applications

Edit `src/debug/test-pdf.ts` to add more sample applications to the `SAMPLE_APPLICATIONS` object.

## Output

PDFs are generated in the `output/` directory with the naming format:

**Format**: `{SchoolAbbrev}-{Location}-{ProgramName}-{Term}-{ApplicantName} Application.pdf`

**Example**: `TCS-Chicago-Doctor of Osteopathic Medicine-2025 Fall-John Doe Application.pdf`

**Components**:
- **School Abbreviation**: TCS, POC, SAY, KHSU, UWS, COL
- **Location**: Campus or city name
- **Program Name**: Learning program name
- **Term**: Formatted as "2025 Fall" (year and term type)
- **Applicant Name**: Student's full name

**Fallback**: If components are missing, they're omitted. Minimum fallback: `Application-{ApplicationId}.pdf`

## Prerequisites

1. Configure `.env` with Salesforce credentials
2. Ensure you're authenticated to the correct org
3. Application ID must exist in Salesforce

## Example

```bash
# Test with sample application
npm run debug:pdf IA-0000001566

# Output will be in:
# output/John Doe Application.pdf
```

