import { NextRequest, NextResponse } from 'next/server';
import { downloadImageBuffer } from '@/lib/google/gdrive';

// GET /api/images/[id] -> Streams image from Google Drive by file ID
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) {
      return new NextResponse('File ID is required', { status: 400 });
    }

    const buffer = await downloadImageBuffer(id);
    
    // Determine content type (default to jpeg, but check for webp and png)
    // We can fetch from query parameter or detect from buffer (simple check)
    const url = new URL(req.url);
    const mimeType = url.searchParams.get('mime') || 'image/jpeg';

    return new NextResponse(new Blob([new Uint8Array(buffer)]), {
      headers: {
        'Content-Type': mimeType,
        'Cache-Control': 'public, max-age=604800, immutable', // Cache for 7 days
      },
    });
  } catch (error: any) {
    console.error(`Error streaming image:`, error);
    return new NextResponse('Error loading image from Google Drive', { status: 500 });
  }
}
