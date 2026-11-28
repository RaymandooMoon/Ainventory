import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { applyIosSafariDocumentFlag } from '../utils/iosSafariCompat.ts';
import '../index.css';
import App from '../App.jsx';

applyIosSafariDocumentFlag();

if (typeof window !== 'undefined') {
  const winRecord = window as unknown as Record<string, unknown>;
  winRecord.gm_authFailure = () => {
    window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
  };
  const origConsoleError = console.error;
  console.error = (...args: unknown[]) => {
    origConsoleError.apply(console, args);
    const msg = args.map((a) => String(a)).join(' ');
    if (msg.includes('OverQuotaMapError') || msg.includes('QuotaExceededError')) {
      window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
    }
  };
}

const rootEl = document.getElementById('root');
if (rootEl) {
  createRoot(rootEl).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}
