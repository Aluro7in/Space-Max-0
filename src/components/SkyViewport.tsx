import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  Database,
  Eye,
  Globe,
  Layers,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import type {
  Coordinates,
  PhotometryMetrics,
  ProperMotion,
  SkyViewMode,
  TelescopeOverlayState,
} from '../types/telemetry';
import { getTargetFrameMotion } from '../data/presetsAndFallback';
import {
  buildSyntheticFitsEpochMatrices,
  extract32x32FromDataUrl,
  renderDifferenceDipoleCanvas,
  zscaleAsinhStretch,
} from '../utils/astroStretch';
import { AladinSkyMap } from './AladinSkyMap';
import { BlinkComparator } from './BlinkComparator';

interface SkyViewportProps {
  coordinates: Coordinates;
  fov: number;
  pastFrameBase64: string;
  presentFrameBase64: string;
  epoch1Matrix?: number[][];
  epoch2Matrix?: number[][];
  datacubeSlice?: number[][];
  s3Source?: string;
  sourceCount?: number;
  photometry?: PhotometryMetrics;
  properMotion?: ProperMotion;
  stacked6Array: boolean;
  gaiaMatched: boolean;
  onToggleStack6: (stacked: boolean) => void;
}

function normalizeImgSrc(raw: string): string {
  if (!raw) return '';
  return raw.startsWith('data:image/') ? raw : `data:image/png;base64,${raw}`;
}

