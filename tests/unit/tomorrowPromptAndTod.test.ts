import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  formatWeatherCapsuleDateTime,
  getLocalDateKey,
  resolveTimeOfDayPhase,
  shouldShowTomorrowOutfitPrompt,
} from '../../src/utils/tomorrowPromptPolicy.ts';

describe('Galaxy Weather Time-of-Day, Date/Time Capsule & After-8PM Tomorrow Prompt Policy', () => {
  it('resolves sunrise, day, sunset, and night phases cleanly across 24 hours', () => {
    const dummyDate = new Date(2026, 10, 17, 12, 0, 0);
    assert.equal(resolveTimeOfDayPhase(dummyDate, 4.0), 'night');
    assert.equal(resolveTimeOfDayPhase(dummyDate, 6.25), 'sunrise');
    assert.equal(resolveTimeOfDayPhase(dummyDate, 12.5), 'day');
    assert.equal(resolveTimeOfDayPhase(dummyDate, 18.0), 'sunset');
    assert.equal(resolveTimeOfDayPhase(dummyDate, 21.5), 'night');
    assert.equal(resolveTimeOfDayPhase(dummyDate, 23.75), 'night');
  });

  it('formats weather capsule date, weekday, and time accurately for Today and Tomorrow', () => {
    // Tuesday Nov 17 2026, 20:15
    const tuesdayEvening = new Date(2026, 10, 17, 20, 15, 0);
    assert.equal(formatWeatherCapsuleDateTime(tuesdayEvening, 'today', 'ko'), '오늘 11.17(화) 20:15');
    assert.equal(
      formatWeatherCapsuleDateTime(tuesdayEvening, 'tomorrow', 'ko'),
      '내일 11.18(수) 20:15'
    );
    assert.equal(formatWeatherCapsuleDateTime(tuesdayEvening, 'today', 'en'), '11/17(Tue) 20:15');
    assert.equal(
      formatWeatherCapsuleDateTime(tuesdayEvening, 'tomorrow', 'en'),
      'Tmrw 11/18(Wed) 20:15'
    );
    assert.equal(getLocalDateKey(tuesdayEvening), '2026-11-17');
  });

  it('triggers after-8PM tomorrow outfit prompt ONLY when generated today, hour >= 20, dayTarget === today, and shownCount < 3', () => {
    const todayStr = '2026-11-17';

    // Eligible: 20:00+, generated today, shown < 3, currently viewing today weather
    assert.equal(
      shouldShowTomorrowOutfitPrompt({
        hour: 20,
        todayDateStr: todayStr,
        lastGeneratedDateStr: todayStr,
        shownCount: 0,
        dayTarget: 'today',
      }),
      true
    );
    assert.equal(
      shouldShowTomorrowOutfitPrompt({
        hour: 23,
        todayDateStr: todayStr,
        lastGeneratedDateStr: todayStr,
        shownCount: 2,
        dayTarget: 'today',
      }),
      true
    );

    // Blocked when shownCount reaches 3
    assert.equal(
      shouldShowTomorrowOutfitPrompt({
        hour: 21,
        todayDateStr: todayStr,
        lastGeneratedDateStr: todayStr,
        shownCount: 3,
        dayTarget: 'today',
      }),
      false
    );

    // Blocked before 20:00 (e.g. 19:59)
    assert.equal(
      shouldShowTomorrowOutfitPrompt({
        hour: 19,
        todayDateStr: todayStr,
        lastGeneratedDateStr: todayStr,
        shownCount: 0,
        dayTarget: 'today',
      }),
      false
    );

    // Blocked if no outfit was generated today
    assert.equal(
      shouldShowTomorrowOutfitPrompt({
        hour: 21,
        todayDateStr: todayStr,
        lastGeneratedDateStr: '2026-11-16',
        shownCount: 0,
        dayTarget: 'today',
      }),
      false
    );
    assert.equal(
      shouldShowTomorrowOutfitPrompt({
        hour: 21,
        todayDateStr: todayStr,
        lastGeneratedDateStr: null,
        shownCount: 0,
        dayTarget: 'today',
      }),
      false
    );

    // Blocked if already viewing tomorrow weather
    assert.equal(
      shouldShowTomorrowOutfitPrompt({
        hour: 21,
        todayDateStr: todayStr,
        lastGeneratedDateStr: todayStr,
        shownCount: 0,
        dayTarget: 'tomorrow',
      }),
      false
    );
  });
});
