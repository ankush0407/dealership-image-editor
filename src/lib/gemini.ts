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
  const prompt = `Replace only the background of this motorcycle image. Keep the motorcycle pixel-perfect and unaltered — do not change its color, bodywork, decals, condition, or any detail. Only the background and floor should change.

Place the motorcycle in a professional powersports photography studio with these exact, non-negotiable background elements:

FLOOR: A pristine, highly polished white-to-light-grey surface (approximately #F0F0F0). The floor occupies the bottom 25–30% of the image. It has a clean, soft specular reflection of the motorcycle directly beneath the tires.

WALL/BACKDROP: A smooth gradient grey wall — medium grey (approximately #787878) at the center behind the subject, darkening to charcoal (#363636) at the outer edges and top corners.

FLOOR-TO-WALL TRANSITION: There must be a sharp, clearly visible, straight horizontal seam where the polished floor meets the vertical backdrop wall — exactly like a professional photography studio with a hard baseboard line. This transition must NOT be blurry, gradual, or faded. It must be a crisp, distinct line at the same height across the full width of the image, consistently placed at approximately 25–30% from the bottom edge.

Add gentle, grounded shadows beneath the tires and kickstand to anchor the motorcycle to the polished floor. The final result must match the aesthetic of a premium powersports dealership studio photoshoot, with identical background treatment regardless of the camera angle.`;

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
        temperature: 0,
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
