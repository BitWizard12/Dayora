import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { ref, getBytes, uploadBytes } from 'firebase/storage'

test('Firestore and Storage deny direct anonymous, owner, foreign-user and admin-claim client access', async (t) => {
  if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080' || process.env.FIREBASE_STORAGE_EMULATOR_HOST !== '127.0.0.1:9199') throw new Error('Rules tests require local demo emulators.')
  const env = await initializeTestEnvironment({ projectId: 'demo-dayora-rules', firestore: { host: '127.0.0.1', port: 8080, rules: await readFile('firestore.rules', 'utf8') }, storage: { host: '127.0.0.1', port: 9199, rules: await readFile('storage.rules', 'utf8') } })
  t.after(() => env.cleanup())
  await env.withSecurityRulesDisabled(async (context) => { await setDoc(doc(context.firestore(), 'users/alice/workspaces/private/tasks/guessable'), { title: 'Private' }) })
  for (const context of [env.unauthenticatedContext(), env.authenticatedContext('alice'), env.authenticatedContext('bob'), env.authenticatedContext('admin', { admin: true, role: 'admin' })]) {
    await assertFails(getDoc(doc(context.firestore(), 'users/alice/workspaces/private/tasks/guessable')))
    await assertFails(setDoc(doc(context.firestore(), 'users/alice'), { role: 'admin' }))
    await assertFails(setDoc(doc(context.firestore(), 'users/bob/workspaces/foreign/tasks/guessable'), { ownerId: 'bob' }))
    const object = ref(context.storage(), 'users/alice/images/guessable')
    await assertFails(uploadBytes(object, new Uint8Array([1, 2, 3])))
    await assertFails(getBytes(object))
  }
})
