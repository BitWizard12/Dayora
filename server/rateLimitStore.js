import { createHash } from 'node:crypto'
import { getFirebase } from './firebaseAdmin.js'

export class FirestoreRateLimitStore {
  localKeys = false
  constructor(prefix) { this.prefix = prefix }
  init({ windowMs }) { this.windowMs = windowMs }
  key(value) { return `${this.prefix}-${createHash('sha256').update(value).digest('hex')}` }
  async increment(key) {
    const { db } = getFirebase(), ref = db.collection('rateLimits').doc(this.key(key))
    return db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref), now = Date.now(), previous = snapshot.data()
      const expired = !previous || previous.expiresAt.toMillis() <= now
      const totalHits = expired ? 1 : previous.hits + 1, resetTime = expired ? new Date(now + this.windowMs) : previous.expiresAt.toDate()
      transaction.set(ref, { hits: totalHits, expiresAt: resetTime })
      return { totalHits, resetTime }
    }, { maxAttempts: 5 })
  }
  async decrement(key) { const { db } = getFirebase(), ref = db.collection('rateLimits').doc(this.key(key)); await db.runTransaction(async (transaction) => { const row = await transaction.get(ref); if (row.exists && row.data().hits > 0) transaction.update(ref, { hits: row.data().hits - 1 }) }) }
  async resetKey(key) { await getFirebase().db.collection('rateLimits').doc(this.key(key)).delete() }
}
export const rateLimitStore = (config, prefix) => config.RATE_LIMIT_STORE === 'firestore' ? new FirestoreRateLimitStore(prefix) : undefined
