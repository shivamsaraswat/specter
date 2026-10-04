import { describe, expect, it } from 'vitest';
import { parseSessionConfig } from '../src/config.js';

const DAY = 86_400_000;

describe('parseSessionConfig()', () => {
  it('uses the documented defaults when nothing is set', () => {
    expect(parseSessionConfig({})).toEqual({
      sessionMaxLifetimeMs: 30 * DAY,
      sessionIdleTimeoutMs: 7 * DAY,
      signInFailuresPerAccount: 5,
      signInFailuresPerAddress: 50,
      signInBaseWaitMs: 30_000,
      signInMaxWaitMs: 900_000,
      trustProxy: false,
    });
  });

  it.each([
    ['45s', 45_000],
    ['10m', 600_000],
    ['12h', 43_200_000],
    ['2d', 2 * DAY],
  ])('accepts the duration %s', (value, ms) => {
    expect(parseSessionConfig({ SESSION_MAX_LIFETIME: value, SESSION_IDLE_TIMEOUT: '1s' }).sessionMaxLifetimeMs).toBe(ms);
  });

  it('reads every variable', () => {
    const parsed = parseSessionConfig({
      SESSION_MAX_LIFETIME: '10d',
      SESSION_IDLE_TIMEOUT: '2d',
      SIGN_IN_FAILURES_PER_ACCOUNT: '3',
      SIGN_IN_FAILURES_PER_ADDRESS: '20',
      SIGN_IN_BASE_WAIT: '1m',
      SIGN_IN_MAX_WAIT: '1h',
    });
    expect(parsed).toMatchObject({
      sessionMaxLifetimeMs: 10 * DAY,
      sessionIdleTimeoutMs: 2 * DAY,
      signInFailuresPerAccount: 3,
      signInFailuresPerAddress: 20,
      signInBaseWaitMs: 60_000,
      signInMaxWaitMs: 3_600_000,
    });
  });

  describe('TRUST_PROXY', () => {
    it('is false when unset, empty or "false"', () => {
      expect(parseSessionConfig({}).trustProxy).toBe(false);
      expect(parseSessionConfig({ TRUST_PROXY: '' }).trustProxy).toBe(false);
      expect(parseSessionConfig({ TRUST_PROXY: 'false' }).trustProxy).toBe(false);
    });

    it('turns a hop count into a number', () => {
      expect(parseSessionConfig({ TRUST_PROXY: '1' }).trustProxy).toBe(1);
      expect(parseSessionConfig({ TRUST_PROXY: '2' }).trustProxy).toBe(2);
    });

    it('passes an address list through as a string', () => {
      expect(parseSessionConfig({ TRUST_PROXY: '10.0.0.0/8,127.0.0.1' }).trustProxy).toBe('10.0.0.0/8,127.0.0.1');
    });

    it('refuses "true": it would let a client choose its own address', () => {
      expect(() => parseSessionConfig({ TRUST_PROXY: 'true' })).toThrow(/TRUST_PROXY/);
    });
  });

  describe('rejects', () => {
    it.each(['0d', '1w', '1.5h', 'abc', '', '-1d', '10'])('the malformed duration %j without echoing it', (value) => {
      let message = '';
      try {
        parseSessionConfig({ SESSION_MAX_LIFETIME: value || ' ' });
      } catch (err) {
        message = (err as Error).message;
      }
      expect(message).toMatch(/SESSION_MAX_LIFETIME/);
      if (value.trim()) expect(message).not.toContain(value);
    });

    it('an idle timeout greater than the maximum lifetime', () => {
      expect(() => parseSessionConfig({ SESSION_MAX_LIFETIME: '1d', SESSION_IDLE_TIMEOUT: '2d' })).toThrow(
        /SESSION_IDLE_TIMEOUT/,
      );
    });

    it('a max wait shorter than the base wait', () => {
      expect(() => parseSessionConfig({ SIGN_IN_BASE_WAIT: '1m', SIGN_IN_MAX_WAIT: '30s' })).toThrow(/SIGN_IN_MAX_WAIT/);
    });

    it.each([
      ['SIGN_IN_FAILURES_PER_ACCOUNT', '0'],
      ['SIGN_IN_FAILURES_PER_ACCOUNT', '-3'],
      ['SIGN_IN_FAILURES_PER_ACCOUNT', 'many'],
      ['SIGN_IN_FAILURES_PER_ADDRESS', '0'],
      ['SIGN_IN_FAILURES_PER_ADDRESS', '1.5'],
    ])('%s=%s', (name, value) => {
      expect(() => parseSessionConfig({ [name]: value })).toThrow(new RegExp(name));
    });
  });
});
