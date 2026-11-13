import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFS, allowed, parsePrefs, play, soundFor } from '../../packages/ui/src/notifications/sound-manager.ts';

describe('notification sound settings', () => {
  it('default to off, and repair anything stored badly', () => {
    expect(DEFAULT_PREFS.enabled).toBe(false);
    expect(parsePrefs(null)).toEqual(DEFAULT_PREFS);
    expect(parsePrefs('not json')).toEqual(DEFAULT_PREFS);
    expect(parsePrefs(JSON.stringify({ enabled: 'yes', volume: 7, style: 'siren', importantOnly: 1 }))).toEqual(DEFAULT_PREFS);
    expect(parsePrefs(JSON.stringify({ enabled: true, volume: 0.25, style: 'wood', importantOnly: true }))).toEqual({ enabled: true, volume: 0.25, style: 'wood', importantOnly: true });
  });

  it('only allow a sound when switched on, audible, and (if asked) important', () => {
    const on = { ...DEFAULT_PREFS, enabled: true };
    expect(allowed(DEFAULT_PREFS, { priority: 'URGENT' })).toBe(false);
    expect(allowed({ ...on, volume: 0 }, { priority: 'NORMAL' })).toBe(false);
    expect(allowed(on, { priority: 'NORMAL' })).toBe(true);
    expect(allowed({ ...on, importantOnly: true }, { priority: 'NORMAL' })).toBe(false);
    expect(allowed({ ...on, importantOnly: true }, { priority: 'HIGH' })).toBe(true);
  });

  it('pick a distinct tone for urgent, stock and security items and a brighter one for approvals', () => {
    expect(soundFor({ type: 'order.paid.staff', category: 'orders', priority: 'HIGH' })).toBe('chime');
    expect(soundFor({ type: 'x', category: 'system', priority: 'URGENT' })).toBe('alert');
    expect(soundFor({ type: 'stock.low', category: 'stock', priority: 'NORMAL' })).toBe('alert');
    expect(soundFor({ type: 'user.roles_changed', category: 'account', priority: 'HIGH' })).toBe('alert');
    expect(soundFor({ type: 'leave.approved', category: 'hr', priority: 'HIGH' })).toBe('approval');
    expect(soundFor({ type: 'leave.declined', category: 'hr', priority: 'HIGH' })).toBe('chime');
  });

  it('never plays outside a browser, and never when switched off', async () => {
    expect(await play('chime', { ...DEFAULT_PREFS, enabled: true }, { id: 'a' })).toBe(false); // no window in this test runtime
    expect(await play('chime', DEFAULT_PREFS)).toBe(false);
  });
});
