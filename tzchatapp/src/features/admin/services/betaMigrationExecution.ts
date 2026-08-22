export const BETA_MIGRATION_CONFIRMATION = 'BETA_TO_BASIC'

type MigrationPost = (payload: {
  dryRun: boolean
  confirmation?: string
}) => Promise<unknown>

export async function runBetaMigration(options: {
  dryRun: boolean
  requestConfirmation: () => Promise<string | null>
  post: MigrationPost
}): Promise<{ executed: boolean; reason?: 'cancelled' | 'mismatch'; response?: unknown }> {
  if (options.dryRun) {
    return { executed: true, response: await options.post({ dryRun: true }) }
  }

  const confirmation = await options.requestConfirmation()
  if (confirmation === null) return { executed: false, reason: 'cancelled' }
  if (confirmation !== BETA_MIGRATION_CONFIRMATION) {
    return { executed: false, reason: 'mismatch' }
  }

  return {
    executed: true,
    response: await options.post({
      dryRun: false,
      confirmation: BETA_MIGRATION_CONFIRMATION,
    }),
  }
}
