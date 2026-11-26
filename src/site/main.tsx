import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { applyIosSafariDocumentFlag } from '../utils/iosSafariCompat.ts';
import AinvtrySiteApp from './AinvtrySiteApp.tsx';
import './ainvtrySite.css';

applyIosSafariDocumentFlag();

const rootEl = document.getElementById('root');
if (rootEl) {
  createRoot(rootEl).render(
    <StrictMode>
      <AinvtrySiteApp />
    </StrictMode>
  );
}
