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

interface SpectralChartProps {
  wavelengths: number[];
  rawSpectrum: number[];
  rnnClassification: string;
  activeWavelength?: number;
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

  return (
    <div className="flex flex-col border-t border-amber-500/15 pt-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Waves className="h-4 w-4 text-amber-400" aria-hidden="true" />
          <h3 className="text-xs font-semibold text-[#F8FAFC]">
            Rainbow Fingerprint (102 Infrared Colors)
          </h3>
        </div>
        <span className="rounded-full border border-amber-500/35 bg-amber-500/10 px-2.5 py-0.5 text-[10px] font-medium text-amber-200">
          {rnnClassification}
        </span>
      </div>

      <div className="h-52 w-full rounded-xl border border-amber-500/20 bg-[#050507] p-2">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={data}
            margin={{ top: 14, right: 10, left: -16, bottom: 2 }}
          >
            <defs>
              <linearGradient id="spherexFluxGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.48} />
                <stop offset="55%" stopColor="#FF5500" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#7F1D1D" stopOpacity={0.02} />
              </linearGradient>
            </defs>

            <CartesianGrid stroke="#292524" strokeDasharray="3 3" opacity={0.65} />

            {/* Chemical absorption dips */}
            <ReferenceArea
              x1={1.32}
              x2={1.48}
              fill="#F59E0B"
              fillOpacity={0.14}
              strokeOpacity={0}
              label={{
                value: 'Water (H₂O)',
                position: 'insideTop',
                fill: '#FCD34D',
                fontSize: 9,
              }}
            />
            <ReferenceArea
              x1={3.18}
              x2={3.42}
              fill="#FF5500"
              fillOpacity={0.16}
              strokeOpacity={0}
              label={{
                value: 'Methane (CH₄)',
                position: 'insideTop',
                fill: '#FB923C',
                fontSize: 9,
              }}
            />
            <ReferenceArea
              x1={4.46}
              x2={4.84}
              fill="#10B981"
              fillOpacity={0.14}
              strokeOpacity={0}
              label={{
                value: 'Carbon Monoxide (CO)',
                position: 'insideTopRight',
                fill: '#6EE7B7',
                fontSize: 9,
              }}
            />

            <XAxis
              dataKey="wavelength"
              type="number"
              domain={[0.75, 5.0]}
              tickCount={6}
              stroke="#78716C"
              tick={{ fill: '#A8A29E', fontSize: 10, fontFamily: 'JetBrains Mono' }}
              tickFormatter={(v: number) => `${v.toFixed(1)}µm`}
            />
            <YAxis
              stroke="#78716C"
              tick={{ fill: '#A8A29E', fontSize: 10, fontFamily: 'JetBrains Mono' }}
            />

            <Tooltip
              contentStyle={{
                backgroundColor: 'rgba(11, 12, 16, 0.96)',
                borderColor: 'rgba(245, 158, 11, 0.4)',
                borderRadius: '0.75rem',
                fontSize: '11px',
                fontFamily: 'JetBrains Mono, monospace',
                color: '#F8FAFC',
              }}
              formatter={(value: unknown) => [
                `${Number(value).toFixed(2)} Brightness`,
                'Infrared Light',
              ]}
              labelFormatter={(label: unknown) =>
                `Color Wavelength: ${Number(label).toFixed(2)} µm`
              }
            />

            {typeof activeWavelength === 'number' && (
              <ReferenceLine
                x={Number(activeWavelength.toFixed(3))}
                stroke="#FBBF24"
                strokeWidth={1.5}
                strokeDasharray="4 3"
              />
            )}

            <Area
              type="monotone"
              dataKey="flux"
              stroke="#F59E0B"
              strokeWidth={2}
              fill="url(#spherexFluxGrad)"
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
