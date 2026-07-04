import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db/db';
import { listIncomingImages, downloadImageBuffer } from '@/lib/google/gdrive';
import { analyzeMehndiImage } from '@/lib/ai/vision';
import { scanProgress, resetProgress, stopProgress } from '@/lib/scanner-tracker';

// GET /api/scanner -> Get current scan progress
export async function GET() {
  return NextResponse.json(scanProgress);
}

// POST /api/scanner -> Start scanning incoming folder asynchronously
export async function POST(req: NextRequest) {
  if (scanProgress.active) {
    return NextResponse.json({ error: 'Scan already in progress' }, { status: 409 });
  }

  // Reset the progress state
  resetProgress();

  // Run the background process WITHOUT awaiting it so we return 202 immediately
  runScannerPipelineInBackground().catch((err) => {
    console.error('Unhandled background scanner error:', err);
    scanProgress.errors.push(err.message || String(err));
    stopProgress();
  });

  return NextResponse.json({ message: 'Scanner initiated' }, { status: 202 });
}

async function runScannerPipelineInBackground() {
  console.log('Background scan initiated...');
  const db = await getDb();

  try {
    // 1. Fetch incoming images from Google Drive
    const incomingFiles = await listIncomingImages();
    console.log(`Found ${incomingFiles.length} files in Google Drive Incoming folder.`);

    if (incomingFiles.length === 0) {
      console.log('No files found in Incoming folder.');
      stopProgress();
      return;
    }

    // 2. Filter out already scanned files
    const newFiles = [];
    for (const file of incomingFiles) {
      if (!file.id) continue;
      const existing = await db.get('SELECT id FROM images WHERE gdrive_file_id = ?', file.id);
      if (!existing) {
        newFiles.push(file);
      }
    }

    console.log(`Filtered out duplicates. ${newFiles.length} new files to process.`);
    scanProgress.total = newFiles.length;

    if (newFiles.length === 0) {
      stopProgress();
      return;
    }

    // 3. Process each file
    for (const file of newFiles) {
      if (!scanProgress.active) {
        // Allow pausing or stopping if needed
        break;
      }

      const fileId = file.id!;
      const filename = file.name || 'unnamed.jpg';
      scanProgress.currentFile = filename;
      console.log(`Processing file: ${filename} (ID: ${fileId})`);

      try {
        // Download image content
        const buffer = await downloadImageBuffer(fileId);

        // Detect MIME Type
        const mimeType = file.mimeType || 'image/jpeg';

        let aiResult;
        try {
          // Call AI Vision Analysis
          aiResult = await analyzeMehndiImage(buffer, mimeType);
        } catch (aiErr: any) {
          console.error(`AI analysis failed for ${filename}:`, aiErr);
          // AI Failed: Insert as manual review required (0% confidence)
          await db.run(
            `INSERT INTO images (
              filename, gdrive_file_id, image_url, upload_date,
              ai_style, ai_occasion, ai_coverage, ai_complexity, ai_elements,
              ai_hand_side, ai_time_taken,
              ai_estimated_price, ai_confidence, ai_notes,
              verified_style, verified_occasion, verified_coverage, verified_complexity, verified_elements,
              verified_hand_side, verified_time_taken,
              verified_price, verification_status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            filename,
            fileId,
            `/api/images/${fileId}?mime=${encodeURIComponent(mimeType)}`,
            file.createdTime || new Date().toISOString(),
            'Bridal',
            'Wedding',
            'Full Hand (Up to Elbow)',
            'Medium',
            '[]',
            'Front Hand',
            '15 Mins',
            0,
            0,
            'AI Vision analysis failed.',
            'Bridal',
            'Wedding',
            'Full Hand (Up to Elbow)',
            'Medium',
            '[]',
            'Front Hand',
            '15 Mins',
            0,
            'PENDING'
          );
          
          scanProgress.processed++;
          scanProgress.errors.push(`AI failure for ${filename}: ${aiErr.message || aiErr}`);
          continue;
        }

        // AI Success: Insert predictions into DB
        await db.run(
          `INSERT INTO images (
            filename, gdrive_file_id, image_url, upload_date,
            ai_style, ai_occasion, ai_coverage, ai_complexity, ai_elements,
            ai_hand_side, ai_time_taken,
            ai_estimated_price, ai_confidence, ai_notes,
            verified_style, verified_occasion, verified_coverage, verified_complexity, verified_elements,
            verified_hand_side, verified_time_taken,
            verified_price, verification_status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          filename,
          fileId,
          `/api/images/${fileId}?mime=${encodeURIComponent(mimeType)}`,
          file.createdTime || new Date().toISOString(),
          aiResult.design_style,
          aiResult.occasion,
          aiResult.coverage,
          aiResult.complexity,
          JSON.stringify(aiResult.design_elements),
          aiResult.hand_side || 'Front Hand',
          aiResult.time_taken || '15 Mins',
          aiResult.estimated_price,
          aiResult.confidence,
          aiResult.notes,
          
          // Seed verified fields with AI predictions initially to make review faster
          aiResult.design_style,
          aiResult.occasion,
          aiResult.coverage,
          aiResult.complexity,
          JSON.stringify(aiResult.design_elements),
          aiResult.hand_side || 'Front Hand',
          aiResult.time_taken || '15 Mins',
          aiResult.estimated_price,
          'PENDING' // Verification status starts as pending review
        );

        console.log(`Saved database record for ${filename} with AI predictions.`);
      } catch (fileErr: any) {
        console.error(`Error processing file ${filename}:`, fileErr);
        scanProgress.errors.push(`File error for ${filename}: ${fileErr.message || fileErr}`);
      }

      scanProgress.processed++;
    }

    console.log(`Scanning sweep finished. Processed ${scanProgress.processed}/${scanProgress.total} images.`);
  } catch (error: any) {
    console.error('Error in scanner background run:', error);
    scanProgress.errors.push(`Global run error: ${error.message || error}`);
  } finally {
    stopProgress();
  }
}
