# PDF Generation Service - Lambda Container Image
# PDF generation integration service for Salesforce Education Cloud (EdCloud)
# This service is solely dedicated to PDF generation integration with EdCloud
# Based on AWS Lambda Node.js 24 base image with Chromium for Puppeteer
#
# Copyright (c) 2025 The Community Solution
# https://www.tcsedsystem.edu/

FROM public.ecr.aws/lambda/nodejs:24 AS builder

# Install build dependencies
WORKDIR /build

# Copy package files
COPY package*.json ./

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Copy source code
COPY tsconfig.json ./
COPY src/ ./src/

# Build TypeScript
RUN npm run build

# Production stage
FROM public.ecr.aws/lambda/nodejs:24

# Install Chromium dependencies for Puppeteer
# Note: Using dnf (Amazon Linux 2023 package manager)
RUN dnf install -y \
    alsa-lib \
    at-spi2-atk \
    atk \
    cups-libs \
    gtk3 \
    libdrm \
    libgbm \
    libxkbcommon \
    libXcomposite \
    libXcursor \
    libXdamage \
    libXext \
    libXi \
    libXrandr \
    libXScrnSaver \
    libXtst \
    mesa-libgbm \
    nss \
    pango \
    xorg-x11-fonts-100dpi \
    xorg-x11-fonts-75dpi \
    xorg-x11-fonts-Type1 \
    xorg-x11-utils \
    && dnf clean all

# Set working directory
WORKDIR ${LAMBDA_TASK_ROOT}

# Copy package files
COPY package*.json ./

# Install production dependencies only
# Note: @sparticuz/chromium bundles its own Lambda-compatible Chrome binary
RUN npm ci --omit=dev

# Copy built code from builder stage
COPY --from=builder /build/dist/ ./dist/

# Copy templates and config
COPY templates/ ./templates/
COPY config/ ./config/

# Set environment variables
ENV NODE_ENV=production

# Application metadata labels
LABEL org.opencontainers.image.title="PDF Generation Integration for Salesforce Education Cloud"
LABEL org.opencontainers.image.description="PDF generation integration service for Salesforce Education Cloud (EdCloud) - dedicated service for application PDF generation"
LABEL org.opencontainers.image.vendor="The Community Solution"
LABEL org.opencontainers.image.authors="The Community Solution"
LABEL org.opencontainers.image.url="https://www.tcsedsystem.edu/"
LABEL application.type="pdf-generation-integration"
LABEL application.purpose="edcloud-pdf-generation"
LABEL application.platform="salesforce-education-cloud"
LABEL application.integration="edcloud"

# Lambda handler - points to the compiled index.js
CMD ["dist/index.handler"]






