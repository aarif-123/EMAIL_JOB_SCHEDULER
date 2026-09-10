import { db, sqlClient } from './index';
import { users, senderAccounts } from './schema';
import { eq } from 'drizzle-orm';

export async function seed() {
  console.log('🌱 Seeding initial database records...');

  try {
    // 1. Seed Demo User (Oliver Brown matching Figma design)
    const existingUser = await db.query.users.findFirst({
      where: eq(users.email, 'oliver.brown@domain.io'),
    });

    if (!existingUser) {
      await db.insert(users).values({
        email: 'oliver.brown@domain.io',
        name: 'Oliver Brown',
        avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80',
      });
      console.log('✅ Seeded user: Oliver Brown (oliver.brown@domain.io)');
    }

    // 2. Seed Default Sender Accounts
    const defaultSenders = [
      {
        email: 'outreach@reachinbox.ai',
        name: 'ReachInbox Growth',
        isDefault: true,
        hourlyLimit: 50,
      },
      {
        email: 'sales@reachinbox.ai',
        name: 'Enterprise Sales',
        isDefault: false,
        hourlyLimit: 50,
      },
    ];

    for (const sender of defaultSenders) {
      const existingSender = await db.query.senderAccounts.findFirst({
        where: eq(senderAccounts.email, sender.email),
      });

      if (!existingSender) {
        await db.insert(senderAccounts).values(sender);
        console.log(`✅ Seeded sender account: ${sender.email}`);
      }
    }

    console.log('🌱 Seeding finished successfully');
  } catch (error: any) {
    console.error('❌ Seeding failed:', error);
  } finally {
    await sqlClient.end();
  }
}

if (require.main === module) {
  seed()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
