import { z } from 'zod';
import { GoogleGenAI, GeneratedVideo } from '@google/genai';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// Define the parameter types to match the zod schema
type GenerateVideoParams = {
  prompt: string;
};

// Directory for storing generated videos
const VIDEOS_DIR = path.join(process.cwd(), 'uploads');

// Ensure the directory exists
if (!fs.existsSync(VIDEOS_DIR)) {
  fs.mkdirSync(VIDEOS_DIR, { recursive: true });
}

export const generateVideo = {
  id: 'generateVideo',
  name: 'Generate Video',
  description: 'Useful for generating videos based on a prompt',
  parameters: z.object({
    prompt: z.string().describe('Prompt for the image generation'),
  }),
  execute: async ({ prompt }: GenerateVideoParams) => {
    const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY });

    try {
      let operation = await ai.models.generateVideos({
        model: 'veo-2.0-generate-001',
        prompt: prompt,
        config: {
          aspectRatio: '16:9',
          numberOfVideos: 1,
        },
      });

      while (!operation.done) {
        await new Promise((resolve) => setTimeout(resolve, 10000));
        operation = await ai.operations.getVideosOperation({
          operation: operation,
        });
      }

      const videoUrls = await Promise.all(
        operation.response?.generatedVideos?.map(async (generatedVideo: GeneratedVideo) => {
          if (!generatedVideo.video?.uri) {
            throw new Error('Generated video URI is missing');
          }

          const response = await fetch(
            `${generatedVideo.video.uri}&key=${process.env.GOOGLE_GENERATIVE_AI_API_KEY}`,
          );

          if (!response.ok) {
            throw new Error(`Failed to fetch video: ${response.statusText}`);
          }

          // Generate a unique filename
          const filename = `${crypto.randomUUID()}.mp4`;
          const filepath = path.join(VIDEOS_DIR, filename);

          // Create a write stream and pipe the response to it
          const fileStream = fs.createWriteStream(filepath);
          await new Promise((resolve, reject) => {
            response.body?.pipe(fileStream);
            fileStream.on('finish', resolve);
            fileStream.on('error', reject);
          });

          return `/uploads/${filename}`;
        }) ?? [],
      );

      return { videos: videoUrls };
    } catch (error) {
      console.error(error);
      return [];
    }
  },
};
