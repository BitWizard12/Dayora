import { spawn } from 'node:child_process'
const children = [spawn(process.execPath, ['node_modules/vite/bin/vite.js'], { stdio: 'inherit' }), spawn(process.execPath, ['--watch', '--env-file=server/.env', 'server/index.js'], { stdio: 'inherit' })]
let stopping = false
function stop(code = 0) { if (stopping) return; stopping = true; children.forEach((child) => child.kill()); process.exitCode = code }
children.forEach((child) => { child.on('exit', (code) => stop(code || 0)); child.on('error', () => stop(1)) })
process.on('SIGINT', () => stop())
process.on('SIGTERM', () => stop())
