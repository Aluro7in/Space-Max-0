import os
import sqlite3
import threading
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "spacemax_rlhf.db")
_DB_LOCK = threading.Lock()


@contextmanager
def _get_connection():
    conn = sqlite3.connect(DB_PATH, check_same_thread=False, timeout=10.0)
    conn.row_factory = sqlite3.Row
    try:
        conn.execute("PRAGMA journal_mode=WAL;")
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db() -> None:
    """Initialize persistent SQLite tables (rlhf_feedback & scan_logs)."""
    with _DB_LOCK:
        with _get_connection() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS rlhf_feedback (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    ra REAL NOT NULL,
                    dec REAL NOT NULL,
                    target_name TEXT NOT NULL,
                    vote_type TEXT NOT NULL,
                    pre_confidence REAL NOT NULL,
                    post_confidence REAL NOT NULL,
                    loss_value REAL NOT NULL,
                    weight_delta REAL NOT NULL,
                    model_version TEXT NOT NULL,
                    created_at TEXT NOT NULL
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS scan_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    ra REAL NOT NULL,
                    dec REAL NOT NULL,
                    fov REAL NOT NULL,
                    s3_source TEXT NOT NULL,
                    peak_snr REAL NOT NULL,
                    proper_motion_mas_yr REAL NOT NULL,
                    top_spectral_match TEXT NOT NULL,
                    estimated_teff_k INTEGER NOT NULL,
                    csa_vetting_status TEXT NOT NULL,
                    created_at TEXT NOT NULL
                )
                """
            )


def log_scan_telemetry(
    ra: float,
    dec: float,
    fov: float,
    s3_source: str,
    peak_snr: float,
    proper_motion_mas_yr: float,
    top_spectral_match: str,
    estimated_teff_k: int,
    csa_vetting_status: str,
) -> int:
    created_at = datetime.now(timezone.utc).isoformat()
    with _DB_LOCK:
        with _get_connection() as conn:
            cur = conn.execute(
                """
                INSERT INTO scan_logs (
                    ra, dec, fov, s3_source, peak_snr, proper_motion_mas_yr,
                    top_spectral_match, estimated_teff_k, csa_vetting_status, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    float(ra),
                    float(dec),
                    float(fov),
                    str(s3_source),
                    float(peak_snr),
                    float(proper_motion_mas_yr),
                    str(top_spectral_match),
                    int(estimated_teff_k),
                    str(csa_vetting_status),
                    created_at,
                ),
            )
            return int(cur.lastrowid or 0)


def record_rlhf_vote(
    ra: float,
    dec: float,
    target_name: str,
    vote_type: str,
    pre_confidence: float,
    post_confidence: float,
    loss_value: float,
    weight_delta: float,
    model_version: str,
) -> Dict[str, Any]:
    created_at = datetime.now(timezone.utc).isoformat()
    with _DB_LOCK:
        with _get_connection() as conn:
            cur = conn.execute(
                """
                INSERT INTO rlhf_feedback (
                    ra, dec, target_name, vote_type,
                    pre_confidence, post_confidence,
                    loss_value, weight_delta, model_version, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    float(ra),
                    float(dec),
                    str(target_name),
                    str(vote_type),
                    float(pre_confidence),
                    float(post_confidence),
                    float(loss_value),
                    float(weight_delta),
                    str(model_version),
                    created_at,
                ),
            )
            vote_id = int(cur.lastrowid or 0)

    stats = get_feedback_stats(model_version=model_version)
    stats["latest_vote_id"] = vote_id
    stats["created_at"] = created_at
    return stats


def get_feedback_stats(model_version: Optional[str] = None) -> Dict[str, Any]:
    with _DB_LOCK:
        with _get_connection() as conn:
            total_row = conn.execute("SELECT COUNT(*) AS cnt FROM rlhf_feedback").fetchone()
            total_votes = int(total_row["cnt"]) if total_row else 0

            breakdown_rows = conn.execute(
                "SELECT vote_type, COUNT(*) AS cnt FROM rlhf_feedback GROUP BY vote_type"
            ).fetchall()
            breakdown: Dict[str, int] = {
                "confirm_planet": 0,
                "flag_artifact": 0,
                "known_star": 0,
            }
            for row in breakdown_rows:
                vt = str(row["vote_type"]).lower()
                cnt = int(row["cnt"])
                if vt in {"confirm_planet", "planet", "brown_dwarf", "confirm_candidate"}:
                    breakdown["confirm_planet"] += cnt
                elif vt in {"flag_artifact", "glitch", "artifact"}:
                    breakdown["flag_artifact"] += cnt
                else:
                    breakdown["known_star"] += cnt

            recent_rows = conn.execute(
                """
                SELECT id, ra, dec, target_name, vote_type,
                       pre_confidence, post_confidence,
                       loss_value, weight_delta, model_version, created_at
                FROM rlhf_feedback
                ORDER BY id DESC
                LIMIT 12
                """
            ).fetchall()

            recent_votes: List[Dict[str, Any]] = [
                {
                    "id": int(r["id"]),
                    "ra": float(r["ra"]),
                    "dec": float(r["dec"]),
                    "target_name": str(r["target_name"]),
                    "vote_type": str(r["vote_type"]),
                    "pre_confidence": float(r["pre_confidence"]),
                    "post_confidence": float(r["post_confidence"]),
                    "loss_value": float(r["loss_value"]),
                    "weight_delta": float(r["weight_delta"]),
                    "model_version": str(r["model_version"]),
                    "created_at": str(r["created_at"]),
                }
                for r in recent_rows
            ]

            loss_history = [
                {
                    "id": item["id"],
                    "loss": item["loss_value"],
                    "weight_delta": item["weight_delta"],
                    "model_version": item["model_version"],
                    "created_at": item["created_at"],
                }
                for item in reversed(recent_votes)
            ]

            scan_count_row = conn.execute(
                "SELECT COUNT(*) AS cnt FROM scan_logs"
            ).fetchone()
            total_scans = int(scan_count_row["cnt"]) if scan_count_row else 0

    result: Dict[str, Any] = {
        "total_votes": total_votes,
        "planet_votes": breakdown["confirm_planet"],
        "artifact_votes": breakdown["flag_artifact"],
        "known_star_votes": breakdown["known_star"],
        "breakdown": breakdown,
        "total_scans_logged": total_scans,
        "loss_history": loss_history,
        "recent_votes": recent_votes,
        "recent_discoveries": recent_votes,
    }
    if model_version is not None:
        result["model_version"] = model_version
    return result
