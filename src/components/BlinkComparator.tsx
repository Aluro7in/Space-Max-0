import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Crosshair, Pause, Play, Sparkles } from 'lucide-react';
import { getTargetFrameMotion } from '../data/presetsAndFallback';
import {
  buildHips2FitsUrl,
  buildSyntheticFitsEpochMatrices,
  extract32x32FromDataUrl,
  renderStretchedFitsToCanvas,
  zscaleAsinhStretch,
} from '../utils/astroStretch';

interface BlinkComparatorProps {
  ra: number;
  dec: number;
  fov: number;
  pastFrameBase64: string;
  presentFrameBase64: string;
  epoch1Matrix?: number[][];
  epoch2Matrix?: number[][];
  datacubeSlice?: number[][];
  stacked6Array: boolean;
  onTargetLocked?: () => void;
}

function normalizeImgSrc(raw: string): string {
  if (!raw) return '';
  return raw.startsWith('data:image/') ? raw : `data:image/png;base64,${raw}`;
}

export function BlinkComparator({
  ra,
  dec,
  fov,
  pastFrameBase64,
  presentFrameBase64,
  epoch1Matrix,
  epoch2Matrix,
  datacubeSlice,
  stacked6Array,
  onTargetLocked,
}: BlinkComparatorProps) {
  const motion = useMemo(() => getTargetFrameMotion(ra, dec), [ra, dec]);

  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [intervalMs, setIntervalMs] = useState<number>(motion.blinkMs);
  const [epochBlend, setEpochBlend] = useState<number>(0); // 0 = Past (2000), 100 = SPHEREx Now
  const [targetLocked, setTargetLocked] = useState<boolean>(false);
  const [missHint, setMissHint] = useState<boolean>(false);

  const [pastSurveyLoaded, setPastSurveyLoaded] = useState<boolean>(false);
  const [presentSurveyLoaded, setPresentSurveyLoaded] = useState<boolean>(false);
  const [decodedPastMatrix, setDecodedPastMatrix] = useState<number[][] | null>(null);
  const [decodedPresentMatrix, setDecodedPresentMatrix] = useState<number[][] | null>(null);

  const pastCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const presentCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const pastSrc = useMemo(() => normalizeImgSrc(pastFrameBase64), [pastFrameBase64]);
  const presentSrc = useMemo(() => normalizeImgSrc(presentFrameBase64), [presentFrameBase64]);

  const pastHipsUrl = useMemo(
    () => buildHips2FitsUrl('CDS/P/2MASS/color', ra, dec, fov, 512, 512),
    [ra, dec, fov]
  );
  const presentHipsUrl = useMemo(
    () => buildHips2FitsUrl('CDS/P/allWISE/color', ra, dec, fov, 512, 512),
    [ra, dec, fov]
  );

  // Reset challenge state & survey load flags when target changes
  useEffect(() => {
    setTargetLocked(false);
    setMissHint(false);
    setIntervalMs(motion.blinkMs);
    setIsPlaying(true);
    setPastSurveyLoaded(false);
    setPresentSurveyLoaded(false);
  }, [ra, dec, fov, motion.blinkMs]);

  // Decode live Render base64 PNGs into 32x32 scalar grids if explicit epoch1/epoch2 matrices aren't present
  useEffect(() => {
    let cancelled = false;
    if (epoch1Matrix?.length && epoch2Matrix?.length) {
      setDecodedPastMatrix(null);
      setDecodedPresentMatrix(null);
      return;
    }

    const decode = async () => {
      const [p1, p2] = await Promise.all([
        extract32x32FromDataUrl(pastSrc),
        extract32x32FromDataUrl(presentSrc),
      ]);
      if (!cancelled) {
        setDecodedPastMatrix(p1);
        setDecodedPresentMatrix(p2);
      }
    };
    void decode();
    return () => {
      cancelled = true;
    };
  }, [pastSrc, presentSrc, epoch1Matrix, epoch2Matrix]);

  // Compute resolved 32x32 FITS matrices & apply ZScale + asinh stretch + 256x256 bicubic Moffat PSF rendering
  useEffect(() => {
    const synthetic = buildSyntheticFitsEpochMatrices(
      ra,
      dec,
      motion,
      stacked6Array
    );

    const rawEpoch1 =
      epoch1Matrix && epoch1Matrix.length >= 16
        ? epoch1Matrix
        : decodedPastMatrix && decodedPastMatrix.length >= 16
          ? decodedPastMatrix
          : synthetic.epoch1;

    const rawEpoch2 =
      epoch2Matrix && epoch2Matrix.length >= 16
        ? epoch2Matrix
        : decodedPresentMatrix && decodedPresentMatrix.length >= 16
          ? decodedPresentMatrix
          : datacubeSlice && datacubeSlice.length >= 16
            ? datacubeSlice
            : synthetic.epoch2;

    const stretched1 = zscaleAsinhStretch(rawEpoch1, stacked6Array);
    const stretched2 = zscaleAsinhStretch(rawEpoch2, stacked6Array);

    if (pastCanvasRef.current) {
      renderStretchedFitsToCanvas(pastCanvasRef.current, stretched1.stretched, {
        size: 256,
        transparentBackground: pastSurveyLoaded,
        targetHighlight: {
          normX: motion.pastX,
          normY: motion.pastY,
          intensity: motion.pastGlow * 0.9,
        },
        stacked6Array,
      });
    }

    if (presentCanvasRef.current) {
      renderStretchedFitsToCanvas(
        presentCanvasRef.current,
        stretched2.stretched,
        {
          size: 256,
          transparentBackground: presentSurveyLoaded,
          targetHighlight: {
            normX: motion.presentX,
            normY: motion.presentY,
            intensity: 0.98,
          },
          stacked6Array,
        }
      );
    }
  }, [
    ra,
    dec,
    motion,
    stacked6Array,
    epoch1Matrix,
    epoch2Matrix,
    decodedPastMatrix,
    decodedPresentMatrix,
    datacubeSlice,
    pastSurveyLoaded,
    presentSurveyLoaded,
  ]);

  useEffect(() => {
    if (!isPlaying) return;
    const id = window.setInterval(() => {
      setEpochBlend((prev) => (prev < 50 ? 100 : 0));
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [isPlaying, intervalMs]);

  const handleFrameClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = (e.clientY - rect.top) / rect.height;

    const distToPresent = Math.hypot(nx - motion.presentX, ny - motion.presentY);
    const distToPast = Math.hypot(nx - motion.pastX, ny - motion.pastY);

    if (Math.min(distToPresent, distToPast) <= 0.16) {
      setTargetLocked(true);
      setMissHint(false);
      onTargetLocked?.();
    } else {
      setMissHint(true);
      window.setTimeout(() => setMissHint(false), 2200);
    }
  };

  const isPresent = epochBlend >= 50;
  const activeEpochLabel = isPresent
    ? 'SPHEREx Now (2025+)'
    : 'Past (2000 · 2MASS)';

  const ringLeftPct = (isPresent ? motion.presentX : motion.pastX) * 100;
  const ringTopPct = (isPresent ? motion.presentY : motion.pastY) * 100;
  const presentOpacity = epochBlend / 100;
  const pastOpacity = 1 - presentOpacity;

  return (
    <div className="flex flex-col gap-2.5">
      {/* Interactive Click-to-Lock Challenge Banner */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-500/20 bg-[#050507] px-3 py-2">
        {targetLocked ? (
          <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-300">
            <CheckCircle2 className="h-4 w-4 text-emerald-400" aria-hidden="true" />
            <span>Target Locked! Great eye, explorer!</span>
          </div>
        ) : (
          <div className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-200">
            <Crosshair className="h-4 w-4 text-amber-400" aria-hidden="true" />
            <span>
              {missHint
                ? 'Almost! Click the glowing gold dot hopping across the stars.'
                : 'Click the Moving Planet in the infrared frame below!'}
            </span>
          </div>
        )}

        {targetLocked && (
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/50 bg-emerald-500/15 px-2.5 py-0.5 font-mono text-[11px] font-semibold text-emerald-300">
            <Sparkles className="h-3 w-3" aria-hidden="true" />
            Target Locked!
          </span>
        )}
      </div>

      {/* High-DPI 256x256 ZScale + asinh + Moffat PSF + CDS HiPS2FITS Blink Canvas */}
      <div
        role="button"
        tabIndex={0}
        aria-label="Interactive starfield blink frame. Click the moving planet to lock target."
        onClick={handleFrameClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setTargetLocked(true);
            onTargetLocked?.();
          }
        }}
        className="relative flex aspect-square max-h-[360px] w-full cursor-crosshair items-center justify-center overflow-hidden rounded-xl border border-amber-500/25 bg-[#050507] focus:outline-none focus:ring-2 focus:ring-amber-400/60"
      >
        {/* Epoch 1: CDS 2MASS Survey Backdrop + Bicubic ZScale FITS Canvas */}
        <div
          className="pointer-events-none absolute inset-0 transition-opacity duration-150"
          style={{ opacity: pastOpacity }}
        >
          <img
            src={pastHipsUrl}
            alt="2MASS Past 2000 Sky Survey"
            referrerPolicy="no-referrer"
            onLoad={() => setPastSurveyLoaded(true)}
            onError={() => setPastSurveyLoaded(false)}
            className={`h-full w-full object-cover transition-opacity duration-300 ${
              pastSurveyLoaded ? 'opacity-70' : 'opacity-0'
            }`}
          />
          <canvas
            ref={pastCanvasRef}
            className="absolute inset-0 h-full w-full object-cover"
            style={{
              mixBlendMode: pastSurveyLoaded ? 'screen' : 'normal',
            }}
          />
        </div>

        {/* Epoch 2: CDS allWISE Survey Backdrop + Bicubic ZScale FITS Canvas */}
        <div
          className="pointer-events-none absolute inset-0 transition-opacity duration-150"
          style={{ opacity: presentOpacity }}
        >
          <img
            src={presentHipsUrl}
            alt="allWISE SPHEREx Now Sky Survey"
            referrerPolicy="no-referrer"
            onLoad={() => setPresentSurveyLoaded(true)}
            onError={() => setPresentSurveyLoaded(false)}
            className={`h-full w-full object-cover transition-opacity duration-300 ${
              presentSurveyLoaded ? 'opacity-70' : 'opacity-0'
            }`}
          />
          <canvas
            ref={presentCanvasRef}
            className="absolute inset-0 h-full w-full object-cover"
            style={{
              mixBlendMode: presentSurveyLoaded ? 'screen' : 'normal',
            }}
          />
        </div>

        {/* JWST Warm Titanium Corner Reticles */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute top-3 left-3 h-5 w-5 border-t-2 border-l-2 border-amber-400/80"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute top-3 right-3 h-5 w-5 border-t-2 border-r-2 border-amber-400/80"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute bottom-3 left-3 h-5 w-5 border-b-2 border-l-2 border-amber-400/80"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute right-3 bottom-3 h-5 w-5 border-r-2 border-b-2 border-amber-400/80"
        />

        {/* Glowing Emerald Locked Target Ring */}
        {targetLocked && (
          <div
            aria-hidden="true"
            style={{
              left: `${ringLeftPct}%`,
              top: `${ringTopPct}%`,
            }}
            className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 transition-all duration-150"
          >
            <div className="relative h-14 w-14 animate-pulse rounded-full border-2 border-emerald-400 shadow-[0_0_24px_rgba(16,185,129,0.85)]">
              <div className="absolute -top-5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-emerald-500 px-1.5 py-0.5 font-mono text-[9px] font-bold text-[#050507]">
                LOCKED
              </div>
            </div>
          </div>
        )}

        {/* Active Epoch Badge */}
        <div
          className={`pointer-events-none absolute top-3 left-10 rounded-md border px-2.5 py-1 font-mono text-[11px] font-semibold transition-colors ${
            isPresent
              ? 'border-amber-400/60 bg-[#050507]/85 text-amber-300'
              : 'border-[#FF5500]/60 bg-[#050507]/85 text-orange-300'
          }`}
        >
          {activeEpochLabel}
        </div>

        <div className="pointer-events-none absolute top-3 right-10 rounded-md border border-amber-500/25 bg-[#050507]/85 px-2 py-1 font-mono text-[10px] text-slate-300">
          {stacked6Array ? 'ZScale · 6-Cam Stack' : 'Single Camera'}
        </div>

        {/* Bottom-left stretch readout */}
        <div className="pointer-events-none absolute bottom-3 left-10 rounded-md border border-amber-500/20 bg-[#050507]/85 px-2 py-0.5 font-mono text-[10px] text-amber-200/80">
          asinh(12) · Bicubic Moffat PSF
        </div>
      </div>

      {/* Flipbook Speed & Manual Scrubber */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/20 bg-[#050507] px-3 py-2">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setIsPlaying((p) => !p)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/15 px-2.5 py-1 text-xs font-medium text-amber-300 hover:bg-amber-500/25"
          >
            {isPlaying ? (
              <>
                <Pause className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Pause</span>
              </>
            ) : (
              <>
                <Play className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Play</span>
              </>
            )}
          </button>

          <label className="flex items-center gap-1.5 font-mono text-[11px] tabular-nums text-slate-400">
            <span>{intervalMs}ms</span>
            <input
              type="range"
              min={150}
              max={1000}
              step={50}
              value={intervalMs}
              onChange={(e) => setIntervalMs(Number(e.target.value))}
              aria-label="Blink speed in milliseconds"
              className="w-20 accent-amber-400"
            />
          </label>
        </div>

        <label className="flex min-w-[130px] flex-1 items-center gap-2 font-mono text-[11px] text-slate-400">
          <span>2000</span>
          <input
            type="range"
            min={0}
            max={100}
            value={epochBlend}
            onChange={(e) => {
              setIsPlaying(false);
              setEpochBlend(Number(e.target.value));
            }}
            aria-label="Compare Past 2000 and SPHEREx Now 2025+"
            className="w-full accent-amber-400"
          />
          <span>Now</span>
        </label>
      </div>
    </div>
  );
}
