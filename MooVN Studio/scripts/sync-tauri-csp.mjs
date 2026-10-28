import { readFileSync, writeFileSync } from 'node:fs';

const policy = JSON.parse(readFileSync(new URL('../ai-endpoints.json', import.meta.url), 'utf8'));
const configPath = new URL('../src-tauri/tauri.conf.json', import.meta.url);
const config = JSON.parse(readFileSync(configPath, 'utf8'));
const connections = ["'self'", ...policy.externalHttpsHosts.map((host) => `https://${host}`), ...policy.localOllamaOrigins];
const csp = config.app.security.csp;
if (!/(?:^|;)\s*connect-src\s+[^;]*/.test(csp)) throw new Error('Tauri CSP missing connect-src');
const next = csp.replace(/(^|;)\s*connect-src\s+[^;]*/, `$1 connect-src ${connections.join(' ')}`);
if (process.argv.includes('--check')) {
  if (next !== csp) { console.error('Tauri CSP does not match ai-endpoints.json'); process.exit(1); }
} else if (next !== csp) {
  config.app.security.csp = next;
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
}
