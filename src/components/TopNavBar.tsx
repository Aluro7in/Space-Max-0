import React, { useEffect, useRef, useState } from 'react';
import {
  Check,
  Compass,
  Download,
  History,
  Loader2,
  Play,
  Satellite,
  Server,
  Settings2,
  Share2,
  Sparkles,
  X,
} from 'lucide-react';
import type { BackendConnectionMode, TargetPreset } from '../types/telemetry';
import {
  OFFICIAL_TARGET_PRESETS,
  parseDecInput,
  parseRaInput,
} from '../data/presetsAndFallback';

interface TopNavBarProps {
  ra: number;
  dec: number;
  fov: number;
  isScanning: boolean;
  backendMode: BackendConnectionMode;
  backendUrl: string;
  historyCount: number;
  onSelectTarget: (ra: number, dec: number) => void;
  onSelectFov: (fov: number) => void;
  onUpdateBackendUrl: (url: string) => void;
  onOpenHistory: () => void;
  onExportJson: () => void;
  onStartTour: () => void;
}

const OFFICIAL_RENDER_URL =
  ((import.meta.env.VITE_PYTHON_API_URL as string | undefined) || '')
    .trim()
    .replace(/\/+$/, '') || 'https://space-max-0-backend.onrender.com';

const FOV_OPTIONS = [
  { label: "3'", value: 0.05 },
  { label: "15'", value: 0.25 },
  { label: '1°', value: 1.0 },
];

const PRESET_DISPLAY_META: Record<
  string,
  { name: string; badge: string }
> = {
  'spherex-qr2': { name: 'SPHEREx QR2', badge: 'Planet X' },
  'wise-0855': { name: 'WISE 0855', badge: 'Coldest Y-Dwarf' },
  'barnards-star': { name: "Barnard's Star", badge: 'Fastest Star' },
  'epsilon-indi-b': { name: 'Epsilon Indi B', badge: 'Twin Brown Dwarfs' },
  'rw-aurigae': { name: 'RW Aurigae', badge: 'Dust Disk' },
  'r-draconis': { name: 'R Draconis', badge: 'Mira Giant' },
};

