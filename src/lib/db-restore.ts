export type PgCommandResult = {
  code: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
};

type RestoreStep = () => Promise<PgCommandResult>;

export type RestoreWorkflowResult =
  | { phase: 'restored'; importResult: PgCommandResult }
  | { phase: 'prepare_failed'; prepareResult: PgCommandResult }
  | { phase: 'rolled_back'; importResult: PgCommandResult; rollbackResult: PgCommandResult }
  | { phase: 'rollback_prepare_failed'; importResult: PgCommandResult; prepareResult: PgCommandResult }
  | { phase: 'rollback_failed'; importResult: PgCommandResult; rollbackResult: PgCommandResult };

export async function runRestoreWorkflow(steps: {
  dropBeforeImport: RestoreStep;
  restoreImport: RestoreStep;
  dropBeforeRollback: RestoreStep;
  restoreSnapshot: RestoreStep;
}): Promise<RestoreWorkflowResult> {
  const prepareResult = await steps.dropBeforeImport();
  if (prepareResult.code !== 0) {
    return { phase: 'prepare_failed', prepareResult };
  }

  const importResult = await steps.restoreImport();
  if (importResult.code === 0) {
    return { phase: 'restored', importResult };
  }

  const rollbackPrepareResult = await steps.dropBeforeRollback();
  if (rollbackPrepareResult.code !== 0) {
    return {
      phase: 'rollback_prepare_failed',
      importResult,
      prepareResult: rollbackPrepareResult,
    };
  }

  const rollbackResult = await steps.restoreSnapshot();
  if (rollbackResult.code !== 0) {
    return { phase: 'rollback_failed', importResult, rollbackResult };
  }

  return { phase: 'rolled_back', importResult, rollbackResult };
}
