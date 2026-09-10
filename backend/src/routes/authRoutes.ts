import { Router } from 'express';
import { AuthController } from '../controllers/authController';
import { authMiddleware } from '../middleware/authMiddleware';

export const authRouter = Router();

authRouter.post('/google', AuthController.googleLogin);
authRouter.get('/google/url', AuthController.getGoogleAuthUrl);
authRouter.get('/google/callback', AuthController.googleCallback);
authRouter.post('/dev-login', AuthController.devLogin);
authRouter.get('/me', authMiddleware as any, AuthController.getMe);
