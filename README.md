# PDF Generation Integration for Salesforce Education Cloud (EdCloud)

PDF generation integration service for Salesforce Education Cloud (EdCloud). This service is solely dedicated to PDF generation integration with EdCloud, providing external PDF generation capabilities for Education Cloud applications.

## Overview

This service generates PDF documents for Salesforce Education Cloud `IndividualApplication` records. It decouples PDF generation from Salesforce, enabling:

- ✅ Faster development cycles (no Apex deployments for template changes)
- ✅ Dynamic field mapping (JSON configuration, no hardcoded fields)
- ✅ Multi-school/program support (configurable per school)
- ✅ Template-based PDF generation (Handlebars)
- ✅ Scalable architecture (AWS Lambda deployment)

## Architecture

- **Salesforce**: Triggers PDF generation via HTTP callouts from Flows
- **This Service**: Queries application data via Salesforce API, generates PDFs using templates, uploads back to Salesforce
- **Templates**: Handlebars templates stored in version control, configurable per school/program
- **Field Mappings**: JSON configuration files define which fields to include per school

## Features

- ✅ **AWS Lambda Deployment** - Container-based, auto-deploys via GitHub Actions
- ✅ **Salesforce Flow Integration** - Auto-generates PDF on application status change
- ✅ Dynamic field mapping with JSON inheritance
- ✅ Template-based PDF generation (Puppeteer + @sparticuz/chromium)
- ✅ Two output modes: Complete Application + App Lite
- ✅ Deep links to Salesforce records
- ✅ File versioning (updates create new versions, not duplicates)
- ✅ OAuth Refresh Token Flow (automatic token refresh)
- ✅ Webhook endpoint for Flow callouts
- ✅ Multi-school/program support
- ✅ API v65.0 for Education Cloud objects

## Quick Start

### Prerequisites

- Node.js 24+
- Salesforce org with Education Cloud enabled
- OAuth credentials (Connected App)

### Installation

```bash
npm install
cp .env.example .env
# Edit .env with your Salesforce credentials
```

### Development

```bash
npm run dev
```

### Build

```bash
npm run build
npm start
```

## Configuration

### Field Mappings

Field mappings are defined in `config/field-mappings/`. Each school can have its own mapping file that **inherits** from a base configuration.

See `config/field-mappings/README.md` for detailed inheritance documentation.

### Templates

Templates are Handlebars templates in `templates/`:
- `application-default.hbs` - Complete Application with deep links and all fields
- `application-lite.hbs` - App Lite with essential fields only

## API Endpoints

- `POST /webhook/salesforce/application` - Webhook endpoint for Flow callouts
- `GET /health` - Health check

## Usage

### From Salesforce Flow

Add an HTTP Callout action:
- URL: `https://your-service.com/webhook/salesforce/application`
- Method: POST
- Body: `{"applicationId": "{!$Record.Id}"}`

## Development

```bash
npm run dev              # Watch mode
npm run build            # Compile TypeScript
npm run lint             # Lint code
npm run debug:pdf        # Test PDF generation locally
```

## Project Structure

```
src/
  ├── index.ts                 # Main entry point
  ├── config/                  # Configuration management
  │   └── field-mappings.ts    # Field mapping service
  ├── salesforce/              # Salesforce API client
  ├── pdf/                     # PDF generation service
  ├── debug/                   # Debug utilities
  ├── webhooks/                # Webhook handlers
  ├── events/                  # Platform Event listeners
  └── utils/                   # Utilities
config/
  └── field-mappings/          # Field mapping JSON files
templates/
  ├── application-default.hbs  # Complete Application template
  └── application-lite.hbs     # App Lite template
```

## License

This is private internal software owned by Community Solution. See [LICENSE](LICENSE) for details.
