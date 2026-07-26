import https from 'https';
import { readFileSync } from 'fs';

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter(Boolean)
    .map(l => { const i = l.indexOf('='); return [l.slice(0,i), l.slice(i+1)]; })
);

const url = env.SUPABASE_URL.replace(/\/$/, '') + '/rest/v1/notification_recipients?select=*';
const key = env.SUPABASE_SERVICE_ROLE_KEY;

async function run() {
  return new Promise((resolve, reject) => {
    const options = new URL(url);
    const opts = {
      hostname: options.hostname,
      path: options.pathname + (options.search || ''),
      method: 'GET',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Accept: 'application/json'
      }
    };

    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', (d) => (data += d));
      res.on('end', () => {
        console.log('status', res.statusCode);
        console.log('body', data);
        resolve();
      });
    });
    req.on('error', reject);
    req.end();
  });
}

run().catch((e) => console.error(e));
