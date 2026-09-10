import axios from 'axios';
import { db } from '../db';
import { slackConfigs } from '../db/schema';
import { eq } from 'drizzle-orm';

export class SlackService {
  /**
   * Sends a live notification to Slack when rate limit is exceeded
   */
  static async notifyRateLimitHit(params: {
    userId: string;
    senderEmail: string;
    hourlyLimit: number;
    rescheduleAt: Date;
    recipientEmail?: string;
  }): Promise<boolean> {
    try {
      const config = await db.query.slackConfigs.findFirst({
        where: eq(slackConfigs.userId, params.userId),
      });

      if (!config || !config.isConnected || !config.webhookUrl) {
        // Safe degrade: if Slack is not connected, simply do not notify (no crash)
        return false;
      }

      const formattedNextHour = params.rescheduleAt.toLocaleTimeString('en-US', {
        timeZoneName: 'short',
      });

      const payload = {
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: '⚠️ ReachInbox Alert: Hourly Rate Limit Reached',
              emoji: true,
            },
          },
          {
            type: 'section',
            fields: [
              {
                type: 'mrkdwn',
                text: `*Sender Account:*\n\`${params.senderEmail}\``,
              },
              {
                type: 'mrkdwn',
                text: `*Hourly Limit:*\n\`${params.hourlyLimit} emails/hour\``,
              },
            ],
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `🚨 *Limit Exceeded:* Email sending for sender \`${params.senderEmail}\` has hit the hourly threshold.\n*Action Taken:* Remaining jobs have been safely deferred to *${formattedNextHour}* without losing any emails or data.`,
            },
          },
          {
            type: 'context',
            elements: [
              {
                type: 'mrkdwn',
                text: `Timestamp: ${new Date().toISOString()} | Tenant: ReachInbox Scheduler`,
              },
            ],
          },
        ],
      };

      const response = await axios.post(config.webhookUrl, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 5000,
      });

      console.log(`📣 Slack alert dispatched successfully for sender ${params.senderEmail} (status: ${response.status})`);
      return true;
    } catch (error: any) {
      console.error('⚠️ Failed to deliver Slack alert:', error?.message || error);
      // Never crash worker if external Slack network call fails
      return false;
    }
  }

  /**
   * Test webhook connectivity from dashboard
   */
  static async sendTestNotification(webhookUrl: string): Promise<{ success: boolean; message: string }> {
    try {
      await axios.post(
        webhookUrl,
        {
          text: '🚀 *ReachInbox Email Scheduler*: Slack connection verified! You will receive live alerts here whenever an hourly sending limit is reached.',
        },
        { timeout: 5000 }
      );
      return { success: true, message: 'Test notification delivered successfully' };
    } catch (err: any) {
      return { success: false, message: err?.response?.data || err.message };
    }
  }
}
