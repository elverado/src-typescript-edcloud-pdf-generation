import express from 'express';
import dotenv from 'dotenv';
import serverless from 'serverless-http';
import { logger } from './utils/logger.js';
import { salesforceRouter } from './webhooks/salesforce.js';
import { healthRouter } from './webhooks/health.js';
import { platformEventListener } from './events/platform-events.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, _res, next) => {
  logger.info(`${req.method} ${req.path}`, { ip: req.ip });
  next();
});

// Routes - support multiple path patterns for flexibility
app.use('/webhook', salesforceRouter);
app.use('/webhook/salesforce', salesforceRouter);  // Support /webhook/salesforce/application
app.use('/api/webhook', salesforceRouter);
app.use('/api/webhook/salesforce', salesforceRouter);
app.use('/health', healthRouter);
app.use('/api/health', healthRouter);

// Root health check for Lambda
app.get('/', (_req, res) => {
  res.json({ status: 'ok', service: 'pdf-generation-service' });
});

// Error handling
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Unhandled error', { error: err.message, stack: err.stack });
  res.status(500).json({ error: 'Internal server error' });
});

// Lambda handler export
export const handler = serverless(app);

// Local development server (only when not in Lambda)
if (process.env.AWS_LAMBDA_FUNCTION_NAME === undefined) {
  app.listen(PORT, () => {
    logger.info(`PDF Generation Service started on port ${PORT}`);
    
    // Start Platform Event listener if configured
    if (process.env.PLATFORM_EVENT_CHANNEL) {
      try {
        platformEventListener.start();
      } catch (err: unknown) {
        logger.error('Failed to start Platform Event listener', { error: err });
      }
    }
  });

  // Graceful shutdown (local only)
  process.on('SIGTERM', () => {
    logger.info('SIGTERM received, shutting down gracefully');
    platformEventListener.stop();
    process.exit(0);
  });

  process.on('SIGINT', () => {
    logger.info('SIGINT received, shutting down gracefully');
    platformEventListener.stop();
    process.exit(0);
  });
}




