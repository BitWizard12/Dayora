import { supabase } from './supabase'

const mapUser = (user) => user ? ({
  id: user.id,
  email: user.email || '',
  name: user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || 'Dayora User',
  photo: user.user_metadata?.avatar_url || '',
  jobTitle: user.user_metadata?.jobTitle || '',
  about: user.user_metadata?.about || '',
  role: 'user',
  workspaceId: user.id,
  activeWorkspaceId: user.id,
  onboardingComplete: true,
  photoUploadsEnabled: false,
}) : null

export const authService = {
  subscribeChanges(listener) {
    const { data } = supabase.auth.onAuthStateChange((_event, session) => listener(mapUser(session?.user)))
    return () => data.subscription.unsubscribe()
  },
  async session() {
    const { data, error } = await supabase.auth.getSession()
    if (error) throw error
    return mapUser(data.session?.user)
  },
  async loginWithGoogle() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
    if (error) throw error
  },
  async logout() {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
  },
  async profile(input) {
    const { data, error } = await supabase.auth.updateUser({
      data: { full_name: input.name, jobTitle: input.jobTitle, about: input.about },
    })
    if (error) throw error
    return mapUser(data.user)
  },
}
