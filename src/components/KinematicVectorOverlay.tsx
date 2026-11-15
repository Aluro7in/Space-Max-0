import React, { useId, useState } from 'react';
import { MoveUpRight } from 'lucide-react';

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
  visible = true,
  onHoverChange,
}: KinematicVectorOverlayProps) {
  const [isHovering, setIsHovering] = useState<boolean>(false);
  const uid = useId().replace(/:/g, '');

  if (!visible) return null;

  const e1X = Math.max(4, Math.min(96, epoch1Norm.x * 100));
  const e1Y = Math.max(4, Math.min(96, epoch1Norm.y * 100));
  const e2X = Math.max(4, Math.min(96, epoch2Norm.x * 100));
  const e2Y = Math.max(4, Math.min(96, epoch2Norm.y * 100));

  const midX = Math.min(74, Math.max(26, (e1X + e2X) / 2));
  const rawMidY = (e1Y + e2Y) / 2;
  const tooltipTopPct =
    rawMidY > 56 ? Math.max(20, rawMidY - 15) : Math.min(80, rawMidY + 14);

  const signedPmText =
    properMotionMasYr >= 0
      ? `+${properMotionMasYr.toFixed(1)}`
      : properMotionMasYr.toFixed(1);

  const setHovered = (next: boolean) => {
    setIsHovering(next);
    onHoverChange?.(next);
  };

  const arrowId = `kinematic-arrow-${uid}`;
  const crimsonGlowId = `crimson-glow-${uid}`;
  const cyanGoldGlowId = `cyangold-glow-${uid}`;

  return (
    <>
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-label={`Proper motion vector connecting Epoch 1 negative anomaly to Epoch 2 positive detection. Proper Motion ${signedPmText} mas/yr, arcsecond distance ${displacementArcsec.toFixed(2)} arcsec.`}
        className="pointer-events-none absolute inset-0 z-10 h-full w-full"
      >
        <defs>
          <marker
            id={arrowId}
            markerWidth="6"
            markerHeight="6"
            refX="4.4"
            refY="3"
            orient="auto"
          >
            <path d="M0,0.7 L5.2,3 L0,5.3 Z" fill="#F59E0B" />
          </marker>

          <radialGradient id={crimsonGlowId} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#FB7185" stopOpacity="1" />
            <stop offset="45%" stopColor="#DC2626" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#DC2626" stopOpacity="0" />
          </radialGradient>

          <radialGradient id={cyanGoldGlowId} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#22D3EE" stopOpacity="1" />
            <stop offset="50%" stopColor="#F59E0B" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#F59E0B" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Subtle golden halo under-stroke on hover */}
        {isHovering && (
          <line
            x1={e1X}
            y1={e1Y}
            x2={e2X}
            y2={e2Y}
            vectorEffect="non-scaling-stroke"
            stroke="#FBBF24"
            strokeWidth={5}
            strokeOpacity={0.28}
            strokeLinecap="round"
          />
        )}

        {/* Dashed Golden Kinematic Line (#F59E0B, stroke-dasharray="4 4") */}
        <line
          x1={e1X}
          y1={e1Y}
          x2={e2X}
          y2={e2Y}
          vectorEffect="non-scaling-stroke"
          stroke="#F59E0B"
          strokeWidth={isHovering ? 2.4 : 1.75}
          strokeDasharray="4 4"
          strokeOpacity={isHovering ? 1 : 0.92}
          markerEnd={`url(#${arrowId})`}
        />

        {/* Glowing Endpoint Halos in SVG coordinate space */}
        <circle
          cx={e1X}
          cy={e1Y}
          r={isHovering ? 4.4 : 3.2}
          fill={`url(#${crimsonGlowId})`}
        />
        <circle
          cx={e2X}
          cy={e2Y}
          r={isHovering ? 4.8 : 3.6}
          fill={`url(#${cyanGoldGlowId})`}
        />

        {/* Invisible wide hover target along the line and both endpoints */}
        <g
          className="pointer-events-auto cursor-help"
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        >
          <title>{`Proper Motion (μ): ${signedPmText} mas/yr · Displacement: ${displacementArcsec.toFixed(2)} arcsec (arcsecond distance)`}</title>
          <line
            x1={e1X}
            y1={e1Y}
            x2={e2X}
            y2={e2Y}
            stroke="transparent"
            strokeWidth="12"
            strokeLinecap="round"
          />
          <circle cx={e1X} cy={e1Y} r="7" fill="transparent" />
          <circle cx={e2X} cy={e2Y} r="7" fill="transparent" />
        </g>
      </svg>

      {/* Crisp Circular HTML Glowing Dots (remain perfectly circular at any aspect ratio) */}
      <div
        aria-hidden="true"
        style={{ left: `${e1X}%`, top: `${e1Y}%` }}
        className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-1/2"
      >
        <div
          className={`flex items-center justify-center rounded-full border border-dashed border-rose-400/90 bg-rose-600/20 transition-all ${
            isHovering
              ? 'h-6 w-6 shadow-[0_0_16px_rgba(244,63,94,0.85)]'
              : 'h-4 w-4 shadow-[0_0_10px_rgba(220,38,38,0.7)]'
          }`}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-rose-400 shadow-[0_0_8px_#fb7185]" />
        </div>
        {isHovering && (
          <span className="absolute -top-4 left-1/2 -translate-x-1/2 whitespace-nowrap rounded border border-rose-500/40 bg-[#050507]/90 px-1 py-0.5 font-mono text-[8.5px] font-semibold text-rose-300">
            Epoch 1 (−)
          </span>
        )}
      </div>

      <div
        aria-hidden="true"
        style={{ left: `${e2X}%`, top: `${e2Y}%` }}
        className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-1/2"
      >
        <div
          className={`flex items-center justify-center rounded-full border border-amber-400 bg-cyan-400/15 transition-all ${
            isHovering
              ? 'h-6.5 w-6.5 shadow-[0_0_18px_rgba(34,211,238,0.85)]'
              : 'h-4.5 w-4.5 shadow-[0_0_12px_rgba(245,158,11,0.75)]'
          }`}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-cyan-300 shadow-[0_0_8px_#22d3ee]" />
        </div>
        {isHovering && (
          <span className="absolute -bottom-4 left-1/2 -translate-x-1/2 whitespace-nowrap rounded border border-amber-500/40 bg-[#050507]/90 px-1 py-0.5 font-mono text-[8.5px] font-semibold text-cyan-200">
            Epoch 2 (+)
          </span>
        )}
      </div>

      {/* JWST Obsidian Glassmorphic Hover Tooltip: Proper Motion & Arcsecond Distance */}
      {isHovering && (
        <div
          role="tooltip"
          style={{
            left: `${midX}%`,
            top: `${tooltipTopPct}%`,
          }}
          className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-1/2 rounded-lg border border-amber-500/45 bg-[#050507]/90 px-3 py-2 font-mono text-[10px] shadow-[0_0_24px_rgba(245,158,11,0.3)] backdrop-blur-md"
        >
          <div className="flex items-center gap-1.5 whitespace-nowrap font-semibold text-amber-300">
            <MoveUpRight className="h-3 w-3 text-[#F59E0B]" aria-hidden="true" />
            <span>Proper Motion (μ):</span>
            <span className="tabular-nums text-[#F8FAFC]">
              {signedPmText} mas/yr
            </span>
          </div>
          <div className="mt-1 flex items-center justify-between gap-2 whitespace-nowrap text-[10px] tabular-nums text-slate-200">
            <span className="text-amber-200/90">Displacement:</span>
            <span className="font-semibold text-cyan-300">
              {displacementArcsec.toFixed(2)} arcsec
            </span>
          </div>
          {typeof displacementPx === 'number' && (
            <div className="mt-0.5 whitespace-nowrap text-[9px] tabular-nums text-slate-400">
              Arcsecond distance · Δ{displacementPx.toFixed(1)} px
            </div>
          )}
        </div>
      )}
    </>
  );
}
