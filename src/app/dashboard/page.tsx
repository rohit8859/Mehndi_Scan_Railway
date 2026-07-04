'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import Navigation from '@/components/Navigation';
import { useRouter } from 'next/navigation';
import {
  Search,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Maximize,
  CheckCircle,
  XCircle,
  Save,
  Forward,
  CheckSquare,
  Square,
  Settings,
  Sparkles,
  Loader2,
  Calendar,
  AlertTriangle,
  Grid,
  ListFilter,
  Trash2
} from 'lucide-react';

// Types matching backend schema
interface ImageRecord {
  id: number;
  filename: string;
  gdrive_file_id: string;
  image_url: string;
  upload_date: string;
  ai_style: string;
  ai_occasion: string;
  ai_coverage: string;
  ai_complexity: string;
  ai_elements: string[];
  ai_hand_side: string;
  ai_time_taken: string;
  ai_estimated_price: number;
  ai_confidence: number;
  ai_notes: string;
  verified_style: string;
  verified_occasion: string;
  verified_coverage: string;
  verified_complexity: string;
  verified_elements: string[];
  verified_hand_side: string;
  verified_time_taken: string;
  verified_price: number;
  verification_status: string;
  reviewer_name: string;
  review_date: string;
  comments: string;
}

// Option Lists
const STYLE_OPTIONS = [
  'Bridal', 'Arabic', 'Indo-Arabic', 'Traditional Indian', 'Rajasthani', 'Pakistani', 'Moroccan', 'Gulf Style',
  'Modern', 'Minimal', 'Contemporary', 'Portrait Mehndi', 'Mandala', 'Jewelry Style', 'Floral', 'Peacock',
  'Mughal', 'Western Fusion'
];

const OCCASION_OPTIONS = [
  'Wedding', 'Engagement', 'Roka', 'Sangeet', 'Haldi', 'Karwa Chauth', 'Teej', 'Eid', 'Diwali',
  'Baby Shower', 'Birthday', 'Corporate Event', 'Festival', 'Party'
];

const HAND_OPTIONS = ['Front Hand', 'Back Hand', 'Feet (Leg)'];

const COVERAGE_OPTIONS = [
  'Fingers',
  'Wrist Length',
  'Half Hand (Up to Mid Forearm)',
  '3/4 Hand',
  'Full Hand (Up to Elbow)',
  'Above Elbow',
  'Full Arm (Up to Shoulder)',
  'Toes Only',
  'Half Feet',
  'Full Feet (Up to Ankle)',
  'Above Ankle',
  'Half Leg (Up to Calf)',
  'Full Leg (Up to Knee)',
  'Above Knee'
];

const COMPLEXITY_OPTIONS = [
  'Very Simple',
  'Simple',
  'Medium',
  'Heavy',
  'Very Heavy'
];

const ELEMENT_OPTIONS = [
  'Ambi (Paisley) Pattern',
  'Peacock',
  'Lotus',
  'Rose',
  'Floral Pattern',
  'Mandala',
  'Jaal Pattern',
  'Jewelry Pattern',
  'Bracelet Pattern',
  'Elephant',
  'Temple',
  'Kalash',
  'Doli',
  'Baraat',
  'Bride & Groom',
  'Couple Portrait',
  'Initials/Hidden Name',
  '3D Mehndi Pattern',
  'Portrait'
];

