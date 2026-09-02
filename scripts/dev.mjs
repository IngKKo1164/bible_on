import { spawn } from 'node:child_process';
import path from 'node:path';

const root = process.cwd();
const children = [
  spawn(process.execPath, [path.join(root, 'server', 'dev-server.mjs')], {
    cwd: root,
    env: process.env,
    stdio: 'inherit',
  }),
  spawn(process.execPath, [
    path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'),
    '--host',
    '0.0.0.0',
  ], {
    cwd: root,
    env: process.env,
    stdio: 'inherit',
  }),
];

let stopping = false;
function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  children.forEach((child) => {
    if (!child.killed) child.kill('SIGTERM');
  });
  process.exitCode = exitCode;
}

children.forEach((child) => {
  child.on('error', () => stop(1));
  child.on('exit', (code, signal) => {
    if (!stopping && (code !== 0 || signal)) stop(code ?? 1);
  });
});
process.once('SIGINT', () => stop(0));
process.once('SIGTERM', () => stop(0));
