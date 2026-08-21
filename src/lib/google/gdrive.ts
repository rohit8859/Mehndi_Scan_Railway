import { google, drive_v3 } from 'googleapis';
import path from 'path';
import fs from 'fs';
import { Readable } from 'stream';
import { getDb } from '../db/db';

// OAuth Scopes required for Drive and Sheets
const SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/spreadsheets'
];

let driveClientInstance: drive_v3.Drive | null = null;
let googleAuthInstance: any = null;

// Search paths for credentials and token files
function findConfigFile(filename: string): string | null {
  const paths = [
    path.resolve(process.cwd(), filename),
    path.resolve(process.cwd(), '..', filename),
    path.resolve(process.cwd(), '../gdrive_image_scanner', filename),
    path.resolve(process.cwd(), '../pinterest_gdrive_agent', filename)
  ];
  for (const p of paths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }
  return null;
}

export function getGoogleAuth() {
  if (googleAuthInstance) return googleAuthInstance;

  let credentials;
  if (process.env.GOOGLE_CREDENTIALS_JSON) {
    credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
  } else {
    const credPath = findConfigFile('credentials.json');
    if (!credPath) {
      throw new Error('credentials.json not found or GOOGLE_CREDENTIALS_JSON environment variable is missing.');
    }
    credentials = JSON.parse(fs.readFileSync(credPath, 'utf8'));
  }

  const key = credentials.installed || credentials.web;
  if (!key) {
    throw new Error('Invalid credentials format. Expected OAuth2 client secrets.');
  }

  const auth = new google.auth.OAuth2(
    key.client_id,
    key.client_secret,
    key.redirect_uris ? key.redirect_uris[0] : 'http://localhost'
  );

  if (process.env.GOOGLE_TOKEN_JSON) {
    const token = JSON.parse(process.env.GOOGLE_TOKEN_JSON);
    auth.setCredentials(token);
    googleAuthInstance = auth;
    return auth;
  } else {
    const tokenPath = findConfigFile('token.json');
    if (tokenPath) {
      const token = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
      auth.setCredentials(token);
      googleAuthInstance = auth;
      return auth;
    }
  }

  throw new Error('token.json not found or GOOGLE_TOKEN_JSON environment variable is missing.');
}

export function getDriveClient(): drive_v3.Drive {
  if (driveClientInstance) return driveClientInstance;
  const auth = getGoogleAuth();
  driveClientInstance = google.drive({ version: 'v3', auth });
  return driveClientInstance;
}

