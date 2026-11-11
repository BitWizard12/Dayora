const messages = {
  VOICE_AI_NOT_CONFIGURED: 'AI rewriting isn’t enabled on the server yet. Your draft is unchanged.',
  VOICE_AUTH_UNAVAILABLE: 'Sign-in verification is temporarily unavailable. Your draft is unchanged.',
  VOICE_AI_TIMEOUT: 'The rewrite took too long. Try again; your draft is unchanged.',
  VOICE_AI_INVALID: 'No complete suggestion came back. Try again; your draft is unchanged.',
  VOICE_AI_FAILED: 'AI rewriting is temporarily unavailable. Try again; your draft is unchanged.',
}

export function createVoiceRewriter({ base = import.meta.env?.VITE_API_URL || '', fetcher = fetch, getAccessToken = async () => {
  const { supabase } = await import('./supabase.js')
  const { data, error } = await supabase.auth.getSession()
  if (error) throw error
  return data.session?.access_token
} } = {}) {
  return async ({ text, style, signal }) => {
    const token = await getAccessToken()
    if (!token) throw new Error('Your session has expired. Sign in again to use AI rewriting.')
    signal?.throwIfAborted()
    const timeout = AbortSignal.timeout(35000)
    let response
    try {
      response = await fetcher(base.replace(/\/$/, '') + '/api/voice/rewrite', {
        method: 'POST', signal: signal ? AbortSignal.any([signal, timeout]) : timeout, credentials: 'omit',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ text, style, consent: true }),
      })
    } catch (error) {
      if (signal?.aborted) throw error
      throw new Error(timeout.aborted ? messages.VOICE_AI_TIMEOUT : 'Unable to connect to AI rewriting. Your draft is unchanged.')
    }
    const result = await response.json().catch(() => ({}))
    if (!response.ok) {
      if (response.status === 401) throw new Error('Your session has expired. Sign in again to use AI rewriting.')
      if (response.status === 429) throw new Error('The rewrite limit was reached. Please try again later. Your draft is unchanged.')
      if (response.status === 404) throw new Error('AI rewriting isn’t available on this server yet. Your draft is unchanged.')
      throw new Error(messages[result.error?.code] || 'Unable to rewrite right now. Your draft is unchanged.')
    }
    if (typeof result.text !== 'string' || !result.text.trim() || result.text.length > 10000) throw new Error(messages.VOICE_AI_INVALID)
    return result.text
  }
}

export const rewriteVoiceText = createVoiceRewriter()
