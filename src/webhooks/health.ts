import express from 'express';
import { getSalesforceClient } from '../salesforce/client.js';

export const healthRouter = express.Router();

healthRouter.get('/', async (_req, res) => {
  try {
    // Test Salesforce connection
    const sfClient = await getSalesforceClient();
    await sfClient.connect();
    
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      salesforce: 'connected',
    });
  } catch (error: any) {
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      salesforce: 'disconnected',
      error: error.message,
    });
  }
});




