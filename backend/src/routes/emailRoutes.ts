import { Router } from 'express';
import multer from 'multer';
import { EmailController } from '../controllers/emailController';
import { authMiddleware } from '../middleware/authMiddleware';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

export const emailRouter = Router();

// Lead Parsing
emailRouter.post('/parse-leads', authMiddleware as any, upload.single('file'), EmailController.parseLeads as any);

// Campaign Scheduling
emailRouter.post('/schedule', authMiddleware as any, EmailController.scheduleEmails as any);

// Lists
emailRouter.get('/scheduled', authMiddleware as any, EmailController.getScheduledEmails as any);
emailRouter.get('/sent', authMiddleware as any, EmailController.getSentEmails as any);

// Search & Analytics
emailRouter.get('/search', authMiddleware as any, EmailController.search as any);
emailRouter.get('/stats', authMiddleware as any, EmailController.getStats as any);
emailRouter.get('/senders', authMiddleware as any, EmailController.getSenders as any);
emailRouter.post('/senders', authMiddleware as any, EmailController.addSender as any);

// Individual email by ID (must be last among GET routes)
emailRouter.get('/:id', authMiddleware as any, EmailController.getEmailById as any);

