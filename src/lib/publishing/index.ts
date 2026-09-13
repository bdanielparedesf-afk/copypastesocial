/**
 * FASE 10 — Barrel de publishing (IG).
 *
 * Re-exporta el publicador real (7 exports), la cola y los helpers del cron.
 */
export {
  validateCaption,
  getAccessToken,
  getSignedProcessedUrl,
  createContainer,
  getContainerStatus,
  publishContainer,
  publishToInstagram,
  MAX_CAPTION_LENGTH,
  MAX_CONTAINER_ATTEMPTS,
  PROCESSED_BUCKET,
  type ContainerStatus,
  type ContainerStatusCode,
  type PublishRequest,
  type PublishResult,
} from './publisher';

export {
  createPublication,
  processJob,
} from './publication.service';

export {
  assertCanPublish,
} from './rate-limit.service';

export {
  isDuplicate,
} from './idempotency';

export {
  enqueuePost,
  getQueue,
  getDueItems,
  cancelScheduled,
  retryFailed,
  processPost,
  processQueue,
  MAX_PUBLISH_ATTEMPTS,
  CONTAINER_POLL_INTERVAL_MS,
  CONTAINER_POLL_MAX_TICKS,
  type QueueStatus,
  type QueueItem,
  type EnqueuePostOptions,
} from './queue';
