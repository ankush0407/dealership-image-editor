import { createClient } from '@supabase/supabase-js';
import type { StorageProvider } from './index';

const BUCKET = process.env.SUPABASE_BUCKET || 'dealership-images';

export class SupabaseStorage implements StorageProvider {
  private client;

  constructor() {
    this.client = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
  }

  async upload(key: string, buffer: Buffer, mimeType: string): Promise<void> {
    const { error } = await this.client.storage
      .from(BUCKET)
      .upload(key, buffer, { contentType: mimeType, upsert: true });
    if (error) throw new Error(`Supabase upload failed: ${error.message}`);
  }

  async download(key: string): Promise<Buffer> {
    const { data, error } = await this.client.storage
      .from(BUCKET)
      .download(key);
    if (error) throw new Error(`Supabase download failed: ${error.message}`);
    return Buffer.from(await data.arrayBuffer());
  }

  async delete(key: string): Promise<void> {
    const { error } = await this.client.storage
      .from(BUCKET)
      .remove([key]);
    if (error) throw new Error(`Supabase delete failed: ${error.message}`);
  }

  async getSignedUrl(key: string, expiresIn: number): Promise<string> {
    const { data, error } = await this.client.storage
      .from(BUCKET)
      .createSignedUrl(key, expiresIn);
    if (error) throw new Error(`Supabase signed URL failed: ${error.message}`);
    return data.signedUrl;
  }
}
