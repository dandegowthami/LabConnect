import bcrypt from 'bcryptjs';
import { connectDatabase, disconnectDatabase } from '../config/db.js';
import { env } from '../config/env.js';
import User from '../models/User.js';

if (!env.DEMO_STAFF_EMAIL || !env.DEMO_STAFF_PASSWORD) {
  throw new Error('Set DEMO_STAFF_EMAIL and DEMO_STAFF_PASSWORD in backend/.env before seeding staff');
}

await connectDatabase();
try {
  const passwordHash = await bcrypt.hash(env.DEMO_STAFF_PASSWORD, 12);
  await User.findOneAndUpdate(
    { email: env.DEMO_STAFF_EMAIL.toLowerCase() },
    {
      $set: { name: 'Demo Front Desk', email: env.DEMO_STAFF_EMAIL.toLowerCase(), passwordHash, role: 'staff', isActive: true }
    },
    { upsert: true, new: true, runValidators: true }
  );
  console.info(`Seeded demo staff account: ${env.DEMO_STAFF_EMAIL}`);
} finally {
  await disconnectDatabase();
}
