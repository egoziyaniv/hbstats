import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { execFile } from 'child_process';
import {
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  statSync,
  unlinkSync,
} from 'fs';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import path from 'path';

// Upload size ceiling. The box has limited RAM; a multi-GB restore would OOM
// the single pm2 process and take production down mid-import.
const MAX_IMPORT_MB = Number(process.env.DB_IMPORT_MAX_MB || 2048);

// Single-flight: a concurrent second import while one is dropping/restoring
// would corrupt the database. Module-level flag is sufficient for one pm2 proc.
let importInProgress = false;

function findPgTool(name: string): string {
  // Common PostgreSQL install paths on Windows (returned UNQUOTED — execFile
  // passes the path as a literal arg, so quotes would break it).
  const candidates = [
    `C:\\Program Files\\PostgreSQL\\16\\bin\\${name}.exe`,
    `C:\\Program Files\\PostgreSQL\\15\\bin\\${name}.exe`,
    `C:\\Program Files\\PostgreSQL\\14\\bin\\${name}.exe`,
    `C:\\Program Files\\PostgreSQL\\17\\bin\\${name}.exe`,
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return name; // resolve via PATH
}

function parseDatabaseUrl(): { host: string; port: string; user: string; password: string; db: string } {
  const url = process.env.DATABASE_URL || '';
  const m = url.match(/postgresql:\/\/([^:@]+)(?::([^@]*))?@([^:]+):(\d+)\/(.+)/);
  if (!m) throw new Error('Cannot parse DATABASE_URL');
  return { user: m[1], password: m[2] ?? '', host: m[3], port: m[4], db: m[5].split('?')[0] };
}

type PgResult = { code: number; stdout: string; stderr: string; timedOut: boolean };

// Run a pg_* / psql command via execFile (no shell → no command injection from
// DATABASE_URL contents), with the password passed through PGPASSWORD only.
function runPg(tool: string, args: string[], password: string, timeoutMs: number): Promise<PgResult> {
  return new Promise((resolve) => {
    execFile(
      tool,
      args,
      { maxBuffer: 64 * 1024 * 1024, timeout: timeoutMs, env: { ...process.env, PGPASSWORD: password } },
      (error: any, stdout, stderr) => {
        resolve({
          code: error && typeof error.code === 'number' ? error.code : error ? 1 : 0,
          stdout: stdout?.toString() || '',
          stderr: stderr?.toString() || '',
          timedOut: Boolean(error?.killed),
        });
      }
    );
  });
}

function dropAllTablesArgs(db: ReturnType<typeof parseDatabaseUrl>): string[] {
  const dropBlock =
    "DO $$ DECLARE r RECORD; BEGIN FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') " +
    "LOOP EXECUTE 'DROP TABLE IF EXISTS public.' || quote_ident(r.tablename) || ' CASCADE'; END LOOP; END $$;";
  return ['-h', db.host, '-p', db.port, '-U', db.user, '-d', db.db, '-c', dropBlock];
}

// GET — export (download) the entire database as a dump
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const isSql = (searchParams.get('format') || 'dump') === 'sql';

    const db = parseDatabaseUrl();
    const pgDump = findPgTool('pg_dump');
    const tmpDir = path.join(process.cwd(), 'tmp');
    if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true });

    const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const ext = isSql ? 'sql' : 'dump';
    const filename = `hbs_backup_${timestamp}.${ext}`;
    const filepath = path.join(tmpDir, `export_${Date.now()}.${ext}`);

    const base = ['-h', db.host, '-p', db.port, '-U', db.user, '-d', db.db, '--no-owner', '--no-privileges'];
    const args = isSql
      ? [...base, '--clean', '--if-exists', '-f', filepath]
      : [...base, '-Fc', '-f', filepath];

    const result = await runPg(pgDump, args, db.password, 300000);
    if (result.code !== 0) {
      try { unlinkSync(filepath); } catch { /* noop */ }
      console.error('[db-transfer] export failed:', result.stderr || result.stdout);
      return NextResponse.json({ error: 'Export failed' }, { status: 500 });
    }

    const sizeMB = (statSync(filepath).size / 1024 / 1024).toFixed(1);
    // Stream the file to the client. Unlink immediately — on Linux the inode
    // survives until the open read stream closes, so this never buffers the
    // whole dump in memory.
    const readStream = createReadStream(filepath);
    try { unlinkSync(filepath); } catch { /* noop */ }
    const webStream = Readable.toWeb(readStream) as unknown as ReadableStream;

    return new NextResponse(webStream, {
      status: 200,
      headers: {
        'Content-Type': isSql ? 'application/sql' : 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'X-File-Size': `${sizeMB}MB`,
      },
    });
  } catch (error: any) {
    console.error('[db-transfer] export error:', error?.message);
    return NextResponse.json({ error: 'Export failed' }, { status: 500 });
  }
}

