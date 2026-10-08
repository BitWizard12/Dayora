import { api } from './api.js'

export function createHttpWorkspaceAdapter() {
  let state, loading, queue = Promise.resolve(), closed = false
  const listeners = new Set()
  const collectionOf = (key) => key.split(':').at(-1)
  const publish = (next) => { if (closed || state && next.revision <= state.revision) return; state = next; listeners.forEach((listener) => listener()) }
  const load = () => loading ||= api('/workspace').then((next) => { publish(next); return next }).catch((error) => { loading = null; throw error })
  return {
    remote: true,
    async read(key) { await load(); return { schemaVersion: 1, data: state.collections[collectionOf(key)] || [] } },
    write(key, envelope) {
      const next = queue.then(async () => {
        await load()
        if (closed) throw new Error('This workspace session has ended.')
        try { publish(await api(`/workspace/${collectionOf(key)}`, { method: 'PUT', body: { revision: state.revision, data: envelope.data } })) }
        catch (error) { if (error.code === 'STALE_WORKSPACE') publish(await api('/workspace')); throw error }
        return { schemaVersion: 1, data: state.collections[collectionOf(key)] }
      })
      queue = next.catch(() => {})
      return next
    },
    subscribe(key, listener) { const fn = () => { if (state) listener({ schemaVersion: 1, data: state.collections[collectionOf(key)] || [] }) }; listeners.add(fn); return () => listeners.delete(fn) },
    async refresh() { const next = await api(`/workspace${state ? `?revision=${state.revision}` : ''}`); if (!next.unchanged) publish(next); return state || next },
    async migrate(collections) { await load(); const next = await api('/workspace/migrate', { method: 'POST', body: { revision: state.revision, confirm: 'IMPORT INTO MY EMPTY WORKSPACE', collections } }); publish(next); return next },
    dispose() { closed = true; state = { revision: state?.revision || 0, collections: Object.fromEntries(Object.keys(state?.collections || {}).map((collection) => [collection, []])) }; listeners.forEach((listener) => listener()); listeners.clear(); state = null },
  }
}
