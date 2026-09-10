import { redisConnection } from '../config/redis';
import { env } from '../config/env';

export interface RateLimitCheckResult {
  allowed: boolean;
  currentCount: number;
  hourlyLimit: number;
  rescheduleAt?: Date;
  delayMs?: number;
}

const CHECK_AND_INCR_LUA = `
local key = KEYS[1]
local limit = tonumber(ARGV[1])
local ttl = tonumber(ARGV[2])

local current = tonumber(redis.call('GET', key) or "0")
if current >= limit then
  return {0, current}
else
  local newVal = redis.call('INCR', key)
  if newVal == 1 then
    redis.call('EXPIRE', key, ttl)
  end
  return {1, newVal}
end
`;

export class RateLimitService {
  /**
   * Helper to format UTC hour window key: YYYY-MM-DD-HH
   */
  static getHourWindow(date = new Date()) {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    const hour = String(date.getUTCHours()).padStart(2, '0');
    const windowKey = `${year}-${month}-${day}-${hour}`;

    // Calculate exact start of the next hour
    const nextHourDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), date.getUTCHours() + 1, 0, 1, 0));
    const delayMs = Math.max(1000, nextHourDate.getTime() - date.getTime());
    const ttlSeconds = Math.ceil(delayMs / 1000) + 7200; // keep in Redis for 2 hours for inspection

    return { windowKey, nextHourDate, delayMs, ttlSeconds };
  }

  /**
   * Atomically check and increment sender count for the current hour.
   * If limit reached, returns allowed: false with the next hour's reschedule timestamp.
   */
  static async checkAndIncrement(
    senderEmail: string,
    configuredLimit?: number
  ): Promise<RateLimitCheckResult> {
    const limit = configuredLimit ?? env.DEFAULT_HOURLY_LIMIT_PER_SENDER;
    const { windowKey, nextHourDate, delayMs, ttlSeconds } = this.getHourWindow();
    const redisKey = `ratelimit:${senderEmail.toLowerCase()}:${windowKey}`;

    // Execute atomic Lua script
    const result = (await redisConnection.eval(
      CHECK_AND_INCR_LUA,
      1,
      redisKey,
      limit,
      ttlSeconds
    )) as [number, number];

    const allowed = result[0] === 1;
    const currentCount = result[1];

    if (!allowed) {
      return {
        allowed: false,
        currentCount,
        hourlyLimit: limit,
        rescheduleAt: nextHourDate,
        delayMs,
      };
    }

    return {
      allowed: true,
      currentCount,
      hourlyLimit: limit,
    };
  }

  /**
   * Get current usage count for a sender in the current hour without incrementing
   */
  static async getCurrentCount(senderEmail: string): Promise<number> {
    const { windowKey } = this.getHourWindow();
    const redisKey = `ratelimit:${senderEmail.toLowerCase()}:${windowKey}`;
    const val = await redisConnection.get(redisKey);
    return val ? parseInt(val, 10) : 0;
  }
}
