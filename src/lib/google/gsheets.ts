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
        data.date
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
