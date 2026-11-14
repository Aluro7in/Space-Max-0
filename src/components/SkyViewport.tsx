import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  Eye,
  Globe,
  Layers,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import type {
  Coordinates,
  SkyViewMode,
  TelescopeOverlayState,
} from '../types/telemetry';
import { AladinSkyMap } from './AladinSkyMap';
import { BlinkComparator } from './BlinkComparator';

interface SkyViewportProps {
  coordinates: Coordinates;
  fov: number;
  pastFrameBase64: string;
  presentFrameBase64: string;
  stacked6Array: boolean;
  gaiaMatched: boolean;
  onToggleStack6: (stacked: boolean) => void;
}

function normalizeImgSrc(raw: string): string {
  if (!raw) return '';
  return raw.startsWith('data:image/') ? raw : `data:image/png;base64,${raw}`;
}

export function SkyViewport({
  coordinates,
  fov,
  pastFrameBase64,
  presentFrameBase64,
  stacked6Array,
  gaiaMatched,
  onToggleStack6,
}: SkyViewportProps) {
  // Default active view: Time-Machine Blink Video
  const [viewMode, setViewMode] = useState<SkyViewMode>('blink');
  const [overlays, setOverlays] = useState<TelescopeOverlayState>({
    gaiaStarMap: true,
    wiseHeatMap: true,
    twoMass: false,
  });

  const diffCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const pastSrc = useMemo(
    () => normalizeImgSrc(pastFrameBase64),
    [pastFrameBase64]
  );
  const presentSrc = useMemo(
    () => normalizeImgSrc(presentFrameBase64),
    [presentFrameBase64]
  );

  // Difference Subtraction (Now - Past) HTML5 canvas
  useEffect(() => {
    if (viewMode !== 'difference' || !pastSrc || !presentSrc) return;
    const canvas = diffCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let cancelled = false;
    const imgPast = new Image();
    const imgPresent = new Image();
    imgPast.crossOrigin = 'anonymous';
    imgPresent.crossOrigin = 'anonymous';

    let loaded = 0;
    const onBothLoaded = () => {
      loaded += 1;
      if (loaded < 2 || cancelled) return;

      const w = 256;
      const h = 256;
      canvas.width = w;
      canvas.height = h;

      const offA = document.createElement('canvas');
      offA.width = w;
      offA.height = h;
      const ctxA = offA.getContext('2d');

      const offB = document.createElement('canvas');
      offB.width = w;
      offB.height = h;
      const ctxB = offB.getContext('2d');
      if (!ctxA || !ctxB) return;

      ctxA.drawImage(imgPast, 0, 0, w, h);
      ctxB.drawImage(imgPresent, 0, 0, w, h);

      const dataA = ctxA.getImageData(0, 0, w, h).data;
      const dataB = ctxB.getImageData(0, 0, w, h).data;
      const out = ctx.createImageData(w, h);

      for (let i = 0; i < w * h; i += 1) {
        const idx = i * 4;
        const lumA = (dataA[idx] + dataA[idx + 1] + dataA[idx + 2]) / 3;
        const lumB = (dataB[idx] + dataB[idx + 1] + dataB[idx + 2]) / 3;
        const diff = lumB - lumA;
        const absDiff = Math.min(255, Math.abs(diff) * (stacked6Array ? 2.8 : 2.1));

        if (diff > 10) {
          out.data[idx] = Math.round(absDiff * 0.12);
          out.data[idx + 1] = Math.round(Math.min(255, absDiff * 1.1));
          out.data[idx + 2] = Math.round(Math.min(255, absDiff * 1.25));
        } else if (diff < -10) {
          out.data[idx] = Math.round(Math.min(255, absDiff * 1.18));
          out.data[idx + 1] = Math.round(absDiff * 0.14);
          out.data[idx + 2] = Math.round(Math.min(255, absDiff * 1.1));
        } else {
          const base = Math.round(lumB * 0.11);
          out.data[idx] = base;
          out.data[idx + 1] = base + 2;
          out.data[idx + 2] = base + 7;
        }
        out.data[idx + 3] = 255;
      }

      ctx.putImageData(out, 0, 0);
    };

    imgPast.onload = onBothLoaded;
    imgPresent.onload = onBothLoaded;
    imgPast.src = pastSrc;
    imgPresent.src = presentSrc;

    return () => {
      cancelled = true;
    };
  }, [viewMode, pastSrc, presentSrc, stacked6Array]);

  const handleToggleOverlay = (key: keyof TelescopeOverlayState) => {
    setOverlays((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <section
      data-tour="step-2"
      aria-label="Step 1: Spot the Moving Object"
      className="flex flex-col justify-between gap-3 rounded-2xl border border-slate-800/80 bg-slate-900/60 p-4 backdrop-blur-md lg:col-span-5"
    >
      {/* Header + View Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold text-white">
            Step 1: Spot the Moving Object!
          </h2>
          <p className="font-mono text-[11px] tabular-nums text-slate-400">
            RA {coordinates.ra.toFixed(4)}° · Dec{' '}
            {coordinates.dec >= 0 ? '+' : ''}
            {coordinates.dec.toFixed(4)}° · FOV {fov}°
          </p>
        </div>

        <div
          role="tablist"
          aria-label="Sky viewer modes"
          className="flex flex-wrap items-center gap-1 rounded-xl border border-slate-800 bg-slate-950/90 p-1"
        >
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === 'blink'}
            onClick={() => setViewMode('blink')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
              viewMode === 'blink'
                ? 'bg-cyan-500/20 text-cyan-300'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Eye className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Blink Video</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={viewMode === 'difference'}
            onClick={() => setViewMode('difference')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
              viewMode === 'difference'
                ? 'bg-fuchsia-500/20 text-fuchsia-300'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Subtract: Now − Past</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={viewMode === 'aladin'}
            onClick={() => setViewMode('aladin')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
              viewMode === 'aladin'
                ? 'bg-emerald-500/20 text-emerald-300'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Globe className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Live Sky Map</span>
          </button>
        </div>
      </div>

      {/* Active Mode Canvas */}
      {viewMode === 'blink' && (
        <BlinkComparator
          ra={coordinates.ra}
          dec={coordinates.dec}
          pastFrameBase64={pastFrameBase64}
          presentFrameBase64={presentFrameBase64}
          stacked6Array={stacked6Array}
        />
      )}

      {viewMode === 'difference' && (
        <div className="relative flex aspect-square max-h-[370px] w-full items-center justify-center overflow-hidden rounded-xl border border-slate-800 bg-black">
          <canvas
            ref={diffCanvasRef}
            className="h-full w-full object-contain"
          />
          <div className="absolute top-3 left-3 rounded-md border border-fuchsia-500/50 bg-slate-950/85 px-2.5 py-1 font-mono text-[11px] text-fuchsia-300">
            Subtract: Now − Past
          </div>
          <div className="absolute bottom-3 left-3 flex items-center gap-3 rounded-md border border-slate-800 bg-slate-950/85 px-2.5 py-1 font-mono text-[10px] text-slate-300">
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-cyan-400" />
              New Spot (Now)
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-fuchsia-500" />
              Old Spot (2000)
            </span>
          </div>
        </div>
      )}

      {viewMode === 'aladin' && (
        <AladinSkyMap
          ra={coordinates.ra}
          dec={coordinates.dec}
          fov={fov}
          gaiaMatched={gaiaMatched}
          overlays={overlays}
          onToggleOverlay={handleToggleOverlay}
        />
      )}

      {/* Visual Switches Below Viewer */}
      <div className="space-y-2">
        {/* Combine 6 SPHEREx Detectors */}
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-950/75 px-3 py-2">
          <span className="text-xs font-medium text-slate-300">
            Combine 6 SPHEREx Detectors
          </span>
          <div className="flex items-center rounded-lg border border-slate-800 bg-slate-900 p-0.5">
            <button
              type="button"
              onClick={() => onToggleStack6(false)}
              className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                !stacked6Array
                  ? 'bg-slate-700 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Single Camera
            </button>
            <button
              type="button"
              onClick={() => onToggleStack6(true)}
              className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                stacked6Array
                  ? 'border border-cyan-500/40 bg-cyan-500/20 text-cyan-300'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Stack All 6 Cameras — Clearer Image
            </button>
          </div>
        </div>

        {/* Telescope Overlays Quick Bar (always visible for instant switching) */}
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-950/75 px-3 py-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-300">
            <Layers className="h-3.5 w-3.5 text-cyan-400" aria-hidden="true" />
            <span>Telescope Overlays</span>
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                ['gaiaStarMap', 'Gaia Star Map'],
                ['wiseHeatMap', 'WISE Heat Map'],
                ['twoMass', '2MASS'],
              ] as Array<[keyof TelescopeOverlayState, string]>
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  handleToggleOverlay(key);
                  if (viewMode !== 'aladin') setViewMode('aladin');
                }}
                className={`rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  overlays[key]
                    ? 'border-cyan-500/50 bg-cyan-500/15 text-cyan-200'
                    : 'border-slate-800 bg-slate-900 text-slate-400 hover:text-slate-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Compact Status Pills */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-300">
            <ShieldCheck className="h-3 w-3" aria-hidden="true" />
            Camera: Clean
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1 text-[11px] font-medium text-cyan-300">
            <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
            Space Dust: Removed
          </span>
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium ${
              gaiaMatched
                ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                : 'border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-300'
            }`}
          >
            {gaiaMatched ? 'Known Star in Map' : 'New Unmapped Object'}
          </span>
        </div>
      </div>
    </section>
  );
}
