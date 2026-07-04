'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles, Lock, User, AlertCircle } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Authentication failed');
      }

      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-amber-955 via-amber-950 to-zinc-950 px-4 relative overflow-hidden font-sans">
      {/* Decorative background mandalas */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-amber-500/5 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20"></div>
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-amber-500/5 rounded-full blur-3xl pointer-events-none -ml-20 -mb-20"></div>

      <div className="w-full max-w-md bg-zinc-900/40 backdrop-blur-xl border border-amber-900/20 dark:border-zinc-800 rounded-3xl p-8 shadow-2xl relative z-10">
        {/* Logo and header */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-amber-500 flex items-center justify-center mx-auto shadow-lg shadow-amber-500/20 mb-4 animate-pulse">
            <Sparkles className="w-8 h-8 text-amber-950" />
          </div>
          <h1 className="font-serif text-3xl font-bold tracking-wide text-amber-100">MehSang</h1>
          <p className="text-xs text-amber-400 font-sans tracking-widest uppercase mt-1">Mehndi Image verification portal</p>
        </div>

        {/* Error panel */}
        {error && (
          <div className="mb-6 p-4 rounded-xl bg-red-950/20 border border-red-900/30 text-red-400 flex items-start gap-3 text-sm">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Login form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-xs font-semibold text-amber-200/70 tracking-wider uppercase mb-1.5">Username</label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-amber-500/60">
                <User className="w-5 h-5" />
              </span>
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter username"
                className="w-full bg-zinc-950/40 border border-amber-900/20 focus:border-amber-500/55 rounded-xl py-3 pl-11 pr-4 text-white placeholder-zinc-500 text-sm focus:outline-none transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-amber-200/70 tracking-wider uppercase mb-1.5">Password</label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-amber-500/60">
                <Lock className="w-5 h-5" />
              </span>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                className="w-full bg-zinc-950/40 border border-amber-900/20 focus:border-amber-500/55 rounded-xl py-3 pl-11 pr-4 text-white placeholder-zinc-500 text-sm focus:outline-none transition-all"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-amber-500 hover:bg-amber-400 disabled:bg-amber-600 text-amber-955 font-semibold py-3 px-4 rounded-xl shadow-lg shadow-amber-500/10 hover:shadow-amber-500/20 active:scale-[0.98] transition-all duration-200 text-sm flex items-center justify-center"
          >
            {loading ? 'Authenticating...' : 'Sign In'}
          </button>
        </form>

        {/* Credentials guide */}
        <div className="mt-8 pt-6 border-t border-amber-900/10 text-center">
          <p className="text-xs text-amber-200/40 uppercase tracking-widest mb-3">Predefined Portal Roles</p>
          <div className="grid grid-cols-2 gap-3 text-left">
            <div className="p-3 bg-zinc-950/30 rounded-xl border border-amber-900/5">
              <p className="text-[10px] text-amber-500 font-bold uppercase tracking-wider">Admin</p>
              <p className="text-xs text-zinc-400 mt-1 font-mono">User: admin</p>
              <p className="text-xs text-zinc-400 font-mono">Pass: adminpassword</p>
            </div>
            <div className="p-3 bg-zinc-950/30 rounded-xl border border-amber-900/5">
              <p className="text-[10px] text-amber-500 font-bold uppercase tracking-wider">Reviewer</p>
              <p className="text-xs text-zinc-400 mt-1 font-mono">User: reviewer</p>
              <p className="text-xs text-zinc-400 font-mono">Pass: reviewerpassword</p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
