import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db/db';
import { setupDriveFolders, moveFile, deleteFile } from '@/lib/google/gdrive';
import { appendApprovedImageToSheet } from '@/lib/google/gsheets';

// helper to verify session from cookie
function getReviewerName(req: NextRequest): string {
  const cookie = req.cookies.get('mehsang_session');
  if (!cookie) return 'Unknown Reviewer';
  try {
    const decrypted = Buffer.from(cookie.value, 'base64').toString('utf8');
    const parsed = JSON.parse(decrypted);
    return parsed.username || 'Unknown Reviewer';
  } catch {
    return 'Unknown Reviewer';
  }
}

// GET /api/images -> Lists images with filters & search
export async function GET(req: NextRequest) {
  try {
    const db = await getDb();
    const url = new URL(req.url);

    // Parse query params
    const status = url.searchParams.get('status') || 'PENDING';
    const search = url.searchParams.get('search') || '';
    const style = url.searchParams.get('style') || '';
    const occasion = url.searchParams.get('occasion') || '';
    const coverage = url.searchParams.get('coverage') || '';
    const complexity = url.searchParams.get('complexity') || '';
    const minPrice = url.searchParams.get('minPrice') ? parseFloat(url.searchParams.get('minPrice')!) : null;
    const maxPrice = url.searchParams.get('maxPrice') ? parseFloat(url.searchParams.get('maxPrice')!) : null;
    const minConfidence = url.searchParams.get('minConfidence') ? parseFloat(url.searchParams.get('minConfidence')!) : null;
    const maxConfidence = url.searchParams.get('maxConfidence') ? parseFloat(url.searchParams.get('maxConfidence')!) : null;
    const sortBy = url.searchParams.get('sortBy') || 'upload_date';
    const sortOrder = url.searchParams.get('sortOrder') || 'DESC';
    const limit = parseInt(url.searchParams.get('limit') || '50');
    const offset = parseInt(url.searchParams.get('offset') || '0');

    // Build Dynamic SQL Query
    let query = 'SELECT * FROM images WHERE 1=1';
    const params: any[] = [];

    if (status !== 'ALL') {
      query += ' AND verification_status = ?';
      params.push(status);
    }

    if (search) {
      query += ' AND (filename LIKE ? OR reviewer_name LIKE ? OR comments LIKE ?)';
      const searchParam = `%${search}%`;
      params.push(searchParam, searchParam, searchParam);
    }

    if (style) {
      query += ' AND (verified_style = ? OR (verified_style IS NULL AND ai_style = ?))';
      params.push(style, style);
    }

    if (occasion) {
      query += ' AND (verified_occasion = ? OR (verified_occasion IS NULL AND ai_occasion = ?))';
      params.push(occasion, occasion);
    }

    if (coverage) {
      query += ' AND (verified_coverage = ? OR (verified_coverage IS NULL AND ai_coverage = ?))';
      params.push(coverage, coverage);
    }

    if (complexity) {
      query += ' AND (verified_complexity = ? OR (verified_complexity IS NULL AND ai_complexity = ?))';
      params.push(complexity, complexity);
    }

    if (minPrice !== null) {
      query += ' AND (CASE WHEN verified_price IS NOT NULL THEN verified_price ELSE ai_estimated_price END) >= ?';
      params.push(minPrice);
    }

    if (maxPrice !== null) {
      query += ' AND (CASE WHEN verified_price IS NOT NULL THEN verified_price ELSE ai_estimated_price END) <= ?';
      params.push(maxPrice);
    }

    if (minConfidence !== null) {
      query += ' AND ai_confidence >= ?';
      params.push(minConfidence);
    }

    if (maxConfidence !== null) {
      query += ' AND ai_confidence <= ?';
      params.push(maxConfidence);
    }

    // Sorting columns verification
    const allowedSortCols = ['upload_date', 'ai_confidence', 'verified_price', 'ai_estimated_price', 'filename'];
    const sortCol = allowedSortCols.includes(sortBy) ? sortBy : 'upload_date';
    const finalSortOrder = sortOrder === 'ASC' ? 'ASC' : 'DESC';
    query += ` ORDER BY ${sortCol} ${finalSortOrder}`;

    // Total Count Query (for pagination calculations)
    const countQuery = query.replace('SELECT *', 'SELECT COUNT(*) as count');
    const totalRow = await db.get(countQuery, ...params);
    const totalCount = totalRow ? totalRow.count : 0;

    // Add pagination limit/offset
    query += ' LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const rows = await db.all(query, ...params);

    // Parse elements JSON array back to array object
    const images = rows.map((row) => ({
      ...row,
      ai_elements: JSON.parse(row.ai_elements || '[]'),
      verified_elements: JSON.parse(row.verified_elements || '[]'),
    }));

    return NextResponse.json({
      images,
      pagination: {
        total: totalCount,
        limit,
        offset,
      },
    });
  } catch (error: any) {
    console.error('Error listing images:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

// POST /api/images -> Create/Update individual or bulk records
export async function POST(req: NextRequest) {
  try {
    const db = await getDb();
    const reviewer = getReviewerName(req);
    const body = await req.json();

    const { action, id, ids } = body;

    // --- 1. Bulk Actions ---
    if (ids && Array.isArray(ids)) {
      if (action === 'BULK_APPROVE') {
        const driveFolders = await setupDriveFolders();
        for (const recordId of ids) {
          const img = await db.get('SELECT * FROM images WHERE id = ?', recordId);
          if (!img) continue;

          // Update status to Approved
          await db.run(
            `UPDATE images SET 
              verification_status = 'APPROVED', 
              reviewer_name = ?, 
              review_date = ? 
            WHERE id = ?`,
            reviewer,
            new Date().toISOString(),
            recordId
          );

          // Move Google Drive File
          try {
            await moveFile(img.gdrive_file_id, driveFolders.verifiedId);
          } catch (driveErr) {
            console.error(`Bulk Drive move failed for file ${img.filename}:`, driveErr);
          }

          // Append to Google Sheets
          try {
            await appendApprovedImageToSheet({
              filename: img.filename,
              driveLink: `https://drive.google.com/open?id=${img.gdrive_file_id}`,
              style: img.verified_style || img.ai_style || 'Modern',
              occasion: img.verified_occasion || img.ai_occasion || 'Wedding',
              coverage: img.verified_coverage || img.ai_coverage || 'Full Hand',
              complexity: img.verified_complexity || img.ai_complexity || 'Medium',
              handSide: img.verified_hand_side || img.ai_hand_side || 'Front Hand',
              elements: JSON.parse(img.verified_elements || img.ai_elements || '[]'),
              timeTaken: img.verified_time_taken || img.ai_time_taken || '15 Mins',
              price: img.verified_price || img.ai_estimated_price || 0,
              reviewer,
              status: 'APPROVED',
              date: new Date().toLocaleDateString(),
            });
          } catch (sheetErr) {
            console.error(`Bulk Sheets append failed for file ${img.filename}:`, sheetErr);
          }
        }
        return NextResponse.json({ success: true, message: `Successfully approved ${ids.length} images` });
      }

      if (action === 'BULK_REJECT') {
        const driveFolders = await setupDriveFolders();
        for (const recordId of ids) {
          const img = await db.get('SELECT * FROM images WHERE id = ?', recordId);
          if (!img) continue;

          await db.run(
            `UPDATE images SET 
              verification_status = 'REJECTED', 
              reviewer_name = ?, 
              review_date = ? 
            WHERE id = ?`,
            reviewer,
            new Date().toISOString(),
            recordId
          );

          try {
            await moveFile(img.gdrive_file_id, driveFolders.rejectedId);
          } catch (driveErr) {
            console.error(`Bulk Drive move failed for file ${img.filename}:`, driveErr);
          }
        }
        return NextResponse.json({ success: true, message: `Successfully rejected ${ids.length} images` });
      }

      if (action === 'BULK_EDIT_PRICE') {
        const { price } = body;
        if (typeof price !== 'number') {
          return NextResponse.json({ error: 'Valid price is required for bulk edit' }, { status: 400 });
        }
        await db.run(
          `UPDATE images SET verified_price = ? WHERE id IN (${ids.map(() => '?').join(',')})`,
          price,
          ...ids
        );
        return NextResponse.json({ success: true, message: `Updated price to ₹${price} for ${ids.length} images` });
      }

      if (action === 'BULK_EDIT_STYLE') {
        const { style } = body;
        if (!style) {
          return NextResponse.json({ error: 'Valid style is required for bulk edit' }, { status: 400 });
        }
        await db.run(
          `UPDATE images SET verified_style = ? WHERE id IN (${ids.map(() => '?').join(',')})`,
          style,
          ...ids
        );
        return NextResponse.json({ success: true, message: `Updated style to ${style} for ${ids.length} images` });
      }

      if (action === 'BULK_DELETE') {
        await db.run(`DELETE FROM images WHERE id IN (${ids.map(() => '?').join(',')})`, ...ids);
        return NextResponse.json({ success: true, message: `Successfully deleted ${ids.length} records` });
      }
    }

    // --- 2. Single Record Actions ---
    if (!id) {
      return NextResponse.json({ error: 'Image ID is required' }, { status: 400 });
    }

    const img = await db.get('SELECT * FROM images WHERE id = ?', id);
    if (!img) {
      return NextResponse.json({ error: 'Image not found' }, { status: 404 });
    }

    const {
      style,
      occasion,
      coverage,
      complexity,
      elements, // array
      price,
      comments,
      handSide,
      timeTaken,
    } = body;

    const elementsJson = JSON.stringify(elements || []);

    if (action === 'SAVE') {
      await db.run(
        `UPDATE images SET
          verified_style = ?,
          verified_occasion = ?,
          verified_coverage = ?,
          verified_complexity = ?,
          verified_elements = ?,
          verified_price = ?,
          verified_hand_side = ?,
          verified_time_taken = ?,
          comments = ?
        WHERE id = ?`,
        style,
        occasion,
        coverage,
        complexity,
        elementsJson,
        price,
        handSide,
        timeTaken,
        comments,
        id
      );
      return NextResponse.json({ success: true, message: 'Changes saved successfully' });
    }

    if (action === 'SUBMIT') {
      await db.run(
        `UPDATE images SET
          verified_style = ?,
          verified_occasion = ?,
          verified_coverage = ?,
          verified_complexity = ?,
          verified_elements = ?,
          verified_price = ?,
          verified_hand_side = ?,
          verified_time_taken = ?,
          verification_status = 'REVIEWED',
          reviewer_name = ?,
          review_date = ?,
          comments = ?
        WHERE id = ?`,
        style,
        occasion,
        coverage,
        complexity,
        elementsJson,
        price,
        handSide,
        timeTaken,
        reviewer,
        new Date().toISOString(),
        comments,
        id
      );
      return NextResponse.json({ success: true, message: 'Submitted to admin for final approval' });
    }

    if (action === 'DELETE') {
      try {
        if (img.gdrive_file_id) {
          await deleteFile(img.gdrive_file_id);
        }
      } catch (driveErr: any) {
        console.error('Error deleting file from Google Drive:', driveErr);
      }

      await db.run('DELETE FROM images WHERE id = ?', id);
      return NextResponse.json({ success: true, message: 'Image deleted from system successfully' });
    }

    if (action === 'APPROVE') {
      // 1. Update DB to APPROVED
      await db.run(
        `UPDATE images SET
          verified_style = ?,
          verified_occasion = ?,
          verified_coverage = ?,
          verified_complexity = ?,
          verified_elements = ?,
          verified_price = ?,
          verified_hand_side = ?,
          verified_time_taken = ?,
          verification_status = 'APPROVED',
          reviewer_name = ?,
          review_date = ?,
          comments = ?
        WHERE id = ?`,
        style,
        occasion,
        coverage,
        complexity,
        elementsJson,
        price,
        handSide,
        timeTaken,
        reviewer,
        new Date().toISOString(),
        comments,
        id
      );

      // 2. Move file on GDrive
      const driveFolders = await setupDriveFolders();
      try {
        await moveFile(img.gdrive_file_id, driveFolders.verifiedId);
      } catch (driveErr: any) {
        console.error('GDrive file move to verified failed:', driveErr);
      }

      // 3. Append row to Google Sheets
      try {
        await appendApprovedImageToSheet({
          filename: img.filename,
          driveLink: `https://drive.google.com/open?id=${img.gdrive_file_id}`,
          style,
          occasion,
          coverage,
          complexity,
          handSide: handSide || 'Front Hand',
          elements: elements || [],
          timeTaken: timeTaken || '15 Mins',
          price,
          reviewer,
          status: 'APPROVED',
          date: new Date().toLocaleDateString(),
        });
      } catch (sheetErr) {
        console.error('Google Sheets append failed:', sheetErr);
      }

      return NextResponse.json({ success: true, message: 'Image approved and synced successfully' });
    }

    if (action === 'REJECT') {
      // 1. Update DB to REJECTED
      await db.run(
        `UPDATE images SET
          verification_status = 'REJECTED',
          reviewer_name = ?,
          review_date = ?,
          comments = ?
        WHERE id = ?`,
        reviewer,
        new Date().toISOString(),
        comments,
        id
      );

      // 2. Move file to Rejected folder on GDrive
      const driveFolders = await setupDriveFolders();
      try {
        await moveFile(img.gdrive_file_id, driveFolders.rejectedId);
      } catch (driveErr: any) {
        console.error('GDrive file move to rejected failed:', driveErr);
      }

      return NextResponse.json({ success: true, message: 'Image rejected successfully' });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error: any) {
    console.error('Error updating image:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
