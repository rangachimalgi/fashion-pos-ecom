import https from 'https';

function pingServer() {
  // Falls back to pinging itself — update KEEPALIVE_URL in Render env vars to your app's URL
  const url = process.env.KEEPALIVE_URL || 'http://localhost:3000/api/keepalive';

  https.get(url, { timeout: 10000 }, (res) => {
    console.log(`[keepalive] ${new Date().toISOString()} — status: ${res.statusCode}`);
    res.on('data', () => {});
    res.on('end', () => {});
  }).on('error', (e) => {
    console.error(`[keepalive] ping failed: ${e.message}`);
  }).on('timeout', function(this: ReturnType<typeof https.get>) {
    this.destroy();
    console.error(`[keepalive] ping timed out`);
  });
}

export function startKeepAlive() {
  if (process.env.NODE_ENV !== 'production') return; // only run in production

  // Wait 30s after boot before first ping
  setTimeout(pingServer, 30_000);

  // Then ping every 14 minutes (Render spins down at 15min)
  setInterval(pingServer, 14 * 60 * 1000);

  console.log('✅ KeepAlive started — pinging every 14 minutes');
}
