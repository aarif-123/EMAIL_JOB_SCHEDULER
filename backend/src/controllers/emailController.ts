import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/authMiddleware';
import { db } from '../db';
import { scheduledEmails, emailBatches, emailEvents, senderAccounts } from '../db/schema';
import { eq, inArray, desc, asc, count, or, ilike, and } from 'drizzle-orm';
import { z } from 'zod';
import { scheduleEmailJob } from '../queues/emailQueue';
import { ElasticService } from '../services/elasticService';
import { RateLimitService } from '../services/rateLimitService';
import { env } from '../config/env';

const scheduleSchema = z.object({
  subject: z.string().min(1, 'Subject is required'),
  body: z.string().min(1, 'Body is required'),
  recipients: z.array(z.string().email('Invalid email address')).min(1, 'At least one recipient required'),
  senderEmail: z.string().email('Valid sender email required'),
  rotateSenders: z.boolean().optional().default(false),
  startTime: z.string().datetime().optional().nullable(),
  delayBetweenSeconds: z.coerce.number().min(0).default(2),
  hourlyLimit: z.coerce.number().min(1).default(50),
});

export class EmailController {
  /**
   * Parse uploaded CSV or TXT lead file and extract valid emails
   */
  static async parseLeads(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.file) {
        res.status(400).json({ error: 'No file uploaded' });
        return;
      }

      const fileContent = req.file.buffer.toString('utf-8');
      const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
      const matches = fileContent.match(emailRegex) || [];

      // Deduplicate and normalize
      const uniqueEmails = Array.from(new Set(matches.map((e) => e.toLowerCase().trim())));

