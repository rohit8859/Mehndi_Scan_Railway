export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db/db';
import { setupDriveFolders, moveFile, deleteFile, downloadImageBuffer, uploadFile } from '@/lib/google/gdrive';
import { appendApprovedImageToSheet } from '@/lib/google/gsheets';
import { watermarkImage } from '@/lib/ai/watermark';

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

// helper to extract user role from session cookie
function getReviewerRole(req: NextRequest): string {
  const cookie = req.cookies.get('mehsang_session');
  if (!cookie) return 'REVIEWER';
  try {
    const decrypted = Buffer.from(cookie.value, 'base64').toString('utf8');
    const parsed = JSON.parse(decrypted);
    return parsed.role || 'REVIEWER';
  } catch {
    return 'REVIEWER';
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
    const handSide = url.searchParams.get('handSide') || '';
    const noOfHands = url.searchParams.get('noOfHands') || '';
    const limit = parseInt(url.searchParams.get('limit') || '50');
    const offset = parseInt(url.searchParams.get('offset') || '0');

    // Build Dynamic SQL Query
    if (status === 'REVIEWED') {
      // 1. Get standard new approvals pending admin review
      const newApprovals = await db.all(
        "SELECT * FROM images WHERE verification_status = 'REVIEWED' ORDER BY upload_date DESC"
      );
      const formattedNew = newApprovals.map((row) => ({
        ...row,
        ai_elements: JSON.parse(row.ai_elements || '[]'),
        verified_elements: JSON.parse(row.verified_elements || '[]'),
        is_reapprove_request: false,
      }));

      // 2. Get pending reapprove requests
      const reapproveReqs = await db.all(
        "SELECT * FROM reapprove_requests WHERE status = 'PENDING' ORDER BY request_date DESC"
      );

      // Fetch all drive links from sheet to map file IDs to correct row indices dynamically
      let fileIdToRowIndex: { [key: string]: number } = {};
      const spreadsheetId = (await db.get("SELECT value FROM settings WHERE key = 'google_spreadsheet_id'"))?.value;
      const sheetName = (await db.get("SELECT value FROM settings WHERE key = 'google_sheet_name'"))?.value || 'Sheet1';
      if (spreadsheetId && reapproveReqs.length > 0) {
        try {
          const { getGoogleAuth } = await import('@/lib/google/gdrive');
          const { google } = await import('googleapis');
          const auth = getGoogleAuth();
          const sheets = google.sheets({ version: 'v4', auth });
          const response = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: `${sheetName}!B:B`,
          });
          const rows = response.data.values || [];
          for (let i = 0; i < rows.length; i++) {
            const driveLink = rows[i]?.[0] || '';
            let fileId = '';
            const match = driveLink.match(/[?&]id=([^&]+)/);
            if (match) {
              fileId = match[1];
            } else {
              const matchd = driveLink.match(/\/d\/([^\/]+)/);
              if (matchd) {
                fileId = matchd[1];
              }
            }
            if (fileId) {
              fileIdToRowIndex[fileId] = i + 1; // 1-based index
            }
          }
        } catch (sheetErr) {
          console.error('Failed to pre-fetch sheet rows for mapping:', sheetErr);
        }
      }
      
      const formattedReapprove = reapproveReqs.map((req) => ({
        id: `reapprove_${req.id}`,
        sheet_row_index: fileIdToRowIndex[req.gdrive_file_id] || req.sheet_row_index,
        filename: req.filename,
        gdrive_file_id: req.gdrive_file_id,
        image_url: `/api/images/${req.gdrive_file_id}?mime=${encodeURIComponent(req.filename.endsWith('.png') ? 'image/png' : (req.filename.endsWith('.webp') ? 'image/webp' : 'image/jpeg'))}`,
        upload_date: req.request_date,
        ai_style: req.original_style,
        ai_occasion: req.original_occasion,
        ai_coverage: req.original_coverage,
        ai_complexity: req.original_complexity,
        ai_elements: [],
        ai_hand_side: req.original_hand_side,
        ai_time_taken: req.original_time_taken,
        ai_estimated_price: req.original_price,
        ai_confidence: 100,
        ai_notes: `Proposed by ${req.reviewer_name}`,
        verified_style: req.proposed_style,
        verified_occasion: req.proposed_occasion,
        verified_coverage: req.proposed_coverage,
        verified_complexity: req.proposed_complexity,
        verified_elements: JSON.parse(req.proposed_elements || '[]'),
        verified_hand_side: req.proposed_hand_side,
        verified_time_taken: req.proposed_time_taken,
        verified_price: req.proposed_price,
        no_of_hands: req.proposed_no_of_hands,
        verification_status: 'REVIEWED',
        reviewer_name: req.reviewer_name,
        review_date: req.request_date,
        comments: '',
        is_reapprove_request: true,
        original_values: {
          style: req.original_style,
          occasion: req.original_occasion,
          coverage: req.original_coverage,
          complexity: req.original_complexity,
          elements: JSON.parse(req.original_elements || '[]'),
          handSide: req.original_hand_side,
          timeTaken: req.original_time_taken,
          price: req.original_price,
          noOfHands: req.original_no_of_hands,
        }
      }));

      const combined = [...formattedReapprove, ...formattedNew];

      return NextResponse.json({
        images: combined,
        pagination: {
          total: combined.length,
          limit: 100,
          offset: 0,
        },
      });
    }

    if (status === 'RE_APPROVED') {
      const { getApprovedImagesFromSheet } = await import('@/lib/google/gsheets');
      let sheetImages = await getApprovedImagesFromSheet();

      // Apply Search filter
      if (search) {
        const searchLower = search.toLowerCase();
        sheetImages = sheetImages.filter(img => 
          img.filename.toLowerCase().includes(searchLower) ||
          img.reviewer_name.toLowerCase().includes(searchLower)
        );
      }

      // Apply Style filter
      if (style) {
        const styleLower = style.toLowerCase();
        sheetImages = sheetImages.filter(img => 
          img.verified_style.toLowerCase().includes(styleLower)
        );
      }

      // Apply Occasion filter
      if (occasion) {
        const occasionLower = occasion.toLowerCase();
        sheetImages = sheetImages.filter(img => 
          img.verified_occasion.toLowerCase().includes(occasionLower)
        );
      }

      // Apply Coverage filter
      if (coverage) {
        sheetImages = sheetImages.filter(img => 
          img.verified_coverage === coverage
        );
      }

      // Apply Complexity filter
      if (complexity) {
        sheetImages = sheetImages.filter(img => 
          img.verified_complexity === complexity
        );
      }

      // Apply Side filter
      if (handSide) {
        const handSideLower = handSide.toLowerCase();
        sheetImages = sheetImages.filter(img => 
          img.verified_hand_side.toLowerCase().includes(handSideLower)
        );
      }

      // Apply No of hands filter
      if (noOfHands) {
        const noOfHandsLower = noOfHands.toLowerCase();
        sheetImages = sheetImages.filter(img => 
          (img.no_of_hands || '').toLowerCase().includes(noOfHandsLower)
        );
      }

      // Apply Min Price filter
      if (minPrice !== null) {
        sheetImages = sheetImages.filter(img => img.verified_price >= minPrice);
      }

      // Apply Max Price filter
      if (maxPrice !== null) {
        sheetImages = sheetImages.filter(img => img.verified_price <= maxPrice);
      }

      // Apply Sorting
      if (sortBy === 'upload_date') {
        // Sort by Sheets row index ascending (serial wise: row 2 to end)
        sheetImages.sort((a, b) => {
          const rowA = parseInt(a.id.replace('sheet_', ''));
          const rowB = parseInt(b.id.replace('sheet_', ''));
          return rowA - rowB;
        });
      } else {
        const finalSortOrder = sortOrder === 'ASC' ? 1 : -1;
        sheetImages.sort((a, b) => {
          let valA = a[sortBy] || '';
          let valB = b[sortBy] || '';
          if (typeof valA === 'string') {
            return valA.localeCompare(valB) * finalSortOrder;
          } else {
            return (Number(valA) - Number(valB)) * finalSortOrder;
          }
        });
      }

      const totalCount = sheetImages.length;
      const paginatedImages = sheetImages; // Disable slicing to load all photos

      return NextResponse.json({
        images: paginatedImages,
        pagination: {
          total: totalCount,
          limit: totalCount,
          offset: 0,
        },
      });
    }

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
      query += ' AND (verified_style LIKE ? OR (verified_style IS NULL AND ai_style LIKE ?))';
      params.push(`%${style}%`, `%${style}%`);
    }

    if (occasion) {
      query += ' AND (verified_occasion LIKE ? OR (verified_occasion IS NULL AND ai_occasion LIKE ?))';
      params.push(`%${occasion}%`, `%${occasion}%`);
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

    if (handSide) {
      query += ' AND (verified_hand_side LIKE ? OR (verified_hand_side IS NULL AND ai_hand_side LIKE ?))';
      params.push(`%${handSide}%`, `%${handSide}%`);
    }

    if (noOfHands) {
      query += ' AND no_of_hands LIKE ?';
      params.push(`%${noOfHands}%`);
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

          // Watermark and upload new file to GDrive, then delete old one
          let finalFileId = img.gdrive_file_id;
          try {
            console.log(`Watermarking bulk image ${img.filename}...`);
            const originalBuffer = await downloadImageBuffer(img.gdrive_file_id);
            const watermarkedBuffer = await watermarkImage(originalBuffer);
            const mimeType = img.filename.endsWith('.png') ? 'image/png' : (img.filename.endsWith('.webp') ? 'image/webp' : 'image/jpeg');
            const newFileId = await uploadFile(img.filename, watermarkedBuffer, mimeType, driveFolders.verifiedId);
            if (newFileId) {
              finalFileId = newFileId;
              await db.run('UPDATE images SET gdrive_file_id = ? WHERE id = ?', newFileId, recordId);
              await deleteFile(img.gdrive_file_id);
            }
          } catch (driveErr) {
            console.error(`Bulk GDrive watermarking and file upload failed for file ${img.filename}:`, driveErr);
            try {
              await moveFile(img.gdrive_file_id, driveFolders.verifiedId);
            } catch (fallbackErr) {
              console.error(`Bulk fallback moveFile failed for file ${img.filename}:`, fallbackErr);
            }
          }

          // Append to Google Sheets
          try {
            await appendApprovedImageToSheet({
              filename: img.filename,
              driveLink: `https://drive.google.com/open?id=${finalFileId}`,
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

    const isReapproveRequest = typeof id === 'string' && id.startsWith('reapprove_');
    if (isReapproveRequest) {
      const requestId = parseInt(id.replace('reapprove_', ''));
      const reqRecord = await db.get('SELECT * FROM reapprove_requests WHERE id = ?', requestId);
      if (!reqRecord) {
        return NextResponse.json({ error: 'Re-approval request not found' }, { status: 404 });
      }

      // Dynamically locate the live sheet row index using the file ID
      let liveRowIndex = reqRecord.sheet_row_index;
      const spreadsheetId = (await db.get("SELECT value FROM settings WHERE key = 'google_spreadsheet_id'"))?.value;
      const sheetName = (await db.get("SELECT value FROM settings WHERE key = 'google_sheet_name'"))?.value || 'Sheet1';
      if (spreadsheetId) {
        try {
          const { getGoogleAuth } = await import('@/lib/google/gdrive');
          const { google } = await import('googleapis');
          const auth = getGoogleAuth();
          const sheets = google.sheets({ version: 'v4', auth });
          const response = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: `${sheetName}!B:B`,
          });
          const rows = response.data.values || [];
          for (let i = 0; i < rows.length; i++) {
            const driveLink = rows[i]?.[0] || '';
            let fileId = '';
            const match = driveLink.match(/[?&]id=([^&]+)/);
            if (match) {
              fileId = match[1];
            } else {
              const matchd = driveLink.match(/\/d\/([^\/]+)/);
              if (matchd) {
                fileId = matchd[1];
              }
            }
            if (fileId === reqRecord.gdrive_file_id) {
              liveRowIndex = i + 1;
              break;
            }
          }
        } catch (sheetErr) {
          console.error('Failed to locate live row index for re-approval request:', sheetErr);
        }
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
        noOfHands,
      } = body;

      if (action === 'SAVE') {
        try {
          await db.run(
            `UPDATE reapprove_requests SET
              proposed_style = ?,
              proposed_occasion = ?,
              proposed_coverage = ?,
              proposed_complexity = ?,
              proposed_elements = ?,
              proposed_hand_side = ?,
              proposed_time_taken = ?,
              proposed_price = ?,
              proposed_no_of_hands = ?
            WHERE id = ?`,
            style,
            occasion,
            coverage,
            complexity,
            JSON.stringify(elements || []),
            handSide,
            timeTaken,
            price,
            noOfHands || '',
            requestId
          );
          return NextResponse.json({ success: true, message: 'Re-approval request saved successfully' });
        } catch (dbErr: any) {
          console.error('Failed to save re-approval request changes:', dbErr);
          return NextResponse.json({ error: `Failed to save changes: ${dbErr.message || dbErr}` }, { status: 500 });
        }
      }

      if (action === 'APPROVE') {
        const spreadsheetId = (await db.get("SELECT value FROM settings WHERE key = 'google_spreadsheet_id'"))?.value;
        const sheetName = (await db.get("SELECT value FROM settings WHERE key = 'google_sheet_name'"))?.value || 'Sheet1';
        
        if (spreadsheetId) {
          try {
            const { getGoogleAuth } = await import('@/lib/google/gdrive');
            const { google } = await import('googleapis');
            const auth = getGoogleAuth();
            const sheets = google.sheets({ version: 'v4', auth });
                         const response = await sheets.spreadsheets.values.get({
              spreadsheetId,
              range: `${sheetName}!B${liveRowIndex}:B${liveRowIndex}`,
            });
            const driveLink = response.data.values?.[0]?.[0] || `https://drive.google.com/open?id=${reqRecord.gdrive_file_id}`;

            const values = [
              [
                reqRecord.filename,
                driveLink,
                style,
                occasion,
                coverage,
                complexity,
                handSide,
                (elements || []).join(', '),
                timeTaken,
                price,
                reviewer,
                'APPROVED',
                new Date().toLocaleDateString(),
                noOfHands || ''
              ]
            ];

            await sheets.spreadsheets.values.update({
              spreadsheetId,
              range: `${sheetName}!A${liveRowIndex}:N${liveRowIndex}`,
              valueInputOption: 'USER_ENTERED',
              requestBody: {
                values,
              },
            });
          } catch (sheetErr: any) {
            console.error('Failed to update Google Sheet on re-approval:', sheetErr);
            return NextResponse.json({
              error: `Failed to update Google Sheet: ${sheetErr.message || sheetErr}`
            }, { status: 500 });
          }
        }

        try {
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
              no_of_hands = ?,
              verification_status = 'APPROVED'
            WHERE gdrive_file_id = ?`,
            style,
            occasion,
            coverage,
            complexity,
            JSON.stringify(elements || []),
            price,
            handSide,
            timeTaken,
            noOfHands || '',
            reqRecord.gdrive_file_id
          );
        } catch (dbErr) {
          console.error('Failed to sync re-approval back to images table:', dbErr);
        }

        await db.run(
          "UPDATE reapprove_requests SET status = 'APPROVED' WHERE id = ?",
          requestId
        );

        return NextResponse.json({ success: true, message: 'Re-approval request approved and synced successfully' });
      }

      if (action === 'APPROVE_ORIGINAL') {
        const spreadsheetId = (await db.get("SELECT value FROM settings WHERE key = 'google_spreadsheet_id'"))?.value;
        const sheetName = (await db.get("SELECT value FROM settings WHERE key = 'google_sheet_name'"))?.value || 'Sheet1';
        
        if (spreadsheetId) {
          try {
            const { getGoogleAuth } = await import('@/lib/google/gdrive');
            const { google } = await import('googleapis');
            const auth = getGoogleAuth();
            const sheets = google.sheets({ version: 'v4', auth });
                         const response = await sheets.spreadsheets.values.get({
              spreadsheetId,
              range: `${sheetName}!B${liveRowIndex}:B${liveRowIndex}`,
            });
            const driveLink = response.data.values?.[0]?.[0] || `https://drive.google.com/open?id=${reqRecord.gdrive_file_id}`;

            const originalElements = JSON.parse(reqRecord.original_elements || '[]');

            const values = [
              [
                reqRecord.filename,
                driveLink,
                reqRecord.original_style,
                reqRecord.original_occasion,
                reqRecord.original_coverage,
                reqRecord.original_complexity,
                reqRecord.original_hand_side,
                (originalElements || []).join(', '),
                reqRecord.original_time_taken,
                reqRecord.original_price,
                reqRecord.reviewer_name || reviewer,
                'APPROVED',
                new Date().toLocaleDateString(),
                reqRecord.original_no_of_hands || ''
              ]
            ];

            await sheets.spreadsheets.values.update({
              spreadsheetId,
              range: `${sheetName}!A${liveRowIndex}:N${liveRowIndex}`,
              valueInputOption: 'USER_ENTERED',
              requestBody: {
                values,
              },
            });
          } catch (sheetErr: any) {
            console.error('Failed to restore original values on Google Sheet:', sheetErr);
            return NextResponse.json({
              error: `Failed to update Google Sheet: ${sheetErr.message || sheetErr}`
            }, { status: 500 });
          }
        }

        try {
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
              no_of_hands = ?,
              verification_status = 'APPROVED'
            WHERE gdrive_file_id = ?`,
            reqRecord.original_style,
            reqRecord.original_occasion,
            reqRecord.original_coverage,
            reqRecord.original_complexity,
            reqRecord.original_elements || '[]',
            reqRecord.original_price,
            reqRecord.original_hand_side,
            reqRecord.original_time_taken,
            reqRecord.original_no_of_hands || '',
            reqRecord.gdrive_file_id
          );
        } catch (dbErr) {
          console.error('Failed to sync original values back to images table:', dbErr);
        }

        await db.run(
          "UPDATE reapprove_requests SET status = 'APPROVED' WHERE id = ?",
          requestId
        );

        return NextResponse.json({ success: true, message: 'Re-approval request approved with original details successfully' });
      }

      if (action === 'REJECT') {
        await db.run(
          "UPDATE reapprove_requests SET status = 'REJECTED' WHERE id = ?",
          requestId
        );
        return NextResponse.json({ success: true, message: 'Re-approval request rejected successfully' });
      }

      return NextResponse.json({ error: 'Invalid action for re-approve request' }, { status: 400 });
    }

    const isSheetImage = typeof id === 'string' && id.startsWith('sheet_');
    if (isSheetImage) {
      const rowIndex = parseInt(id.replace('sheet_', ''));

      if (action === 'DELETE') {
        const spreadsheetId = (await db.get("SELECT value FROM settings WHERE key = 'google_spreadsheet_id'"))?.value;
        const sheetName = (await db.get("SELECT value FROM settings WHERE key = 'google_sheet_name'"))?.value || 'Sheet1';
        
        if (!spreadsheetId) {
          return NextResponse.json({ error: 'Spreadsheet not configured' }, { status: 400 });
        }

        const { getGoogleAuth } = await import('@/lib/google/gdrive');
        const { google } = await import('googleapis');
        const auth = getGoogleAuth();
        const sheets = google.sheets({ version: 'v4', auth });
        
        const response = await sheets.spreadsheets.values.get({
          spreadsheetId,
          range: `${sheetName}!A${rowIndex}:B${rowIndex}`,
        });
        const row = response.data.values?.[0] || [];
        const driveLink = row[1] || '';

        let fileId = '';
        const match = driveLink.match(/[?&]id=([^&]+)/);
        if (match) {
          fileId = match[1];
        } else {
          const matchd = driveLink.match(/\/d\/([^\/]+)/);
          if (matchd) {
            fileId = matchd[1];
          }
        }

        if (fileId) {
          try {
            await deleteFile(fileId);
            console.log(`Deleted file ${fileId} from Google Drive.`);
          } catch (driveErr) {
            console.error('Failed to delete file from Google Drive:', driveErr);
          }

          try {
            await db.run('DELETE FROM images WHERE gdrive_file_id = ?', fileId);
          } catch (dbErr) {
            console.error('Failed to delete image record from sqlite:', dbErr);
          }
        }

        const { deleteRowFromSheet } = await import('@/lib/google/gsheets');
        const deleteSuccess = await deleteRowFromSheet(rowIndex);

        if (!deleteSuccess) {
          return NextResponse.json({ error: 'Failed to delete row from Google Sheets' }, { status: 500 });
        }

        return NextResponse.json({ success: true, message: 'Google Sheets row and Drive file deleted successfully' });
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
        noOfHands,
      } = body;

      const userRole = getReviewerRole(req);

      if (userRole === 'REVIEWER') {
        const spreadsheetId = (await db.get("SELECT value FROM settings WHERE key = 'google_spreadsheet_id'"))?.value;
        const sheetName = (await db.get("SELECT value FROM settings WHERE key = 'google_sheet_name'"))?.value || 'Sheet1';
        
        if (!spreadsheetId) {
          return NextResponse.json({ error: 'Spreadsheet not configured' }, { status: 400 });
        }

        const { getGoogleAuth } = await import('@/lib/google/gdrive');
        const { google } = await import('googleapis');
        const auth = getGoogleAuth();
        const sheets = google.sheets({ version: 'v4', auth });
        
        const response = await sheets.spreadsheets.values.get({
          spreadsheetId,
          range: `${sheetName}!A${rowIndex}:N${rowIndex}`,
        });
        const row = response.data.values?.[0] || [];
        const filename = row[0] || 'unknown.jpg';
        const driveLink = row[1] || '';
        
        let fileId = '';
        const match = driveLink.match(/[?&]id=([^&]+)/);
        if (match) {
          fileId = match[1];
        } else {
          const matchd = driveLink.match(/\/d\/([^\/]+)/);
          if (matchd) {
            fileId = matchd[1];
          }
        }

        await db.run(
          `INSERT INTO reapprove_requests (
            filename, sheet_row_index, gdrive_file_id,
            original_style, original_occasion, original_coverage, original_complexity, original_elements, original_hand_side, original_time_taken, original_price, original_no_of_hands,
            proposed_style, proposed_occasion, proposed_coverage, proposed_complexity, proposed_elements, proposed_hand_side, proposed_time_taken, proposed_price, proposed_no_of_hands,
            reviewer_name, request_date, status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')`,
          filename,
          rowIndex,
          fileId,
          row[2] || 'Bridal',
          row[3] || 'Wedding',
          row[4] || 'Full Hand (Up to Elbow)',
          row[5] || 'Medium',
          JSON.stringify((row[7] || '').split(',').map((e: string) => e.trim()).filter(Boolean)),
          row[6] || 'Front Hand',
          row[8] || '15 Mins',
          parseFloat(row[9]) || 0,
          row[13] || '',
          style,
          occasion,
          coverage,
          complexity,
          JSON.stringify(elements || []),
          handSide,
          timeTaken,
          price,
          noOfHands || '',
          reviewer,
          new Date().toISOString()
        );

        return NextResponse.json({ success: true, message: 'Re-approval request submitted to Admin successfully' });
      }


      const spreadsheetId = (await db.get("SELECT value FROM settings WHERE key = 'google_spreadsheet_id'"))?.value;
      const sheetName = (await db.get("SELECT value FROM settings WHERE key = 'google_sheet_name'"))?.value || 'Sheet1';
      
      if (!spreadsheetId) {
        return NextResponse.json({ error: 'Spreadsheet not configured' }, { status: 400 });
      }

      // Fetch the specific row from Google Sheets to get filename & driveLink
      const { getGoogleAuth } = await import('@/lib/google/gdrive');
      const { google } = await import('googleapis');
      const auth = getGoogleAuth();
      const sheets = google.sheets({ version: 'v4', auth });
      
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${sheetName}!A${rowIndex}:B${rowIndex}`,
      });
      const row = response.data.values?.[0] || [];
      const filename = row[0] || 'unknown.jpg';
      const driveLink = row[1] || '';

      const values = [
        [
          filename,
          driveLink,
          style,
          occasion,
          coverage,
          complexity,
          handSide,
          (elements || []).join(', '),
          timeTaken,
          price,
          reviewer,
          'APPROVED', // Status
          new Date().toLocaleDateString(), // Date
          noOfHands || ''
        ]
      ];

      // Update in Google Sheets
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${sheetName}!A${rowIndex}:N${rowIndex}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values,
        },
      });

      // Also update in SQLite/Turso database if it exists there, just in case
      try {
        const fileId = driveLink.includes('id=') ? driveLink.split('id=')[1].split('&')[0] : '';
        if (fileId) {
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
              no_of_hands = ?,
              verification_status = 'APPROVED'
            WHERE gdrive_file_id = ?`,
            style,
            occasion,
            coverage,
            complexity,
            JSON.stringify(elements || []),
            price,
            handSide,
            timeTaken,
            noOfHands || '',
            fileId
          );
        }
      } catch (dbErr) {
        console.error('Failed to sync sheet update back to database:', dbErr);
      }

      return NextResponse.json({ success: true, message: 'Google Sheet row updated successfully' });
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
      noOfHands,
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
          comments = ?,
          no_of_hands = ?
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
        noOfHands || '',
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
          comments = ?,
          no_of_hands = ?
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
        noOfHands || '',
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
      try {
        const driveFolders = await setupDriveFolders();
        let finalFileId = img.gdrive_file_id;
        try {
          console.log(`[Approval] Watermarking image ${img.filename}...`);
          const originalBuffer = await downloadImageBuffer(img.gdrive_file_id);
          const watermarkedBuffer = await watermarkImage(originalBuffer);
          const mimeType = img.filename.endsWith('.png') ? 'image/png' : (img.filename.endsWith('.webp') ? 'image/webp' : 'image/jpeg');
          const newFileId = await uploadFile(img.filename, watermarkedBuffer, mimeType, driveFolders.verifiedId);
          if (newFileId) {
            finalFileId = newFileId;
            const freshDb = await getDb();
            await freshDb.run('UPDATE images SET gdrive_file_id = ? WHERE id = ?', newFileId, id);
            await deleteFile(img.gdrive_file_id);
          }
        } catch (driveErr: any) {
          console.error('[Approval] GDrive watermarking and file upload failed:', driveErr);
          try {
            await moveFile(img.gdrive_file_id, driveFolders.verifiedId);
          } catch (fallbackErr: any) {
            console.error('[Approval] Fallback moveFile failed:', fallbackErr);
          }
        }

        // 2. Append row to Google Sheets
        const appendSuccess = await appendApprovedImageToSheet({
          filename: img.filename,
          driveLink: `https://drive.google.com/open?id=${finalFileId}`,
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
          noOfHands: noOfHands || '',
        });

        if (!appendSuccess) {
          return NextResponse.json({ error: 'Failed to append approved image to Google Sheet' }, { status: 500 });
        }

        // 3. Update DB to APPROVED only if Sheets append was successful
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
            comments = ?,
            no_of_hands = ?
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
          noOfHands || '',
          id
        );

        return NextResponse.json({ success: true, message: 'Image approved and synced successfully' });
      } catch (bgErr: any) {
        console.error('[Approval] Core approval processing crashed:', bgErr);
        return NextResponse.json({ error: `Approval processing crashed: ${bgErr.message || bgErr}` }, { status: 500 });
      }
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
