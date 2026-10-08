import { afterEach, describe, expect, it, vi } from 'vitest';

// shippedLibrary() loads the rules once. If that fails, the failure is remembered and thrown again, so
// a broken catalog is never half-used and the directory is not read a second time (research #1). The
// real rules/ directory is fine, so reading it is made to fail here.

afterEach(() => {
  vi.doUnmock('node:fs');
  vi.resetModules();
});

describe('shippedLibrary when the rules cannot be read', () => {
  it('throws the same error on every call, and reads the directory once', async () => {
    const readdirSync = vi.fn(() => {
      throw new Error('the rules directory is unreadable');
    });
    vi.resetModules();
    vi.doMock('node:fs', async (importOriginal) => ({
      ...(await importOriginal<typeof import('node:fs')>()),
      readdirSync,
    }));
    const { shippedLibrary } = await import('../src/index.js');

    let first: unknown;
    let second: unknown;
    try {
      shippedLibrary();
    } catch (error) {
      first = error;
    }
    try {
      shippedLibrary();
    } catch (error) {
      second = error;
    }

    expect(first).toBeInstanceOf(Error);
    expect((first as Error).message).toBe('the rules directory is unreadable');
    expect(second).toBe(first);
    expect(readdirSync).toHaveBeenCalledTimes(1);
  });

  it('loads normally once the problem is out of the way, in a fresh process', async () => {
    vi.resetModules();
    const { shippedLibrary } = await import('../src/index.js');
    expect(shippedLibrary().rules.length).toBeGreaterThan(0);
  });
});
