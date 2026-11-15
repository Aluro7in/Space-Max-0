import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
  Rocket,
  Sparkles,
  X,
} from 'lucide-react';

export const TOUR_STORAGE_KEY = 'spacemax_tour_seen';

export type TourUiState = 'hidden' | 'welcome' | 'active';

interface GuidedMissionTourProps {
  tourState: TourUiState;
  activeStep: number; // 0..3
  onStartTour: () => void;
  onSkipTour: () => void;
  onStepChange: (nextStep: number) => void;
  onFinishTour: () => void;
}

interface TourStepSpec {
  selector: string;
  title: string;
  description: string;
}

const TOUR_STEPS: TourStepSpec[] = [
  {
    selector: '[data-tour="step-1"]',
    title: 'Pick a Sky Target',
    description:
      "Enter any Right Ascension & Declination coordinates, adjust your zoom (3' to 1°), or click a famous NASA target like WISE 0855 to aim the telescope.",
  },
  {
    selector: '[data-tour="step-2"]',
    title: 'Spot the Moving Object',
    description:
      'Watch the Time-Machine Blink Video flip between the year 2000 and SPHEREx 2025+. See the dot hopping across the stars? Click directly on it to lock your target!',
  },
  {
    selector: '[data-tour="step-3"]',
    title: 'Inspect the 3D Light Cube & Molecules',
    description:
      'Drag the 3D cube to rotate it in space and slide the Infrared Color bar. Deep dips in Water (H₂O) and Methane (CH₄) prove this object is a cold Brown Dwarf or Planet X candidate.',
  },
  {
    selector: '[data-tour="step-4"]',
    title: 'Ask the AI Guide & Cast Your Discovery Vote',
    description:
      "Chat with your AI Space Guide to learn about your find, then click 'Yes! I Found Planet X' to send your discovery vote to our neural network.",
  },
];

const SPOTLIGHT_CLASSES = [
  'ring-2',
  'ring-amber-400',
  'shadow-[0_0_35px_rgba(245,158,11,0.45)]',
];

interface RectBox {
  top: number;
  left: number;
  width: number;
  height: number;
}

