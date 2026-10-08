export default function SectionTitle({ title, description, actions }) {
  return <div className="section-title"><div><h1>{title}</h1><p>{description}</p></div>{actions && <div className="section-title__actions">{actions}</div>}</div>
}

