# 🚀 ReachInbox Email Scheduler & Dispatch Engine

> **Developer & Engineering Reference Guide**  
> A full-stack, distributed email scheduling service and real-time operations dashboard built for **ReachInbox (Outbox Labs)**. Engineered with **BullMQ delayed queues**, **Redis 7 AOF persistence**, **PostgreSQL (Drizzle ORM)**, **Elasticsearch 8 full-text indexing**, **Ethereal fake SMTP delivery**, **Google OAuth**, and **Live Slack alerting**.

---

## 📑 Table of Contents
1. [Project Structure](#-project-structure)
2. [System Architecture & Lifecycle](#-system-architecture--lifecycle)
3. [Database Schema & Entity Models](#-database-schema--entity-models)
4. [API Reference Specification](#-api-reference-specification)
5. [Queue & Worker Mechanics](#-queue--worker-mechanics)
6. [Developer Setup & Environment](#-developer-setup--environment)
7. [Testing & Benchmarking Suite](#-testing--benchmarking-suite)
8. [Vercel & Production Deployment](#-vercel--production-deployment)
9. [Troubleshooting & Maintenance](#-troubleshooting--maintenance)

---

## 📂 Project Structure

```
.
├── docker-compose.yml           # Local infrastructure stack (Postgres, Redis 7 AOF, Elasticsearch 8)
├── vercel.json                  # Vercel deployment & Single Page App rewrite configuration
├── README.md                    # Developer documentation & engineering reference
│
├── backend/                     # Express.js + TypeScript Service & BullMQ Worker Pool
│   ├── src/
│   │   ├── config/              # Redis, Elasticsearch, Environment configurations
│   │   ├── controllers/         # Admin, Auth, Email, and Slack API handlers
│   │   ├── db/                  # PostgreSQL schema, Drizzle ORM setup, seed scripts & migrations
│   │   ├── middleware/          # JWT authentication middleware
│   │   ├── queues/              # BullMQ queue definitions & startup reconciliation logic
│   │   ├── routes/              # Express API route modules
│   │   ├── scripts/             # Automated load testing & benchmark report generator
│   │   ├── services/            # Email SMTP, Elastic, Lua Rate Limiter, Slack Webhooks
│   │   ├── workers/             # Concurrency worker processor & two-tier claim logic
│   │   ├── server.ts            # Application bootstrap & Bull-Board inspector server
│   │   └── test_verification.ts # Automated runnable self-check test suite
│   ├── drizzle/                 # Versioned SQL migration files
│   └── package.json             # Backend dependencies & npm scripts
│
└── frontend/                    # React 18 + Vite + Tailwind CSS Application
    ├── src/
    │   ├── api/                 # Axios HTTP client API services
    │   ├── components/          # Reusable UI components, Modals, Tables, Headers, Sidebars
    │   ├── pages/               # Dashboard, Scheduled, Sent, Queue & Engine Architecture pages
    │   ├── types/               # TypeScript interfaces & API response definitions
    │   └── index.css            # Tailwind design tokens & custom glassmorphism utilities
    ├── vercel.json              # Frontend client Vercel rewrite configuration
    └── package.json             # Frontend dependencies & npm scripts
```

---

## 🏛 System Architecture & Lifecycle

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

### State Machine Lifecycle
Every scheduled email moves deterministically through the following states:

```
[SCHEDULED] ──► [QUEUED] ──► [SENDING] ──► [SENT] (Success)
     │                           │
     ├───────────────────────────┴──► [FAILED] (Execution Error)
     │
     └─► [RATE_LIMITED_RESCHEDULED] ──► Auto-deferred to next hour (+ jitter)
```

---

## 🗄 Database Schema & Entity Models

The PostgreSQL database uses Drizzle ORM for type-safe queries and versioned migrations.

### Tables Overview
1. **`users`**: Platform user accounts authenticated via Google OAuth.
2. **`sender_accounts`**: Verified outbound sender email accounts with hourly limits.
3. **`email_batches`**: Campaign metadata tracking total email count, delay settings, and start times.
4. **`scheduled_emails`**: Individual email rows with dispatch status, timestamps, Ethereal preview URLs, and error reasons.
5. **`email_events`**: Audit trail recording complete event lifecycle (`SCHEDULED`, `CLAIMED`, `SENDING`, `SENT`, `FAILED`, `RATE_LIMITED_RESCHEDULED`).
6. **`slack_configs`**: Per-user Slack OAuth tokens and webhook configurations.

---

## 🌐 API Reference Specification

### 1. Authentication Endpoints (`/api/auth`)
* `POST /api/auth/google`: Authenticate user via Google OAuth ID token. Returns JWT `token` and user profile.
* `POST /api/auth/demo-login`: Instant login fallback for development/demo testing.
* `GET /api/auth/me`: Fetch authenticated user profile and connected integrations.

### 2. Email Scheduling & Operations (`/api/emails`)
* `POST /api/emails/schedule`: Schedule a batch campaign or individual emails.
* `POST /api/emails/parse-leads`: Parse uploaded `.csv` or `.txt` lead file and return extracted emails.
* `GET /api/emails/scheduled`: Get list of pending scheduled emails for the logged-in user.
* `GET /api/emails/sent`: Get list of sent/failed emails with Ethereal preview URLs.
* `GET /api/emails/search?q=...`: Search emails across recipient, sender, subject, and body via Elasticsearch.
* `GET /api/emails/stats`: Retrieve user-level email telemetry & sender rate limit usage percentages.
* `GET /api/emails/senders`: List sender accounts.
* `POST /api/emails/senders`: Add a new sender account.

### 3. Queue & System Admin Endpoints (`/api/admin`)
* `GET /api/admin/queue-stats`: Retrieve system-wide BullMQ & PostgreSQL counts, memory metrics, worker concurrency, and recent jobs.
* `POST /api/admin/queue/pause`: Pause the BullMQ email dispatch queue.
* `POST /api/admin/queue/resume`: Resume the email dispatch queue.
* `POST /api/admin/queue/clean`: Clean completed or failed jobs from queue memory.
* `POST /api/admin/queue/reconcile`: Trigger manual DB ➔ BullMQ synchronization check.
* `POST /api/admin/retry-failed`: Re-enqueue failed emails from database back into BullMQ dispatch queue.

### 4. Slack Alerting Integration (`/api/slack`)
* `GET /api/slack/status`: Get user's Slack connection status.
* `GET /api/slack/oauth/authorize`: Get Slack OAuth authorization URL.
* `GET /api/slack/oauth/callback`: OAuth callback handler storing access token and webhook URL.
* `POST /api/slack/webhook-url`: Manually set a custom Slack Incoming Webhook URL.
* `POST /api/slack/test-alert`: Trigger a live test rate-limit alert to Slack.

---

## ⚡ Queue & Worker Mechanics

### 1. Pure Delayed Scheduling (Zero Cron Jobs)
No crons or periodic database polling loops exist. Emails are queued as **BullMQ delayed jobs**:
```ts
const delay = Math.max(0, scheduledDate.getTime() - Date.now());
await emailQueue.add('send-email', data, { jobId: `email-${emailId}`, delay });
```

### 2. Server Restart Survival & Zero Lost Jobs
- **Redis AOF Persistence**: Redis runs with `--appendonly yes` mounted to a Docker volume.
- **Startup DB Reconciliation**: On boot, `reconcilePendingEmailsOnStartup()` queries PostgreSQL for emails in `SCHEDULED` or `RATE_LIMITED_RESCHEDULED` states and re-enqueues any missing jobs in Redis with their remaining delay.

### 3. Two-Tier Idempotency Defense
- **Tier 1 (Enqueue level)**: Deterministic BullMQ job IDs (`email-{scheduledEmailId}`) prevent duplicate queue jobs.
- **Tier 2 (Worker execution level)**: Atomic PostgreSQL claim query before SMTP dispatch:
  ```sql
  UPDATE scheduled_emails
  SET status = 'SENDING', updated_at = NOW()
  WHERE id = $1 AND status IN ('SCHEDULED', 'RATE_LIMITED_RESCHEDULED')
  RETURNING id;
  ```

### 4. Atomic Redis Lua Rate Limiting
Executes an atomic Lua script in Redis (`ratelimit:{sender}:{YYYY-MM-DD-HH}`) to prevent parallel workers from exceeding hourly sender limits. If a limit is hit, the job is automatically deferred to `nextHour + jitterMs` without dropping.

---

## 🛠 Developer Setup & Environment

### Prerequisites
- Node.js 18+ (tested on Node v22)
- Docker & Docker Compose
- npm or pnpm

### 1. Start Infrastructure Stack
```bash
docker compose up -d
```
Docker container endpoints:
- **PostgreSQL 16**: `localhost:5432` (`reachinbox` / `reachinbox_secret`)
- **Redis 7 (AOF)**: `localhost:6379`
- **Elasticsearch 8**: `localhost:9200`

### 2. Setup & Run Backend
```bash
cd backend
npm install
npm run db:migrate   # Run Drizzle ORM migrations
npm run seed         # Seed initial senders and demo user
npm run dev          # Starts Express API & BullMQ Worker
```
- API Base URL: `http://localhost:5000/api`
- Live Bull-Board Inspector: `http://localhost:5000/admin/queues`

### 3. Setup & Run Frontend
```bash
cd frontend
npm install
npm run dev
```
- Dashboard UI: `http://localhost:5173`

---

## 🧪 Testing & Benchmarking Suite

### 1. Automated Integration Self-Check (`npm run test:verify`)
Tests atomic Redis Lua scripts, PostgreSQL conditional updates, Ethereal SMTP delivery, and Elasticsearch search:
```bash
cd backend
npm run test:verify
```

### 2. High-Volume Load & Stress Benchmark (`npm run test:load`)
Evaluates batch ingestion throughput, worker delivery speed, and 50x parallel rate-limiter concurrency:
```bash
cd backend
npm run test:load -- --count=100
```
Generates `backend/LOAD_TEST_REPORT.md` with latency distribution metrics (P50, P95, P99).

---

## 🚀 Vercel & Production Deployment

### Frontend Vercel Deployment
1. Import repository into Vercel.
2. Set Root Directory to `frontend`.
3. Set Build Command to `npm run build` and Output Directory to `dist`.
4. Set Environment Variable: `VITE_API_URL=https://<your-backend-api>/api`.
5. Vercel SPA routing rules configured in [`frontend/vercel.json`](file:///c:/Users/Mohmmed%20Aarif/Downloads/OUTBOX/project/frontend/vercel.json).

---

## 🔧 Troubleshooting & Maintenance

| Issue | Cause | Solution |
|---|---|---|
| **Redis Connection Error** | Redis Docker container not running | Run `docker compose up -d redis` |
| **Postgres Migration Failure** | Port 5432 occupied by local Postgres | Stop local Postgres service or update `DATABASE_URL` port |
| **Elasticsearch Cold Start** | Container initializing index mapping | Wait 10s or run `curl http://localhost:9200` to verify status |
| **BullMQ Jobs Not Processing** | Worker process crashed | Restart backend with `npm run dev` to re-initialize worker pool |
