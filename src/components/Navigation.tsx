'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LayoutDashboard, BarChart3, Settings, LogOut, Moon, Sun, UserCheck, Menu, X } from 'lucide-react';

export default function Navigation() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<{ username: string; role: string } | null>(null);
  const [darkMode, setDarkMode] = useState<boolean>(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);

  // Check auth session
  useEffect(() => {
    async function checkAuth() {
      try {
        const res = await fetch('/api/auth');
        if (res.status === 401) {
          router.push('/login');
        } else {
          const data = await res.json();
          setUser(data.user);
        }
      } catch (err) {
        console.error('Failed checking auth', err);
      }
    }
    checkAuth();

    // Load theme
    const theme = localStorage.getItem('theme');
    if (theme === 'dark' || (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      document.documentElement.classList.add('dark');
      setDarkMode(true);
    } else {
      document.documentElement.classList.remove('dark');
      setDarkMode(false);
    }
  }, [router]);

  const toggleDarkMode = () => {
    if (darkMode) {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
      setDarkMode(false);
    } else {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
      setDarkMode(true);
    }
  };

  const handleLogout = async () => {
    try {
      const res = await fetch('/api/auth', { method: 'DELETE' });
      if (res.ok) {
        router.push('/login');
      }
    } catch (err) {
      console.error('Logout failed', err);
    }
  };

  const menuItems = [
    { name: 'Review Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { name: 'Analytics', href: '/analytics', icon: BarChart3 },
    { name: 'Settings', href: '/settings', icon: Settings },
  ];

  return (
    <>
      {/* Mobile Top Header (In-flow flex layout element) */}
      <header className="md:hidden flex items-center justify-between h-16 bg-amber-955 dark:bg-zinc-950 border-b border-amber-900/30 dark:border-zinc-800 px-4 text-white w-full shrink-0 z-30">
        <Link href="/dashboard" className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-amber-500 flex items-center justify-center">
            <span className="font-serif font-bold text-base text-amber-955">M</span>
          </div>
          <span className="font-serif font-semibold text-base tracking-wider text-amber-100">MehSang</span>
        </Link>
        
        <button
          onClick={() => setMobileMenuOpen(true)}
          className="p-2 rounded-lg bg-zinc-900/50 border border-zinc-800 text-amber-400 hover:text-white"
          title="Open Menu"
        >
          <Menu className="w-5 h-5" />
        </button>
      </header>

      {/* Mobile Menu Drawer Overlay */}
      {mobileMenuOpen && (
        <div 
          className="md:hidden fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex justify-end"
          onClick={() => setMobileMenuOpen(false)}
        >
          <div 
            className="w-64 h-full bg-amber-955 dark:bg-zinc-950 border-l border-amber-900/30 dark:border-zinc-800 flex flex-col p-5 text-white animate-in slide-in-from-right duration-250"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header / Close button */}
            <div className="flex items-center justify-between pb-4 border-b border-amber-900/20 dark:border-zinc-800 mb-6">
              <span className="font-serif font-bold text-base text-amber-100">Portal Navigation</span>
              <button 
                onClick={() => setMobileMenuOpen(false)}
                className="p-1 rounded-lg bg-zinc-900/80 border border-zinc-800 text-zinc-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Menu Links */}
            <nav className="flex-1 space-y-2">
              {menuItems.map((item) => {
                const isActive = pathname === item.href;
                const Icon = item.icon;
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                      isActive
                        ? 'bg-amber-500 text-amber-955 shadow-lg font-bold'
                        : 'text-amber-200/70 hover:text-white hover:bg-amber-900/20'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    <span>{item.name}</span>
                  </Link>
                );
              })}
            </nav>

            {/* Footer User Info */}
            <div className="border-t border-amber-900/20 dark:border-zinc-800 pt-4 space-y-4">
              {user && (
                <div className="flex items-center gap-3 px-2">
                  <div className="w-8 h-8 rounded-full bg-amber-900/50 dark:bg-zinc-850 flex items-center justify-center text-amber-400">
                    <UserCheck className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] text-amber-400 font-sans tracking-wide uppercase -mb-0.5">{user.role}</p>
                    <p className="text-sm font-semibold truncate text-amber-100">{user.username}</p>
                  </div>
                </div>
              )}

              {/* Drawer Action Controls */}
              <div className="flex gap-2">
                <button
                  onClick={toggleDarkMode}
                  className="p-2 rounded-xl bg-amber-900/20 dark:bg-zinc-900 hover:bg-amber-900/40 text-amber-200 hover:text-white transition-all"
                  title="Toggle Theme"
                >
                  {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                </button>
                <button
                  onClick={handleLogout}
                  className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl bg-red-950/20 hover:bg-red-950/40 text-red-400 font-semibold text-xs uppercase tracking-wider transition-all"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Logout</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Desktop Sidebar (visible on md and up) */}
      <aside className="hidden md:flex w-64 bg-amber-955 dark:bg-zinc-950 text-white flex-col border-r border-amber-900/30 dark:border-zinc-800 transition-all duration-300 shrink-0">
        {/* Brand Logo */}
        <div className="h-20 flex items-center px-6 border-b border-amber-900/30 dark:border-zinc-800">
          <Link href="/dashboard" className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500 flex items-center justify-center shadow-lg shadow-amber-500/20">
              <span className="font-serif font-bold text-xl text-amber-955">M</span>
            </div>
            <div>
              <span className="font-serif font-semibold text-lg tracking-wider block text-amber-100">MehSang</span>
              <span className="text-xs text-amber-400/80 font-sans tracking-widest block uppercase -mt-1">Studio Portal</span>
            </div>
          </Link>
        </div>

        {/* Nav Menu */}
        <nav className="flex-1 py-6 px-4 space-y-1.5">
          {menuItems.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? 'bg-amber-500 text-amber-955 shadow-lg shadow-amber-500/10'
                    : 'text-amber-200/70 hover:text-white hover:bg-amber-900/20 dark:text-zinc-400 dark:hover:bg-zinc-900/50'
                }`}
              >
                <Icon className="w-5 h-5 shrink-0" />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>

        {/* Footer Details */}
        <div className="p-4 border-t border-amber-900/30 dark:border-zinc-800 space-y-4">
          {/* User Card */}
          {user && (
            <div className="flex items-center gap-3 px-2 py-1">
              <div className="w-8 h-8 rounded-full bg-amber-900/50 dark:bg-zinc-800 flex items-center justify-center text-amber-400">
                <UserCheck className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-amber-400 font-sans tracking-wide uppercase -mb-0.5">{user.role}</p>
                <p className="text-sm font-semibold truncate text-amber-100">{user.username}</p>
              </div>
            </div>
          )}

          {/* Action Controls */}
          <div className="flex items-center justify-between gap-2 border-t border-amber-900/20 dark:border-zinc-800/50 pt-3">
            <button
              onClick={toggleDarkMode}
              className="p-2 rounded-xl bg-amber-900/20 dark:bg-zinc-900 hover:bg-amber-900/40 dark:hover:bg-zinc-800 text-amber-200/80 hover:text-white transition-all"
              title="Toggle Theme"
            >
              {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
            
            <button
              onClick={handleLogout}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-red-950/20 hover:bg-red-950/40 dark:bg-zinc-900 dark:hover:bg-red-950/30 text-red-400/90 hover:text-red-300 font-medium text-xs tracking-wider uppercase transition-all"
            >
              <LogOut className="w-4 h-4" />
              <span>Logout</span>
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
