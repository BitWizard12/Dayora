import { useEffect, useState } from 'react'
import { loadPrivatePhoto, photoUrl } from '../services/media'

export default function Avatar({ initials, color = 'sage', small = false, photo }) {
  const url = photoUrl(photo), privatePhoto = /^media:/.test(photo || '')
  const [loaded, setLoaded] = useState(null)
  useEffect(() => {
    if (!privatePhoto) return
    const controller = new AbortController()
    let objectUrl
    loadPrivatePhoto(url, { signal: controller.signal }).then((blob) => {
      if (controller.signal.aborted) return
      objectUrl = URL.createObjectURL(blob); setLoaded({ url, objectUrl })
    }).catch(() => { /* Keep initials if private media is unavailable. */ })
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [url, privatePhoto])
  const image = privatePhoto ? loaded?.url === url ? loaded.objectUrl : '' : url
  const style = image ? { color: 'transparent', backgroundImage: `url("${image}")`, backgroundPosition: 'center', backgroundSize: 'cover' } : undefined
  return <span className={`avatar avatar--${color} ${small ? 'avatar--small' : ''}`} style={style}>{initials}</span>
}

