#!/usr/bin/env node
// Stand-in for `cloudflared access ssh --hostname <host>` in the local test environment.
// Same command line as the real binary; instead of Cloudflare it pipes stdin/stdout to
// FAKE_CLOUDFLARED_TARGET (default 127.0.0.1:2222, the test sshd from scripts/dev-env.sh).
import { connect } from 'node:net';

const args = process.argv.slice(2);
const i = args.indexOf('--hostname');
if (args[0] !== 'access' || args[1] !== 'ssh' || i === -1 || !args[i + 1]) {
  process.stderr.write('usage: cloudflared access ssh --hostname <host>\n');
  process.exit(2);
}
if (args[i + 1].startsWith('fail.')) {
  process.stderr.write(`failed to connect to origin: ${args[i + 1]}\n`);
  process.exit(1);
}

const [host, port] = (process.env.FAKE_CLOUDFLARED_TARGET ?? '127.0.0.1:2222').split(':');
const socket = connect(Number(port), host);
process.stdin.pipe(socket);
socket.pipe(process.stdout);
socket.on('error', (err) => {
  process.stderr.write(`failed to connect to origin: ${err.message}\n`);
  process.exit(1);
});
socket.on('close', () => process.exit(0));
