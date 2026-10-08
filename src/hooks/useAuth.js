import { createContext, useContext } from 'react'
export const AuthContext = createContext({ user: null })
export default function useAuth() { return useContext(AuthContext) }
