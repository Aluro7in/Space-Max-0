import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Crosshair,
  MoveUpRight,
  Pause,
  Play,
  Route,
} from 'lucide-react';
import type { AstrometryTelemetry, ProperMotion } from '../types/telemetry';
import { getTargetFrameMotion } from '../data/presetsAndFallback';
import {
  buildHips2FitsUrl,
  buildInterpolatedEpochGrid,
  buildSyntheticFitsEpochMatrices,
  detectTransientMotionVector,
  extract32x32FromDataUrl,
  renderStretchedFitsToCanvas,
  zscaleAsinhStretch,
} from '../utils/astroStretch';
import { KinematicVectorOverlay } from './KinematicVectorOverlay';

interface BlinkComparatorProps {
  ra: number;
  dec: number;
  fov: number;
  pastFrameBase64: string;
  presentFrameBase64: string;
  epoch1Matrix?: number[][];
  epoch2Matrix?: number[][];
  datacubeSlice?: number[][];
  properMotion?: ProperMotion;
  astrometry?: AstrometryTelemetry;
  stacked6Array: boolean;
  onTargetLocked?: () => void;
}

interface EpochFrameSpec {
  index: number;
  t: number;
  year: string;
  shortTag: string;
  hudLabel: string;
}

const EPOCH_SEQUENCE: EpochFrameSpec[] = [
  {
    index: 0,
    t: 0.0,
    year: '2000.4',
    shortTag: '2MASS',
    hudLabel: 'Epoch 1: 2000.4 (2MASS Near-IR)',
  },
  {
    index: 1,
    t: 0.22,
    year: '2010.5',
    shortTag: 'WISE',
    hudLabel: 'Epoch 2: 2010.5 (WISE All-Sky)',
  },
  {
    index: 2,
    t: 0.45,
    year: '2025.2',
    shortTag: 'SPHEREx P1',
    hudLabel: 'Epoch 3: 2025.2 (SPHEREx Pass 1)',
  },
  {
    index: 3,
    t: 0.64,
    year: '2025.8',
    shortTag: 'SPHEREx P2',
    hudLabel: 'Epoch 4: 2025.8 (SPHEREx Pass 2)',
  },
  {
    index: 4,
    t: 0.82,
    year: '2026.3',
    shortTag: 'SPHEREx P3',
    hudLabel: 'Epoch 5: 2026.3 (SPHEREx Pass 3)',
  },
  {
    index: 5,
    t: 1.0,
    year: '2026.8',
    shortTag: 'SPHEREx Now',
    hudLabel: 'Epoch 6: 2026.8 (SPHEREx Pass 4 - Now)',
  },
];

