import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import axios from 'axios';
import { db } from '../db';
import { users, slackConfigs } from '../db/schema';
import { eq } from 'drizzle-orm';
import { env } from '../config/env';

export class AuthController {
  private static generateToken(user: { id: string; email: string; name: string }): string {
    return jwt.sign(
      { userId: user.id, email: user.email, name: user.name },
      env.JWT_SECRET,
      { expiresIn: '7d' }
    );
  }

  /**
   * Real Google OAuth token verification (No Mock)
   */
  static async googleLogin(req: Request, res: Response): Promise<void> {
    try {
      const { credential, accessToken } = req.body;

      let googleUser: { email: string; name: string; picture?: string; sub: string };

      if (credential) {
        // ID token from Google Identity Services
        const tokenRes = await axios.get(
          `https://oauth2.googleapis.com/tokeninfo?id_token=${credential}`
        );
        googleUser = tokenRes.data;
      } else if (accessToken) {
        // Access token from OAuth popup
        const userRes = await axios.get('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        googleUser = userRes.data;
      } else {
        res.status(400).json({ error: 'Missing credential or accessToken' });
        return;
      }

      if (!googleUser.email) {
        res.status(400).json({ error: 'Failed to retrieve email from Google OAuth profile' });
        return;
      }

      // Upsert user in PostgreSQL via Drizzle
      let user = await db.query.users.findFirst({
        where: eq(users.email, googleUser.email),
      });

      if (!user) {
        const [newUser] = await db
          .insert(users)
          .values({
            email: googleUser.email,
            name: googleUser.name || googleUser.email.split('@')[0],
            avatarUrl: googleUser.picture,
            googleId: googleUser.sub,
          })
          .returning();
        user = newUser;
      } else {
        const [updatedUser] = await db
          .update(users)
          .set({
            name: googleUser.name || user.name,
            avatarUrl: googleUser.picture || user.avatarUrl,
            googleId: googleUser.sub || user.googleId,
            updatedAt: new Date(),
          })
          .where(eq(users.id, user.id))
          .returning();
        user = updatedUser;
      }

      const token = AuthController.generateToken(user);

      res.json({
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          avatarUrl: user.avatarUrl,
        },
        token,
      });
    } catch (error: any) {
      console.error('Google OAuth verification failed:', error?.response?.data || error.message);
      res.status(401).json({ error: 'Failed to verify Google credentials' });
    }
  }

  /**
   * Generate Google OAuth2 authorization redirect URL
   */
  static async getGoogleAuthUrl(_req: Request, res: Response): Promise<void> {
    const redirectUri = 'http://localhost:5000/api/auth/google/callback';
    const rootUrl = 'https://accounts.google.com/o/oauth2/v2/auth';
    const options = {
      redirect_uri: redirectUri,
      client_id: env.GOOGLE_CLIENT_ID || '',
      access_type: 'offline',
      response_type: 'code',
      prompt: 'consent',
      scope: [
        'https://www.googleapis.com/auth/userinfo.profile',
        'https://www.googleapis.com/auth/userinfo.email',
      ].join(' '),
    };

    const qs = new URLSearchParams(options);
    res.json({ url: `${rootUrl}?${qs.toString()}` });
  }

  /**
   * Google OAuth2 Authorization Code Callback
   */
  static async googleCallback(req: Request, res: Response): Promise<void> {
    try {
      const code = req.query.code as string;
      if (!code) {
        res.redirect(`${env.CLIENT_URL}/login?error=no_code`);
        return;
      }

      const redirectUri = 'http://localhost:5000/api/auth/google/callback';

      const tokenRes = await axios.post('https://oauth2.googleapis.com/token', {
        code,
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      });

      const { id_token, access_token } = tokenRes.data;

      let email = '';
      let name = '';
      let avatarUrl = '';
      let googleId = '';

      if (id_token) {
        const verifyRes = await axios.get(`https://oauth2.googleapis.com/tokeninfo?id_token=${id_token}`);
        email = verifyRes.data.email;
        name = verifyRes.data.name || email.split('@')[0];
        avatarUrl = verifyRes.data.picture || '';
        googleId = verifyRes.data.sub || '';
      } else if (access_token) {
        const userRes = await axios.get('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: `Bearer ${access_token}` },
        });
        email = userRes.data.email;
        name = userRes.data.name || email.split('@')[0];
        avatarUrl = userRes.data.picture || '';
        googleId = userRes.data.sub || '';
      }

      if (!email) {
        res.redirect(`${env.CLIENT_URL}/login?error=no_email`);
        return;
      }

      let user = await db.query.users.findFirst({
        where: eq(users.email, email),
      });

      if (!user) {
        const [newUser] = await db
          .insert(users)
          .values({
            email,
            name,
            avatarUrl,
            googleId,
          })
          .returning();
        user = newUser;
      } else {
        const [updatedUser] = await db
          .update(users)
          .set({
            name: name || user.name,
            avatarUrl: avatarUrl || user.avatarUrl,
            googleId: googleId || user.googleId,
            updatedAt: new Date(),
          })
          .where(eq(users.id, user.id))
          .returning();
        user = updatedUser;
      }

      const token = AuthController.generateToken(user);
      const userPayload = encodeURIComponent(
        JSON.stringify({
          id: user.id,
          email: user.email,
          name: user.name,
          avatarUrl: user.avatarUrl,
        })
      );

      res.redirect(`${env.CLIENT_URL}/login?token=${token}&user=${userPayload}`);
    } catch (error: any) {
      console.error('OAuth Callback Error:', error?.response?.data || error.message);
      res.redirect(`${env.CLIENT_URL}/login?error=oauth_failed`);
    }
  }

  /**
   * Strictly gated development login (only active if ENABLE_DEV_LOGIN === 'true' in development)
   */
  static async devLogin(req: Request, res: Response): Promise<void> {
    if (env.ENABLE_DEV_LOGIN !== 'true') {
      res.status(403).json({ error: 'Dev login is disabled. Please use real Google OAuth.' });
      return;
    }

    try {
      const email = req.body.email || 'oliver.brown@domain.io';
      const name = req.body.name || 'Oliver Brown';
      const avatarUrl = req.body.avatarUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80';

      let user = await db.query.users.findFirst({
        where: eq(users.email, email),
      });

      if (!user) {
        const [newUser] = await db
          .insert(users)
          .values({ email, name, avatarUrl })
          .returning();
        user = newUser;
      }

      const token = AuthController.generateToken(user);

      res.json({
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          avatarUrl: user.avatarUrl,
        },
        token,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Get current authenticated user profile
   */
  static async getMe(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.userId;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const user = await db.query.users.findFirst({
        where: eq(users.id, userId),
      });

      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      const slack = await db.query.slackConfigs.findFirst({
        where: eq(slackConfigs.userId, userId),
      });

      res.json({
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
        createdAt: user.createdAt,
        slackConfig: {
          isConnected: slack?.isConnected || false,
          channelName: slack?.channelName || null,
          teamName: slack?.teamName || null,
        },
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
}
