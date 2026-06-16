import axios from 'axios';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

interface GeminiUploadResponse {
  file: { uri: string };
}

interface GeminiGenerateResponse {
  candidates: Array<{
    content: {
      parts: Array<{
        inlineData: { mimeType: string; data: string };
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
  const prompt = `Isolate the motorcycle from the provided image and place it onto a seamless, neutral dark grey photographic backdrop. The grey must be perfectly uniform (#424242), with no visible gradients, shadows, or texture variations. Add professional studio-quality directional lighting that creates a soft, grounded shadow directly beneath the tires and kickstand, anchoring the bike to the clean surface, with no external reflections or highlights affecting the standardized grey backdrop.`;

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

  const inlineData = response.data.candidates[0].content.parts[0].inlineData;
  return { data: inlineData.data, mimeType: inlineData.mimeType };
}

// Returns the edited image as a Buffer — caller handles storage.
export async function processImageWithGemini(inputBuffer: Buffer, mimeType: string): Promise<Buffer> {
  const fileUri = await uploadToGeminiFileAPI(inputBuffer, mimeType);
  const result = await generateEditedImage(fileUri, mimeType);
  return Buffer.from(result.data, 'base64');
}
