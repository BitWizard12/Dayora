import { useEffect, useState } from 'react'
import { Copy, KeyRound, UserMinus, Users } from 'lucide-react'
import useWorkspace from '../hooks/useWorkspace'
import { workspaceService } from '../services/workspaceService'
import Modal from './Modal'
import useNow from '../hooks/useNow'
import { accountWorkload } from '../services/team'

export default function TeamMembership({ tasks = [] }) {
  const now = useNow()
  const { workspace, members, canManage, refresh } = useWorkspace()
  const workload = accountWorkload(tasks, members)
  const [invites, setInvites] = useState([]), [freshInvite, setFreshInvite] = useState(null), [removing, setRemoving] = useState(null)
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('')
  const loadInvites = async () => { if (canManage) setInvites(await workspaceService.invites(workspace.id)) }
  useEffect(() => { let active = true; if (canManage) workspaceService.invites(workspace.id).then((rows) => { if (active) setInvites(rows) }).catch((err) => { if (active) setError(err.message) }); return () => { active = false } }, [workspace.id, canManage])
  const run = async (action) => { setBusy(true); setError(''); setMessage(''); try { await action(); await refresh(); await loadInvites() } catch (err) { setError(err.message) } finally { setBusy(false) } }
  if (workspace.type !== 'team') return null
  return <section className="panel membership-panel" aria-label="Account members"><div className="panel-heading"><div><h2><Users size={20} /> Account members</h2><p>Authenticated Dayora accounts with access to {workspace.name}.</p></div><span className="team-tag">{members.length} {members.length === 1 ? 'person' : 'people'}</span></div>
    <div className="account-member-list">{workload.map((member) => <div className="account-member" key={member.id}><span className="workspace-avatar">{member.name[0]}</span><div><strong>{member.name}</strong><span>{member.email}</span><small>{member.pending} open / {member.completed} completed</small></div><b className="role-badge">{member.role}</b>{canManage && member.role !== 'owner' && <button className="icon-btn" disabled={busy} aria-label={`Remove ${member.name}`} onClick={() => setRemoving(member)}><UserMinus size={18} /></button>}</div>)}</div>
    {canManage && <div className="team-owner-tools"><form className="team-invite-form" onSubmit={(event) => { event.preventDefault(); const email = new FormData(event.currentTarget).get('email'); run(async () => setFreshInvite(await workspaceService.invite(workspace.id, email))) }}><label>Invite someone<input name="email" type="email" placeholder="Email address (optional)" maxLength={254} /></label><button className="button button--primary" disabled={busy}><KeyRound size={17} /> Create private invite</button></form>
      {freshInvite && <div className="invite-result" role="status"><strong>Your private invite code</strong><code>{freshInvite.token}</code><p>Share this code directly. It can be used once and expires {new Date(freshInvite.expiresAt).toLocaleDateString('en-IN')}.</p><button className="button button--outline" onClick={async () => { try { await navigator.clipboard.writeText(freshInvite.token); setMessage('Invite code copied.') } catch { setError('Copy the displayed code to share it.') } }}><Copy size={16} /> Copy code</button></div>}
      <details className="invite-history"><summary>Manage invitations</summary>{invites.length ? [...invites].sort((a, b) => b.createdAt - a.createdAt).map((invite) => <div key={invite.id}><span>{invite.email || 'Anyone with the private code'}<small>{invite.revokedAt ? 'Revoked' : invite.usedAt ? 'Used' : invite.expiresAt <= now ? 'Expired' : `Expires ${new Date(invite.expiresAt).toLocaleDateString('en-IN')}`}</small></span>{!invite.revokedAt && !invite.usedAt && invite.expiresAt > now && <button className="button button--outline" disabled={busy} onClick={() => run(async () => { await workspaceService.revoke(workspace.id, invite.id); if (freshInvite?.id === invite.id) setFreshInvite(null) })}>Revoke</button>}</div>) : <p>No invitations yet.</p>}</details>
      <form className="team-invite-form" onSubmit={(event) => { event.preventDefault(); const name = new FormData(event.currentTarget).get('name'); run(async () => { await workspaceService.rename(workspace.id, name); setMessage('Team name saved.') }) }}><label>Workspace name<input name="name" key={workspace.name} defaultValue={workspace.name} required maxLength={100} /></label><button className="button button--outline" disabled={busy}>Save team name</button></form>
    </div>}
    {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    {removing && <Modal title={`Remove ${removing.name}?`} onClose={() => setRemoving(null)}><div className="modal-form"><p>They will lose access to this team. Their personal workspace and saved team work log remain intact.</p><div className="modal-actions"><button className="button button--outline" onClick={() => setRemoving(null)}>Keep member</button><button className="button button--danger" disabled={busy} onClick={() => run(async () => { await workspaceService.removeMember(workspace.id, removing.id); setRemoving(null) })}>Remove from team</button></div></div></Modal>}
  </section>
}
