const { spawn } = require('child_process');
const path = require('path');

const root = path.resolve(__dirname, '..');

function start(name, command) {
  console.log(`[${name}] starting: ${command}`);
  const proc = spawn(command, {
    cwd: root,
    stdio: 'inherit',
    shell: true,
    env: process.env,
  });

  proc.on('error', (error) => {
    console.error(`[${name}] spawn error:`, error);
  });
  proc.on('exit', (code, signal) => {
    console.log(`[${name}] exited with ${signal ?? code}`);
    if (signal !== 'SIGTERM' && signal !== 'SIGINT') {
      process.exit(code ?? 1);
    }
  });
  return proc;
}

const server = start('puppeteer-server', 'node --import tsx scripts/puppeteer-server.ts');
const client = start('vite', 'pnpm exec vite dev');

process.on('SIGINT', () => {
  server.kill('SIGINT');
  client.kill('SIGINT');
});
process.on('SIGTERM', () => {
  server.kill('SIGTERM');
  client.kill('SIGTERM');
});
