import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db/db';

// GET /api/settings -> Load all system settings
export async function GET() {
  try {
    const db = await getDb();
    const rows = await db.all('SELECT key, value FROM settings');
    
    // Convert array of key-value pairs into a single object
    const settings: Record<string, string> = {};
    for (const row of rows) {
      settings[row.key] = row.value;
    }

    return NextResponse.json(settings);
  } catch (error: any) {
    console.error('Error fetching settings:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

// POST /api/settings -> Save setting overrides
export async function POST(req: NextRequest) {
  try {
    const db = await getDb();
    const body = await req.json();

    if (typeof body !== 'object' || body === null) {
      return NextResponse.json({ error: 'Settings object is required' }, { status: 400 });
    }

    // Insert or replace settings in transaction
    const stmt = await db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
    
    for (const [key, value] of Object.entries(body)) {
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        await stmt.run(key, String(value));
      }
    }
    
    await stmt.finalize();

    return NextResponse.json({ success: true, message: 'Settings saved successfully' });
  } catch (error: any) {
    console.error('Error saving settings:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
