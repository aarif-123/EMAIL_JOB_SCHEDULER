import { Router } from 'express';
import { SlackController } from '../controllers/slackController';
import { authMiddleware } from '../middleware/authMiddleware';

export const slackRouter = Router();

slackRouter.get('/status', authMiddleware as any, SlackController.getStatus);
slackRouter.post('/webhook', authMiddleware as any, SlackController.connectWebhook);
slackRouter.post('/test', authMiddleware as any, SlackController.sendTestAlert);
slackRouter.post('/disconnect', authMiddleware as any, SlackController.disconnect);
slackRouter.get('/oauth/callback', SlackController.oauthCallback);
