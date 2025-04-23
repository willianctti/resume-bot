import { GoogleGenAI } from '@google/genai';
import { config } from '../config';

// Initialize the Google Gen AI client
const genAI = new GoogleGenAI({
  apiKey: config.googleAiApiKey,
});

export async function generateSummary(transcription: string): Promise<string> {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    const prompt = `Please provide a concise summary of the following conversation transcript, highlighting the key points and main topics discussed:\n\n${transcription}`;

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
    });

    const response = result.response;
    return response.text();
  } catch (error) {
    console.error('Error generating summary:', error);
    throw error;
  }
} 