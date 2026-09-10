export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
  slackConfig?: {
    isConnected: boolean;
    channelName?: string;
    teamName?: string;
  };
}

export interface SenderAccount {
  id: string;
  email: string;
  name: string;
  isDefault: boolean;
  hourlyLimit: number;
}

export interface ScheduledEmail {
  id: string;
  batchId?: string;
  userId: string;
  senderEmail: string;
  recipientEmail: string;
  subject: string;
  body: string;
  status: 'SCHEDULED' | 'QUEUED' | 'SENDING' | 'SENT' | 'FAILED' | 'RATE_LIMITED_RESCHEDULED';
  scheduledAt: string;
  sentAt?: string;
  etherealMessageId?: string;
  etherealPreviewUrl?: string;
  retryCount: number;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SenderUsage {
  senderEmail: string;
  senderName: string;
  hourlyLimit: number;
  currentCount: number;
  usagePercent: number;
}

export interface EmailStats {
  scheduledCount: number;
  sentCount: number;
  failedCount: number;
  rateLimitedCount: number;
  senderUsage: SenderUsage[];
}

export interface SlackStatus {
  isConnected: boolean;
  channelName?: string;
  teamName?: string;
  webhookConfigured: boolean;
}

// ─── Queue / Admin ────────────────────────────────────────────────────────────

export interface QueueJob {
  id: string;
  name: string;
  state: 'delayed' | 'active' | 'waiting' | 'completed' | 'failed' | 'paused';
  recipientEmail?: string;
  senderEmail?: string;
  subject?: string;
  attemptsMade: number;
  failedReason?: string | null;
  delayRemainingMs: number;
  scheduledAt?: string;
  timestamp: number;
  processedOn?: number | null;
  finishedOn?: number | null;
}

export interface QueueCounts {
  delayed: number;
  active: number;
  waiting: number;
  completed: number;
  failed: number;
  paused: number;
  total: number;
}

export interface QueueStatsResponse {
  queue: {
    name: string;
    isPaused: boolean;
    counts: QueueCounts;
    concurrency: number;
    minEmailDelayMs: number;
  };
  redis: {
    status: string;
    usedMemory: string;
    uptimeSeconds: number;
    aofEnabled: boolean;
    host: string;
    port: number;
  };
  dbTotals: {
    sent: number;
    failed: number;
    scheduled: number;
    rateLimited: number;
  };
  jobs: QueueJob[];
}

// ─── Email Detail ─────────────────────────────────────────────────────────────

export interface EmailEvent {
  id: string;
  eventType: string;
  details: Record<string, unknown>;
  createdAt: string;
}

export interface EmailDetailData extends ScheduledEmail {
  batch?: {
    id: string;
    totalRecipients: number;
    delayBetweenSeconds: number;
    hourlyLimit: number;
    createdAt: string;
  };
  events?: EmailEvent[];
}

// ─── API error ───────────────────────────────────────────────────────────────

export interface ApiError {
  error: string | { message: string };
}
