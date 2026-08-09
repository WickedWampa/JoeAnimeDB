const path = require('path');
const { spawn } = require('child_process');

const env = { ...process.env };

if (!String(env.JOEANIMEDB_USER_DATA || '').trim() && process.platform === 'win32' && env.APPDATA) {
  env.JOEANIMEDB_USER_DATA = path.join(env.APPDATA, 'joeanime-db-4');
}

const windows = process.platform === 'win32';
const command = windows ? (env.ComSpec || env.COMSPEC || 'cmd.exe') : 'npm';
const args = windows
  ? ['/d', '/s', '/c', 'npm run dev:inner']
  : ['run', 'dev:inner'];

const child = spawn(command, args, {
  cwd: path.join(__dirname, '..'),
  env,
  stdio: 'inherit',
  windowsHide: false
});

child.on('error', (error) => {
  console.error('Could not start JoeAnimeDB development mode.', error);
  process.exitCode = 1;
});

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exitCode = Number(code || 0);
});
