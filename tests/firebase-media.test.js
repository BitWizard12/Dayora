import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { backend } from './helpers/backend.js'
import { decodePhoto } from '../server/media.js'
import { recordsRef, userRef } from '../server/firebaseRepositories.js'

const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jOZkAAAAASUVORK5CYII='
test('profile and team pictures use private Storage references with ownership and size/type checks', async (t) => {
  const { account, firebase } = await backend(t), alice = await account('Alice'), bob = await account('Bob')
  assert.throws(() => decodePhoto('data:image/svg+xml;base64,PHN2Zz4='))
  assert.throws(() => decodePhoto('data:image/png;base64,aGVsbG8='))
  assert.throws(() => decodePhoto(`data:image/png;base64,${Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.alloc(2 * 1024 * 1024)]).toString('base64')}`))
  const profile = await alice.send('patch', '/auth/profile', { name: 'Alice', about: '', jobTitle: '', photo: png })
  assert.equal(profile.status, 200, JSON.stringify(profile.body)); const reference = profile.body.user.photo
  assert.match(reference, /^media:/); assert.equal((await userRef(alice.user.id).get()).data().photo, reference)
  const id = reference.slice(6), own = await alice.agent.get(`/api/media/${id}`)
  assert.equal(own.status, 200); assert.match(own.headers['content-type'], /image\/png/); assert.equal(own.headers['cache-control'], 'private, no-store')
  assert.equal((await bob.agent.get(`/api/media/${id}`)).status, 404)
  assert.equal((await bob.send('patch', '/auth/profile', { name: 'Bob', about: '', jobTitle: '', photo: reference })).status, 400)
  const memberId = randomUUID(), team = await alice.send('put', '/workspace/team', { revision: 0, data: [{ id: memberId, name: 'Member', email: 'member@example.com', role: 'Engineer', photo: png }] })
  assert.equal(team.status, 200); assert.match((await recordsRef(alice.user, 'team').doc(memberId).get()).data().photo, /^media:/)
  const objects = await userRef(alice.user.id).collection('media').get()
  for (const object of objects.docs) { const [exists] = await firebase.bucket.file(object.data().object).exists(); assert.equal(exists, true); t.after(() => firebase.bucket.file(object.data().object).delete()) }
})
