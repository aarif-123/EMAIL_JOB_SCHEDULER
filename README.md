# ReachInbox Email Scheduler & Dispatcher
> **Outbox Labs Software Development Intern Assignment**  
> A full-stack, production-grade email scheduling service and dashboard designed for high-volume cold outreach. Built with **BullMQ delayed queues**, **Redis 7 (AOF)**, **PostgreSQL (Drizzle ORM)**, **Elasticsearch 8**, **Ethereal Fake SMTP**, **Real Google OAuth**, and **Live Slack Alerting**.

---

## 📌 Submission & Reviewer Information

| Parameter | Details |
|---|---|
| **Submission Form Link** | [ClickUp Submission Form](https://forms.clickup.com/9005062261/f/8cbwp3n-8876/6NNNJ92DV93PQTAYST) |
| **GitHub Access Granted To** | `Mitrajit`, `Yadav036` |
| **Frontend Deployment** | Prepared for Vercel with [`vercel.json`](file:///c:/Users/Mohmmed%20Aarif/Downloads/OUTBOX/project/vercel.json) client SPA rewrite rules |
| **Backend Architecture** | Express.js + TypeScript + BullMQ Worker + Redis 7 + PostgreSQL 16 + Elasticsearch 8 |

---

## 📋 Feature Mapping Matrix

This table maps every assignment requirement to its technical implementation in the codebase:

### 1. Backend Engine & Scheduler Requirements
| Assignment Requirement | Technical Implementation | Status |
|---|---|---|
| **API Email Scheduling** | `POST /api/emails/schedule` parses campaign options, bulk-inserts PostgreSQL rows, and dispatches delayed jobs to BullMQ. | ✅ Implemented |
| **BullMQ + Redis Job Scheduler** | `Queue` & `Worker` configured with `email-dispatch-queue`. Zero cron jobs used anywhere. | ✅ Implemented |
| **Ethereal Email SMTP** | Transmits via Nodemailer to Ethereal fake SMTP. Saves authentic `etherealPreviewUrl` for instant UI inspection. | ✅ Implemented |
| **Elasticsearch Indexing** | `ElasticService` indexes emails into `reachinbox_emails` on schedule, status change, and completion. Full-text search endpoint: `GET /api/emails/search?q=...`. | ✅ Implemented |
| **Live BullMQ Queue Inspector** | Live Bull-Board dashboard hosted natively at `/admin/queues` showing active, delayed, waiting, completed, and failed jobs. | ✅ Implemented |
| **Server Restart Durability** | Redis AOF persistence (`--appendonly yes`) + `reconcilePendingEmailsOnStartup()` startup DB recovery loop guaranteeing zero lost jobs and zero duplicate sends. | ✅ Implemented |
| **Two-Tier Idempotency Defense** | **Tier 1**: Deterministic BullMQ job IDs (`email-{id}`).<br>**Tier 2**: Atomic PostgreSQL conditional claim (`UPDATE ... WHERE status IN ('SCHEDULED', 'RATE_LIMITED') RETURNING id`). | ✅ Implemented |
| **Worker Concurrency** | Configurable via `WORKER_CONCURRENCY=5`. Parallel worker threads process jobs safely without lock races. | ✅ Implemented |
| **Provider Throttling Delay** | Minimum delay between individual sends (`MIN_EMAIL_DELAY_MS=2000`) prevents provider throttling. | ✅ Implemented |
| **Per-Sender Hourly Rate Limiting** | Atomic Redis Lua script checks sender usage per UTC hour window (`ratelimit:{sender}:{YYYY-MM-DD-HH}`). Zero race conditions. | ✅ Implemented |
| **No-Drop Job Auto-Rescheduling** | When rate limit is reached, jobs are auto-deferred to the top of the next hour window (`nextHour + jitterMs`) without dropping. | ✅ Implemented |
| **Live Slack Rate Limit Alerts** | Real OAuth + webhook integration. Dispatches formatted Slack Block Kit alert the moment a sender reaches their hourly limit. Zero crash fallback if disconnected. | ✅ Implemented |

### 2. Frontend & UX Requirements
| Assignment Requirement | Technical Implementation | Status |
|---|---|---|
| **Figma Matching Layout & Tokens** | Exact replica of Outbox Labs Figma design tokens, sidebar metrics, active pills, user profile card, and modal layouts. | ✅ Implemented |
| **Google Login (Real OAuth)** | Integrated `@react-oauth/google` with token exchange backend endpoint `POST /api/auth/google`. | ✅ Implemented |
| **Compose New Email Modal** | Modal supporting manual recipient entry, CSV/text file lead parser pill, delay settings, hourly limit configuration, and optional scheduled start time. | ✅ Implemented |
| **Scheduled & Sent Email Tables** | Responsive lists with loading skeletons, empty states, status badges, and one-click Ethereal email sandbox preview links. | ✅ Implemented |
| **Queue Architecture Telemetry** | Dedicated **Queue & Engine** dashboard displaying live delayed/active/waiting/delivered/failed metrics, Redis memory, worker concurrency, and a **Retry Failed** re-enqueue trigger. | ✅ Implemented |

---

## 🏛 System Architecture Overview

```
┌───────────────────────────────────────────────────────────────┐
│                 React + Vite + Tailwind Frontend              │
│  • Google SSO (Real OAuth)    • Figma Layout & Design Tokens  │
│  • CSV Lead Parser Pill       • "View Email" Ethereal Link    │
│  • Scheduled & Sent Lists     • Live Slack Connect & Test     │
│  • Queue Telemetry Dashboard  • Vercel SPA Rewrites Configured │
└───────────────────────────────┬───────────────────────────────┘
                                │ REST API + JWT
┌───────────────────────────────▼───────────────────────────────┐
│                 Express.js TypeScript Backend                 │
│  • Rate Limiting Engine       • Elasticsearch Sync Service    │
│  • Live Bull-Board (/admin/queues) • Slack Webhook/OAuth API  │
└───────────────┬───────────────┬───────────────┬───────────────┘
                │               │               │
        Enqueue │ (Delayed)     │ Claim Query   │ Index Sync
                ▼               ▼               ▼
┌──────────────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│    Redis 7 (AOF Mode)    │  │ PostgreSQL 16    │  │ Elasticsearch 8  │
│ • BullMQ Delayed Queue   │  │ • scheduled_email│  │ • reachinbox_    │
│ • Atomic Lua Limiter     │  │ • email_events   │  │   emails index   │
└───────────────┬──────────┘  └─────────▲────────┘  └──────────────────┘
                │ Worker Pool           │
                ▼                       │ Status Update
┌───────────────────────────────────────┴───────────────────────┐
│                      BullMQ Worker Pool                       │
│  1. Check Atomic Lua Rate Limit (Redis)                       │
│     ↳ If Exceeded: Reschedule to next hour + Fire Live Slack  │
│  2. Atomic DB Claim (Drizzle conditional UPDATE RETURNING id) │
│     ↳ If 0 rows claimed: Abort (lock race protection)         │
│  3. Provider Throttling Delay (configurable e.g. 2s)          │
│  4. Send via Fake SMTP (Ethereal Email)                       │
│  5. Save Ethereal Preview URL to DB + Index in Elasticsearch  │
└───────────────────────────────────────────────────────────────┘
```

---

## 🔑 Key Engineering Guarantees & Deep Dives

### 1. Pure Delayed Scheduling (Zero Cron Jobs)
- **Constraint**: No OS crons, no `node-cron`, no periodic polling loops.
- **Implementation**: BullMQ delayed queue with millisecond precision:
  ```ts
  const delay = Math.max(0, scheduledDate.getTime() - Date.now());
  await emailQueue.add('send-email', data, { jobId, delay });
  ```

### 2. Server Restart Survival & Zero Lost Jobs
- **Redis AOF**: Deployed with `--appendonly yes` to guarantee queue state persistence across Redis restarts.
- **Startup DB Reconciliation**: On Express server boot, `reconcilePendingEmailsOnStartup()` queries PostgreSQL for emails in `SCHEDULED` or `RATE_LIMITED_RESCHEDULED` states and re-enqueues any missing jobs in Redis with their remaining delay:
  ```ts
  await reconcilePendingEmailsOnStartup();
  ```
- **Result**: Server restarts leave pending emails intact, executing at their exact scheduled time with **zero lost jobs and zero duplicate sends**.

### 3. Two-Tier Idempotency Defense
- **Tier 1 (Enqueue level)**: Deterministic BullMQ job IDs (`email-{scheduledEmailId}`) prevent duplicate queue additions.
- **Tier 2 (Execution level)**: Atomic PostgreSQL conditional claim query executed before SMTP transmission:
  ```sql
  UPDATE scheduled_emails
  SET status = 'SENDING', updated_at = NOW()
  WHERE id = $1 AND status IN ('SCHEDULED', 'RATE_LIMITED_RESCHEDULED')
  RETURNING id;
  ```
  If BullMQ redelivers a job due to a worker timeout, the second worker claims 0 rows and immediately aborts.

### 4. Per-Sender Hourly Rate Limiting (Zero Dropped Jobs)
- **Atomic Lua Script**:
  ```lua
  local key = KEYS[1]
  local limit = tonumber(ARGV[1])
  local ttl = tonumber(ARGV[2])
  local current = tonumber(redis.call('GET', key) or "0")
  if current >= limit then
    return {0, current}
  else
    local newVal = redis.call('INCR', key)
    if newVal == 1 then redis.call('EXPIRE', key, ttl) end
    return {1, newVal}
  end
  ```
- **Rescheduling**: When a limit is hit, jobs are delayed to the top of the next hour window (`nextHour + jitterMs`) without being dropped or marked as failed.

### 5. Live Slack Alerting
- Dispatches a live formatted Slack Block Kit card the moment a sender reaches their hourly limit.
- **Graceful Fallback**: If Slack is not connected, the worker skips notification without crashing or delaying email delivery.

---

## ⚙️ Quick Start Guide

### Prerequisites
- **Docker & Docker Compose**
- **Node.js 18+** (tested on Node v22)
- **npm** or **pnpm**

---

### 1. Start Infrastructure (Postgres, Redis, Elasticsearch)
From the project root:
```bash
docker compose up -d
```
Docker container endpoints:
- **PostgreSQL**: `localhost:5432` (User: `reachinbox`, Pass: `reachinbox_secret`, DB: `reachinbox_db`)
- **Redis 7 (AOF)**: `localhost:6379`
- **Elasticsearch 8**: `localhost:9200`

---

### 2. Run Backend API & BullMQ Worker
```bash
cd backend
npm install
npm run db:migrate   # Applies Drizzle ORM migrations
npm run seed         # Seeds default senders & demo user
npm run dev          # Starts Express API server & BullMQ Worker
```
Backend Endpoints:
- **REST API Base**: `http://localhost:5000/api`
- **Live BullMQ Queue Inspector**: `http://localhost:5000/admin/queues`

---

### 3. Run Frontend Dashboard
```bash
cd frontend
npm install
npm run dev
```
Frontend App: `http://localhost:5173`

---

## 🛠 Environment Variables Configuration

### Backend (`backend/.env`)
```env
PORT=5000
NODE_ENV=development
DATABASE_URL="postgresql://reachinbox:reachinbox_secret@localhost:5432/reachinbox_db"
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
ELASTICSEARCH_NODE=http://localhost:9200
WORKER_CONCURRENCY=5
MIN_EMAIL_DELAY_MS=2000
DEFAULT_HOURLY_LIMIT_PER_SENDER=50
JWT_SECRET=reachinbox_super_secret_jwt_key_2025_scheduler
CLIENT_URL=http://localhost:5173
GOOGLE_CLIENT_ID=
SLACK_CLIENT_ID=
SLACK_CLIENT_SECRET=
SLACK_REDIRECT_URI=http://localhost:5000/api/slack/oauth/callback
```

### Frontend (`frontend/.env`)
```env
VITE_API_URL=http://localhost:5000/api
VITE_GOOGLE_CLIENT_ID=
```

---

## 🧪 Testing & Verification Guide

### 1. Automated Verification Suite (`npm run test:verify`)
Executes unit/integration checks covering atomic Redis Lua scripts, PostgreSQL conditional updates, Ethereal SMTP delivery, and Elasticsearch indexing:
```bash
cd backend
npm run test:verify
```

---

### 2. High-Volume Load & Stress Testing (`npm run test:load`)
Evaluates system throughput, worker concurrency, and rate limiting under heavy load:
```bash
cd backend

# Standard benchmark (100 emails):
npm run test:load

# Custom scale benchmarks:
npm run test:load -- --count=20    # Fast 20-email run
npm run test:load -- --count=500   # High-volume stress test
npm run test:load -- --count=1000  # 1,000-email scale evaluation
```

---

### 3. Manual Step-by-Step Testing & Restart Verification

#### Scenario A: Create & Schedule Emails
1. Open `http://localhost:5173`.
2. Click **"Compose"**.
3. Select a sender, enter recipients (or click **"Upload List"** to parse a CSV file), set delay and hourly limit, and click **"Send"** (or **"Schedule"**).
4. Navigate to **"Scheduled"** to view pending items or **"Sent"** to view delivered items.
5. Click **"View Email"** on any sent row to render the HTML email inside the live Ethereal sandbox.

#### Scenario B: Server Restart Recovery (Zero Lost Jobs)
1. In the Compose modal, click **"Send Later"** and schedule an email for **2 minutes into the future**.
2. Verify the item appears under **"Scheduled"** with status `SCHEDULED`.
3. In your backend terminal, kill the process using `Ctrl + C`.
4. Restart the backend: `npm run dev`.
5. Observe the startup log: `🔄 Startup reconciliation complete: verified 1 pending emails`.
6. Wait 2 minutes: the email delivers on time with status `SENT` and **zero duplicate sends**.

#### Scenario C: Hourly Rate Limiting & Live Slack Alert
1. In the Compose Modal, set **"Hourly Limit"** to `2`.
2. Enter `3` recipient emails and click **"Send"**.
3. Results:
   - Emails 1 & 2 deliver immediately (`SENT`).
   - Email 3 exceeds the hourly limit and transitions to `RATE_LIMITED_RESCHEDULED` (scheduled for the next hour window).
   - If Slack is connected, a live Block Kit alert is sent to your Slack channel.

---

## 📹 5-Minute Demo Video Flow Checklist

1. **Overview & Login**: Google SSO login and Figma-matching dashboard layout.
2. **Compose Campaign & CSV Lead Parsing**: Upload a `.csv` lead file, parse emails, configure provider delay and hourly limit, and schedule.
3. **Scheduled & Sent Tabs**: Monitor real-time status transitions (`SCHEDULED` ➔ `SENDING` ➔ `SENT`) and open Ethereal Email sandbox links.
4. **Server Restart Demonstration**: Schedule an email for +60 seconds, terminate backend server (`Ctrl + C`), restart backend (`npm run dev`), and show startup DB reconciliation sending the email on schedule.
5. **Rate Limiting & Live Slack Notification**: Trigger sender rate limit (e.g. 2/hour) ➔ show 3rd email auto-deferred ➔ verify live Slack alert delivery.
6. **Queue Telemetry & Bull-Board Inspector**: Show the `/admin/queues` Bull-Board queue inspector and native **Queue & Engine** architecture dashboard.
