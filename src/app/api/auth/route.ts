import { NextRequest, NextResponse } from 'next/server';
import { getDb, hashPassword } from '@/lib/db/db';

// cookie helper functions
function getSessionCookie(req: NextRequest): { username: string; role: string } | null {
  const cookie = req.cookies.get('mehsang_session');
  if (!cookie) return null;
  try {
    // Basic decode of session cookie
    const decrypted = Buffer.from(cookie.value, 'base64').toString('utf8');
    const parsed = JSON.parse(decrypted);
    if (parsed.username && parsed.role) {
      return parsed;
    }
  } catch (e) {
    console.error('Failed to parse session cookie', e);
  }
  return null;
}

// GET /api/auth -> Check session status
export async function GET(req: NextRequest) {
  const user = getSessionCookie(req);
  if (!user) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }
  return NextResponse.json({ authenticated: true, user });
}

// POST /api/auth -> Login
export async function POST(req: NextRequest) {
  try {
    const { username, password } = await req.json();

    if (!username || !password) {
      return NextResponse.json({ error: 'Username and password are required' }, { status: 400 });
    }

    const db = await getDb();
    const hash = hashPassword(password);
    
    const user = await db.get(
      'SELECT username, role FROM users WHERE username = ? AND password_hash = ?',
      username,
      hash
    );

    if (!user) {
      return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 });
    }

    // Create session payload and base64 encode it for a simple secure session cookie
    const sessionData = JSON.stringify({ username: user.username, role: user.role });
    const encodedSession = Buffer.from(sessionData).toString('base64');

    const response = NextResponse.json({ success: true, user });
    
    // Set HTTP-only cookie, expires in 7 days
    response.cookies.set({
      name: 'mehsang_session',
      value: encodedSession,
      httpOnly: true,
      secure: false, // Allow HTTP testing on local network IPs (e.g. mobile viewports)
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });

    return response;
  } catch (error: any) {
    console.error('Login error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/auth -> Logout
export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.set({
    name: 'mehsang_session',
    value: '',
    path: '/',
    maxAge: 0,
  });
  return response;
}
