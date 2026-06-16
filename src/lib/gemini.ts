import axios, { AxiosError } from 'axios';
import fs from 'fs';
import path from 'path';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const STORAGE_BASE_PATH = process.env.STORAGE_BASE_PATH || './storage';

interface GeminiUploadResponse {
  file: {
    uri: string;
  };
}

interface GeminiGenerateResponse {
  candidates: Array<{
    content: {
      parts: Array<{
        inlineData: {
          mimeType: string;
          data: string;
        };
      }>;
    };
  }>;
}

async function uploadToGeminiFileAPI(filePath: string): Promise<string> {
  const fileBuffer = fs.readFileSync(filePath);
  const mimeType = filePath.endsWith('.png') ? 'image/png' : 'image/jpeg';

  try {
    const response = await axios.post<GeminiUploadResponse>(
      `https://generativelanguage.googleapis.com/upload/v1beta/files?uploadType=media&key=${GEMINI_API_KEY}`,
      fileBuffer,
      {
        headers: {
          'Content-Type': mimeType,
        },
        timeout: 30000,
      }
    );

    return response.data.file.uri;
  } catch (error) {
    console.error('Gemini File API upload error:', error);
    throw error;
  }
}

async function generateEditedImage(fileUri: string, mimeType: string): Promise<{ data: string; mimeType: string }> {
  const prompt = `Isolate the motorcycle from the provided image and place it onto a seamless, neutral dark grey photographic backdrop. The grey must be perfectly uniform (#424242), with no visible gradients, shadows, or texture variations. Add professional studio-quality directional lighting that creates a soft, grounded shadow directly beneath the tires and kickstand, anchoring the bike to the clean surface, with no external reflections or highlights affecting the standardized grey backdrop.`;

  try {
    const response = await axios.post<GeminiGenerateResponse>(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image:generateContent?key=${GEMINI_API_KEY}`,
      {
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: prompt,
              },
              {
                fileData: {
                  mimeType: mimeType,
                  fileUri: fileUri,
                },
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.2,
          responseModalities: ['IMAGE'],
          imageConfig: {
            imageSize: '2K',
          },
        },
      },
      {
        timeout: 90000,
      }
    );

    const inlineData = response.data.candidates[0].content.parts[0].inlineData;
    return {
      data: inlineData.data,
      mimeType: inlineData.mimeType,
    };
  } catch (error) {
    console.error('Gemini generateContent error:', error);
    throw error;
  }
}

export async function processImageWithGemini(
  inputPath: string,
  outputPath: string
): Promise<void> {
  const mimeType = inputPath.endsWith('.png') ? 'image/png' : 'image/jpeg';

  // Step 1: Upload to Gemini File API
  const fileUri = await uploadToGeminiFileAPI(inputPath);

  // Step 2: Generate edited image
  const result = await generateEditedImage(fileUri, mimeType);

  // Decode base64 and save
  const imageBuffer = Buffer.from(result.data, 'base64');

  // Ensure output directory exists
  const outputDir = path.dirname(outputPath);
  fs.mkdirSync(outputDir, { recursive: true });

  fs.writeFileSync(outputPath, imageBuffer);
}

export function ensureStorageDir(userId: number, vin: string): string {
  const dir = path.join(STORAGE_BASE_PATH, userId.toString(), vin);
  fs.mkdirSync(path.join(dir, 'raw'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'edited'), { recursive: true });
  return dir;
}

export function getStoragePath(userId: number, vin: string, type: 'raw' | 'edited', filename: string): string {
  return path.join(STORAGE_BASE_PATH, userId.toString(), vin, type, filename);
}
