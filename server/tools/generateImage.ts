import { z } from 'zod';
import { experimental_generateImage } from 'ai';
import { openai } from '@ai-sdk/openai';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// Define the parameter types to match the zod schema
type GenerateImageParams = {
  prompt: string;
};

// Directory for storing generated images
const IMAGES_DIR = path.join(process.cwd(), 'uploads');

// Ensure the directory exists
if (!fs.existsSync(IMAGES_DIR)) {
  fs.mkdirSync(IMAGES_DIR, { recursive: true });
}

export const generateImage = {
  id: 'generateImage',
  name: 'Generate Image',
  description: 'Useful for generating images based on a prompt',
  inputSchema: z.object({
    prompt: z.string().describe('Prompt for the image generation'),
  }),
  execute: async ({ prompt }: GenerateImageParams) => {
    try {
      const { image } = await experimental_generateImage({
        prompt: prompt,
        // model: openai.image('dall-e-3'),
        model: openai.image('gpt-image-1'),
      });

      // Generate a unique filename
      const filename = `${crypto.randomUUID()}.png`;
      const filepath = path.join(IMAGES_DIR, filename);

      // Convert base64 to buffer and save to file
      const buffer = Buffer.from(image.base64, 'base64');
      fs.writeFileSync(filepath, buffer);

      // Return the URL path to the image
      return { image: `/uploads/${filename}` };
    } catch (error) {
      console.error(error);
      return [];
    }
  },
};
