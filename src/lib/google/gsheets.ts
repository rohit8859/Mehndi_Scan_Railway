import { google } from 'googleapis';
import { getGoogleAuth } from './gdrive';
import { getDb } from '../db/db';

export async function appendApprovedImageToSheet(data: {
  filename: string;
  driveLink: string;
  style: string;
  occasion: string;
  coverage: string;
  complexity: string;
  handSide: string;
  elements: string[];
  timeTaken: string;
  price: number;
  reviewer: string;
  status: string;
  date: string;
  noOfHands?: string;
}): Promise<boolean> {
  const db = await getDb();
  
  // Fetch sheets configuration from settings table
  const spreadsheetId = (await db.get("SELECT value FROM settings WHERE key = 'google_spreadsheet_id'"))?.value;
  const sheetName = (await db.get("SELECT value FROM settings WHERE key = 'google_sheet_name'"))?.value || 'Sheet1';

  if (!spreadsheetId) {
    console.warn('Google Spreadsheet ID is not configured. Skipping sheets row append.');
    return false;
  }

  try {
    const auth = getGoogleAuth();
    const sheets = google.sheets({ version: 'v4', auth });

    const values = [
      [
        data.filename,
        data.driveLink,
        data.style,
        data.occasion,
        data.coverage,
        data.complexity,
        data.handSide,
        data.elements.join(', '),
        data.timeTaken,
        data.price,
        data.reviewer,
        data.status,
        data.date,
        data.noOfHands || ''
      ]
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${sheetName}!A:M`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: {
        values,
      },
    });

    console.log(`Successfully appended row for ${data.filename} in Google Sheet.`);
    return true;
  } catch (error) {
    console.error('Error appending row to Google Sheets:', error);
    return false;
  }
}

// Fetch all approved images directly from the Google Sheet
export async function getApprovedImagesFromSheet(): Promise<any[]> {
  const db = await getDb();
  const spreadsheetId = (await db.get("SELECT value FROM settings WHERE key = 'google_spreadsheet_id'"))?.value;
  const sheetName = (await db.get("SELECT value FROM settings WHERE key = 'google_sheet_name'"))?.value || 'Sheet1';

  if (!spreadsheetId) {
    console.warn('Google Spreadsheet ID is not configured. Skipping sheets read.');
    return [];
  }

  try {
    const auth = getGoogleAuth();
    const sheets = google.sheets({ version: 'v4', auth });

    // Fetch columns A to N
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!A:N`,
    });

    const rows = response.data.values || [];
    if (rows.length <= 1) return []; // Only header row or empty

    const images: any[] = [];
    
    // Skip header row at index 0
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || !row[0]) continue; // Skip empty rows

      const filename = row[0];
      const driveLink = row[1] || '';
      
      // Extract file ID from driveLink (e.g. https://drive.google.com/open?id=1TACTINA...)
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

      if (!fileId) continue;

      // Parse Design Elements (comma separated string -> array of strings)
      const elementsStr = row[7] || '';
      const elements = elementsStr
        .split(',')
        .map((e: string) => e.trim())
        .filter((e: string) => e.length > 0);

      images.push({
        id: `sheet_${i + 1}`, // Row number (1-based index) as unique ID prefix
        filename,
        gdrive_file_id: fileId,
        image_url: `/api/images/${fileId}?mime=${encodeURIComponent(filename.endsWith('.png') ? 'image/png' : (filename.endsWith('.webp') ? 'image/webp' : 'image/jpeg'))}`,
        upload_date: row[12] || new Date().toISOString(),
        ai_style: row[2] || 'Bridal',
        ai_occasion: row[3] || 'Wedding',
        ai_coverage: row[4] || 'Full Hand (Up to Elbow)',
        ai_complexity: row[5] || 'Medium',
        ai_elements: [],
        ai_hand_side: row[6] || 'Front Hand',
        ai_time_taken: row[8] || '15 Mins',
        ai_estimated_price: parseFloat(row[9]) || 0,
        ai_confidence: 100,
        ai_notes: 'Loaded directly from Google Sheets.',
        verified_style: row[2] || 'Bridal',
        verified_occasion: row[3] || 'Wedding',
        verified_coverage: row[4] || 'Full Hand (Up to Elbow)',
        verified_complexity: row[5] || 'Medium',
        verified_elements: elements,
        verified_hand_side: row[6] || 'Front Hand',
        verified_time_taken: row[8] || '15 Mins',
        verified_price: parseFloat(row[9]) || 0,
        no_of_hands: row[13] || '',
        verification_status: 'RE_APPROVED', // Custom status to identify sheet rows
        reviewer_name: row[10] || 'admin',
        review_date: row[12] || new Date().toISOString(),
        comments: '',
      });
    }

    return images;
  } catch (error) {
    console.error('Error reading approved images from Google Sheets:', error);
    return [];
  }
}

// Delete a specific row from Google Sheets
export async function deleteRowFromSheet(rowIndex: number): Promise<boolean> {
  const db = await getDb();
  const spreadsheetId = (await db.get("SELECT value FROM settings WHERE key = 'google_spreadsheet_id'"))?.value;
  const sheetName = (await db.get("SELECT value FROM settings WHERE key = 'google_sheet_name'"))?.value || 'Sheet1';

  if (!spreadsheetId) {
    console.warn('Google Spreadsheet ID is not configured. Skipping row delete.');
    return false;
  }

  try {
    const auth = getGoogleAuth();
    const sheets = google.sheets({ version: 'v4', auth });

    // Fetch spreadsheet metadata to find sheetId by title
    const spreadsheet = await sheets.spreadsheets.get({
      spreadsheetId,
    });
    const sheet = spreadsheet.data.sheets?.find(
      (s) => s.properties?.title === sheetName
    );
    const sheetId = sheet?.properties?.sheetId;
    if (sheetId === undefined) {
      console.warn(`Sheet with name "${sheetName}" not found.`);
      return false;
    }

    // Delete the row (0-indexed in range)
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            deleteDimension: {
              range: {
                sheetId,
                dimension: 'ROWS',
                startIndex: rowIndex - 1,
                endIndex: rowIndex,
              },
            },
          },
        ],
      },
    });

    console.log(`Successfully deleted row ${rowIndex} in Google Sheet.`);
    return true;
  } catch (error) {
    console.error(`Error deleting row ${rowIndex} from Google Sheets:`, error);
    return false;
  }
}

