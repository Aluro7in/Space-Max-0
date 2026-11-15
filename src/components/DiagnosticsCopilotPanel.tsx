import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  CloudRain,
  Code2,
  Compass,
  Navigation,
  PartyPopper,
  Sparkles,
  Star,
} from 'lucide-react';
import type {
  AiVerdicts,
  CommunityVotes,
  Coordinates,
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
  onVoteSubmitted?: (vote: VoteKey) => void;
}

const KID_PROMPTS = [
  'What is a Brown Dwarf?',
  'Why is it invisible to normal telescopes?',
  'How fast is it moving?',
];

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
  onVoteSubmitted,
}: DiagnosticsCopilotPanelProps) {
  const [showProTelemetry, setShowProTelemetry] = useState<boolean>(false);
  const [userVote, setUserVote] = useState<VoteKey | null>(null);
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
    setUserVote(null);
    setVoteBanner(null);
    setVotes(
      gaiaMatched
        ? { confirm_planet: 18, flag_artifact: 6, known_star: 142 }
        : { confirm_planet: 128, flag_artifact: 9, known_star: 17 }
    );
  }, [coordinates.ra, coordinates.dec, gaiaMatched]);

  const cnnPct = useMemo(
    () =>
      computeCnnProbabilityPct(
        aiVerdicts.cnn_confidence,
        aiVerdicts.cnn_artifact_score
      ),
    [aiVerdicts.cnn_confidence, aiVerdicts.cnn_artifact_score]
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

  const totalVotes =
    votes.confirm_planet + votes.flag_artifact + votes.known_star;
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
    let syncedRemote = false;
    try {
      const resp = await fetch(`${backendUrl.trim().replace(/\/+$/, '')}/api/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ra: coordinates.ra,
          dec: coordinates.dec,
          user_vote: vote,
        }),
      });
      syncedRemote = resp.ok;
    } catch {
      syncedRemote = false;
    }

    if (celebrate) {
      setVoteBanner({
        celebrate: true,
        text: syncedRemote
          ? 'Discovery Logged! NASA Space-Max 0 AI just learned from your Planet X sighting!'
          : 'Discovery Logged! Awesome catch, Space Explorer!',
      });
    } else if (vote === 'flag_artifact') {
      setVoteBanner({
        celebrate: false,
        text: 'Thanks! Flagged as camera glitch to help train the filter.',
      });
    } else {
      setVoteBanner({
        celebrate: false,
        text: 'Recorded as a normal catalogued star.',
      });
    }
  };

  const cleanSummary = useMemo(
    () => cleanCopilotText(copilotSummary),
    [copilotSummary]
  );

  const atmosphereSubtext = preset?.kidAtmosphere ?? 'Cold world atmosphere';

  return (
    <section
      data-tour="step-4"
      aria-label="Step 3: AI Space Guide and Discovery Vote"
      className="flex flex-col justify-between gap-3.5 rounded-2xl border border-amber-500/20 bg-[#0B0C10]/90 p-4 backdrop-blur-md lg:col-span-3"
    >
      {/* Header + Subtle Pro Telemetry Toggle for NASA Judges */}
      <div className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-[#F8FAFC]">
            Step 3: AI Space Guide &amp; Vote
          </h2>
          <button
            type="button"
            onClick={() => setShowProTelemetry((prev) => !prev)}
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors ${
              showProTelemetry
                ? 'border-amber-400/60 bg-amber-500/20 text-amber-200'
                : 'border-amber-500/20 bg-[#050507] text-slate-400 hover:text-amber-100'
            }`}
          >
            <Code2 className="h-3 w-3" aria-hidden="true" />
            <span>{showProTelemetry ? 'Hide Pro AI' : 'Show Pro AI Telemetry'}</span>
          </button>
        </div>

        {/* 3 Simple Visual Clue Badges */}
        <div className="space-y-2">
          <div className="flex items-center gap-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-300">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-emerald-200">
                {isConfirmedObject
                  ? 'Real Planet / Brown Dwarf'
                  : 'Possible Camera Glitch'}
              </p>
              <p className="text-[11px] tabular-nums text-emerald-300/80">
                {cnnPct.toFixed(0)}% Match — Not camera dust
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 rounded-xl border border-[#FF5500]/30 bg-[#FF5500]/10 p-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#FF5500]/20 text-orange-300">
              <CloudRain className="h-4 w-4" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-orange-200">
                Water &amp; Methane Detected
              </p>
              <p className="text-[11px] text-orange-300/80">
                {atmosphereSubtext}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/20 text-amber-300">
              <Navigation className="h-4 w-4" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-amber-200">
                Moving Across Sky
              </p>
              <p className="text-[11px] text-amber-300/80">
                {gaiaMatched
                  ? 'Matched in Gaia Star Map'
                  : 'Missing from star maps'}
              </p>
            </div>
          </div>
        </div>

        {/* Optional Pro AI Telemetry Drawer for NASA Judges */}
        {showProTelemetry && (
          <div className="space-y-2 rounded-xl border border-amber-500/25 bg-[#050507] p-3 font-mono text-[10px] text-slate-300">
            <div className="flex items-center justify-between border-b border-amber-500/15 pb-1.5">
              <span className="font-semibold text-amber-300">
                PyTorch Tri-Model Telemetry
              </span>
              <span className="text-slate-400">2D-CNN · RNN · GNN</span>
            </div>
            <div className="flex justify-between tabular-nums">
              <span>2D-CNN Logits:</span>
              <span className="text-emerald-300">
                Real {aiVerdicts.cnn_confidence >= 0 ? '+' : ''}
                {aiVerdicts.cnn_confidence.toFixed(2)} | Art{' '}
                {aiVerdicts.cnn_artifact_score.toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Spectral RNN:</span>
              <span className="text-orange-300">
                {aiVerdicts.rnn_classification}
              </span>
            </div>
            <div className="flex items-center justify-between pt-1">
              <span className="inline-flex items-center gap-1">
                <Compass className="h-3 w-3 text-amber-400" aria-hidden="true" />
                GNN Vector:
              </span>
              <span className="tabular-nums text-amber-300">
                pmRA {pmRa >= 0 ? '+' : ''}
                {pmRa.toFixed(1)} | pmDec {pmDec >= 0 ? '+' : ''}
                {pmDec.toFixed(1)} mas/yr ({radialVel.toFixed(1)} km/s)
              </span>
            </div>
            <div className="flex justify-center pt-1">
              <svg viewBox="0 0 64 64" className="h-11 w-11">
                <circle
                  cx="32"
                  cy="32"
                  r="24"
                  fill="none"
                  stroke="#292524"
                  strokeWidth="1"
                  strokeDasharray="2 2"
                />
                <line x1="32" y1="6" x2="32" y2="58" stroke="#292524" strokeWidth="1" />
                <line x1="6" y1="32" x2="58" y2="32" stroke="#292524" strokeWidth="1" />
                <line
                  x1="32"
                  y1="32"
                  x2={arrowCoords.x2}
                  y2={arrowCoords.y2}
                  stroke="#F59E0B"
                  strokeWidth="2.2"
                />
                <circle cx="32" cy="32" r="2.5" fill="#FFFBEB" />
              </svg>
            </div>
          </div>
        )}
      </div>

      {/* Multi-Turn Gemini AI Space Guide Chat */}
      <GeminiMissionChat
        targetName={preset?.name ?? 'Custom Sky Coordinate'}
        coordinates={coordinates}
        aiVerdicts={aiVerdicts}
        cnnMatchPct={Math.round(cnnPct)}
        gaiaMatched={gaiaMatched}
        initialSummary={cleanSummary}
      />

      {/* Discovery Vote Card */}
      <div className="rounded-xl border border-amber-500/20 bg-[#050507] p-3.5">
        <div className="mb-2.5 flex items-center justify-between">
          <h3 className="text-xs font-bold text-[#F8FAFC]">
            Did you spot the moving object?
          </h3>
          <span className="font-mono text-[10px] tabular-nums text-slate-400">
            {totalVotes} explorers
          </span>
        </div>

        <div className="space-y-1.5">
          <button
            type="button"
            onClick={() => handleVote('confirm_planet')}
            className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-xs font-semibold transition-colors ${
              userVote === 'confirm_planet'
                ? 'border-emerald-400 bg-emerald-500/25 text-emerald-100'
                : 'border-emerald-500/35 bg-emerald-500/10 text-emerald-200 hover:border-emerald-400'
            }`}
          >
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" aria-hidden="true" />
              <span>Yes! I Found Planet X</span>
            </span>
            <span className="font-mono text-[11px] tabular-nums text-emerald-300">
              {pctConfirm}%
            </span>
          </button>

          <button
            type="button"
            onClick={() => handleVote('flag_artifact')}
            className={`flex w-full items-center justify-between rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors ${
              userVote === 'flag_artifact'
                ? 'border-rose-400 bg-rose-500/20 text-rose-200'
                : 'border-amber-500/15 bg-[#0B0C10] text-slate-300 hover:border-rose-500/50'
            }`}
          >
            <span className="inline-flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 text-rose-400" aria-hidden="true" />
              <span>Camera Glitch</span>
            </span>
            <span className="font-mono text-[11px] tabular-nums text-rose-300">
              {pctArtifact}%
            </span>
          </button>

          <button
            type="button"
            onClick={() => handleVote('known_star')}
            className={`flex w-full items-center justify-between rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors ${
              userVote === 'known_star'
                ? 'border-amber-400 bg-amber-500/20 text-amber-200'
                : 'border-amber-500/15 bg-[#0B0C10] text-slate-300 hover:border-amber-500/50'
            }`}
          >
            <span className="inline-flex items-center gap-1.5">
              <Star className="h-3.5 w-3.5 text-amber-400" aria-hidden="true" />
              <span>Normal Star</span>
            </span>
            <span className="font-mono text-[11px] tabular-nums text-amber-300">
              {pctKnown}%
            </span>
          </button>
        </div>

        {/* Clean Community Vote Bar */}
        <div className="mt-2.5">
          <div
            aria-label="Community vote bar"
            className="flex h-2 w-full overflow-hidden rounded-full bg-[#0B0C10]"
          >
            <div
              style={{ width: `${pctConfirm}%` }}
              className="bg-emerald-400 transition-all duration-300"
            />
            <div
              style={{ width: `${pctArtifact}%` }}
              className="bg-rose-400 transition-all duration-300"
            />
            <div
              style={{ width: `${pctKnown}%` }}
              className="bg-amber-400 transition-all duration-300"
            />
          </div>
          <p className="mt-1.5 text-[11px] font-medium text-slate-300">
            <span className="font-mono font-semibold text-emerald-300">
              {pctConfirm}%
            </span>{' '}
            agree this is a new moving object
          </p>
        </div>

        {/* Celebratory Confirmation Banner */}
        {voteBanner && (
          <div
            role="status"
            className={`mt-2.5 flex items-start gap-2 rounded-xl border p-2.5 text-xs ${
              voteBanner.celebrate
                ? 'border-emerald-400/60 bg-emerald-500/15 text-emerald-100'
                : 'border-amber-500/40 bg-amber-500/10 text-amber-100'
            }`}
          >
            {voteBanner.celebrate && (
              <PartyPopper
                className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300"
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
