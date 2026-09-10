import { Worker, Job } from 'bullmq';
import { redisConnection } from '../config/redis';
import { env } from '../config/env';
import { db } from '../db';
import { scheduledEmails, emailEvents } from '../db/schema';
import { eq, and, inArray, sql } from 'drizzle-orm';
import { EMAIL_QUEUE_NAME, EmailJobData, emailQueue } from '../queues/emailQueue';
import { RateLimitService } from '../services/rateLimitService';
import { SlackService } from '../services/slackService';
import { EmailService } from '../services/emailService';
import { ElasticService } from '../services/elasticService';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function initEmailWorker(): Worker<EmailJobData> {
  const worker = new Worker<EmailJobData>(
    EMAIL_QUEUE_NAME,
    async (job: Job<EmailJobData>) => {
      const { scheduledEmailId, userId, senderEmail, recipientEmail, subject, body, hourlyLimit } = job.data;

      // 1. Check Hourly Rate Limit (Atomic Lua in Redis) BEFORE claiming DB row
      const rateLimitCheck = await RateLimitService.checkAndIncrement(senderEmail, hourlyLimit);

      if (!rateLimitCheck.allowed) {
        const nextHour = rateLimitCheck.rescheduleAt!;
        // Add subtle random jitter (1-10 seconds) to prevent stampeding the top of the hour
        const jitterMs = Math.floor(Math.random() * 9000) + 1000;
        const rescheduledTime = new Date(nextHour.getTime() + jitterMs);

        console.warn(
          `⏳ [Rate Limit Hit] Sender ${senderEmail} reached limit (${rateLimitCheck.hourlyLimit}/hr). Rescheduling job to ${rescheduledTime.toISOString()}`
        );

        // Update DB status to RATE_LIMITED_RESCHEDULED
        await db
          .update(scheduledEmails)
          .set({
            status: 'RATE_LIMITED_RESCHEDULED',
            scheduledAt: rescheduledTime,
            errorMessage: `Hourly limit of ${rateLimitCheck.hourlyLimit} reached. Auto-rescheduled with jitter.`,
            updatedAt: new Date(),
          })
          .where(eq(scheduledEmails.id, scheduledEmailId));

        // Audit Trail
        await db.insert(emailEvents).values({
          emailId: scheduledEmailId,
          eventType: 'RATE_LIMITED_RESCHEDULED',
          details: {
            hourlyLimit: rateLimitCheck.hourlyLimit,
            rescheduledTo: rescheduledTime.toISOString(),
            currentCount: rateLimitCheck.currentCount,
          },
        });

        // Sync with Elasticsearch
        await ElasticService.updateEmailStatus(scheduledEmailId, {
          status: 'RATE_LIMITED_RESCHEDULED',
          scheduledAt: rescheduledTime,
        });

        // Re-enqueue for the next hour window
        const nextJobId = `email-${scheduledEmailId}-${rescheduledTime.getTime()}`;
        const delay = Math.max(1000, rescheduledTime.getTime() - Date.now());

        await emailQueue.add(
          'send-email',
          {
            ...job.data,
            scheduledAt: rescheduledTime.toISOString(),
          },
          {
            jobId: nextJobId,
            delay,
          }
        );

        // Fire live Slack alert
        await SlackService.notifyRateLimitHit({
          userId,
          senderEmail,
          hourlyLimit: rateLimitCheck.hourlyLimit,
          rescheduleAt: rescheduledTime,
          recipientEmail,
        });

        return;
      }

      // 2. Atomic DB Claim Step (Second-tier idempotency defense against lock stalls)
      const claimed = await db
        .update(scheduledEmails)
        .set({
          status: 'SENDING',
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(scheduledEmails.id, scheduledEmailId),
            inArray(scheduledEmails.status, ['SCHEDULED', 'RATE_LIMITED_RESCHEDULED'])
          )
        )
        .returning({ id: scheduledEmails.id });

      if (claimed.length === 0) {
        console.log(`[Worker] Email ${scheduledEmailId} was already claimed or completed. Skipping.`);
        return;
      }

      // Record CLAIMED audit event
      await db.insert(emailEvents).values({
        emailId: scheduledEmailId,
        eventType: 'CLAIMED',
        details: { workerPid: process.pid, timestamp: new Date().toISOString() },
      });

      // 3. Provider Throttling Delay
      if (env.MIN_EMAIL_DELAY_MS > 0) {
        await sleep(env.MIN_EMAIL_DELAY_MS);
      }

      try {
        // 4. Fake SMTP Transmission via Ethereal Email
        const sendResult = await EmailService.send({
          from: senderEmail,
          to: recipientEmail,
          subject,
          body,
        });

        const sentAt = new Date();

        // 5. Update DB record to SENT
        await db
          .update(scheduledEmails)
          .set({
            status: 'SENT',
            sentAt,
            etherealMessageId: sendResult.messageId,
            etherealPreviewUrl: sendResult.previewUrl,
            errorMessage: null,
            updatedAt: sentAt,
          })
          .where(eq(scheduledEmails.id, scheduledEmailId));

        // Record SENT audit event
        await db.insert(emailEvents).values({
          emailId: scheduledEmailId,
          eventType: 'SENT',
          details: {
            messageId: sendResult.messageId,
            previewUrl: sendResult.previewUrl,
            sentAt: sentAt.toISOString(),
          },
        });

        // 6. Update Elasticsearch
        await ElasticService.updateEmailStatus(scheduledEmailId, {
          status: 'SENT',
          sentAt,
          etherealPreviewUrl: sendResult.previewUrl,
        });

        console.log(
          `✅ [Worker] Sent email ${scheduledEmailId} to ${recipientEmail} | Preview: ${sendResult.previewUrl}`
        );
      } catch (sendError: any) {
        console.error(`❌ [Worker] Delivery failed for ${scheduledEmailId}:`, sendError?.message || sendError);

        await db
          .update(scheduledEmails)
          .set({
            status: 'FAILED',
            errorMessage: sendError?.message || 'SMTP delivery failure',
            retryCount: sql`${scheduledEmails.retryCount} + 1`,
            updatedAt: new Date(),
          })
          .where(eq(scheduledEmails.id, scheduledEmailId));

        await db.insert(emailEvents).values({
          emailId: scheduledEmailId,
          eventType: 'FAILED',
          details: { error: sendError?.message || String(sendError) },
        });

        await ElasticService.updateEmailStatus(scheduledEmailId, {
          status: 'FAILED',
        });

        throw sendError;
      }
    },
    {
      connection: redisConnection,
      concurrency: env.WORKER_CONCURRENCY,
    }
  );

  worker.on('failed', (job, err) => {
    console.error(`❌ Job ${job?.id} failed:`, err.message);
  });

  worker.on('error', (err) => {
    console.error('❌ Worker error:', err.message);
  });

  console.log(`🚀 Email worker initialized with concurrency = ${env.WORKER_CONCURRENCY}`);
  return worker;
}
