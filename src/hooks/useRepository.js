import { useEffect, useSyncExternalStore } from 'react'

export default function useRepository(repository) {
  const snapshot = useSyncExternalStore(repository.subscribe, repository.getSnapshot)
  useEffect(() => { repository.load().catch(() => {}) }, [repository])
  return snapshot
}