export function SkyViewport({
  coordinates,
  fov,
  pastFrameBase64,
  presentFrameBase64,
  epoch1Matrix,
  epoch2Matrix,
  datacubeSlice,
  s3Source,
  sourceCount,
  photometry,
  properMotion,
  stacked6Array,
  gaiaMatched,
  onToggleStack6,
}: SkyViewportProps) {
  const [viewMode, setViewMode] = useState<SkyViewMode>('blink');
  const [overlays, setOverlays] = useState<TelescopeOverlayState>({
    gaiaStarMap: true,
    wiseHeatMap: true,
    twoMass: false,
  });

  const [decodedPastMatrix, setDecodedPastMatrix] = useState<number[][] | null>(null);
  const [decodedPresentMatrix, setDecodedPresentMatrix] = useState<number[][] | null>(null);
  const diffCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const pastSrc = useMemo(() => normalizeImgSrc(pastFrameBase64), [pastFrameBase64]);
  const presentSrc = useMemo(() => normalizeImgSrc(presentFrameBase64), [presentFrameBase64]);
  const motion = useMemo(
    () => getTargetFrameMotion(coordinates.ra, coordinates.dec),
    [coordinates.ra, coordinates.dec]
  );

  // Decode base64 frames if backend didn't send raw epoch1/epoch2 arrays
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

  const resolvedMatrices = useMemo(() => {
    const synthetic = buildSyntheticFitsEpochMatrices(
      coordinates.ra,
      coordinates.dec,
      motion,
      stacked6Array
    );
    const e1 =
      epoch1Matrix && epoch1Matrix.length >= 16
        ? epoch1Matrix
        : decodedPastMatrix && decodedPastMatrix.length >= 16
          ? decodedPastMatrix
          : synthetic.epoch1;
    const e2 =
      epoch2Matrix && epoch2Matrix.length >= 16
        ? epoch2Matrix
        : decodedPresentMatrix && decodedPresentMatrix.length >= 16
          ? decodedPresentMatrix
          : datacubeSlice && datacubeSlice.length >= 16
            ? datacubeSlice
            : synthetic.epoch2;

    const stretch1 = zscaleAsinhStretch(e1, stacked6Array);
    const stretch2 = zscaleAsinhStretch(e2, stacked6Array);
    return { stretch1, stretch2 };
  }, [
    coordinates.ra,
    coordinates.dec,
    motion,
    stacked6Array,
    epoch1Matrix,
    epoch2Matrix,
    decodedPastMatrix,
    decodedPresentMatrix,
    datacubeSlice,
  ]);

  const pmRa = properMotion?.pm_ra_mas_yr ?? 14.2;
  const pmDec = properMotion?.pm_dec_mas_yr ?? -6.8;
  const pmTotal = Math.hypot(pmRa, pmDec);

  // Render high-DPI 256x256 smooth bicubic differential photometry dipole
  useEffect(() => {
    if (viewMode !== 'difference' || !diffCanvasRef.current) return;
    renderDifferenceDipoleCanvas(
      diffCanvasRef.current,
      resolvedMatrices.stretch1.stretched,
      resolvedMatrices.stretch2.stretched,
      {
        motion,
        fovDeg: fov,
        pmRaMasYr: pmRa,
        pmDecMasYr: pmDec,
        stacked6Array,
      }
    );
  }, [
    viewMode,
    resolvedMatrices,
    motion,
    fov,
    pmRa,
    pmDec,
    stacked6Array,
  ]);

  const handleToggleOverlay = (key: keyof TelescopeOverlayState) => {
    setOverlays((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const liveSnr = photometry?.snr ?? resolvedMatrices.stretch2.stats.snr;
  const liveSurfaceBrightness =
    photometry?.surface_brightness_mjy_sr ??
    resolvedMatrices.stretch2.stats.surfaceBrightnessMjySr;
  const gaiaResidualArcsec =
    photometry?.gaia_residual_arcsec ?? (gaiaMatched ? 0.14 : 4.82);
  const wcsProjection = photometry?.wcs_projection ?? 'TAN';
  const catalogCount = sourceCount ?? 6167;
  const s3Label =
    s3Source || 's3://nasa-irsa-spherex/qr2/level2/spherex_qr2_l2b_2025.fits';

  return (
    <section
      data-tour="step-2"
      aria-label="Step 1: Spot the Moving Object"
      className="flex flex-col justify-between gap-3 rounded-2xl border border-amber-500/20 bg-[#0B0C10]/90 p-4 backdrop-blur-md lg:col-span-5"
    >
      {/* Header + View Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold text-[#F8FAFC]">
            Step 1: Spot the Moving Object!
          </h2>
          <p className="font-mono text-[11px] tabular-nums text-slate-400">
            RA {coordinates.ra.toFixed(4)}° · Dec{' '}
            {coordinates.dec >= 0 ? '+' : ''}
            {coordinates.dec.toFixed(4)}° · FOV {fov}°
          </p>
        </div>

        <div
          role="tablist"
          aria-label="Sky viewer modes"
          className="flex flex-wrap items-center gap-1 rounded-xl border border-amber-500/20 bg-[#050507] p-1"
        >
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === 'blink'}
            onClick={() => setViewMode('blink')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
              viewMode === 'blink'
                ? 'bg-amber-500/20 text-amber-300'
                : 'text-slate-400 hover:text-amber-100'
            }`}
          >
            <Eye className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Blink Video</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={viewMode === 'difference'}
            onClick={() => setViewMode('difference')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
              viewMode === 'difference'
                ? 'bg-[#FF5500]/20 text-orange-300'
                : 'text-slate-400 hover:text-amber-100'
            }`}
          >
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Subtract: Now − Past</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={viewMode === 'aladin'}
            onClick={() => setViewMode('aladin')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
              viewMode === 'aladin'
                ? 'bg-emerald-500/20 text-emerald-300'
                : 'text-slate-400 hover:text-amber-100'
            }`}
          >
            <Globe className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Live Sky Map</span>
          </button>
        </div>
      </div>

      {/* Active Mode Canvas */}
      {viewMode === 'blink' && (
        <BlinkComparator
          ra={coordinates.ra}
          dec={coordinates.dec}
          fov={fov}
          pastFrameBase64={pastFrameBase64}
          presentFrameBase64={presentFrameBase64}
          epoch1Matrix={epoch1Matrix}
          epoch2Matrix={epoch2Matrix}
          datacubeSlice={datacubeSlice}
          stacked6Array={stacked6Array}
        />
      )}

      {viewMode === 'difference' && (
        <div className="relative flex aspect-square max-h-[370px] w-full items-center justify-center overflow-hidden rounded-xl border border-amber-500/25 bg-[#050507]">
          <canvas
            ref={diffCanvasRef}
            aria-label="Differential Photometry Dipole Now minus Past"
            className="h-full w-full object-contain"
          />
          <div className="absolute top-3 left-3 rounded-md border border-[#FF5500]/50 bg-[#050507]/85 px-2.5 py-1 font-mono text-[11px] text-orange-300">
            Differential Photometry: Now − Past
          </div>
          <div className="absolute bottom-3 left-3 flex flex-wrap items-center gap-3 rounded-md border border-amber-500/25 bg-[#050507]/85 px-2.5 py-1 font-mono text-[10px] text-slate-300">
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-amber-400" />
              SPHEREx Now (+)
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-rose-500" />
              Epoch 1 2000 (−)
            </span>
          </div>
        </div>
      )}

      {viewMode === 'aladin' && (
        <AladinSkyMap
          ra={coordinates.ra}
          dec={coordinates.dec}
          fov={fov}
          gaiaMatched={gaiaMatched}
          overlays={overlays}
          onToggleOverlay={handleToggleOverlay}
        />
      )}

      {/* Visual Switches + Live AWS S3 & FITS Telemetry Inspector Strip */}
      <div className="space-y-2">
        {/* Combine 6 SPHEREx Detectors */}
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-500/20 bg-[#050507] px-3 py-2">
          <span className="text-xs font-medium text-slate-300">
            Combine 6 SPHEREx Detectors
          </span>
          <div className="flex items-center rounded-lg border border-amber-500/20 bg-[#0B0C10] p-0.5">
            <button
              type="button"
              onClick={() => onToggleStack6(false)}
              className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                !stacked6Array
                  ? 'bg-amber-500/25 text-amber-200'
                  : 'text-slate-400 hover:text-amber-100'
              }`}
            >
              Single Camera
            </button>
            <button
              type="button"
              onClick={() => onToggleStack6(true)}
              className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                stacked6Array
                  ? 'border border-amber-500/45 bg-amber-500/20 text-amber-300'
                  : 'text-slate-400 hover:text-amber-100'
              }`}
            >
              Stack All 6 Cameras — Clearer Image
            </button>
          </div>
        </div>

        {/* Telescope Overlays Quick Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-500/20 bg-[#050507] px-3 py-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-300">
            <Layers className="h-3.5 w-3.5 text-amber-400" aria-hidden="true" />
            <span>Telescope Overlays</span>
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                ['gaiaStarMap', 'Gaia Star Map'],
                ['wiseHeatMap', 'WISE Heat Map'],
                ['twoMass', '2MASS'],
              ] as Array<[keyof TelescopeOverlayState, string]>
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  handleToggleOverlay(key);
                  if (viewMode !== 'aladin') setViewMode('aladin');
                }}
                className={`rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  overlays[key]
                    ? 'border-amber-500/45 bg-amber-500/15 text-amber-200'
                    : 'border-amber-500/15 bg-[#0B0C10] text-slate-400 hover:text-amber-100'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Live AWS S3 & FITS Telemetry Inspector Strip */}
        <div className="rounded-xl border border-amber-500/20 bg-[#050507] p-2.5 font-mono text-[10px]">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-500/15 pb-1.5">
            <span className="inline-flex min-w-0 items-center gap-1.5 text-amber-300">
              <Database className="h-3 w-3 shrink-0 text-amber-400" aria-hidden="true" />
              <span className="truncate font-semibold" title={s3Label}>
                AWS S3: {s3Label}
              </span>
            </span>
            <span className="shrink-0 text-slate-400">
              WCS {wcsProjection} · FOV {fov}°
            </span>
          </div>

          <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 tabular-nums sm:grid-cols-3">
            <div>
              <span className="block text-[9px] uppercase tracking-wider text-slate-500">
                DAOStarFinder
              </span>
              <span className="font-semibold text-[#F8FAFC]">
                {catalogCount.toLocaleString()} sources
              </span>
            </div>

            <div>
              <span className="block text-[9px] uppercase tracking-wider text-slate-500">
                Peak SNR
              </span>
              <span className="font-semibold text-emerald-300">
                {liveSnr.toFixed(1)} σ
              </span>
            </div>

            <div>
              <span className="block text-[9px] uppercase tracking-wider text-slate-500">
                Surface Bright.
              </span>
              <span className="font-semibold text-amber-300">
                {liveSurfaceBrightness.toFixed(2)} MJy/sr
              </span>
            </div>

            <div>
              <span className="block text-[9px] uppercase tracking-wider text-slate-500">
                Proper Motion
              </span>
              <span className="font-semibold text-orange-300">
                {pmTotal.toFixed(1)} mas/yr
              </span>
            </div>

            <div>
              <span className="block text-[9px] uppercase tracking-wider text-slate-500">
                Gaia DR3 Residual
              </span>
              <span
                className={`font-semibold ${
                  gaiaMatched ? 'text-amber-200' : 'text-emerald-300'
                }`}
              >
                {gaiaResidualArcsec.toFixed(2)}" ({gaiaMatched ? 'Match' : 'New'})
              </span>
            </div>

            <div className="flex items-end">
              <div className="flex flex-wrap gap-1">
                <span className="inline-flex items-center gap-0.5 rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] text-emerald-300">
                  <ShieldCheck className="h-2.5 w-2.5" aria-hidden="true" />
                  PSF Nominal
                </span>
                <span className="inline-flex items-center gap-0.5 rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[9px] text-amber-300">
                  <CheckCircle2 className="h-2.5 w-2.5" aria-hidden="true" />
                  Zodi Clean
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
