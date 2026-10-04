import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Checks the *built* app, so it runs after `pnpm build` (the verify:build script), not with
// `pnpm test`. It fails, rather than skipping, when dist is missing: a check that silently passes
// without a build proves nothing. The CSP has no exceptions (FR-022), so the build may not contain
// anything that needs one: no inline script or style, and no data: URIs.
const DIST = fileURLToPath(new URL('../dist/', import.meta.url));

function readIndex(): string {
  if (!fs.existsSync(`${DIST}index.html`)) throw new Error('apps/web/dist/index.html is missing: run pnpm build first');
  return fs.readFileSync(`${DIST}index.html`, 'utf8');
}

function assets(extension: string): { file: string; text: string }[] {
  const dir = `${DIST}assets/`;
  if (!fs.existsSync(dir)) throw new Error('apps/web/dist/assets is missing: run pnpm build first');
  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith(extension))
    .map((file) => ({ file, text: fs.readFileSync(`${dir}${file}`, 'utf8') }));
}

describe('built index.html', () => {
  it('has no inline script', () => {
    const scripts = [...readIndex().matchAll(/<script\b([^>]*)>/gi)];
    expect(scripts.length).toBeGreaterThan(0);
    for (const [, attributes] of scripts) expect(attributes).toMatch(/\bsrc=/);
  });

  it('has no <style> element and no style attribute', () => {
    const html = readIndex();
    expect(html).not.toMatch(/<style\b/i);
    expect(html).not.toMatch(/\sstyle=/i);
  });

  it('has no data: URI', () => {
    expect(readIndex()).not.toMatch(/=\s*["']data:/i);
  });

  it('loads everything from its own origin through root-relative paths', () => {
    const html = readIndex();
    const urls = [...html.matchAll(/\s(?:src|href)=["']([^"']+)["']/gi)].map((m) => m[1] ?? '');
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) expect(url, url).toMatch(/^\/(?!\/)/);
  });
});

describe('built assets', () => {
  // Bare "data:" is not checked: minified code uses it as an object key.
  it('contain no data: URI in CSS', () => {
    const css = assets('.css');
    expect(css.length).toBeGreaterThan(0);
    for (const { file, text } of css) expect(text, file).not.toMatch(/url\(\s*["']?data:/i);
  });

  it('contain no data: URI literal in JS', () => {
    const js = assets('.js');
    expect(js.length).toBeGreaterThan(0);
    for (const { file, text } of js) expect(text, file).not.toMatch(/["'`]data:(image|font|application)\//i);
  });
});
