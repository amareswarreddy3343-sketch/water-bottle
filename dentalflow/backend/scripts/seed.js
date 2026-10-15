/**
 * Seed the three default accounts (same as the old backend/seed.py).
 *   npm run seed
 * All accounts use the password: Admin@123
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { connectDB, disconnectDB } from '../src/config/db.js';
import { User } from '../src/models/index.js';

const USERS = [
  {
    email: 'admin@dental.com',
    name: 'Admin User',
    role: 'master',
    password: 'Admin@123',
    can_edit_complaints: true,
    is_staff: true,
    is_superuser: true,
  },
  {
    email: 'doctor@dental.com',
    name: 'Dr. Sharma',
    role: 'doctor',
    password: 'Admin@123',
    can_edit_complaints: true,
  },
  {
    email: 'reception@dental.com',
    name: 'Reception Desk',
    role: 'receptionist',
    password: 'Admin@123',
    can_edit_complaints: false,
  },
];

export async function seed({ quiet = false } = {}) {
  for (const { password, ...data } of USERS) {
    let user = await User.findOne({ email: data.email });
    const created = !user;
    if (!user) user = new User(data);
    else user.set(data); // update_or_create
    await user.setPassword(password);
    await user.save();
    if (!quiet) console.log(`${created ? 'Created' : 'Updated'}: ${user.email} (${user.role})`);
  }
  if (!quiet) console.log('\n✅ Seed complete — all accounts use password: Admin@123');
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  connectDB()
    .then(() => seed())
    .catch((err) => {
      console.error('❌ Seed failed:', err.message);
      process.exitCode = 1;
    })
    .finally(() => disconnectDB());
}
