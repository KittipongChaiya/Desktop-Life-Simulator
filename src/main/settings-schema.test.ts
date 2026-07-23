/**
 * App-preference schema. Phase-01.8a, categorized per fix/0.1/1.8a.md.
 *
 * The schema is pure and electron-free precisely so these tests exist — the
 * disk I/O around it (`settings.ts`) stays thin and is exercised by E2E.
 */

import { describe, expect, it } from 'vitest';

import {
  OPACITY_DEFAULT_PERCENT,
  OPACITY_MAX_PERCENT,
  OPACITY_MIN_PERCENT,
} from '../shared/constants';

import {
  DEFAULT_SETTINGS,
  effectiveOpacityPercent,
  parseSettings,
  sanitizeOpacityPercent,
  WORK_MODE_OPACITY_PERCENT,
} from './settings-schema';

describe('sanitizeOpacityPercent', () => {
  it('passes through values already on the dial', () => {
    expect(sanitizeOpacityPercent(30)).toBe(30);
    expect(sanitizeOpacityPercent(65)).toBe(65);
    expect(sanitizeOpacityPercent(100)).toBe(100);
  });

  it('clamps to the dial range', () => {
    expect(sanitizeOpacityPercent(0)).toBe(OPACITY_MIN_PERCENT);
    expect(sanitizeOpacityPercent(29)).toBe(OPACITY_MIN_PERCENT);
    expect(sanitizeOpacityPercent(250)).toBe(OPACITY_MAX_PERCENT);
  });

  it('snaps to the 5% step', () => {
    expect(sanitizeOpacityPercent(47)).toBe(45);
    expect(sanitizeOpacityPercent(48)).toBe(50);
    expect(sanitizeOpacityPercent(96.2)).toBe(95);
  });

  it('falls back to the default for anything that is not a finite number', () => {
    expect(sanitizeOpacityPercent(Number.NaN)).toBe(OPACITY_DEFAULT_PERCENT);
    expect(sanitizeOpacityPercent(Number.POSITIVE_INFINITY)).toBe(OPACITY_DEFAULT_PERCENT);
    expect(sanitizeOpacityPercent('60')).toBe(OPACITY_DEFAULT_PERCENT);
    expect(sanitizeOpacityPercent(undefined)).toBe(OPACITY_DEFAULT_PERCENT);
    expect(sanitizeOpacityPercent(null)).toBe(OPACITY_DEFAULT_PERCENT);
  });
});

describe('parseSettings — the categorized application settings model', () => {
  it('round-trips a categorized settings object', () => {
    const settings = {
      overlay: { collapsed: true },
      desktop: { opacityPercent: 60, workMode: true },
    };
    expect(parseSettings(JSON.parse(JSON.stringify(settings)))).toEqual(settings);
  });

  it('returns defaults for non-objects', () => {
    expect(parseSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('collapsed')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings(42)).toEqual(DEFAULT_SETTINGS);
  });

  it('migrates a pre-categorization flat file in place (01.8a wrote these)', () => {
    expect(parseSettings({ collapsed: true, opacityPercent: 60, workMode: true })).toEqual({
      overlay: { collapsed: true },
      desktop: { opacityPercent: 60, workMode: true },
    });
  });

  it('migrates a phase-01 file holding only `collapsed`', () => {
    expect(parseSettings({ collapsed: true })).toEqual({
      overlay: { collapsed: true },
      desktop: { opacityPercent: OPACITY_DEFAULT_PERCENT, workMode: false },
    });
  });

  it('a present category wins over stray flat fields', () => {
    expect(
      parseSettings({
        desktop: { opacityPercent: 40, workMode: false },
        opacityPercent: 90,
        collapsed: true,
      }),
    ).toEqual({
      overlay: { collapsed: true }, // no overlay category — flat fallback applies
      desktop: { opacityPercent: 40, workMode: false },
    });
  });

  it('sanitizes each field inside its category without discarding neighbours', () => {
    expect(
      parseSettings({
        overlay: { collapsed: 'yes' },
        desktop: { opacityPercent: 62, workMode: 1 },
      }),
    ).toEqual({
      overlay: { collapsed: false },
      desktop: { opacityPercent: 60, workMode: false },
    });
  });

  it('ignores unknown categories and fields — future categories stay compatible', () => {
    expect(
      parseSettings({
        overlay: { collapsed: false },
        desktop: { opacityPercent: 100, workMode: false },
        audio: { volume: 0.5 }, // a future category must never break parsing
      }),
    ).toEqual(DEFAULT_SETTINGS);
  });
});

describe('effectiveOpacityPercent', () => {
  it('uses the slider value in normal mode', () => {
    expect(effectiveOpacityPercent({ opacityPercent: 70, workMode: false })).toBe(70);
  });

  it('work mode overrides the slider with the mode constant (ADR-014 §2)', () => {
    expect(effectiveOpacityPercent({ opacityPercent: 70, workMode: true })).toBe(
      WORK_MODE_OPACITY_PERCENT,
    );
    expect(effectiveOpacityPercent({ opacityPercent: 100, workMode: true })).toBe(
      WORK_MODE_OPACITY_PERCENT,
    );
  });

  it('the mode constant sits below the dial floor — a state, not a slider position', () => {
    expect(WORK_MODE_OPACITY_PERCENT).toBeLessThan(OPACITY_MIN_PERCENT);
  });
});
