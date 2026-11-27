import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { isMinigamePathname } from '../minigame/fruitBoxEngine.ts';
import { applyIosSafariDocumentFlag } from '../utils/iosSafariCompat.ts';
import AinvtrySiteApp from './AinvtrySiteApp.tsx';
import './ainvtrySite.css';

const FruitBoxGamePage = lazy(() => import('../minigame/FruitBoxGamePage.tsx'));

applyIosSafariDocumentFlag();

const rootEl = document.getElementById('root');
if (rootEl) {
  const isMiniGameRoute =
    typeof window !== 'undefined' && isMinigamePathname(window.location.pathname);

  createRoot(rootEl).render(
    <StrictMode>
      {isMiniGameRoute ? (
        <Suspense fallback={<div style={{ minHeight: '100dvh', background: '#060410' }} />}>
          <FruitBoxGamePage />
        </Suspense>
      ) : (
        <AinvtrySiteApp />
      )}
    </StrictMode>
  );
}
