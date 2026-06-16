export interface StorageProvider {
  upload(key: string, buffer: Buffer, mimeType: string): Promise<void>;
  download(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}

export function getStorage(): StorageProvider {
  const provider = process.env.STORAGE_PROVIDER || 'supabase';

  if (provider === 's3') {
    const { S3Storage } = require('./s3');
    return new S3Storage();
  }

  const { SupabaseStorage } = require('./supabase');
  return new SupabaseStorage();
}

export function storageKey(userId: number, vinName: string, type: 'raw' | 'edited', filename: string): string {
  return `${userId}/${vinName}/${type}/${filename}`;
}
