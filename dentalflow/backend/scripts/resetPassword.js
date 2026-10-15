/**
 * Set a new password for any account from the clinic computer — for when the admin
 * is locked out.
 *
 *   npm run reset-password
 *   npm run reset-password -- --email admin@dental.com --password "NewPass123"
 */
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { connectDB, disconnectDB } from '../src/config/db.js';
import { User } from '../src/models/index.js';
import { audit } from '../src/utils/audit.js';

const arg = (flag) => {
  const i = process.argv.indexOf(flag);
  return i > -1 ? process.argv[i + 1] : undefined;
};

async function main() {
  const rl = readline.createInterface({ input, output });
  try {
    await connectDB();
    const admins = await User.find({ role: 'master', removed_at: null }, 'email name').lean();
    if (admins.length) console.log(`Admin accounts: ${admins.map((a) => a.email).join(', ')}`);
    const email = (arg('--email') || (await rl.question('Email of the account: '))).trim().toLowerCase();
    const user = await User.findOne({ email });
    if (!user) throw new Error(`No account with the email ${email}.`);
    const password = arg('--password') || (await rl.question('New password (at least 6 characters): '));
    if (!password || password.length < 6) throw new Error('Password must be at least 6 characters.');
    await user.changePassword(password);
    user.is_active = true;
    user.removed_at = null;
    await user.save();
    await audit(null, { action: 'auth.password_reset', summary: `Password for ${user.name} was reset on the clinic computer` });
    console.log(`✅ Password changed for ${user.name} (${user.email}). Sign in with the new password.`);
  } finally {
    rl.close();
    await disconnectDB();
  }
}

main().catch((err) => {
  console.error(`❌ ${err.message}`);
  process.exitCode = 1;
});
