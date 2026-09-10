import { Router } from 'express';
import { AdminController } from '../controllers/adminController';
import { authMiddleware } from '../middleware/authMiddleware';

export const adminRouter = Router();

adminRouter.get('/queue-stats', authMiddleware as any, AdminController.getQueueStats as any);
adminRouter.post('/queue/pause', authMiddleware as any, AdminController.pauseQueue as any);
adminRouter.post('/queue/resume', authMiddleware as any, AdminController.resumeQueue as any);
adminRouter.post('/queue/clean', authMiddleware as any, AdminController.cleanJobs as any);
adminRouter.post('/queue/reconcile', authMiddleware as any, AdminController.reconcileJobs as any);
adminRouter.post('/retry-failed', authMiddleware as any, AdminController.retryFailedEmails as any);
