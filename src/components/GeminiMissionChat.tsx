import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Bot,
  ChevronDown,
  Cpu,
  Maximize2,
  Minimize2,
  RotateCcw,
  Send,
  Sparkles,
  User,
  Zap,
} from 'lucide-react';
import type {
  AiVerdicts,
  ChatMessage,
  ChatModelMode,
  ChatRoleId,
  Coordinates,
} from '../types/telemetry';

interface GeminiMissionChatProps {
  targetName: string;
  coordinates: Coordinates;
  aiVerdicts: AiVerdicts;
  cnnMatchPct: number;
  gaiaMatched: boolean;
  initialSummary: string;
}

const ROLE_OPTIONS: { id: ChatRoleId; label: string; hint: string }[] = [
  { id: 'explorer', label: 'Explorer', hint: 'Simple & exciting' },
  { id: 'astrophysicist', label: 'Astrophysicist', hint: 'SPHEREx science' },
  { id: 'analyst', label: 'AI Engineer', hint: 'CNN / RNN / GNN' },
];

const MODEL_MODE_OPTIONS: {
  id: ChatModelMode;
  label: string;
  sublabel: string;
}[] = [
  { id: 'fast', label: 'Fast', sublabel: '3.1 Flash Lite' },
  { id: 'balanced', label: 'Balanced', sublabel: '4 Hydrogen' },
  { id: 'deep', label: 'Deep', sublabel: '4 Hydrogen XHIGH' },
];

const QUICK_PROMPTS = [
  'What is a Brown Dwarf?',
  'Why invisible in optical?',
  'How fast is it moving?',
];

function createInitialGreeting(summary: string, targetName: string): ChatMessage {
  return {
    id: `init-${Date.now()}`,
    role: 'model',
    text:
      summary ||
      `Ready to explore ${targetName}! Ask about its infrared glow, water and methane clouds, or proper motion.`,
    persona: 'explorer',
    modelUsed: 'mission-brief',
    timestamp: new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    }),
  };
}

