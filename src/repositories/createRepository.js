export const localScope = Object.freeze({ ownerId: 'local-user', workspaceId: 'local-workspace' })

export function storageKey(scope, collection) {
  return `dayora:v1:${encodeURIComponent(scope.ownerId)}:${encodeURIComponent(scope.workspaceId)}:${collection}`
}

export function createRepository({ collection, scope, adapter, legacyKey, seed = [], migrate = (records) => records }) {
  if (!scope.ownerId || !scope.workspaceId) throw new Error('A repository requires an owner and workspace.')
  scope = Object.freeze({ ...scope })
  const key = storageKey(scope, collection)
  const listeners = new Set()
  let snapshot = { data: [], status: 'idle', error: null }
  let loading
  let queue = Promise.resolve()
  const publish = (next) => { snapshot = next; listeners.forEach((listener) => listener()) }
  const belongs = (record) => (!record.ownerId || record.ownerId === scope.ownerId) && (!record.workspaceId || record.workspaceId === scope.workspaceId)
  const normalize = (records) => {
    const seen = new Set()
    return migrate(records).filter(belongs).map((record) => {
      let id = record.id == null ? crypto.randomUUID() : typeof record.id === 'number' ? `${collection}:${record.id}` : String(record.id)
      if (seen.has(id)) id = crypto.randomUUID()
      seen.add(id)
      return { ...record, id, ...scope, createdAt: record.createdAt ?? null, updatedAt: record.updatedAt ?? record.createdAt ?? null }
    })
  }
  const persist = (records) => adapter.write(key, { schemaVersion: 1, data: records })
  if (adapter.subscribe) adapter.subscribe(key, (saved) => publish({ data: normalize(saved.data), status: 'ready', error: null }))
  const load = () => {
    if (loading) return loading
    publish({ ...snapshot, status: 'loading', error: null })
    loading = (async () => {
      const saved = await adapter.read(key)
      if (saved !== undefined && (saved.schemaVersion !== 1 || !Array.isArray(saved.data))) throw new Error(`Unsupported ${collection} data format.`)
      let records = saved?.data
      if (records === undefined) {
        const legacy = legacyKey ? await adapter.read(legacyKey) : undefined
        records = legacy === undefined ? seed : legacy
      }
      const data = normalize(records)
      // Commit the migration before exposing generated IDs. Legacy keys are retained.
      if (!adapter.remote) await persist(data)
      publish({ data, status: 'ready', error: null })
      return data
    })().catch((error) => { publish({ ...snapshot, status: 'error', error }); throw error })
    return loading
  }
  const transact = (operation) => {
    const next = queue.then(async () => {
      await load()
      let data = normalize(operation(snapshot.data))
      const saved = await persist(data)
      if (adapter.remote && saved) data = normalize(saved.data)
      publish({ data, status: 'ready', error: null })
      return data
    }).catch((error) => { publish({ ...snapshot, error }); throw error })
    queue = next.catch(() => {})
    return next
  }
  const create = async (fields) => {
    const now = Date.now()
    const record = { ...fields, id: crypto.randomUUID(), ...scope, createdAt: now, updatedAt: now }
    const records = await transact((items) => [record, ...items])
    return records.find((item) => item.id === record.id)
  }
  const update = async (id, fields) => {
    const records = await transact((items) => {
      if (!items.some((item) => item.id === id)) throw new Error('Record not found in this workspace.')
      return items.map((item) => item.id === id ? { ...item, ...fields, id: item.id, ...scope, createdAt: item.createdAt, updatedAt: Date.now() } : item)
    })
    return records.find((item) => item.id === id)
  }
  return {
    key, scope, load, transact, create, update,
    async remove(id) { await transact((items) => items.filter((item) => item.id !== id)) },
    async createMany(fields) {
      const now = Date.now()
      const records = fields.map((item) => ({ ...item, id: crypto.randomUUID(), ...scope, createdAt: now, updatedAt: now }))
      await transact((items) => [...records, ...items])
      return records
    },
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
  }
}