export function TopNavBar({
  ra,
  dec,
  fov,
  isScanning,
  backendMode,
  backendUrl,
  historyCount,
  onSelectTarget,
  onSelectFov,
  onUpdateBackendUrl,
  onOpenHistory,
  onExportJson,
  onStartTour,
}: TopNavBarProps) {
  const [raInput, setRaInput] = useState<string>(ra.toFixed(6));
  const [decInput, setDecInput] = useState<string>(dec.toFixed(6));
  const [inputError, setInputError] = useState<string | null>(null);
  const [settingsModalOpen, setSettingsModalOpen] = useState<boolean>(false);
  const [urlDraft, setUrlDraft] = useState<string>(backendUrl);
  const [toastState, setToastState] = useState<{
    message: string;
    ok: boolean;
  } | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setRaInput(ra.toFixed(6));
    setDecInput(dec.toFixed(6));
    setInputError(null);
  }, [ra, dec]);

  useEffect(() => {
    setUrlDraft(backendUrl);
  }, [backendUrl]);

  useEffect(() => {
    if (!settingsModalOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSettingsModalOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [settingsModalOpen]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  const handleCoordinateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedRa = parseRaInput(raInput);
    const parsedDec = parseDecInput(decInput);
    if (parsedRa === null || parsedDec === null) {
      setInputError('Enter valid RA (0–360°) and Dec (-90–+90°)');
      return;
    }
    setInputError(null);
    onSelectTarget(parsedRa, parsedDec);
  };

  const handleShareView = async () => {
    if (typeof window === 'undefined') return;
    const shareUrlObj = new URL(window.location.href);
    shareUrlObj.searchParams.set('ra', ra.toFixed(5));
    shareUrlObj.searchParams.set('dec', dec.toFixed(5));
    shareUrlObj.searchParams.set('fov', fov.toString());
    const shareUrl = shareUrlObj.toString();

    let copied = false;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(shareUrl);
        copied = true;
      }
    } catch {
      copied = false;
    }

    if (!copied) {
      const textarea = document.createElement('textarea');
      textarea.value = shareUrl;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      try {
        copied = document.execCommand('copy');
      } catch {
        copied = false;
      }
      document.body.removeChild(textarea);
    }

    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }
    setToastState(
      copied
        ? { message: 'Link copied to clipboard!', ok: true }
        : { message: 'Clipboard blocked — copy URL from address bar', ok: false }
    );
    toastTimerRef.current = window.setTimeout(() => {
      setToastState(null);
    }, 2600);
  };

  const handlePresetClick = (preset: TargetPreset) => {
    setInputError(null);
    onSelectTarget(preset.ra, preset.dec);
  };

  return (
    <>
      <header
        data-tour="step-1"
        className="relative z-30 border-b border-white/[0.07] bg-[#04060C]/90 backdrop-blur-xl"
      >
        {/* Row 1: Brand + Sleek Single-Row Coordinate Pill Bar + FOV + Cloud Status */}
        <div className="mx-auto flex max-w-[1760px] flex-wrap items-center justify-between gap-2 px-4 py-1.5 lg:px-5">
          <div className="flex shrink-0 items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-cyan-400/35 bg-cyan-500/10 text-cyan-300 shadow-[0_0_12px_rgba(0,240,255,0.14)]">
              <Satellite className="h-3.5 w-3.5" aria-hidden="true" />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold tracking-tight text-[#F8FAFC]">
                Space-Max 0
              </span>
              <span className="hidden rounded border border-white/[0.08] bg-white/[0.03] px-1.5 py-0.5 font-mono text-[9.5px] font-medium text-cyan-300/90 sm:inline-block">
                JWST × SPHEREx
              </span>
            </div>
          </div>

          {/* Unified Single-Row Coordinate Pill Bar */}
          <form
            onSubmit={handleCoordinateSubmit}
            title="Enter Sky Patch Coordinates (RA & Dec) to watch the 6-epoch infrared time-lapse video"
            className="flex flex-wrap items-center gap-1 rounded-xl border border-cyan-400/30 bg-[#0B101E]/90 p-1 shadow-[0_0_18px_rgba(0,240,255,0.08)]"
          >
            <div className="flex items-center gap-1.5 rounded-lg bg-[#050811] px-2.5 py-1 focus-within:ring-1 focus-within:ring-cyan-400/50">
              <Compass className="h-3.5 w-3.5 shrink-0 text-cyan-400" aria-hidden="true" />
              <label htmlFor="ra-input" className="font-mono text-[10px] font-medium text-slate-400">
                RA
              </label>
              <input
                id="ra-input"
                type="text"
                value={raInput}
                onChange={(e) => setRaInput(e.target.value)}
                placeholder="166.3324°"
                title="Right Ascension in degrees (0–360°) or HMS"
                aria-label="Right Ascension in degrees or HMS"
                className="w-21 bg-transparent font-mono text-[11px] tabular-nums text-[#F8FAFC] placeholder:text-slate-600 focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-1.5 rounded-lg bg-[#050811] px-2.5 py-1 focus-within:ring-1 focus-within:ring-cyan-400/50">
              <label htmlFor="dec-input" className="font-mono text-[10px] font-medium text-slate-400">
                Dec
              </label>
              <input
                id="dec-input"
                type="text"
                value={decInput}
                onChange={(e) => setDecInput(e.target.value)}
                placeholder="+29.9406°"
                title="Declination in degrees (-90° to +90°) or DMS"
                aria-label="Declination in degrees or DMS"
                className="w-21 bg-transparent font-mono text-[11px] tabular-nums text-[#F8FAFC] placeholder:text-slate-600 focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={isScanning}
              title="Stream calibrated multi-epoch FITS frames and watch sky patch time-lapse"
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-gradient-to-r from-cyan-400 to-sky-400 px-3 py-1 text-[11px] font-bold text-[#04060C] shadow-[0_0_12px_rgba(0,240,255,0.22)] transition-all hover:brightness-110 disabled:opacity-60"
            >
              {isScanning ? (
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
              ) : (
                <Play className="h-3 w-3 fill-current" aria-hidden="true" />
              )}
              <span>{isScanning ? 'Scanning...' : 'Watch Sky Patch'}</span>
            </button>

            {inputError && (
              <span className="px-1.5 text-[10px] font-medium text-rose-400">
                {inputError}
              </span>
            )}
          </form>

          {/* Right Controls: FOV + Tour + Share View + Resilient Cloud Status */}
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <div
              role="group"
              aria-label="Field of View selector"
              className="flex items-center rounded-xl border border-slate-800 bg-[#090D18] p-0.5"
            >
              <span className="px-2 font-mono text-[10px] text-slate-400">
                FOV
              </span>
              {FOV_OPTIONS.map((opt) => {
                const active =
                  Math.abs(fov - opt.value) < 0.04 ||
                  (opt.value === 0.25 && Math.abs(fov - 0.15) < 0.02);
                return (
                  <button
                    key={opt.label}
                    type="button"
                    onClick={() => onSelectFov(opt.value)}
                    className={`rounded-lg px-2 py-0.5 font-mono text-[11px] transition-colors ${
                      active
                        ? 'border border-cyan-400/50 bg-cyan-500/20 text-cyan-200'
                        : 'border border-transparent text-slate-400 hover:text-slate-100'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={onStartTour}
              className="inline-flex items-center gap-1 whitespace-nowrap rounded-xl border border-amber-400/40 bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-200 transition-colors hover:border-amber-400 hover:bg-amber-500/20"
            >
              <Sparkles className="h-3 w-3 text-amber-400" aria-hidden="true" />
              <span>Guided Tour</span>
            </button>

            <button
              type="button"
              onClick={handleShareView}
              className="inline-flex items-center gap-1 whitespace-nowrap rounded-xl border border-slate-800 bg-[#090D18] px-2.5 py-1 text-[11px] font-medium text-slate-200 transition-colors hover:border-cyan-400/50 hover:text-cyan-200"
            >
              <Share2 className="h-3 w-3 text-cyan-400" aria-hidden="true" />
              <span>Share</span>
            </button>

            <button
              type="button"
              onClick={() => setSettingsModalOpen(true)}
              className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                backendMode === 'connected'
                  ? 'border-emerald-500/45 bg-emerald-500/15 text-emerald-200 hover:border-emerald-400'
                  : backendMode === 'checking'
                    ? 'border-cyan-500/45 bg-cyan-500/15 text-cyan-200 hover:border-cyan-400'
                    : 'border-cyan-500/40 bg-emerald-500/10 text-cyan-200 hover:border-cyan-400'
              }`}
            >
              <span
                aria-hidden="true"
                className={`h-2 w-2 rounded-full ${
                  backendMode === 'connected'
                    ? 'bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.85)]'
                    : backendMode === 'checking'
                      ? 'animate-pulse bg-cyan-400'
                      : 'bg-cyan-400 shadow-[0_0_8px_rgba(0,240,255,0.75)]'
                }`}
              />
              <span>
                {backendMode === 'connected'
                  ? 'SPHEREx Cloud Engine: Live (Render)'
                  : backendMode === 'checking'
                    ? 'Connecting to Render Cloud...'
                    : 'SPHEREx Cloud + Edge Engine: Active'}
              </span>
              <Settings2 className="h-3 w-3 text-slate-400" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Live AWS S3 FITS + PyTorch Inference Progress Strip */}
        {isScanning && (
          <div
            role="status"
            aria-live="polite"
            className="flex items-center justify-center gap-2 border-t border-cyan-500/20 bg-cyan-500/10 px-4 py-1 text-[11px] font-medium text-cyan-200"
          >
            <Loader2 className="h-3 w-3 animate-spin text-cyan-400" aria-hidden="true" />
            <span>Streaming AWS SPHEREx FITS &amp; Running PyTorch Tri-Model Inference...</span>
          </div>
        )}

        {/* Row 2: Clean Single-Line 6-Preset Strip with Hover Coordinate Tooltips */}
        <div className="mx-auto flex max-w-[1760px] items-center gap-1.5 overflow-x-auto border-t border-white/[0.06] px-4 py-1 lg:px-5">
          <span className="shrink-0 text-[10px] font-medium uppercase tracking-wider text-slate-400">
            Sky Target:
          </span>
          <div className="flex flex-1 items-center gap-1.5">
            {OFFICIAL_TARGET_PRESETS.map((preset) => {
              const isSelected =
                Math.hypot(preset.ra - ra, preset.dec - dec) < 0.05;
              const meta = PRESET_DISPLAY_META[preset.id] ?? {
                name: preset.name,
                badge: preset.shortLabel,
              };
              const hoverCoordinates = `${preset.name} (${preset.shortLabel}) — RA ${preset.ra.toFixed(4)}°, Dec ${preset.dec >= 0 ? '+' : ''}${preset.dec.toFixed(4)}°`;
              return (
                <button
                  key={preset.id}
                  type="button"
                  title={hoverCoordinates}
                  onClick={() => handlePresetClick(preset)}
                  className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 py-0.5 text-[10.5px] transition-all ${
                    isSelected
                      ? 'border-cyan-400/65 bg-cyan-500/15 text-cyan-100 shadow-[0_0_12px_rgba(0,240,255,0.16)]'
                      : 'border-white/[0.07] bg-[#0B101E]/80 text-slate-300 hover:border-cyan-400/40 hover:text-white'
                  }`}
                >
                  <span className="font-semibold">{meta.name}</span>
                  <span aria-hidden="true" className="text-slate-500">
                    •
                  </span>
                  <span
                    className={`font-mono text-[9.5px] ${
                      isSelected ? 'text-cyan-300' : 'text-amber-300/85'
                    }`}
                  >
                    {meta.badge}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </header>

      {/* Engine Settings, Scan History & Export Modal */}
      {settingsModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="backend-settings-title"
          onClick={() => setSettingsModalOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl border border-cyan-500/30 bg-[#090D18]/95 p-5 shadow-2xl backdrop-blur-xl"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Server className="h-4 w-4 text-cyan-400" aria-hidden="true" />
                <h3
                  id="backend-settings-title"
                  className="text-sm font-semibold text-[#F8FAFC]"
                >
                  SPHEREx Cloud Engine &amp; Explorer Tools
                </h3>
              </div>
              <button
                type="button"
                aria-label="Close settings modal"
                onClick={() => setSettingsModalOpen(false)}
                className="rounded-lg border border-slate-800 bg-[#04060C] p-1 text-slate-300 hover:border-cyan-400/50 hover:text-white"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="mt-4">
              <label
                htmlFor="backend-url-modal-input"
                className="block text-xs font-medium text-slate-300"
              >
                Python FastAPI Inference Endpoint
              </label>
              <div className="mt-1.5 flex gap-2">
                <input
                  id="backend-url-modal-input"
                  type="url"
                  value={urlDraft}
                  onChange={(e) => setUrlDraft(e.target.value)}
                  placeholder="https://space-max-0-backend.onrender.com"
                  className="min-w-0 flex-1 rounded-xl border border-slate-800 bg-[#04060C] px-3 py-2 font-mono text-xs text-[#F8FAFC] focus:border-cyan-400 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => {
                    const cleaned =
                      urlDraft.trim().replace(/\/+$/, '') || OFFICIAL_RENDER_URL;
                    setUrlDraft(cleaned);
                    onUpdateBackendUrl(cleaned);
                    setSettingsModalOpen(false);
                  }}
                  className="inline-flex items-center gap-1 rounded-xl bg-cyan-400 px-3 py-2 text-xs font-bold text-[#04060C] hover:bg-cyan-300"
                >
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Save</span>
                </button>
              </div>

              <div className="mt-2.5 flex items-center justify-between gap-2">
                <p className="text-[11px] text-slate-400">
                  Mode:{' '}
                  <span className="font-semibold text-cyan-200">
                    {backendMode === 'connected'
                      ? 'Live SPHEREx Render FastAPI'
                      : backendMode === 'checking'
                        ? 'Pinging /health & streaming FITS...'
                        : 'Edge Telemetry Assisting (Render Standby)'}
                  </span>
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setUrlDraft(OFFICIAL_RENDER_URL);
                    onUpdateBackendUrl(OFFICIAL_RENDER_URL);
                    setSettingsModalOpen(false);
                  }}
                  className="shrink-0 rounded-lg border border-cyan-500/35 bg-cyan-500/10 px-2.5 py-1 text-[11px] font-medium text-cyan-200 transition-colors hover:bg-cyan-500/20"
                >
                  Reset to Official Render Cloud
                </button>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2.5 border-t border-slate-800 pt-4">
              <button
                type="button"
                onClick={() => {
                  setSettingsModalOpen(false);
                  onOpenHistory();
                }}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-800 bg-[#04060C] px-3 py-2.5 text-xs font-medium text-slate-200 hover:border-cyan-400/50 hover:text-cyan-200"
              >
                <History className="h-3.5 w-3.5 text-cyan-400" aria-hidden="true" />
                <span>Scan History ({historyCount})</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setSettingsModalOpen(false);
                  onExportJson();
                }}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-800 bg-[#04060C] px-3 py-2.5 text-xs font-medium text-slate-200 hover:border-emerald-400/50 hover:text-emerald-200"
              >
                <Download className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
                <span>Download JSON</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clipboard Toast Notification */}
      {toastState && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed right-5 bottom-5 z-50 inline-flex items-center gap-2 rounded-xl border bg-[#090D18]/95 px-4 py-2.5 text-xs font-medium shadow-2xl backdrop-blur-xl ${
            toastState.ok
              ? 'border-emerald-400/50 text-emerald-200'
              : 'border-amber-400/50 text-amber-200'
          }`}
        >
          <Check
            className={`h-4 w-4 ${
              toastState.ok ? 'text-emerald-400' : 'text-amber-400'
            }`}
            aria-hidden="true"
          />
          <span>{toastState.message}</span>
        </div>
      )}
    </>
  );
}
