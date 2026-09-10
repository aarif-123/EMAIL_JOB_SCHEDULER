import { Request, Response } from 'express';
import { emailQueue, reconcilePendingEmailsOnStartup, scheduleEmailJob } from '../queues/emailQueue';
import { redisConnection } from '../config/redis';
import { env } from '../config/env';
import { db } from '../db';
import { scheduledEmails } from '../db/schema';
import { eq, inArray, count, desc } from 'drizzle-orm';

export class AdminController {
  /**
   * Get comprehensive Queue & Engine Health metrics
   */
  static async getQueueStats(_req: Request, res: Response): Promise<void> {
    try {
      const [
        counts,
        isPaused,
        redisMemoryRaw,
        redisServerRaw,
        dbSentRes,
        dbFailedRes,
        dbScheduledRes,
        dbRateLimitedRes,
        recentDbEmails,
      ] = await Promise.all([
        emailQueue.getJobCounts('active', 'completed', 'failed', 'delayed', 'waiting', 'paused'),
        emailQueue.isPaused(),
        redisConnection.info('memory'),
        redisConnection.info('server'),
        db.select({ count: count() }).from(scheduledEmails).where(eq(scheduledEmails.status, 'SENT')),
        db.select({ count: count() }).from(scheduledEmails).where(eq(scheduledEmails.status, 'FAILED')),
        db
          .select({ count: count() })
          .from(scheduledEmails)
          .where(inArray(scheduledEmails.status, ['SCHEDULED', 'QUEUED', 'SENDING'])),
        db
          .select({ count: count() })
          .from(scheduledEmails)
          .where(eq(scheduledEmails.status, 'RATE_LIMITED_RESCHEDULED')),
        db.query.scheduledEmails.findMany({
          orderBy: [desc(scheduledEmails.updatedAt)],
          limit: 150,
        }),
      ]);

      const dbSent = dbSentRes[0]?.count || 0;
      const dbFailed = dbFailedRes[0]?.count || 0;
      const dbScheduled = dbScheduledRes[0]?.count || 0;
      const dbRateLimited = dbRateLimitedRes[0]?.count || 0;

      // Parse Redis Memory Info
      const memoryMatch = redisMemoryRaw.match(/used_memory_human:(.+)/);
      const usedMemory = memoryMatch ? memoryMatch[1].trim() : 'N/A';

      // Parse Redis Uptime
      const uptimeMatch = redisServerRaw.match(/uptime_in_seconds:(\d+)/);
      const uptimeSeconds = uptimeMatch ? parseInt(uptimeMatch[1], 10) : 0;

      // Fetch Recent Jobs across all states from Redis BullMQ
      const rawJobs = await emailQueue.getJobs(
        ['active', 'waiting', 'delayed', 'failed', 'completed'],
        0,
        150
      );

      const now = Date.now();
      const processedJobIds = new Set<string>();

      const validBullMqJobs = (
        await Promise.all(
          rawJobs.map(async (job) => {
            if (!job) return null;
            const state = await job.getState();
            const delayRemaining = job.opts.delay ? Math.max(0, job.timestamp + job.opts.delay - now) : 0;
            const scheduledEmailId = job.data?.scheduledEmailId || (typeof job.id === 'string' ? job.id.replace(/^email-/, '') : String(job.id));

            if (scheduledEmailId) processedJobIds.add(scheduledEmailId);
            if (job.id) processedJobIds.add(String(job.id));

            return {
              id: String(job.id),
              scheduledEmailId,
              name: job.name,
              state: state as 'delayed' | 'active' | 'waiting' | 'completed' | 'failed' | 'paused',
              recipientEmail: job.data?.recipientEmail,
              senderEmail: job.data?.senderEmail,
              subject: job.data?.subject,
              attemptsMade: job.attemptsMade || 0,
              failedReason: job.failedReason || null,
              delayRemainingMs: delayRemaining,
              scheduledAt: job.data?.scheduledAt,
              timestamp: job.timestamp,
              processedOn: job.processedOn || null,
              finishedOn: job.finishedOn || null,
            };
          })
        )
      ).filter((j): j is NonNullable<typeof j> => j !== null);

      // Convert DB records to Job representation for full visibility (especially FAILED & SENT)
      const dbJobs = recentDbEmails
        .filter((email) => {
          const jobId = email.jobId || `email-${email.id}`;
          return !processedJobIds.has(email.id) && !processedJobIds.has(jobId);
        })
        .map((email) => {
          let state: 'delayed' | 'active' | 'waiting' | 'completed' | 'failed' = 'completed';
          if (email.status === 'FAILED') {
            state = 'failed';
          } else if (email.status === 'SCHEDULED' || email.status === 'RATE_LIMITED_RESCHEDULED') {
            state = 'delayed';
          } else if (email.status === 'QUEUED' || email.status === 'SENDING') {
            state = 'active';
          } else if (email.status === 'SENT') {
            state = 'completed';
          }

          const delayRemaining = email.scheduledAt
            ? Math.max(0, new Date(email.scheduledAt).getTime() - now)
            : 0;

          return {
            id: email.jobId || `email-${email.id}`,
            scheduledEmailId: email.id,
            name: 'send-email',
            state,
            recipientEmail: email.recipientEmail,
            senderEmail: email.senderEmail,
            subject: email.subject,
            attemptsMade: email.retryCount || (email.status === 'FAILED' ? 3 : 1),
            failedReason: email.errorMessage || (email.status === 'FAILED' ? 'Delivery Failure' : null),
            delayRemainingMs: delayRemaining,
            scheduledAt: email.scheduledAt.toISOString(),
            timestamp: new Date(email.createdAt).getTime(),
            processedOn: email.sentAt ? new Date(email.sentAt).getTime() : null,
            finishedOn: email.updatedAt ? new Date(email.updatedAt).getTime() : null,
          };
        });

      const allJobs = [...validBullMqJobs, ...dbJobs];

      // Effective System-wide Counts (Redis + Postgres DB synthesis)
      const delayedCount = Math.max(counts.delayed || 0, dbScheduled + dbRateLimited);
      const activeCount = counts.active || 0;
      const waitingCount = counts.waiting || 0;
      const completedCount = Math.max(counts.completed || 0, dbSent);
      const failedCount = Math.max(counts.failed || 0, dbFailed);
      const pausedCount = counts.paused || 0;
      const totalCount = delayedCount + activeCount + waitingCount + completedCount + failedCount + pausedCount;

      res.json({
        queue: {
          name: emailQueue.name,
          isPaused,
          counts: {
            delayed: delayedCount,
            active: activeCount,
            waiting: waitingCount,
            completed: completedCount,
            failed: failedCount,
            paused: pausedCount,
            total: totalCount,
          },
          concurrency: env.WORKER_CONCURRENCY,
          minEmailDelayMs: env.MIN_EMAIL_DELAY_MS,
        },
        redis: {
          status: redisConnection.status,
          usedMemory,
          uptimeSeconds,
          aofEnabled: true, // Configured with --appendonly yes
          host: env.REDIS_HOST,
          port: env.REDIS_PORT,
        },
        dbTotals: {
          sent: dbSent,
          failed: dbFailed,
          scheduled: dbScheduled,
          rateLimited: dbRateLimited,
        },
        jobs: allJobs,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  /**
   * Pause the email dispatch queue
   */
  static async pauseQueue(_req: Request, res: Response): Promise<void> {
    try {
      await emailQueue.pause();
      res.json({ message: 'Queue paused successfully', isPaused: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  /**
   * Resume the email dispatch queue
   */
  static async resumeQueue(_req: Request, res: Response): Promise<void> {
    try {
      await emailQueue.resume();
      res.json({ message: 'Queue resumed successfully', isPaused: false });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  /**
   * Clean old completed or failed jobs
   */
  static async cleanJobs(req: Request, res: Response): Promise<void> {
    try {
      const type = (req.body.type as 'completed' | 'failed') || 'completed';
      const count = await emailQueue.clean(0, 100, type);
      res.json({ message: `Cleaned ${count.length} ${type} jobs`, cleanedCount: count.length });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  /**
   * Trigger manual DB to BullMQ startup reconciliation
   */
  static async reconcileJobs(_req: Request, res: Response): Promise<void> {
    try {
      await reconcilePendingEmailsOnStartup();
      res.json({ message: 'Reconciliation check completed successfully' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  /**
   * Re-enqueue failed emails from DB into BullMQ
   */
  static async retryFailedEmails(req: Request, res: Response): Promise<void> {
    try {
      const limit = Math.min(500, Math.max(1, parseInt(req.body.limit as string, 10) || 100));
      const failedEmails = await db.query.scheduledEmails.findMany({
        where: eq(scheduledEmails.status, 'FAILED'),
        limit,
        with: {
          batch: {
            columns: { hourlyLimit: true },
          },
        },
      });

      if (failedEmails.length === 0) {
        res.json({ message: 'No failed emails found to retry', retriedCount: 0 });
        return;
      }

      let countSuccess = 0;
      const baseDelay = 1000;
      const staggerDelay = env.MIN_EMAIL_DELAY_MS || 2000;

      for (let i = 0; i < failedEmails.length; i++) {
        const email = failedEmails[i];
        const nextScheduledAt = new Date(Date.now() + baseDelay + i * staggerDelay);

        await db
          .update(scheduledEmails)
          .set({
            status: 'SCHEDULED',
            scheduledAt: nextScheduledAt,
            errorMessage: null,
            updatedAt: new Date(),
          })
          .where(eq(scheduledEmails.id, email.id));

        await scheduleEmailJob(
          {
            scheduledEmailId: email.id,
            userId: email.userId,
            senderEmail: email.senderEmail,
            recipientEmail: email.recipientEmail,
            subject: email.subject,
            body: email.body,
            scheduledAt: nextScheduledAt.toISOString(),
            hourlyLimit: email.batch?.hourlyLimit ?? undefined,
          },
          nextScheduledAt
        );

        countSuccess++;
      }

      res.json({
        message: `Successfully re-enqueued ${countSuccess} failed email(s) into BullMQ dispatch queue.`,
        retriedCount: countSuccess,
      });
    } catch (err: any) {
      console.error('Failed to retry emails:', err);
      res.status(500).json({ error: err.message });
    }
  }
}
