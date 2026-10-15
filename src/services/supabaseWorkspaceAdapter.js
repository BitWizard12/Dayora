import { supabase } from './supabase'

export function createSupabaseWorkspaceAdapter(userId) {
  const listeners = new Map()
  const collectionOf = (key) => key.split(':').at(-1)
  const notify = (collection, envelope) => {
    for (const listener of listeners.get(collection) || []) listener(envelope)
  }

  return {
    remote: true,
    async read(key) {
      const collection = collectionOf(key)
      const { data, error } = await supabase
        .from('dayora_collections')
        .select('data')
        .eq('user_id', userId)
        .eq('collection', collection)
        .maybeSingle()
      if (error) throw error
      return { schemaVersion: 1, data: Array.isArray(data?.data) ? data.data : [] }
    },
    async write(key, envelope) {
      const collection = collectionOf(key)
      const payload = {
        user_id: userId,
        collection,
        data: envelope.data,
        updated_at: new Date().toISOString(),
      }
      const { data, error } = await supabase
        .from('dayora_collections')
        .upsert(payload, { onConflict: 'user_id,collection' })
        .select('data')
        .single()
      if (error) throw error
      const saved = { schemaVersion: 1, data: Array.isArray(data?.data) ? data.data : [] }
      notify(collection, saved)
      return saved
    },
    subscribe(key, listener) {
      const collection = collectionOf(key)
      if (!listeners.has(collection)) listeners.set(collection, new Set())
      listeners.get(collection).add(listener)
      return () => listeners.get(collection)?.delete(listener)
    },
    async refresh() {
      return true
    },
    dispose() {
      listeners.clear()
    },
  }
}
