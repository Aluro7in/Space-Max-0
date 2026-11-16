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
import {
  buildHips2FitsUrl,
  seededRand,
  type SurveyHipsId,
} from '../utils/astroStretch';

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

const CANVAS_W = 640;
const CANVAS_H = 380;

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
    () => buildHips2FitsUrl(activeSurvey.hips, ra, dec, effectiveFov, CANVAS_W, CANVAS_H),
    [activeSurvey.hips, ra, dec, effectiveFov]
  );

  useEffect(() => {
    setZoomMult(1.0);
    setPanOffset({ x: 0, y: 0 });
    setSelectedSource(null);
    setSurveyImgLoaded(false);
  }, [ra, dec, fov]);

  useEffect(() => {
    setSurveyImgLoaded(false);
  }, [hipsImageUrl]);

  // Catalog markers for Gaia DR3 / WISE / 2MASS inspection
  const catalogSources = useMemo<CatalogSourcePoint[]>(() => {
    const rand = seededRand(ra * 17.3 + dec * 29.1 + Math.round(fov * 100));
    const count = fov >= 0.8 ? 40 : 28;
    return Array.from({ length: count }, (_, idx) => {
      const nx = 0.06 + rand() * 0.88;
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

  // Rich procedural deep-field stars (130+ multi-temperature stars) for instant fallback / blend
  const deepFieldStars = useMemo(() => {
    const rand = seededRand(ra * 43.1 + dec * 19.7 + 7);
    return Array.from({ length: 132 }, (_, idx) => {
      const nx = rand();
      const ny = rand();
      const magRoll = rand();
      const radius = magRoll > 0.92 ? 2.4 + rand() * 1.1 : 0.65 + rand() * 1.45;
      const tempRoll = rand();
      let color = '#E0F2FE'; // A/F blue-white
      if (tempRoll < 0.28) color = '#00F0FF'; // O/B electric cyan
      else if (tempRoll > 0.74) color = '#FDE047'; // G/K solar gold
      else if (tempRoll > 0.6) color = '#FB7185'; // M crimson-rose
      return {
        id: idx,
        nx,
        ny,
        radius,
        alpha: 0.35 + rand() * 0.62,
        color,
        hasSpike: magRoll > 0.93,
      };
    });
  }, [ra, dec]);

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
      // Ignore transient Aladin updates
    }
  }, [useAladinLive, ra, dec, effectiveFov, baseSurvey]);

  // Render Procedural Deep-Field Nebula + 130+ Stars + WCS Grid + Gaia/WISE/2MASS Markers
  useEffect(() => {
    if (useAladinLive) return;
    const canvas = overlayCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = CANVAS_W;
    canvas.height = CANVAS_H;
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

    if (!surveyImgLoaded) {
      // Rich multi-layered cosmic nebula background
      ctx.fillStyle = '#04060C';
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

      const nebulaCyan = ctx.createRadialGradient(
        CANVAS_W * 0.28 + panOffset.x * 0.3,
        CANVAS_H * 0.35 + panOffset.y * 0.3,
        12,
        CANVAS_W * 0.28 + panOffset.x * 0.3,
        CANVAS_H * 0.35 + panOffset.y * 0.3,
        CANVAS_W * 0.52
      );
      if (baseSurvey === 'P/WISE/color') {
        nebulaCyan.addColorStop(0, 'rgba(249, 115, 22, 0.22)');
        nebulaCyan.addColorStop(0.5, 'rgba(30, 27, 75, 0.28)');
        nebulaCyan.addColorStop(1, 'rgba(4, 6, 12, 0)');
      } else if (baseSurvey === 'P/2MASS/color') {
        nebulaCyan.addColorStop(0, 'rgba(244, 63, 94, 0.2)');
        nebulaCyan.addColorStop(0.5, 'rgba(30, 27, 75, 0.25)');
        nebulaCyan.addColorStop(1, 'rgba(4, 6, 12, 0)');
      } else {
        nebulaCyan.addColorStop(0, 'rgba(0, 240, 255, 0.16)');
        nebulaCyan.addColorStop(0.5, 'rgba(56, 189, 248, 0.14)');
        nebulaCyan.addColorStop(1, 'rgba(4, 6, 12, 0)');
      }
      ctx.fillStyle = nebulaCyan;
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

      const nebulaDust = ctx.createRadialGradient(
        CANVAS_W * 0.72 + panOffset.x * 0.4,
        CANVAS_H * 0.68 + panOffset.y * 0.4,
        10,
        CANVAS_W * 0.72 + panOffset.x * 0.4,
        CANVAS_H * 0.68 + panOffset.y * 0.4,
        CANVAS_W * 0.48
      );
      nebulaDust.addColorStop(0, 'rgba(0, 240, 255, 0.14)');
      nebulaDust.addColorStop(0.55, 'rgba(190, 18, 60, 0.1)');
      nebulaDust.addColorStop(1, 'rgba(4, 6, 12, 0)');
      ctx.fillStyle = nebulaDust;
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

      // 130+ Multi-temperature procedural background stars + 6-point spikes on bright stars
      for (const star of deepFieldStars) {
        const sx = star.nx * CANVAS_W + panOffset.x * 0.75;
        const sy = star.ny * CANVAS_H + panOffset.y * 0.75;
        if (sx < -6 || sx > CANVAS_W + 6 || sy < -6 || sy > CANVAS_H + 6) continue;

        ctx.save();
        ctx.globalAlpha = star.alpha;

        if (star.hasSpike) {
          const halo = ctx.createRadialGradient(sx, sy, 0, sx, sy, star.radius * 5.2);
          halo.addColorStop(0, star.color);
          halo.addColorStop(1, 'rgba(4, 6, 12, 0)');
          ctx.fillStyle = halo;
          ctx.beginPath();
          ctx.arc(sx, sy, star.radius * 5.2, 0, Math.PI * 2);
          ctx.fill();

          ctx.strokeStyle = star.color;
          ctx.lineWidth = 0.85;
          for (let k = 0; k < 3; k += 1) {
            const ang = (k * Math.PI) / 3;
            const len = star.radius * 5.5;
            ctx.beginPath();
            ctx.moveTo(sx - Math.cos(ang) * len, sy - Math.sin(ang) * len);
            ctx.lineTo(sx + Math.cos(ang) * len, sy + Math.sin(ang) * len);
            ctx.stroke();
          }
        }

        ctx.fillStyle = star.hasSpike ? '#FFFFFF' : star.color;
        ctx.beginPath();
        ctx.arc(sx, sy, star.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    // 1. WCS Tangent Coordinate Grid in subtle Electric Cyan
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.16)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i += 1) {
      const pos = (i / 4) * CANVAS_W;
      ctx.beginPath();
      ctx.moveTo(pos, 0);
      ctx.lineTo(pos, CANVAS_H);
      ctx.stroke();
    }
    for (let j = 1; j < 3; j += 1) {
      const pos = (j / 3) * CANVAS_H;
      ctx.beginPath();
      ctx.moveTo(0, pos);
      ctx.lineTo(CANVAS_W, pos);
      ctx.stroke();
    }

    ctx.fillStyle = 'rgba(186, 230, 253, 0.78)';
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.fillText(`RA ${(ra + effectiveFov * 0.45).toFixed(3)}°`, 12, CANVAS_H - 36);
    ctx.fillText(`Dec ${(dec + effectiveFov * 0.45).toFixed(3)}°`, 12, 46);

    // 2. Interactive Catalog Sources (Gaia DR3 cyan circles + emerald PM vectors, WISE thermal halos)
    for (const s of catalogSources) {
      const sx = s.nx * CANVAS_W + panOffset.x;
      const sy = s.ny * CANVAS_H + panOffset.y;
      if (sx < 6 || sx > CANVAS_W - 6 || sy < 6 || sy > CANVAS_H - 6) continue;

      if (overlays.wiseHeatMap && s.inWise) {
        const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, 13);
        glow.addColorStop(0, 'rgba(249, 115, 22, 0.5)');
        glow.addColorStop(1, 'rgba(249, 115, 22, 0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(sx, sy, 13, 0, Math.PI * 2);
        ctx.fill();
      }

      if (overlays.gaiaStarMap && s.inGaia) {
        ctx.strokeStyle = 'rgba(0, 240, 255, 0.85)';
        ctx.lineWidth = 1.25;
        ctx.beginPath();
        ctx.arc(sx, sy, 5.5, 0, Math.PI * 2);
        ctx.stroke();

        const vx = (s.pmRa / 16) * 9;
        const vy = -(s.pmDec / 16) * 9;
        ctx.strokeStyle = 'rgba(16, 185, 129, 0.9)';
        ctx.lineWidth = 1.15;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx + vx, sy + vy);
        ctx.stroke();
      }

      if (overlays.twoMass && s.inTwoMass) {
        ctx.strokeStyle = 'rgba(251, 191, 36, 0.9)';
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

    // 3. Center Primary Target Reticle (Solar Gold + White Core + 6-point JWST Flare)
    const tx = CANVAS_W * 0.5 + panOffset.x;
    const ty = CANVAS_H * 0.5 + panOffset.y;

    const targetGlow = ctx.createRadialGradient(tx, ty, 0, tx, ty, 24);
    targetGlow.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
    targetGlow.addColorStop(0.28, 'rgba(251, 191, 36, 0.72)');
    targetGlow.addColorStop(0.65, 'rgba(0, 240, 255, 0.24)');
    targetGlow.addColorStop(1, 'rgba(4, 6, 12, 0)');
    ctx.fillStyle = targetGlow;
    ctx.beginPath();
    ctx.arc(tx, ty, 24, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#FBBF24';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(tx, ty, 13, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(tx - 20, ty);
    ctx.lineTo(tx - 8, ty);
    ctx.moveTo(tx + 8, ty);
    ctx.lineTo(tx + 20, ty);
    ctx.moveTo(tx, ty - 20);
    ctx.lineTo(tx, ty - 8);
    ctx.moveTo(tx, ty + 8);
    ctx.lineTo(tx, ty + 20);
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
    deepFieldStars,
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
        x: Math.max(-110, Math.min(110, dragStartRef.current.px + dx)),
        y: Math.max(-70, Math.min(70, dragStartRef.current.py + dy)),
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
      const clickX = ((e.clientX - rect.left) / rect.width) * CANVAS_W - panOffset.x;
      const clickY = ((e.clientY - rect.top) / rect.height) * CANVAS_H - panOffset.y;
      const nx = clickX / CANVAS_W;
      const ny = clickY / CANVAS_H;
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
    <div className="flex flex-col gap-2">
      <div className="relative h-[265px] w-full overflow-hidden rounded-xl border border-cyan-500/30 bg-[#04060C] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)] xl:h-[295px]">
        <div
          ref={aladinContainerRef}
          className={`h-full w-full ${useAladinLive ? 'block' : 'hidden'}`}
        />

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

        {/* Top-Left Survey Readout */}
        <div className="pointer-events-none absolute top-2.5 left-2.5 z-20 flex items-center gap-1.5 rounded-lg border border-cyan-500/35 bg-[#090D18]/85 px-2.5 py-1 text-[10.5px] font-medium text-cyan-200 backdrop-blur-md">
          <Compass className="h-3.5 w-3.5 text-cyan-400" aria-hidden="true" />
          <span>
            {useAladinLive
              ? 'Aladin Lite v3 WebGL'
              : surveyImgLoaded
                ? `CDS ${activeSurvey.label}`
                : `WCS Deep-Field · ${activeSurvey.label}`}
          </span>
        </div>

        {/* Zoom & Pan Reset Controls */}
        <div className="absolute top-2.5 right-2.5 z-20 flex items-center gap-1">
          <button
            type="button"
            aria-label="Zoom in sky map"
            onClick={() => setZoomMult((z) => Math.min(4, Number((z * 1.35).toFixed(2))))}
            className="rounded-lg border border-slate-700/80 bg-[#090D18]/85 p-1.5 text-cyan-200 backdrop-blur-md hover:border-cyan-400"
          >
            <ZoomIn className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="Zoom out sky map"
            onClick={() => setZoomMult((z) => Math.max(0.5, Number((z / 1.35).toFixed(2))))}
            className="rounded-lg border border-slate-700/80 bg-[#090D18]/85 p-1.5 text-cyan-200 backdrop-blur-md hover:border-cyan-400"
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
            className="rounded-lg border border-slate-700/80 bg-[#090D18]/85 p-1.5 text-cyan-200 backdrop-blur-md hover:border-cyan-400"
          >
            <LocateFixed className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          {typeof window !== 'undefined' && Boolean(window.A) && (
            <button
              type="button"
              onClick={() => setUseAladinLive((v) => !v)}
              className="rounded-lg border border-slate-700/80 bg-[#090D18]/85 px-2 py-1 text-[10px] font-medium text-cyan-200 backdrop-blur-md hover:border-cyan-400"
            >
              {useAladinLive ? 'HiPS Cutout' : 'Aladin 3D'}
            </button>
          )}
        </div>

        {/* Selected Gaia Source Chip */}
        {selectedSource && !useAladinLive && (
          <div className="pointer-events-none absolute top-11 left-2.5 z-20 rounded-lg border border-emerald-400/50 bg-[#090D18]/90 px-2.5 py-1 font-mono text-[10px] text-emerald-200 backdrop-blur-md">
            <p className="font-semibold">{selectedSource.id}</p>
            <p className="text-slate-300">
              G={selectedSource.mag} · μ=({selectedSource.pmRa}, {selectedSource.pmDec}) mas/yr
            </p>
          </div>
        )}

        {/* Bottom Target Bar */}
        <div className="pointer-events-none absolute right-2.5 bottom-2.5 left-2.5 z-20 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-700/80 bg-[#090D18]/85 px-2.5 py-1 font-mono text-[10px] tabular-nums text-slate-300 backdrop-blur-md">
          <span className="inline-flex items-center gap-1 text-amber-300">
            <Sparkles className="h-3 w-3 text-cyan-400" aria-hidden="true" />
            {preset?.name ?? 'Custom Target'} ·{' '}
            {gaiaMatched ? 'Catalogued Star' : 'Unmapped IR Target'}
          </span>
          <span className="text-sky-200">
            {hoverCoords
              ? `Cursor ${hoverCoords.ra.toFixed(3)}°, ${hoverCoords.dec.toFixed(3)}°`
              : `FOV ${effectiveFov.toFixed(2)}°`}
          </span>
        </div>
      </div>

      {/* Compact Survey Selector + Overlay Chips */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800/80 bg-[#04060C]/90 px-2.5 py-1.5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]">
        <div className="flex flex-wrap items-center gap-1">
          <span className="mr-0.5 inline-flex items-center gap-1 text-[10.5px] font-medium text-slate-400">
            <Layers className="h-3 w-3 text-cyan-400" aria-hidden="true" />
            Survey:
          </span>
          {SURVEY_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setBaseSurvey(opt.id)}
              className={`rounded-md border px-2 py-0.5 text-[10.5px] font-medium transition-colors ${
                baseSurvey === opt.id
                  ? 'border-cyan-400/60 bg-cyan-500/20 text-cyan-200'
                  : 'border-slate-800 bg-[#090D18] text-slate-400 hover:text-slate-200'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2.5 text-[10.5px]">
          <label className="inline-flex cursor-pointer items-center gap-1 text-cyan-300">
            <input
              type="checkbox"
              checked={overlays.gaiaStarMap}
              onChange={() => onToggleOverlay('gaiaStarMap')}
              className="accent-cyan-400"
            />
            <span>Gaia DR3</span>
          </label>
          <label className="inline-flex cursor-pointer items-center gap-1 text-orange-300">
            <input
              type="checkbox"
              checked={overlays.wiseHeatMap}
              onChange={() => onToggleOverlay('wiseHeatMap')}
              className="accent-orange-400"
            />
            <span>WISE</span>
          </label>
          <label className="inline-flex cursor-pointer items-center gap-1 text-amber-300">
            <input
              type="checkbox"
              checked={overlays.twoMass}
              onChange={() => onToggleOverlay('twoMass')}
              className="accent-amber-400"
            />
            <span>2MASS</span>
          </label>
        </div>
      </div>
    </div>
  );
}
