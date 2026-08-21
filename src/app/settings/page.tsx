'use client';

import React, { useEffect, useState, useRef } from 'react';
import Navigation from '@/components/Navigation';
import { 
  Settings as SettingsIcon, 
  FolderSync, 
  Database, 
  ShieldAlert, 
  Save, 
  Play, 
  Loader2, 
  CheckCircle,
  FileSpreadsheet,
  Brain,
  AlertTriangle
} from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function SettingsPage() {
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);

  // Settings states
  const [incomingFolder, setIncomingFolder] = useState('');
  const [verifiedFolder, setVerifiedFolder] = useState('');
  const [rejectedFolder, setRejectedFolder] = useState('');
  const [incomingFolderId, setIncomingFolderId] = useState('');
  const [verifiedFolderId, setVerifiedFolderId] = useState('');
  const [rejectedFolderId, setRejectedFolderId] = useState('');
  const [folderMode, setFolderMode] = useState<'NAME' | 'ID'>('NAME');

  const [incomingFolderStatus, setIncomingFolderStatus] = useState<string>('');
  const [verifiedFolderStatus, setVerifiedFolderStatus] = useState<string>('');
  const [rejectedFolderStatus, setRejectedFolderStatus] = useState<string>('');

  const [activeAIModel, setActiveAIModel] = useState('gpt-4o-mini');
  const [openaiApiKey, setOpenaiApiKey] = useState('');
  const [googleSpreadsheetId, setGoogleSpreadsheetId] = useState('');
  const [googleSheetName, setGoogleSheetName] = useState('Sheet1');
  const [autoApproveEnabled, setAutoApproveEnabled] = useState(false);
  const [autoApproveThreshold, setAutoApproveThreshold] = useState(95);
  const [groqApiKey, setGroqApiKey] = useState('');
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [openrouterApiKey, setOpenrouterApiKey] = useState('');

  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const verifyFolderId = async (folderId: string, setStatus: (s: string) => void) => {
    if (!folderId || folderId.length < 15) {
      setStatus('');
      return;
    }
    setStatus('Verifying folder access...');
    try {
      const res = await fetch(`/api/settings/verify-folder?folderId=${encodeURIComponent(folderId)}`);
      const data = await res.json();
      if (data.success) {
        setStatus(`Resolved: "${data.name}"`);
      } else {
        setStatus(`Error: ${data.error || 'Inaccessible'}`);
      }
    } catch {
      setStatus('Connection error');
    }
  };

  // Run live verification when Folder IDs change
  useEffect(() => {
    if (incomingFolderId && folderMode === 'ID') {
      verifyFolderId(incomingFolderId, setIncomingFolderStatus);
    } else {
      setIncomingFolderStatus('');
    }
  }, [incomingFolderId, folderMode]);

  useEffect(() => {
    if (verifiedFolderId && folderMode === 'ID') {
      verifyFolderId(verifiedFolderId, setVerifiedFolderStatus);
    } else {
      setVerifiedFolderStatus('');
    }
  }, [verifiedFolderId, folderMode]);

  useEffect(() => {
    if (rejectedFolderId && folderMode === 'ID') {
      verifyFolderId(rejectedFolderId, setRejectedFolderStatus);
    } else {
      setRejectedFolderStatus('');
    }
  }, [rejectedFolderId, folderMode]);

  // Scan progress state
  const [scanActive, setScanActive] = useState(false);
  const [scanTotal, setScanTotal] = useState(0);
  const [scanProcessed, setScanProcessed] = useState(0);
  const [scanCurrentFile, setScanCurrentFile] = useState('');
  const [scanErrors, setScanErrors] = useState<string[]>([]);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Auth check & load settings
  useEffect(() => {
    async function checkAuthAndLoadSettings() {
      try {
        const authRes = await fetch('/api/auth');
        if (authRes.status === 401) {
          router.push('/login');
          return;
        }

        const authData = await authRes.json();
        if (authData.user.role === 'ADMIN') {
          setIsAdmin(true);
        }

        // Fetch settings from DB
        const settingsRes = await fetch('/api/settings');
        if (settingsRes.ok) {
          const settings = await settingsRes.json();
          setIncomingFolder(settings.gdrive_incoming_folder || 'Incoming Images');
          setVerifiedFolder(settings.gdrive_verified_folder || 'Verified Images');
          setRejectedFolder(settings.gdrive_rejected_folder || 'Rejected Images');
          setIncomingFolderId(settings.gdrive_incoming_folder_id || '');
          setVerifiedFolderId(settings.gdrive_verified_folder_id || '');
          setRejectedFolderId(settings.gdrive_rejected_folder_id || '');
          setFolderMode(settings.gdrive_folder_mode || 'NAME');
          setActiveAIModel(settings.active_ai_model || 'gpt-4o-mini');
          setOpenaiApiKey(settings.openai_api_key || '');
          setGeminiApiKey(settings.gemini_api_key || '');
          setGroqApiKey(settings.groq_api_key || '');
          setOpenrouterApiKey(settings.openrouter_api_key || '');
          setGoogleSpreadsheetId(settings.google_spreadsheet_id || '');
          setGoogleSheetName(settings.google_sheet_name || 'Sheet1');
          setAutoApproveEnabled(settings.auto_approve_enabled === 'true');
          setAutoApproveThreshold(parseInt(settings.auto_approve_threshold || '95'));
        }
      } catch (err) {
        console.error('Error loading settings page:', err);
      } finally {
        setAuthLoading(false);
      }
    }
    checkAuthAndLoadSettings();
  }, [router]);

  // Clean up poll interval on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []);

  // Save Settings handler
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) {
      showToast('Only administrators can edit configuration settings', 'error');
      return;
    }
    setSaving(true);

    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gdrive_incoming_folder: incomingFolder,
          gdrive_verified_folder: verifiedFolder,
          gdrive_rejected_folder: rejectedFolder,
          gdrive_incoming_folder_id: incomingFolderId,
          gdrive_verified_folder_id: verifiedFolderId,
          gdrive_rejected_folder_id: rejectedFolderId,
          gdrive_folder_mode: folderMode,
          active_ai_model: activeAIModel,
          openai_api_key: openaiApiKey,
          gemini_api_key: geminiApiKey,
          groq_api_key: groqApiKey,
          openrouter_api_key: openrouterApiKey,
          google_spreadsheet_id: googleSpreadsheetId,
          google_sheet_name: googleSheetName,
          auto_approve_enabled: String(autoApproveEnabled),
          auto_approve_threshold: String(autoApproveThreshold),
        }),
      });

      if (res.ok) {
        showToast('Settings saved successfully', 'success');
      } else {
        showToast('Failed to save settings to database', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('Network error while saving', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Poll scan progress helper
  const startPollingProgress = () => {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    
    pollIntervalRef.current = setInterval(async () => {
      try {
        const res = await fetch('/api/scanner');
        if (res.ok) {
          const status = await res.json();
          setScanActive(status.active);
          setScanTotal(status.total);
          setScanProcessed(status.processed);
          setScanCurrentFile(status.currentFile);
          setScanErrors(status.errors);

          if (!status.active) {
            if (pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current);
              pollIntervalRef.current = null;
            }
            showToast('Scanning sweep finished', 'success');
          }
        }
      } catch (err) {
        console.error('Error polling scanner', err);
      }
    }, 1500);
  };

  // Start folder scan now
  const handleTriggerScan = async () => {
    setScanActive(true);
    setScanTotal(0);
    setScanProcessed(0);
    setScanCurrentFile('Starting GDrive connection...');
    setScanErrors([]);

    try {
      const res = await fetch('/api/scanner', { method: 'POST' });
      if (res.status === 202) {
        showToast('Scanning pipeline triggered in background', 'success');
        startPollingProgress();
      } else {
        const data = await res.json();
        showToast(data.error || 'Failed to start scan', 'error');
        setScanActive(false);
      }
    } catch (err) {
      console.error(err);
      showToast('Failed to connect to scanner API', 'error');
      setScanActive(false);
    }
  };

  if (authLoading) {
    return (
      <div className="flex flex-col md:flex-row h-screen bg-zinc-900 text-zinc-100 font-sans overflow-hidden">
        <Navigation />
        <main className="flex-1 flex flex-col items-center justify-center gap-2">
          <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
          <p className="text-sm text-zinc-500">Checking credentials...</p>
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col md:flex-row h-screen bg-zinc-900 text-zinc-100 font-sans overflow-hidden">
      <Navigation />

      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-5 right-5 px-5 py-3.5 rounded-xl border text-sm font-semibold shadow-2xl z-50 transition-all flex items-center gap-2 ${
            toast.type === 'success'
              ? 'bg-emerald-950/40 text-emerald-400 border-emerald-900/30'
              : 'bg-rose-950/40 text-rose-400 border-rose-900/30'
          }`}
        >
          {toast.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <ShieldAlert className="w-4 h-4" />}
          <span>{toast.message}</span>
        </div>
      )}

      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto p-6 space-y-6">
        
        {/* Header */}
        <header className="flex justify-between items-center border-b border-zinc-800 pb-4 shrink-0">
          <div>
            <h1 className="text-2xl font-serif font-bold tracking-wide text-amber-100">System Connections & Settings</h1>
            <p className="text-xs text-zinc-500 mt-1">Configure directories, credentials, active models, and sheets integration</p>
          </div>
        </header>

        {/* Not authorized for Reviewer role */}
        {!isAdmin ? (
          <div className="bg-amber-950/20 border border-amber-900/40 rounded-3xl p-6 flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500 shrink-0">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-serif font-bold text-amber-200">Limited Access Role</h3>
              <p className="text-xs text-zinc-400 mt-1 leading-relaxed max-w-2xl">
                Your current account has a <strong>Reviewer</strong> role. Reviewers are authorized to run image validations, edit categories, and submit decisions on pending reviews. Only <strong>Admins</strong> can change folder mappings, API keys, or sheets credentials.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Form settings */}
            <form onSubmit={handleSaveSettings} className="col-span-1 lg:col-span-2 space-y-6">
              
              {/* Google Drive Paths */}
              <div className="bg-zinc-950/20 border border-zinc-850 p-6 rounded-3xl space-y-4">
                <div className="flex justify-between items-center border-b border-zinc-800 pb-2">
                  <h3 className="font-serif font-bold text-sm text-zinc-200 flex items-center gap-2">
                    <FolderSync className="w-4 h-4 text-amber-500" />
                    <span>Google Drive Folder Configuration</span>
                  </h3>
                  <div className="flex bg-zinc-900 rounded-lg p-0.5 border border-zinc-800">
                    <button
                      type="button"
                      onClick={() => setFolderMode('NAME')}
                      className={`px-3 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all ${
                        folderMode === 'NAME' ? 'bg-amber-500 text-amber-955' : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      By Folder Name
                    </button>
                    <button
                      type="button"
                      onClick={() => setFolderMode('ID')}
                      className={`px-3 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all ${
                        folderMode === 'ID' ? 'bg-amber-500 text-amber-955' : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      By Folder ID
                    </button>
                  </div>
                </div>

                {folderMode === 'NAME' ? (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5">Incoming Folder</label>
                      <input
                        type="text"
                        required
                        value={incomingFolder}
                        onChange={(e) => setIncomingFolder(e.target.value)}
                        className="w-full bg-zinc-900 border border-zinc-800 focus:border-amber-500/50 rounded-xl py-2 px-3 text-xs focus:outline-none text-white transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5">Verified Folder</label>
                      <input
                        type="text"
                        required
                        value={verifiedFolder}
                        onChange={(e) => setVerifiedFolder(e.target.value)}
                        className="w-full bg-zinc-900 border border-zinc-800 focus:border-amber-500/50 rounded-xl py-2 px-3 text-xs focus:outline-none text-white transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5">Rejected Folder</label>
                      <input
                        type="text"
                        required
                        value={rejectedFolder}
                        onChange={(e) => setRejectedFolder(e.target.value)}
                        className="w-full bg-zinc-900 border border-zinc-800 focus:border-amber-500/50 rounded-xl py-2 px-3 text-xs focus:outline-none text-white transition-all"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5">Incoming Folder ID</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. 1aBCDeFGhI..."
                        value={incomingFolderId}
                        onChange={(e) => setIncomingFolderId(e.target.value)}
                        className="w-full bg-zinc-900 border border-zinc-800 focus:border-amber-500/50 rounded-xl py-2 px-3 text-xs focus:outline-none text-white transition-all font-mono"
                      />
                      {incomingFolderStatus && (
                        <span className={`text-[10px] mt-1 block ${incomingFolderStatus.startsWith('Error') ? 'text-red-400' : incomingFolderStatus.startsWith('Verifying') ? 'text-zinc-550' : 'text-emerald-400'}`}>
                          {incomingFolderStatus}
                        </span>
                      )}
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5">Verified Folder ID</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. 1aBCDeFGhI..."
                        value={verifiedFolderId}
                        onChange={(e) => setVerifiedFolderId(e.target.value)}
                        className="w-full bg-zinc-900 border border-zinc-800 focus:border-amber-500/50 rounded-xl py-2 px-3 text-xs focus:outline-none text-white transition-all font-mono"
                      />
                      {verifiedFolderStatus && (
                        <span className={`text-[10px] mt-1 block ${verifiedFolderStatus.startsWith('Error') ? 'text-red-400' : verifiedFolderStatus.startsWith('Verifying') ? 'text-zinc-550' : 'text-emerald-400'}`}>
                          {verifiedFolderStatus}
                        </span>
                      )}
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5">Rejected Folder ID</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. 1aBCDeFGhI..."
                        value={rejectedFolderId}
                        onChange={(e) => setRejectedFolderId(e.target.value)}
                        className="w-full bg-zinc-900 border border-zinc-800 focus:border-amber-500/50 rounded-xl py-2 px-3 text-xs focus:outline-none text-white transition-all font-mono"
                      />
                      {rejectedFolderStatus && (
                        <span className={`text-[10px] mt-1 block ${rejectedFolderStatus.startsWith('Error') ? 'text-red-400' : rejectedFolderStatus.startsWith('Verifying') ? 'text-zinc-550' : 'text-emerald-400'}`}>
                          {rejectedFolderStatus}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Google Sheets Export */}
              <div className="bg-zinc-950/20 border border-zinc-850 p-6 rounded-3xl space-y-4">
                <h3 className="font-serif font-bold text-sm text-zinc-200 flex items-center gap-2">
                  <FileSpreadsheet className="w-4 h-4 text-amber-500" />
                  <span>Google Sheets Sync Integration</span>
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5">Google Spreadsheet ID</label>
                    <input
                      type="text"
                      placeholder="e.g. 1aBCDeFGhIjkLmnOpQrSTuVWxyZ"
                      value={googleSpreadsheetId}
                      onChange={(e) => setGoogleSpreadsheetId(e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-800 focus:border-amber-500/50 rounded-xl py-2 px-3 text-xs focus:outline-none text-white transition-all font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5">Sheet Name</label>
                    <input
                      type="text"
                      value={googleSheetName}
                      onChange={(e) => setGoogleSheetName(e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-800 focus:border-amber-500/50 rounded-xl py-2 px-3 text-xs focus:outline-none text-white transition-all"
                    />
                  </div>
                </div>
              </div>



              {/* Save Button */}
              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-amber-955 font-bold py-2.5 px-6 rounded-xl shadow-lg shadow-amber-500/10 active:scale-[0.98] transition-all flex items-center gap-2 text-xs uppercase tracking-wider"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  <span>Save Configuration</span>
                </button>
              </div>

            </form>

            {/* Run Sweeper Side Panel */}
            <div className="space-y-6">
              
              {/* Scan Now trigger card */}
              <div className="bg-zinc-900 border border-zinc-850 p-6 rounded-3xl space-y-4">
                <h3 className="font-serif font-bold text-sm text-zinc-200 flex items-center gap-2">
                  <FolderSync className="w-4 h-4 text-amber-500" />
                  <span>Manual Directory Scanning</span>
                </h3>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Trigger an immediate manual scan sweep of the connected Google Drive folder. This processes newly uploaded mehndi images and stores results in the pending review database.
                </p>
                <button
                  onClick={handleTriggerScan}
                  disabled={scanActive}
                  className="w-full bg-zinc-950 border border-zinc-805 hover:bg-zinc-900 disabled:opacity-40 text-amber-400 font-bold py-3 px-4 rounded-xl transition-all flex items-center justify-center gap-2 text-xs uppercase tracking-wider"
                >
                  {scanActive ? <Loader2 className="w-4 h-4 animate-spin text-amber-500" /> : <Play className="w-4 h-4 fill-current" />}
                  <span>Scan Incoming Folder Now</span>
                </button>
              </div>

              {/* Scan progress monitor (visible when scan is active or recently completed) */}
              {(scanActive || scanTotal > 0) && (
                <div className="bg-zinc-900 border border-zinc-850 p-6 rounded-3xl space-y-4 animate-in fade-in duration-200">
                  <div className="flex items-center justify-between border-b border-zinc-850 pb-2">
                    <h4 className="text-xs font-bold text-zinc-300 uppercase tracking-wider">Scanner progress</h4>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 font-bold font-mono">
                      {scanActive ? 'Scanning' : 'Finished'}
                    </span>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between text-xs font-semibold">
                      <span className="text-zinc-400">Processed</span>
                      <span className="text-zinc-200 font-mono">{scanProcessed} / {scanTotal} files</span>
                    </div>
                    
                    {/* Progress Bar */}
                    <div className="w-full bg-zinc-950 h-2 rounded-full overflow-hidden border border-zinc-800">
                      <div
                        className="bg-amber-500 h-full rounded-full transition-all duration-300"
                        style={{ width: `${scanTotal > 0 ? (scanProcessed / scanTotal) * 100 : 0}%` }}
                      ></div>
                    </div>
                  </div>

                  {scanCurrentFile && (
                    <div className="text-[10px] text-zinc-500 truncate leading-relaxed">
                      <strong className="text-zinc-400">Current file:</strong> {scanCurrentFile}
                    </div>
                  )}

                  {scanErrors.length > 0 && (
                    <div className="space-y-1.5 p-3 bg-red-950/10 border border-red-900/30 rounded-xl max-h-36 overflow-y-auto">
                      <div className="flex items-center gap-1.5 text-xs text-red-400 font-semibold uppercase">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        <span>Errors encountered ({scanErrors.length})</span>
                      </div>
                      <div className="space-y-1 font-mono text-[9px] text-zinc-400 leading-normal">
                        {scanErrors.map((err, idx) => (
                          <div key={idx} className="border-b border-red-900/10 pb-1 last:border-0 last:pb-0">
                            • {err}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

            </div>

          </div>
        )}

      </main>
    </div>
  );
}
