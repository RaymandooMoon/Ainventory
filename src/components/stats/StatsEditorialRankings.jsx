import { useMemo } from 'react';
import { Award, Clock } from 'lucide-react';
import { formatKRW } from '../../utils/api.ts';
import { localizeBrandName, localizeGarmentName, tx } from '../../utils/i18n.ts';
import { triggerHaptic } from '../../utils/nativeBridge.ts';
import GarmentObject25D from '../GarmentObject25D.jsx';

function computeEffectiveCpw(item) {
  if (Number(item?.cpw) > 0) return Math.round(Number(item.cpw));
  const price = Number(item?.price) || 0;
  const wears = Number(item?.wear_count) || 0;
  if (price <= 0) return 0;
  return wears > 0 ? Math.round(price / wears) : price;
}

export function MostWornRankingCard({
  garments = [],
  lang = 'ko',
  onSelectGarment,
  bentoIndex = 4,
}) {
  const { rankedWorn, maxWears, isLowData } = useMemo(() => {
    const withWears = garments
      .filter((g) => (Number(g.wear_count) || 0) > 0)
      .sort((a, b) => {
        const diff = (Number(b.wear_count) || 0) - (Number(a.wear_count) || 0);
        if (diff !== 0) return diff;
        return computeEffectiveCpw(a) - computeEffectiveCpw(b);
      })
      .slice(0, 5);

    if (withWears.length > 0) {
      const peak = Math.max(1, Number(withWears[0].wear_count) || 1);
      return { rankedWorn: withWears, maxWears: peak, isLowData: false };
    }

    // Low-data preview fallback when garments exist but 0 wear logs so far
    return {
      rankedWorn: garments.slice(0, 3),
      maxWears: 1,
      isLowData: true,
    };
  }, [garments]);

  return (
    <article
      className="stats-bento-card stats-span-6"
      style={{ '--bento-idx': bentoIndex }}
    >
      <div className="stats-card-head">
        <div className="stats-title-stack">
          <span className="stats-eyebrow">
            {tx(lang, '베스트 활용 랭킹', 'SIGNATURE ROTATION RANKING')}
          </span>
          <h2 className="stats-card-title">
            {tx(lang, '베스트 활용 아이템', 'Most Worn Pieces')}
          </h2>
        </div>

        <span className="stats-glass-pill">
          <Award size={13} />
          <span>
            {!isLowData
              ? tx(lang, `TOP ${rankedWorn.length}`, `TOP ${rankedWorn.length}`)
              : tx(lang, '첫 착용 대기', 'FIRST WEAR QUEUE')}
          </span>
        </span>
      </div>

      {garments.length === 0 ? (
        <div className="stats-zero-guide">
          <strong className="stats-zero-title">
            {tx(lang, '시그니처 아이템 랭킹 가이드', 'Signature Rotation Guide')}
          </strong>
          <p className="stats-zero-desc">
            {tx(
              lang,
              '의류를 등록하고 캘린더에 데일리 착장을 기록하면 착용 횟수와 1회당 착용 단가(CPW) 효율 순위가 실시간으로 집계됩니다.',
              'Register garments and log daily outfits in Calendar to rank your highest-velocity pieces and real-time CPW efficiency.'
            )}
          </p>
        </div>
      ) : (
        <div className="stats-rank-list">
          {isLowData && (
            <div className="stats-zero-guide" style={{ padding: '12px 14px' }}>
              <p className="stats-zero-desc">
                {tx(
                  lang,
                  '아직 누적 착용 기록이 없습니다. 아래 보유 아이템을 캘린더에 첫 배정해 활용률을 깨워보세요.',
                  'No wear logs recorded yet. Assign any piece below on the Calendar to start tracking wear velocity.'
                )}
              </p>
            </div>
          )}

          {rankedWorn.map((item, idx) => {
            const wears = Number(item.wear_count) || 0;
            const ratioPct = isLowData ? 14 : Math.max(8, Math.round((wears / maxWears) * 100));
            const cpw = computeEffectiveCpw(item);
            const displayName = localizeGarmentName(item.name, lang);
            const displayBrand = localizeBrandName(item.brand, lang);

            return (
              <button
                key={item.id}
                type="button"
                className="stats-rank-row"
                onClick={() => {
                  triggerHaptic('selection');
                  onSelectGarment?.(item);
                }}
              >
                <span className="stats-rank-idx">
                  {String(idx + 1).padStart(2, '0')}
                </span>

                <div className="stats-rank-thumb">
                  <GarmentObject25D item={item} alt={displayName} padding="11%" />
                </div>

                <div className="stats-rank-info">
                  <div className="stats-rank-name-line">
                    <span className="stats-rank-name">{displayName}</span>
                    {displayBrand && (
                      <span className="stats-rank-brand">· {displayBrand}</span>
                    )}
                  </div>
                  <div className="stats-rank-progress-track">
                    <div
                      className="stats-rank-progress-fill"
                      style={{ width: `${ratioPct}%` }}
                    />
                  </div>
                </div>

                <div className="stats-rank-metrics">
                  <strong className="stats-rank-primary-val">
                    {tx(lang, `${wears}회`, `${wears} wears`)}
                  </strong>
                  <span className="stats-rank-sub-val">
                    {cpw > 0 ? `CPW ${formatKRW(cpw)}` : tx(lang, '활용 중', 'Active')}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </article>
  );
}

export function UnwornSleeperCard({
  garments = [],
  lang = 'ko',
  onSelectGarment,
  bentoIndex = 5,
}) {
  const { sleepers, strictlyUnwornCount } = useMemo(() => {
    const strictlyUnworn = garments.filter((g) => (Number(g.wear_count) || 0) === 0);
    // Sleepers: 0 wears first, then low-rotation items (<= 3 wears), prioritized by higher purchase price
    const candidates = garments
      .filter((g) => (Number(g.wear_count) || 0) <= 3)
      .sort((a, b) => {
        const wearDiff = (Number(a.wear_count) || 0) - (Number(b.wear_count) || 0);
        if (wearDiff !== 0) return wearDiff;
        return (Number(b.price) || 0) - (Number(a.price) || 0);
      })
      .slice(0, 5);

    return {
      sleepers: candidates,
      strictlyUnwornCount: strictlyUnworn.length,
    };
  }, [garments]);

  return (
    <article
      className="stats-bento-card stats-span-6"
      style={{ '--bento-idx': bentoIndex }}
    >
      <div className="stats-card-head">
        <div className="stats-title-stack">
          <span className="stats-eyebrow">
            {tx(lang, '미착용 · 저빈도 큐레이션', 'DORMANT ARCHIVE RADAR')}
          </span>
          <h2 className="stats-card-title">
            {tx(lang, '잠자는 옷장 아이템', 'Unworn Sleeper Archive')}
          </h2>
        </div>

        <span className="stats-glass-pill">
          <Clock size={13} />
          <span>
            {garments.length === 0
              ? tx(lang, '스캔 대기', 'STANDBY')
              : strictlyUnwornCount > 0
                ? tx(lang, `미착용 ${strictlyUnwornCount}점`, `${strictlyUnwornCount} UNWORN`)
                : tx(lang, '순환 양호', 'LOW SLEEPERS')}
          </span>
        </span>
      </div>

      {garments.length === 0 ? (
        <div className="stats-zero-guide">
          <strong className="stats-zero-title">
            {tx(lang, '슬리퍼 아이템 레이더 가이드', 'Sleeper Piece Radar')}
          </strong>
          <p className="stats-zero-desc">
            {tx(
              lang,
              '구매 후 오랫동안 입지 않은 아이템이나 착용 빈도가 낮은 의류를 자동 감지하여 다음 코디에 우선 추천합니다.',
              'Automatically surfaces unworn or low-rotation investment pieces so you can style them into upcoming looks.'
            )}
          </p>
        </div>
      ) : sleepers.length === 0 ? (
        <div className="stats-zero-guide">
          <strong className="stats-zero-title">
            {tx(lang, '잠자는 아이템 제로 달성', '100% Active Wardrobe Rotation')}
          </strong>
          <p className="stats-zero-desc">
            {tx(
              lang,
              '보유 중인 모든 의류가 4회 이상 고르게 착용되고 있습니다. 이상적인 캡슐 옷장 밸런스입니다.',
              'Every garment in your closet has 4+ wears. Your capsule wardrobe is operating at peak efficiency.'
            )}
          </p>
        </div>
      ) : (
        <div className="stats-rank-list">
          {sleepers.map((item, idx) => {
            const wears = Number(item.wear_count) || 0;
            // Progress toward target 10-wear milestone
            const milestonePct = Math.max(6, Math.min(100, Math.round((wears / 10) * 100)));
            const price = Number(item.price) || 0;
            const displayName = localizeGarmentName(item.name, lang);
            const displayBrand = localizeBrandName(item.brand, lang);

            return (
              <button
                key={item.id}
                type="button"
                className="stats-rank-row"
                onClick={() => {
                  triggerHaptic('selection');
                  onSelectGarment?.(item);
                }}
              >
                <span className="stats-rank-idx">
                  {String(idx + 1).padStart(2, '0')}
                </span>

                <div className="stats-rank-thumb">
                  <GarmentObject25D item={item} alt={displayName} padding="11%" />
                </div>

                <div className="stats-rank-info">
                  <div className="stats-rank-name-line">
                    <span className="stats-rank-name">{displayName}</span>
                    {displayBrand && (
                      <span className="stats-rank-brand">· {displayBrand}</span>
                    )}
                  </div>
                  <div className="stats-rank-progress-track">
                    <div
                      className="stats-rank-progress-fill is-muted"
                      style={{ width: `${milestonePct}%` }}
                    />
                  </div>
                </div>

                <div className="stats-rank-metrics">
                  <strong className="stats-rank-primary-val">
                    {wears === 0
                      ? tx(lang, '미착용', 'Unworn')
                      : tx(lang, `${wears}회 착용`, `${wears} wears`)}
                  </strong>
                  <span className="stats-rank-sub-val">
                    {price > 0 ? formatKRW(price) : tx(lang, '코디 추천 대상', 'Ready to style')}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </article>
  );
}
