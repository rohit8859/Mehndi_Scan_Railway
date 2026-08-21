'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to the main review dashboard page
    router.push('/dashboard');
  }, [router]);

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-white">
      <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-amber-500"></div>
    </div>
  );
}
