import { useCallback, useState } from 'react'
import useRepository from './useRepository'
import { workspaceRepositories } from '../repositories/workspaceRepositories'

// Compatibility bridge for existing appearance/profile controls.
// Core workspace entities use explicit repositories and domain commands.
export default function useSavedState(key, fallback, migrate) {
  const [repository] = useState(() => workspaceRepositories.valueRepository(key, fallback, migrate))
  const snapshot = useRepository(repository)
  const setValue = useCallback((value) => { repository.setValue(value).catch((error) => console.error('Unable to save preferences', error)) }, [repository])
  return [snapshot.data[0]?.value ?? fallback, setValue]
}
