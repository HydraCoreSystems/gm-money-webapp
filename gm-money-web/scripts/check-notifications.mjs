import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const envPath = process.cwd() + '/.env.local';
const env = Object.fromEntries(
  readFileSync(envPath, 'utf8')
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => {
      const idx = l.indexOf('=');
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()];
    })
);

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { db: { schema: 'gm_money' } });

async function main() {
  try {
    const { data, error, status } = await supabase.from('notification_recipients').select('*').limit(1);
    console.log('status', status);
    if (error) console.error('error', error.message, error.details);
    else console.log('data', data);
  } catch (err) {
    console.error(err);
  }
}

main();
