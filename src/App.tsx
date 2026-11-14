import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DiagnosticsCopilotPanel } from './components/DiagnosticsCopilotPanel';
import {
  GuidedMissionTour,
  TOUR_STORAGE_KEY,
  type TourUiState,
} from './components/GuidedMissionTour';
import { ScanHistoryModal } from './components/ScanHistoryModal';
import { SkyViewport } from './components/SkyViewport';
import { SpectralChart } from './components/SpectralChart';
import { TopNavBar } from './components/TopNavBar';
import { WebGLDataCube3D } from './components/WebGLDataCube3D';
import {
  buildFallbackDatacube,
  buildFallbackScan,
  findClosestPreset,
} from './data/presetsAndFallback';
import type {
  BackendConnectionMode,
  DatacubeResponse,
  ScanHistoryEntry,
  ScanResponse,
} from './types/telemetry';

const DEFAULT_RA = 166.33243;
const DEFAULT_DEC = 29.940572;
const DEFAULT_FOV = 0.15;

const BACKEND_URL_STORAGE_KEY = 'space_max_0_backend_url';
const SCAN_HISTORY_STORAGE_KEY = 'space_max_0_scan_history';
const MAX_HISTORY_ENTRIES = 15;

function normalizeBackendUrl(rawUrl: string): string {
  const cleaned = rawUrl.trim().replace(/\/+$/, '');
  return cleaned || 'http://localhost:8000';
}

function getDefaultBackendUrl(): string {
  const envUrl = import.meta.env.VITE_PYTHON_API_URL as string | undefined;
  if (typeof window !== 'undefined') {
    const saved = window.localStorage.getItem(BACKEND_URL_STORAGE_KEY);
    if (saved && saved.trim()) return normalizeBackendUrl(saved);
  }
  return envUrl && envUrl.trim()
    ? normalizeBackendUrl(envUrl)
    : 'http://localhost:8000';
}

function readInitialQueryCoords(): { ra: number; dec: number; fov: number } {
  if (typeof window === 'undefined') {
    return { ra: DEFAULT_RA, dec: DEFAULT_DEC, fov: DEFAULT_FOV };
  }
  const params = new URLSearchParams(window.location.search);
  const raRaw = parseFloat(params.get('ra') || '');
  const decRaw = parseFloat(params.get('dec') || '');
  const fovRaw = parseFloat(params.get('fov') || '');

  const ra =
    Number.isFinite(raRaw) && raRaw >= 0 && raRaw <= 360 ? raRaw : DEFAULT_RA;
  const dec =
    Number.isFinite(decRaw) && decRaw >= -90 && decRaw <= 90
      ? decRaw
      : DEFAULT_DEC;
  const fov =
    Number.isFinite(fovRaw) && fovRaw > 0 && fovRaw <= 5 ? fovRaw : DEFAULT_FOV;

  return { ra, dec, fov };
}

function loadScanHistory(): ScanHistoryEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(SCAN_HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistScanHistory(entries: ScanHistoryEntry[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      SCAN_HISTORY_STORAGE_KEY,
      JSON.stringify(entries)
    );
  } catch {
    try {
      const compact = entries.map((entry, idx) =>
        idx === 0 ? entry : { ...entry, visual_assets: undefined }
      );
      window.localStorage.setItem(
        SCAN_HISTORY_STORAGE_KEY,
        JSON.stringify(compact.slice(0, 8))
      );
    } catch {
      // Ignore storage quota issues in restricted sandboxes
    }
  }
}

