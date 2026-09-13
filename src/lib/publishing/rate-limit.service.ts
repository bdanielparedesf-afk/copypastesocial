import { checkCanPublish } from '@/lib/accounts/manager';

export async function assertCanPublish(account_id: string): Promise<void> {
  const can = await checkCanPublish(account_id);
  if (!can) {
    const err = new Error('LIMIT_EXCEEDED') as Error & { status?: number };
    err.status = 429;
    throw err;
  }
}
