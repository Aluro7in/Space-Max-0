import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Compass, Layers, Sparkles } from 'lucide-react';
import type { AladinBaseSurvey, TelescopeOverlayState } from '../types/telemetry';
import { findClosestPreset } from '../data/presetsAndFallback';

interface AladinSkyMapProps {
  ra: number;
  dec: number;
  fov: number;
  gaiaMatched: boolean;
  overlays: TelescopeOverlayState;
  onToggleOverlay: (key: keyof TelescopeOverlayState) => void;
}

const SURVEY_OPTIONS: Array<{ id: AladinBaseSurvey; label: string }> = [
  { id: 'P/WISE/color', label: 'WISE Heat Map' },
  { id: 'P/2MASS/color', label: '2MASS Near-IR' },
  { id: 'P/DSS2/color', label: 'Visible Sky (DSS2)' },
];

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
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const aladinRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const gaiaCatRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const wiseCatRef = useRef<any>(null);

  const [baseSurvey, setBaseSurvey] = useState<AladinBaseSurvey>('P/WISE/color');
  const [aladinReady, setAladinReady] = useState<boolean>(false);
  const [aladinFailed, setAladinFailed] = useState<boolean>(false);
  const [forceInteractiveCanvas, setForceInteractiveCanvas] =
    useState<boolean>(false);
  const [hoverCoords, setHoverCoords] = useState<{
    ra: number;
    dec: number;
  } | null>(null);

  const preset = useMemo(() => findClosestPreset(ra, dec), [ra, dec]);

  // Initialize Aladin Lite v3 once
  useEffect(() => {
    let cancelled = false;

    const boot = async () => {
      try {
        for (
          let attempt = 0;
          attempt < 10 && !window.A && !cancelled;
          attempt += 1
        ) {
          await new Promise((resolve) => window.setTimeout(resolve, 250));
        }
        if (!window.A || !window.A.init || !containerRef.current) {
          if (!cancelled) setAladinFailed(true);
          return;
        }

        await window.A.init;
        if (cancelled || !containerRef.current) return;

        const aladin = window.A.aladin(containerRef.current, {
          survey: baseSurvey,
          fov,
          target: `${ra} ${dec}`,
          showReticle: true,
          showZoomControl: true,
          showLayersControl: false,
        });
        aladinRef.current = aladin;

        if (window.A.catalogHiPS && aladin.addCatalog) {
          const gaiaCat = window.A.catalogHiPS(
            'https://axel.u-strasbg.fr/HiPSCatService/I/355/gaiadr3',
            {
              name: 'Gaia Star Map',
              color: '#22d3ee',
              shape: 'circle',
              sourceSize: 9,
              onClick: 'showTable',
            }
          );
          gaiaCatRef.current = gaiaCat;
          if (overlays.gaiaStarMap) {
            aladin.addCatalog(gaiaCat);
          }

          const wiseCat = window.A.catalogHiPS(
            'https://axel.u-strasbg.fr/HiPSCatService/II/328/allwise',
            {
              name: 'WISE Heat Map',
              color: '#fb923c',
              shape: 'square',
              sourceSize: 8,
              onClick: 'showTable',
            }
          );
          wiseCatRef.current = wiseCat;
          if (overlays.wiseHeatMap) {
            aladin.addCatalog(wiseCat);
          }
        }

        setAladinReady(true);
        setAladinFailed(false);
      } catch {
        if (!cancelled) setAladinFailed(true);
      }
    };

    boot();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync RA, Dec, FOV to Aladin
  useEffect(() => {
    const aladin = aladinRef.current;
    if (!aladin) return;
    try {
      aladin.gotoRaDec(ra, dec);
      aladin.setFoV(fov);
    } catch {
      // Ignore transient projection error
    }
  }, [ra, dec, fov]);

  // Sync Base Survey to Aladin
  useEffect(() => {
    const aladin = aladinRef.current;
    if (!aladin) return;
    try {
      aladin.setImageSurvey(baseSurvey);
    } catch {
      // Ignore transient survey switch error
    }
  }, [baseSurvey]);

  // Sync Telescope Overlays to Aladin HiPS catalogs
  useEffect(() => {
    const aladin = aladinRef.current;
    if (!aladin) return;
    try {
      if (gaiaCatRef.current) {
        if (overlays.gaiaStarMap) {
          gaiaCatRef.current.show?.();
        } else {
          gaiaCatRef.current.hide?.();
        }
      }
      if (wiseCatRef.current) {
        if (overlays.wiseHeatMap) {
          wiseCatRef.current.show?.();
        } else {
          wiseCatRef.current.hide?.();
        }
      }
      if (overlays.twoMass && baseSurvey !== 'P/2MASS/color') {
        // Keep baseSurvey controllable while allowing 2MASS markers on fallback
      }
    } catch {
      // Ignore overlay toggle errors
    }
  }, [overlays, baseSurvey]);

  // Interactive HTML5 Canvas Starfield & Coordinate Grid (used automatically when Aladin is loading/blocked or toggled)
  const showCanvasFallback =
    !aladinReady || aladinFailed || forceInteractiveCanvas;

  useEffect(() => {
    if (!showCanvasFallback) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId = 0;
    const size = 360;
    canvas.width = size;
    canvas.height = size;

    const rand = seededRand(ra * 17.3 + dec * 29.1 + Math.round(fov * 100));
    const starCount = fov >= 0.8 ? 85 : fov >= 0.2 ? 55 : 38;
    const stars = Array.from({ length: starCount }, (_, idx) => ({
      x: 16 + rand() * (size - 32),
      y: 16 + rand() * (size - 32),
      r: 0.9 + rand() * 2.1,
      brightness: 0.35 + rand() * 0.65,
      inGaia: idx % 3 !== 0,
      inWise: idx % 4 === 0,
      inTwoMass: idx % 5 === 0,
      phase: rand() * Math.PI * 2,
    }));

    const drawFrame = (nowMs: number) => {
      const t = nowMs * 0.001;

      // 1. Deep space gradient background tinted subtly by active survey
      const bgGrad = ctx.createRadialGradient(
        size * 0.5,
        size * 0.5,
        12,
        size * 0.5,
        size * 0.5,
        size * 0.72
      );
      if (baseSurvey === 'P/WISE/color' || overlays.wiseHeatMap) {
        bgGrad.addColorStop(0, '#130b24');
        bgGrad.addColorStop(0.55, '#080c1c');
        bgGrad.addColorStop(1, '#040710');
      } else if (baseSurvey === 'P/2MASS/color') {
        bgGrad.addColorStop(0, '#1a0b1d');
        bgGrad.addColorStop(0.6, '#090b18');
        bgGrad.addColorStop(1, '#04060e');
      } else {
        bgGrad.addColorStop(0, '#09152a');
        bgGrad.addColorStop(0.6, '#060a16');
        bgGrad.addColorStop(1, '#03050b');
      }
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, size, size);

      // 2. Coordinate Grid (RA / Dec lines scaled by FOV)
      ctx.strokeStyle = 'rgba(34, 211, 238, 0.14)';
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

      // Subtle RA/Dec tick labels
      ctx.fillStyle = 'rgba(148, 163, 184, 0.65)';
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.fillText(
        `RA ${(ra - fov / 2).toFixed(2)}°`,
        8,
        size - 8
      );
      ctx.fillText(
        `Dec ${(dec + fov / 2).toFixed(2)}°`,
        8,
        16
      );

      // 3. Background Stars + Telescope Overlays
      for (const s of stars) {
        const twinkle = 0.85 + 0.15 * Math.sin(t * 2.2 + s.phase);
        const alpha = s.brightness * twinkle;

        if (overlays.wiseHeatMap && s.inWise) {
          const glow = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, 11);
          glow.addColorStop(0, 'rgba(251, 146, 60, 0.5)');
          glow.addColorStop(1, 'rgba(251, 146, 60, 0)');
          ctx.fillStyle = glow;
          ctx.beginPath();
          ctx.arc(s.x, s.y, 11, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.fillStyle = `rgba(226, 232, 240, ${alpha.toFixed(2)})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();

        if (overlays.gaiaStarMap && s.inGaia) {
          ctx.strokeStyle = 'rgba(34, 211, 238, 0.72)';
          ctx.lineWidth = 1.1;
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.r + 3.5, 0, Math.PI * 2);
          ctx.stroke();
        }

        if (overlays.twoMass && s.inTwoMass) {
          ctx.strokeStyle = 'rgba(232, 121, 249, 0.75)';
          ctx.lineWidth = 1;
          ctx.strokeRect(s.x - 4, s.y - 4, 8, 8);
        }
      }

      // 4. Glowing Moving Planet X / Target Object at center (ra, dec)
      const cx = size * 0.5;
      const cy = size * 0.5;
      const driftX = Math.sin(t * 1.1) * 5;
      const driftY = Math.cos(t * 0.9) * 3.5;
      const tx = cx + driftX;
      const ty = cy + driftY;

      const targetGlow = ctx.createRadialGradient(tx, ty, 0, tx, ty, 22);
      targetGlow.addColorStop(0, 'rgba(163, 230, 53, 0.95)');
      targetGlow.addColorStop(0.35, 'rgba(34, 211, 238, 0.55)');
      targetGlow.addColorStop(1, 'rgba(34, 211, 238, 0)');
      ctx.fillStyle = targetGlow;
      ctx.beginPath();
      ctx.arc(tx, ty, 22, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ecfccb';
      ctx.beginPath();
      ctx.arc(tx, ty, 3.6, 0, Math.PI * 2);
      ctx.fill();

      // Pulsing green/lime discovery ring around target
      const ringR = 14 + Math.sin(t * 3) * 2;
      ctx.strokeStyle = 'rgba(163, 230, 53, 0.85)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(tx, ty, ringR, 0, Math.PI * 2);
      ctx.stroke();

      rafId = window.requestAnimationFrame(drawFrame);
    };

    rafId = window.requestAnimationFrame(drawFrame);
    return () => window.cancelAnimationFrame(rafId);
  }, [showCanvasFallback, ra, dec, fov, baseSurvey, overlays]);

  const handleCanvasMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width - 0.5;
    const ny = (e.clientY - rect.top) / rect.height - 0.5;
    setHoverCoords({
      ra: ra - nx * fov,
      dec: dec - ny * fov,
    });
  };

  return (
    <div className="flex flex-col gap-2.5">
      <div className="relative aspect-square max-h-[370px] w-full overflow-hidden rounded-xl border border-slate-800 bg-[#040710]">
        {/* Aladin Lite v3 Mount */}
        <div
          ref={containerRef}
          className={`h-full w-full ${showCanvasFallback ? 'hidden' : 'block'}`}
        />

        {/* Interactive HTML5 Canvas Starfield & Coordinate Grid (Always Alive in Sandbox) */}
        {showCanvasFallback && (
          <canvas
            ref={canvasRef}
            onMouseMove={handleCanvasMove}
            onMouseLeave={() => setHoverCoords(null)}
            aria-label="Interactive Starfield and Coordinate Grid"
            className="h-full w-full cursor-crosshair object-contain"
          />
        )}

        {/* Top-Left Live Map Label */}
        <div className="pointer-events-none absolute top-3 left-3 flex items-center gap-1.5 rounded-lg border border-cyan-500/40 bg-slate-950/85 px-2.5 py-1 text-[11px] font-medium text-cyan-200">
          <Compass className="h-3.5 w-3.5 text-cyan-400" aria-hidden="true" />
          <span>
            {showCanvasFallback
              ? 'Interactive Starfield & Grid'
              : 'Aladin Lite v3 Live Sky'}
          </span>
        </div>

        {/* Toggle between Aladin WebGL & Starfield Canvas if Aladin loaded */}
        {aladinReady && !aladinFailed && (
          <button
            type="button"
            onClick={() => setForceInteractiveCanvas((prev) => !prev)}
            className="absolute top-3 right-3 rounded-lg border border-slate-700 bg-slate-950/85 px-2 py-1 text-[10px] font-medium text-slate-300 hover:border-cyan-500/50 hover:text-cyan-200"
          >
            {forceInteractiveCanvas ? 'Use Aladin Tiles' : 'Starfield View'}
          </button>
        )}

        {/* Bottom Live Target Pill */}
        <div className="pointer-events-none absolute right-3 bottom-3 left-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-950/85 px-2.5 py-1.5 font-mono text-[10px] tabular-nums text-slate-300">
          <span className="inline-flex items-center gap-1 text-lime-300">
            <Sparkles className="h-3 w-3" aria-hidden="true" />
            {preset?.name ?? 'Custom Target'} ·{' '}
            {gaiaMatched ? 'Catalogued Star' : 'Unmapped IR Target'}
          </span>
          <span>
            {hoverCoords
              ? `Cursor ${hoverCoords.ra.toFixed(3)}°, ${hoverCoords.dec.toFixed(3)}°`
              : `FOV ${fov}°`}
          </span>
        </div>
      </div>

      {/* Survey Selector + Quick Overlay Chips */}
      <div className="rounded-xl border border-slate-800 bg-slate-950/75 p-2.5 space-y-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 inline-flex items-center gap-1 text-[11px] font-medium text-slate-400">
            <Layers className="h-3.5 w-3.5 text-cyan-400" aria-hidden="true" />
            Sky View:
          </span>
          {SURVEY_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setBaseSurvey(opt.id)}
              className={`rounded-lg border px-2 py-1 text-[11px] font-medium transition-colors ${
                baseSurvey === opt.id
                  ? 'border-cyan-500/50 bg-cyan-500/15 text-cyan-200'
                  : 'border-slate-800 bg-slate-900 text-slate-400 hover:text-slate-200'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-slate-800/80 pt-2 text-[11px]">
          <label className="inline-flex cursor-pointer items-center gap-1.5 text-cyan-300">
            <input
              type="checkbox"
              checked={overlays.gaiaStarMap}
              onChange={() => onToggleOverlay('gaiaStarMap')}
              className="accent-cyan-400"
            />
            <span className="h-2 w-2 rounded-full bg-cyan-400" />
            <span>Gaia Star Map</span>
          </label>

          <label className="inline-flex cursor-pointer items-center gap-1.5 text-amber-300">
            <input
              type="checkbox"
              checked={overlays.wiseHeatMap}
              onChange={() => onToggleOverlay('wiseHeatMap')}
              className="accent-amber-400"
            />
            <span className="h-2 w-2 rounded-full bg-amber-400" />
            <span>WISE Heat Map</span>
          </label>

          <label className="inline-flex cursor-pointer items-center gap-1.5 text-fuchsia-300">
            <input
              type="checkbox"
              checked={overlays.twoMass}
              onChange={() => onToggleOverlay('twoMass')}
              className="accent-fuchsia-400"
            />
            <span className="h-2 w-2 rounded-full bg-fuchsia-400" />
            <span>2MASS</span>
          </label>
        </div>
      </div>
    </div>
  );
}
