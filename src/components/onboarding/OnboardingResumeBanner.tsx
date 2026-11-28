import { ArrowRight } from 'lucide-react';
import type { UserProfile } from '../../contracts/carbonDesignContract.ts';
import { tx } from '../../utils/i18n.ts';
import { triggerHaptic } from '../../utils/nativeBridge.ts';
import './onboardingAtelier.css';

interface OnboardingResumeBannerProps {
  user: UserProfile | null | undefined;
  garmentCount: number;
  lang?: string;
  onResume: () => void;
}

export default function OnboardingResumeBanner({
  user,
  garmentCount,
  lang = 'ko',
  onResume,
}: OnboardingResumeBannerProps) {
  const completedCount = Math.min(4, Math.max(0, Number(user?.onboarding?.completedCount ?? 0)));
  const totalSteps = Number(user?.onboarding?.totalSteps ?? 4);
  const subtitle =
    garmentCount === 0
      ? tx(
          lang,
          '맞춤 스타터 캡슐 6벌을 담으면 바로 가상 피팅을 시작할 수 있어요',
          'Add your tailored 6-piece starter capsule to try on right away'
        )
      : tx(
          lang,
          '체형과 피부톤 설정을 마치면 맞춤 코디 정확도가 높아집니다',
          'Finish your body and skin profile for tailored outfit styling'
        );

  return (
    <div
      className="ob-resume-banner-wrap"
      data-testid="onboarding-resume-banner"
      role="region"
      aria-label={tx(lang, '온보딩 설정 이어하기', 'Continue Atelier Setup')}
    >
      <div className="ob-resume-banner">
        <div className="ob-resume-left">
          <span className="ob-resume-ring" aria-hidden="true">
            {completedCount}/{totalSteps}
          </span>
          <div className="ob-resume-copy">
            <span className="ob-resume-title">
              {tx(lang, '아틀리에 초기 설정 이어하기', 'Finish Your Atelier Setup')}
            </span>
            <span className="ob-resume-desc">{subtitle}</span>
          </div>
        </div>
        <button
          id="onboarding-resume-banner-btn"
          type="button"
          className="ob-resume-btn"
          onClick={() => {
            triggerHaptic('selection');
            onResume();
          }}
        >
          <span>{tx(lang, '이어하기', 'Continue')}</span>
          <ArrowRight size={13} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
