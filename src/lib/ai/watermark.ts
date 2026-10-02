import path from 'path';
import fs from 'fs';
import { Jimp } from 'jimp';

/**
 * Overlays the pre-built, transparent gold brand watermark (public/watermark.png)
 * onto the bottom-right corner of the image.
 *
 * Uses Jimp (pure JavaScript) instead of sharp to avoid native binary issues on Railway.
 *
 * @param imageBuffer Original image binary buffer
 * @returns Watermarked image binary buffer (JPEG)
 */
export async function watermarkImage(imageBuffer: Buffer): Promise<Buffer> {
  // Load the original image
  const image = await Jimp.read(imageBuffer);
  const imgWidth = image.width;
  const imgHeight = image.height;

  // Load static watermark from public folder – try multiple paths for deployment compatibility
  const possiblePaths = [
    path.join(process.cwd(), 'public', 'watermark.png'),
    path.join(process.cwd(), '..', 'public', 'watermark.png'),
    path.resolve('public', 'watermark.png'),
  ];
  const watermarkPath = possiblePaths.find(p => fs.existsSync(p));
  if (!watermarkPath) {
    throw new Error(`Watermark template not found. Searched: ${possiblePaths.join(', ')}`);
  }

  const watermark = await Jimp.read(watermarkPath);

  // Scale watermark to 16% of image width, with a minimum of 140px
  const targetWidth = Math.max(140, Math.round(imgWidth * 0.16));
  const scaleFactor = targetWidth / watermark.width;
  const targetHeight = Math.round(watermark.height * scaleFactor);

  watermark.resize({ w: targetWidth, h: targetHeight });

  // Apply a 3% offset margin from the bottom and right edges
  const margin = Math.max(15, Math.round(imgWidth * 0.03));
  const x = imgWidth - targetWidth - margin;
  const y = imgHeight - targetHeight - margin;

  // Composite the watermark onto the image
  image.composite(watermark, x, y);

  // Export as JPEG buffer
  const outputBuffer = await image.getBuffer('image/jpeg');
  return Buffer.from(outputBuffer);
}
