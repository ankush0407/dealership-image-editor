import { NextRequest, NextResponse } from 'next/server';
import { writeFile } from 'fs/promises';
import path from 'path';
import { query } from '@/lib/db';
import { verifyToken, getTokenFromRequest } from '@/lib/auth';
import { processImageWithGemini, ensureStorageDir, getStoragePath } from '@/lib/gemini';

export async function POST(req: NextRequest) {
  try {
    const token = getTokenFromRequest(req);
    if (!token) {
      return NextResponse.json(
        { error: 'Missing or invalid authorization header' },
        { status: 401 }
      );
    }

    const payload = verifyToken(token);
    if (!payload) {
      return NextResponse.json(
        { error: 'Invalid token' },
        { status: 401 }
      );
    }

    const formData = await req.formData();
    const vinFolderId = formData.get('vin_folder_id') as string;
    const files = formData.getAll('files') as File[];

    if (!vinFolderId || !files || files.length === 0) {
      return NextResponse.json(
        { error: 'Missing vin_folder_id or files' },
        { status: 400 }
      );
    }

    // Verify VIN folder belongs to user
    const folderResult = await query(
      'SELECT id FROM vin_folders WHERE id = $1 AND user_id = $2',
      [vinFolderId, payload.userId]
    );

    if (folderResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'VIN folder not found' },
        { status: 404 }
      );
    }

    // Get VIN name for storage path
    const vinResult = await query(
      'SELECT vin_name FROM vin_folders WHERE id = $1',
      [vinFolderId]
    );
    const vinName = vinResult.rows[0].vin_name;

    // Check user credits
    const userResult = await query(
      'SELECT credits_remaining FROM users WHERE id = $1',
      [payload.userId]
    );
    const creditsRemaining = userResult.rows[0].credits_remaining;

    if (creditsRemaining < files.length) {
      return NextResponse.json(
        { error: `Insufficient credits. You have ${creditsRemaining} credits but need ${files.length}` },
        { status: 400 }
      );
    }

    // Create storage directories
    ensureStorageDir(payload.userId, vinName);

    const uploadedImages = [];

    for (const file of files) {
      // Validate file type
      if (!['image/jpeg', 'image/png'].includes(file.type)) {
        continue;
      }

      const filename = file.name;
      const bytes = await file.arrayBuffer();

      // Save raw image
      const rawPath = getStoragePath(payload.userId, vinName, 'raw', filename);
      await writeFile(rawPath, Buffer.from(bytes));

      // Create image record
      const imageResult = await query(
        'INSERT INTO images (vin_folder_id, user_id, original_filename, raw_path, status) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        [vinFolderId, payload.userId, filename, rawPath, 'queued']
      );

      const imageId = imageResult.rows[0].id;

      // Deduct credit
      await query(
        'UPDATE users SET credits_remaining = credits_remaining - 1 WHERE id = $1',
        [payload.userId]
      );

      // Log credit transaction
      await query(
        'INSERT INTO credit_transactions (user_id, delta, reason, image_id) VALUES ($1, $2, $3, $4)',
        [payload.userId, -1, 'image_processing', imageId]
      );

      uploadedImages.push({
        id: imageId,
        filename,
        status: 'queued',
      });

      // Process image asynchronously
      processImageAsync(imageId, payload.userId, vinName, filename, rawPath);
    }

    return NextResponse.json({
      success: true,
      images: uploadedImages,
    });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Process image in background
async function processImageAsync(
  imageId: number,
  userId: number,
  vinName: string,
  filename: string,
  rawPath: string
) {
  let retries = 0;
  const maxRetries = 3;

  while (retries < maxRetries) {
    try {
      // Update status to processing
      await query(
        'UPDATE images SET status = $1 WHERE id = $2',
        ['processing', imageId]
      );

      // Process with Gemini
      const editedPath = getStoragePath(userId, vinName, 'edited', `edited_${filename}`);
      await processImageWithGemini(rawPath, editedPath);

      // Update image record with success
      await query(
        'UPDATE images SET status = $1, edited_path = $2, processed_at = NOW() WHERE id = $3',
        ['done', editedPath, imageId]
      );

      return; // Success
    } catch (error) {
      retries++;
      console.error(`Image processing attempt ${retries}/${maxRetries} failed:`, error);

      if (retries >= maxRetries) {
        // Mark as failed and refund credit
        await query(
          'UPDATE images SET status = $1, error_message = $2, retry_count = $3 WHERE id = $4',
          ['failed', (error as any).message, retries, imageId]
        );

        // Refund credit
        await query(
          'UPDATE users SET credits_remaining = credits_remaining + 1 WHERE id = $1',
          [userId]
        );

        // Log refund transaction
        await query(
          'INSERT INTO credit_transactions (user_id, delta, reason, image_id) VALUES ($1, $2, $3, $4)',
          [userId, 1, 'processing_failed', imageId]
        );

        return;
      }

      // Wait before retry (exponential backoff)
      await new Promise((resolve) => setTimeout(resolve, Math.pow(2, retries) * 1000));
    }
  }
}
