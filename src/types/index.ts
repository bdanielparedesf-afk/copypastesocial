import { z } from 'zod';

export const PROVIDER_IDS = {
  INSTAGRAM: 'instagram',
  YOUTUBE: 'youtube',
  FACEBOOK: 'facebook',
  TIKTOK: 'tiktok',
} as const;

export type ProviderId = (typeof PROVIDER_IDS)[keyof typeof PROVIDER_IDS];

export const PROVIDER_LIST: ProviderId[] = [
  PROVIDER_IDS.INSTAGRAM,
  PROVIDER_IDS.YOUTUBE,
  PROVIDER_IDS.FACEBOOK,
  PROVIDER_IDS.TIKTOK,
];

export interface SourceProvider {
  id: ProviderId;
  label: string;
  shortLabel: string;
  icon: string;
  color: string;
  hostnamePatterns: readonly string[];
  api: {
    type: 'rest' | 'graphql' | 'oembed' | 'html';
    baseUrl: string;
    auth: 'oauth2' | 'api_key' | 'none';
  };
  capabilities: {
    canDownload: boolean;
    canReadProfile: boolean;
    canReadPosts: boolean;
    canReadComments: boolean;
    canReadStories: boolean;
    canReadReels: boolean;
  };
}

export enum AuditStatus {
  CHECKING = 'CHECKING',
  ACCESSIBLE = 'ACCESSIBLE',
  PRIVATE = 'PRIVATE',
  UNAVAILABLE = 'UNAVAILABLE',
  UNSUPPORTED = 'UNSUPPORTED',
  AUTH_REQUIRED = 'AUTH_REQUIRED',
  API_RESTRICTED = 'API_RESTRICTED',
  ERROR = 'ERROR',
}

export const AUDIT_STATUS_LABELS: Record<AuditStatus, string> = {
  [AuditStatus.CHECKING]: 'Comprobando acceso',
  [AuditStatus.ACCESSIBLE]: 'Fuente accesible',
  [AuditStatus.PRIVATE]: 'Perfil privado',
  [AuditStatus.UNAVAILABLE]: 'No disponible',
  [AuditStatus.UNSUPPORTED]: 'No soportado',
  [AuditStatus.AUTH_REQUIRED]: 'Autenticación requerida',
  [AuditStatus.API_RESTRICTED]: 'API restringida',
  [AuditStatus.ERROR]: 'Error',
};

export const AUDIT_STATUS_COLORS: Record<AuditStatus, string> = {
  [AuditStatus.CHECKING]: 'status-checking',
  [AuditStatus.ACCESSIBLE]: 'status-accessible',
  [AuditStatus.PRIVATE]: 'status-private',
  [AuditStatus.UNAVAILABLE]: 'status-unavailable',
  [AuditStatus.UNSUPPORTED]: 'status-unsupported',
  [AuditStatus.AUTH_REQUIRED]: 'status-auth',
  [AuditStatus.API_RESTRICTED]: 'status-api',
  [AuditStatus.ERROR]: 'status-error',
};

export const AUDIC_STATUS_ICONS: Record<AuditStatus, string> = {
  [AuditStatus.CHECKING]: 'LoaderCircle',
  [AuditStatus.ACCESSIBLE]: 'CheckCircle2',
  [AuditStatus.PRIVATE]: 'ShieldAlert',
  [AuditStatus.UNAVAILABLE]: 'XCircle',
  [AuditStatus.UNSUPPORTED]: 'Ban',
  [AuditStatus.AUTH_REQUIRED]: 'Key',
  [AuditStatus.API_RESTRICTED]: 'Gauge',
  [AuditStatus.ERROR]: 'AlertTriangle',
};

export interface AuditResult {
  id: string;
  sourceUrl: string;
  provider: ProviderId;
  status: AuditStatus;
  title: string;
  message: string;
  metadata: JsonObject;
  createdAt: string;
}