function triggerJsonDownload(filename: string, payload: unknown): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export default function App() {
  const initial = useRef(readInitialQueryCoords());
  const [ra, setRa] = useState<number>(initial.current.ra);
  const [dec, setDec] = useState<number>(initial.current.dec);
  const [fov, setFov] = useState<number>(initial.current.fov);
  const [stacked6Array, setStacked6Array] = useState<boolean>(true);
  const [sliceIndex, setSliceIndex] = useState<number>(24);

  const [backendUrl, setBackendUrl] = useState<string>(() =>
    getDefaultBackendUrl()
  );
  const [backendMode, setBackendMode] =
    useState<BackendConnectionMode>('checking');
  const [isScanning, setIsScanning] = useState<boolean>(false);

  // Instant-boot hydration with verified SPHEREx QR2 target
  const [scanData, setScanData] = useState<ScanResponse>(() =>
    buildFallbackScan(
      initial.current.ra,
      initial.current.dec,
      initial.current.fov,
      true
    )
  );
  const [datacube, setDatacube] = useState<DatacubeResponse>(() =>
    buildFallbackDatacube(
      initial.current.ra,
      initial.current.dec,
      initial.current.fov,
      true
    )
  );

  const [scanHistory, setScanHistory] = useState<ScanHistoryEntry[]>(() =>
    loadScanHistory()
  );
  const [isHistoryOpen, setIsHistoryOpen] = useState<boolean>(false);

  const [tourState, setTourState] = useState<TourUiState>(() => {
    if (typeof window === 'undefined') return 'hidden';
    try {
      return window.localStorage.getItem(TOUR_STORAGE_KEY)
        ? 'hidden'
        : 'welcome';
    } catch {
      return 'welcome';
    }
  });
  const [tourStep, setTourStep] = useState<number>(0);

  const abortControllerRef = useRef<AbortController | null>(null);
  const healthAbortRef = useRef<AbortController | null>(null);

  // Sync ?ra=...&dec=...&fov=... with browser URL query string
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    params.set('ra', ra.toFixed(5));
    params.set('dec', dec.toFixed(5));
    params.set('fov', fov.toString());
    const nextUrl = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState(null, '', nextUrl);
  }, [ra, dec, fov]);

  const appendHistoryEntry = useCallback(
    (payload: ScanResponse, targetFov: number) => {
      const entry: ScanHistoryEntry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        timestamp: new Date().toISOString(),
        status: payload.status,
        fov_deg: targetFov,
        coordinates: payload.coordinates,
        ai_verdicts: payload.ai_verdicts,
        gemini_copilot_summary: payload.gemini_copilot_summary,
        wavelengths: payload.wavelengths,
        raw_spectrum: payload.raw_spectrum,
        visual_assets: payload.visual_assets,
      };
      setScanHistory((prev) => {
        const duplicateTop =
          prev[0] &&
          Math.abs(prev[0].coordinates.ra - payload.coordinates.ra) < 1e-4 &&
          Math.abs(prev[0].coordinates.dec - payload.coordinates.dec) < 1e-4 &&
          Math.abs(prev[0].fov_deg - targetFov) < 1e-3;
        if (duplicateTop) return prev;
        const updated = [entry, ...prev].slice(0, MAX_HISTORY_ENTRIES);
        persistScanHistory(updated);
        return updated;
      });
    },
    []
  );

  const pingBackendHealth = useCallback(async (endpoint: string) => {
    const baseUrl = normalizeBackendUrl(endpoint);
    if (healthAbortRef.current) {
      healthAbortRef.current.abort();
    }
    const controller = new AbortController();
    healthAbortRef.current = controller;
    const timeoutId = window.setTimeout(() => controller.abort(), 15000);

    try {
      const resp = await fetch(`${baseUrl}/health`, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      window.clearTimeout(timeoutId);
      if (healthAbortRef.current !== controller) return false;
      if (resp.ok) {
        setBackendMode('connected');
        return true;
      }
      setBackendMode((prev) => (prev === 'connected' ? 'connected' : 'offline'));
      return false;
    } catch {
      window.clearTimeout(timeoutId);
      if (healthAbortRef.current !== controller) return false;
      setBackendMode((prev) => (prev === 'connected' ? 'connected' : 'offline'));
      return false;
    }
  }, []);

  const fetchTargetTelemetry = useCallback(
    async (
      targetRa: number,
      targetDec: number,
      targetFov: number,
      stacked: boolean,
      endpoint: string,
      recordHistory: boolean
    ) => {
      const baseUrl = normalizeBackendUrl(endpoint);
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const controller = new AbortController();
      abortControllerRef.current = controller;

      const fallbackScan = buildFallbackScan(
        targetRa,
        targetDec,
        targetFov,
        stacked
      );
      const fallbackCube = buildFallbackDatacube(
        targetRa,
        targetDec,
        targetFov,
        stacked
      );
      setScanData(fallbackScan);
      setDatacube(fallbackCube);
      setIsScanning(true);
      setBackendMode((prev) => (prev === 'connected' ? 'connected' : 'checking'));

      const qs = `ra=${encodeURIComponent(targetRa.toFixed(6))}&dec=${encodeURIComponent(
        targetDec.toFixed(6)
      )}&fov=${encodeURIComponent(targetFov.toString())}`;

      // 30-second timeout for Cloud Run cold start + 2040x2040 SPHEREx AWS S3 FITS + PyTorch inference
      const timeoutId = window.setTimeout(() => controller.abort(), 30000);

      try {
        const [scanResp, cubeResp] = await Promise.all([
          fetch(`${baseUrl}/api/scan?${qs}`, {
            signal: controller.signal,
            headers: { Accept: 'application/json' },
          }),
          fetch(`${baseUrl}/api/datacube?${qs}`, {
            signal: controller.signal,
            headers: { Accept: 'application/json' },
          }).catch(() => null),
        ]);

        window.clearTimeout(timeoutId);
        if (abortControllerRef.current !== controller) return;

        if (!scanResp.ok) {
          throw new Error(`HTTP ${scanResp.status}`);
        }
        const liveScan = (await scanResp.json()) as ScanResponse;
        if (liveScan?.coordinates && liveScan?.ai_verdicts) {
          setScanData(liveScan);
          setBackendMode('connected');
          if (recordHistory) {
            appendHistoryEntry(liveScan, targetFov);
          }
        } else {
          setBackendMode((prev) => (prev === 'connected' ? 'connected' : 'offline'));
        }

        if (cubeResp && cubeResp.ok) {
          const liveCube = (await cubeResp.json()) as DatacubeResponse;
          if (liveCube?.volume_data?.length && liveCube?.wavelengths?.length) {
            setDatacube(liveCube);
          }
        }
      } catch {
        window.clearTimeout(timeoutId);
        if (abortControllerRef.current !== controller) return;
        setBackendMode('offline');
        if (recordHistory) {
          appendHistoryEntry(fallbackScan, targetFov);
        }
      } finally {
        if (abortControllerRef.current === controller) {
          setIsScanning(false);
        }
      }
    },
    [appendHistoryEntry]
  );

  // Automatic /health ping & initial live telemetry scan on mount
  useEffect(() => {
    void pingBackendHealth(backendUrl);
    void fetchTargetTelemetry(
      initial.current.ra,
      initial.current.dec,
      initial.current.fov,
      true,
      backendUrl,
      false
    );
    return () => {
      healthAbortRef.current?.abort();
      abortControllerRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelectTarget = useCallback(
    (nextRa: number, nextDec: number) => {
      setRa(nextRa);
      setDec(nextDec);
      void fetchTargetTelemetry(
        nextRa,
        nextDec,
        fov,
        stacked6Array,
        backendUrl,
        true
      );
    },
    [fov, stacked6Array, backendUrl, fetchTargetTelemetry]
  );

  const handleSelectFov = useCallback(
    (nextFov: number) => {
      setFov(nextFov);
      void fetchTargetTelemetry(
        ra,
        dec,
        nextFov,
        stacked6Array,
        backendUrl,
        false
      );
    },
    [ra, dec, stacked6Array, backendUrl, fetchTargetTelemetry]
  );

  const handleToggleStack6 = useCallback(
    (nextStacked: boolean) => {
      setStacked6Array(nextStacked);
      if (backendMode !== 'connected') {
        setScanData(buildFallbackScan(ra, dec, fov, nextStacked));
        setDatacube(buildFallbackDatacube(ra, dec, fov, nextStacked));
      }
    },
    [backendMode, ra, dec, fov]
  );

  const handleUpdateBackendUrl = useCallback(
    (nextUrl: string) => {
      const normalized = normalizeBackendUrl(nextUrl);
      setBackendUrl(normalized);
      setBackendMode('checking');
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(BACKEND_URL_STORAGE_KEY, normalized);
      }
      void pingBackendHealth(normalized);
      void fetchTargetTelemetry(ra, dec, fov, stacked6Array, normalized, true);
    },
    [ra, dec, fov, stacked6Array, pingBackendHealth, fetchTargetTelemetry]
  );

  const handleExportJson = useCallback(
    (target?: ScanResponse | ScanHistoryEntry) => {
      const source = target ?? scanData;
      const raStr = source.coordinates.ra.toFixed(4);
      const decStr = source.coordinates.dec.toFixed(4);
      triggerJsonDownload(`space-max-0-RA${raStr}-DEC${decStr}.json`, {
        portal: 'Space-Max 0: SPHEREx & Planet X Discovery Engine',
        exported_at: new Date().toISOString(),
        fov_deg: fov,
        status: source.status,
        coordinates: source.coordinates,
        ai_verdicts: source.ai_verdicts,
        wavelengths: source.wavelengths,
        raw_spectrum: source.raw_spectrum,
        gemini_copilot_summary: source.gemini_copilot_summary,
      });
    },
    [scanData, fov]
  );

  const handleLoadHistoryEntry = useCallback((entry: ScanHistoryEntry) => {
    setRa(entry.coordinates.ra);
    setDec(entry.coordinates.dec);
    setFov(entry.fov_deg || DEFAULT_FOV);
    setScanData((prev) => ({
      ...prev,
      status: entry.status,
      fov_deg: entry.fov_deg,
      coordinates: entry.coordinates,
      ai_verdicts: entry.ai_verdicts,
      gemini_copilot_summary: entry.gemini_copilot_summary,
      wavelengths:
        entry.wavelengths && entry.wavelengths.length > 0
          ? entry.wavelengths
          : prev.wavelengths,
      raw_spectrum:
        entry.raw_spectrum && entry.raw_spectrum.length > 0
          ? entry.raw_spectrum
          : prev.raw_spectrum,
      visual_assets: entry.visual_assets?.present_frame_base64
        ? entry.visual_assets
        : prev.visual_assets,
    }));
    setDatacube(
      buildFallbackDatacube(
        entry.coordinates.ra,
        entry.coordinates.dec,
        entry.fov_deg || DEFAULT_FOV,
        true
      )
    );
    setIsHistoryOpen(false);
  }, []);

  const handleClearHistory = useCallback(() => {
    setScanHistory([]);
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(SCAN_HISTORY_STORAGE_KEY);
    }
  }, []);

  const markTourSeen = useCallback(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(TOUR_STORAGE_KEY, '1');
    } catch {
      // Ignore storage restrictions in embedded sandboxes
    }
  }, []);

  const handleStartTour = useCallback(() => {
    setTourStep(0);
    setTourState('active');
  }, []);

  const handleSkipTour = useCallback(() => {
    markTourSeen();
    setTourState('hidden');
  }, [markTourSeen]);

  const handleFinishTour = useCallback(() => {
    markTourSeen();
    setTourState('hidden');
    setTourStep(0);
  }, [markTourSeen]);

  const matchedPreset = findClosestPreset(
    scanData.coordinates.ra,
    scanData.coordinates.dec
  );
  const gaiaMatched =
    scanData.source_detection?.crossmatch_mode === 'GAIA_DR3_CATALOG_MATCH' ||
    Boolean(matchedPreset?.gaiaMatched);

  const activeWavelength = useMemo(() => {
    const arr = datacube.wavelengths.length
      ? datacube.wavelengths
      : scanData.wavelengths;
    if (!arr.length) return undefined;
    const clamped = Math.max(0, Math.min(arr.length - 1, sliceIndex));
    return arr[clamped];
  }, [datacube.wavelengths, scanData.wavelengths, sliceIndex]);

  return (
    <div className="flex min-h-screen flex-col bg-[#060913] text-slate-100">
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(34,211,238,0.08),transparent_60%)]"
      />

      {/* Top Command & Coordinate Bar */}
      <TopNavBar
        ra={ra}
        dec={dec}
        fov={fov}
        isScanning={isScanning}
        backendMode={backendMode}
        backendUrl={backendUrl}
        historyCount={scanHistory.length}
        onSelectTarget={handleSelectTarget}
        onSelectFov={handleSelectFov}
        onUpdateBackendUrl={handleUpdateBackendUrl}
        onOpenHistory={() => setIsHistoryOpen(true)}
        onExportJson={() => handleExportJson(scanData)}
        onStartTour={handleStartTour}
      />

      {/* 3-Column Bento Workspace */}
      <main className="relative z-10 mx-auto grid w-full max-w-[1680px] flex-1 grid-cols-1 gap-4 p-4 lg:grid-cols-12 lg:p-6">
        {/* Left Column (5 Cols): Step 1: Spot the Moving Object! */}
        <SkyViewport
          coordinates={scanData.coordinates}
          fov={fov}
          pastFrameBase64={scanData.visual_assets.past_frame_base64}
          presentFrameBase64={scanData.visual_assets.present_frame_base64}
          stacked6Array={stacked6Array}
          gaiaMatched={gaiaMatched}
          onToggleStack6={handleToggleStack6}
        />

        {/* Center Column (4 Cols): Step 2: 3D Light Cube & Rainbow Fingerprint */}
        <section
          aria-label="Step 2: 3D Light Cube and Rainbow Fingerprint"
          className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-800/80 bg-slate-900/60 p-4 backdrop-blur-md lg:col-span-4"
        >
          <div>
            <h2 className="text-sm font-bold text-white">
              Step 2: 3D Light Cube &amp; Rainbow Fingerprint
            </h2>
            <p className="text-[11px] text-slate-400">
              Slice 102 invisible infrared colors to spot water &amp; methane clouds
            </p>
          </div>

          <WebGLDataCube3D
            datacube={datacube}
            sliceIndex={sliceIndex}
            onSliceIndexChange={setSliceIndex}
          />

          <SpectralChart
            wavelengths={scanData.wavelengths}
            rawSpectrum={scanData.raw_spectrum}
            rnnClassification={scanData.ai_verdicts.rnn_classification}
            activeWavelength={activeWavelength}
          />
        </section>

        {/* Right Column (3 Cols): Visual AI Diagnostics & RLHF Citizen Science */}
        <DiagnosticsCopilotPanel
          coordinates={scanData.coordinates}
          aiVerdicts={scanData.ai_verdicts}
          gaiaMatched={gaiaMatched}
          copilotSummary={scanData.gemini_copilot_summary}
          backendUrl={backendUrl}
        />
      </main>

      {/* Scan History Modal */}
      <ScanHistoryModal
        isOpen={isHistoryOpen}
        entries={scanHistory}
        onClose={() => setIsHistoryOpen(false)}
        onLoadEntry={handleLoadHistoryEntry}
        onExportEntry={handleExportJson}
        onClearHistory={handleClearHistory}
      />

      {/* Interactive 4-Step Spotlight Guided User Flow */}
      <GuidedMissionTour
        tourState={tourState}
        activeStep={tourStep}
        onStartTour={handleStartTour}
        onSkipTour={handleSkipTour}
        onStepChange={setTourStep}
        onFinishTour={handleFinishTour}
      />
    </div>
  );
}
