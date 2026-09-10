import IORedis from 'ioredis';
import { env } from './env';

export const redisConnection = new IORedis({
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  password: env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null, // BullMQ requirement
  enableReadyCheck: false,
});

redisConnection.on('error', (err) => {
  console.error('❌ Redis connection error:', err.message);
});

redisConnection.on('connect', () => {
  console.log('✅ Redis connected successfully');
});