      res.json({
        detectedCount: uniqueEmails.length,
        emails: uniqueEmails,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  /**
   * Schedule a new batch campaign of emails
   */
  static async scheduleEmails(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const parseResult = scheduleSchema.safeParse(req.body);

      if (!parseResult.success) {
        res.status(400).json({ error: parseResult.error.format() });
        return;
      }

      const {
        subject,
        body,
        recipients,
        senderEmail,
        rotateSenders,
        startTime,
        delayBetweenSeconds,
        hourlyLimit,
      } = parseResult.data;

      // Available senders for optional rotation
      const allSenders = await db.select().from(senderAccounts);
      const senderPool = allSenders.length > 0 ? allSenders.map((s) => s.email) : [senderEmail];

      const baseTime = startTime ? new Date(startTime).getTime() : Date.now();

      // 1. Create EmailBatch in DB
      const [batch] = await db
        .insert(emailBatches)
        .values({
          userId,
          senderEmail,
          subject,
          body,
          totalCount: recipients.length,
          delayBetweenSeconds,
          hourlyLimit,
          scheduledStartTime: new Date(baseTime),
        })
        .returning();

      // 2. Prepare ScheduledEmail records
      const scheduledItems = recipients.map((recipient, index) => {
        const itemScheduledAt = new Date(baseTime + index * delayBetweenSeconds * 1000);
        // Round-robin sender assignment if rotateSenders is true
        const activeSender = rotateSenders
          ? senderPool[index % senderPool.length]
          : senderEmail;

        return {
          batchId: batch.id,
          userId,
          senderEmail: activeSender,
          recipientEmail: recipient,
          subject,
          body,
          status: 'SCHEDULED' as const,
          scheduledAt: itemScheduledAt,
        };
      });

      // Insert into PostgreSQL
      const createdEmails = await db
        .insert(scheduledEmails)
        .values(scheduledItems)
        .returning();

      // 3. Dispatch to BullMQ and record audit event
      for (const email of createdEmails) {
        const jobId = await scheduleEmailJob(
          {
            scheduledEmailId: email.id,
            userId,
            senderEmail: email.senderEmail,
            recipientEmail: email.recipientEmail,
            subject,
            body,
            scheduledAt: email.scheduledAt.toISOString(),
            hourlyLimit,
          },
          email.scheduledAt
        );

        // Update with jobId
        await db
          .update(scheduledEmails)
          .set({ jobId })
          .where(eq(scheduledEmails.id, email.id));

        // Audit Trail: record initial SCHEDULED event
        await db.insert(emailEvents).values({
          emailId: email.id,
          eventType: 'SCHEDULED',
          details: {
            batchId: batch.id,
            scheduledAt: email.scheduledAt.toISOString(),
            senderEmail: email.senderEmail,
          },
        });

        // Index in Elasticsearch
        await ElasticService.indexEmail({
          id: email.id,
          userId,
          batchId: batch.id,
          senderEmail: email.senderEmail,
          recipientEmail: email.recipientEmail,
          subject,
          body,
          status: email.status,
          scheduledAt: email.scheduledAt,
          createdAt: email.createdAt,
        });
      }

      res.status(201).json({
        message: `Successfully scheduled ${createdEmails.length} email(s)`,
        batchId: batch.id,
        scheduledCount: createdEmails.length,
      });
    } catch (err: any) {
      console.error('Error scheduling emails:', err);
      res.status(500).json({ error: err.message });
    }
  }

  /**
   * Get list of scheduled emails
   */
  static async getScheduledEmails(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
      const limit = Math.min(100, parseInt(req.query.limit as string, 10) || 20);
      const offset = (page - 1) * limit;

      const whereClause = and(
        eq(scheduledEmails.userId, userId),
        inArray(scheduledEmails.status, ['SCHEDULED', 'QUEUED', 'SENDING', 'RATE_LIMITED_RESCHEDULED'])
      );

      const [emails, totalResult] = await Promise.all([
        db
          .select()
          .from(scheduledEmails)
          .where(whereClause)
          .orderBy(asc(scheduledEmails.scheduledAt))
          .limit(limit)
          .offset(offset),
        db.select({ count: count() }).from(scheduledEmails).where(whereClause),
      ]);

      const total = totalResult[0]?.count || 0;

      res.json({
        emails,
        total,
        page,
        totalPages: Math.ceil(total / limit),
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  /**
   * Get list of sent emails
   */
  static async getSentEmails(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
      const limit = Math.min(100, parseInt(req.query.limit as string, 10) || 20);
      const offset = (page - 1) * limit;

      const whereClause = and(
        eq(scheduledEmails.userId, userId),
        inArray(scheduledEmails.status, ['SENT', 'FAILED'])
      );

      const [emails, totalResult] = await Promise.all([
        db
          .select()
          .from(scheduledEmails)
          .where(whereClause)
          .orderBy(desc(scheduledEmails.sentAt))
          .limit(limit)
          .offset(offset),
        db.select({ count: count() }).from(scheduledEmails).where(whereClause),
      ]);

      const total = totalResult[0]?.count || 0;

      res.json({
        emails,
        total,
        page,
        totalPages: Math.ceil(total / limit),
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  /**
   * Get single email by ID with full audit events
   */
  static async getEmailById(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { id } = req.params;

      const email = await db.query.scheduledEmails.findFirst({
        where: and(eq(scheduledEmails.id, id), eq(scheduledEmails.userId, userId)),
        with: {
          batch: true,
          events: {
            orderBy: desc(emailEvents.createdAt),
          },
        },
      });

      if (!email) {
        res.status(404).json({ error: 'Email not found' });
        return;
      }

      res.json(email);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  /**
   * Elasticsearch Full-Text Search
   */
  static async search(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const query = (req.query.q as string) || '';
      const status = (req.query.status as string) || undefined;
      const limit = Math.min(100, parseInt(req.query.limit as string, 10) || 50);

      // 1. Query Elasticsearch
      const esResult = await ElasticService.searchEmails({
        userId,
        query,
        status,
        limit,
      });

      if (esResult.emails.length > 0 || !query) {
        res.json({
          source: 'elasticsearch',
          total: esResult.total,
          emails: esResult.emails,
        });
        return;
      }

      // 2. Database Fallback (if Elasticsearch yielded 0 matches or was cold)
      const conditions = [eq(scheduledEmails.userId, userId)];
      if (status) {
        conditions.push(eq(scheduledEmails.status, status as any));
      }
      if (query.trim().length > 0) {
        conditions.push(
          or(
            ilike(scheduledEmails.subject, `%${query}%`),
            ilike(scheduledEmails.recipientEmail, `%${query}%`),
            ilike(scheduledEmails.body, `%${query}%`),
            ilike(scheduledEmails.senderEmail, `%${query}%`)
          )!
        );
      }

      const dbEmails = await db
        .select()
        .from(scheduledEmails)
        .where(and(...conditions))
        .orderBy(desc(scheduledEmails.scheduledAt))
        .limit(limit);

      res.json({
        source: 'postgresql_fallback',
        total: dbEmails.length,
        emails: dbEmails,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  /**
   * Dashboard statistics & rate limit telemetry
   */
  static async getStats(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;

      const [scheduledRes, sentRes, failedRes, rateLimitedRes, senders] = await Promise.all([
        db
          .select({ count: count() })
          .from(scheduledEmails)
          .where(
            and(
              eq(scheduledEmails.userId, userId),
              inArray(scheduledEmails.status, ['SCHEDULED', 'QUEUED', 'SENDING'])
            )
          ),
        db
          .select({ count: count() })
          .from(scheduledEmails)
          .where(and(eq(scheduledEmails.userId, userId), eq(scheduledEmails.status, 'SENT'))),
        db
          .select({ count: count() })
          .from(scheduledEmails)
          .where(and(eq(scheduledEmails.userId, userId), eq(scheduledEmails.status, 'FAILED'))),
        db
          .select({ count: count() })
          .from(scheduledEmails)
          .where(
            and(
              eq(scheduledEmails.userId, userId),
              eq(scheduledEmails.status, 'RATE_LIMITED_RESCHEDULED')
            )
          ),
        db.select().from(senderAccounts),
      ]);

      const senderUsage = await Promise.all(
        senders.map(async (sender) => {
          const currentCount = await RateLimitService.getCurrentCount(sender.email);
          return {
            senderEmail: sender.email,
            senderName: sender.name,
            hourlyLimit: sender.hourlyLimit,
            currentCount,
            usagePercent: Math.min(100, Math.round((currentCount / sender.hourlyLimit) * 100)),
          };
        })
      );

      res.json({
        scheduledCount: scheduledRes[0]?.count || 0,
        sentCount: sentRes[0]?.count || 0,
        failedCount: failedRes[0]?.count || 0,
        rateLimitedCount: rateLimitedRes[0]?.count || 0,
        senderUsage,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  /**
   * Get all sender accounts
   */
  static async getSenders(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      let senders = await db.select().from(senderAccounts).orderBy(asc(senderAccounts.createdAt));

      if (senders.length === 0) {
        senders = await db
          .insert(senderAccounts)
          .values([
            {
              email: 'outreach@reachinbox.ai',
              name: 'ReachInbox Growth',
              isDefault: true,
              hourlyLimit: env.DEFAULT_HOURLY_LIMIT_PER_SENDER,
            },
            {
              email: 'sales@reachinbox.ai',
              name: 'Enterprise Sales',
              isDefault: false,
              hourlyLimit: env.DEFAULT_HOURLY_LIMIT_PER_SENDER,
            },
          ])
          .returning();
      }

      res.json(senders);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  /**
   * Add a new verified sender account
   */
  static async addSender(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { email, name } = req.body;
      if (!email || typeof email !== 'string' || !email.includes('@')) {
        res.status(400).json({ error: 'Valid email address is required' });
        return;
      }

      const cleanEmail = email.trim().toLowerCase();
      const cleanName = (name || cleanEmail.split('@')[0]).trim();

      const existing = await db
        .select()
        .from(senderAccounts)
        .where(eq(senderAccounts.email, cleanEmail));

      if (existing.length > 0) {
        res.json(existing[0]);
        return;
      }

      const [newSender] = await db
        .insert(senderAccounts)
        .values({
          email: cleanEmail,
          name: cleanName,
          isDefault: false,
          hourlyLimit: env.DEFAULT_HOURLY_LIMIT_PER_SENDER,
        })
        .returning();

      res.status(201).json(newSender);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
}

