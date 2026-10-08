import { spawn, execFile } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

const action = process.argv[2] || 'start'
const env = { ...process.env, FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099', FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080', FIREBASE_STORAGE_EMULATOR_HOST: '127.0.0.1:9199', GCLOUD_PROJECT: 'demo-dayora', FIREBASE_CLI_DISABLE_UPDATE_CHECK: 'true', CI: 'true' }
const cached = resolve('.cache/java21')
if (existsSync(cached)) { const name = readdirSync(cached).find((value) => existsSync(join(cached, value, 'bin', process.platform === 'win32' ? 'java.exe' : 'java'))); if (name) env.JAVA_HOME = join(cached, name) }
if (env.JAVA_HOME) { const pathKey = Object.keys(env).find((key) => key.toLowerCase() === 'path') || 'PATH'; env[pathKey] = `${join(env.JAVA_HOME, 'bin')}${process.platform === 'win32' ? ';' : ':'}${env[pathKey] || ''}` }
const command = ['node_modules/firebase-tools/lib/bin/firebase.js', 'emulators:start', '--project', 'demo-dayora', '--only', 'auth,firestore,storage']
let emulator, child
const reachable = async () => { try { const responses = await Promise.all([`http://${env.FIREBASE_AUTH_EMULATOR_HOST}/emulator/v1/projects/demo-dayora/config`, `http://${env.FIRESTORE_EMULATOR_HOST}/`, `http://${env.FIREBASE_STORAGE_EMULATOR_HOST}/v0/b/demo-dayora.appspot.com/o`].map((url) => fetch(url, { signal: AbortSignal.timeout(1000) }))); return responses[0].ok && responses.slice(1).every((response) => response.status < 500) } catch { return false } }
const stop = (process) => { if (!process || process.exitCode !== null || !process.pid) return; if (globalThis.process.platform === 'win32') execFile('taskkill.exe', ['/PID', String(process.pid), '/T', '/F'], { windowsHide: true }, () => {}); else process.kill('SIGTERM') }
const cleanup = () => { stop(child); stop(emulator) }
process.on('SIGINT', cleanup); process.on('SIGTERM', cleanup)
try {
  if (!await reachable()) {
    emulator = spawn(process.execPath, command, { env, stdio: 'inherit', windowsHide: true })
    let exited = false; emulator.once('exit', () => { exited = true })
    for (let index = 0; !await reachable(); index++) { if (exited || index > 180) throw new Error('Firebase emulators did not start. Install Java 21+ and check ports/download access.'); await delay(1000) }
  } else if (process.env.FIREBASE_AUTH_EMULATOR_HOST && process.env.FIREBASE_AUTH_EMULATOR_HOST !== env.FIREBASE_AUTH_EMULATOR_HOST) throw new Error('Conflicting emulator configuration.')
  if (action === 'start') { console.info('Dayora demo emulators ready on localhost; keep this process running.'); if (emulator) await new Promise((done) => emulator.once('exit', done)); else throw new Error('Local emulators are already running.') }
  else {
    if (action === 'accounts') {
      const build = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--mode', 'firebase-test'], { env: { ...env, VITE_FIREBASE_PROJECT_ID: 'demo-dayora', VITE_FIREBASE_API_KEY: 'emulator-public-key', VITE_FIREBASE_AUTH_DOMAIN: 'demo-dayora.firebaseapp.com', VITE_FIREBASE_AUTH_EMULATOR_URL: 'http://127.0.0.1:9099', VITE_API_URL: '' }, stdio: 'inherit', windowsHide: true })
      if (await new Promise((done) => build.once('exit', done)) !== 0) throw new Error('Firebase account-test build failed.')
    }
    const args = action === 'test' ? ['--test', '--test-concurrency=1', ...readdirSync('tests').filter((name) => name.endsWith('.test.js')).map((name) => `tests/${name}`)] : action === 'accounts' ? ['node_modules/@playwright/test/cli.js', 'test', '--config=playwright.phase5.config.js'] : null
    if (!args) throw new Error('Use start, test or accounts.')
    child = spawn(process.execPath, args, { env, stdio: 'inherit', windowsHide: true })
    process.exitCode = await new Promise((done) => child.once('exit', (code) => done(code ?? 1)))
    console.info(`Dayora emulator verification exited with code ${process.exitCode}.`)
  }
} catch (error) { console.error(error.message); process.exitCode = 1 }
finally { if (action !== 'start') cleanup() }
