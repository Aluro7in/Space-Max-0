import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Crosshair, Pause, Play, Sparkles } from 'lucide-react';
import { getTargetFrameMotion } from '../data/presetsAndFallback';

interface BlinkComparatorProps {
  ra: number;
  dec: number;
  pastFrameBase64: string;
  presentFrameBase64: string;
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
  pastFrameBase64,
  presentFrameBase64,
  stacked6Array,
  onTargetLocked,
}: BlinkComparatorProps) {
  const motion = useMemo(() => getTargetFrameMotion(ra, dec), [ra, dec]);

  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [intervalMs, setIntervalMs] = useState<number>(motion.blinkMs);
  const [epochBlend, setEpochBlend] = useState<number>(0); // 0 = Past (2000), 100 = SPHEREx Now (2025+)
  const [targetLocked, setTargetLocked] = useState<boolean>(false);
  const [missHint, setMissHint] = useState<boolean>(false);

  const pastSrc = useMemo(
    () => normalizeImgSrc(pastFrameBase64),
    [pastFrameBase64]
  );
  const presentSrc = useMemo(
    () => normalizeImgSrc(presentFrameBase64),
    [presentFrameBase64]
  );

  // Reset challenge state and sync preset speed when target changes
  useEffect(() => {
    setTargetLocked(false);
    setMissHint(false);
    setIntervalMs(motion.blinkMs);
    setIsPlaying(true);
  }, [ra, dec, motion.blinkMs]);

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
    : 'Past (2000)';

  const ringLeftPct = (isPresent ? motion.presentX : motion.pastX) * 100;
  const ringTopPct = (isPresent ? motion.presentY : motion.pastY) * 100;

  return (
    <div className="flex flex-col gap-2.5">
      {/* Interactive Click-to-Lock Challenge Banner */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-950/80 px-3 py-2">
        {targetLocked ? (
          <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-300">
            <CheckCircle2 className="h-4 w-4 text-emerald-400" aria-hidden="true" />
            <span>Target Locked! Great eye, explorer!</span>
          </div>
        ) : (
          <div className="inline-flex items-center gap-1.5 text-xs font-medium text-cyan-200">
            <Crosshair className="h-4 w-4 text-cyan-400" aria-hidden="true" />
            <span>
              {missHint
                ? 'Almost! Click the bright dot jumping across the stars.'
                : 'Click the Moving Planet in the box below!'}
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

      {/* Square Blink Canvas */}
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
        className="relative flex aspect-square max-h-[360px] w-full cursor-crosshair items-center justify-center overflow-hidden rounded-xl border border-slate-800 bg-black focus:outline-none focus:ring-2 focus:ring-cyan-400/60"
      >
        <img
          src={pastSrc}
          alt="Past (2000) sky cutout"
          referrerPolicy="no-referrer"
          className="pointer-events-none absolute inset-0 h-full w-full object-contain transition-opacity duration-150"
          style={{
            opacity: 1 - epochBlend / 100,
            filter: stacked6Array
              ? 'contrast(1.22) saturate(1.16) brightness(1.06)'
              : 'contrast(1.0)',
          }}
        />
        <img
          src={presentSrc}
          alt="SPHEREx Now (2025+) sky cutout"
          referrerPolicy="no-referrer"
          className="pointer-events-none absolute inset-0 h-full w-full object-contain transition-opacity duration-150"
          style={{
            opacity: epochBlend / 100,
            filter: stacked6Array
              ? 'contrast(1.22) saturate(1.16) brightness(1.06)'
              : 'contrast(1.0)',
          }}
        />

        {/* Optical Corner Reticles */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute top-3 left-3 h-5 w-5 border-t-2 border-l-2 border-cyan-400/80"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute top-3 right-3 h-5 w-5 border-t-2 border-r-2 border-cyan-400/80"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute bottom-3 left-3 h-5 w-5 border-b-2 border-l-2 border-cyan-400/80"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute right-3 bottom-3 h-5 w-5 border-r-2 border-b-2 border-cyan-400/80"
        />

        {/* Glowing Green Locked Target Ring */}
        {targetLocked && (
          <div
            aria-hidden="true"
            style={{
              left: `${ringLeftPct}%`,
              top: `${ringTopPct}%`,
            }}
            className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 transition-all duration-150"
          >
            <div className="relative h-14 w-14 animate-pulse rounded-full border-2 border-emerald-400 shadow-[0_0_24px_rgba(52,211,153,0.85)]">
              <div className="absolute -top-5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-emerald-500 px-1.5 py-0.5 font-mono text-[9px] font-bold text-slate-950">
                LOCKED
              </div>
            </div>
          </div>
        )}

        {/* Active Epoch Badge */}
        <div
          className={`pointer-events-none absolute top-3 left-10 rounded-md border px-2.5 py-1 font-mono text-[11px] font-semibold transition-colors ${
            isPresent
              ? 'border-cyan-400/60 bg-slate-950/85 text-cyan-300'
              : 'border-amber-400/60 bg-slate-950/85 text-amber-300'
          }`}
        >
          {activeEpochLabel}
        </div>

        <div className="pointer-events-none absolute top-3 right-10 rounded-md border border-slate-700 bg-slate-950/85 px-2 py-1 font-mono text-[10px] text-slate-300">
          {stacked6Array ? '6 Cameras Stacked' : 'Single Camera'}
        </div>
      </div>

      {/* Flipbook Speed & Manual Scrubber */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/75 px-3 py-2">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setIsPlaying((p) => !p)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-500/40 bg-cyan-500/15 px-2.5 py-1 text-xs font-medium text-cyan-300 hover:bg-cyan-500/25"
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

          <label className="flex items-center gap-1.5 text-[11px] font-mono tabular-nums text-slate-400">
            <span>{intervalMs}ms</span>
            <input
              type="range"
              min={150}
              max={1000}
              step={50}
              value={intervalMs}
              onChange={(e) => setIntervalMs(Number(e.target.value))}
              aria-label="Blink speed in milliseconds"
              className="w-20 accent-cyan-400"
            />
          </label>
        </div>

        <label className="flex flex-1 min-w-[130px] items-center gap-2 text-[11px] font-mono text-slate-400">
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
            className="w-full accent-cyan-400"
          />
          <span>Now</span>
        </label>
      </div>
    </div>
  );
}
