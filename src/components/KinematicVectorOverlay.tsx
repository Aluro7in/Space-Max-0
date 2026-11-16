import React, { useId, useState } from 'react';
import { Info, MoveUpRight } from 'lucide-react';

interface KinematicVectorOverlayProps {
  /** Epoch 1 negative footprint center in normalized [0..1] canvas coordinates */
  epoch1Norm: { x: number; y: number };
  /** Epoch 2 positive detection center in normalized [0..1] canvas coordinates */
  epoch2Norm: { x: number; y: number };
  /** Proper motion rate in mas/yr (signed or magnitude) */
  properMotionMasYr: number;
  /** Angular displacement in arcseconds */
  displacementArcsec: number;
  /** Pixel vector distance for additional telemetry context */
  displacementPx?: number;
  /** Estimated kinematic heliocentric distance in AU and parsecs */
  distanceAu?: number;
  distancePc?: number;
  /** Whether the overlay is visible */
  visible?: boolean;
  /** Optional external callback when hover state changes */
  onHoverChange?: (hovering: boolean) => void;
}

export function KinematicVectorOverlay({
  epoch1Norm,
  epoch2Norm,
  properMotionMasYr,
  displacementArcsec,
  displacementPx,
  distanceAu,
  distancePc,
  visible = true,
  onHoverChange,
}: KinematicVectorOverlayProps) {
  const [isHovering, setIsHovering] = useState<boolean>(false);
  const [pinnedInfo, setPinnedInfo] = useState<boolean>(false);
  const uid = useId().replace(/:/g, '');

  if (!visible) return null;

  const e1X = Math.max(4, Math.min(96, epoch1Norm.x * 100));
  const e1Y = Math.max(6, Math.min(94, epoch1Norm.y * 100));
  const e2X = Math.max(4, Math.min(96, epoch2Norm.x * 100));
  const e2Y = Math.max(6, Math.min(94, epoch2Norm.y * 100));

  const signedPmText =
    properMotionMasYr >= 0
      ? `+${properMotionMasYr.toFixed(1)}`
      : properMotionMasYr.toFixed(1);

  const setHovered = (next: boolean) => {
    setIsHovering(next);
    onHoverChange?.(next);
  };

  const showDetailedPopover = isHovering || pinnedInfo;

  const arrowId = `kinematic-arrow-${uid}`;
  const crimsonGlowId = `crimson-glow-${uid}`;
  const cyanGoldGlowId = `cyangold-glow-${uid}`;
  const lineGradId = `kinematic-line-grad-${uid}`;

  return (
    <>
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-label={`Proper motion vector connecting Epoch 1 negative anomaly to Epoch 2 positive detection. Proper Motion ${signedPmText} mas/yr, arcsecond distance ${displacementArcsec.toFixed(2)} arcsec.`}
        className="pointer-events-none absolute inset-0 z-10 h-full w-full"
      >
        <defs>
          <linearGradient id={lineGradId} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#FBBF24" />
            <stop offset="100%" stopColor="#00F0FF" />
          </linearGradient>

          <marker
            id={arrowId}
            markerWidth="6"
            markerHeight="6"
            refX="4.4"
            refY="3"
            orient="auto"
          >
            <path d="M0,0.7 L5.2,3 L0,5.3 Z" fill="#00F0FF" />
          </marker>

          <radialGradient id={crimsonGlowId} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#FB7185" stopOpacity="1" />
            <stop offset="45%" stopColor="#F43F5E" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#F43F5E" stopOpacity="0" />
          </radialGradient>

          <radialGradient id={cyanGoldGlowId} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#00F0FF" stopOpacity="1" />
            <stop offset="50%" stopColor="#FBBF24" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#FBBF24" stopOpacity="0" />
          </radialGradient>
        </defs>

        {showDetailedPopover && (
          <line
            x1={e1X}
            y1={e1Y}
            x2={e2X}
            y2={e2Y}
            vectorEffect="non-scaling-stroke"
            stroke="#00F0FF"
            strokeWidth={4.5}
            strokeOpacity={0.25}
            strokeLinecap="round"
          />
        )}

        <line
          x1={e1X}
          y1={e1Y}
          x2={e2X}
          y2={e2Y}
          vectorEffect="non-scaling-stroke"
          stroke={`url(#${lineGradId})`}
          strokeWidth={showDetailedPopover ? 2.2 : 1.65}
          strokeDasharray="4 4"
          strokeOpacity={showDetailedPopover ? 1 : 0.9}
          markerEnd={`url(#${arrowId})`}
        />

        <circle
          cx={e1X}
          cy={e1Y}
          r={showDetailedPopover ? 3.8 : 2.8}
          fill={`url(#${crimsonGlowId})`}
        />
        <circle
          cx={e2X}
          cy={e2Y}
          r={showDetailedPopover ? 4.2 : 3.2}
          fill={`url(#${cyanGoldGlowId})`}
        />

        <g
          className="pointer-events-auto cursor-help"
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          onClick={(e) => {
            e.stopPropagation();
            setPinnedInfo((prev) => !prev);
          }}
        >
          <title>{`Proper Motion (μ): ${signedPmText} mas/yr · Displacement: ${displacementArcsec.toFixed(2)} arcsec`}</title>
          <line
            x1={e1X}
            y1={e1Y}
            x2={e2X}
            y2={e2Y}
            stroke="transparent"
            strokeWidth="10"
            strokeLinecap="round"
          />
          <circle cx={e1X} cy={e1Y} r="6" fill="transparent" />
          <circle cx={e2X} cy={e2Y} r="6" fill="transparent" />
        </g>
      </svg>

      {/* Epoch 1 Negative Anomaly Dot */}
      <div
        aria-hidden="true"
        style={{ left: `${e1X}%`, top: `${e1Y}%` }}
        className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-1/2"
      >
        <div
          className={`flex items-center justify-center rounded-full border border-dashed border-rose-400/90 bg-rose-500/20 transition-all ${
            showDetailedPopover
              ? 'h-5 w-5 shadow-[0_0_14px_rgba(244,63,94,0.85)]'
              : 'h-3.5 w-3.5 shadow-[0_0_8px_rgba(244,63,94,0.6)]'
          }`}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
        </div>
        {showDetailedPopover && (
          <span className="absolute -top-4 left-1/2 -translate-x-1/2 whitespace-nowrap rounded border border-rose-500/40 bg-slate-950/85 px-1 py-0.5 font-mono text-[8px] font-semibold text-rose-300">
            Epoch 1 (−)
          </span>
        )}
      </div>

      {/* Epoch 2 Positive Detection Dot */}
      <div
        aria-hidden="true"
        style={{ left: `${e2X}%`, top: `${e2Y}%` }}
        className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-1/2"
      >
        <div
          className={`flex items-center justify-center rounded-full border border-cyan-300 bg-cyan-400/15 transition-all ${
            showDetailedPopover
              ? 'h-5.5 w-5.5 shadow-[0_0_16px_rgba(0,240,255,0.85)]'
              : 'h-4 w-4 shadow-[0_0_10px_rgba(0,240,255,0.55)]'
          }`}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-cyan-300" />
        </div>
        {showDetailedPopover && (
          <span className="absolute -bottom-4 left-1/2 -translate-x-1/2 whitespace-nowrap rounded border border-cyan-400/45 bg-slate-950/85 px-1 py-0.5 font-mono text-[8px] font-semibold text-cyan-200">
            Epoch 2 (+)
          </span>
        )}
      </div>

      {/* Subtle Corner Vector Info Trigger Pill (Never covers center of starfield) */}
      <button
        type="button"
        aria-label="Inspect Proper Motion Vector Details"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={(e) => {
          e.stopPropagation();
          setPinnedInfo((prev) => !prev);
        }}
        className="pointer-events-auto absolute right-2.5 bottom-2.5 z-20 inline-flex items-center gap-1 rounded-full border border-white/[0.1] bg-slate-950/65 px-2 py-0.5 font-mono text-[9.5px] text-amber-300 backdrop-blur-md transition-colors hover:border-amber-400/50 hover:text-amber-200"
      >
        <Info className="h-2.5 w-2.5 text-cyan-400" aria-hidden="true" />
        <span>Δ{displacementArcsec.toFixed(2)}&quot;</span>
      </button>

      {/* Detailed 4-Line Telemetry Card — Appears ONLY on Vector Hover or Info Click in Bottom-Right Corner */}
      {showDetailedPopover && (
        <div
          role="tooltip"
          className="pointer-events-none absolute right-2.5 bottom-9 z-30 rounded-xl border border-cyan-400/40 bg-slate-950/90 px-3 py-2 font-mono text-[10px] shadow-[0_8px_28px_rgba(0,0,0,0.65)] backdrop-blur-xl"
        >
          <div className="flex items-center gap-1.5 whitespace-nowrap font-semibold text-amber-300">
            <MoveUpRight className="h-3 w-3 text-cyan-400" aria-hidden="true" />
            <span>Proper Motion (μ):</span>
            <span className="tabular-nums text-slate-50">
              {signedPmText} mas/yr
            </span>
          </div>
          <div className="mt-1 flex items-center justify-between gap-2 whitespace-nowrap text-[10px] tabular-nums text-slate-200">
            <span className="text-slate-400">Displacement:</span>
            <span className="font-semibold text-cyan-300">
              {displacementArcsec.toFixed(2)} arcsec
            </span>
          </div>
          {typeof displacementPx === 'number' && (
            <div className="mt-0.5 whitespace-nowrap text-[9px] tabular-nums text-slate-400">
              Vector span · Δ{displacementPx.toFixed(1)} px
            </div>
          )}
          {typeof distanceAu === 'number' && typeof distancePc === 'number' && (
            <div className="mt-0.5 whitespace-nowrap text-[9px] tabular-nums text-emerald-300">
              Distance:{' '}
              {distanceAu >= 10000
                ? `${(distanceAu / 1000).toFixed(1)}k`
                : distanceAu.toFixed(0)}{' '}
              AU / {distancePc.toFixed(1)} pc
            </div>
          )}
        </div>
      )}
    </>
  );
}
