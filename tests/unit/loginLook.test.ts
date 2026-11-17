import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DEFAULT_LOGIN_LOOK,
  LOGIN_LOOK_META,
  computeIntroShift,
  nextLoginLook,
  parseLoginLook,
  resolveInitialLoginPhase,
  resolveLoginLook,
} from '../../src/services/loginLook.ts';

describe('Login looks (DESIGN.md v4 Maison / Runway)', () => {
  it('parses canonical names and lookbook indices', () => {
    assert.equal(parseLoginLook('maison'), 'maison');
    assert.equal(parseLoginLook(' RUNWAY '), 'runway');
    assert.equal(parseLoginLook('1'), 'maison');
    assert.equal(parseLoginLook('02'), 'runway');
    assert.equal(parseLoginLook('neon'), null);
    assert.equal(parseLoginLook(undefined), null);
  });

  it('prefers the URL, then storage, then the default', () => {
    assert.equal(resolveLoginLook('?look=2', 'maison'), 'runway');
    assert.equal(resolveLoginLook('?auth=1', 'runway'), 'runway');
    assert.equal(resolveLoginLook('', 'garbage'), DEFAULT_LOGIN_LOOK);
    assert.equal(resolveLoginLook('', null), DEFAULT_LOGIN_LOOK);
  });

  it('cycles looks and exposes lookbook metadata', () => {
    assert.equal(nextLoginLook('maison'), 'runway');
    assert.equal(nextLoginLook('runway'), 'maison');
    assert.equal(LOGIN_LOOK_META.maison.index, '01');
    assert.equal(LOGIN_LOOK_META.runway.index, '02');
  });

  it('skips the intro for reduced motion or a seen session', () => {
    assert.equal(
      resolveInitialLoginPhase({ prefersReducedMotion: false, introSeenThisSession: false }),
      'intro'
    );
    assert.equal(
      resolveInitialLoginPhase({ prefersReducedMotion: true, introSeenThisSession: false }),
      'form'
    );
    assert.equal(
      resolveInitialLoginPhase({ prefersReducedMotion: false, introSeenThisSession: true }),
      'form'
    );
  });

  it('computes the shift that centers the logo slot in the viewport', () => {
    assert.equal(computeIntroShift(800, 100, 80), 260);
    assert.equal(computeIntroShift(800, 360, 80), 0);
    assert.equal(computeIntroShift(Number.NaN, 0, 0), 0);
  });
});
