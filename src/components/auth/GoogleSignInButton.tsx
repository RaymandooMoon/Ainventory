import { forwardRef } from 'react';
import { Loader2 } from 'lucide-react';

export interface GoogleSignInButtonProps {
  id?: string;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  lang?: string;
  className?: string;
}

/**
 * Official Google Sign-In Button component compliant with Google Identity Guidelines
 * and Ainventory DESIGN.md v3 Tailored Atelier specification:
 * - Official 4-color G SVG (18px, paths: #4285F4, #34A853, #FBBC05, #EA4335, never recolored)
 * - Light: #FFFFFF bg, 1px #747775 border, #1F1F1F text (16.48:1 contrast)
 * - Dark: #131314 bg, 1px #8E918F border, #E3E3E3 text (14.47:1 contrast)
 * - Min-height 48px, pill (border-radius: 9999px), 48x48dp touch target
 * - Focus-visible ring, disabled / loading state (aria-busy) without width jitter
 */
const GoogleSignInButton = forwardRef<HTMLButtonElement, GoogleSignInButtonProps>(
  (
    {
      id = 'google-sign-in-btn',
      onClick,
      disabled = false,
      loading = false,
      lang = 'ko',
      className = '',
    },
    ref
  ) => {
    const isEn = lang === 'en';
    const label = isEn ? 'Continue with Google' : 'Google 계정으로 로그인';

    return (
      <button
        ref={ref}
        id={id}
        type="button"
        className={`atelier-google-btn ${className}`}
        disabled={disabled || loading}
        aria-busy={loading}
        aria-label={label}
        onClick={onClick}
      >
        <div className="atelier-google-btn-inner">
          {loading ? (
            <Loader2 size={18} className="atelier-spin" aria-hidden="true" />
          ) : (
            <svg
              className="atelier-google-icon"
              width="18"
              height="18"
              viewBox="0 0 18 18"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
              focusable="false"
            >
              <path
                fill="#4285F4"
                d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.616z"
              />
              <path
                fill="#34A853"
                d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
              />
              <path
                fill="#FBBC05"
                d="M3.964 10.707c-.18-.54-.282-1.117-.282-1.707s.102-1.167.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z"
              />
              <path
                fill="#EA4335"
                d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 7.293C4.672 5.166 6.656 3.58 9 3.58z"
              />
            </svg>
          )}
          <span className="atelier-google-label">{loading ? (isEn ? 'Connecting...' : '연결 중...') : label}</span>
        </div>
      </button>
    );
  }
);

GoogleSignInButton.displayName = 'GoogleSignInButton';

export default GoogleSignInButton;
