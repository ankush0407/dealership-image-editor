import axios from 'axios';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

interface GeminiUploadResponse {
  file: { uri: string };
}

interface GeminiGenerateResponse {
  candidates: Array<{
    finishReason?: string;
    content?: {
      parts?: Array<{
        inlineData?: { mimeType: string; data: string };
        text?: string;
      }>;
    };
  }>;
}

async function uploadToGeminiFileAPI(buffer: Buffer, mimeType: string): Promise<string> {
  const response = await axios.post<GeminiUploadResponse>(
    `https://generativelanguage.googleapis.com/upload/v1beta/files?uploadType=media&key=${GEMINI_API_KEY}`,
    buffer,
    { headers: { 'Content-Type': mimeType }, timeout: 30000 }
  );
  return response.data.file.uri;
}

async function generateEditedImage(fileUri: string, mimeType: string): Promise<{ data: string; mimeType: string }> {
  const prompt = `Replace only the background of this motorcycle image. Keep the motorcycle pixel-perfect and unaltered — do not change its color, bodywork, decals, condition, or any detail. Only the background and floor should change. Place the motorcycle onto a professional powersports photography studio background: a smooth photographic gradient grey backdrop — medium grey (approximately #787878) directly behind the subject, naturally vignetting to a deeper charcoal (#363636) at the outer edges and corners. The floor should be a pristine, highly polished white-to-light-grey surface (approximately #F0F0F0) with a clean, soft specular reflection of the motorcycle visible on the floor surface beneath the tires. Add gentle, grounded shadows beneath the tires and kickstand to anchor the bike to the polished floor. The final result should match the aesthetic of a premium powersports dealership studio photoshoot.`;

  const response = await axios.post<GeminiGenerateResponse>(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image:generateContent?key=${GEMINI_API_KEY}`,
    {
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            { fileData: { mimeType, fileUri } },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.2,
        responseModalities: ['IMAGE'],
        imageConfig: { imageSize: '2K' },
      },
    },
    { timeout: 90000 }
  );

  const candidate = response.data.candidates?.[0];
  const finishReason = candidate?.finishReason;

  if (finishReason === 'NO_IMAGE') {
    throw new Error('Gemini could not generate an image for this input (NO_IMAGE). The image may not contain a recognisable subject.');
  }

  const parts = candidate?.content?.parts;
  if (!parts || parts.length === 0) {
    throw new Error(`Gemini returned no image parts (finishReason: ${finishReason ?? 'unknown'}). Response: ${JSON.stringify(response.data).slice(0, 300)}`);
  }

  const inlineData = parts[0].inlineData;
  if (!inlineData) {
    throw new Error(`Gemini part[0] has no inlineData. Part keys: ${Object.keys(parts[0]).join(', ')}`);
  }

  return { data: inlineData.data, mimeType: inlineData.mimeType };
}

// Returns the edited image as a Buffer — caller handles storage.
export async function processImageWithGemini(inputBuffer: Buffer, mimeType: string): Promise<Buffer> {
  const fileUri = await uploadToGeminiFileAPI(inputBuffer, mimeType);
  const result = await generateEditedImage(fileUri, mimeType);
  return Buffer.from(result.data, 'base64');
}
