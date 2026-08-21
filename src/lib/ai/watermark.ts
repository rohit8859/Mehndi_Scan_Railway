import sharp from 'sharp';
import path from 'path';
import fs from 'fs';

/**
 * Overlays the pre-built, transparent gold brand watermark (public/watermark.png)
 * onto the bottom-right corner of the image.
 * 
 * @param imageBuffer Original image binary buffer
 * @returns Watermarked image binary buffer
 */
export async function watermarkImage(imageBuffer: Buffer): Promise<Buffer> {
  const metadata = await sharp(imageBuffer).metadata();
  const imgWidth = metadata.width || 1200;
  const imgHeight = metadata.height || 1200;

  // Scale watermark to 16% of image width, with a minimum of 140px
  const targetWidth = Math.max(140, Math.round(imgWidth * 0.16));
  // Load static watermark from public folder
  const watermarkPath = path.join(process.cwd(), 'public/watermark.png');
  if (!fs.existsSync(watermarkPath)) {
    throw new Error('Watermark template public/watermark.png not found');
  }

  // Downscale the high-resolution template to target dimensions (razor-sharp)
  const scaledWatermark = await sharp(watermarkPath)
    .resize({ width: targetWidth })
    .png()
    .toBuffer();
  const watermarkMetadata = await sharp(scaledWatermark).metadata();
  const targetHeight = watermarkMetadata.height || Math.round(targetWidth * 0.2);

  // Apply a 3% offset margin from the bottom and right edges
  const margin = Math.max(15, Math.round(imgWidth * 0.03));

  return await sharp(imageBuffer)
    .composite([
      {
        input: scaledWatermark,
        top: imgHeight - targetHeight - margin,
        left: imgWidth - targetWidth - margin
      }
    ])
    .toBuffer();
}
