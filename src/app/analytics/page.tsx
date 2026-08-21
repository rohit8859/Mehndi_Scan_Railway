'use client';

import React, { useEffect, useState } from 'react';
import Navigation from '@/components/Navigation';
import { 
  BarChart, 
  TrendingUp, 
  Sparkles, 
  ShieldCheck, 
  AlertCircle, 
  IndianRupee,
  Compass, 
  Tags,
  Layers,
  Award,
  Loader2,
  XCircle
} from 'lucide-react';

interface MetricStats {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  avgConfidence: number;
  avgPrice: number;
  mostCommonStyle: string;
  mostCommonOccasion: string;
  mostCommonCoverage: string;
  mostCommonElement: string;
}

interface ChartItem {
  date_label?: string;
  style?: string;
  complexity?: string;
  coverage?: string;
  name?: string;
  count: number;
}

interface AnalyticsData {
  metrics: MetricStats;
  charts: {
    dailyUploads: ChartItem[];
    topStyles: ChartItem[];
    complexities: ChartItem[];
    coverages: ChartItem[];
    elements: ChartItem[];
  };
}

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchAnalytics() {
      try {
        const res = await fetch('/api/analytics');
        if (res.ok) {
          const payload = await res.json();
          setData(payload);
        }
      } catch (err) {
        console.error('Error fetching analytics', err);
      } finally {
        setLoading(false);
      }
    }
    fetchAnalytics();
  }, []);

  if (loading) {
    return (
      <div className="flex h-screen bg-zinc-900 text-zinc-100 font-sans overflow-hidden">
        <Navigation />
        <main className="flex-1 flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
          <p className="text-sm text-zinc-500">Loading MehSang analytics...</p>
        </main>
      </div>
    );
  }

  const metrics = data?.metrics || {
    total: 0,
    pending: 0,
    approved: 0,
    rejected: 0,
    avgConfidence: 0,
    avgPrice: 0,
    mostCommonStyle: 'N/A',
    mostCommonOccasion: 'N/A',
    mostCommonCoverage: 'N/A',
    mostCommonElement: 'N/A',
  };

  const charts = data?.charts || {
    dailyUploads: [],
    topStyles: [],
    complexities: [],
    coverages: [],
    elements: [],
  };

  // Helper to find max count for scaling charts
  const getMaxCount = (items: ChartItem[]) => {
    if (items.length === 0) return 1;
    return Math.max(...items.map(item => item.count), 1);
  };

  const maxUploads = getMaxCount(charts.dailyUploads);
  const maxStyles = getMaxCount(charts.topStyles);
  const maxComplexity = getMaxCount(charts.complexities);

  return (
    <div className="flex flex-col md:flex-row h-screen bg-zinc-900 text-zinc-100 font-sans overflow-hidden">
      <Navigation />

      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto p-6 space-y-6">
        
        {/* Header */}
        <header className="flex justify-between items-center border-b border-zinc-800 pb-4">
          <div>
            <h1 className="text-2xl font-serif font-bold tracking-wide text-amber-100">MehSang Studio Analytics</h1>
            <p className="text-xs text-zinc-500 mt-1">Live predictions, verification metrics, and styling insights</p>
          </div>
          <div className="flex items-center gap-2 text-xs bg-zinc-950/60 border border-zinc-800 rounded-xl px-3 py-1.5 text-zinc-400 font-medium">
            <Compass className="w-4 h-4 text-amber-500" />
            <span>Updated Just Now</span>
          </div>
        </header>

        {/* 1. Statistics Cards */}
        <section className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
          
          <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-2xl relative overflow-hidden group hover:border-amber-500/20 transition-all">
            <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-semibold">Total Scanned</p>
            <h3 className="text-3xl font-serif font-bold mt-2 text-amber-500">{metrics.total}</h3>
            <div className="absolute right-3 bottom-3 text-zinc-800 group-hover:text-amber-500/10 transition-colors">
              <BarChart className="w-8 h-8" />
            </div>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-2xl relative overflow-hidden group hover:border-amber-500/20 transition-all">
            <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-semibold">Pending Review</p>
            <h3 className="text-3xl font-serif font-bold mt-2 text-amber-400">{metrics.pending}</h3>
            <div className="absolute right-3 bottom-3 text-zinc-800 group-hover:text-amber-400/10 transition-colors">
              <AlertCircle className="w-8 h-8" />
            </div>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-2xl relative overflow-hidden group hover:border-amber-500/20 transition-all">
            <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-semibold">Approved Designs</p>
            <h3 className="text-3xl font-serif font-bold mt-2 text-emerald-500">{metrics.approved}</h3>
            <div className="absolute right-3 bottom-3 text-zinc-800 group-hover:text-emerald-500/10 transition-colors">
              <ShieldCheck className="w-8 h-8" />
            </div>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-2xl relative overflow-hidden group hover:border-amber-500/20 transition-all">
            <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-semibold">Rejected Designs</p>
            <h3 className="text-3xl font-serif font-bold mt-2 text-rose-500">{metrics.rejected}</h3>
            <div className="absolute right-3 bottom-3 text-zinc-800 group-hover:text-rose-500/10 transition-colors">
              <XCircle className="w-8 h-8" />
            </div>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-2xl relative overflow-hidden group hover:border-amber-500/20 transition-all">
            <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-semibold">Avg Price (INR)</p>
            <h3 className="text-3xl font-serif font-bold mt-2 text-amber-100">₹{metrics.avgPrice}</h3>
            <div className="absolute right-3 bottom-3 text-zinc-800 group-hover:text-amber-100/10 transition-colors">
              <IndianRupee className="w-8 h-8" />
            </div>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-2xl relative overflow-hidden group hover:border-amber-500/20 transition-all">
            <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-semibold">AI Confidence</p>
            <h3 className="text-3xl font-serif font-bold mt-2 text-emerald-400">{metrics.avgConfidence}%</h3>
            <div className="absolute right-3 bottom-3 text-zinc-800 group-hover:text-emerald-400/10 transition-colors">
              <Sparkles className="w-8 h-8" />
            </div>
          </div>

        </section>

        {/* 2. Top Styles & Occasion Common Cards */}
        <section className="grid grid-cols-4 gap-4">
          <div className="bg-zinc-900/60 border border-zinc-800 p-4 rounded-2xl flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500">
              <Compass className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[10px] text-zinc-500 uppercase font-semibold">Most Popular Style</p>
              <h4 className="text-sm font-bold text-zinc-200 mt-0.5">{metrics.mostCommonStyle}</h4>
            </div>
          </div>

          <div className="bg-zinc-900/60 border border-zinc-800 p-4 rounded-2xl flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500">
              <Award className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[10px] text-zinc-500 uppercase font-semibold">Main Occasion</p>
              <h4 className="text-sm font-bold text-zinc-200 mt-0.5">{metrics.mostCommonOccasion}</h4>
            </div>
          </div>

          <div className="bg-zinc-900/60 border border-zinc-800 p-4 rounded-2xl flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[10px] text-zinc-500 uppercase font-semibold">Average Coverage</p>
              <h4 className="text-sm font-bold text-zinc-200 mt-0.5">{metrics.mostCommonCoverage}</h4>
            </div>
          </div>

          <div className="bg-zinc-900/60 border border-zinc-800 p-4 rounded-2xl flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500">
              <Tags className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[10px] text-zinc-500 uppercase font-semibold">Top Design Element</p>
              <h4 className="text-sm font-bold text-zinc-200 mt-0.5">{metrics.mostCommonElement}</h4>
            </div>
          </div>
        </section>

        {/* 3. Charts Area */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Daily Upload Trend (Sleek SVG Area Chart) */}
          <div className="bg-zinc-900 border border-zinc-850 p-5 rounded-3xl col-span-1 lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-serif font-bold text-zinc-200 flex items-center gap-1.5 text-sm">
                <TrendingUp className="w-4 h-4 text-amber-500" />
                <span>Daily Scanning Trend</span>
              </h3>
              <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-semibold font-mono">Last 10 Days</span>
            </div>
            <div className="h-56 flex items-end justify-between relative pt-6 border-b border-l border-zinc-800 px-4">
              {charts.dailyUploads.length === 0 ? (
                <div className="absolute inset-0 flex items-center justify-center text-xs text-zinc-600">
                  No scanning data recorded yet
                </div>
              ) : (
                charts.dailyUploads.map((item, idx) => {
                  const heightPercent = Math.max(5, (item.count / maxUploads) * 85);
                  return (
                    <div key={idx} className="flex flex-col items-center flex-1 group">
                      <div className="text-[10px] font-mono font-bold text-amber-400 opacity-0 group-hover:opacity-100 transition-opacity mb-1 bg-zinc-950 px-1.5 py-0.5 rounded border border-zinc-800 -mt-8 absolute" style={{ bottom: `${heightPercent + 8}%` }}>
                        {item.count}
                      </div>
                      <div
                        className="w-8 bg-gradient-to-t from-amber-950/65 to-amber-500 rounded-t-lg group-hover:to-amber-400 transition-all shadow-lg hover:shadow-amber-500/10 cursor-pointer"
                        style={{ height: `${heightPercent}%` }}
                      ></div>
                      <span className="text-[9px] font-mono text-zinc-500 mt-2 rotate-12 origin-top-left truncate max-w-[48px] uppercase">
                        {item.date_label ? item.date_label.substring(5) : ''}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Design Elements leaderboard (Table/Progress list) */}
          <div className="bg-zinc-900 border border-zinc-850 p-5 rounded-3xl space-y-4">
            <h3 className="font-serif font-bold text-zinc-200 flex items-center gap-1.5 text-sm">
              <Tags className="w-4 h-4 text-amber-500" />
              <span>Design Element Leaderboard</span>
            </h3>
            
            <div className="space-y-3.5 max-h-56 overflow-y-auto pr-1">
              {charts.elements.length === 0 ? (
                <div className="text-center py-12 text-xs text-zinc-600">No elements counted</div>
              ) : (
                charts.elements.map((item, idx) => {
                  const maxElementCount = Math.max(...charts.elements.map(el => el.count), 1);
                  const percentage = (item.count / maxElementCount) * 100;
                  return (
                    <div key={idx} className="space-y-1">
                      <div className="flex justify-between text-xs font-semibold">
                        <span className="text-zinc-300">{item.name}</span>
                        <span className="text-zinc-500 font-mono">{item.count} times</span>
                      </div>
                      <div className="w-full bg-zinc-950 h-2 rounded-full overflow-hidden border border-zinc-800">
                        <div
                          className="bg-amber-500 h-full rounded-full transition-all duration-500"
                          style={{ width: `${percentage}%` }}
                        ></div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Top Design Styles (Bar chart) */}
          <div className="bg-zinc-900 border border-zinc-850 p-5 rounded-3xl space-y-4">
            <h3 className="font-serif font-bold text-zinc-200 flex items-center gap-1.5 text-sm">
              <Compass className="w-4 h-4 text-amber-500" />
              <span>Top Design Styles</span>
            </h3>
            
            <div className="space-y-4 pt-2">
              {charts.topStyles.length === 0 ? (
                <div className="text-center py-12 text-xs text-zinc-600">No styling metrics</div>
              ) : (
                charts.topStyles.map((item, idx) => {
                  const widthPercent = (item.count / maxStyles) * 100;
                  return (
                    <div key={idx} className="space-y-1">
                      <div className="flex justify-between text-xs font-semibold">
                        <span className="text-zinc-300">{item.style}</span>
                        <span className="text-amber-500 font-mono">{item.count}</span>
                      </div>
                      <div className="w-full bg-zinc-950 h-3 rounded-xl overflow-hidden border border-zinc-850">
                        <div
                          className="bg-gradient-to-r from-amber-600 to-amber-500 h-full rounded-xl transition-all duration-500"
                          style={{ width: `${widthPercent}%` }}
                        ></div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Complexity Distribution (SVG block bars) */}
          <div className="bg-zinc-900 border border-zinc-850 p-5 rounded-3xl space-y-4">
            <h3 className="font-serif font-bold text-zinc-200 flex items-center gap-1.5 text-sm">
              <Layers className="w-4 h-4 text-amber-500" />
              <span>Complexity Distribution</span>
            </h3>
            
            <div className="space-y-4 pt-2">
              {charts.complexities.length === 0 ? (
                <div className="text-center py-12 text-xs text-zinc-600">No complexity stats</div>
              ) : (
                charts.complexities.map((item, idx) => {
                  const widthPercent = (item.count / maxComplexity) * 100;
                  return (
                    <div key={idx} className="space-y-1">
                      <div className="flex justify-between text-xs font-semibold">
                        <span className="text-zinc-300">{item.complexity}</span>
                        <span className="text-amber-500 font-mono">{item.count}</span>
                      </div>
                      <div className="w-full bg-zinc-950 h-3 rounded-xl overflow-hidden border border-zinc-850">
                        <div
                          className="bg-gradient-to-r from-amber-600 to-amber-500 h-full rounded-xl transition-all duration-500"
                          style={{ width: `${widthPercent}%` }}
                        ></div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Coverage Distribution */}
          <div className="bg-zinc-900 border border-zinc-850 p-5 rounded-3xl space-y-4">
            <h3 className="font-serif font-bold text-zinc-200 flex items-center gap-1.5 text-sm">
              <Compass className="w-4 h-4 text-amber-500" />
              <span>Coverage Distribution</span>
            </h3>
            
            <div className="space-y-3 pt-1 max-h-56 overflow-y-auto pr-1">
              {charts.coverages.length === 0 ? (
                <div className="text-center py-12 text-xs text-zinc-600">No coverage stats</div>
              ) : (
                charts.coverages.map((item, idx) => {
                  const maxCoverageCount = Math.max(...charts.coverages.map(c => c.count), 1);
                  const widthPercent = (item.count / maxCoverageCount) * 100;
                  return (
                    <div key={idx} className="space-y-1">
                      <div className="flex justify-between text-xs font-semibold">
                        <span className="text-zinc-300 truncate max-w-[160px]">{item.coverage}</span>
                        <span className="text-amber-500 font-mono">{item.count}</span>
                      </div>
                      <div className="w-full bg-zinc-950 h-2.5 rounded-lg overflow-hidden border border-zinc-855">
                        <div
                          className="bg-gradient-to-r from-amber-600 to-amber-500 h-full rounded-lg transition-all duration-500"
                          style={{ width: `${widthPercent}%` }}
                        ></div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

        </section>

      </main>
    </div>
  );
}
