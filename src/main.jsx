import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import SessionGate from './components/SessionGate.jsx'
import './styles/refinement.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <SessionGate />
  </StrictMode>,
)
