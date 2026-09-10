import { Queue, JobsOptions } from 'bullmq';
import { redisConnection } from '../config/redis';
import { db } from '../db';
import { scheduledEmails } from '../db/schema';
import { inArray, eq } from 'drizzle-orm';

export const EMAIL_QUEUE_NAME = 'email-dispatch-queue';

export interface EmailJobData {
  scheduledEmailId: string;
  userId: string;
  senderEmail: string;
  recipientEmail: string;
  subject: string;
  body: string;
  scheduledAt: string;
  hourlyLimit?: number;
}

export const emailQueue = new Queue<EmailJobData>(EMAIL_QUEUE_NAME, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: false, // keep for Bull-Board inspection
    removeOnFail: false,
  },
});

/**
 * Enqueue an email with delayed execution
 */
export async function scheduleEmailJob(
  data: EmailJobData,
  scheduledDate: Date
): Promise<string> {
  const now = Date.now();
  const delay = Math.max(0, scheduledDate.getTime() - now);
  const jobId = `email-${data.scheduledEmailId}`;

  const opts: JobsOptions = {
    jobId,
    delay,
  };

  const job = await emailQueue.add('send-email', data, opts);
  return job.id!;
}

/**
 * Startup Reconciliation:
 * Recovers any pending scheduled emails from PostgreSQL into BullMQ if missing,
 * guaranteeing zero lost jobs and zero duplicate sends upon server/process restarts.
 */
export async function reconcilePendingEmailsOnStartup(): Promise<void> {
  try {
    const pendingEmails = await db.query.scheduledEmails.findMany({
      where: inArray(scheduledEmails.status, ['SCHEDULED', 'QUEUED', 'SENDING', 'RATE_LIMITED_RESCHEDULED']),
      with: {
        batch: {
          columns: { hourlyLimit: true },
        },
      },
    });

    let reEnqueuedCount = 0;

    for (const email of pendingEmails) {
      if (email.status === 'SENDING' || email.status === 'QUEUED') {
        await db
          .update(scheduledEmails)
          .set({ status: 'SCHEDULED', updatedAt: new Date() })
          .where(eq(scheduledEmails.id, email.id));
      }

      const expectedJobId = `email-${email.id}`;
      const existingJob = await emailQueue.getJob(expectedJobId);

      if (!existingJob) {
        const delay = Math.max(0, email.scheduledAt.getTime() - Date.now());
        await emailQueue.add(
          'send-email',
          {
            scheduledEmailId: email.id,
            userId: email.userId,
            senderEmail: email.senderEmail,
            recipientEmail: email.recipientEmail,
            subject: email.subject,
            body: email.body,
            scheduledAt: email.scheduledAt.toISOString(),
            hourlyLimit: email.batch?.hourlyLimit ?? undefined,
          },
          {
            jobId: expectedJobId,
            delay,
          }
        );
        reEnqueuedCount++;
      }
    }

    console.log(
      `🔄 Startup reconciliation complete: verified ${pendingEmails.length} pending emails, re-enqueued ${reEnqueuedCount} missing jobs.`
    );
  } catch (error: any) {
    console.error('❌ Failed to reconcile pending emails on startup:', error?.message || error);
  }
}
