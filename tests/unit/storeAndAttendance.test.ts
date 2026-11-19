import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ATTENDANCE_DAILY_REWARD_I,
  ATTENDANCE_STREAK_30_BONUS_I,
  ATTENDANCE_STREAK_7_BONUS_I,
  DEFAULT_NAV_OPACITY,
  DEFAULT_STAGE_BACKGROUND_ID,
  DUPLICATE_REFUND_I,
  STAGE_BACKGROUNDS,
  STORE_DRAW_COST_I,
  TIER_DROP_RATES,
  claimDailyAttendance,
  clampNavOpacity,
  createInitialEconomyState,
  getBaseStageTier,
  getEligibleGachaPool,
  hasFreeDailyDrawRemaining,
  isPlusStageTier,
  isPlusTierEligibleForDraw,
  pickWeightedStageBackground,
  rollBackgroundGacha,
  shiftDateKeyDays,
  tierToCssSlug,
} from '../../src/utils/stageBackgroundCatalog.ts';

describe('Stage Background Catalog, Gacha & Attendance Economy', () => {
  it('assigns + tiers (S+, A+, B+) to all roofless outdoor backgrounds and base tiers to indoor ones summing to 100% family weight', () => {
    assert.equal(STAGE_BACKGROUNDS.length, 14);

    const byExactTier: Record<string, number> = {
      'S+': 0,
      S: 0,
      'A+': 0,
      A: 0,
      'B+': 0,
      B: 0,
      C: 0,
    };
    const weightByBaseTier = { S: 0, A: 0, B: 0, C: 0 };
    let totalWeight = 0;

    for (const bg of STAGE_BACKGROUNDS) {
      byExactTier[bg.tier] += 1;
      const base = getBaseStageTier(bg.tier);
      weightByBaseTier[base] += bg.weight;
      totalWeight += bg.weight;

      if (bg.isOutdoor) {
        assert.equal(
          isPlusStageTier(bg.tier),
          true,
          `Expected roofless outdoor background ${bg.id} to have + tier, got ${bg.tier}`
        );
      } else {
        assert.equal(
          isPlusStageTier(bg.tier),
          false,
          `Expected roofed indoor background ${bg.id} to have base tier, got ${bg.tier}`
        );
      }
    }

    assert.equal(byExactTier['S+'], 1);
    assert.equal(byExactTier.S, 1);
    assert.equal(byExactTier['A+'], 2);
    assert.equal(byExactTier.A, 1);
    assert.equal(byExactTier['B+'], 3);
    assert.equal(byExactTier.B, 2);
    assert.equal(byExactTier.C, 4);
    assert.equal(totalWeight, 100);
    assert.equal(weightByBaseTier.S, TIER_DROP_RATES.S);
    assert.equal(weightByBaseTier.A, TIER_DROP_RATES.A);
    assert.equal(weightByBaseTier.B, TIER_DROP_RATES.B);
    assert.equal(weightByBaseTier.C, TIER_DROP_RATES.C);

    assert.equal(tierToCssSlug('B+'), 'b-plus');
    assert.equal(tierToCssSlug('A+'), 'a-plus');
    assert.equal(tierToCssSlug('S+'), 's-plus');
    assert.equal(tierToCssSlug('B'), 'b');

    const outdoorIds = STAGE_BACKGROUNDS.filter((b) => b.isOutdoor).map((b) => b.id).sort();
    const indoorIds = STAGE_BACKGROUNDS.filter((b) => !b.isOutdoor).map((b) => b.id);
    assert.deepEqual(outdoorIds, [
      'a_hannam_terrace_outdoor',
      'a_sunset_rooftop',
      'b_brick_courtyard',
      'b_seoul_plaza_outdoor',
      'b_stone_courtyard_outdoor',
      's_palais_royal_outdoor',
    ]);
    assert.equal(indoorIds.length, 8);
    assert.equal(indoorIds.includes('a_hannam_flagship'), true);
    assert.equal(indoorIds.includes('c_atelier_plaster'), true);

    const init = createInitialEconomyState();
    assert.equal(init.equippedBackgroundId, DEFAULT_STAGE_BACKGROUND_ID);
    assert.deepEqual(init.unlockedIds, [DEFAULT_STAGE_BACKGROUND_ID]);
    const defaultBg = STAGE_BACKGROUNDS.find((b) => b.id === DEFAULT_STAGE_BACKGROUND_ID);
    assert.equal(defaultBg?.tier, 'C');
    assert.equal(defaultBg?.isDefaultUnlocked, true);
    assert.equal(defaultBg?.isOutdoor, false);
  });

  it('gates B+, A+, and S+ gacha drops until all base backgrounds of the same letter are collected', () => {
    const init = createInitialEconomyState();
    assert.equal(isPlusTierEligibleForDraw('B+', init.unlockedIds), false);
    assert.equal(isPlusTierEligibleForDraw('A+', init.unlockedIds), false);
    assert.equal(isPlusTierEligibleForDraw('S+', init.unlockedIds), false);

    // Before collecting base tiers, eligible gacha pool contains ZERO + tier backgrounds
    const initialPool = getEligibleGachaPool(init.unlockedIds);
    assert.equal(initialPool.some((bg) => isPlusStageTier(bg.tier)), false);
    for (let i = 0; i < 100; i += 1) {
      const picked = pickWeightedStageBackground(() => i / 100, init.unlockedIds);
      assert.equal(isPlusStageTier(picked.tier), false);
    }

    // Unlocking only 1 of the 2 base B backgrounds STILL keeps B+ locked
    const oneBaseB = ['c_atelier_plaster', 'b_seoul_cafe_terrace'];
    assert.equal(isPlusTierEligibleForDraw('B+', oneBaseB), false);
    for (let r = 20; r < 55; r += 1) {
      const pickedB = pickWeightedStageBackground(() => r / 100, oneBaseB);
      assert.equal(pickedB.tier, 'B');
    }

    // Unlocking ALL base B backgrounds ('b_seoul_cafe_terrace' + 'b_minimal_loft_window') unlocks B+ in gacha!
    const allBaseB = ['c_atelier_plaster', 'b_seoul_cafe_terrace', 'b_minimal_loft_window'];
    assert.equal(isPlusTierEligibleForDraw('B+', allBaseB), true);
    assert.equal(isPlusTierEligibleForDraw('A+', allBaseB), false);
    assert.equal(isPlusTierEligibleForDraw('S+', allBaseB), false);

    const pickedBPlus = pickWeightedStageBackground(() => 0.48, allBaseB);
    assert.equal(pickedBPlus.tier, 'B+');
    assert.equal(pickedBPlus.isOutdoor, true);

    const bPlusGacha = rollBackgroundGacha(
      { ...init, unlockedIds: allBaseB },
      '2026-11-18',
      () => 0.48
    );
    assert.equal(bPlusGacha.ok, true);
    assert.equal(bPlusGacha.background.tier, 'B+');
    assert.equal(bPlusGacha.isNewUnlock, true);

    // Unlocking base A ('a_hannam_flagship') unlocks A+, and base S ('s_paris_atelier') unlocks S+
    const withBaseA = [...allBaseB, 'a_hannam_flagship'];
    assert.equal(isPlusTierEligibleForDraw('A+', withBaseA), true);
    assert.equal(pickWeightedStageBackground(() => 0.16, withBaseA).tier, 'A+');

    const withBaseS = [...withBaseA, 's_grand_paris_atelier'];
    assert.equal(isPlusTierEligibleForDraw('S+', withBaseS), true);
    assert.equal(pickWeightedStageBackground(() => 0.025, withBaseS).tier, 'S+');
  });

  it('uses 1 free daily draw, then costs 10 i per paid draw, equips new unlocks, and refunds 5 i on duplicates', () => {
    const today = '2026-11-17';
    const s0 = createInitialEconomyState();
    assert.equal(hasFreeDailyDrawRemaining(s0, today), true);

    // 1) Free daily draw hits base S-tier at rng=0.01 (first 3% family weight, S+ gated)
    const freeRes = rollBackgroundGacha(s0, today, () => 0.01);
    assert.equal(freeRes.ok, true);
    assert.equal(freeRes.usedFreeDraw, true);
    assert.equal(freeRes.costI, 0);
    assert.equal(freeRes.background.tier, 'S');
    assert.equal(freeRes.isNewUnlock, true);
    assert.equal(freeRes.nextState.equippedBackgroundId, freeRes.background.id);
    assert.equal(hasFreeDailyDrawRemaining(freeRes.nextState, today), false);

    // 2) Second draw on same day with 0 i fails cleanly
    const blocked = rollBackgroundGacha(freeRes.nextState, today, () => 0.5);
    assert.equal(blocked.ok, false);
    assert.equal(blocked.reason, 'insufficient_i');

    // 3) Give 10 i and draw an already unlocked C-tier default -> refunds 5 i
    const funded = { ...freeRes.nextState, iBalance: STORE_DRAW_COST_I };
    const pickedDefault = pickWeightedStageBackground(() => 0.56, funded.unlockedIds);
    assert.equal(pickedDefault.id, DEFAULT_STAGE_BACKGROUND_ID);

    const dupRes = rollBackgroundGacha(funded, today, () => 0.56);
    assert.equal(dupRes.ok, true);
    assert.equal(dupRes.usedFreeDraw, false);
    assert.equal(dupRes.costI, STORE_DRAW_COST_I);
    assert.equal(dupRes.isNewUnlock, false);
    assert.equal(dupRes.refundI, DUPLICATE_REFUND_I);
    assert.equal(dupRes.nextState.iBalance, DUPLICATE_REFUND_I);
  });

  it('awards +10 i daily attendance, +50 i 7-day consecutive bonus, and +200 i 30-day consecutive bonus', () => {
    let state = createInitialEconomyState();
    let day = '2026-10-01';

    for (let streak = 1; streak <= 30; streak += 1) {
      const res = claimDailyAttendance(state, day);
      assert.equal(res.ok, true);
      assert.equal(res.newStreak, streak);
      assert.equal(res.dailyRewardI, ATTENDANCE_DAILY_REWARD_I);

      if (streak % 7 === 0) {
        assert.equal(res.streak7BonusI, ATTENDANCE_STREAK_7_BONUS_I);
      } else {
        assert.equal(res.streak7BonusI, 0);
      }
      if (streak === 30) {
        assert.equal(res.streak30BonusI, ATTENDANCE_STREAK_30_BONUS_I);
        assert.equal(res.totalAwardedI, ATTENDANCE_DAILY_REWARD_I + ATTENDANCE_STREAK_30_BONUS_I);
      }

      // Same-day duplicate claim is rejected cleanly
      const sameDayRetry = claimDailyAttendance(res.nextState, day);
      assert.equal(sameDayRetry.ok, false);
      assert.equal(sameDayRetry.alreadyClaimed, true);

      state = res.nextState;
      day = shiftDateKeyDays(day, 1);
    }

    // Total over 30 consecutive days:
    // 30*10 (300) + 4*50 (7,14,21,28 = 200) + 200 (day 30) = 700 i
    assert.equal(state.iBalance, 700);
    assert.equal(state.attendanceStreak, 30);

    // Skipping a day resets streak back to 1
    const skippedDay = shiftDateKeyDays(day, 1);
    const resetRes = claimDailyAttendance(state, skippedDay);
    assert.equal(resetRes.ok, true);
    assert.equal(resetRes.newStreak, 1);
  });

  it('defaults bottom navigation bar opacity to 50% (0.5) and clamps custom settings values', () => {
    assert.equal(DEFAULT_NAV_OPACITY, 0.5);
    assert.equal(clampNavOpacity(undefined), 0.5);
    assert.equal(clampNavOpacity(0.5), 0.5);
    assert.equal(clampNavOpacity(0.02), 0.15);
    assert.equal(clampNavOpacity(1.4), 1.0);
  });

  it('supports default todayDateKey argument on hasFreeDailyDrawRemaining(state)', () => {
    const fresh = createInitialEconomyState();
    assert.equal(hasFreeDailyDrawRemaining(fresh), true);
    const drawToday = rollBackgroundGacha(fresh);
    assert.equal(drawToday.ok, true);
    assert.equal(hasFreeDailyDrawRemaining(drawToday.nextState), false);
    const checkInToday = claimDailyAttendance(drawToday.nextState);
    assert.equal(checkInToday.ok, true);
    assert.equal(checkInToday.dailyRewardI, ATTENDANCE_DAILY_REWARD_I);
  });
});
