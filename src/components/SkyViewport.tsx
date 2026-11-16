import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Database,
  Eye,
  Globe,
  Layers,
  MoveUpRight,
  Radio,
  ShieldCheck,
  Sliders,
  Sparkles,
} from 'lucide-react';
import type {
  AstrometryTelemetry,
  Coordinates,
  PartnerVetting,
  PhotometryMetrics,
  ProperMotion,
  SkyViewMode,
  TelescopeOverlayState,
} from '../types/telemetry';
import { getTargetFrameMotion } from '../data/presetsAndFallback';
import {
  buildSyntheticFitsEpochMatrices,
  detectTransientMotionVector,
  extract32x32FromDataUrl,
  renderDifferenceDipoleCanvas,
  zscaleAsinhStretch,
} from '../utils/astroStretch';
import { AladinSkyMap } from './AladinSkyMap';
import { BlinkComparator } from './BlinkComparator';
import { KinematicVectorOverlay } from './KinematicVectorOverlay';

interface SkyViewportProps {
  coordinates: Coordinates;
  fov: number;
  pastFrameBase64: string;
  presentFrameBase64: string;
  epoch1Matrix?: number[][];
  epoch2Matrix?: number[][];
  datacubeSlice?: number[][];
  s3Source?: string;
  s3BucketUri?: string;
  zodiSubtractedMjySr?: number;
  blankChannels?: number[];
  fitsSourceMode?: string;
  sourceCount?: number;
  photometry?: PhotometryMetrics;
  properMotion?: ProperMotion;
  astrometry?: AstrometryTelemetry;
  csaVetting?: PartnerVetting;
  stacked6Array: boolean;
  gaiaMatched: boolean;
  onToggleStack6: (stacked: boolean) => void;
}

