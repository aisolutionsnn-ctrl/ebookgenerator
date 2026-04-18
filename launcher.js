const { spawn } = require('child_process');
const fs = require('fs');

const log = fs.openSync('/home/z/my-project/dev.log', 'a');
const child = spawn('node', ['node_modules/.bin/next', 'dev', '-p', '3000'], {
  cwd: '/home/z/my-project',
  detached: true,
  stdio: ['ignore', log, log],
  env: { ...process.env }
});

child.unref();
fs.writeFileSync('/home/z/my-project/.next-pid', String(child.pid));
console.log('Launched Next.js with PID:', child.pid);
