import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import SessionGate from './components/SessionGate.jsx'
import './styles/application.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <SessionGate />
  </StrictMode>,
)
