import { createContext, useContext } from 'react'

export const WorkspaceContext = createContext({ workspace: { type: 'individual', role: 'owner' }, workspaces: [], members: [], canManage: true })
export default function useWorkspace() { return useContext(WorkspaceContext) }
