// The name a downloaded report is saved under (research #13): <slug>-report-<YYYY-MM-DD>.<ext>. The slug comes from the
// threat model's name but holds only lower-case letters, digits and hyphens, so the name is safe on every file system
// and in a header. The date is the UTC date of the export instant, the same instant the report's header shows, so the
// two cannot disagree near midnight.
const MAX_SLUG_LENGTH = 60;
const EXTENSIONS = { markdown: 'md', html: 'html' } as const;

export function fileSlug(name: string): string {
  const slug = name
    .normalize('NFKD')
    // NFKD splits an accented letter into the letter and a combining mark; the mark is dropped, not hyphenated.
    .replaceAll(/\p{M}/gu, '')
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH)
    .replaceAll(/-+$/g, '');
  return slug === '' ? 'threat-model' : slug;
}

export function reportFilename(name: string, format: keyof typeof EXTENSIONS, exportedAt: Date): string {
  return `${fileSlug(name)}-report-${exportedAt.toISOString().slice(0, 10)}.${EXTENSIONS[format]}`;
}