export interface DownloadJob {
  id: string;
  auditId: string | null;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number;
  result: Record<string, unknown> | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PlatformContent {
  id: string;
  type: 'post' | 'reel' | 'story' | 'video' | 'image' | 'carousel';
  url: string;
  title: string | null;
  description: string | null;
  thumbnailUrl: string | null;
  mediaUrls: string[];
  author: {
    username: string;
    name: string | null;
    avatarUrl: string | null;
  } | null;
  publishedAt: string | null;
  metrics: {
    likes?: number;
    comments?: number;
    shares?: number;
    views?: number;
  };
}

export interface CopyDestination {
  provider: ProviderId;
  targetId: string | null;
  targetName: string | null;
}

export interface CopyPlan {
  source: {
    provider: ProviderId;
    url: string;
  };
  items: PlatformContent[];
  destinations: CopyDestination[];
  options: {
    includeCaptions: boolean;
    includeMedia: boolean;
    scheduleAt: string | null;
  };
}

export type ContentType =
  | 'post'
  | 'reel'
  | 'story'
  | 'video'
  | 'image'
  | 'carousel';

export type MediaItemType = 'video' | 'image' | 'carousel';
export type PublicationStatus = 'pending' | 'processing' | 'published' | 'failed';
export type PublicationJobType = 'download' | 'transcode' | 'publish';
export type PublicationJobStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface MediaItem {
  id: string;
  sourceId: string;
  url: string;
  thumbnailUrl: string | null;
  type: MediaItemType;
  duration: number | null;
  width: number | null;
  height: number | null;
  metadata: JsonObject;
  createdAt: string;
}

export interface Source {
  id: string;
  userId: string;
  originalUrl: string;
  provider: ProviderId;
  identifier: string;
  contentType: ContentType;
  status: AuditStatus;
  mediaItems: MediaItem[];
  createdAt: string;
}

export interface SocialAccount {
  id: string;
  userId: string;
  provider: ProviderId;
  username: string;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
  scopes: string[];
  isValid: boolean;
}

export interface Publication {
  id: string;
  userId: string;
  sourceId: string;
  socialAccountId: string;
  caption: string;
  status: PublicationStatus;
  scheduledAt: string | null;
}

export interface PublicationJob {
  id: string;
  publicationId: string;
  type: PublicationJobType;
  status: PublicationJobStatus;
  attempts: number;
  error: string | null;
  payload: JsonObject;
  createdAt: string;
}

const providerSchema = z.enum(['instagram', 'youtube', 'facebook', 'tiktok']);
const auditStatusSchema = z.enum([
  'CHECKING',
  'ACCESSIBLE',
  'PRIVATE',
  'UNAVAILABLE',
  'UNSUPPORTED',
  'AUTH_REQUIRED',
  'API_RESTRICTED',
  'ERROR',
]);
const contentTypeSchema = z.enum(['post', 'reel', 'story', 'video', 'image', 'carousel']);
const mediaItemTypeSchema = z.enum(['video', 'image', 'carousel']);
const publicationStatusSchema = z.enum(['pending', 'processing', 'published', 'failed']);
const publicationJobTypeSchema = z.enum(['download', 'transcode', 'publish']);
const publicationJobStatusSchema = z.enum(['pending', 'running', 'completed', 'failed']);
const jsonSchema = z.json();
const jsonObjectSchema = z.record(z.string(), jsonSchema);

export const MediaItemSchema = z.object({
  id: z.string().uuid(),
  sourceId: z.string().uuid(),
  url: z.string().url(),
  thumbnailUrl: z.string().url().nullable(),
  type: mediaItemTypeSchema,
  duration: z.number().nonnegative().nullable(),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  metadata: jsonObjectSchema,
  createdAt: z.string().datetime(),
});

export const SourceSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  originalUrl: z.string().url(),
  provider: providerSchema,
  identifier: z.string().min(1),
  contentType: contentTypeSchema,
  status: auditStatusSchema,
  mediaItems: z.array(MediaItemSchema),
  createdAt: z.string().datetime(),
});

export const SocialAccountSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  provider: providerSchema,
  username: z.string().min(1),
  accessToken: z.string().min(1),
  refreshToken: z.string().nullable(),
  expiresAt: z.string().datetime().nullable(),
  scopes: z.array(z.string()),
  isValid: z.boolean(),
});

export const PublicationSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  sourceId: z.string().uuid(),
  socialAccountId: z.string().uuid(),
  caption: z.string(),
  status: publicationStatusSchema,
  scheduledAt: z.string().datetime().nullable(),
});

export const PublicationJobSchema = z.object({
  id: z.string().uuid(),
  publicationId: z.string().uuid(),
  type: publicationJobTypeSchema,
  status: publicationJobStatusSchema,
  attempts: z.number().int().nonnegative(),
  error: z.string().nullable(),
  payload: jsonObjectSchema,
  createdAt: z.string().datetime(),
});

export type JsonValue = z.output<typeof jsonSchema>;
export type JsonObject = Record<string, JsonValue>;
export type MediaItemInput = z.input<typeof MediaItemSchema>;
export type SourceInput = z.input<typeof SourceSchema>;
export type SocialAccountInput = z.input<typeof SocialAccountSchema>;
export type PublicationInput = z.input<typeof PublicationSchema>;
export type PublicationJobInput = z.input<typeof PublicationJobSchema>;
export type MediaItemOutput = z.output<typeof MediaItemSchema>;
export type SourceOutput = z.output<typeof SourceSchema>;
export type SocialAccountOutput = z.output<typeof SocialAccountSchema>;
export type PublicationOutput = z.output<typeof PublicationSchema>;
export type PublicationJobOutput = z.output<typeof PublicationJobSchema>;
