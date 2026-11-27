import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import { isMinigamePathname } from './minigame/fruitBoxEngine.ts'
import { applyIosSafariDocumentFlag } from './utils/iosSafariCompat.ts'
import { registerOfflineMinigameServiceWorker } from './utils/offlineGameBridge.ts'
import './index.css'
import App from './App.jsx'

const FruitBoxGamePage = lazy(() => import('./minigame/FruitBoxGamePage.tsx'))

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
  if (!window.Capacitor?.isNativePlatform?.()) {
    window.addEventListener(
      'load',
      () => {
        void registerOfflineMinigameServiceWorker()
      },
      { once: true }
    )
  }
}

const isMiniGameRoute =
  typeof window !== 'undefined' && isMinigamePathname(window.location.pathname)

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {isMiniGameRoute ? (
      <Suspense fallback={<div style={{ minHeight: '100dvh', background: '#060410' }} />}>
        <FruitBoxGamePage />
      </Suspense>
    ) : (
      <App />
    )}
  </StrictMode>,
)


