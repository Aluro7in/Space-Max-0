import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Compass,
  Layers,
  LocateFixed,
  Sparkles,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type { AladinBaseSurvey, TelescopeOverlayState } from '../types/telemetry';
import { findClosestPreset } from '../data/presetsAndFallback';
import { buildHips2FitsUrl, type SurveyHipsId } from '../utils/astroStretch';

interface AladinSkyMapProps {
  ra: number;
  dec: number;
  fov: number;
  gaiaMatched: boolean;
  overlays: TelescopeOverlayState;
  onToggleOverlay: (key: keyof TelescopeOverlayState) => void;
}

const SURVEY_OPTIONS: Array<{
  id: AladinBaseSurvey;
  hips: SurveyHipsId;
  label: string;
}> = [
  { id: 'P/WISE/color', hips: 'CDS/P/allWISE/color', label: 'WISE Heat Map' },
  { id: 'P/2MASS/color', hips: 'CDS/P/2MASS/color', label: '2MASS Near-IR' },
  { id: 'P/DSS2/color', hips: 'CDS/P/DSS2/color', label: 'Visible Sky (DSS2)' },
];

interface CatalogSourcePoint {
  id: string;
  nx: number;
  ny: number;
  ra: number;
  dec: number;
  mag: number;
  pmRa: number;
  pmDec: number;
  inGaia: boolean;
  inWise: boolean;
  inTwoMass: boolean;
}