// POST — import (restore) a dump, with a pre-import snapshot + auto-rollback
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (importInProgress) {
    return NextResponse.json({ error: 'ייבוא אחר כבר רץ כעת. נסה שוב מאוחר יותר.' }, { status: 409 });
  }

  const db = parseDatabaseUrl();
  const tmpDir = path.join(process.cwd(), 'tmp');
  if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true });

  let importPath: string | null = null;
  let snapshotPath: string | null = null;
  importInProgress = true;

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });

    if (file.size > MAX_IMPORT_MB * 1024 * 1024) {
      return NextResponse.json(
        { error: `הקובץ גדול מדי (מקסימום ${MAX_IMPORT_MB}MB).` },
        { status: 413 }
      );
    }
    const sizeMB = (file.size / 1024 / 1024).toFixed(1);

    // Detect format from the first bytes without buffering the whole file.
    const head = Buffer.from(await file.slice(0, 200).arrayBuffer());
    const isCustomFormat = head.slice(0, 10).toString('utf-8').startsWith('PGDMP');
    const headText = head.toString('utf-8');
    const isSql = !isCustomFormat && (headText.includes('PostgreSQL') || headText.includes('SET '));
    if (!isCustomFormat && !isSql) {
      return NextResponse.json(
        { error: 'File does not appear to be a PostgreSQL dump (.dump or .sql)' },
        { status: 400 }
      );
    }

    // Stream the upload to disk (no second full in-memory copy).
    const ext = isCustomFormat ? '.dump' : '.sql';
    importPath = path.join(tmpDir, `import_${Date.now()}${ext}`);
    await pipeline(Readable.fromWeb(file.stream() as any), createWriteStream(importPath));

    const psql = findPgTool('psql');
    const pgDump = findPgTool('pg_dump');

    // Step 1 — SAFETY NET: snapshot the current DB before touching it. If the
    // snapshot itself fails, abort now rather than drop without a fallback.
    snapshotPath = path.join(tmpDir, `pre_import_snapshot_${Date.now()}.dump`);
    const snap = await runPg(
      pgDump,
      ['-h', db.host, '-p', db.port, '-U', db.user, '-d', db.db, '--no-owner', '--no-privileges', '-Fc', '-f', snapshotPath],
      db.password,
      300000
    );
    if (snap.code !== 0) {
      console.error('[db-transfer] pre-import snapshot failed:', snap.stderr);
      return NextResponse.json(
        { error: 'יצירת גיבוי בטיחות נכשלה — הייבוא בוטל ולא בוצע שינוי.' },
        { status: 500 }
      );
    }

    // Step 2 — drop all tables in public schema.
    await runPg(psql, dropAllTablesArgs(db), db.password, 60000);

    // Step 3 — restore, strict: ON_ERROR_STOP / --exit-on-error make the exit
    // code authoritative, and --single-transaction means a failed restore
    // commits nothing.
    const tool = isCustomFormat ? findPgTool('pg_restore') : psql;
    const restoreArgs = isCustomFormat
      ? ['-h', db.host, '-p', db.port, '-U', db.user, '-d', db.db, '--no-owner', '--no-privileges', '--single-transaction', '--exit-on-error', importPath!]
      : ['-h', db.host, '-p', db.port, '-U', db.user, '-d', db.db, '--single-transaction', '-v', 'ON_ERROR_STOP=1', '-f', importPath!];
    const restore = await runPg(tool, restoreArgs, db.password, 600000);

    if (restore.code !== 0) {
      // Step 4 — AUTO-ROLLBACK from the snapshot.
      console.error('[db-transfer] restore failed, rolling back:', restore.stderr?.slice(0, 1000));
      await runPg(psql, dropAllTablesArgs(db), db.password, 60000);
      const rb = await runPg(
        findPgTool('pg_restore'),
        ['-h', db.host, '-p', db.port, '-U', db.user, '-d', db.db, '--no-owner', '--no-privileges', '--single-transaction', '--exit-on-error', snapshotPath!],
        db.password,
        600000
      );
      if (rb.code !== 0) {
        console.error('[db-transfer] ROLLBACK FAILED — snapshot retained at', snapshotPath, rb.stderr?.slice(0, 1000));
        return NextResponse.json(
          { error: 'הייבוא נכשל ושחזור הגיבוי נכשל. הגיבוי נשמר בשרת — נדרשת התערבות ידנית.', rolledBack: false },
          { status: 500 }
        );
      }
      return NextResponse.json(
        { error: 'הייבוא נכשל — בסיס הנתונים שוחזר אוטומטית למצב הקודם.', rolledBack: true },
        { status: 500 }
      );
    }

    // Success — drop the snapshot to reclaim disk.
    try { if (snapshotPath) unlinkSync(snapshotPath); } catch { /* noop */ }

    return NextResponse.json({
      success: true,
      message: `ייבוא הושלם (${sizeMB}MB, ${isCustomFormat ? 'compressed' : 'SQL'})`,
      format: isCustomFormat ? 'custom' : 'sql',
      fileSize: `${sizeMB}MB`,
    });
  } catch (error: any) {
    console.error('[db-transfer] import error:', error?.message);
    return NextResponse.json({ error: 'הייבוא נכשל.' }, { status: 500 });
  } finally {
    try { if (importPath) unlinkSync(importPath); } catch { /* noop */ }
    importInProgress = false;
  }
}