export function GuidedMissionTour({
  tourState,
  activeStep,
  onStartTour,
  onSkipTour,
  onStepChange,
  onFinishTour,
}: GuidedMissionTourProps) {
  const [autoPlay, setAutoPlay] = useState<boolean>(false);
  const [targetRect, setTargetRect] = useState<RectBox | null>(null);
  const [cardPos, setCardPos] = useState<{ top: number; left: number } | null>(
    null
  );
  const [isMobile, setIsMobile] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth < 768 : false
  );
  const cardRef = useRef<HTMLDivElement | null>(null);

  const clampedStep = Math.max(0, Math.min(TOUR_STEPS.length - 1, activeStep));
  const currentSpec = TOUR_STEPS[clampedStep];
  const isLastStep = clampedStep === TOUR_STEPS.length - 1;

  // Reset auto-play whenever tour exits
  useEffect(() => {
    if (tourState !== 'active') {
      setAutoPlay(false);
    }
  }, [tourState]);

  // Escape-key exit
  useEffect(() => {
    if (tourState === 'hidden') return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (tourState === 'active') {
          onFinishTour();
        } else {
          onSkipTour();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [tourState, onFinishTour, onSkipTour]);

  // Auto-Play (4s) timer
  useEffect(() => {
    if (tourState !== 'active' || !autoPlay) return;
    const timer = window.setInterval(() => {
      if (clampedStep >= TOUR_STEPS.length - 1) {
        setAutoPlay(false);
      } else {
        onStepChange(clampedStep + 1);
      }
    }, 4000);
    return () => window.clearInterval(timer);
  }, [tourState, autoPlay, clampedStep, onStepChange]);

  const measureAndPosition = useCallback(() => {
    if (tourState !== 'active') {
      setTargetRect(null);
      setCardPos(null);
      return;
    }

    const mobile = window.innerWidth < 768;
    setIsMobile(mobile);

    const el = document.querySelector(currentSpec.selector) as HTMLElement | null;
    if (!el) {
      setTargetRect(null);
      setCardPos(null);
      return;
    }

    const rect = el.getBoundingClientRect();
    setTargetRect({
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
    });

    if (mobile) {
      setCardPos(null);
      return;
    }

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const cardEl = cardRef.current;
    const cardW = cardEl ? cardEl.offsetWidth : 356;
    const cardH = cardEl ? cardEl.offsetHeight : 230;
    const gap = 16;
    const margin = 12;

    let top = rect.top + 8;
    let left = rect.right + gap;

    // Step 1 (top bar) naturally places below; otherwise prefer right -> left -> below -> above
    if (clampedStep === 0 || left + cardW > vw - margin) {
      const spaceRight = vw - rect.right - margin;
      const spaceLeft = rect.left - margin;
      const spaceBelow = vh - rect.bottom - margin;

      if (clampedStep !== 0 && spaceRight >= cardW + gap) {
        left = rect.right + gap;
        top = rect.top + 12;
      } else if (clampedStep !== 0 && spaceLeft >= cardW + gap) {
        left = rect.left - cardW - gap;
        top = rect.top + 12;
      } else if (spaceBelow >= cardH + gap) {
        top = rect.bottom + gap;
        left = Math.min(
          Math.max(margin, rect.left + rect.width / 2 - cardW / 2),
          vw - cardW - margin
        );
      } else if (rect.top - margin >= cardH + gap) {
        top = rect.top - cardH - gap;
        left = Math.min(
          Math.max(margin, rect.left + rect.width / 2 - cardW / 2),
          vw - cardW - margin
        );
      } else {
        // Fallback inside bottom-right safe area without covering center
        left = Math.min(Math.max(margin, vw - cardW - 20), vw - cardW - margin);
        top = Math.min(Math.max(margin, vh - cardH - 20), vh - cardH - margin);
      }
    }

    // Clamp cleanly within viewport
    left = Math.min(Math.max(margin, left), vw - cardW - margin);
    top = Math.min(Math.max(margin, top), vh - cardH - margin);

    setCardPos({ top, left });
  }, [tourState, currentSpec.selector, clampedStep]);

  // Apply glowing spotlight ring classes directly to active target element & scroll into view
  useEffect(() => {
    if (tourState !== 'active') return;
    const el = document.querySelector(currentSpec.selector) as HTMLElement | null;
    if (!el) return;

    el.classList.add(...SPOTLIGHT_CLASSES);
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    const raf1 = window.requestAnimationFrame(measureAndPosition);
    const timer = window.setTimeout(measureAndPosition, 260);

    return () => {
      window.cancelAnimationFrame(raf1);
      window.clearTimeout(timer);
      el.classList.remove(...SPOTLIGHT_CLASSES);
    };
  }, [tourState, currentSpec.selector, measureAndPosition]);

  // Re-measure on resize/scroll while active
  useLayoutEffect(() => {
    if (tourState !== 'active') return;
    measureAndPosition();
    window.addEventListener('resize', measureAndPosition);
    window.addEventListener('scroll', measureAndPosition, true);
    return () => {
      window.removeEventListener('resize', measureAndPosition);
      window.removeEventListener('scroll', measureAndPosition, true);
    };
  }, [tourState, measureAndPosition]);

  if (tourState === 'hidden') {
    return null;
  }

  // Non-blocking floating Welcome Card on initial visit
  if (tourState === 'welcome') {
    return (
      <aside
        role="dialog"
        aria-modal="false"
        aria-labelledby="spacemax-welcome-title"
        className="fixed bottom-5 left-1/2 z-40 w-[calc(100%-1.5rem)] max-w-lg -translate-x-1/2 rounded-2xl border border-amber-400/45 bg-[#0B0C10]/95 p-4 shadow-[0_0_40px_rgba(245,158,11,0.28)] backdrop-blur-xl sm:p-5"
      >
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-amber-400/40 bg-amber-500/15 text-amber-300">
            <Rocket className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <h2
              id="spacemax-welcome-title"
              className="text-sm font-bold text-[#F8FAFC] sm:text-base"
            >
              Welcome to Space-Max 0: Planet X Explorer
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-slate-300">
              Hunt for undiscovered worlds in real NASA SPHEREx infrared
              telescope data in 4 easy steps.
            </p>
            <div className="mt-3.5 flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={onStartTour}
                className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 px-3.5 py-2 text-xs font-semibold text-[#050507] shadow-[0_0_22px_rgba(245,158,11,0.45)] transition-all hover:bg-amber-400"
              >
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Start Guided Tour</span>
              </button>
              <button
                type="button"
                onClick={onSkipTour}
                className="rounded-xl border border-amber-500/20 bg-[#050507] px-3.5 py-2 text-xs font-medium text-slate-300 transition-colors hover:border-amber-500/45 hover:text-white"
              >
                Skip to Explorer
              </button>
            </div>
          </div>
        </div>
      </aside>
    );
  }

  // Active 4-Step Visual Spotlight Walkthrough
  return (
    <>
      {targetRect && (
        <div
          aria-hidden="true"
          style={{
            top: Math.max(0, targetRect.top - 4),
            left: Math.max(0, targetRect.left - 4),
            width: targetRect.width + 8,
            height: targetRect.height + 8,
            boxShadow: '0 0 0 9999px rgba(5, 5, 7, 0.62)',
          }}
          className="pointer-events-none fixed z-30 rounded-2xl transition-all duration-300"
        />
      )}

      {/* Floating Glassmorphism Mission Step Card */}
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="false"
        aria-labelledby="guided-tour-step-title"
        style={
          !isMobile && cardPos
            ? { top: cardPos.top, left: cardPos.left }
            : undefined
        }
        className={`fixed z-50 rounded-2xl border border-amber-400/50 bg-[#0B0C10]/95 p-4 shadow-[0_0_35px_rgba(245,158,11,0.3)] backdrop-blur-xl transition-all duration-300 ${
          isMobile
            ? 'bottom-3 left-1/2 w-[calc(100%-1.5rem)] max-w-md -translate-x-1/2'
            : 'w-[356px]'
        }`}
      >
        <div className="flex items-center justify-between gap-2 border-b border-amber-500/15 pb-2.5">
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-amber-400/40 bg-amber-500/15 px-2 py-0.5 font-mono text-[11px] font-semibold text-amber-300">
              {clampedStep + 1} / {TOUR_STEPS.length}
            </span>
            <div className="flex items-center gap-1.5" aria-label="Tour step progress">
              {TOUR_STEPS.map((step, idx) => {
                const active = idx === clampedStep;
                return (
                  <button
                    key={step.selector}
                    type="button"
                    aria-label={`Go to step ${idx + 1}: ${step.title}`}
                    onClick={() => {
                      setAutoPlay(false);
                      onStepChange(idx);
                    }}
                    className={`h-2 rounded-full transition-all ${
                      active
                        ? 'w-5 bg-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.8)]'
                        : 'w-2 bg-stone-700 hover:bg-stone-500'
                    }`}
                  />
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setAutoPlay((prev) => !prev)}
              aria-pressed={autoPlay}
              className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-medium transition-colors ${
                autoPlay
                  ? 'border-amber-400/60 bg-amber-500/20 text-amber-200'
                  : 'border-amber-500/20 bg-[#050507] text-slate-300 hover:border-amber-500/40 hover:text-amber-200'
              }`}
            >
              {autoPlay ? (
                <Pause className="h-3 w-3" aria-hidden="true" />
              ) : (
                <Play className="h-3 w-3" aria-hidden="true" />
              )}
              <span>Auto-Play (4s)</span>
            </button>

            <button
              type="button"
              onClick={onFinishTour}
              aria-label="Exit guided tour"
              className="inline-flex items-center gap-1 rounded-lg border border-amber-500/20 bg-[#050507] px-2 py-1 text-[11px] font-medium text-slate-300 transition-colors hover:border-rose-400/50 hover:text-rose-200"
            >
              <X className="h-3 w-3" aria-hidden="true" />
              <span>Exit</span>
            </button>
          </div>
        </div>

        <div className="mt-3">
          <h3
            id="guided-tour-step-title"
            className="text-sm font-bold text-[#F8FAFC]"
          >
            {currentSpec.title}
          </h3>
          <p className="mt-1.5 text-xs leading-relaxed text-slate-300">
            {currentSpec.description}
          </p>
        </div>

        <div className="mt-4 flex items-center justify-between gap-2">
          <button
            type="button"
            disabled={clampedStep === 0}
            onClick={() => {
              setAutoPlay(false);
              onStepChange(Math.max(0, clampedStep - 1));
            }}
            className="inline-flex items-center gap-1 rounded-xl border border-amber-500/20 bg-[#050507] px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:border-amber-500/45 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Back</span>
          </button>

          {isLastStep ? (
            <button
              type="button"
              onClick={onFinishTour}
              className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 px-3.5 py-1.5 text-xs font-semibold text-[#050507] shadow-[0_0_20px_rgba(245,158,11,0.45)] transition-all hover:bg-amber-400"
            >
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Finish &amp; Start Hunting</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setAutoPlay(false);
                onStepChange(Math.min(TOUR_STEPS.length - 1, clampedStep + 1));
              }}
              className="inline-flex items-center gap-1 rounded-xl bg-amber-500 px-3.5 py-1.5 text-xs font-semibold text-[#050507] shadow-[0_0_16px_rgba(245,158,11,0.35)] transition-all hover:bg-amber-400"
            >
              <span>Next</span>
              <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
    </>
  );
}
