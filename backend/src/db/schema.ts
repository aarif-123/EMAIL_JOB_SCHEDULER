import { pgTable, text, timestamp, integer, boolean, uuid, jsonb, pgEnum } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const emailStatusEnum = pgEnum('email_status', [
  'SCHEDULED',
  'QUEUED',
  'SENDING',
  'SENT',
  'FAILED',
  'RATE_LIMITED_RESCHEDULED',
]);

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  avatarUrl: text('avatar_url'),
  googleId: text('google_id').unique(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const senderAccounts = pgTable('sender_accounts', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  isDefault: boolean('is_default').default(false).notNull(),
  hourlyLimit: integer('hourly_limit').default(50).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const emailBatches = pgTable('email_batches', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  senderEmail: text('sender_email').notNull(),
  subject: text('subject').notNull(),
  body: text('body').notNull(),
  totalCount: integer('total_count').notNull(),
  delayBetweenSeconds: integer('delay_between_seconds').default(2).notNull(),
  hourlyLimit: integer('hourly_limit').default(50).notNull(),
  scheduledStartTime: timestamp('scheduled_start_time').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const scheduledEmails = pgTable('scheduled_emails', {
  id: uuid('id').defaultRandom().primaryKey(),
  batchId: uuid('batch_id').references(() => emailBatches.id, { onDelete: 'set null' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  senderEmail: text('sender_email').notNull(),
  recipientEmail: text('recipient_email').notNull(),
  subject: text('subject').notNull(),
  body: text('body').notNull(),
  status: emailStatusEnum('status').default('SCHEDULED').notNull(),
  scheduledAt: timestamp('scheduled_at').notNull(),
  sentAt: timestamp('sent_at'),
  jobId: text('job_id').unique(),
  etherealMessageId: text('ethereal_message_id'),
  etherealPreviewUrl: text('ethereal_preview_url'),
  retryCount: integer('retry_count').default(0).notNull(),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Audit trail table for tracking full lifecycle events per email
export const emailEvents = pgTable('email_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  emailId: uuid('email_id').references(() => scheduledEmails.id, { onDelete: 'cascade' }).notNull(),
  eventType: text('event_type').notNull(), // 'SCHEDULED', 'CLAIMED', 'SENDING', 'SENT', 'FAILED', 'RATE_LIMITED_RESCHEDULED'
  details: jsonb('details'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const slackConfigs = pgTable('slack_configs', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull().unique(),
  webhookUrl: text('webhook_url'),
  channelName: text('channel_name').default('#general'),
  teamName: text('team_name'),
  accessToken: text('access_token'),
  isConnected: boolean('is_connected').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Relations
export const usersRelations = relations(users, ({ many, one }) => ({
  emails: many(scheduledEmails),
  batches: many(emailBatches),
  slackConfig: one(slackConfigs, {
    fields: [users.id],
    references: [slackConfigs.userId],
  }),
}));

export const emailBatchesRelations = relations(emailBatches, ({ one, many }) => ({
  user: one(users, {
    fields: [emailBatches.userId],
    references: [users.id],
  }),
  emails: many(scheduledEmails),
}));

export const scheduledEmailsRelations = relations(scheduledEmails, ({ one, many }) => ({
  user: one(users, {
    fields: [scheduledEmails.userId],
    references: [users.id],
  }),
  batch: one(emailBatches, {
    fields: [scheduledEmails.batchId],
    references: [emailBatches.id],
  }),
  events: many(emailEvents),
}));

export const emailEventsRelations = relations(emailEvents, ({ one }) => ({
  email: one(scheduledEmails, {
    fields: [emailEvents.emailId],
    references: [scheduledEmails.id],
  }),
}));
