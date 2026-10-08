import { photoUrl } from '../services/media'

export default function Avatar({ initials, color = 'sage', small = false, photo }) {
  const style = photo ? { color: 'transparent', backgroundImage: `url("${photoUrl(photo)}")`, backgroundPosition: 'center', backgroundSize: 'cover' } : undefined
  return <span className={`avatar avatar--${color} ${small ? 'avatar--small' : ''}`} style={style}>{initials}</span>
}

