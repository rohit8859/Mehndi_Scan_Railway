import { NextRequest, NextResponse } from 'next/server';
import { getFolderDetails } from '@/lib/google/gdrive';

// GET /api/settings/verify-folder?folderId=XXXX
// Validates if a folder ID is accessible and retrieves its details
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const folderId = url.searchParams.get('folderId');

    if (!folderId) {
      return NextResponse.json({ error: 'Folder ID is required' }, { status: 400 });
    }

    const folder = await getFolderDetails(folderId);
    return NextResponse.json({ success: true, name: folder.name, id: folder.id });
  } catch (error: any) {
    console.error('Error verifying folder:', error);
    return NextResponse.json({ success: false, error: error.message || 'Folder not found or inaccessible' });
  }
}
