import { Router } from 'express'
import { randomUUID } from 'node:crypto'
import { getFirebase } from './firebaseAdmin.js'
import { userRef, recordsRef } from './firebaseRepositories.js'
import { resolveWorkspace, verifyWorkspaceAccess } from './workspaceAccess.js'
import { ApiError } from './errors.js'
import { z } from 'zod'

export const mediaPattern = /^media:[0-9a-f-]{36}$/
export function decodePhoto(photo) {
  const match = /^data:image\/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/=]+)$/.exec(photo)
  if (!match) throw new ApiError(400, 'INVALID_PHOTO', 'Use a PNG, JPEG, WebP or GIF picture smaller than 2 MB.')
  const bytes = Buffer.from(match[2], 'base64')
  const valid = match[1] === 'png' ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) : match[1] === 'jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 : match[1] === 'gif' ? /^GIF8[79]a$/.test(bytes.subarray(0, 6).toString()) : bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP'
  if (!valid || bytes.length > 2 * 1024 * 1024 || !bytes.length) throw new ApiError(400, 'INVALID_PHOTO', 'Invalid image type or size.')
  return { bytes, type: `image/${match[1]}` }
}
export async function storePhoto(uid, photo) {
  if (!photo) return ''
  if (mediaPattern.test(photo)) {
    if (!(await userRef(uid).collection('media').doc(photo.slice(6)).get()).exists) throw new ApiError(400, 'INVALID_PHOTO', 'Choose a photo owned by this account.')
    return photo
  }
  const { bytes, type } = decodePhoto(photo), { bucket } = getFirebase()
  if (!bucket) throw new ApiError(503, 'STORAGE_UNAVAILABLE', 'Photo storage is not configured.')
  const id = randomUUID(), object = `users/${uid}/images/${id}`
  await bucket.file(object).save(bytes, { resumable: false, metadata: { contentType: type, cacheControl: 'private, no-store' } })
  try { await userRef(uid).collection('media').doc(id).create({ object, contentType: type, size: bytes.length, ownerId: uid, createdAt: Date.now() }) }
  catch (error) { await bucket.file(object).delete().catch(() => {}); throw error }
  return `media:${id}`
}
export async function assertPhotoOwnership(transaction, uid, photo) {
  if (photo && (!mediaPattern.test(photo) || !(await transaction.get(userRef(uid).collection('media').doc(photo.slice(6)))).exists)) throw new ApiError(400, 'INVALID_PHOTO', 'Choose a photo owned by this account.')
}
export function createMediaRoutes(auth) {
  const router = Router()
  router.get('/media/:id', auth.authenticate, async (req, res) => {
    const id = z.uuid().parse(req.params.id)
    let ownerId = req.user.id, snapshot = await userRef(ownerId).collection('media').doc(id).get()
    if (!snapshot.exists && req.query.workspace) {
      const shared = await getFirebase().db.runTransaction(async (tx) => {
        const resolved = await resolveWorkspace(req.user, req.query.workspace, tx)
        await verifyWorkspaceAccess(resolved, tx)
        if (resolved.workspaceType !== 'team') return null
        const linked = await tx.get(recordsRef(resolved, 'team').where('photo', '==', `media:${id}`).limit(1))
        if (linked.empty) return null
        return { ownerId: resolved.workspaceOwnerId, snapshot: await tx.get(userRef(resolved.workspaceOwnerId).collection('media').doc(id)) }
      }, { readOnly: true })
      if (shared) { ownerId = shared.ownerId; snapshot = shared.snapshot }
    }
    if (!snapshot.exists || !getFirebase().bucket) throw new ApiError(404, 'NOT_FOUND', 'Photo not found.')
    const data = snapshot.data()
    if (data.ownerId !== ownerId || !data.object.startsWith(`users/${ownerId}/images/`)) throw new ApiError(404, 'NOT_FOUND', 'Photo not found.')
    const [bytes] = await getFirebase().bucket.file(data.object).download()
    res.set({ 'Content-Type': data.contentType, 'Cache-Control': 'private, no-store', 'Cross-Origin-Resource-Policy': 'same-site' }).send(bytes)
  })
  return router
}
