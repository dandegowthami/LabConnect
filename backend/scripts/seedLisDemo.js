import { connectDatabase, disconnectDatabase } from '../config/db.js';
import { seedLisDemo } from '../services/lisDemoSeedService.js';

await connectDatabase();
try {
  const count = await seedLisDemo();
  console.info(`Seeded ${count} synthetic LIS demo records`);
} finally {
  await disconnectDatabase();
}