const SPEED_OPTIONS: Array<{ label: string; mult: number }> = [
  { label: '0.5×', mult: 1.8 },
  { label: '1×', mult: 1.0 },
  { label: '2×', mult: 0.5 },
];

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
  properMotion,
  astrometry,
  stacked6Array,
  onTargetLocked,
}: BlinkComparatorProps) {
  const motion = useMemo(() => getTargetFrameMotion(ra, dec), [ra, dec]);

  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [speedMult, setSpeedMult] = useState<number>(1.0);
  const [activeFrameIdx, setActiveFrameIdx] = useState<number>(0);
  const [hoveredThumbIdx, setHoveredThumbIdx] = useState<number | null>(null);
  const [targetLocked, setTargetLocked] = useState<boolean>(false);
  const [missHint, setMissHint] = useState<boolean>(false);
  const [showVectorOverlay, setShowVectorOverlay] = useState<boolean>(true);
  const [showMotionTrail, setShowMotionTrail] = useState<boolean>(true);

  const [pastSurveyLoaded, setPastSurveyLoaded] = useState<boolean>(false);
  const [presentSurveyLoaded, setPresentSurveyLoaded] = useState<boolean>(false);
  const [decodedPastMatrix, setDecodedPastMatrix] = useState<number[][] | null>(null);
  const [decodedPresentMatrix, setDecodedPresentMatrix] = useState<number[][] | null>(null);

  const mainCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const thumbCanvasRefs = useRef<Array<HTMLCanvasElement | null>>([]);

  const pastSrc = useMemo(() => normalizeImgSrc(pastFrameBase64), [pastFrameBase64]);
  const presentSrc = useMemo(() => normalizeImgSrc(presentFrameBase64), [presentFrameBase64]);

  const pastHipsUrl = useMemo(
    () => buildHips2FitsUrl('CDS/P/2MASS/color', ra, dec, fov, 640, 380),
    [ra, dec, fov]
  );
  const presentHipsUrl = useMemo(
    () => buildHips2FitsUrl('CDS/P/allWISE/color', ra, dec, fov, 640, 380),
    [ra, dec, fov]
  );

  useEffect(() => {
    setTargetLocked(false);
    setMissHint(false);
    setActiveFrameIdx(0);
    setIsPlaying(true);
    setPastSurveyLoaded(false);
    setPresentSurveyLoaded(false);
  }, [ra, dec, fov]);

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

  const { stretched1, stretched2, transientAnalysis } = useMemo(() => {
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

    const s1 = zscaleAsinhStretch(rawEpoch1, stacked6Array);
    const s2 = zscaleAsinhStretch(rawEpoch2, stacked6Array);
    const catalogPmMasYr = properMotion
      ? Math.hypot(properMotion.pm_ra_mas_yr, properMotion.pm_dec_mas_yr)
      : undefined;
    const analysis = detectTransientMotionVector(s1.stretched, s2.stretched, {
      catalogPmMasYr,
    });

    return {
      stretched1: s1,
      stretched2: s2,
      transientAnalysis: analysis,
    };
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
    properMotion,
  ]);

  const activeSpec = EPOCH_SEQUENCE[activeFrameIdx] ?? EPOCH_SEQUENCE[0];
  const tProgress = activeSpec.t;

  const curTargetX =
    motion.pastX + (motion.presentX - motion.pastX) * tProgress;
  const curTargetY =
    motion.pastY + (motion.presentY - motion.pastY) * tProgress;

  // Render active interpolated frame onto the 512x320 main telescope canvas
  useEffect(() => {
    const canvas = mainCanvasRef.current;
    if (!canvas) return;
    const frameGrid = buildInterpolatedEpochGrid(
      stretched1.stretched,
      stretched2.stretched,
      motion,
      tProgress
    );
    const hasBackdrop =
      (1 - tProgress) * (pastSurveyLoaded ? 1 : 0) +
        tProgress * (presentSurveyLoaded ? 1 : 0) >
      0.35;

    renderStretchedFitsToCanvas(canvas, frameGrid, {
      width: 512,
      height: 320,
      seed: ra * 13.7 + dec * 7.3,
      fovDeg: fov,
      showCompassAndScale: true,
      transparentBackground: hasBackdrop,
      targetHighlight: {
        normX: curTargetX,
        normY: curTargetY,
        intensity: motion.pastGlow + (0.98 - motion.pastGlow) * tProgress,
      },
      stacked6Array,
    });
  }, [
    ra,
    dec,
    fov,
    stretched1,
    stretched2,
    motion,
    tProgress,
    curTargetX,
    curTargetY,
    stacked6Array,
    pastSurveyLoaded,
    presentSurveyLoaded,
  ]);

  // Render the 6 filmstrip mini-canvases for hover preview
  useEffect(() => {
    const seedVal = ra * 13.7 + dec * 7.3;
    EPOCH_SEQUENCE.forEach((spec, idx) => {
      const thumb = thumbCanvasRefs.current[idx];
      if (!thumb) return;
      const grid = buildInterpolatedEpochGrid(
        stretched1.stretched,
        stretched2.stretched,
        motion,
        spec.t
      );
      const tx = motion.pastX + (motion.presentX - motion.pastX) * spec.t;
      const ty = motion.pastY + (motion.presentY - motion.pastY) * spec.t;
      renderStretchedFitsToCanvas(thumb, grid, {
        width: 88,
        height: 48,
        seed: seedVal,
        showCompassAndScale: false,
        transparentBackground: false,
        targetHighlight: {
          normX: tx,
          normY: ty,
          intensity: motion.pastGlow + (0.98 - motion.pastGlow) * spec.t,
        },
        stacked6Array,
      });
    });
  }, [ra, dec, stretched1, stretched2, motion, stacked6Array]);

  // 6-epoch smooth time-lapse auto-advance
  useEffect(() => {
    if (!isPlaying) return;
    const stepMs = Math.max(220, Math.round(motion.blinkMs * 1.15 * speedMult));
    const id = window.setInterval(() => {
      setActiveFrameIdx((prev) => (prev + 1) % EPOCH_SEQUENCE.length);
    }, stepMs);
    return () => window.clearInterval(id);
  }, [isPlaying, motion.blinkMs, speedMult]);

  const handleFrameClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = (e.clientY - rect.top) / rect.height;

    const distToCur = Math.hypot(nx - curTargetX, ny - curTargetY);
    const distToPast = Math.hypot(nx - motion.pastX, ny - motion.pastY);
    const distToPresent = Math.hypot(nx - motion.presentX, ny - motion.presentY);

    if (Math.min(distToCur, distToPast, distToPresent) <= 0.16) {
      setTargetLocked(true);
      setMissHint(false);
      onTargetLocked?.();
    } else {
      setMissHint(true);
      window.setTimeout(() => setMissHint(false), 2200);
    }
  };

  const handleStepFrame = (delta: number) => {
    setIsPlaying(false);
    setActiveFrameIdx(
      (prev) => (prev + delta + EPOCH_SEQUENCE.length) % EPOCH_SEQUENCE.length
    );
  };

  const presentOpacity = tProgress;
  const pastOpacity = 1 - tProgress;

  return (
    <div className="flex flex-col gap-1.5">
      {/* Main Unobstructed 6-Epoch Time-Lapse Telescope Viewport */}
      <div className="relative h-[265px] w-full overflow-hidden rounded-xl border border-white/[0.08] bg-[#04060C] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)] xl:h-[290px]">
        <div
          role="button"
          tabIndex={0}
          aria-label="Interactive 6-epoch sky time-lapse frame. Click the moving planet to lock target."
          onClick={handleFrameClick}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setTargetLocked(true);
              onTargetLocked?.();
            }
          }}
          className="relative h-full w-full cursor-crosshair overflow-hidden focus:outline-none focus:ring-2 focus:ring-cyan-400/60"
        >
          {/* Cross-faded Real CDS 2MASS -> allWISE Survey Backdrops */}
          <img
            src={pastHipsUrl}
            alt="2MASS Past 2000 Sky Survey"
            referrerPolicy="no-referrer"
            onLoad={() => setPastSurveyLoaded(true)}
            onError={() => setPastSurveyLoaded(false)}
            style={{ opacity: pastSurveyLoaded ? pastOpacity * 0.65 : 0 }}
            className="pointer-events-none absolute inset-0 h-full w-full object-cover transition-opacity duration-200"
          />
          <img
            src={presentHipsUrl}
            alt="allWISE SPHEREx Now Sky Survey"
            referrerPolicy="no-referrer"
            onLoad={() => setPresentSurveyLoaded(true)}
            onError={() => setPresentSurveyLoaded(false)}
            style={{ opacity: presentSurveyLoaded ? presentOpacity * 0.65 : 0 }}
            className="pointer-events-none absolute inset-0 h-full w-full object-cover transition-opacity duration-200"
          />

          {/* Crisp Upsampled ZScale + asinh(14) + 6-Point Spike Telescope Frame */}
          <canvas
            ref={mainCanvasRef}
            className="pointer-events-none relative z-[1] h-full w-full object-cover"
            style={{
              mixBlendMode:
                pastSurveyLoaded || presentSurveyLoaded ? 'screen' : 'normal',
            }}
          />

          {/* Motion Trail Breadcrumb Rings (2000 -> 2010 -> 2025 -> 2026) */}
          {showMotionTrail &&
            EPOCH_SEQUENCE.slice(0, activeFrameIdx + 1).map((crumb, idx) => {
              const cxPct =
                (motion.pastX + (motion.presentX - motion.pastX) * crumb.t) * 100;
              const cyPct =
                (motion.pastY + (motion.presentY - motion.pastY) * crumb.t) * 100;
              const isCurrent = idx === activeFrameIdx;
              return (
                <div
                  key={crumb.year}
                  aria-hidden="true"
                  style={{ left: `${cxPct}%`, top: `${cyPct}%` }}
                  className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-1/2"
                >
                  {isCurrent ? (
                    <div className="relative flex h-8 w-8 items-center justify-center rounded-full border border-cyan-300/90 shadow-[0_0_14px_rgba(0,240,255,0.75)]">
                      <span className="absolute inset-0 animate-ping rounded-full border border-amber-400/45" />
                    </div>
                  ) : (
                    <span className="block h-2 w-2 rounded-full border border-amber-300/80 bg-rose-500/40 shadow-[0_0_6px_rgba(251,191,36,0.5)]" />
                  )}
                </div>
              );
            })}

          {/* Interactive Kinematic Proper Motion Vector Overlay (Tooltip only on Hover/Click) */}
          <KinematicVectorOverlay
            epoch1Norm={{
              x: transientAnalysis.epoch1Footprint.normX,
              y: transientAnalysis.epoch1Footprint.normY,
            }}
            epoch2Norm={{
              x: transientAnalysis.epoch2Detection.normX,
              y: transientAnalysis.epoch2Detection.normY,
            }}
            properMotionMasYr={transientAnalysis.vectorDistMasYr}
            displacementArcsec={
              astrometry?.displacement_arcsec ?? transientAnalysis.vectorDistArcsec
            }
            displacementPx={transientAnalysis.vectorDistPx}
            distanceAu={astrometry?.estimated_distance_au}
            distancePc={astrometry?.estimated_distance_pc}
            visible={showVectorOverlay}
          />

          {/* Glowing Emerald Locked Target Ring */}
          {targetLocked && (
            <div
              aria-hidden="true"
              style={{
                left: `${curTargetX * 100}%`,
                top: `${curTargetY * 100}%`,
              }}
              className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-1/2 transition-all duration-150"
            >
              <div className="relative h-11 w-11 rounded-full border-2 border-emerald-400 shadow-[0_0_24px_rgba(16,185,129,0.85)]">
                <div className="absolute -top-5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-emerald-400 px-1.5 py-0.5 font-mono text-[8.5px] font-bold text-[#04060C]">
                  LOCKED
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Clean Minimal Top-Left & Top-Right Pills — 90% of Starfield Unobstructed */}
        <div
          title={activeSpec.hudLabel}
          className="pointer-events-none absolute top-2.5 left-2.5 z-20 inline-flex items-center gap-1.5 rounded-full border border-white/[0.1] bg-slate-950/65 px-2.5 py-1 font-mono text-[10px] font-medium text-cyan-200 backdrop-blur-md"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 shadow-[0_0_6px_#00f0ff]" />
          <span>
            Frame {activeFrameIdx + 1}/6 • {activeSpec.year} {activeSpec.shortTag}
          </span>
        </div>

        <div
          role="status"
          title={`Epoch 1 (−) → Epoch 2 (+) displacement ${transientAnalysis.vectorDistArcsec.toFixed(2)} arcsec (${transientAnalysis.vectorDistPx.toFixed(1)} px)`}
          className={`pointer-events-none absolute top-2.5 right-2.5 z-20 inline-flex items-center gap-1 rounded-full border bg-slate-950/65 px-2.5 py-1 font-mono text-[10px] font-semibold tabular-nums backdrop-blur-md ${
            transientAnalysis.isHighProperMotion
              ? 'border-rose-500/60 text-rose-200 shadow-[0_0_14px_rgba(244,63,94,0.28)]'
              : 'border-white/[0.1] text-amber-300'
          }`}
        >
          {transientAnalysis.isHighProperMotion && (
            <AlertTriangle
              className="h-3 w-3 shrink-0 text-rose-400"
              aria-hidden="true"
            />
          )}
          <span>{transientAnalysis.vectorDistMasYr.toFixed(1)} mas/yr</span>
        </div>
      </div>

      {/* Unified Compact Cinema Scrubber Bar (Merges Transport + 6-Epoch Timeline Pills + Trail/Vector + Target Lock Status) */}
      <div className="rounded-xl border border-white/[0.07] bg-[#060A14]/90 px-2.5 py-2 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)]">
        {/* Row A: Transport + 6-Epoch Scrubber Pills + Speed & Overlays */}
        <div className="flex flex-wrap items-center justify-between gap-1.5">
          {/* Play/Prev/Next Transport */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => handleStepFrame(-1)}
              aria-label="Previous epoch frame"
              title="Previous epoch frame"
              className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-white/[0.08] bg-[#0B101E] text-slate-300 transition-colors hover:border-cyan-400/50 hover:text-cyan-200"
            >
              <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
            </button>

            <button
              type="button"
              onClick={() => setIsPlaying((p) => !p)}
              className="inline-flex h-6 items-center gap-1 rounded-md border border-cyan-400/45 bg-cyan-500/20 px-2 text-[10px] font-semibold text-cyan-100 transition-colors hover:bg-cyan-500/30"
            >
              {isPlaying ? (
                <>
                  <Pause className="h-2.5 w-2.5" aria-hidden="true" />
                  <span>Pause</span>
                </>
              ) : (
                <>
                  <Play className="h-2.5 w-2.5 fill-current" aria-hidden="true" />
                  <span>Play</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => handleStepFrame(1)}
              aria-label="Next epoch frame"
              title="Next epoch frame"
              className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-white/[0.08] bg-[#0B101E] text-slate-300 transition-colors hover:border-cyan-400/50 hover:text-cyan-200"
            >
              <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>

          {/* 6-Epoch Scrubber Pills with Mini-Canvas Hover Popover */}
          <div
            role="group"
            aria-label="6-Epoch Time-Lapse Timeline"
            className="flex flex-1 items-center justify-center gap-1"
          >
            {EPOCH_SEQUENCE.map((spec, idx) => {
              const active = idx === activeFrameIdx;
              const isHovered = hoveredThumbIdx === idx;
              return (
                <div
                  key={spec.year}
                  className="relative flex-1"
                  onMouseEnter={() => setHoveredThumbIdx(idx)}
                  onMouseLeave={() => setHoveredThumbIdx(null)}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setIsPlaying(false);
                      setActiveFrameIdx(idx);
                    }}
                    title={spec.hudLabel}
                    className={`flex w-full flex-col items-center rounded-md border px-1 py-0.5 font-mono text-[9px] tabular-nums transition-all ${
                      active
                        ? 'border-cyan-400/75 bg-cyan-500/20 font-bold text-cyan-100 shadow-[0_0_10px_rgba(0,240,255,0.2)]'
                        : 'border-white/[0.06] bg-[#0B101E]/75 text-slate-400 hover:border-slate-600 hover:text-slate-200'
                    }`}
                  >
                    <span>{spec.year}</span>
                    <span
                      className={`mt-0.5 h-0.5 w-full rounded-full ${
                        active
                          ? 'bg-gradient-to-r from-cyan-400 to-amber-300'
                          : 'bg-slate-800'
                      }`}
                    />
                  </button>

                  {/* Mini-frame canvas preview on hover (kept mounted in DOM for instant render) */}
                  <div
                    className={`pointer-events-none absolute bottom-7 left-1/2 z-30 -translate-x-1/2 overflow-hidden rounded-lg border border-cyan-400/50 bg-slate-950/95 p-1 shadow-xl transition-opacity duration-150 ${
                      isHovered ? 'opacity-100' : 'pointer-events-none invisible opacity-0'
                    }`}
                  >
                    <canvas
                      ref={(el) => {
                        thumbCanvasRefs.current[idx] = el;
                      }}
                      className="h-9 w-16 rounded object-cover"
                    />
                    <div className="mt-0.5 whitespace-nowrap text-center font-mono text-[8px] text-cyan-200">
                      {spec.shortTag}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Speed & Trail/Vector Toggles */}
          <div className="flex items-center gap-1">
            <div
              role="group"
              aria-label="Time-lapse playback speed"
              className="flex items-center rounded-md border border-white/[0.08] bg-[#0B101E] p-0.5"
            >
              {SPEED_OPTIONS.map((opt) => {
                const active = Math.abs(speedMult - opt.mult) < 0.05;
                return (
                  <button
                    key={opt.label}
                    type="button"
                    onClick={() => setSpeedMult(opt.mult)}
                    className={`rounded px-1.5 py-0.5 font-mono text-[9px] font-medium transition-colors ${
                      active
                        ? 'bg-cyan-500/25 text-cyan-200'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              aria-pressed={showMotionTrail}
              onClick={() => setShowMotionTrail((prev) => !prev)}
              title="Toggle Epoch 1 to Epoch 6 motion breadcrumb trail"
              className={`inline-flex h-6 items-center gap-1 rounded-md border px-2 text-[10px] font-medium transition-colors ${
                showMotionTrail
                  ? 'border-cyan-400/50 bg-cyan-500/15 text-cyan-200'
                  : 'border-white/[0.08] bg-[#0B101E] text-slate-400 hover:text-slate-200'
              }`}
            >
              <Route className="h-3 w-3 text-cyan-400" aria-hidden="true" />
              <span className="hidden sm:inline">Trail</span>
            </button>

            <button
              type="button"
              aria-pressed={showVectorOverlay}
              onClick={() => setShowVectorOverlay((prev) => !prev)}
              title="Toggle golden kinematic proper motion vector overlay"
              className={`inline-flex h-6 items-center gap-1 rounded-md border px-2 text-[10px] font-medium transition-colors ${
                showVectorOverlay
                  ? 'border-amber-400/50 bg-amber-500/15 text-amber-200'
                  : 'border-white/[0.08] bg-[#0B101E] text-slate-400 hover:text-slate-200'
              }`}
            >
              <MoveUpRight className="h-3 w-3 text-amber-400" aria-hidden="true" />
              <span className="hidden sm:inline">Vector</span>
            </button>
          </div>
        </div>

        {/* Row B: Sleek 1-Line Target Lock Prompt & Vector Summary */}
        <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] pt-1.5 text-[10px]">
          {targetLocked ? (
            <span className="inline-flex items-center gap-1 font-medium text-emerald-300">
              <CheckCircle2 className="h-3 w-3 text-emerald-400" aria-hidden="true" />
              <span>Target Locked! Moving candidate confirmed across 6 epochs.</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-slate-300">
              <Crosshair className="h-3 w-3 text-cyan-400" aria-hidden="true" />
              <span>
                {missHint
                  ? 'Almost! Click the glowing star inside the pulsing cyan ring.'
                  : 'Click the moving star in the video to lock target'}
              </span>
            </span>
          )}

          <span className="font-mono text-[9.5px] tabular-nums text-slate-400">
            μ <strong className="text-amber-300">+{transientAnalysis.vectorDistMasYr.toFixed(1)} mas/yr</strong> · Δ
            <strong className="text-cyan-300">
              {(astrometry?.displacement_arcsec ?? transientAnalysis.vectorDistArcsec).toFixed(2)}&quot;
            </strong>{' '}
            · Span {transientAnalysis.vectorDistPx.toFixed(1)} px
          </span>
        </div>
      </div>
    </div>
  );
}
