import assert from 'assert';
import { db, sqlClient } from './db';
import { scheduledEmails, emailEvents, users, senderAccounts } from './db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { RateLimitService } from './services/rateLimitService';
import { EmailService } from './services/emailService';
import { ElasticService } from './services/elasticService';
import { initElasticsearchIndex, esClient } from './config/elasticsearch';
import { redisConnection } from './config/redis';

async function runVerification() {
  console.log('🧪 Starting self-check verification suite...');
  await initElasticsearchIndex();

  // --- Test 1: Atomic Rate Limiter (Redis Lua Script) ---
  console.log('▶ Test 1: Testing atomic Redis Lua rate limiter...');
  const testSender = `test-sender-${Date.now()}@reachinbox.test`;
  const limit = 3;

  const r1 = await RateLimitService.checkAndIncrement(testSender, limit);
  assert.strictEqual(r1.allowed, true, 'First send should be allowed');
  assert.strictEqual(r1.currentCount, 1);

  const r2 = await RateLimitService.checkAndIncrement(testSender, limit);
  assert.strictEqual(r2.allowed, true, 'Second send should be allowed');

  const r3 = await RateLimitService.checkAndIncrement(testSender, limit);
  assert.strictEqual(r3.allowed, true, 'Third send should be allowed');

  const r4 = await RateLimitService.checkAndIncrement(testSender, limit);
  assert.strictEqual(r4.allowed, false, 'Fourth send must be blocked by rate limiter');
  assert(r4.rescheduleAt instanceof Date, 'Should return rescheduleAt Date');
  assert(r4.delayMs! > 0, 'Delay must be positive');
  console.log('  ✅ Atomic rate limiter passed (3 allowed, 4th deferred to next hour window)');

  // --- Test 2: Two-Tier Atomic DB Claim ---
  console.log('▶ Test 2: Testing atomic DB row claim...');
  // Seed demo user if needed
  let user = await db.query.users.findFirst();
  if (!user) {
    const [u] = await db
      .insert(users)
      .values({ email: 'test@reachinbox.ai', name: 'Tester' })
      .returning();
    user = u;
  }

  const [testEmail] = await db
    .insert(scheduledEmails)
    .values({
      userId: user.id,
      senderEmail: testSender,
      recipientEmail: 'recipient@reachinbox.test',
      subject: 'Atomic Claim Test',
      body: 'Testing atomic claim',
      status: 'SCHEDULED',
      scheduledAt: new Date(),
    })
    .returning();

  // Simulate two concurrent workers attempting to claim the exact same email
  const claim1 = await db
    .update(scheduledEmails)
    .set({ status: 'SENDING', updatedAt: new Date() })
    .where(
      and(
        eq(scheduledEmails.id, testEmail.id),
        inArray(scheduledEmails.status, ['SCHEDULED', 'RATE_LIMITED_RESCHEDULED'])
      )
    )
    .returning({ id: scheduledEmails.id });

  const claim2 = await db
    .update(scheduledEmails)
    .set({ status: 'SENDING', updatedAt: new Date() })
    .where(
      and(
        eq(scheduledEmails.id, testEmail.id),
        inArray(scheduledEmails.status, ['SCHEDULED', 'RATE_LIMITED_RESCHEDULED'])
      )
    )
    .returning({ id: scheduledEmails.id });

  assert.strictEqual(claim1.length, 1, 'Worker 1 must successfully claim');
  assert.strictEqual(claim2.length, 0, 'Worker 2 must be rejected with 0 claimed rows');
  console.log('  ✅ Atomic DB claim passed (exactly 1 worker claimed row, second rejected)');

  // --- Test 3: Fake SMTP Ethereal Delivery ---
  console.log('▶ Test 3: Testing Ethereal Email SMTP delivery & preview URL...');
  const sendResult = await EmailService.send({
    from: 'outreach@reachinbox.ai',
    to: 'lead@example.com',
    subject: 'Verification Run',
    body: 'Automated verification test email.',
  });

  assert(sendResult.messageId, 'Must return an Ethereal messageId');
  assert(sendResult.previewUrl.includes('ethereal.email'), 'Must generate valid Ethereal preview URL');
  console.log(`  ✅ Ethereal delivery passed! Preview URL: ${sendResult.previewUrl}`);

  // --- Test 4: Elasticsearch Indexing & Search ---
  console.log('▶ Test 4: Testing Elasticsearch indexing & search...');
  await ElasticService.indexEmail({
    id: testEmail.id,
    userId: user.id,
    senderEmail: testEmail.senderEmail,
    recipientEmail: testEmail.recipientEmail,
    subject: testEmail.subject,
    body: testEmail.body,
    status: 'SENT',
    scheduledAt: testEmail.scheduledAt,
    sentAt: new Date(),
    etherealPreviewUrl: sendResult.previewUrl,
    createdAt: new Date(),
  });

  // Small delay for ES indexing refresh
  await new Promise((r) => setTimeout(r, 1000));

  const searchResult = await ElasticService.searchEmails({
    userId: user.id,
    query: 'Atomic Claim',
  });

  assert(searchResult.total >= 1, 'Elasticsearch should find indexed email');
  console.log(`  ✅ Elasticsearch indexing & search passed (${searchResult.total} hit(s))`);

  // Cleanup test record
  await db.delete(scheduledEmails).where(eq(scheduledEmails.id, testEmail.id));

  console.log('\n🎉 ALL RUNNABLE CHECKS PASSED SUCCESSFULLY!');
}

runVerification()
  .then(async () => {
    await redisConnection.quit();
    await sqlClient.end();
    await esClient.close();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('❌ Verification check failed:', err);
    await redisConnection.quit();
    await sqlClient.end();
    await esClient.close();
    process.exit(1);
  });