// Helper to get or create a folder in Drive
export async function getOrCreateFolder(folderName: string, parentId?: string): Promise<string> {
  const drive = getDriveClient();
  let query = `name = '${folderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  if (parentId) {
    query += ` and '${parentId}' in parents`;
  } else {
    query += ` and 'root' in parents`;
  }

  const response = await drive.files.list({
    q: query,
    spaces: 'drive',
    fields: 'files(id, name)',
    pageSize: 1,
  });

  const files = response.data.files || [];
  if (files.length > 0 && files[0].id) {
    return files[0].id;
  }

  // Create folder
  const fileMetadata: drive_v3.Schema$File = {
    name: folderName,
    mimeType: 'application/vnd.google-apps.folder',
  };
  if (parentId) {
    fileMetadata.parents = [parentId];
  }

  const folder = await drive.files.create({
    requestBody: fileMetadata,
    fields: 'id',
  });

  if (!folder.data.id) {
    throw new Error(`Failed to create folder ${folderName}`);
  }
  return folder.data.id;
}

// Helper to get folder details (name and ID)
export async function getFolderDetails(folderId: string): Promise<{ name: string; id: string }> {
  const drive = getDriveClient();
  const response = await drive.files.get({
    fileId: folderId,
    fields: 'id, name, mimeType',
  });
  if (response.data.mimeType !== 'application/vnd.google-apps.folder') {
    throw new Error('Specified ID is not a folder');
  }
  return {
    name: response.data.name || 'Unnamed Folder',
    id: response.data.id || folderId,
  };
}

// Get folder structure and return folder IDs
export async function setupDriveFolders() {
  const db = await getDb();
  
  // Get settings names
  const incomingName = (await db.get("SELECT value FROM settings WHERE key = 'gdrive_incoming_folder'"))?.value || 'Incoming Images';
  const verifiedName = (await db.get("SELECT value FROM settings WHERE key = 'gdrive_verified_folder'"))?.value || 'Verified Images';
  const rejectedName = (await db.get("SELECT value FROM settings WHERE key = 'gdrive_rejected_folder'"))?.value || 'Rejected Images';

  // Get custom folder IDs if they exist
  let incomingId = (await db.get("SELECT value FROM settings WHERE key = 'gdrive_incoming_folder_id'"))?.value;
  let verifiedId = (await db.get("SELECT value FROM settings WHERE key = 'gdrive_verified_folder_id'"))?.value;
  let rejectedId = (await db.get("SELECT value FROM settings WHERE key = 'gdrive_rejected_folder_id'"))?.value;

  // Validate incoming ID
  if (incomingId) {
    try {
      await getFolderDetails(incomingId);
    } catch {
      incomingId = null;
    }
  }

  // Validate verified ID
  if (verifiedId) {
    try {
      await getFolderDetails(verifiedId);
    } catch {
      verifiedId = null;
    }
  }

  // Validate rejected ID
  if (rejectedId) {
    try {
      await getFolderDetails(rejectedId);
    } catch {
      rejectedId = null;
    }
  }

  // Fallback to name resolution if IDs are missing or invalid
  if (!incomingId || !verifiedId || !rejectedId) {
    const projectRootId = await getOrCreateFolder('Mehndi Scanner Project');
    
    if (!incomingId) {
      incomingId = await getOrCreateFolder(incomingName, projectRootId);
      await db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('gdrive_incoming_folder_id', ?)", incomingId);
    }
    
    if (!verifiedId) {
      verifiedId = await getOrCreateFolder(verifiedName, projectRootId);
      await db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('gdrive_verified_folder_id', ?)", verifiedId);
    }
    
    if (!rejectedId) {
      rejectedId = await getOrCreateFolder(rejectedName, projectRootId);
      await db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('gdrive_rejected_folder_id', ?)", rejectedId);
    }
  }

  return {
    incomingId,
    verifiedId,
    rejectedId,
  };
}


// List images in the Incoming Images folder (paginated to support >100 files)
export async function listIncomingImages(): Promise<drive_v3.Schema$File[]> {
  const drive = getDriveClient();
  const folders = await setupDriveFolders();
  
  const query = `'${folders.incomingId}' in parents and (mimeType = 'image/jpeg' or mimeType = 'image/png' or mimeType = 'image/webp') and trashed = false`;
  
  let files: drive_v3.Schema$File[] = [];
  let nextPageToken: string | undefined = undefined;
  
  do {
    const response = await drive.files.list({
      q: query,
      spaces: 'drive',
      fields: 'nextPageToken, files(id, name, mimeType, size, createdTime, webViewLink)',
      pageSize: 100,
      pageToken: nextPageToken,
    });
    
    const pageFiles = response.data.files || [];
    files = [...files, ...pageFiles];
    nextPageToken = response.data.nextPageToken || undefined;
    
    // Safety break to prevent memory issues on extremely large drives
    if (files.length >= 1000) {
      break;
    }
  } while (nextPageToken);

  return files;
}

// Download image binary data as a buffer
export async function downloadImageBuffer(fileId: string): Promise<Buffer> {
  const drive = getDriveClient();
  const response = await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'arraybuffer' }
  );
  return Buffer.from(response.data as ArrayBuffer);
}

// Move file from one folder to another
export async function moveFile(fileId: string, destinationFolderId: string): Promise<void> {
  const drive = getDriveClient();
  
  // 1. Retrieve the current parents
  const file = await drive.files.get({
    fileId,
    fields: 'parents',
  });
  
  const previousParents = file.data.parents || [];
  
  // 2. Move file
  await drive.files.update({
    fileId,
    addParents: destinationFolderId,
    removeParents: previousParents.join(','),
    fields: 'id, parents',
  });
}

// Delete file from Google Drive
export async function deleteFile(fileId: string): Promise<void> {
  const drive = getDriveClient();
  await drive.files.delete({ fileId });
}

// Upload buffer directly to Google Drive
export async function uploadFile(
  name: string,
  buffer: Buffer,
  mimeType: string,
  parentFolderId: string
): Promise<string> {
  const drive = getDriveClient();
  const file = await drive.files.create({
    requestBody: {
      name,
      parents: [parentFolderId]
    },
    media: {
      mimeType,
      body: Readable.from(buffer)
    },
    fields: 'id'
  });
  if (!file.data.id) {
    throw new Error(`Failed to upload file ${name} to Google Drive`);
  }

  // Set file permissions so anyone with the link can view it (preventing 404/403 errors in Google Sheets links)
  try {
    await drive.permissions.create({
      fileId: file.data.id,
      requestBody: {
        role: 'reader',
        type: 'anyone'
      }
    });
    console.log(`Set public read permission for file: ${name} (ID: ${file.data.id})`);
  } catch (permErr) {
    console.error(`Failed to set public read permission on file ${file.data.id}:`, permErr);
  }

  return file.data.id;
}
