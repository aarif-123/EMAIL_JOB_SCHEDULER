import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().default(5000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_PASSWORD: z.string().optional().default(''),
  ELASTICSEARCH_NODE: z.string().default('http://localhost:9200'),
  WORKER_CONCURRENCY: z.coerce.number().min(1).default(5),
  MIN_EMAIL_DELAY_MS: z.coerce.number().min(0).default(2000),
  DEFAULT_HOURLY_LIMIT_PER_SENDER: z.coerce.number().min(1).default(50),
  JWT_SECRET: z.string().default('reachinbox_super_secret_jwt_key_2025_scheduler'),
  CLIENT_URL: z.string().default('http://localhost:5173'),
  GOOGLE_CLIENT_ID: z.string().optional().default(''),
  GOOGLE_CLIENT_SECRET: z.string().optional().default(''),
  SLACK_CLIENT_ID: z.string().optional().default(''),
  SLACK_CLIENT_SECRET: z.string().optional().default(''),
  SLACK_REDIRECT_URI: z.string().default('http://localhost:5000/api/slack/oauth/callback'),
  ENABLE_DEV_LOGIN: z.string().default('true'),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error('❌ Invalid environment variables:', parsedEnv.error.format());
  process.exit(1);
}

export const env = parsedEnv.data;
