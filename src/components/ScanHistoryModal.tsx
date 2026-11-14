import React, { useEffect } from 'react';
import { Download, History, Trash2, X } from 'lucide-react';
import type { ScanHistoryEntry } from '../types/telemetry';

interface ScanHistoryModalProps {
  isOpen: boolean;
  entries: ScanHistoryEntry[];
  onClose: () => void;
  onLoadEntry: (entry: ScanHistoryEntry) => void;
  onExportEntry: (entry: ScanHistoryEntry) => void;
  onClearHistory: () => void;
}

export function ScanHistoryModal({
  isOpen,
  entries,
  onClose,
  onLoadEntry,
  onExportEntry,
  onClearHistory,
}: ScanHistoryModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="scan-history-title"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-md"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl border border-slate-700/80 bg-slate-900/90 p-6 shadow-2xl backdrop-blur-xl"
      >
        <div className="mb-4 flex items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div>
            <p className="text-xs font-mono text-cyan-400">
              Cached Discovery Archive
            </p>
            <h3
              id="scan-history-title"
              className="mt-0.5 text-lg font-semibold text-white"
            >
              Scan History ({entries.length})
            </h3>
          </div>

          <div className="flex items-center gap-2">
            {entries.length > 0 && (
              <button
                type="button"
                onClick={onClearHistory}
                className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-300 hover:bg-rose-500/20"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Clear</span>
              </button>
            )}
            <button
              type="button"
              aria-label="Close scan history"
              onClick={onClose}
              className="rounded-lg border border-slate-700 bg-slate-950 p-1.5 text-slate-300 hover:border-cyan-500/50 hover:text-white"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto pr-1">
          {entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-800 bg-slate-950/60 px-6 py-12 text-center">
              <History className="mb-2.5 h-8 w-8 text-slate-600" aria-hidden="true" />
              <p className="text-sm font-medium text-slate-300">
                No Cached Scans Yet
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Each sky coordinate scan is automatically saved here for offline review and JSON export.
              </p>
            </div>
          ) : (
            entries.map((entry) => {
              const confirmed =
                entry.status.toLowerCase().includes('confirmed') ||
                entry.ai_verdicts.cnn_verdict_label
                  .toLowerCase()
                  .includes('confirmed');
              return (
                <div
                  key={entry.id}
                  className="rounded-xl border border-slate-800 bg-slate-950/80 p-4 transition-colors hover:border-cyan-500/40"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono text-xs font-semibold tabular-nums text-cyan-300">
                      RA {entry.coordinates.ra.toFixed(5)}° · Dec{' '}
                      {entry.coordinates.dec >= 0 ? '+' : ''}
                      {entry.coordinates.dec.toFixed(5)}° · FOV {entry.fov_deg}°
                    </span>
                    <span className="font-mono text-[11px] text-slate-400">
                      {new Date(entry.timestamp).toLocaleString()}
                    </span>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span
                      className={confirmed ? 'text-emerald-400' : 'text-amber-300'}
                    >
                      {entry.ai_verdicts.cnn_verdict_label}
                    </span>
                    <span className="text-fuchsia-300">
                      {entry.ai_verdicts.rnn_classification}
                    </span>
                  </div>

                  <div className="mt-3 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => onExportEntry(entry)}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs text-slate-200 hover:border-emerald-500/50 hover:text-emerald-300"
                    >
                      <Download className="h-3 w-3" aria-hidden="true" />
                      <span>Export JSON</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onLoadEntry(entry)}
                      className="rounded-lg bg-cyan-500/20 border border-cyan-500/40 px-2.5 py-1 text-xs font-medium text-cyan-300 hover:bg-cyan-500/30"
                    >
                      Load View
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
