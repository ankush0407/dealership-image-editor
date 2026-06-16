import type { StorageProvider } from './index';

// Future S3 implementation. To activate:
// 1. npm install @aws-sdk/client-s3
// 2. Set STORAGE_PROVIDER=s3 in .env
// 3. Set AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, S3_BUCKET
export class S3Storage implements StorageProvider {
  async upload(_key: string, _buffer: Buffer, _mimeType: string): Promise<void> {
    throw new Error('S3 storage not yet configured. Set STORAGE_PROVIDER=supabase or implement S3Storage.');
  }

  async download(_key: string): Promise<Buffer> {
    throw new Error('S3 storage not yet configured.');
  }

  async delete(_key: string): Promise<void> {
    throw new Error('S3 storage not yet configured.');
  }

  async getSignedUrl(_key: string, _expiresIn: number): Promise<string> {
    throw new Error('S3 storage not yet configured.');
  }
}
