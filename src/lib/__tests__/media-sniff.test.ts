import { sniffRasterImage, ALLOWED_UPLOAD_MIME } from '@/lib/media-storage';

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
const gif = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0, 0, 0, 0, 0]);
const webp = Buffer.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
const html = Buffer.from('<!DOCTYPE html><script>alert(1)</script>');

describe('sniffRasterImage', () => {
  it('recognises real raster images by magic bytes', () => {
    expect(sniffRasterImage(png)).toBe('.png');
    expect(sniffRasterImage(jpg)).toBe('.jpg');
    expect(sniffRasterImage(gif)).toBe('.gif');
    expect(sniffRasterImage(webp)).toBe('.webp');
  });

  it('rejects SVG/HTML (stored-XSS vectors) and junk', () => {
    expect(sniffRasterImage(svg)).toBeNull();
    expect(sniffRasterImage(html)).toBeNull();
    expect(sniffRasterImage(Buffer.from('not an image'))).toBeNull();
    expect(sniffRasterImage(Buffer.from([0x89]))).toBeNull(); // too short
  });

  it('allowlist excludes svg', () => {
    expect(ALLOWED_UPLOAD_MIME.has('image/png')).toBe(true);
    expect(ALLOWED_UPLOAD_MIME.has('image/svg+xml')).toBe(false);
  });
});
