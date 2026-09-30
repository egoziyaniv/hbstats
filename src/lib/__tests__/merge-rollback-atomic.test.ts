jest.mock('@/lib/prisma', () => ({ __esModule: true, default: {} }));

import prisma from '@/lib/prisma';
import { rollbackMerge } from '@/lib/merge-engine';

function setup(options?: { lateEditId?: string; failUpdateId?: string }) {
  let merge: any = {
    id: 'merge',
    status: 'executed',
    snapshotJson: {
      snapshots: [
        { id: 'standing-1', entity: 'standing', action: 'update', original: { points: 0 } },
        { id: 'standing-2', entity: 'standing', action: 'update', original: { points: 1 } },
      ],
    },
    changesJson: {
      applied: [
        { id: 'standing-1', entity: 'standing', fields: { points: 3 } },
        { id: 'standing-2', entity: 'standing', fields: { points: 4 } },
      ],
    },
  };
  let rows: Record<string, any> = {
    'standing-1': { id: 'standing-1', points: options?.lateEditId === 'standing-1' ? 9 : 3 },
    'standing-2': { id: 'standing-2', points: options?.lateEditId === 'standing-2' ? 9 : 4 },
  };

  Object.assign(prisma, {
    standing: {
      findUnique: jest.fn(async ({ where }: any) => rows[where.id] || null),
      update: jest.fn(async ({ where, data }: any) => {
        if (where.id === options?.failUpdateId) throw new Error('forced update failure');
        rows[where.id] = { ...rows[where.id], ...data };
        return rows[where.id];
      }),
    },
    mergeOperation: {
      updateMany: jest.fn(async ({ where, data }: any) => {
        if (merge.status !== where.status) return { count: 0 };
        merge = { ...merge, ...data };
        return { count: 1 };
      }),
      findUnique: jest.fn(async () => merge),
      update: jest.fn(async ({ data }: any) => {
        merge = { ...merge, ...data };
        return merge;
      }),
    },
    $transaction: jest.fn(async (callback: any) => {
      const before = JSON.stringify({ merge, rows });
      try {
        return await callback(prisma);
      } catch (error) {
        ({ merge, rows } = JSON.parse(before));
        throw error;
      }
    }),
  });

  return { merge: () => merge, rows: () => rows };
}

test('does not overwrite a field edited after the merge', async () => {
  const state = setup({ lateEditId: 'standing-2' });

  await expect(rollbackMerge('merge')).rejects.toThrow(/changed after the merge/);

  expect(state.rows()['standing-1'].points).toBe(3);
  expect(state.rows()['standing-2'].points).toBe(9);
  expect(state.merge().status).toBe('executed');
});

test('rolls back earlier writes when a later restore fails', async () => {
  const state = setup({ failUpdateId: 'standing-2' });

  await expect(rollbackMerge('merge')).rejects.toThrow('forced update failure');

  expect(state.rows()['standing-1'].points).toBe(3);
  expect(state.rows()['standing-2'].points).toBe(4);
  expect(state.merge().status).toBe('executed');
});

test('marks a merge rolled back only after every restore succeeds', async () => {
  const state = setup();

  await expect(rollbackMerge('merge')).resolves.toEqual({ reverted: 2, errors: [] });

  expect(state.rows()['standing-1'].points).toBe(0);
  expect(state.rows()['standing-2'].points).toBe(1);
  expect(state.merge().status).toBe('rolled_back');
  expect(state.merge().rolledBackAt).toBeInstanceOf(Date);
});
