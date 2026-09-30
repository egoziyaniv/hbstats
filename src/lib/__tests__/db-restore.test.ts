import { runRestoreWorkflow } from '@/lib/db-restore';

const ok = { code: 0, stdout: '', stderr: '', timedOut: false };
const failed = { code: 1, stdout: '', stderr: 'boom', timedOut: false };

function steps(overrides: Partial<Parameters<typeof runRestoreWorkflow>[0]> = {}) {
  return {
    dropBeforeImport: jest.fn().mockResolvedValue(ok),
    restoreImport: jest.fn().mockResolvedValue(ok),
    dropBeforeRollback: jest.fn().mockResolvedValue(ok),
    restoreSnapshot: jest.fn().mockResolvedValue(ok),
    ...overrides,
  };
}

describe('runRestoreWorkflow', () => {
  test('does not restore the import when initial cleanup fails', async () => {
    const workflow = steps({ dropBeforeImport: jest.fn().mockResolvedValue(failed) });

    await expect(runRestoreWorkflow(workflow)).resolves.toMatchObject({ phase: 'prepare_failed' });
    expect(workflow.restoreImport).not.toHaveBeenCalled();
    expect(workflow.dropBeforeRollback).not.toHaveBeenCalled();
    expect(workflow.restoreSnapshot).not.toHaveBeenCalled();
  });

  test('returns restored without invoking rollback steps', async () => {
    const workflow = steps();

    await expect(runRestoreWorkflow(workflow)).resolves.toMatchObject({ phase: 'restored' });
    expect(workflow.dropBeforeRollback).not.toHaveBeenCalled();
    expect(workflow.restoreSnapshot).not.toHaveBeenCalled();
  });

  test('restores the snapshot after an import failure', async () => {
    const workflow = steps({ restoreImport: jest.fn().mockResolvedValue(failed) });

    await expect(runRestoreWorkflow(workflow)).resolves.toMatchObject({ phase: 'rolled_back' });
    expect(workflow.dropBeforeRollback).toHaveBeenCalledTimes(1);
    expect(workflow.restoreSnapshot).toHaveBeenCalledTimes(1);
  });

  test('does not restore a snapshot when rollback cleanup fails', async () => {
    const workflow = steps({
      restoreImport: jest.fn().mockResolvedValue(failed),
      dropBeforeRollback: jest.fn().mockResolvedValue(failed),
    });

    await expect(runRestoreWorkflow(workflow)).resolves.toMatchObject({ phase: 'rollback_prepare_failed' });
    expect(workflow.restoreSnapshot).not.toHaveBeenCalled();
  });

  test('reports a failed snapshot restore', async () => {
    const workflow = steps({
      restoreImport: jest.fn().mockResolvedValue(failed),
      restoreSnapshot: jest.fn().mockResolvedValue(failed),
    });

    await expect(runRestoreWorkflow(workflow)).resolves.toMatchObject({ phase: 'rollback_failed' });
  });
});
