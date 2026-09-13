/**
 * FASE 11 — Barrel de accounts (multi-workspace + límites).
 */
export {
  listAccounts,
  switchAccount,
  getAccountLimits,
  checkCanPublish,
  getAccountsWithExpiringTokens,
  disconnectAccount,
  DAILY_PUBLISH_LIMIT,
  HOURLY_API_LIMIT,
  EXPIRING_TOKEN_DAYS,
  type AccountWithToken,
  type AccountLimits,
  type SwitchAccountResult,
} from './manager';