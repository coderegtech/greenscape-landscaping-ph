import { describe, expect, it } from 'vitest';
import { cleanPath, deviceOf, sourceOf } from '../../apps/api/src/modules/analytics/routes.ts';

describe('analytics parsing', () => {
  it('keeps page paths only, without query, hash or trailing slash', () => {
    expect(cleanPath('/shop/golden-pothos?utm=x#top')).toBe('/shop/golden-pothos');
    expect(cleanPath('/services/')).toBe('/services');
    expect(cleanPath('/')).toBe('/');
    for (const bad of ['shop', '/a b', '/<script>', '/api/collect', '/auth/callback', `/${'x'.repeat(130)}`, 42, null]) expect(cleanPath(bad)).toBeNull();
  });

  it('sorts browsers into device types', () => {
    expect(deviceOf('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148')).toBe('mobile');
    expect(deviceOf('Mozilla/5.0 (Linux; Android 14; Pixel 7) Mobile Safari/537.36')).toBe('mobile');
    expect(deviceOf('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)')).toBe('tablet');
    expect(deviceOf('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130')).toBe('desktop');
  });

  it('names external referrers and treats our own hosts as direct', () => {
    const own = ['greenscapelandscapingph.com', 'admin.greenscapelandscapingph.com'];
    expect(sourceOf('https://www.google.com/search?q=landscaping', own)).toBe('google.com');
    expect(sourceOf('https://l.facebook.com/', own)).toBe('l.facebook.com');
    expect(sourceOf('https://www.greenscapelandscapingph.com/shop', own)).toBe('direct');
    expect(sourceOf('', own)).toBe('direct');
    expect(sourceOf('not a url', own)).toBe('direct');
  });
});
