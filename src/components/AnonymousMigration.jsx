import { useEffect, useState } from 'react'
import Modal from './Modal'
import { inspectAnonymousWorkspace, migrateAnonymousWorkspace } from '../services/anonymousMigration'
import { refreshWorkspace } from '../repositories/workspaceRepositories'

export default function AnonymousMigration() {
  const [preview, setPreview] = useState(null), [open, setOpen] = useState(false), [error, setError] = useState(''), [busy, setBusy] = useState(false), [dismissed, setDismissed] = useState(false)
  useEffect(() => { let active = true; inspectAnonymousWorkspace().then((data) => { if (active && data.total) setPreview(data) }).catch((err) => { if (active) setError(err.message) }); return () => { active = false } }, [])
  if (dismissed || !preview) return null
  return <><div className="migration-notice"><strong>Local workspace found on this device</strong><p>Your account has its own private workspace. You can explicitly import these {preview.total} local records into an empty account workspace.</p><div className="account-actions"><button className="button button--outline button--small" onClick={() => setOpen(true)}>Review local import</button><button className="text-button" onClick={() => setDismissed(true)}>Keep them on this device</button></div></div>{open && <Modal title="Import local workspace" onClose={() => !busy && setOpen(false)}><div className="modal-form"><p>Import into the account currently signed in. This requires an empty account workspace. Your local backups remain on this device. Imported records receive new IDs and account ownership; linked records are remapped together.</p><ul>{Object.entries(preview.collections).map(([collection, rows]) => <li key={collection}>{collection}: {rows.length}</li>)}</ul>{error && <p role="alert">{error}</p>}<button className="button button--primary" disabled={busy} onClick={async () => { setBusy(true); setError(''); try { await migrateAnonymousWorkspace(preview.collections); await refreshWorkspace(); setOpen(false); setDismissed(true) } catch (err) { setError(err.message) } finally { setBusy(false) } }}>Import into my empty workspace</button></div></Modal>}</>
}
