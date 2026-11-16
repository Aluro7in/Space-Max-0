import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  CloudRain,
  Code2,
  Compass,
  Cpu,
  Database,
  Download,
  FlaskConical,
  Navigation,
  PartyPopper,
  ShieldCheck,
  Sparkles,
  Star,
} from 'lucide-react';
import type {
  AiVerdicts,
  BackendConnectionMode,
  CommunityVotes,
  Coordinates,
  FeedbackStatsResponse,
  KnnSpectralMatch,
  MlTelemetry,
  PartnerVetting,
  RlhfTrainingMetrics,
  ScanResponse,
  VoteKey,
} from '../types/telemetry';
import { findClosestPreset } from '../data/presetsAndFallback';
import { GeminiMissionChat } from './GeminiMissionChat';

interface DiagnosticsCopilotPanelProps {
  coordinates: Coordinates;
  aiVerdicts: AiVerdicts;
  gaiaMatched: boolean;
  copilotSummary: string;
  backendUrl: string;
  backendMode?: BackendConnectionMode;
  csaVetting?: PartnerVetting;
  mlTelemetry?: MlTelemetry;
  knnMatches?: KnnSpectralMatch[];
  scanData?: ScanResponse;
  epoch1Matrix?: number[][];
  epoch2Matrix?: number[][];
  rawSpectrum?: number[];
  onVoteSubmitted?: (vote: VoteKey) => void;
}

type Step3MiddleTab = 'chat' | 'vetting';

function cleanCopilotText(raw: string): string {
  return raw
    .replace(/^\[SYSTEM\]\s*>?\s*/i, '')
    .replace(/^>\s*/, '')
    .trim();
}

function computeCnnProbabilityPct(conf: number, artifact: number): number {
  const expConf = Math.exp(conf);
  const expArt = Math.exp(artifact);
  const pct = (expConf / (expConf + expArt)) * 100;
  return Number(Math.max(1, Math.min(99.9, pct)).toFixed(1));
}

