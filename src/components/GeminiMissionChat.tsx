import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Bot,
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
  { id: 'explorer', label: 'Explorer Guide', hint: 'Simple & exciting' },
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
  'Why is it invisible to normal telescopes?',
  'How fast is it moving?',
];

function createInitialGreeting(summary: string, targetName: string): ChatMessage {
  return {
    id: `init-${Date.now()}`,
    role: 'model',
    text:
      summary ||
      `Ready to explore ${targetName}! Ask me anything about its infrared glow, water and methane clouds, or how fast it moves across the stars.`,
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

  // Append a fresh mission brief update when the user switches sky targets
  useEffect(() => {
    const nextKey = `${coordinates.ra.toFixed(3)}-${coordinates.dec.toFixed(3)}`;
    if (prevTargetKeyRef.current === nextKey) return;
    prevTargetKeyRef.current = nextKey;

    setErrorMsg(null);
    setMessages((prev) => {
      // If user hasn't sent any turns yet, replace initial brief cleanly
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

  // Smoothly scroll thread to latest message
  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, isSending, isExpanded]);

  // Close expanded chat modal on Escape
  useEffect(() => {
    if (!isExpanded) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsExpanded(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isExpanded]);

  const sendMessage = async (rawText: string) => {
    const trimmed = rawText.trim();
    if (!trimmed || isSending) return;

    setErrorMsg(null);
    const userEntry: ChatMessage = {
      id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      role: 'user',
      text: trimmed,
      timestamp: new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      }),
    };

    // Capture conversation history prior to this message for multi-turn context
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
    setMessages([createInitialGreeting(initialSummary, targetName)]);
  };

  const renderChatBody = (expandedView: boolean) => (
    <div
      className={
        expandedView
          ? 'flex h-full flex-col'
          : 'flex flex-col rounded-xl border border-amber-500/25 bg-[#050507] p-3'
      }
    >
      {/* Header + Expand & Reset Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-[#F8FAFC]">
          <Bot className="h-4 w-4 text-amber-400" aria-hidden="true" />
          <span>Gemini AI Space Guide</span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleResetChat}
            title="Start new conversation"
            aria-label="Reset chat thread"
            className="inline-flex items-center gap-1 rounded-lg border border-amber-500/20 bg-[#0B0C10] px-2 py-1 text-[10px] font-medium text-slate-300 transition-colors hover:border-amber-500/45 hover:text-amber-200"
          >
            <RotateCcw className="h-3 w-3" aria-hidden="true" />
            <span>Reset</span>
          </button>

          <button
            type="button"
            onClick={() => setIsExpanded((prev) => !prev)}
            aria-label={expandedView ? 'Minimize chat window' : 'Expand chat window'}
            className="inline-flex items-center gap-1 rounded-lg border border-amber-500/20 bg-[#0B0C10] px-2 py-1 text-[10px] font-medium text-slate-300 transition-colors hover:border-amber-500/45 hover:text-amber-200"
          >
            {expandedView ? (
              <Minimize2 className="h-3 w-3" aria-hidden="true" />
            ) : (
              <Maximize2 className="h-3 w-3" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      {/* Role Selector & Speed/Reasoning Mode */}
      <div className="mb-2 space-y-1.5 border-y border-amber-500/15 py-2">
        <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Chatbot specialist role">
          {ROLE_OPTIONS.map((opt) => {
            const active = role === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setRole(opt.id)}
                title={opt.hint}
                className={`rounded-lg border px-2 py-0.5 text-[10px] font-medium transition-colors ${
                  active
                    ? 'border-amber-400/60 bg-amber-500/20 text-amber-200'
                    : 'border-amber-500/15 bg-[#0B0C10] text-slate-400 hover:text-amber-100'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Gemini reasoning speed">
          {MODEL_MODE_OPTIONS.map((mode) => {
            const active = modelMode === mode.id;
            return (
              <button
                key={mode.id}
                type="button"
                onClick={() => setModelMode(mode.id)}
                className={`inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 text-[10px] transition-colors ${
                  active
                    ? 'border-[#FF5500]/60 bg-[#FF5500]/15 text-orange-200'
                    : 'border-amber-500/15 bg-[#0B0C10] text-slate-400 hover:text-amber-100'
                }`}
              >
                {mode.id === 'fast' ? (
                  <Zap className="h-2.5 w-2.5" aria-hidden="true" />
                ) : mode.id === 'deep' ? (
                  <Cpu className="h-2.5 w-2.5" aria-hidden="true" />
                ) : (
                  <Sparkles className="h-2.5 w-2.5" aria-hidden="true" />
                )}
                <span className="font-semibold">{mode.label}</span>
                <span className="hidden opacity-75 sm:inline">· {mode.sublabel}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Scrollable Multi-Turn Conversation Thread */}
      <div
        role="log"
        aria-live="polite"
        aria-label="Conversation history with Gemini AI Space Guide"
        className={`space-y-2.5 overflow-y-auto pr-1 ${
          expandedView ? 'min-h-[260px] flex-1' : 'h-48'
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
                className={`max-w-[92%] rounded-xl border px-2.5 py-2 text-xs leading-relaxed ${
                  isUser
                    ? 'border-amber-400/40 bg-amber-500/15 text-amber-50'
                    : 'border-amber-500/15 bg-[#0B0C10] text-slate-200'
                }`}
              >
                <div className="mb-1 flex items-center gap-1.5 text-[10px] text-slate-400">
                  {isUser ? (
                    <>
                      <User className="h-3 w-3 text-amber-300" aria-hidden="true" />
                      <span className="font-semibold text-amber-300">You</span>
                    </>
                  ) : (
                    <>
                      <Bot className="h-3 w-3 text-orange-300" aria-hidden="true" />
                      <span className="font-semibold text-slate-200">
                        {ROLE_OPTIONS.find((r) => r.id === msg.persona)?.label ??
                          'Space Guide'}
                      </span>
                      {msg.modelUsed && (
                        <span className="rounded bg-[#050507] px-1 py-0.2 font-mono text-[9px] text-slate-400">
                          {msg.modelUsed}
                        </span>
                      )}
                    </>
                  )}
                  <span className="ml-auto font-mono text-[9px] opacity-70">
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
            <div className="inline-flex items-center gap-2 rounded-xl border border-amber-500/30 bg-[#0B0C10] px-3 py-2 text-xs text-amber-200">
              <span className="flex gap-1">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
              </span>
              <span>Gemini is analyzing SPHEREx telemetry...</span>
            </div>
          </div>
        )}

        {errorMsg && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-xl border border-rose-500/40 bg-rose-500/10 p-2.5 text-[11px] text-rose-200"
          >
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-400" aria-hidden="true" />
            <span>{errorMsg}</span>
          </div>
        )}

        <div ref={threadEndRef} />
      </div>

      {/* Quick Prompt Chips */}
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {QUICK_PROMPTS.map((chip) => (
          <button
            key={chip}
            type="button"
            disabled={isSending}
            onClick={() => void sendMessage(chip)}
            className="rounded-full border border-amber-500/20 bg-[#0B0C10] px-2.5 py-1 text-[10px] font-medium text-amber-200 transition-colors hover:border-amber-400/60 hover:bg-amber-500/15 disabled:opacity-50"
          >
            {chip}
          </button>
        ))}
      </div>

      {/* Message Input Form */}
      <form onSubmit={handleSubmit} className="mt-2.5 flex items-center gap-1.5">
        <input
          type="text"
          value={input}
          disabled={isSending}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask Gemini Space Guide..."
          aria-label="Ask Gemini Space Guide a follow-up question"
          className="min-w-0 flex-1 rounded-lg border border-amber-500/20 bg-[#0B0C10] px-2.5 py-1.5 text-xs text-[#F8FAFC] placeholder:text-slate-500 focus:border-amber-400 focus:outline-none disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={isSending || !input.trim()}
          aria-label="Send message to Gemini Space Guide"
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-amber-500/40 bg-amber-500/20 text-amber-300 transition-colors hover:bg-amber-500/30 disabled:cursor-not-allowed disabled:opacity-45"
        >
          <Send className="h-3.5 w-3.5" aria-hidden="true" />
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
            className="flex h-[80vh] w-full max-w-2xl flex-col rounded-2xl border border-amber-500/40 bg-[#0B0C10]/95 p-4 shadow-[0_0_50px_rgba(245,158,11,0.2)] backdrop-blur-xl sm:p-5"
          >
            {renderChatBody(true)}
          </div>
        </div>
      )}
    </>
  );
}
