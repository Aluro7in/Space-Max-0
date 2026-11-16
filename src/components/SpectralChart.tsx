import React, { useMemo } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Waves } from 'lucide-react';
import type { AbsorptionDepths } from '../types/telemetry';

interface SpectralChartProps {
  wavelengths: number[];
  rawSpectrum: number[];
  rnnClassification: string;
  activeWavelength?: number;
  blankChannels?: number[];
  dichroicGapUm?: number;
  zodiSubtractedMjySr?: number;
  absorptionDepths?: AbsorptionDepths;
}

interface SpectralPoint {
  wavelength: number;
  flux: number;
}

export function SpectralChart({
  wavelengths,
  rawSpectrum,
  rnnClassification,
  activeWavelength,
  blankChannels = [51, 52],
  dichroicGapUm = 2.42,
  zodiSubtractedMjySr,
  absorptionDepths,
}: SpectralChartProps) {
  const data: SpectralPoint[] = useMemo(() => {
    const len = Math.min(wavelengths.length, rawSpectrum.length);
    const rows: SpectralPoint[] = [];
    for (let i = 0; i < len; i += 1) {
      rows.push({
        wavelength: Number(wavelengths[i].toFixed(3)),
        flux: Number(rawSpectrum[i].toFixed(2)),
      });
    }
    return rows;
  }, [wavelengths, rawSpectrum]);

  const blankLabel = `BLANKCH ${blankChannels.join('–')} (${dichroicGapUm.toFixed(2)}µm)`;

  return (
    <div className="flex flex-col border-t border-white/[0.07] pt-2.5">
      {/* Clean Single-Line Header */}
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Waves className="h-3.5 w-3.5 text-cyan-400" aria-hidden="true" />
          <h3 className="text-xs font-semibold text-[#F8FAFC]">
            Rainbow Fingerprint (102 SPHEREx Channels)
          </h3>
        </div>
        <span className="rounded-md border border-amber-400/35 bg-amber-500/10 px-2 py-0.5 font-mono text-[9.5px] font-semibold text-amber-300">
          {rnnClassification}
        </span>
      </div>

      <div className="h-[160px] w-full rounded-xl border border-white/[0.08] bg-[#04060C] p-1.5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] xl:h-[175px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={data}
            margin={{ top: 12, right: 8, left: -18, bottom: 0 }}
          >
            <defs>
              <linearGradient id="spherexMultiSpecStroke" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#00F0FF" />
                <stop offset="25%" stopColor="#38BDF8" />
                <stop offset="50%" stopColor="#10B981" />
                <stop offset="75%" stopColor="#FBBF24" />
                <stop offset="100%" stopColor="#F43F5E" />
              </linearGradient>

              <linearGradient id="spherexMultiSpecFill" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#00F0FF" stopOpacity={0.28} />
                <stop offset="25%" stopColor="#38BDF8" stopOpacity={0.24} />
                <stop offset="50%" stopColor="#10B981" stopOpacity={0.22} />
                <stop offset="75%" stopColor="#FBBF24" stopOpacity={0.24} />
                <stop offset="100%" stopColor="#F43F5E" stopOpacity={0.28} />
              </linearGradient>
            </defs>

            <CartesianGrid stroke="#1E293B" strokeDasharray="3 3" opacity={0.55} />

            {/* H2O (1.4um, 1.9um) — Celestial Azure */}
            <ReferenceArea
              x1={1.32}
              x2={1.48}
              fill="#38BDF8"
              fillOpacity={0.14}
              strokeOpacity={0}
              label={{
                value: 'H₂O 1.4µm',
                position: 'insideTop',
                fill: '#38BDF8',
                fontSize: 8.5,
              }}
            />
            <ReferenceArea
              x1={1.82}
              x2={1.98}
              fill="#38BDF8"
              fillOpacity={0.1}
              strokeOpacity={0}
              label={{
                value: 'H₂O 1.9µm',
                position: 'insideBottom',
                fill: '#7DD3FC',
                fontSize: 8,
              }}
            />

            {/* CH4 (2.3um) */}
            <ReferenceArea
              x1={2.22}
              x2={2.38}
              fill="#FBBF24"
              fillOpacity={0.1}
              strokeOpacity={0}
              label={{
                value: 'CH₄ 2.3µm',
                position: 'insideBottom',
                fill: '#FDE68A',
                fontSize: 8,
              }}
            />

            {/* Dichroic Splitter Gap BLANKCH 51-52 at ~2.42um */}
            <ReferenceArea
              x1={dichroicGapUm - 0.04}
              x2={dichroicGapUm + 0.04}
              fill="#94A3B8"
              fillOpacity={0.2}
              strokeOpacity={0}
            />
            <ReferenceLine
              x={dichroicGapUm}
              stroke="#94A3B8"
              strokeWidth={1}
              strokeDasharray="2 2"
              label={{
                value: 'BLANKCH 51–52',
                position: 'top',
                fill: '#94A3B8',
                fontSize: 8,
              }}
            />

            {/* CH4 (3.3um) — Plasma Rose-Magenta */}
            <ReferenceArea
              x1={3.18}
              x2={3.42}
              fill="#F43F5E"
              fillOpacity={0.15}
              strokeOpacity={0}
              label={{
                value: 'CH₄ 3.3µm',
                position: 'insideTop',
                fill: '#FDA4AF',
                fontSize: 8.5,
              }}
            />

            {/* CO (4.6um) — Bio-Emerald */}
            <ReferenceArea
              x1={4.46}
              x2={4.84}
              fill="#10B981"
              fillOpacity={0.14}
              strokeOpacity={0}
              label={{
                value: 'CO 4.6µm',
                position: 'insideTopRight',
                fill: '#6EE7B7',
                fontSize: 8.5,
              }}
            />

            <XAxis
              dataKey="wavelength"
              type="number"
              domain={[0.75, 5.0]}
              tickCount={6}
              stroke="#475569"
              tick={{ fill: '#94A3B8', fontSize: 9.5, fontFamily: 'JetBrains Mono' }}
              tickFormatter={(v: number) => `${v.toFixed(1)}µm`}
            />
            <YAxis
              stroke="#475569"
              tick={{ fill: '#94A3B8', fontSize: 9.5, fontFamily: 'JetBrains Mono' }}
            />

            <Tooltip
              contentStyle={{
                backgroundColor: 'rgba(9, 13, 24, 0.96)',
                borderColor: 'rgba(0, 240, 255, 0.4)',
                borderRadius: '0.75rem',
                fontSize: '10.5px',
                fontFamily: 'JetBrains Mono, monospace',
                color: '#F8FAFC',
              }}
              formatter={(value: unknown) => [
                `${Number(value).toFixed(2)} MJy/sr (rel.)`,
                'SPHEREx Flux',
              ]}
              labelFormatter={(label: unknown) =>
                `Wavelength: ${Number(label).toFixed(2)} µm`
              }
            />

            {typeof activeWavelength === 'number' && (
              <ReferenceLine
                x={Number(activeWavelength.toFixed(3))}
                stroke="#00F0FF"
                strokeWidth={1.5}
                strokeDasharray="4 3"
              />
            )}

            <Area
              type="monotone"
              dataKey="flux"
              stroke="url(#spherexMultiSpecStroke)"
              strokeWidth={2.2}
              fill="url(#spherexMultiSpecFill)"
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Row of 3 Subtle Micro-Badges Below the Chart */}
      <div className="mt-1.5 grid grid-cols-3 gap-1.5 font-mono text-[9px] tabular-nums">
        <div className="flex items-center justify-between rounded-lg border border-white/[0.07] bg-[#060A14]/90 px-2 py-1">
          <span className="text-slate-400">ZODI</span>
          <strong className="text-emerald-300">
            {(zodiSubtractedMjySr ?? 0.85).toFixed(2)} MJy/sr
          </strong>
        </div>

        <div
          title={`Dichroic splitter gap ${blankLabel}`}
          className="flex items-center justify-between truncate rounded-lg border border-white/[0.07] bg-[#060A14]/90 px-2 py-1"
        >
          <span className="text-slate-400">Gap</span>
          <strong className="truncate text-sky-300">
            CH {blankChannels.join('–')} ({dichroicGapUm.toFixed(2)}µm)
          </strong>
        </div>

        <div className="flex items-center justify-between truncate rounded-lg border border-white/[0.07] bg-[#060A14]/90 px-2 py-1">
          <span className="text-sky-300">
            H₂O {absorptionDepths ? `${(absorptionDepths.h2o_1_4um * 100).toFixed(0)}%` : '62%'}
          </span>
          <span className="text-rose-300">
            CH₄ {absorptionDepths ? `${(absorptionDepths.ch4_3_3um * 100).toFixed(0)}%` : '76%'}
          </span>
          <span className="text-emerald-300">
            CO {absorptionDepths ? `${(absorptionDepths.co_4_6um * 100).toFixed(0)}%` : '46%'}
          </span>
        </div>
      </div>
    </div>
  );
}
