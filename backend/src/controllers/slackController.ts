import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/authMiddleware';
import { db } from '../db';
import { slackConfigs } from '../db/schema';
import { eq } from 'drizzle-orm';
import { SlackService } from '../services/slackService';
import { env } from '../config/env';
import axios from 'axios';

export class SlackController {
  /**
   * Get current Slack integration status
   */
  static async getStatus(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const config = await db.query.slackConfigs.findFirst({
        where: eq(slackConfigs.userId, userId),
      });

      res.json({
        isConnected: config?.isConnected || false,
        channelName: config?.channelName || null,
        teamName: config?.teamName || null,
        webhookConfigured: Boolean(config?.webhookUrl),
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  /**
   * Connect or update Slack Incoming Webhook
   */
  static async connectWebhook(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { webhookUrl, channelName, teamName } = req.body;

      if (!webhookUrl || typeof webhookUrl !== 'string' || !webhookUrl.startsWith('https://hooks.slack.com/')) {
        res.status(400).json({ error: 'Valid Slack webhook URL is required (https://hooks.slack.com/...)' });
        return;
      }

      const existing = await db.query.slackConfigs.findFirst({
        where: eq(slackConfigs.userId, userId),
      });

      if (existing) {
        await db
          .update(slackConfigs)
          .set({
            webhookUrl,
            channelName: channelName || '#general',
            teamName: teamName || 'Slack Workspace',
            isConnected: true,
            updatedAt: new Date(),
          })
          .where(eq(slackConfigs.userId, userId));
      } else {
        await db.insert(slackConfigs).values({
          userId,
          webhookUrl,
          channelName: channelName || '#general',
          teamName: teamName || 'Slack Workspace',
          isConnected: true,
        });
      }

      res.json({
        message: 'Slack webhook connected successfully',
        config: {
          isConnected: true,
          channelName: channelName || '#general',
          teamName: teamName || 'Slack Workspace',
        },
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  /**
   * Send a live test notification to Slack
   */
  static async sendTestAlert(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const config = await db.query.slackConfigs.findFirst({
        where: eq(slackConfigs.userId, userId),
      });

      if (!config || !config.webhookUrl || !config.isConnected) {
        res.status(400).json({ error: 'Slack is not connected. Please connect a webhook first.' });
        return;
      }

      const result = await SlackService.sendTestNotification(config.webhookUrl);
      if (result.success) {
        res.json({ message: 'Live Slack test notification sent successfully!' });
      } else {
        res.status(400).json({ error: result.message });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  /**
   * Disconnect Slack integration
   */
  static async disconnect(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      await db
        .update(slackConfigs)
        .set({
          isConnected: false,
          webhookUrl: null,
          accessToken: null,
          updatedAt: new Date(),
        })
        .where(eq(slackConfigs.userId, userId));

      res.json({ message: 'Slack disconnected successfully' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  /**
   * Slack OAuth callback handler
   */
  static async oauthCallback(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { code } = req.query;
      const userId = req.user?.userId;

      if (!code || typeof code !== 'string') {
        res.status(400).json({ error: 'Missing OAuth code' });
        return;
      }

      if (!env.SLACK_CLIENT_ID || !env.SLACK_CLIENT_SECRET) {
        res.status(400).json({ error: 'Slack OAuth client credentials not configured in backend env' });
        return;
      }

      const oauthRes = await axios.post(
        'https://slack.com/api/oauth.v2.access',
        new URLSearchParams({
          code,
          client_id: env.SLACK_CLIENT_ID,
          client_secret: env.SLACK_CLIENT_SECRET,
          redirect_uri: env.SLACK_REDIRECT_URI,
        }),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
      );

      if (!oauthRes.data.ok) {
        res.status(400).json({ error: oauthRes.data.error || 'OAuth exchange failed' });
        return;
      }

      const { incoming_webhook, team, access_token } = oauthRes.data;

      if (userId) {
        const existing = await db.query.slackConfigs.findFirst({
          where: eq(slackConfigs.userId, userId),
        });

        if (existing) {
          await db
            .update(slackConfigs)
            .set({
              webhookUrl: incoming_webhook?.url,
              channelName: incoming_webhook?.channel,
              teamName: team?.name,
              accessToken: access_token,
              isConnected: true,
              updatedAt: new Date(),
            })
            .where(eq(slackConfigs.userId, userId));
        } else {
          await db.insert(slackConfigs).values({
            userId,
            webhookUrl: incoming_webhook?.url,
            channelName: incoming_webhook?.channel,
            teamName: team?.name,
            accessToken: access_token,
            isConnected: true,
          });
        }
      }

      res.redirect(`${env.CLIENT_URL}?slack_connected=true`);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
}
