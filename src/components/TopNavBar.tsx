import React, { useEffect, useRef, useState } from 'react';
import {
  Check,
  Compass,
  Download,
  History,
  Loader2,
  Satellite,
  Search,
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

const FOV_OPTIONS = [
  { label: "3'", value: 0.05 },
  { label: "15'", value: 0.25 },
  { label: '1°', value: 1.0 },
];

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
        className="relative z-30 border-b border-slate-800/80 bg-[#060913]/90 backdrop-blur-xl"
      >
        {/* Row 1: Brand + Coordinate Search + FOV + Share + Compact Status Pill */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 lg:px-6">
          {/* Brand Lockup */}
          <div className="flex shrink-0 items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-cyan-500/40 bg-cyan-500/10 text-cyan-400">
              <Satellite className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="text-lg font-bold tracking-tight text-white">
                Space-Max 0
              </span>
              <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-cyan-300">
                Planet X Explorer
              </span>
            </div>
          </div>

          {/* Coordinate Search Form */}
          <form
            onSubmit={handleCoordinateSubmit}
            className="flex flex-wrap items-center gap-2"
          >
            <div className="flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-950/80 px-2.5 py-1.5">
              <Compass className="h-3.5 w-3.5 shrink-0 text-cyan-400" aria-hidden="true" />
              <label htmlFor="ra-input" className="font-mono text-[11px] text-slate-400">
                RA
              </label>
              <input
                id="ra-input"
                type="text"
                value={raInput}
                onChange={(e) => setRaInput(e.target.value)}
                placeholder="deg / HMS"
                aria-label="Right Ascension in degrees or HMS"
                className="w-24 bg-transparent font-mono text-xs tabular-nums text-slate-100 placeholder:text-slate-600 focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-950/80 px-2.5 py-1.5">
              <label htmlFor="dec-input" className="font-mono text-[11px] text-slate-400">
                Dec
              </label>
              <input
                id="dec-input"
                type="text"
                value={decInput}
                onChange={(e) => setDecInput(e.target.value)}
                placeholder="deg / DMS"
                aria-label="Declination in degrees or DMS"
                className="w-24 bg-transparent font-mono text-xs tabular-nums text-slate-100 placeholder:text-slate-600 focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={isScanning}
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl bg-cyan-500 px-3.5 py-1.5 text-xs font-semibold text-slate-950 transition-all hover:bg-cyan-400 disabled:opacity-60"
            >
              {isScanning ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Search className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              <span>Scan Sky</span>
            </button>

            {inputError && (
              <span className="text-[11px] text-rose-400">{inputError}</span>
            )}
          </form>

          {/* Right Controls: FOV + Share View + Compact Status Pill */}
          <div className="flex shrink-0 flex-wrap items-center gap-2.5">
            <div
              role="group"
              aria-label="Field of View selector"
              className="flex items-center rounded-xl border border-slate-800 bg-slate-950/80 p-1"
            >
              <span className="px-2 font-mono text-[11px] text-slate-400">
                Zoom
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
                    className={`rounded-lg px-2.5 py-1 font-mono text-xs transition-colors ${
                      active
                        ? 'border border-cyan-500/40 bg-cyan-500/20 text-cyan-300'
                        : 'border border-transparent text-slate-400 hover:text-slate-200'
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
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl border border-cyan-500/40 bg-cyan-500/10 px-3 py-1.5 text-xs font-medium text-cyan-200 transition-colors hover:border-cyan-400 hover:bg-cyan-500/20"
            >
              <Sparkles className="h-3.5 w-3.5 text-cyan-300" aria-hidden="true" />
              <span>Guided Tour</span>
            </button>

            <button
              type="button"
              onClick={handleShareView}
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl border border-slate-700/80 bg-slate-900/90 px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:border-cyan-500/50 hover:text-cyan-300"
            >
              <Share2 className="h-3.5 w-3.5 text-cyan-400" aria-hidden="true" />
              <span>Share View</span>
            </button>

            <button
              type="button"
              onClick={() => setSettingsModalOpen(true)}
              className={`inline-flex items-center gap-2 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                backendMode === 'connected'
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200 hover:border-emerald-400'
                  : backendMode === 'checking'
                    ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-200 hover:border-cyan-400'
                    : 'border-slate-700/80 bg-slate-900/90 text-slate-300 hover:border-cyan-500/50'
              }`}
            >
              <span
                aria-hidden="true"
                className={`h-2 w-2 rounded-full ${
                  backendMode === 'connected'
                    ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]'
                    : backendMode === 'checking'
                      ? 'animate-pulse bg-cyan-400'
                      : 'bg-amber-400'
                }`}
              />
              <span>
                {backendMode === 'connected'
                  ? 'SPHEREx Cloud Engine: Live'
                  : backendMode === 'checking'
                    ? 'Connecting to Cloud Engine...'
                    : 'Cloud Engine: Offline (Click to Set URL)'}
              </span>
              <Settings2 className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Live AWS S3 FITS + PyTorch Inference Progress Strip */}
        {isScanning && (
          <div
            role="status"
            aria-live="polite"
            className="flex items-center justify-center gap-2 border-t border-cyan-500/20 bg-cyan-500/10 px-4 py-1.5 text-xs font-medium text-cyan-200"
          >
            <Loader2 className="h-3.5 w-3.5 animate-spin text-cyan-300" aria-hidden="true" />
            <span>Streaming AWS SPHEREx FITS &amp; Running PyTorch Models...</span>
          </div>
        )}

        {/* Row 2: 1-Click NASA Target Preset Pills */}
        <div className="flex items-center gap-2 overflow-x-auto border-t border-slate-800/60 px-4 py-2 lg:px-6">
          <span className="shrink-0 text-[11px] font-medium text-slate-400">
            Jump to Sky Target:
          </span>
          {OFFICIAL_TARGET_PRESETS.map((preset) => {
            const isSelected =
              Math.hypot(preset.ra - ra, preset.dec - dec) < 0.05;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => handlePresetClick(preset)}
                className={`shrink-0 whitespace-nowrap rounded-full border px-3 py-1 font-mono text-xs transition-colors ${
                  isSelected
                    ? 'border-cyan-400/70 bg-cyan-500/15 text-cyan-200'
                    : 'border-slate-800 bg-slate-900/70 text-slate-300 hover:border-slate-700 hover:text-white'
                }`}
              >
                {preset.shortLabel}
              </button>
            );
          })}
        </div>
      </header>

      {/* Engine Settings, Scan History & Export Modal */}
      {settingsModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="backend-settings-title"
          onClick={() => setSettingsModalOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-md"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl border border-slate-700/90 bg-slate-900/95 p-5 shadow-2xl backdrop-blur-xl"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Server className="h-4 w-4 text-cyan-400" aria-hidden="true" />
                <h3
                  id="backend-settings-title"
                  className="text-sm font-semibold text-white"
                >
                  Backend Engine &amp; Explorer Tools
                </h3>
              </div>
              <button
                type="button"
                aria-label="Close settings modal"
                onClick={() => setSettingsModalOpen(false)}
                className="rounded-lg border border-slate-700 bg-slate-950 p-1 text-slate-300 hover:border-cyan-500/50 hover:text-white"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="mt-4">
              <label
                htmlFor="backend-url-modal-input"
                className="block text-xs font-medium text-slate-300"
              >
                Python Cloud Run / FastAPI Base URL
              </label>
              <div className="mt-1.5 flex gap-2">
                <input
                  id="backend-url-modal-input"
                  type="url"
                  value={urlDraft}
                  onChange={(e) => setUrlDraft(e.target.value)}
                  placeholder="http://localhost:8000"
                  className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs text-slate-100 focus:border-cyan-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => {
                    const cleaned =
                      urlDraft.trim().replace(/\/+$/, '') || 'http://localhost:8000';
                    setUrlDraft(cleaned);
                    onUpdateBackendUrl(cleaned);
                    setSettingsModalOpen(false);
                  }}
                  className="inline-flex items-center gap-1 rounded-xl bg-cyan-500 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-cyan-400"
                >
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Save</span>
                </button>
              </div>
              <p className="mt-1.5 text-[11px] text-slate-400">
                Status:{' '}
                <span className="font-semibold text-slate-200">
                  {backendMode === 'connected'
                    ? 'Connected to live SPHEREx Cloud Run FastAPI engine'
                    : backendMode === 'checking'
                      ? 'Pinging /health and streaming telemetry...'
                      : 'Cloud Engine offline — paste your Cloud Run URL and click Save'}
                </span>
              </p>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2.5 border-t border-slate-800 pt-4">
              <button
                type="button"
                onClick={() => {
                  setSettingsModalOpen(false);
                  onOpenHistory();
                }}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-700 bg-slate-950/90 px-3 py-2.5 text-xs font-medium text-slate-200 hover:border-cyan-500/50 hover:text-cyan-300"
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
                className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-700 bg-slate-950/90 px-3 py-2.5 text-xs font-medium text-slate-200 hover:border-emerald-500/50 hover:text-emerald-300"
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
          className={`fixed right-5 bottom-5 z-50 inline-flex items-center gap-2 rounded-xl border bg-slate-900/95 px-4 py-2.5 text-xs font-medium shadow-2xl backdrop-blur-xl ${
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
