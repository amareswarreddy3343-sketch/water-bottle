/**
 * Create a Master (admin) account — replacement for `python manage.py createsuperuser`.
 *
 *   npm run create-admin
 *   npm run create-admin -- --email admin@clinic.com --name "Clinic Admin" --password "S3cret!"
 */
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { connectDB, disconnectDB } from '../src/config/db.js';
import { User } from '../src/models/index.js';
import { parseEmail } from '../src/utils/validation.js';

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i > -1 ? process.argv[i + 1] : undefined;
}

async function main() {
  const rl = readline.createInterface({ input, output });
  try {
    const email = (argValue('--email') || (await rl.question('Email address: '))).trim().toLowerCase();
    parseEmail(email);
    const name = (argValue('--name') || (await rl.question('Name: '))).trim();
    if (name.length < 2) throw new Error('Name must be at least 2 characters.');
    const password = argValue('--password') || (await rl.question('Password (min 6 characters): '));
    if (!password || password.length < 6) throw new Error('Password must be at least 6 characters.');

    await connectDB();
    if (await User.exists({ email })) throw new Error('User with this email already exists.');

    const user = await User.createUser({
      email,
      name,
      role: 'master',
      password,
      can_edit_complaints: true,
      is_staff: true,
      is_superuser: true,
    });
    console.log(`✅ Master account created: ${user.email}`);
  } finally {
    rl.close();
    await disconnectDB();
  }
}

main().catch((err) => {
  console.error(`❌ ${err.message}`);
  process.exitCode = 1;
});
