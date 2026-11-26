import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { applyIosSafariDocumentFlag } from './utils/iosSafariCompat.ts'
import './index.css'
import App from './App.jsx'

applyIosSafariDocumentFlag()

// Tier 1 Google Maps Platform quota & auth failure listener
if (typeof window !== 'undefined') {
  window.gm_authFailure = () => {
    window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'))
  }
  const origConsoleError = console.error
  console.error = (...args) => {
    origConsoleError.apply(console, args)
    const msg = args.map((a) => String(a)).join(' ')
    if (msg.includes('OverQuotaMapError') || msg.includes('QuotaExceededError')) {
      window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'))
    }
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

