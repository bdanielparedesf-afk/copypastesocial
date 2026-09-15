import { supabase } from './client';

const BUCKETS = ['media', 'transcoded', 'thumbnails'] as const;
type BucketName = (typeof BUCKETS)[number];

export interface UploadResult {
  path: string;
  url: string;
}

export interface StorageBucketInfo {
  name: string;
  public: boolean;
}

async function ensureBucket(name: BucketName): Promise<void> {
  const { data: existing } = await supabase.storage.listBuckets();
  if (existing?.some((b) => b.name === name)) return;

  await supabase.storage.createBucket(name, {
    public: true,
    allowedMimeTypes: ['video/*', 'image/*', 'audio/*'],
    fileSizeLimit: 1024 * 1024 * 1024, // 1GB
  });
}

export async function uploadToStorage(
  bucket: BucketName,
  path: string,
  data: Buffer | Blob | ArrayBuffer,
  contentType?: string
): Promise<UploadResult> {
  await ensureBucket(bucket);

  const options: Parameters<typeof supabase.storage.from> extends never
    ? never
    : Parameters<ReturnType<typeof supabase.storage.from>['upload']>[2] = {
    upsert: true,
  };
  if (contentType) {
    options.contentType = contentType;
  }

  const { error } = await supabase.storage.from(bucket).upload(path, data, options);

  if (error) {
    throw new Error(`Storage upload failed: ${error.message}`);
  }

  const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(path);

  return {
    path,
    url: urlData.publicUrl,
  };
}

export async function downloadFromStorage(
  bucket: BucketName,
  path: string
): Promise<Blob> {
  const { data, error } = await supabase.storage.from(bucket).download(path);

  if (error || !data) {
    throw new Error(`Storage download failed: ${error?.message ?? 'Unknown error'}`);
  }

  return data;
}

export async function getPublicUrl(bucket: BucketName, path: string): Promise<string> {
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

export async function removeFromStorage(bucket: BucketName, paths: string[]): Promise<void> {
  const { error } = await supabase.storage.from(bucket).remove(paths);
  if (error) {
    throw new Error(`Storage remove failed: ${error.message}`);
  }
}

export async function listBuckets(): Promise<StorageBucketInfo[]> {
  const { data, error } = await supabase.storage.listBuckets();
  if (error) {
    throw new Error(`List buckets failed: ${error.message}`);
  }
  return data.map((b) => ({ name: b.name, public: b.public }));
}

export async function initStorageBuckets(): Promise<void> {
  for (const bucket of BUCKETS) {
    await ensureBucket(bucket);
  }
}
