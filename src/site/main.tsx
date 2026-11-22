import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import AinvtrySiteApp from './AinvtrySiteApp.tsx';
import './ainvtrySite.css';

const rootEl = document.getElementById('root');
if (rootEl) {
  createRoot(rootEl).render(
    <StrictMode>
      <AinvtrySiteApp />
    </StrictMode>
  );
}