export default function DashboardPage() {
  const router = useRouter();
  const [userRole, setUserRole] = useState<'ADMIN' | 'REVIEWER' | null>(null);
  // Database state
  const [images, setImages] = useState<ImageRecord[]>([]);
  const [selectedImage, setSelectedImage] = useState<ImageRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [totalCount, setTotalCount] = useState(0);

  // Filters state
  const [statusFilter, setStatusFilter] = useState('PENDING');
  const [searchQuery, setSearchQuery] = useState('');
  const [styleFilter, setStyleFilter] = useState('');
  const [occasionFilter, setOccasionFilter] = useState('');
  const [coverageFilter, setCoverageFilter] = useState('');
  const [complexityFilter, setComplexityFilter] = useState('');
  const [minPriceFilter, setMinPriceFilter] = useState('');
  const [maxPriceFilter, setMaxPriceFilter] = useState('');
  const [sortBy, setSortBy] = useState('upload_date');
  const [limit] = useState(50);
  const [offset, setOffset] = useState(0);

  // Form edit states (for selected image)
  const [editStyle, setEditStyle] = useState('');
  const [editOccasion, setEditOccasion] = useState('');
  const [editCoverage, setEditCoverage] = useState('');
  const [editComplexity, setEditComplexity] = useState('');
  const [editElements, setEditElements] = useState<string[]>([]);
  const [editPrice, setEditPrice] = useState<number | string>(0);
  const [editComments, setEditComments] = useState('');
  const [editHandSide, setEditHandSide] = useState('');
  const [editTimeTaken, setEditTimeTaken] = useState('');

  // Bulk operations state
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [bulkStyle, setBulkStyle] = useState('');
  const [bulkPrice, setBulkPrice] = useState('');
  const [showBulkToolbar, setShowBulkToolbar] = useState(false);

  // Image display controls
  const [zoomScale, setZoomScale] = useState(1);
  const [rotationAngle, setRotationAngle] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showFiltersPanel, setShowFiltersPanel] = useState(false);
  const viewerRef = useRef<HTMLDivElement>(null);

  // Toast notification state
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Check auth & role
  useEffect(() => {
    async function checkAuth() {
      try {
        const authRes = await fetch('/api/auth');
        if (authRes.status === 401) {
          router.push('/login');
          return;
        }
        const authData = await authRes.json();
        setUserRole(authData.user.role);
      } catch (err) {
        console.error('Auth check error:', err);
        router.push('/login');
      }
    }
    checkAuth();
  }, [router]);

  // Fetch images list
  const fetchImages = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        status: statusFilter,
        search: searchQuery,
        style: styleFilter,
        occasion: occasionFilter,
        coverage: coverageFilter,
        complexity: complexityFilter,
        sortBy,
        limit: String(limit),
        offset: String(offset),
      });

      if (minPriceFilter) params.append('minPrice', minPriceFilter);
      if (maxPriceFilter) params.append('maxPrice', maxPriceFilter);

      const res = await fetch(`/api/images?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setImages(data.images);
        setTotalCount(data.pagination.total);
        
        // Auto-select first pending image if nothing is selected
        if (data.images.length > 0) {
          // If we had a selected image, see if it is still in the list, otherwise select first
          const stillExists = selectedImage && data.images.find((img: ImageRecord) => img.id === selectedImage.id);
          if (!stillExists) {
            handleSelectImage(data.images[0]);
          }
        } else {
          setSelectedImage(null);
        }
      } else {
        showToast('Failed to load images from server', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('Error connecting to API', 'error');
    } finally {
      setLoading(false);
    }
  }, [
    statusFilter,
    searchQuery,
    styleFilter,
    occasionFilter,
    coverageFilter,
    complexityFilter,
    sortBy,
    minPriceFilter,
    maxPriceFilter,
    limit,
    offset,
    selectedImage
  ]);

  useEffect(() => {
    fetchImages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, styleFilter, occasionFilter, coverageFilter, complexityFilter, sortBy, offset]);

  // Handle single image selection and load forms
  const handleSelectImage = (img: ImageRecord | null) => {
    setSelectedImage(img);
    if (img) {
      setEditStyle(img.verified_style || img.ai_style || 'Bridal');
      setEditOccasion(img.verified_occasion || img.ai_occasion || 'Wedding');
      setEditCoverage(img.verified_coverage || img.ai_coverage || 'Full Hand');
      setEditComplexity(img.verified_complexity || img.ai_complexity || 'Medium');
      setEditElements(img.verified_elements || img.ai_elements || []);
      setEditHandSide(img.verified_hand_side || img.ai_hand_side || 'Front Hand');
      setEditTimeTaken(img.verified_time_taken || img.ai_time_taken || '15 Mins');
      setEditPrice(img.verified_price || img.ai_estimated_price || 0);
      setEditComments(img.comments || '');
      // Reset image transform
      setZoomScale(1);
      setRotationAngle(0);
    }
  };

  // Checkbox toggle for elements list
  const handleToggleElement = (element: string) => {
    setEditElements((prev) =>
      prev.includes(element) ? prev.filter((el) => el !== element) : [...prev, element]
    );
  };

  // Navigate to Next/Prev image
  const handleNavigate = useCallback((direction: 'next' | 'prev') => {
    if (!selectedImage || images.length === 0) return;
    const currentIndex = images.findIndex((img) => img.id === selectedImage.id);
    if (currentIndex === -1) return;

    let targetIndex = currentIndex;
    if (direction === 'next' && currentIndex < images.length - 1) {
      targetIndex = currentIndex + 1;
    } else if (direction === 'prev' && currentIndex > 0) {
      targetIndex = currentIndex - 1;
    }

    if (targetIndex !== currentIndex) {
      handleSelectImage(images[targetIndex]);
    }
  }, [images, selectedImage]);

  // Core single-update operations: SAVE, APPROVE, REJECT
  const handleUpdateImage = async (action: 'SAVE' | 'APPROVE' | 'REJECT' | 'SUBMIT' | 'DELETE') => {
    if (!selectedImage) return;
    setActionLoading(true);

    try {
      const res = await fetch('/api/images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          id: selectedImage.id,
          style: editStyle,
          occasion: editOccasion,
          coverage: editCoverage,
          complexity: editComplexity,
          elements: editElements,
          handSide: editHandSide,
          timeTaken: editTimeTaken,
          price: editPrice === '' ? 0 : parseInt(String(editPrice), 10),
          comments: editComments,
        }),
      });

      if (res.ok) {
        showToast(
          action === 'APPROVE'
            ? 'Approved and synced successfully'
            : action === 'REJECT'
            ? 'Marked as rejected'
            : action === 'SUBMIT'
            ? 'Submitted to admin for final approval'
            : action === 'DELETE'
            ? 'Deleted from system'
            : 'Changes saved',
          'success'
        );
        
        // Find next pending image before we refresh list to proceed fast
        const currentIndex = images.findIndex((img) => img.id === selectedImage.id);
        const hasNext = currentIndex !== -1 && currentIndex < images.length - 1;
        const nextImage = hasNext ? images[currentIndex + 1] : null;

        // Fetch fresh list
        await fetchImages();

        // Advance to next image automatically if approving/rejecting/submitting/deleting
        if ((action === 'APPROVE' || action === 'REJECT' || action === 'SUBMIT' || action === 'DELETE') && nextImage) {
          handleSelectImage(nextImage);
        } else if (action === 'DELETE') {
          setSelectedImage(null);
        }
      } else {
        const err = await res.json();
        showToast(`Action failed: ${err.error || 'Server error'}`, 'error');
      }
    } catch (e) {
      console.error(e);
      showToast('Network error during update', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Bulk Action Execution
  const handleBulkAction = async (action: 'BULK_APPROVE' | 'BULK_REJECT' | 'BULK_EDIT_PRICE' | 'BULK_EDIT_STYLE' | 'BULK_DELETE') => {
    if (selectedIds.length === 0) return;
    setActionLoading(true);

    try {
      const bodyPayload: any = { action, ids: selectedIds };
      if (action === 'BULK_EDIT_PRICE') bodyPayload.price = parseFloat(bulkPrice);
      if (action === 'BULK_EDIT_STYLE') bodyPayload.style = bulkStyle;

      const res = await fetch('/api/images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyPayload),
      });

      if (res.ok) {
        showToast(`Successfully performed bulk action: ${action.replace('BULK_', '')}`, 'success');
        setSelectedIds([]);
        setShowBulkToolbar(false);
        setBulkPrice('');
        setBulkStyle('');
        await fetchImages();
      } else {
        const err = await res.json();
        showToast(`Bulk action failed: ${err.error || 'Server error'}`, 'error');
      }
    } catch (e) {
      console.error(e);
      showToast('Network error during bulk action', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Bulk checkboxes helper
  const handleToggleSelectId = (id: number) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (selectedIds.length === images.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(images.map((img) => img.id));
    }
  };

  // Keyboard shortcuts handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore shortcuts if the user is typing in inputs or textareas
      if (
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'TEXTAREA' ||
        document.activeElement?.tagName === 'SELECT'
      ) {
        return;
      }

      if (!selectedImage) return;

      switch (e.code) {
        case 'ArrowRight':
          e.preventDefault();
          handleNavigate('next');
          break;
        case 'ArrowLeft':
          e.preventDefault();
          handleNavigate('prev');
          break;
        case 'Space':
          e.preventDefault();
          handleUpdateImage(userRole === 'ADMIN' ? 'APPROVE' : 'SUBMIT');
          break;
        case 'KeyR':
          e.preventDefault();
          handleUpdateImage('REJECT');
          break;
        case 'KeyS':
          e.preventDefault();
          // Skip simply selects the next image in the queue
          handleNavigate('next');
          showToast('Skipped image', 'info');
          break;
        case 'KeyZ':
          e.preventDefault();
          setZoomScale((prev) => (prev === 1 ? 1.8 : 1));
          break;
        case 'KeyT':
          e.preventDefault();
          setRotationAngle((prev) => (prev + 90) % 360);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedImage, images, handleNavigate]);

  // Confidence Highlighting Logic
  const getConfidenceBadgeColor = (score: number) => {
    if (score >= 95) return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
    if (score >= 85) return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
    return 'bg-rose-500/10 text-rose-500 border-rose-500/20';
  };

  const isManualReviewRequired = (score: number) => score < 70;

  return (
    <div className="flex flex-col md:flex-row h-screen bg-zinc-900 text-zinc-100 font-sans overflow-hidden">
      {/* Toast popup */}
      {toast && (
        <div
          className={`fixed top-5 right-5 px-5 py-3.5 rounded-xl border text-sm font-semibold shadow-2xl z-50 transition-all flex items-center gap-2 ${
            toast.type === 'success'
              ? 'bg-emerald-950/40 text-emerald-400 border-emerald-900/30'
              : toast.type === 'error'
              ? 'bg-rose-950/40 text-rose-400 border-rose-900/30'
              : 'bg-zinc-800 text-amber-400 border-zinc-700'
          }`}
        >
          {toast.type === 'success' && <CheckCircle className="w-4 h-4" />}
          {toast.type === 'error' && <XCircle className="w-4 h-4" />}
          {toast.type === 'info' && <Forward className="w-4 h-4" />}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Navigation sidebar */}
      <Navigation />

      {/* Main Review Workspace */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        
        {/* Top Header */}
        <header className="h-auto md:h-16 shrink-0 bg-zinc-950/60 backdrop-blur-md border-b border-zinc-800 flex flex-col md:flex-row md:items-center justify-between p-4 md:px-6 gap-3 z-20">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <h2 className="text-base md:text-lg font-serif font-semibold tracking-wide hidden sm:block">Image Verification Queue</h2>
            <div className="flex bg-zinc-900 rounded-lg p-0.5 border border-zinc-800 overflow-x-auto shrink-0 max-w-full">
              <button
                onClick={() => { setStatusFilter('PENDING'); setOffset(0); }}
                className={`px-3 py-1 rounded-md text-xs font-semibold uppercase tracking-wider transition-all ${
                  statusFilter === 'PENDING' ? 'bg-amber-500 text-amber-955' : 'text-zinc-400 hover:text-white'
                }`}
              >
                Pending Review
              </button>
              <button
                onClick={() => { setStatusFilter('REVIEWED'); setOffset(0); }}
                className={`px-3 py-1 rounded-md text-xs font-semibold uppercase tracking-wider transition-all ${
                  statusFilter === 'REVIEWED' ? 'bg-amber-500 text-amber-955' : 'text-zinc-400 hover:text-white'
                }`}
              >
                Pending Admin
              </button>
              <button
                onClick={() => { setStatusFilter('APPROVED'); setOffset(0); }}
                className={`px-3 py-1 rounded-md text-xs font-semibold uppercase tracking-wider transition-all ${
                  statusFilter === 'APPROVED' ? 'bg-amber-500 text-amber-955' : 'text-zinc-400 hover:text-white'
                }`}
              >
                Approved
              </button>
              <button
                onClick={() => { setStatusFilter('REJECTED'); setOffset(0); }}
                className={`px-3 py-1 rounded-md text-xs font-semibold uppercase tracking-wider transition-all ${
                  statusFilter === 'REJECTED' ? 'bg-amber-500 text-amber-955' : 'text-zinc-400 hover:text-white'
                }`}
              >
                Rejected
              </button>
              <button
                onClick={() => { setStatusFilter('ALL'); setOffset(0); }}
                className={`px-3 py-1 rounded-md text-xs font-semibold uppercase tracking-wider transition-all ${
                  statusFilter === 'ALL' ? 'bg-amber-500 text-amber-955' : 'text-zinc-400 hover:text-white'
                }`}
              >
                All
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto">
            {/* Search Input */}
            <div className="relative flex-1 md:w-64">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-zinc-500">
                <Search className="w-4 h-4" />
              </span>
              <input
                type="text"
                placeholder="Search file, comments..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && fetchImages()}
                className="w-full bg-zinc-900 border border-zinc-800 focus:border-amber-500/50 rounded-xl py-1.5 pl-9 pr-3 text-xs placeholder-zinc-500 focus:outline-none text-white transition-all"
              />
            </div>
            
            {/* Filters panel toggle */}
            <button
              onClick={() => setShowFiltersPanel(!showFiltersPanel)}
              className={`p-2 rounded-xl border transition-all ${
                showFiltersPanel ? 'bg-amber-500 border-amber-500 text-amber-955' : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white'
              }`}
              title="Toggle Filters"
            >
              <SlidersHorizontal className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Dynamic Filters Panel */}
        {showFiltersPanel && (
          <div className="shrink-0 bg-zinc-950/40 border-b border-zinc-800/80 p-4 grid grid-cols-5 gap-3.5 items-end animate-in slide-in-from-top duration-200">
            <div>
              <label className="block text-[10px] uppercase font-bold text-zinc-400 tracking-wider mb-1.5">Design Style</label>
              <select
                value={styleFilter}
                onChange={(e) => setStyleFilter(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-lg py-1.5 px-2 text-xs focus:outline-none text-white"
              >
                <option value="">Any Style</option>
                {STYLE_OPTIONS.map((style) => (
                  <option key={style} value={style}>{style}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] uppercase font-bold text-zinc-400 tracking-wider mb-1.5">Occasion</label>
              <select
                value={occasionFilter}
                onChange={(e) => setOccasionFilter(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-lg py-1.5 px-2 text-xs focus:outline-none text-white"
              >
                <option value="">Any Occasion</option>
                {OCCASION_OPTIONS.map((occ) => (
                  <option key={occ} value={occ}>{occ}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] uppercase font-bold text-zinc-400 tracking-wider mb-1.5">Coverage</label>
              <select
                value={coverageFilter}
                onChange={(e) => setCoverageFilter(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-lg py-1.5 px-2 text-xs focus:outline-none text-white"
              >
                <option value="">Any Coverage</option>
                {COVERAGE_OPTIONS.map((cov) => (
                  <option key={cov} value={cov}>{cov}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] uppercase font-bold text-zinc-400 tracking-wider mb-1.5">Complexity</label>
              <select
                value={complexityFilter}
                onChange={(e) => setComplexityFilter(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-lg py-1.5 px-2 text-xs focus:outline-none text-white"
              >
                <option value="">Any Complexity</option>
                {COMPLEXITY_OPTIONS.map((comp) => (
                  <option key={comp} value={comp}>{comp}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <button
                onClick={fetchImages}
                className="flex-1 bg-amber-500 hover:bg-amber-400 text-amber-955 py-1.5 px-3 rounded-lg text-xs font-semibold transition-all"
              >
                Apply Filters
              </button>
              <button
                onClick={() => {
                  setStyleFilter('');
                  setOccasionFilter('');
                  setCoverageFilter('');
                  setComplexityFilter('');
                  setMinPriceFilter('');
                  setMaxPriceFilter('');
                  fetchImages();
                }}
                className="bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 py-1.5 px-3 rounded-lg text-xs text-zinc-400 hover:text-white transition-all"
              >
                Reset
              </button>
            </div>
          </div>
        )}

        {/* Main Split-Screen Workspace */}
        <div className="flex-1 flex flex-col md:flex-row overflow-y-auto md:overflow-hidden min-h-0">
          
          {/* Left Column: Gallery List / Queue */}
          <div className={`w-full md:w-80 shrink-0 border-r border-zinc-800 bg-zinc-950/20 flex flex-col overflow-hidden ${selectedImage ? 'hidden md:flex' : 'flex'}`}>
            {/* Gallery Operations (Bulk Selection Toggle) */}
            <div className="p-3 border-b border-zinc-800 flex items-center justify-between shrink-0 bg-zinc-950/10">
              <button
                onClick={() => {
                  setShowBulkToolbar(!showBulkToolbar);
                  if (showBulkToolbar) setSelectedIds([]);
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                  showBulkToolbar
                    ? 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                    : 'border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-900'
                }`}
              >
                <Grid className="w-3.5 h-3.5" />
                <span>Bulk Select</span>
              </button>

              <span className="text-[10px] text-zinc-500 uppercase font-sans tracking-wider font-semibold">
                {images.length} images queued
              </span>
            </div>

            {/* Images Queue List */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {loading ? (
                <div className="flex flex-col items-center justify-center h-48 text-zinc-500 gap-2">
                  <Loader2 className="w-6 h-6 animate-spin text-amber-500" />
                  <span className="text-xs">Loading queue...</span>
                </div>
              ) : images.length === 0 ? (
                <div className="text-center py-12 text-zinc-500 text-xs">
                  No images found matching criteria.
                </div>
              ) : (
                images.map((img) => {
                  const isSelected = selectedImage?.id === img.id;
                  const isChecked = selectedIds.includes(img.id);
                  const statusColor =
                    img.verification_status === 'APPROVED'
                      ? 'border-emerald-500'
                      : img.verification_status === 'REJECTED'
                      ? 'border-rose-500'
                      : 'border-transparent';
                  return (
                    <div
                      key={img.id}
                      onClick={() => !showBulkToolbar && handleSelectImage(img)}
                      className={`relative group flex gap-3 p-2 rounded-xl border transition-all cursor-pointer ${
                        isSelected && !showBulkToolbar
                          ? 'bg-amber-900/15 border-amber-500/40 shadow-lg shadow-amber-500/5'
                          : 'bg-zinc-900/50 border-zinc-800/80 hover:bg-zinc-900 hover:border-zinc-700'
                      }`}
                    >
                      {/* Image Thumbnail with secure dynamic proxy stream */}
                      <div className="w-16 h-16 rounded-lg bg-zinc-950 border border-zinc-800 overflow-hidden relative shrink-0">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={img.image_url}
                          alt={img.filename}
                          loading="lazy"
                          className="w-full h-full object-cover group-hover:scale-105 transition-all duration-300"
                        />
                        {/* Status border indicator */}
                        <div className={`absolute inset-0 border-2 ${statusColor} rounded-lg pointer-events-none`}></div>
                      </div>

                      <div className="min-w-0 flex-1 flex flex-col justify-between py-0.5">
                        <div>
                          <p className="text-xs font-semibold truncate text-zinc-200">{img.filename}</p>
                          <p className="text-[10px] text-zinc-500 truncate mt-0.5 font-mono">
                            {img.verified_style || img.ai_style || 'N/A'} • {img.verified_occasion || img.ai_occasion || 'N/A'}
                          </p>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-amber-400">
                            ₹{img.verified_price || img.ai_estimated_price || 0}
                          </span>
                          {img.ai_confidence > 0 && (
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${getConfidenceBadgeColor(img.ai_confidence)}`}>
                              {img.ai_confidence}%
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Checkbox (Visible in Bulk Select mode) */}
                      {showBulkToolbar && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleSelectId(img.id);
                          }}
                          className="absolute top-2 right-2 p-1 rounded-md bg-zinc-950/80 hover:bg-zinc-950 text-amber-500"
                        >
                          {isChecked ? (
                            <CheckSquare className="w-4 h-4" />
                          ) : (
                            <Square className="w-4 h-4 text-zinc-600" />
                          )}
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Center Column: Large Image Preview */}
          <div className={`w-full md:flex-1 h-[45vh] md:h-auto shrink-0 md:shrink flex flex-col bg-zinc-950/60 overflow-hidden relative border-b md:border-b-0 md:border-r border-zinc-800 ${selectedImage ? 'flex' : 'hidden md:flex'}`}>
            {selectedImage ? (
              <>
                {/* Image Toolbar */}
                <div className="h-12 bg-zinc-950/80 border-b border-zinc-850 flex items-center justify-between px-4 z-10 shrink-0">
                  <div className="flex items-center gap-1.5">
                    {/* Back to Queue Button (Mobile Only) */}
                    <button
                      onClick={() => handleSelectImage(null)}
                      className="md:hidden flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-amber-500 font-semibold"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                      <span>Queue</span>
                    </button>
                    <button
                      onClick={() => setZoomScale((prev) => Math.max(0.5, prev - 0.2))}
                      className="p-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800"
                      title="Zoom Out"
                    >
                      <ZoomOut className="w-4 h-4" />
                    </button>
                    <span className="text-xs text-zinc-500 font-mono w-12 text-center">
                      {Math.round(zoomScale * 100)}%
                    </span>
                    <button
                      onClick={() => setZoomScale((prev) => Math.min(3, prev + 0.2))}
                      className="p-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800"
                      title="Zoom In"
                    >
                      <ZoomIn className="w-4 h-4" />
                    </button>
                    <span className="w-px h-4 bg-zinc-800 mx-1"></span>
                    <button
                      onClick={() => setRotationAngle((prev) => (prev + 90) % 360)}
                      className="p-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800"
                      title="Rotate Image"
                    >
                      <RotateCw className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setIsFullscreen(!isFullscreen)}
                      className="p-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800"
                      title="Fullscreen"
                    >
                      <Maximize className="w-4 h-4" />
                    </button>
                  </div>

                  <span className="text-xs text-zinc-400 truncate max-w-xs font-medium">
                    {selectedImage.filename}
                  </span>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleNavigate('prev')}
                      disabled={images.findIndex((img) => img.id === selectedImage.id) === 0}
                      className="p-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800 disabled:opacity-40"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleNavigate('next')}
                      disabled={images.findIndex((img) => img.id === selectedImage.id) === images.length - 1}
                      className="p-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800 disabled:opacity-40"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Large Canvas Viewport */}
                <div
                  ref={viewerRef}
                  className={`flex-1 flex items-center justify-center p-6 overflow-auto relative ${
                    isFullscreen ? 'fixed inset-0 z-50 bg-black' : ''
                  }`}
                >
                  <div
                    className="relative max-h-full max-w-full transition-transform duration-200"
                    style={{
                      transform: `scale(${zoomScale}) rotate(${rotationAngle}deg)`,
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={selectedImage.image_url}
                      alt={selectedImage.filename}
                      className="max-w-full max-h-[35vh] md:max-h-[70vh] object-contain shadow-2xl rounded-lg"
                      style={{ pointerEvents: 'none' }}
                    />

                    {/* Manual Review Required warning overlay */}
                    {isManualReviewRequired(selectedImage.ai_confidence) && (
                      <div className="absolute top-4 left-4 bg-rose-950/80 border border-rose-800 text-rose-300 text-xs px-3 py-1.5 rounded-lg shadow-xl font-bold flex items-center gap-1.5 backdrop-blur-md">
                        <AlertTriangle className="w-4 h-4" />
                        <span>Manual Review Required</span>
                      </div>
                    )}
                  </div>

                  {isFullscreen && (
                    <button
                      onClick={() => setIsFullscreen(false)}
                      className="absolute top-4 right-4 bg-zinc-900 border border-zinc-800 px-3 py-1.5 rounded-lg text-xs font-semibold text-white hover:bg-zinc-800"
                    >
                      Exit Fullscreen
                    </button>
                  )}
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-zinc-500 gap-3">
                <Sparkles className="w-12 h-12 text-zinc-700 stroke-1" />
                <p className="text-sm">Select an image from the queue to review</p>
              </div>
            )}
          </div>

          {/* Right Column: AI Analysis & Editor Panel */}
          <div className={`w-full md:w-96 shrink-0 bg-zinc-950/40 p-5 flex flex-col md:overflow-y-auto border-t md:border-t-0 md:border-l border-zinc-850 ${selectedImage ? 'flex' : 'hidden md:flex'}`}>
            {selectedImage ? (
              <div className="flex-1 flex flex-col justify-between space-y-6">
                
                {/* Metadata & Categories Section */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-zinc-850">
                    <h3 className="font-serif font-bold text-amber-100">
                      {selectedImage.ai_confidence > 0 ? 'AI predictions' : 'Design Attributes'}
                    </h3>
                    {selectedImage.ai_confidence > 0 && (
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${getConfidenceBadgeColor(selectedImage.ai_confidence)}`}>
                          {selectedImage.ai_confidence}% Confidence
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Design Style */}
                  <div>
                    <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5">Design Style</label>
                    <select
                      value={editStyle}
                      onChange={(e) => setEditStyle(e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-800 focus:border-amber-500/50 rounded-xl py-2 px-3 text-xs focus:outline-none text-white transition-all"
                    >
                      {STYLE_OPTIONS.map((style) => (
                        <option key={style} value={style}>{style}</option>
                      ))}
                    </select>
                  </div>

                  {/* Occasion */}
                  <div>
                    <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5">Occasion</label>
                    <select
                      value={editOccasion}
                      onChange={(e) => setEditOccasion(e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-800 focus:border-amber-500/50 rounded-xl py-2 px-3 text-xs focus:outline-none text-white transition-all"
                    >
                      {OCCASION_OPTIONS.map((occ) => (
                        <option key={occ} value={occ}>{occ}</option>
                      ))}
                    </select>
                  </div>

                  {/* Hand / Question Type */}
                  <div>
                    <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5">Side</label>
                    <select
                      value={editHandSide}
                      onChange={(e) => setEditHandSide(e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-800 focus:border-amber-500/50 rounded-xl py-2 px-3 text-xs focus:outline-none text-white transition-all"
                    >
                      {HAND_OPTIONS.map((hand) => (
                        <option key={hand} value={hand}>{hand}</option>
                      ))}
                    </select>
                  </div>

                  {/* Coverage */}
                  <div>
                    <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5">Coverage</label>
                    <select
                      value={editCoverage}
                      onChange={(e) => setEditCoverage(e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-800 focus:border-amber-500/50 rounded-xl py-2 px-3 text-xs focus:outline-none text-white transition-all"
                    >
                      {COVERAGE_OPTIONS.map((cov) => (
                        <option key={cov} value={cov}>{cov}</option>
                      ))}
                    </select>
                  </div>

                  {/* Complexity */}
                  <div>
                    <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5">Complexity</label>
                    <select
                      value={editComplexity}
                      onChange={(e) => setEditComplexity(e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-800 focus:border-amber-500/50 rounded-xl py-2 px-3 text-xs focus:outline-none text-white transition-all"
                    >
                      {COMPLEXITY_OPTIONS.map((comp) => (
                        <option key={comp} value={comp}>{comp}</option>
                      ))}
                    </select>
                  </div>

                  {/* Time Taken */}
                  <div>
                    <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5">Time Taken</label>
                    <input
                      type="text"
                      value={editTimeTaken}
                      onChange={(e) => setEditTimeTaken(e.target.value)}
                      placeholder="e.g. 15 Mins, 1 Hour"
                      className="w-full bg-zinc-900 border border-zinc-800 focus:border-amber-500/50 rounded-xl py-2 px-3 text-xs focus:outline-none text-white transition-all font-semibold"
                    />
                  </div>

                  {/* Elements Multi-Select (Checkboxes) */}
                  <div>
                    <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5">Design Elements</label>
                    <div className="grid grid-cols-2 gap-2 max-h-36 overflow-y-auto p-2 bg-zinc-900/60 border border-zinc-800 rounded-xl">
                      {ELEMENT_OPTIONS.map((elem) => {
                        const isChecked = editElements.includes(elem);
                        return (
                          <label
                            key={elem}
                            className={`flex items-center gap-2 p-1.5 rounded-lg text-xs cursor-pointer transition-all ${
                              isChecked ? 'bg-amber-500/10 text-amber-300' : 'text-zinc-400 hover:bg-zinc-850'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => handleToggleElement(elem)}
                              className="accent-amber-500 rounded border-zinc-800"
                            />
                            <span>{elem}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  {/* Estimated Price */}
                  <div>
                    <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5">
                      Estimated Price (INR)
                    </label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-zinc-400 text-xs font-bold">
                        ₹
                      </span>
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={editPrice}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === '' || /^[0-9]*$/.test(val)) {
                            setEditPrice(val);
                          }
                        }}
                        className="w-full bg-zinc-900 border border-zinc-800 focus:border-amber-500/50 rounded-xl py-2 pl-7 pr-3 text-xs focus:outline-none text-white font-bold transition-all"
                      />
                    </div>
                  </div>

                  {/* AI Notes (Read-Only context) */}
                  {selectedImage.ai_notes && selectedImage.ai_confidence > 0 && (
                    <div className="p-3 bg-zinc-900/40 rounded-xl border border-zinc-800/80 text-xs text-zinc-400 leading-relaxed">
                      <p className="font-bold text-[10px] text-zinc-500 uppercase tracking-wider mb-1">AI Explanation</p>
                      {selectedImage.ai_notes}
                    </div>
                  )}

                  {/* Reviewer Comments */}
                  <div>
                    <div className="flex justify-between items-center mb-1.5">
                      <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Reviewer Comments</label>
                      {selectedImage.reviewer_name && (
                        <span className="text-[9px] text-amber-500/80 font-mono">
                          By: {selectedImage.reviewer_name}
                        </span>
                      )}
                    </div>
                    <textarea
                      rows={2}
                      value={editComments}
                      onChange={(e) => setEditComments(e.target.value)}
                      placeholder="Add design details or warnings here..."
                      className="w-full bg-zinc-900 border border-zinc-800 focus:border-amber-500/50 rounded-xl py-2 px-3 text-xs focus:outline-none text-white placeholder-zinc-600 transition-all resize-none"
                    />
                  </div>
                </div>

                {/* Review Control Actions */}
                <div className="space-y-3 pt-4 border-t border-zinc-850">
                  <div className="flex gap-3">
                    {userRole === 'ADMIN' ? (
                      <button
                        onClick={() => handleUpdateImage('APPROVE')}
                        disabled={actionLoading}
                        className="flex-1 bg-emerald-500 hover:bg-emerald-400 disabled:bg-emerald-600 text-zinc-955 font-bold py-2.5 px-4 rounded-xl shadow-lg shadow-emerald-500/10 active:scale-[0.98] transition-all flex items-center justify-center gap-1.5 text-xs uppercase tracking-wider"
                      >
                        {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                        <span>Approve</span>
                      </button>
                    ) : (
                      <button
                        onClick={() => handleUpdateImage('SUBMIT')}
                        disabled={actionLoading}
                        className="flex-1 bg-amber-500 hover:bg-amber-400 disabled:bg-amber-600 text-zinc-955 font-bold py-2.5 px-4 rounded-xl shadow-lg shadow-amber-500/10 active:scale-[0.98] transition-all flex items-center justify-center gap-1.5 text-xs uppercase tracking-wider"
                      >
                        {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                        <span>Submit to Admin</span>
                      </button>
                    )}
                    <button
                      onClick={() => handleUpdateImage('REJECT')}
                      disabled={actionLoading}
                      className="flex-1 bg-zinc-900 border border-red-900/40 text-red-400 hover:bg-red-950/20 disabled:opacity-50 font-bold py-2.5 px-4 rounded-xl active:scale-[0.98] transition-all flex items-center justify-center gap-1.5 text-xs uppercase tracking-wider"
                    >
                      <XCircle className="w-4 h-4" />
                      <span>Reject</span>
                    </button>
                  </div>
                  
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleUpdateImage('SAVE')}
                      disabled={actionLoading}
                      className="flex-1 bg-zinc-900 border border-zinc-800 hover:bg-zinc-850 text-zinc-300 font-semibold py-2 px-3 rounded-lg text-xs flex items-center justify-center gap-1.5 transition-all"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>Save</span>
                    </button>
                    <button
                      onClick={() => {
                        handleNavigate('next');
                        showToast('Skipped image', 'info');
                      }}
                      className="flex-1 bg-zinc-900 border border-zinc-800 hover:bg-zinc-850 text-zinc-300 font-semibold py-2 px-3 rounded-lg text-xs flex items-center justify-center gap-1.5 transition-all"
                    >
                      <Forward className="w-3.5 h-3.5" />
                      <span>Skip</span>
                    </button>
                    <button
                      onClick={() => {
                        if (window.confirm("Are you sure you want to delete this duplicate image from the system?")) {
                          handleUpdateImage('DELETE');
                        }
                      }}
                      disabled={actionLoading}
                      className="flex-1 bg-zinc-900 border border-rose-950/45 hover:bg-rose-950/20 text-rose-400 font-semibold py-2 px-3 rounded-lg text-xs flex items-center justify-center gap-1.5 transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete</span>
                    </button>
                  </div>
                  
                  {/* Hotkey guides info */}
                  <div className="text-[10px] text-zinc-500 font-sans tracking-wide leading-relaxed border-t border-zinc-850/50 pt-2 grid grid-cols-2 gap-1 font-mono">
                    <div>[Space] {userRole === 'ADMIN' ? 'Approve' : 'Submit'}</div>
                    <div>[R] Reject</div>
                    <div>[S] Skip Queue</div>
                    <div>[Left/Right] Nav</div>
                    <div>[Z] Zoom 1.8x</div>
                    <div>[T] Rotate 90°</div>
                  </div>
                </div>

              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-zinc-600 text-xs">
                No active details
              </div>
            )}
          </div>

        </div>

        {/* Bulk Action Panel (Locks to bottom of workspace) */}
        {showBulkToolbar && selectedIds.length > 0 && (
          <div className="absolute bottom-0 left-0 right-0 h-16 bg-zinc-950 border-t border-amber-900/20 shadow-2xl flex items-center justify-between px-6 z-30 animate-in slide-in-from-bottom duration-250">
            <div className="flex items-center gap-4">
              <button
                onClick={handleSelectAll}
                className="text-xs font-semibold text-amber-400 hover:underline"
              >
                {selectedIds.length === images.length ? 'Deselect All' : 'Select All In Page'}
              </button>
              <span className="text-xs text-zinc-400">
                Selected <strong className="text-white">{selectedIds.length}</strong> items
              </span>
            </div>

            <div className="flex items-center gap-3">
              {/* Bulk Style Edit dropdown */}
              <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-xl px-2 py-1">
                <span className="text-[10px] uppercase font-bold text-zinc-500">Style</span>
                <select
                  value={bulkStyle}
                  onChange={(e) => setBulkStyle(e.target.value)}
                  className="bg-transparent text-xs text-white focus:outline-none pr-1"
                >
                  <option value="">Choose...</option>
                  {STYLE_OPTIONS.map((style) => (
                    <option key={style} value={style}>{style}</option>
                  ))}
                </select>
                <button
                  disabled={!bulkStyle}
                  onClick={() => handleBulkAction('BULK_EDIT_STYLE')}
                  className="bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-amber-955 text-[10px] font-bold px-2 py-0.5 rounded"
                >
                  Apply
                </button>
              </div>

              {/* Bulk Price Edit input */}
              <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-xl px-2 py-1">
                <span className="text-[10px] uppercase font-bold text-zinc-500">Price ₹</span>
                <input
                  type="number"
                  placeholder="INR"
                  value={bulkPrice}
                  onChange={(e) => setBulkPrice(e.target.value)}
                  className="bg-transparent w-16 text-xs text-white focus:outline-none"
                />
                <button
                  disabled={!bulkPrice}
                  onClick={() => handleBulkAction('BULK_EDIT_PRICE')}
                  className="bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-amber-955 text-[10px] font-bold px-2 py-0.5 rounded"
                >
                  Apply
                </button>
              </div>

              {/* Approve selected / Reject selected */}
              <button
                onClick={() => handleBulkAction('BULK_APPROVE')}
                className="bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-xs font-bold px-4 py-1.5 rounded-xl transition-all"
              >
                Approve All
              </button>
              <button
                onClick={() => handleBulkAction('BULK_REJECT')}
                className="bg-zinc-900 border border-zinc-800 hover:border-red-900/30 text-red-400 text-xs font-bold px-4 py-1.5 rounded-xl transition-all"
              >
                Reject All
              </button>
              <button
                onClick={() => handleBulkAction('BULK_DELETE')}
                className="bg-red-950/20 border border-red-900/30 hover:bg-red-950/40 text-red-400 text-xs font-bold px-4 py-1.5 rounded-xl transition-all"
              >
                Delete Selected
              </button>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