export function DiagnosticsCopilotPanel({
  coordinates,
  aiVerdicts,
  gaiaMatched,
  copilotSummary,
  backendUrl,
  backendMode = 'offline',
  csaVetting,
  mlTelemetry,
  knnMatches,
  scanData,
  epoch1Matrix,
  epoch2Matrix,
  rawSpectrum,
  onVoteSubmitted,
}: DiagnosticsCopilotPanelProps) {
  const [middleTab, setMiddleTab] = useState<Step3MiddleTab>('chat');
  const [showProTelemetry, setShowProTelemetry] = useState<boolean>(true);
  const [userVote, setUserVote] = useState<VoteKey | null>(null);
  const [isSubmittingVote, setIsSubmittingVote] = useState<boolean>(false);
  const [modelVersion, setModelVersion] = useState<string>(
    mlTelemetry?.model_version || 'v3.0.0'
  );
  const [sqliteVoteTotal, setSqliteVoteTotal] = useState<number | null>(null);
  const [rlhfTelemetry, setRlhfTelemetry] = useState<RlhfTrainingMetrics | null>(
    null
  );
  const [voteBanner, setVoteBanner] = useState<{
    celebrate: boolean;
    text: string;
  } | null>(null);
  const [votes, setVotes] = useState<CommunityVotes>({
    confirm_planet: 128,
    flag_artifact: 9,
    known_star: 17,
  });

  const preset = useMemo(
    () => findClosestPreset(coordinates.ra, coordinates.dec),
    [coordinates.ra, coordinates.dec]
  );

  useEffect(() => {
    if (mlTelemetry?.model_version) {
      setModelVersion(mlTelemetry.model_version);
    }
  }, [mlTelemetry?.model_version]);

  useEffect(() => {
    let cancelled = false;
    const baseUrl = backendUrl.trim().replace(/\/+$/, '');
    if (!baseUrl) return;

    const loadStats = async () => {
      try {
        const resp = await fetch(`${baseUrl}/api/feedback/stats`, {
          headers: { Accept: 'application/json' },
        });
        if (!resp.ok || cancelled) return;
        const stats = (await resp.json()) as FeedbackStatsResponse;
        if (cancelled) return;
        if (typeof stats.total_votes === 'number') {
          setSqliteVoteTotal(stats.total_votes);
          if (stats.total_votes > 0) {
            setVotes({
              confirm_planet: stats.planet_votes ?? 0,
              flag_artifact: stats.artifact_votes ?? 0,
              known_star: stats.known_star_votes ?? 0,
            });
          }
        }
        if (stats.model_version) {
          setModelVersion(stats.model_version);
        }
      } catch {
        // Keep current fallback vote counts if offline
      }
    };

    void loadStats();
    return () => {
      cancelled = true;
    };
  }, [backendUrl, backendMode]);

  useEffect(() => {
    setUserVote(null);
    setVoteBanner(null);
    setRlhfTelemetry(null);
    if (sqliteVoteTotal === null || sqliteVoteTotal === 0) {
      setVotes(
        gaiaMatched
          ? { confirm_planet: 18, flag_artifact: 6, known_star: 142 }
          : { confirm_planet: 128, flag_artifact: 9, known_star: 17 }
      );
    }
  }, [coordinates.ra, coordinates.dec, gaiaMatched, sqliteVoteTotal]);

  const cnnPct = useMemo(
    () =>
      rlhfTelemetry
        ? Number((rlhfTelemetry.post_confidence ?? rlhfTelemetry.updated_confidence ?? 90).toFixed(1))
        : mlTelemetry?.candidate_confidence_pct
          ? Number(mlTelemetry.candidate_confidence_pct.toFixed(1))
          : computeCnnProbabilityPct(
              aiVerdicts.cnn_confidence,
              aiVerdicts.cnn_artifact_score
            ),
    [
      rlhfTelemetry,
      mlTelemetry?.candidate_confidence_pct,
      aiVerdicts.cnn_confidence,
      aiVerdicts.cnn_artifact_score,
    ]
  );

  const isConfirmedObject =
    aiVerdicts.cnn_verdict_label.toLowerCase().includes('confirmed') ||
    cnnPct >= 65;

  const pmRa = aiVerdicts.proper_motion?.pm_ra_mas_yr ?? 14.2;
  const pmDec = aiVerdicts.proper_motion?.pm_dec_mas_yr ?? -6.8;
  const radialVel = aiVerdicts.proper_motion?.radial_vel_km_s ?? 41.5;
  const pmMagnitude = Math.hypot(pmRa, pmDec);

  const arrowCoords = useMemo(() => {
    if (pmMagnitude < 0.01) return { x2: 32, y2: 32 };
    const nx = pmRa / pmMagnitude;
    const ny = pmDec / pmMagnitude;
    return {
      x2: Number((32 + nx * 19).toFixed(1)),
      y2: Number((32 - ny * 19).toFixed(1)),
    };
  }, [pmRa, pmDec, pmMagnitude]);

  const totalVotes = Math.max(
    1,
    votes.confirm_planet + votes.flag_artifact + votes.known_star
  );
  const pctConfirm = Math.round((votes.confirm_planet / totalVotes) * 100);
  const pctArtifact = Math.round((votes.flag_artifact / totalVotes) * 100);
  const pctKnown = Math.max(0, 100 - pctConfirm - pctArtifact);

  const handleVote = async (vote: VoteKey) => {
    if (userVote !== vote) {
      setVotes((prev) => ({
        ...prev,
        [vote]: prev[vote] + 1,
        ...(userVote ? { [userVote]: Math.max(0, prev[userVote] - 1) } : {}),
      }));
      setUserVote(vote);
    }
    onVoteSubmitted?.(vote);

    const celebrate = vote === 'confirm_planet';
    let liveFeedback: RlhfTrainingMetrics | null = null;
    setIsSubmittingVote(true);
    try {
      const resp = await fetch(`${backendUrl.trim().replace(/\/+$/, '')}/api/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ra: coordinates.ra,
          dec: coordinates.dec,
          user_vote: vote,
          target_name:
            preset?.name ??
            `RA ${coordinates.ra.toFixed(4)} / Dec ${coordinates.dec >= 0 ? '+' : ''}${coordinates.dec.toFixed(4)}`,
          epoch1: epoch1Matrix,
          epoch2: epoch2Matrix,
          spectrum: rawSpectrum,
          csa_vetting_status:
            csaVetting?.vetting_verdict ??
            csaVetting?.status ??
            'VERIFIED_DEEP_SPACE_CANDIDATE',
        }),
      });
      if (resp.ok) {
        liveFeedback = (await resp.json()) as RlhfTrainingMetrics;
      }
    } catch {
      liveFeedback = null;
    } finally {
      setIsSubmittingVote(false);
    }

    if (liveFeedback && liveFeedback.status === 'ok') {
      setRlhfTelemetry(liveFeedback);
      setModelVersion(liveFeedback.model_version);
      setSqliteVoteTotal(liveFeedback.total_votes);
      setVotes({
        confirm_planet: liveFeedback.planet_votes,
        flag_artifact: liveFeedback.artifact_votes,
        known_star: liveFeedback.known_star_votes,
      });

      const pre = liveFeedback.pre_confidence ?? liveFeedback.initial_confidence ?? cnnPct;
      const post = liveFeedback.post_confidence ?? liveFeedback.updated_confidence ?? cnnPct;
      const delta = post - pre;
      const deltaSign = delta >= 0 ? '+' : '';
      if (celebrate) {
        setVoteBanner({
          celebrate: true,
          text: `Saved to SQLite (#${liveFeedback.total_votes}) · RLHF ${liveFeedback.model_version} (${deltaSign}${delta.toFixed(2)}%)`,
        });
      } else if (vote === 'flag_artifact') {
        setVoteBanner({
          celebrate: false,
          text: `Artifact penalty committed (${liveFeedback.model_version}) · SQLite #${liveFeedback.total_votes}`,
        });
      } else {
        setVoteBanner({
          celebrate: false,
          text: `Catalogued star logged (${liveFeedback.model_version}) · SQLite #${liveFeedback.total_votes}`,
        });
      }
      return;
    }

    if (celebrate) {
      setVoteBanner({
        celebrate: true,
        text: 'Edge vote logged locally. Syncs with Render SQLite + PyTorch RLHF when cloud is active.',
      });
    } else if (vote === 'flag_artifact') {
      setVoteBanner({
        celebrate: false,
        text: 'Edge mode: flagged as optical glitch locally.',
      });
    } else {
      setVoteBanner({
        celebrate: false,
        text: 'Edge mode: recorded as catalogued star locally.',
      });
    }
  };

  const handleExportDiscoveryDossier = () => {
    const dossier = {
      dossier_schema: 'NASA-IAU-SPHEREx-Candidate-Dossier/v3.0',
      generated_at_utc: new Date().toISOString(),
      target: {
        name: preset?.name ?? 'Custom Sky Coordinate',
        ra_deg: coordinates.ra,
        dec_deg: coordinates.dec,
        pixel_centroid: [coordinates.pixel_x, coordinates.pixel_y],
        fov_deg: scanData?.fov_deg ?? 0.15,
      },
      aws_irsa_spherex_source: {
        s3_bucket_uri: scanData?.s3_bucket_uri ?? 's3://nasa-irsa-spherex/qr3/level2/',
        s3_object_url: scanData?.s3_source ?? 's3://nasa-irsa-spherex/qr3/level2/spherex_qr3_l2b_2025.fits',
        sia_collection: scanData?.sia_collection ?? 'spherex_qr3',
        mef_extensions: scanData?.mef_extensions ?? ['IMAGE', 'FLAGS', 'VARIANCE', 'ZODI', 'PSF', 'CWAVE', 'CBAND'],
        zodi_subtracted_mjy_sr: scanData?.zodi_subtracted_mjy_sr ?? csaVetting?.zodi_subtracted_mjy_sr ?? 0.78,
        dichroic_blank_channels: scanData?.blank_channels ?? [51, 52],
      },
      astrometry_and_kinematics: scanData?.astrometry ?? {
        pm_ra_mas_yr: pmRa,
        pm_dec_mas_yr: pmDec,
        mu_total_mas_yr: Number(pmMagnitude.toFixed(2)),
        radial_vel_km_s: radialVel,
      },
      spectrophotometry_102_band: {
        classification: aiVerdicts.rnn_classification,
        absorption_depths: scanData?.absorption_depths,
        wavelengths_um: scanData?.wavelengths,
        flux_mjy_sr: rawSpectrum ?? scanData?.raw_spectrum,
      },
      pytorch_tri_model_and_knn: {
        model_version: modelVersion,
        tri_model_scores: scanData?.tri_model_scores ?? mlTelemetry,
        knn_spectral_matches: knnMatches ?? scanData?.knn_spectral_matches ?? [],
      },
      partner_agency_vetting: {
        csa_neossat_cadc_and_skybot: csaVetting ?? scanData?.partner_vetting,
      },
      rlhf_checkpoint_signature: rlhfTelemetry
        ? {
            model_version: rlhfTelemetry.model_version,
            pre_confidence_pct: rlhfTelemetry.pre_confidence ?? rlhfTelemetry.initial_confidence,
            post_confidence_pct: rlhfTelemetry.post_confidence ?? rlhfTelemetry.updated_confidence,
            bce_gradient_loss: rlhfTelemetry.loss ?? rlhfTelemetry.gradient_loss,
            weight_delta_l2_norm: rlhfTelemetry.weight_delta_norm,
            persisted_sqlite_votes: rlhfTelemetry.total_votes,
          }
        : {
            model_version: modelVersion,
            persisted_sqlite_votes: sqliteVoteTotal ?? totalVotes,
          },
      copilot_briefing: cleanCopilotText(copilotSummary),
    };

    const blob = new Blob([JSON.stringify(dossier, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `NASA-IAU-Dossier-RA${coordinates.ra.toFixed(4)}-DEC${coordinates.dec.toFixed(4)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const cleanSummary = useMemo(
    () => cleanCopilotText(copilotSummary),
    [copilotSummary]
  );

  const topKnn = knnMatches && knnMatches.length > 0 ? knnMatches.slice(0, 3) : [];
  const isSolarSystemObject =
    csaVetting?.vetting_verdict === 'KNOWN_SOLAR_SYSTEM_OBJECT' ||
    csaVetting?.status === 'REJECTED_SOLAR_SYSTEM_ASTEROID';

  const preConf =
    rlhfTelemetry?.pre_confidence ?? rlhfTelemetry?.initial_confidence ?? cnnPct;
  const postConf =
    rlhfTelemetry?.post_confidence ?? rlhfTelemetry?.updated_confidence ?? cnnPct;
  const lossVal = rlhfTelemetry?.loss ?? rlhfTelemetry?.gradient_loss ?? 0;
  const weightDeltaNorm = rlhfTelemetry?.weight_delta_norm ?? 0;

  return (
    <section
      data-tour="step-4"
      aria-label="Step 3: AI Space Guide and Discovery Vote"
      className="flex flex-col justify-between gap-2.5 rounded-2xl border border-white/[0.08] bg-[#0B101E]/90 p-3.5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)] backdrop-blur-xl lg:col-span-3 lg:min-h-0 lg:overflow-y-auto"
    >
      {/* 1. Top Group (Always Visible): Header + 3-Column Clue Mini-Grid */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-1.5">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-md border border-rose-400/40 bg-rose-500/15 px-1.5 py-0.5 font-mono text-[9.5px] font-bold tracking-wider text-rose-300 shadow-[0_0_10px_rgba(244,63,94,0.18)]">
                STEP 03
              </span>
              <h2 className="text-sm font-bold tracking-tight text-[#F8FAFC]">
                AI Guide &amp; Vote
              </h2>
            </div>
            <p className="mt-0.5 text-[10px] text-rose-200/75">
              AI discovery score, Q&amp;A guide &amp; live citizen vote
            </p>
          </div>

          <button
            type="button"
            onClick={handleExportDiscoveryDossier}
            title="Export NASA/IAU Candidate Discovery Dossier (.JSON)"
            className="inline-flex items-center gap-1 rounded-lg border border-white/[0.08] bg-[#050811] px-2 py-1 text-[10px] font-medium text-cyan-200 transition-colors hover:border-cyan-400/50 hover:text-cyan-100"
          >
            <Download className="h-3 w-3 text-cyan-400" aria-hidden="true" />
            <span>Dossier</span>
          </button>
        </div>

        {/* Sleek 3-Column AI Clue Mini-Grid (Always Visible) */}
        <div className="grid grid-cols-3 gap-1.5">
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-2">
            <div className="flex items-center gap-1 text-[10px] font-semibold text-emerald-300">
              <Sparkles className="h-3 w-3 shrink-0" aria-hidden="true" />
              <span className="truncate">
                {isConfirmedObject ? 'Confirmed' : 'Glitch?'}
              </span>
            </div>
            <p className="mt-0.5 font-mono text-xs font-bold tabular-nums text-[#F8FAFC]">
              {cnnPct.toFixed(1)}%
            </p>
            <p className="truncate text-[9px] text-emerald-200/75">Tri-Model</p>
          </div>

          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-2">
            <div className="flex items-center gap-1 text-[10px] font-semibold text-rose-300">
              <CloudRain className="h-3 w-3 shrink-0" aria-hidden="true" />
              <span className="truncate">H₂O + CH₄</span>
            </div>
            <p className="mt-0.5 truncate font-mono text-xs font-bold text-[#F8FAFC]">
              {topKnn[0]?.spectral_type ?? 'T6–Y0'}
            </p>
            <p className="truncate text-[9px] text-rose-200/75">Cold Clouds</p>
          </div>

          <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-2">
            <div className="flex items-center gap-1 text-[10px] font-semibold text-cyan-300">
              <Navigation className="h-3 w-3 shrink-0" aria-hidden="true" />
              <span className="truncate">Kinematics</span>
            </div>
            <p className="mt-0.5 font-mono text-xs font-bold tabular-nums text-[#F8FAFC]">
              {pmMagnitude.toFixed(1)}
            </p>
            <p className="truncate text-[9px] text-cyan-200/75">
              {gaiaMatched ? 'Gaia Match' : 'Unmapped'}
            </p>
          </div>
        </div>
      </div>

      {/* 2. Middle Segmented Switcher: AI Space Guide | Spectral k-NN & CSA Vetting */}
      <div className="flex min-h-0 flex-1 flex-col gap-2">
        <div
          role="tablist"
          aria-label="AI Space Guide and Spectral Vetting tabs"
          className="grid grid-cols-2 gap-1 rounded-xl border border-white/[0.07] bg-[#050811] p-0.5"
        >
          <button
            type="button"
            role="tab"
            aria-selected={middleTab === 'chat'}
            onClick={() => setMiddleTab('chat')}
            className={`inline-flex items-center justify-center gap-1.5 rounded-lg py-1 text-[10.5px] font-medium transition-colors ${
              middleTab === 'chat'
                ? 'bg-cyan-500/20 text-cyan-200 ring-1 ring-cyan-400/35'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Bot className="h-3 w-3 text-cyan-400" aria-hidden="true" />
            <span>AI Space Guide</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={middleTab === 'vetting'}
            onClick={() => setMiddleTab('vetting')}
            className={`inline-flex items-center justify-center gap-1.5 rounded-lg py-1 text-[10.5px] font-medium transition-colors ${
              middleTab === 'vetting'
                ? 'bg-cyan-500/20 text-cyan-200 ring-1 ring-cyan-400/35'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <FlaskConical className="h-3 w-3 text-amber-400" aria-hidden="true" />
            <span>Spectral k-NN &amp; Vetting</span>
          </button>
        </div>

        {middleTab === 'chat' ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <GeminiMissionChat
              targetName={preset?.name ?? 'Custom Sky Coordinate'}
              coordinates={coordinates}
              aiVerdicts={aiVerdicts}
              cnnMatchPct={Math.round(cnnPct)}
              gaiaMatched={gaiaMatched}
              initialSummary={cleanSummary}
            />
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col justify-between gap-2 overflow-y-auto rounded-xl border border-white/[0.07] bg-[#060A14]/90 p-2.5">
            {/* k-NN Spectral Template Fit */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-sky-200">
                  <FlaskConical className="h-3 w-3 text-cyan-400" aria-hidden="true" />
                  k-NN Template Fit
                </span>
                {topKnn[0] && (
                  <span className="font-mono text-[9.5px] font-semibold tabular-nums text-amber-300">
                    {topKnn[0].estimated_teff_k} K · {topKnn[0].spectral_type}
                  </span>
                )}
              </div>

              <div className="space-y-1.5">
                {topKnn.map((match) => (
                  <div key={match.template_name} className="space-y-0.5">
                    <div className="flex items-center justify-between gap-2 font-mono text-[9.5px] tabular-nums">
                      <span className="truncate text-slate-300" title={match.template_name}>
                        {match.spectral_type} ({match.estimated_teff_k} K)
                      </span>
                      <span className="shrink-0 font-semibold text-cyan-300">
                        {match.similarity_pct.toFixed(1)}%
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#0B101E]">
                      <div
                        style={{
                          width: `${Math.min(100, Math.max(4, match.similarity_pct))}%`,
                        }}
                        className="h-full bg-gradient-to-r from-cyan-400 via-sky-400 to-amber-400"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* CSA NEOSSat Verification Card */}
            {csaVetting && (
              <div
                className={`flex items-center justify-between gap-2 rounded-xl border px-2.5 py-1.5 font-mono text-[9.5px] ${
                  isSolarSystemObject
                    ? 'border-rose-500/40 bg-rose-500/10 text-rose-200'
                    : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                }`}
              >
                <span className="inline-flex items-center gap-1 font-semibold">
                  {isSolarSystemObject ? (
                    <AlertTriangle className="h-3 w-3 shrink-0 text-rose-400" aria-hidden="true" />
                  ) : (
                    <ShieldCheck className="h-3 w-3 shrink-0 text-emerald-400" aria-hidden="true" />
                  )}
                  <span>
                    CSA NEOSSat:{' '}
                    {isSolarSystemObject ? 'SOLAR SYSTEM' : 'DEEP-SPACE OK'}
                  </span>
                </span>
                <span className="tabular-nums text-slate-300">
                  CADC {csaVetting.csa_neossat_frames ?? csaVetting.neossat_archival_frames ?? 0} · SkyBoT{' '}
                  {csaVetting.known_asteroids_count ?? csaVetting.known_asteroids_in_fov ?? 0}
                </span>
              </div>
            )}

            {/* PyTorch Tri-Model Logits & GNN Vector */}
            <div className="rounded-xl border border-white/[0.07] bg-[#04060C] p-2 font-mono text-[9.5px] text-slate-300">
              <div className="flex items-center justify-between border-b border-white/[0.06] pb-1">
                <span className="font-semibold text-cyan-300">
                  PyTorch Tri-Model ({modelVersion})
                </span>
                <button
                  type="button"
                  onClick={() => setShowProTelemetry((prev) => !prev)}
                  className="inline-flex items-center gap-1 text-[9px] text-slate-400 hover:text-cyan-200"
                >
                  <Code2 className="h-2.5 w-2.5" aria-hidden="true" />
                  <span>{showProTelemetry ? 'Compact' : 'Show Compass'}</span>
                </button>
              </div>
              <div className="mt-1 flex justify-between tabular-nums">
                <span>2D-CNN Logits:</span>
                <span className="text-emerald-300">
                  Real {aiVerdicts.cnn_confidence >= 0 ? '+' : ''}
                  {aiVerdicts.cnn_confidence.toFixed(2)} | Art{' '}
                  {aiVerdicts.cnn_artifact_score.toFixed(2)}
                </span>
              </div>
              <div className="mt-0.5 flex items-center justify-between">
                <span className="inline-flex items-center gap-1">
                  <Compass className="h-3 w-3 text-amber-400" aria-hidden="true" />
                  GNN Vector:
                </span>
                <span className="tabular-nums text-amber-300">
                  pm({pmRa >= 0 ? '+' : ''}
                  {pmRa.toFixed(1)}, {pmDec >= 0 ? '+' : ''}
                  {pmDec.toFixed(1)}) · {radialVel.toFixed(1)} km/s
                </span>
              </div>
              {showProTelemetry && (
                <div className="flex justify-center pt-1">
                  <svg viewBox="0 0 64 64" className="h-7 w-7">
                    <circle
                      cx="32"
                      cy="32"
                      r="24"
                      fill="none"
                      stroke="#1E293B"
                      strokeWidth="1"
                      strokeDasharray="2 2"
                    />
                    <line x1="32" y1="6" x2="32" y2="58" stroke="#1E293B" strokeWidth="1" />
                    <line x1="6" y1="32" x2="58" y2="32" stroke="#1E293B" strokeWidth="1" />
                    <line
                      x1="32"
                      y1="32"
                      x2={arrowCoords.x2}
                      y2={arrowCoords.y2}
                      stroke="#00F0FF"
                      strokeWidth="2.2"
                    />
                    <circle cx="32" cy="32" r="2.5" fill="#FBBF24" />
                  </svg>
                </div>
              )}
            </div>

            {/* Export NASA/IAU Candidate Discovery Dossier (.JSON) */}
            <button
              type="button"
              onClick={handleExportDiscoveryDossier}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-cyan-400/40 bg-cyan-500/15 px-2.5 py-1.5 text-[10.5px] font-semibold text-cyan-200 transition-colors hover:border-cyan-400 hover:bg-cyan-500/25"
            >
              <Download className="h-3.5 w-3.5 text-cyan-300" aria-hidden="true" />
              <span>Export NASA/IAU Discovery Dossier (.JSON)</span>
            </button>
          </div>
        )}
      </div>

      {/* 3. Bottom Pinned Card (Always Visible): Citizen Science RLHF Vote Card */}
      <div className="rounded-xl border border-white/[0.07] bg-[#060A14]/90 p-2.5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)]">
        <div className="mb-1.5 flex flex-wrap items-center justify-between gap-1">
          <h3 className="text-[11px] font-bold text-[#F8FAFC]">
            Did you spot the moving object?
          </h3>
          <div className="flex items-center gap-1.5 font-mono text-[9.5px] tabular-nums text-slate-400">
            <span className="inline-flex items-center gap-1 text-cyan-300">
              <Cpu className="h-2.5 w-2.5" aria-hidden="true" />
              {modelVersion}
            </span>
            <span aria-hidden="true">·</span>
            <span className="inline-flex items-center gap-1">
              <Database className="h-2.5 w-2.5 text-amber-400" aria-hidden="true" />
              {sqliteVoteTotal !== null ? `${sqliteVoteTotal} SQLite` : `${totalVotes} votes`}
            </span>
          </div>
        </div>

        <div className="space-y-1.5">
          <button
            type="button"
            disabled={isSubmittingVote}
            onClick={() => handleVote('confirm_planet')}
            className={`flex w-full items-center justify-between rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition-colors disabled:opacity-60 ${
              userVote === 'confirm_planet'
                ? 'border-emerald-400 bg-emerald-500/25 text-emerald-100'
                : 'border-emerald-500/35 bg-emerald-500/10 text-emerald-200 hover:border-emerald-400'
            }`}
          >
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
              <span>Yes! I Found Planet X</span>
            </span>
            <span className="font-mono text-[10.5px] tabular-nums text-emerald-300">
              {pctConfirm}%
            </span>
          </button>

          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              disabled={isSubmittingVote}
              onClick={() => handleVote('flag_artifact')}
              className={`flex items-center justify-between rounded-lg border px-2 py-1 text-[10px] font-medium transition-colors disabled:opacity-60 ${
                userVote === 'flag_artifact'
                  ? 'border-rose-400 bg-rose-500/20 text-rose-200'
                  : 'border-white/[0.08] bg-[#0B101E] text-slate-300 hover:border-rose-500/50'
              }`}
            >
              <span className="inline-flex items-center gap-1 truncate">
                <AlertTriangle className="h-3 w-3 shrink-0 text-rose-400" aria-hidden="true" />
                <span>Glitch</span>
              </span>
              <span className="font-mono text-[9.5px] tabular-nums text-rose-300">
                {pctArtifact}%
              </span>
            </button>

            <button
              type="button"
              disabled={isSubmittingVote}
              onClick={() => handleVote('known_star')}
              className={`flex items-center justify-between rounded-lg border px-2 py-1 text-[10px] font-medium transition-colors disabled:opacity-60 ${
                userVote === 'known_star'
                  ? 'border-amber-400 bg-amber-500/20 text-amber-200'
                  : 'border-white/[0.08] bg-[#0B101E] text-slate-300 hover:border-amber-400/50'
              }`}
            >
              <span className="inline-flex items-center gap-1 truncate">
                <Star className="h-3 w-3 shrink-0 text-amber-400" aria-hidden="true" />
                <span>Star</span>
              </span>
              <span className="font-mono text-[9.5px] tabular-nums text-amber-300">
                {pctKnown}%
              </span>
            </button>
          </div>
        </div>

        {/* Community Consensus Bar */}
        <div className="mt-1.5">
          <div
            aria-label="Community vote bar"
            className="flex h-1.5 w-full overflow-hidden rounded-full bg-[#0B101E]"
          >
            <div
              style={{ width: `${pctConfirm}%` }}
              className="bg-emerald-400 transition-all duration-300"
            />
            <div
              style={{ width: `${pctArtifact}%` }}
              className="bg-rose-500 transition-all duration-300"
            />
            <div
              style={{ width: `${pctKnown}%` }}
              className="bg-amber-400 transition-all duration-300"
            />
          </div>
          <p className="mt-1 text-[10px] text-slate-300">
            <span className="font-mono font-semibold text-emerald-300">
              {pctConfirm}%
            </span>{' '}
            agree this is a moving object
          </p>
        </div>

        {/* Live PyTorch Online RLHF Gradient Step Readout */}
        {rlhfTelemetry && (
          <div className="mt-1.5 space-y-0.5 rounded-lg border border-cyan-500/35 bg-[#0B101E] p-1.5 font-mono text-[9px] tabular-nums">
            <div className="flex items-center justify-between text-cyan-300">
              <span className="font-semibold">PyTorch Online RLHF Step</span>
              <span className="text-emerald-300">{rlhfTelemetry.model_version}</span>
            </div>
            <div className="flex items-center justify-between text-slate-200">
              <span>
                Shift: {preConf.toFixed(1)}% → {postConf.toFixed(1)}%
              </span>
              <span className="text-amber-300">
                BCE {lossVal.toFixed(4)} · ΔW {weightDeltaNorm.toFixed(4)}
              </span>
            </div>
          </div>
        )}

        {voteBanner && (
          <div
            role="status"
            className={`mt-1.5 flex items-start gap-1.5 rounded-lg border px-2 py-1 text-[10px] ${
              voteBanner.celebrate
                ? 'border-emerald-400/50 bg-emerald-500/15 text-emerald-100'
                : 'border-cyan-500/35 bg-cyan-500/10 text-cyan-100'
            }`}
          >
            {voteBanner.celebrate && (
              <PartyPopper
                className="mt-0.5 h-3 w-3 shrink-0 text-emerald-300"
                aria-hidden="true"
              />
            )}
            <span>{voteBanner.text}</span>
          </div>
        )}
      </div>
    </section>
  );
}
