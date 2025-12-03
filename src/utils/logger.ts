import winston from 'winston';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logDir = path.join(__dirname, '..', '..', 'log');

const logLevel = process.env.LOG_LEVEL || 'info';
const isLambda = !!process.env.AWS_LAMBDA_FUNCTION_NAME;

// Build transports - console always, file only in non-Lambda environments
const transports: winston.transport[] = [
  new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.printf(({ timestamp, level, message, ...meta }) => {
        const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
        return `${String(timestamp)} [${String(level)}]: ${String(message)} ${metaStr}`;
      })
    ),
  }),
];

// Only add file transports when not in Lambda (Lambda /var/task is read-only)
if (!isLambda) {
  transports.push(
    new winston.transports.File({ filename: path.join(logDir, 'error.log'), level: 'error' }),
    new winston.transports.File({ filename: path.join(logDir, 'combined.log') })
  );
}

export const logger = winston.createLogger({
  level: logLevel,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'pdf-generation' },
  transports,
});