type BottomDrawerTab = 'layers' | 's3';

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
  s3BucketUri,
  zodiSubtractedMjySr,
  blankChannels,
  fitsSourceMode,
  sourceCount,
  photometry,
  properMotion,
  astrometry,
  csaVetting,
  stacked6Array,
  gaiaMatched,
  onToggleStack6,
}: SkyViewportProps) {
  const [viewMode, setViewMode] = useState<SkyViewMode>('blink');
  const [drawerTab, setDrawerTab] = useState<BottomDrawerTab>('layers');
  const [showDiffVector, setShowDiffVector] = useState<boolean>(true);
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

  const diffTransient = useMemo(
    () =>
      detectTransientMotionVector(
        resolvedMatrices.stretch1.stretched,
        resolvedMatrices.stretch2.stretched,
        { catalogPmMasYr: properMotion ? pmTotal : undefined }
      ),
    [resolvedMatrices, properMotion, pmTotal]
  );

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
        width: 512,
        height: 304,
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
  const liveZodi =
    zodiSubtractedMjySr ??
    photometry?.zodi_subtracted_mjy_sr ??
    csaVetting?.zodi_subtracted_mjy_sr ??
    0.78;
  const gaiaResidualArcsec =
    photometry?.gaia_residual_arcsec ?? (gaiaMatched ? 0.14 : 4.82);
  const wcsProjection = photometry?.wcs_projection ?? 'TAN';
  const catalogCount = sourceCount ?? 6167;
  const s3Label =
    s3BucketUri || s3Source || 's3://nasa-irsa-spherex/qr3/level2/';
  const blankChText = (blankChannels && blankChannels.length ? blankChannels : [51, 52]).join('–');

  return (
    <section
      data-tour="step-2"
      aria-label="Step 1: Spot the Moving Object"
      className="flex flex-col justify-between gap-2.5 rounded-2xl border border-white/[0.08] bg-[#0B101E]/90 p-3.5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)] backdrop-blur-xl lg:col-span-5 lg:min-h-0 lg:overflow-y-auto"
    >
      {/* Header with Glowing STEP 01 Pill + View Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-md border border-cyan-400/45 bg-cyan-500/15 px-1.5 py-0.5 font-mono text-[9.5px] font-bold tracking-wider text-cyan-200 shadow-[0_0_10px_rgba(0,240,255,0.18)]">
              STEP 01
            </span>
            <h2 className="text-sm font-bold tracking-tight text-[#F8FAFC]">
              Spot the Moving Object!
            </h2>
          </div>
          <p className="mt-0.5 font-mono text-[10px] tabular-nums text-sky-300/80">
            RA {coordinates.ra.toFixed(4)}° · Dec{' '}
            {coordinates.dec >= 0 ? '+' : ''}
            {coordinates.dec.toFixed(4)}°
          </p>
        </div>

        <div
          role="tablist"
          aria-label="Sky viewer modes"
          className="flex flex-wrap items-center gap-1 rounded-xl border border-white/[0.08] bg-[#050811] p-0.5"
        >
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === 'blink'}
            onClick={() => setViewMode('blink')}
            className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10.5px] font-medium transition-colors ${
              viewMode === 'blink'
                ? 'bg-cyan-500/20 text-cyan-200 ring-1 ring-cyan-400/40'
                : 'text-slate-400 hover:text-slate-100'
            }`}
          >
            <Eye className="h-3 w-3 text-cyan-400" aria-hidden="true" />
            <span>Blink Video</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={viewMode === 'difference'}
            onClick={() => setViewMode('difference')}
            className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10.5px] font-medium transition-colors ${
              viewMode === 'difference'
                ? 'bg-rose-500/20 text-rose-200 ring-1 ring-rose-400/40'
                : 'text-slate-400 hover:text-slate-100'
            }`}
          >
            <Sparkles className="h-3 w-3 text-rose-400" aria-hidden="true" />
            <span>Subtract: Now − Past</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={viewMode === 'aladin'}
            onClick={() => setViewMode('aladin')}
            className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10.5px] font-medium transition-colors ${
              viewMode === 'aladin'
                ? 'bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-400/40'
                : 'text-slate-400 hover:text-slate-100'
            }`}
          >
            <Globe className="h-3 w-3 text-emerald-400" aria-hidden="true" />
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
          properMotion={properMotion}
          astrometry={astrometry}
          stacked6Array={stacked6Array}
        />
      )}

      {viewMode === 'difference' && (
        <div className="relative h-[290px] w-full overflow-hidden rounded-xl border border-white/[0.08] bg-[#060913] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)] xl:h-[325px]">
          <canvas
            ref={diffCanvasRef}
            aria-label="Differential Photometry Dipole Now minus Past"
            className="h-full w-full object-cover"
          />
          <KinematicVectorOverlay
            epoch1Norm={{
              x: diffTransient.epoch1Footprint.normX,
              y: diffTransient.epoch1Footprint.normY,
            }}
            epoch2Norm={{
              x: diffTransient.epoch2Detection.normX,
              y: diffTransient.epoch2Detection.normY,
            }}
            properMotionMasYr={diffTransient.vectorDistMasYr}
            displacementArcsec={
              astrometry?.displacement_arcsec ?? diffTransient.vectorDistArcsec
            }
            displacementPx={diffTransient.vectorDistPx}
            distanceAu={astrometry?.estimated_distance_au}
            distancePc={astrometry?.estimated_distance_pc}
            visible={showDiffVector}
          />

          <div className="pointer-events-none absolute top-2.5 left-2.5 rounded-full border border-rose-500/45 bg-slate-950/65 px-2.5 py-0.5 font-mono text-[10px] font-semibold text-rose-200 backdrop-blur-md">
            Differential Photometry: Now − Past
          </div>

          {diffTransient.isHighProperMotion && (
            <div
              role="status"
              title={`High Proper Motion (>50 mas/yr): Epoch 1 (−) → Epoch 2 (+) vector ${diffTransient.vectorDistPx.toFixed(1)} px (${diffTransient.vectorDistArcsec.toFixed(2)} arcsec)`}
              className="pointer-events-none absolute top-2.5 right-2.5 inline-flex items-center gap-1 rounded-full border border-rose-500/60 bg-slate-950/65 px-2.5 py-0.5 font-mono text-[10px] font-semibold tabular-nums text-rose-200 backdrop-blur-md"
            >
              <AlertTriangle
                className="h-3 w-3 shrink-0 text-rose-400"
                aria-hidden="true"
              />
              <span>{diffTransient.vectorDistMasYr.toFixed(1)} mas/yr</span>
            </div>
          )}

          <div className="pointer-events-none absolute inset-x-2.5 bottom-2.5 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-3 rounded-full border border-white/[0.1] bg-slate-950/65 px-2.5 py-1 font-mono text-[9.5px] text-slate-300 backdrop-blur-md">
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-cyan-400 shadow-[0_0_6px_#00f0ff]" />
                SPHEREx Now (+)
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-rose-500 shadow-[0_0_6px_#f43f5e]" />
                Epoch 1 2000 (−)
              </span>
            </div>

            <button
              type="button"
              aria-pressed={showDiffVector}
              onClick={() => setShowDiffVector((prev) => !prev)}
              className={`pointer-events-auto mr-16 inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-mono text-[9.5px] font-medium backdrop-blur-md transition-colors ${
                showDiffVector
                  ? 'border-amber-400/55 bg-amber-500/15 text-amber-200 hover:bg-amber-500/25'
                  : 'border-white/[0.1] bg-slate-950/65 text-slate-400 hover:text-cyan-200'
              }`}
            >
              <MoveUpRight className="h-3 w-3 text-amber-400" aria-hidden="true" />
              <span>Vector</span>
            </button>
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

      {/* Clean 2-Tab Segmented Drawer: Camera & Sky Layers | AWS S3 & FITS Telemetry */}
      <div className="rounded-xl border border-white/[0.07] bg-[#060A14]/90 p-2.5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)]">
        {/* Segmented Tab Header */}
        <div
          role="tablist"
          aria-label="Camera layers and AWS S3 telemetry tabs"
          className="mb-2 grid grid-cols-2 gap-1 rounded-lg border border-white/[0.06] bg-[#04060C] p-0.5"
        >
          <button
            type="button"
            role="tab"
            aria-selected={drawerTab === 'layers'}
            onClick={() => setDrawerTab('layers')}
            className={`inline-flex items-center justify-center gap-1.5 rounded-md py-1 text-[10.5px] font-medium transition-colors ${
              drawerTab === 'layers'
                ? 'bg-cyan-500/20 text-cyan-200 ring-1 ring-cyan-400/35'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sliders className="h-3 w-3 text-cyan-400" aria-hidden="true" />
            <span>Camera &amp; Sky Layers</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={drawerTab === 's3'}
            onClick={() => setDrawerTab('s3')}
            className={`inline-flex items-center justify-center gap-1.5 rounded-md py-1 text-[10.5px] font-medium transition-colors ${
              drawerTab === 's3'
                ? 'bg-cyan-500/20 text-cyan-200 ring-1 ring-cyan-400/35'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Radio className="h-3 w-3 text-amber-400" aria-hidden="true" />
            <span>AWS S3 &amp; FITS Telemetry</span>
          </button>
        </div>

        {drawerTab === 'layers' ? (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              {/* 6-Detector Stack Toggle */}
              <div className="flex items-center gap-2">
                <span className="text-[10.5px] font-medium text-slate-300">
                  6-Detector Stack
                </span>
                <div className="flex items-center rounded-lg border border-white/[0.08] bg-[#0B101E] p-0.5">
                  <button
                    type="button"
                    onClick={() => onToggleStack6(false)}
                    className={`rounded-md px-2 py-0.5 text-[10px] font-medium transition-colors ${
                      !stacked6Array
                        ? 'bg-cyan-500/20 text-cyan-200'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Single
                  </button>
                  <button
                    type="button"
                    onClick={() => onToggleStack6(true)}
                    className={`rounded-md px-2 py-0.5 text-[10px] font-medium transition-colors ${
                      stacked6Array
                        ? 'border border-emerald-400/45 bg-emerald-500/20 text-emerald-300'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    6-Cam Stack
                  </button>
                </div>
              </div>

              {/* Catalogs Pills */}
              <div className="flex items-center gap-1.5">
                <span className="inline-flex items-center gap-1 text-[10.5px] font-medium text-slate-300">
                  <Layers className="h-3 w-3 text-cyan-400" aria-hidden="true" />
                  <span>Catalogs</span>
                </span>
                <div className="flex items-center gap-1">
                  {(
                    [
                      ['gaiaStarMap', 'Gaia'],
                      ['wiseHeatMap', 'WISE'],
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
                      className={`rounded-md border px-2 py-0.5 text-[10px] font-medium transition-colors ${
                        overlays[key]
                          ? 'border-sky-400/50 bg-sky-500/15 text-sky-200'
                          : 'border-white/[0.08] bg-[#0B101E] text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* 1-Line Live S3 Summary + View Full S3 Telemetry Link */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] pt-1.5 font-mono text-[9.5px] tabular-nums">
              <span className="text-slate-300">
                <strong className="text-cyan-300">AWS S3 QR3</strong> •{' '}
                {catalogCount.toLocaleString()} sources • SNR{' '}
                <strong className="text-emerald-300">{liveSnr.toFixed(1)}σ</strong>
              </span>
              <button
                type="button"
                onClick={() => setDrawerTab('s3')}
                className="inline-flex items-center gap-1 font-sans text-[10px] font-semibold text-cyan-300 transition-colors hover:text-cyan-200"
              >
                <span>View Full S3 Telemetry</span>
                <ArrowRight className="h-3 w-3" aria-hidden="true" />
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-1.5 font-mono text-[9.5px]">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] pb-1">
              <span className="inline-flex min-w-0 items-center gap-1.5 text-cyan-300">
                <Database className="h-3 w-3 shrink-0 text-cyan-400" aria-hidden="true" />
                <span className="truncate font-semibold" title={s3Label}>
                  AWS S3: {s3Label}
                </span>
              </span>
              <span className="shrink-0 text-slate-400">
                WCS {wcsProjection} · 6.15&quot;/px · FOV {fov}°
              </span>
            </div>

            <div className="grid grid-cols-3 gap-x-3 gap-y-1 tabular-nums">
              <div>
                <span className="block text-[8.5px] uppercase tracking-wider text-slate-500">
                  DAOStarFinder
                </span>
                <span className="font-semibold text-[#F8FAFC]">
                  {catalogCount.toLocaleString()} src
                </span>
              </div>

              <div>
                <span className="block text-[8.5px] uppercase tracking-wider text-slate-500">
                  Peak SNR
                </span>
                <span className="font-semibold text-emerald-300">
                  {liveSnr.toFixed(1)} σ
                </span>
              </div>

              <div>
                <span className="block text-[8.5px] uppercase tracking-wider text-slate-500">
                  Surface Bright.
                </span>
                <span className="font-semibold text-amber-300">
                  {liveSurfaceBrightness.toFixed(2)} MJy/sr
                </span>
              </div>

              <div>
                <span className="block text-[8.5px] uppercase tracking-wider text-slate-500">
                  Proper Motion
                </span>
                <span className="font-semibold text-rose-300">
                  {pmTotal.toFixed(1)} mas/yr
                </span>
              </div>

              <div>
                <span className="block text-[8.5px] uppercase tracking-wider text-slate-500">
                  ZODI Subtracted
                </span>
                <span className="font-semibold text-cyan-300">
                  {liveZodi.toFixed(2)} MJy/sr
                </span>
              </div>

              <div>
                <span className="block text-[8.5px] uppercase tracking-wider text-slate-500">
                  Gaia DR3 / Gap
                </span>
                <span
                  className={`font-semibold ${
                    gaiaMatched ? 'text-sky-300' : 'text-emerald-300'
                  }`}
                >
                  {gaiaResidualArcsec.toFixed(2)}&quot; · CH {blankChText}
                </span>
              </div>
            </div>

            {csaVetting && (
              <div
                className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border px-2 py-1 text-[9px] ${
                  csaVetting.vetting_verdict === 'KNOWN_SOLAR_SYSTEM_OBJECT' ||
                  csaVetting.status === 'REJECTED_SOLAR_SYSTEM_ASTEROID'
                    ? 'border-rose-500/40 bg-rose-500/10 text-rose-200'
                    : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  {csaVetting.vetting_verdict === 'KNOWN_SOLAR_SYSTEM_OBJECT' ||
                  csaVetting.status === 'REJECTED_SOLAR_SYSTEM_ASTEROID' ? (
                    <AlertTriangle className="h-3 w-3 shrink-0 text-rose-400" aria-hidden="true" />
                  ) : (
                    <ShieldCheck className="h-3 w-3 shrink-0 text-emerald-400" aria-hidden="true" />
                  )}
                  <span className="font-semibold">
                    CSA NEOSSat:{' '}
                    {csaVetting.vetting_verdict === 'KNOWN_SOLAR_SYSTEM_OBJECT' ||
                    csaVetting.status === 'REJECTED_SOLAR_SYSTEM_ASTEROID'
                      ? 'KNOWN SOLAR SYSTEM OBJECT'
                      : 'VERIFIED DEEP-SPACE CANDIDATE'}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2 tabular-nums text-slate-300">
                  <span>
                    CADC:{' '}
                    <strong className="text-cyan-300">
                      {csaVetting.csa_neossat_frames ?? csaVetting.neossat_archival_frames ?? 0}
                    </strong>
                  </span>
                  <span>
                    SkyBoT:{' '}
                    <strong
                      className={
                        (csaVetting.known_asteroids_count ?? csaVetting.known_asteroids_in_fov ?? 0) > 0
                          ? 'text-rose-300'
                          : 'text-emerald-300'
                      }
                    >
                      {csaVetting.known_asteroids_count ?? csaVetting.known_asteroids_in_fov ?? 0}
                    </strong>
                  </span>
                  {fitsSourceMode && (
                    <span className="text-sky-300/80">
                      {fitsSourceMode.includes('HIPS2FITS') ? 'Live HiPS2FITS' : 'S3 Baseline'}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
