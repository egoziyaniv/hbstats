import { parseArchiveInput, parseArchiveReview, archiveReadWhere, publicArchiveSelect } from '../fan-archive';

const input = { type: 'MEMORY', titleHe: 'המשחק הראשון שלי', bodyHe: 'הזיכרון מהיציע', creditHe: 'אוהד', permissionGranted: true, action: 'submit' };

it('forces submissions to pending and ignores forged publication/author fields', () => {
  const parsed = parseArchiveInput({ ...input, status: 'PUBLISHED', authorId: 'admin', reviewedAt: '2026-01-01' });
  expect(parsed.status).toBe('PENDING');
  expect(parsed).not.toHaveProperty('authorId');
  expect(parsed).not.toHaveProperty('reviewedAt');
});
it('requires permission on submission but permits a private draft without it', () => {
  expect(() => parseArchiveInput({ ...input, permissionGranted: false })).toThrow('הרשאה');
  expect(parseArchiveInput({ ...input, action: 'draft', permissionGranted: false }).status).toBe('DRAFT');
});
it.each(['javascript:alert(1)', 'data:image/png;base64,x', '//example.com/x', 'https://user:password@example.com/x'])('rejects unsafe external URL %s', (imageUrl) => {
  expect(() => parseArchiveInput({ ...input, imageUrl })).toThrow();
});
it('rejects invalid dates and oversized plain text', () => {
  expect(() => parseArchiveInput({ ...input, eventDate: '2026-02-30' })).toThrow();
  expect(() => parseArchiveInput({ ...input, titleHe: 'א'.repeat(161) })).toThrow();
});
it('requires a rejection reason and an explicit moderation decision', () => {
  expect(() => parseArchiveReview({ action: 'reject', reviewNoteHe: ' ' })).toThrow();
  expect(() => parseArchiveReview({ status: 'PUBLISHED' })).toThrow();
  expect(parseArchiveReview({ action: 'reject', reviewNoteHe: 'נדרש מקור' })).toMatchObject({ action: 'reject', reviewNoteHe: 'נדרש מקור' });
});
it('never expands public visibility without authenticated owner/admin context', () => {
  expect(archiveReadWhere('a', null)).toEqual({ id: 'a', status: 'PUBLISHED', permissionGranted: true });
  expect(archiveReadWhere('a', { id: 'u', role: 'USER' })).toEqual({ id: 'a', OR: [{ status: 'PUBLISHED', permissionGranted: true }, { authorId: 'u' }] });
  expect(archiveReadWhere('a', { id: 'u', role: 'ADMIN' })).toEqual({ id: 'a' });
  expect(publicArchiveSelect).not.toHaveProperty('authorId');
  expect(publicArchiveSelect).not.toHaveProperty('reviewNoteHe');
});