function seededRand(seed: number): () => number {
  let s = Math.floor(Math.abs(seed * 10000)) % 2147483647;
  if (s <= 0) s = 1337;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export function AladinSkyMap({
  ra,
  dec,
  fov,
  gaiaMatched,
  overlays,
  onToggleOverlay,
}: AladinSkyMapProps) {
  const aladinContainerRef = useRef<HTMLDivElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const aladinRef = useRef<any>(null);

  const [baseSurvey, setBaseSurvey] = useState<AladinBaseSurvey>('P/WISE/color');
  const [zoomMult, setZoomMult] = useState<number>(1.0);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const dragStartRef = useRef<{ x: number; y: number; px: number; py: number } | null>(null);

  const [surveyImgLoaded, setSurveyImgLoaded] = useState<boolean>(false);
  const [aladinReady, setAladinReady] = useState<boolean>(false);
  const [useAladinLive, setUseAladinLive] = useState<boolean>(false);

  const [hoverCoords, setHoverCoords] = useState<{ ra: number; dec: number } | null>(
    null
  );
  const [selectedSource, setSelectedSource] = useState<CatalogSourcePoint | null>(
    null
  );

  const preset = useMemo(() => findClosestPreset(ra, dec), [ra, dec]);
  const activeSurvey = useMemo(
    () => SURVEY_OPTIONS.find((s) => s.id === baseSurvey) ?? SURVEY_OPTIONS[0],
    [baseSurvey]
  );

  const effectiveFov = Math.max(0.02, Math.min(3.5, fov / zoomMult));
  const hipsImageUrl = useMemo(
    () => buildHips2FitsUrl(activeSurvey.hips, ra, dec, effectiveFov, 512, 512),
    [activeSurvey.hips, ra, dec, effectiveFov]
  );

  // Reset pan/zoom & selection when target changes
  useEffect(() => {
    setZoomMult(1.0);
    setPanOffset({ x: 0, y: 0 });
    setSelectedSource(null);
    setSurveyImgLoaded(false);
  }, [ra, dec, fov]);

  useEffect(() => {
    setSurveyImgLoaded(false);
  }, [hipsImageUrl]);

  // Generate deterministic Gaia DR3 / WISE / 2MASS catalog markers for interactive inspection
  const catalogSources = useMemo<CatalogSourcePoint[]>(() => {
    const rand = seededRand(ra * 17.3 + dec * 29.1 + Math.round(fov * 100));
    const count = fov >= 0.8 ? 36 : 24;
    return Array.from({ length: count }, (_, idx) => {
      const nx = 0.08 + rand() * 0.84;
      const ny = 0.08 + rand() * 0.84;
      return {
        id: `GAIA DR3 ${Math.floor(100000000 + rand() * 899999999)}`,
        nx,
        ny,
        ra: ra - (nx - 0.5) * effectiveFov,
        dec: dec - (ny - 0.5) * effectiveFov,
        mag: Number((12.4 + rand() * 6.8).toFixed(2)),
        pmRa: Number(((rand() - 0.5) * 32).toFixed(1)),
        pmDec: Number(((rand() - 0.5) * 32).toFixed(1)),
        inGaia: idx % 4 !== 0,
        inWise: idx % 3 === 0,
        inTwoMass: idx % 5 === 0,
      };
    });
  }, [ra, dec, fov, effectiveFov]);

  // Optional Aladin Lite v3 initialization when switched manually
  useEffect(() => {
    if (!useAladinLive || aladinReady) return;
    let cancelled = false;
    const boot = async () => {
      try {
        if (!window.A || !window.A.init || !aladinContainerRef.current) return;
        await window.A.init;
        if (cancelled || !aladinContainerRef.current) return;
        const aladin = window.A.aladin(aladinContainerRef.current, {
          survey: baseSurvey,
          fov: effectiveFov,
          target: `${ra} ${dec}`,
          showReticle: true,
          showZoomControl: true,
          showLayersControl: false,
        });
        aladinRef.current = aladin;
        setAladinReady(true);
      } catch {
        setUseAladinLive(false);
      }
    };
    void boot();
    return () => {
      cancelled = true;
    };
  }, [useAladinLive, aladinReady, baseSurvey, effectiveFov, ra, dec]);

  useEffect(() => {
    if (!useAladinLive || !aladinRef.current) return;
    try {
      aladinRef.current.gotoRaDec(ra, dec);
      aladinRef.current.setFoV(effectiveFov);
      aladinRef.current.setImageSurvey(baseSurvey);
    } catch {
      // Ignore transient Aladin projection updates
    }
  }, [useAladinLive, ra, dec, effectiveFov, baseSurvey]);

  // Render WCS Tangent Coordinate Grid, Gaia DR3 proper-motion vectors, & Target Reticle
  useEffect(() => {
    if (useAladinLive) return;
    const canvas = overlayCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = 384;
    canvas.width = size;
    canvas.height = size;
    ctx.clearRect(0, 0, size, size);

    // If CDS photographic cutout isn't loaded yet, paint deep infrared obsidian nebula backdrop
    if (!surveyImgLoaded) {
      const grad = ctx.createRadialGradient(
        size * 0.5,
        size * 0.5,
        14,
        size * 0.5,
        size * 0.5,
        size * 0.72
      );
      if (baseSurvey === 'P/WISE/color') {
        grad.addColorStop(0, '#1c1008');
        grad.addColorStop(0.55, '#0b0a0e');
        grad.addColorStop(1, '#050507');
      } else if (baseSurvey === 'P/2MASS/color') {
        grad.addColorStop(0, '#1a0b12');
        grad.addColorStop(0.55, '#09090d');
        grad.addColorStop(1, '#050507');
      } else {
        grad.addColorStop(0, '#0c1524');
        grad.addColorStop(0.55, '#070a12');
        grad.addColorStop(1, '#050507');
      }
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, size, size);
    }

    // 1. WCS Tangent Coordinate Grid
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.22)';
    ctx.lineWidth = 1;
    const divisions = 4;
    for (let i = 1; i < divisions; i += 1) {
      const pos = (i / divisions) * size;
      ctx.beginPath();
      ctx.moveTo(pos, 0);
      ctx.lineTo(pos, size);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(0, pos);
      ctx.lineTo(size, pos);
      ctx.stroke();
    }

    // WCS coordinate tick labels
    ctx.fillStyle = 'rgba(253, 230, 138, 0.78)';
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.fillText(`RA ${(ra + effectiveFov * 0.45).toFixed(3)}°`, 10, size - 30);
    ctx.fillText(`Dec ${(dec + effectiveFov * 0.45).toFixed(3)}°`, 10, 42);

    // 2. Catalog Sources (Gaia DR3 circles + PM vectors, WISE heat halos, 2MASS reticles)
    for (const s of catalogSources) {
      const sx = s.nx * size + panOffset.x;
      const sy = s.ny * size + panOffset.y;
      if (sx < 4 || sx > size - 4 || sy < 4 || sy > size - 4) continue;

      if (!surveyImgLoaded) {
        ctx.fillStyle = 'rgba(255, 251, 235, 0.78)';
        ctx.beginPath();
        ctx.arc(sx, sy, 1.7, 0, Math.PI * 2);
        ctx.fill();
      }

      if (overlays.wiseHeatMap && s.inWise) {
        const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, 11);
        glow.addColorStop(0, 'rgba(255, 85, 0, 0.45)');
        glow.addColorStop(1, 'rgba(255, 85, 0, 0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(sx, sy, 11, 0, Math.PI * 2);
        ctx.fill();
      }

      if (overlays.gaiaStarMap && s.inGaia) {
        ctx.strokeStyle = 'rgba(34, 211, 238, 0.8)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(sx, sy, 5.5, 0, Math.PI * 2);
        ctx.stroke();

        // Gaia DR3 Proper Motion vector tick
        const vx = (s.pmRa / 16) * 8;
        const vy = -(s.pmDec / 16) * 8;
        ctx.strokeStyle = 'rgba(16, 185, 129, 0.85)';
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx + vx, sy + vy);
        ctx.stroke();
      }

      if (overlays.twoMass && s.inTwoMass) {
        ctx.strokeStyle = 'rgba(251, 191, 36, 0.85)';
        ctx.lineWidth = 1;
        ctx.strokeRect(sx - 4.5, sy - 4.5, 9, 9);
      }

      if (selectedSource?.id === s.id) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(sx, sy, 10, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // 3. Center Planet X / Primary Target Reticle
    const tx = size * 0.5 + panOffset.x;
    const ty = size * 0.5 + panOffset.y;

    const targetGlow = ctx.createRadialGradient(tx, ty, 0, tx, ty, 20);
    targetGlow.addColorStop(0, 'rgba(251, 191, 36, 0.72)');
    targetGlow.addColorStop(0.45, 'rgba(255, 85, 0, 0.25)');
    targetGlow.addColorStop(1, 'rgba(255, 85, 0, 0)');
    ctx.fillStyle = targetGlow;
    ctx.beginPath();
    ctx.arc(tx, ty, 20, 0, Math.PI * 2);
    ctx.fill();

    // Precision JWST target crosshair
    ctx.strokeStyle = '#FBBF24';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(tx, ty, 13, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(tx - 19, ty);
    ctx.lineTo(tx - 8, ty);
    ctx.moveTo(tx + 8, ty);
    ctx.lineTo(tx + 19, ty);
    ctx.moveTo(tx, ty - 19);
    ctx.lineTo(tx, ty - 8);
    ctx.moveTo(tx, ty + 8);
    ctx.lineTo(tx, ty + 19);
    ctx.stroke();
  }, [
    useAladinLive,
    surveyImgLoaded,
    baseSurvey,
    ra,
    dec,
    effectiveFov,
    overlays,
    catalogSources,
    panOffset,
    selectedSource,
  ]);

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      px: panOffset.x,
      py: panOffset.y,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width - 0.5;
    const ny = (e.clientY - rect.top) / rect.height - 0.5;
    setHoverCoords({
      ra: ra - nx * effectiveFov,
      dec: dec - ny * effectiveFov,
    });

    if (isDragging && dragStartRef.current) {
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      setPanOffset({
        x: Math.max(-90, Math.min(90, dragStartRef.current.px + dx)),
        y: Math.max(-90, Math.min(90, dragStartRef.current.py + dy)),
      });
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const moved =
      dragStartRef.current &&
      Math.hypot(
        e.clientX - dragStartRef.current.x,
        e.clientY - dragStartRef.current.y
      ) > 4;
    setIsDragging(false);
    dragStartRef.current = null;

    if (!moved) {
      const rect = e.currentTarget.getBoundingClientRect();
      const clickX = ((e.clientX - rect.left) / rect.width) * 384 - panOffset.x;
      const clickY = ((e.clientY - rect.top) / rect.height) * 384 - panOffset.y;
      const nx = clickX / 384;
      const ny = clickY / 384;
      let nearest: CatalogSourcePoint | null = null;
      let bestDist = 0.055;
      for (const s of catalogSources) {
        const d = Math.hypot(s.nx - nx, s.ny - ny);
        if (d < bestDist) {
          bestDist = d;
          nearest = s;
        }
      }
      setSelectedSource(nearest);
    }
  };

  return (
    <div className="flex flex-col gap-2.5">
      <div className="relative aspect-square max-h-[370px] w-full overflow-hidden rounded-xl border border-amber-500/25 bg-[#050507]">
        {/* Aladin Lite v3 Mount (Optional toggle when external WebGL tiles are reachable) */}
        <div
          ref={aladinContainerRef}
          className={`h-full w-full ${useAladinLive ? 'block' : 'hidden'}`}
        />

        {/* Real CDS HiPS2FITS Survey Cutout + Interactive WCS/Gaia Overlay */}
        {!useAladinLive && (
          <>
            <img
              src={hipsImageUrl}
              alt={`${activeSurvey.label} sky survey cutout`}
              referrerPolicy="no-referrer"
              onLoad={() => setSurveyImgLoaded(true)}
              onError={() => setSurveyImgLoaded(false)}
              style={{
                transform: `translate(${panOffset.x}px, ${panOffset.y}px)`,
              }}
              className={`pointer-events-none absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${
                surveyImgLoaded ? 'opacity-100' : 'opacity-0'
              }`}
            />
            <canvas
              ref={overlayCanvasRef}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={() => {
                setIsDragging(false);
                setHoverCoords(null);
              }}
              aria-label="Interactive CDS Sky Survey and WCS Catalog Overlay"
              className="relative z-10 h-full w-full cursor-crosshair object-cover"
            />
          </>
        )}

        {/* Top-Left Live Survey Label */}
        <div className="pointer-events-none absolute top-3 left-3 z-20 flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-[#050507]/85 px-2.5 py-1 text-[11px] font-medium text-amber-200">
          <Compass className="h-3.5 w-3.5 text-amber-400" aria-hidden="true" />
          <span>
            {useAladinLive
              ? 'Aladin Lite v3 WebGL'
              : surveyImgLoaded
                ? `CDS ${activeSurvey.label}`
                : 'WCS Infrared Field'}
          </span>
        </div>

        {/* Zoom & Pan Reset Controls */}
        <div className="absolute top-3 right-3 z-20 flex items-center gap-1">
          <button
            type="button"
            aria-label="Zoom in sky map"
            onClick={() => setZoomMult((z) => Math.min(4, Number((z * 1.35).toFixed(2))))}
            className="rounded-lg border border-amber-500/25 bg-[#050507]/85 p-1.5 text-amber-200 hover:border-amber-400"
          >
            <ZoomIn className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="Zoom out sky map"
            onClick={() => setZoomMult((z) => Math.max(0.5, Number((z / 1.35).toFixed(2))))}
            className="rounded-lg border border-amber-500/25 bg-[#050507]/85 p-1.5 text-amber-200 hover:border-amber-400"
          >
            <ZoomOut className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="Center sky map"
            onClick={() => {
              setZoomMult(1.0);
              setPanOffset({ x: 0, y: 0 });
            }}
            className="rounded-lg border border-amber-500/25 bg-[#050507]/85 p-1.5 text-amber-200 hover:border-amber-400"
          >
            <LocateFixed className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          {typeof window !== 'undefined' && Boolean(window.A) && (
            <button
              type="button"
              onClick={() => setUseAladinLive((v) => !v)}
              className="rounded-lg border border-amber-500/25 bg-[#050507]/85 px-2 py-1 text-[10px] font-medium text-amber-200 hover:border-amber-400"
            >
              {useAladinLive ? 'HiPS Cutout' : 'Aladin 3D'}
            </button>
          )}
        </div>

        {/* Selected Gaia Source Readout Chip */}
        {selectedSource && !useAladinLive && (
          <div className="pointer-events-none absolute top-12 left-3 z-20 rounded-lg border border-emerald-400/50 bg-[#050507]/90 px-2.5 py-1.5 font-mono text-[10px] text-emerald-200">
            <p className="font-semibold">{selectedSource.id}</p>
            <p className="text-slate-300">
              G={selectedSource.mag} · μ=({selectedSource.pmRa}, {selectedSource.pmDec}) mas/yr
            </p>
          </div>
        )}

        {/* Bottom Live Target Pill */}
        <div className="pointer-events-none absolute right-3 bottom-3 left-3 z-20 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/25 bg-[#050507]/85 px-2.5 py-1.5 font-mono text-[10px] tabular-nums text-slate-300">
          <span className="inline-flex items-center gap-1 text-amber-300">
            <Sparkles className="h-3 w-3" aria-hidden="true" />
            {preset?.name ?? 'Custom Target'} ·{' '}
            {gaiaMatched ? 'Catalogued Star' : 'Unmapped IR Target'}
          </span>
          <span>
            {hoverCoords
              ? `Cursor ${hoverCoords.ra.toFixed(3)}°, ${hoverCoords.dec.toFixed(3)}°`
              : `FOV ${effectiveFov.toFixed(2)}°`}
          </span>
        </div>
      </div>

      {/* Survey Selector + Quick Overlay Chips */}
      <div className="space-y-2 rounded-xl border border-amber-500/20 bg-[#050507] p-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 inline-flex items-center gap-1 text-[11px] font-medium text-slate-400">
            <Layers className="h-3.5 w-3.5 text-amber-400" aria-hidden="true" />
            Sky Survey:
          </span>
          {SURVEY_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setBaseSurvey(opt.id)}
              className={`rounded-lg border px-2 py-1 text-[11px] font-medium transition-colors ${
                baseSurvey === opt.id
                  ? 'border-amber-500/50 bg-amber-500/20 text-amber-200'
                  : 'border-amber-500/15 bg-[#0B0C10] text-slate-400 hover:text-amber-100'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-amber-500/15 pt-2 text-[11px]">
          <label className="inline-flex cursor-pointer items-center gap-1.5 text-cyan-300">
            <input
              type="checkbox"
              checked={overlays.gaiaStarMap}
              onChange={() => onToggleOverlay('gaiaStarMap')}
              className="accent-cyan-400"
            />
            <span className="h-2 w-2 rounded-full bg-cyan-400" />
            <span>Gaia DR3 + PM Vectors</span>
          </label>

          <label className="inline-flex cursor-pointer items-center gap-1.5 text-[#FF5500]">
            <input
              type="checkbox"
              checked={overlays.wiseHeatMap}
              onChange={() => onToggleOverlay('wiseHeatMap')}
              className="accent-orange-500"
            />
            <span className="h-2 w-2 rounded-full bg-[#FF5500]" />
            <span>WISE Heat Map</span>
          </label>

          <label className="inline-flex cursor-pointer items-center gap-1.5 text-amber-300">
            <input
              type="checkbox"
              checked={overlays.twoMass}
              onChange={() => onToggleOverlay('twoMass')}
              className="accent-amber-400"
            />
            <span className="h-2 w-2 rounded-full bg-amber-400" />
            <span>2MASS Near-IR</span>
          </label>
        </div>
      </div>
    </div>
  );
}
