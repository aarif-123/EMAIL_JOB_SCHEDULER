import express from 'express';
import cors from 'cors';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import path from 'path';

import { env } from './config/env';
import { sqlClient } from './db';
import { runMigrations } from './db/migrate';
import { initElasticsearchIndex } from './config/elasticsearch';
import { emailQueue, reconcilePendingEmailsOnStartup } from './queues/emailQueue';
import { initEmailWorker } from './workers/emailWorker';
import { authRouter } from './routes/authRoutes';
import { emailRouter } from './routes/emailRoutes';
import { slackRouter } from './routes/slackRoutes';
import { adminRouter } from './routes/adminRoutes';

async function bootstrap() {
  const app = express();

  // Middleware
  app.use(
    cors({
      origin: [env.CLIENT_URL, 'http://localhost:5173', 'http://localhost:3000'],
      credentials: true,
    })
  );
  app.use(express.json());

  // Mount Bull-Board Dashboard with ReachInbox custom theme
  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath('/admin/queues');

  createBullBoard({
    queues: [new BullMQAdapter(emailQueue)],
    serverAdapter,
    options: {
      uiConfig: {
        boardTitle: 'ReachInbox Queue Inspector',
        miscLinks: [
          { text: '← Back to ReachInbox App', url: 'http://localhost:5173/queue' },
        ],
      },
    },
  });

  serverAdapter.setViewsPath(path.join(__dirname, 'views'));
  app.use('/admin/queues', serverAdapter.getRouter());

  // Healthcheck
  app.get('/health', async (_req, res) => {
    res.json({
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  });

  // API Routes
  app.use('/api/auth', authRouter);
  app.use('/api/emails', emailRouter);
  app.use('/api/slack', slackRouter);
  app.use('/api/admin', adminRouter);

  // Global Error Handler
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('Unhandled Server Error:', err);
    res.status(err.status || 500).json({
      error: err.message || 'Internal Server Error',
    });
  });

  // Initialize Core Services
  try {
    // 1. Run Migrations & verify PostgreSQL connection
    await runMigrations();
    console.log('✅ PostgreSQL database ready (Drizzle ORM)');

    // 2. Initialize Elasticsearch Index
    await initElasticsearchIndex();

    // 3. Reconcile any stranded or pending jobs from DB into BullMQ
    await reconcilePendingEmailsOnStartup();

    // 4. Initialize BullMQ Worker
    const worker = initEmailWorker();

    // 5. Start HTTP Server
    const server = app.listen(env.PORT, () => {
      console.log(`🚀 ReachInbox Scheduler API: http://localhost:${env.PORT}`);
      console.log(`📊 Bull-Board Queue Dashboard: http://localhost:${env.PORT}/admin/queues`);
    });

    // Graceful Shutdown
    const shutdown = async (signal: string) => {
      console.log(`\n🛑 Received ${signal}. Shutting down gracefully...`);
      server.close();
      await worker.close();
      await emailQueue.close();
      await sqlClient.end();
      process.exit(0);
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
  } catch (error: any) {
    console.error('❌ Bootstrap failed:', error);
    process.exit(1);
  }
}

bootstrap();
