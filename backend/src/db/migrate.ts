import fs from 'fs';
import path from 'path';
import postgres from 'postgres';
import { env } from '../config/env';

export async function runMigrations() {
  const sql = postgres(env.DATABASE_URL, { max: 1 });
  console.log('⏳ Running database migrations...');

  try {
    const migrationFilePath = path.join(__dirname, '../../drizzle/0000_aromatic_thena.sql');
    if (fs.existsSync(migrationFilePath)) {
      const sqlContent = fs.readFileSync(migrationFilePath, 'utf-8');
      await sql.unsafe(sqlContent);
      console.log('✅ Database migrations applied successfully');
    } else {
      console.log('ℹ️ No migration SQL file found, skipping.');
    }
  } catch (error: any) {
    // If objects already exist, it's fine
    if (error.code === '42P07' || error.message.includes('already exists')) {
      console.log('ℹ️ Tables already exist in database');
    } else {
      console.error('❌ Migration error:', error.message);
      throw error;
    }
  } finally {
    await sql.end();
  }
}

if (require.main === module) {
  runMigrations()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