export function GeminiMissionChat({
  targetName,
  coordinates,
  aiVerdicts,
  cnnMatchPct,
  gaiaMatched,
  initialSummary,
}: GeminiMissionChatProps) {
  const [role, setRole] = useState<ChatRoleId>('explorer');
  const [modelMode, setModelMode] = useState<ChatModelMode>('balanced');
  const [openMenu, setOpenMenu] = useState<'role' | 'speed' | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    createInitialGreeting(initialSummary, targetName),
  ]);
  const [input, setInput] = useState<string>('');
  const [isSending, setIsSending] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState<boolean>(false);

  const threadEndRef = useRef<HTMLDivElement | null>(null);
  const prevTargetKeyRef = useRef<string>(
    `${coordinates.ra.toFixed(3)}-${coordinates.dec.toFixed(3)}`
  );

  useEffect(() => {
    const nextKey = `${coordinates.ra.toFixed(3)}-${coordinates.dec.toFixed(3)}`;
    if (prevTargetKeyRef.current === nextKey) return;
    prevTargetKeyRef.current = nextKey;

    setErrorMsg(null);
    setMessages((prev) => {
      const hasUserTurns = prev.some((m) => m.role === 'user');
      if (!hasUserTurns) {
        return [createInitialGreeting(initialSummary, targetName)];
      }
      return [
        ...prev,
        {
          id: `target-${Date.now()}`,
          role: 'model',
          text: `Target updated to ${targetName} (RA ${coordinates.ra.toFixed(3)}°, Dec ${coordinates.dec.toFixed(3)}°). ${initialSummary}`,
          persona: role,
          modelUsed: 'telemetry-sync',
          timestamp: new Date().toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          }),
        },
      ];
    });
  }, [coordinates.ra, coordinates.dec, initialSummary, targetName, role]);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, isSending, isExpanded]);

  useEffect(() => {
    if (!isExpanded && !openMenu) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (openMenu) setOpenMenu(null);
        else setIsExpanded(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isExpanded, openMenu]);

  const sendMessage = async (rawText: string) => {
    const trimmed = rawText.trim();
    if (!trimmed || isSending) return;

    setErrorMsg(null);
    setOpenMenu(null);
    const userEntry: ChatMessage = {
      id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      role: 'user',
      text: trimmed,
      timestamp: new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      }),
    };

    const historyPayload = messages
      .filter((m) => m.modelUsed !== 'mission-brief' && m.modelUsed !== 'telemetry-sync')
      .map((m) => ({ role: m.role, text: m.text }));

    setMessages((prev) => [...prev, userEntry]);
    setInput('');
    setIsSending(true);

    try {
      const resp = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: trimmed,
          history: historyPayload,
          role,
          modelMode,
          telemetryContext: {
            targetName,
            ra: coordinates.ra,
            dec: coordinates.dec,
            cnnVerdict: aiVerdicts.cnn_verdict_label,
            cnnMatchPct,
            rnnClassification: aiVerdicts.rnn_classification,
            gnnShift: aiVerdicts.gnn_kinematic_shift,
            pmRa: aiVerdicts.proper_motion?.pm_ra_mas_yr ?? 14.2,
            pmDec: aiVerdicts.proper_motion?.pm_dec_mas_yr ?? -6.8,
            radialVel: aiVerdicts.proper_motion?.radial_vel_km_s ?? 41.5,
            gaiaMatched,
          },
        }),
      });

      const payload = (await resp.json().catch(() => ({}))) as {
        reply?: string;
        modelUsed?: string;
        roleUsed?: ChatRoleId;
        error?: string;
      };

      if (!resp.ok || !payload.reply) {
        throw new Error(
          payload.error || `Gemini chat returned HTTP ${resp.status}`
        );
      }

      const modelEntry: ChatMessage = {
        id: `model-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        role: 'model',
        text: payload.reply,
        modelUsed: payload.modelUsed,
        persona: payload.roleUsed ?? role,
        timestamp: new Date().toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        }),
      };
      setMessages((prev) => [...prev, modelEntry]);
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Unable to reach Gemini chat server.';
      setErrorMsg(msg);
    } finally {
      setIsSending(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void sendMessage(input);
  };

  const handleResetChat = () => {
    setErrorMsg(null);
    setOpenMenu(null);
    setMessages([createInitialGreeting(initialSummary, targetName)]);
  };

  const activeRoleObj =
    ROLE_OPTIONS.find((r) => r.id === role) ?? ROLE_OPTIONS[0];
  const activeSpeedObj =
    MODEL_MODE_OPTIONS.find((m) => m.id === modelMode) ?? MODEL_MODE_OPTIONS[1];

  const renderChatBody = (expandedView: boolean) => (
    <div
      className={
        expandedView
          ? 'flex h-full flex-col'
          : 'flex h-full flex-col rounded-xl border border-white/[0.07] bg-[#060A14]/90 p-2.5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)]'
      }
    >
      {/* Sleek 1-Line Header with Role & Speed Popover Selectors + Reset & Expand */}
      <div className="relative mb-2 flex flex-wrap items-center justify-between gap-1.5 border-b border-white/[0.06] pb-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Role Popover Selector */}
          <div className="relative">
            <button
              type="button"
              onClick={() =>
                setOpenMenu((prev) => (prev === 'role' ? null : 'role'))
              }
              title={`Specialist persona: ${activeRoleObj.label} (${activeRoleObj.hint})`}
              className="inline-flex items-center gap-1 rounded-md border border-white/[0.08] bg-[#0B101E] px-2 py-0.5 text-[10px] font-medium text-cyan-200 transition-colors hover:border-cyan-400/50"
            >
              <Bot className="h-3 w-3 text-cyan-400" aria-hidden="true" />
              <span className="text-slate-400">Role:</span>
              <span className="font-semibold text-cyan-100">
                {activeRoleObj.label}
              </span>
              <ChevronDown className="h-2.5 w-2.5 text-slate-400" aria-hidden="true" />
            </button>

            {openMenu === 'role' && (
              <div
                role="menu"
                aria-label="Select AI specialist role"
                className="absolute top-7 left-0 z-30 w-44 rounded-xl border border-cyan-400/40 bg-slate-950/95 p-1 shadow-2xl backdrop-blur-xl"
              >
                {ROLE_OPTIONS.map((opt) => {
                  const active = role === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setRole(opt.id);
                        setOpenMenu(null);
                      }}
                      className={`flex w-full items-center justify-between rounded-lg px-2 py-1 text-left text-[10px] transition-colors ${
                        active
                          ? 'bg-cyan-500/20 font-semibold text-cyan-200'
                          : 'text-slate-300 hover:bg-white/[0.06]'
                      }`}
                    >
                      <span>{opt.label}</span>
                      <span className="text-[9px] text-slate-400">{opt.hint}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Speed Popover Selector */}
          <div className="relative">
            <button
              type="button"
              onClick={() =>
                setOpenMenu((prev) => (prev === 'speed' ? null : 'speed'))
              }
              title={`Gemini reasoning speed: ${activeSpeedObj.label} (${activeSpeedObj.sublabel})`}
              className="inline-flex items-center gap-1 rounded-md border border-white/[0.08] bg-[#0B101E] px-2 py-0.5 text-[10px] font-medium text-amber-200 transition-colors hover:border-amber-400/50"
            >
              {modelMode === 'fast' ? (
                <Zap className="h-2.5 w-2.5 text-amber-400" aria-hidden="true" />
              ) : modelMode === 'deep' ? (
                <Cpu className="h-2.5 w-2.5 text-amber-400" aria-hidden="true" />
              ) : (
                <Sparkles className="h-2.5 w-2.5 text-amber-400" aria-hidden="true" />
              )}
              <span className="text-slate-400">Speed:</span>
              <span className="font-semibold text-amber-100">
                {activeSpeedObj.label}
              </span>
              <ChevronDown className="h-2.5 w-2.5 text-slate-400" aria-hidden="true" />
            </button>

            {openMenu === 'speed' && (
              <div
                role="menu"
                aria-label="Select Gemini reasoning speed"
                className="absolute top-7 left-0 z-30 w-44 rounded-xl border border-amber-400/40 bg-slate-950/95 p-1 shadow-2xl backdrop-blur-xl"
              >
                {MODEL_MODE_OPTIONS.map((mode) => {
                  const active = modelMode === mode.id;
                  return (
                    <button
                      key={mode.id}
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setModelMode(mode.id);
                        setOpenMenu(null);
                      }}
                      className={`flex w-full items-center justify-between rounded-lg px-2 py-1 text-left text-[10px] transition-colors ${
                        active
                          ? 'bg-amber-500/20 font-semibold text-amber-200'
                          : 'text-slate-300 hover:bg-white/[0.06]'
                      }`}
                    >
                      <span>{mode.label}</span>
                      <span className="font-mono text-[8.5px] text-slate-400">
                        {mode.sublabel}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Reset & Expand Actions */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleResetChat}
            title="Start new conversation"
            aria-label="Reset chat thread"
            className="inline-flex items-center gap-1 rounded-md border border-white/[0.08] bg-[#0B101E] px-1.5 py-0.5 text-[9.5px] font-medium text-slate-300 transition-colors hover:border-cyan-400/50 hover:text-cyan-200"
          >
            <RotateCcw className="h-2.5 w-2.5" aria-hidden="true" />
            <span>Reset</span>
          </button>

          <button
            type="button"
            onClick={() => setIsExpanded((prev) => !prev)}
            aria-label={expandedView ? 'Minimize chat window' : 'Expand chat window'}
            className="inline-flex items-center gap-1 rounded-md border border-white/[0.08] bg-[#0B101E] px-1.5 py-0.5 text-[9.5px] font-medium text-slate-300 transition-colors hover:border-cyan-400/50 hover:text-cyan-200"
          >
            {expandedView ? (
              <Minimize2 className="h-3 w-3" aria-hidden="true" />
            ) : (
              <Maximize2 className="h-3 w-3" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      {/* Generous Scrollable Multi-Turn Conversation Thread */}
      <div
        role="log"
        aria-live="polite"
        aria-label="Conversation history with Gemini AI Space Guide"
        className={`space-y-2 overflow-y-auto pr-1 ${
          expandedView ? 'min-h-[260px] flex-1' : 'h-36 flex-1 xl:h-40'
        }`}
      >
        {messages.map((msg) => {
          const isUser = msg.role === 'user';
          return (
            <div
              key={msg.id}
              className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
            >
              <div
                className={`max-w-[95%] rounded-xl border px-2.5 py-1.5 text-[11px] leading-relaxed ${
                  isUser
                    ? 'border-cyan-400/40 bg-cyan-500/15 text-cyan-50'
                    : 'border-white/[0.07] bg-[#0B101E]/90 text-slate-200'
                }`}
              >
                <div className="mb-0.5 flex items-center gap-1 text-[9.5px] text-slate-400">
                  {isUser ? (
                    <>
                      <User className="h-2.5 w-2.5 text-cyan-300" aria-hidden="true" />
                      <span className="font-semibold text-cyan-300">You</span>
                    </>
                  ) : (
                    <>
                      <Bot className="h-2.5 w-2.5 text-emerald-300" aria-hidden="true" />
                      <span className="font-semibold text-slate-200">
                        {ROLE_OPTIONS.find((r) => r.id === msg.persona)?.label ??
                          'Space Guide'}
                      </span>
                      {msg.modelUsed && (
                        <span className="rounded bg-[#04060C] px-1 font-mono text-[8.5px] text-sky-300/80">
                          {msg.modelUsed}
                        </span>
                      )}
                    </>
                  )}
                  <span className="ml-auto font-mono text-[8.5px] opacity-70">
                    {msg.timestamp}
                  </span>
                </div>
                <p className="whitespace-pre-wrap">{msg.text}</p>
              </div>
            </div>
          );
        })}

        {isSending && (
          <div className="flex items-start">
            <div className="inline-flex items-center gap-1.5 rounded-xl border border-cyan-500/35 bg-[#0B101E] px-2.5 py-1.5 text-[11px] text-cyan-200">
              <span>Gemini analyzing SPHEREx telemetry...</span>
            </div>
          </div>
        )}

        {errorMsg && (
          <div
            role="alert"
            className="flex items-start gap-1.5 rounded-xl border border-rose-500/40 bg-rose-500/10 p-2 text-[10.5px] text-rose-200"
          >
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-400" aria-hidden="true" />
            <span>{errorMsg}</span>
          </div>
        )}

        <div ref={threadEndRef} />
      </div>

      {/* Quick Prompt Chips */}
      <div className="mt-2 flex flex-wrap gap-1">
        {QUICK_PROMPTS.map((chip) => (
          <button
            key={chip}
            type="button"
            disabled={isSending}
            onClick={() => void sendMessage(chip)}
            className="rounded-md border border-white/[0.08] bg-[#0B101E] px-2 py-0.5 text-[9.5px] font-medium text-sky-200 transition-colors hover:border-cyan-400/50 hover:bg-cyan-500/15 disabled:opacity-50"
          >
            {chip}
          </button>
        ))}
      </div>

      {/* Message Input Form */}
      <form onSubmit={handleSubmit} className="mt-1.5 flex items-center gap-1.5">
        <input
          type="text"
          value={input}
          disabled={isSending}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask Gemini Space Guide..."
          aria-label="Ask Gemini Space Guide a follow-up question"
          className="min-w-0 flex-1 rounded-lg border border-white/[0.08] bg-[#0B101E] px-2.5 py-1 text-[11px] text-[#F8FAFC] placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={isSending || !input.trim()}
          aria-label="Send message to Gemini Space Guide"
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-cyan-400/45 bg-cyan-500/20 text-cyan-200 transition-colors hover:bg-cyan-500/30 disabled:cursor-not-allowed disabled:opacity-45"
        >
          <Send className="h-3 w-3" aria-hidden="true" />
        </button>
      </form>
    </div>
  );

  return (
    <>
      {renderChatBody(false)}

      {isExpanded && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Expanded Gemini AI Space Guide Chat"
          onClick={() => setIsExpanded(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex h-[80vh] w-full max-w-2xl flex-col rounded-2xl border border-cyan-500/40 bg-[#090D18]/95 p-4 shadow-[0_0_50px_rgba(0,240,255,0.2)] backdrop-blur-xl sm:p-5"
          >
            {renderChatBody(true)}
          </div>
        </div>
      )}
    </>
  );
}
