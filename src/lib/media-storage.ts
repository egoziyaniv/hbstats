import { mkdir, writeFile } from 'fs/promises';
import path from 'path';

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function extensionFromContentType(contentType: string | null) {
  if (!contentType) return '.jpg';
  if (contentType.includes('png')) return '.png';
  if (contentType.includes('webp')) return '.webp';
  if (contentType.includes('svg')) return '.svg';
  return '.jpg';
}

// Sniff the real image type from the file's magic bytes — never trust the
// client-supplied MIME type or filename. Returns null for anything that isn't a
// supported raster image (notably SVG/XML/HTML, which can carry <script> and
// would be a stored-XSS vector when served from our origin).
export function sniffRasterImage(buffer: Buffer): '.png' | '.jpg' | '.webp' | '.gif' | null {
  if (buffer.length < 12) return null;
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return '.png';
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return '.jpg';
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) return '.gif';
  if (
    buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 && // 'RIFF'
    buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50 // 'WEBP'
  ) return '.webp';
  return null;
}

export const ALLOWED_UPLOAD_MIME = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif']);

function extensionFromUrl(url: string) {
  try {
    const pathname = new URL(url).pathname;
    const ext = path.extname(pathname);
    return ext && ext.length <= 5 ? ext : null;
  } catch {
    return null;
  }
}

async function saveRemoteFile(remoteUrl: string, targetRelativePath: string) {
  const response = await fetch(remoteUrl, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Failed to download media: ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const baseDir = path.resolve(process.cwd(), 'public', 'uploads');
  const absolutePath = path.resolve(process.cwd(), 'public', targetRelativePath);

  // Prevent path traversal
  if (!absolutePath.startsWith(baseDir)) {
    throw new Error('Invalid file path');
  }

  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, buffer);

  return `/${targetRelativePath.replace(/\\/g, '/')}`;
}

async function saveBufferFile(buffer: Buffer, targetRelativePath: string) {
  const baseDir = path.resolve(process.cwd(), 'public', 'uploads');
  const absolutePath = path.resolve(process.cwd(), 'public', targetRelativePath);

  // Prevent path traversal
  if (!absolutePath.startsWith(baseDir)) {
    throw new Error('Invalid file path');
  }

  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, buffer);

  return `/${targetRelativePath.replace(/\\/g, '/')}`;
}

export async function storeTeamLogoLocally({
  remoteUrl,
  seasonYear,
  teamId,
  teamName,
}: {
  remoteUrl: string | null | undefined;
  seasonYear: number;
  teamId: number | string;
  teamName: string;
}) {
  if (!remoteUrl) return null;

  try {
    const probe = await fetch(remoteUrl, { method: 'HEAD', cache: 'no-store' });
    const ext =
      extensionFromUrl(remoteUrl) ||
      extensionFromContentType(probe.headers.get('content-type'));

    return await saveRemoteFile(
      remoteUrl,
      path.join('uploads', 'teams', String(seasonYear), `${teamId}-${slugify(teamName)}${ext}`)
    );
  } catch {
    return remoteUrl;
  }
}

export async function storePlayerPhotoLocally({
  remoteUrl,
  seasonYear,
  teamName,
  playerId,
  playerName,
}: {
  remoteUrl: string | null | undefined;
  seasonYear: number;
  teamName: string;
  playerId: number | string;
  playerName: string;
}) {
  if (!remoteUrl) return null;

  try {
    const probe = await fetch(remoteUrl, { method: 'HEAD', cache: 'no-store' });
    const ext =
      extensionFromUrl(remoteUrl) ||
      extensionFromContentType(probe.headers.get('content-type'));

    return await saveRemoteFile(
      remoteUrl,
      path.join(
        'uploads',
        'players',
        String(seasonYear),
        slugify(teamName),
        `${playerId}-${slugify(playerName)}${ext}`
      )
    );
  } catch {
    return remoteUrl;
  }
}

export async function storeUploadedImage({
  file,
  entityType,
  seasonYear,
  folderName,
  entityId,
  label,
}: {
  file: File;
  entityType: 'teams' | 'players' | 'venues' | 'games';
  seasonYear?: number | null;
  folderName: string;
  entityId: string;
  label: string;
}) {
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  // Trust the bytes, not the filename/MIME: reject anything that isn't a real
  // raster image (blocks SVG/HTML stored-XSS) and derive the extension from the
  // sniffed type so a file named *.svg can't be written as such.
  const ext = sniffRasterImage(buffer);
  if (!ext) {
    throw new Error('Unsupported image type. Allowed: PNG, JPEG, WebP, GIF.');
  }
  const safeName = `${Date.now()}-${slugify(label || entityId)}${ext}`;
  const relativePath =
    entityType === 'venues'
      ? path.join('uploads', entityType, slugify(folderName || entityId), `${entityId}-${safeName}`)
      : path.join(
          'uploads',
          entityType,
          String(seasonYear || 'shared'),
          slugify(folderName || entityId),
          `${entityId}-${safeName}`
        );

  return saveBufferFile(buffer, relativePath);
}
