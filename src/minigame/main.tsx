import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import FruitBoxGamePage from './FruitBoxGamePage.tsx';

const rootEl = document.getElementById('root');
if (rootEl) {
  createRoot(rootEl).render(
    <StrictMode>
      <FruitBoxGamePage />
    </StrictMode>
  );
}
