# PDF Generation Integration for Salesforce Education Cloud (EdCloud) 📄

![Node.js](https://img.shields.io/badge/Node.js-24.x-green?logo=node.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue?logo=typescript)
![AWS Lambda](https://img.shields.io/badge/AWS-Lambda-orange?logo=aws-lambda)
![Salesforce](https://img.shields.io/badge/Salesforce-Education_Cloud-00A1E0?logo=salesforce)
![Puppeteer](https://img.shields.io/badge/Puppeteer-PDF_Generation-40B5A4?logo=puppeteer)
![Handlebars](https://img.shields.io/badge/Handlebars-Templates-FF6A00?logo=handlebars)
![Express](https://img.shields.io/badge/Express-API-000000?logo=express)
![Docker](https://img.shields.io/badge/Docker-Containerized-2496ED?logo=docker)
![GitHub Actions](https://img.shields.io/badge/GitHub_Actions-CI%2FCD-2088FF?logo=github-actions)

A serverless PDF generation service that decouples document creation from Salesforce deployment cycles. Generates professional PDF documents for Education Cloud `IndividualApplication` records with dynamic field mapping, multi-school support, and template-based rendering.

## Executive Summary

This service provides **external PDF generation capabilities** for Salesforce Education Cloud, eliminating the need for Apex deployments when updating templates or field configurations. The service:

- **Generates PDFs on-demand** via Salesforce Flow webhooks for `IndividualApplication` records
- **Supports multiple schools/programs** through JSON-based field mapping inheritance
- **Renders two PDF variants**: Complete Application (full details) and App Lite (essential fields)
- **Deploys as AWS Lambda** container for serverless, scalable execution
- **Integrates seamlessly** with Salesforce via OAuth and automatic token refresh
- **Enables rapid iteration** on templates and field mappings without Salesforce deployments

**Key Benefits**: Faster development cycles, zero Salesforce deployment overhead for template changes, and centralized PDF generation logic that scales across all Education Cloud schools.

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

## Primary Local Test Harness

**`npm run debug:pdf <ID>`** - This is the main testing tool for local development.

### Quick Start
```bash
# Test with application name (e.g., IA-0000001566)
# Note: Requires Chrome executable path for local development
PUPPETEER_EXECUTABLE_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" npm run debug:pdf IA-0000001566

# Test with Salesforce ID (18-char)
PUPPETEER_EXECUTABLE_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" npm run debug:pdf 0iTHn000000YwRtMAK

# On Linux, Chrome path is typically:
# PUPPETEER_EXECUTABLE_PATH="/usr/bin/google-chrome" npm run debug:pdf IA-0000001566
```

### What It Does
1. **Connects to Salesforce** - Uses CLI access token (if available) or `.env` credentials
2. **Queries Application Data** - Fetches `IndividualApplication` with all related records
3. **Applies Field Mappings** - Automatically selects correct mapping based on school/program
4. **Generates PDFs** - Creates both Complete and Lite versions
5. **Uploads to Salesforce** - Uploads Complete Application PDF as ContentVersion
6. **Provides Logging** - Detailed logs for debugging and verification

### Sample Application IDs for Testing
- `IA-0000001566` - The Chicago School (Psy.D. Clinical Psychology)
- `IA-0000001663` - Sample application
- `IA-0000001664` - Sample application
- `0iTHn000000YwRtMAK` - Sample application (18-char ID)

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
npm run purge:artifacts  # Clean up old PDFs
npm run trial:remote     # Run remote Lambda trials
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
scripts/
  ├── docker-test.sh           # Test Docker build locally
  ├── docker-test-local.sh     # Test Docker as regular Node app
  ├── lint-fix.sh              # Run ESLint with auto-fix
  └── run-remote-trials.sh     # Run remote Lambda trials
```

## Environment Setup

### Development (.env)
```env
# Option 1: Access Token (from sf org display)
SF_ACCESS_TOKEN=<token>
SF_INSTANCE_URL=https://yourorg.sandbox.my.salesforce.com

# Option 2: Username/Password
SF_USERNAME=user@example.com
SF_PASSWORD=password
SF_SECURITY_TOKEN=token
SF_LOGIN_URL=https://test.salesforce.com
```

### Production (AWS Secrets Manager)
The service automatically retrieves credentials from AWS Secrets Manager in production.

## Docker

### Local Testing
```bash
# Build and run locally (not Lambda)
docker build -f Dockerfile.local -t pdf-service-local .
docker run -p 3000:3000 --env-file .env pdf-service-local
```

### Lambda Testing
```bash
# Build Lambda container
docker build -t pdf-service-lambda .

# Test with Lambda Runtime Interface Emulator (RIE)
docker run -p 9000:8080 pdf-service-lambda
```

## License

This is private internal software owned by The Community Solution. See [LICENSE](LICENSE) for details.

## Copyright

Copyright (c) 2025 The Community Solution  
https://www.tcsedsystem.edu/
