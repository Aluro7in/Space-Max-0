import asyncio
from contextlib import asynccontextmanager
import json
import os
import sys
from typing import List, Optional

# Ensure 'backend/' is on sys.path so 'from server...' and 'from services...' work cleanly
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from fastapi import FastAPI, Query, Response, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from database import get_feedback_stats, init_db, record_rlhf_vote
from server.spherex_pipeline import pipeline
from services.ml_pipeline import tri_model_pipeline


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="Space-Max 0 Discovery Engine", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


class RLHFFeedbackPayload(BaseModel):
    ra: float
    dec: float
    user_vote: str  # "confirm_planet" | "flag_artifact" | "known_star" | "planet" | "glitch"
    target_name: Optional[str] = None
    epoch1: Optional[List[List[float]]] = None
    epoch2: Optional[List[List[float]]] = None
    spectrum: Optional[List[float]] = None
    csa_vetting_status: Optional[str] = None


@app.api_route("/", methods=["GET", "HEAD"])
def root():
    return {
        "status": "online",
        "service": "space-max-0-backend",
        "model_version": tri_model_pipeline.model_version,
        "endpoints": ["/health", "/api/scan", "/api/datacube", "/api/feedback", "/ws/telemetry", "/docs"],
    }


@app.get("/favicon.ico", include_in_schema=False)
def favicon():
    return Response(status_code=204)


@app.get("/health")
def health_check():
    return {
        "status": "online",
        "service": "space-max-0-backend",
        "model_version": tri_model_pipeline.model_version,
    }


@app.get("/api/scan")
def run_discovery_pipeline(
    ra: float = Query(166.332430, description="Target Right Ascension in degrees"),
    dec: float = Query(29.940572, description="Target Declination in degrees"),
    fov: float = Query(0.15, description="Field of View in degrees"),
    live_gaia: bool = Query(False, description="Run live ESA Gaia DR3 cone search"),
    live_skyview: bool = Query(False, description="Query live NASA SkyView before mockup fallback"),
):
    return pipeline.execute_full_scan(
        ra=ra,
        dec=dec,
        fov=fov,
        live_gaia=live_gaia,
        live_skyview=live_skyview,
    )


@app.get("/api/datacube")
def get_3d_datacube(
    ra: float = Query(166.332430, description="Target Right Ascension in degrees"),
    dec: float = Query(29.940572, description="Target Declination in degrees"),
    fov: float = Query(0.15, description="Field of View in degrees"),
    x_pos: float = 1569.5,
    y_pos: float = 237.6,
):
    return pipeline.extract_3d_datacube(
        x_pos=x_pos,
        y_pos=y_pos,
        ra=ra,
        dec=dec,
        fov=fov,
    )


@app.post("/api/feedback")
def record_rlhf_feedback(payload: RLHFFeedbackPayload):
    cached = pipeline.get_cached_target_tensors(payload.ra, payload.dec)
    epoch1 = payload.epoch1 if payload.epoch1 else cached["epoch1"]
    epoch2 = payload.epoch2 if payload.epoch2 else cached["epoch2"]
    spectrum = payload.spectrum if payload.spectrum else cached["spectrum"]
    csa_status = payload.csa_vetting_status or cached.get(
        "csa_vetting_status", "VERIFIED_DEEP_SPACE_CANDIDATE"
    )
    target_name = payload.target_name or f"RA {payload.ra:.4f} / Dec {payload.dec:+.4f}"

    rlhf_res = tri_model_pipeline.fine_tune_step(
        epoch1=epoch1,
        epoch2=epoch2,
        spectrum=spectrum,
        vote_label=payload.user_vote,
        pm_ra=float(cached.get("pm_ra", 14.2)),
        pm_dec=float(cached.get("pm_dec", -6.8)),
    )

    stats = record_rlhf_vote(
        ra=payload.ra,
        dec=payload.dec,
        target_name=target_name,
        vote_type=payload.user_vote,
        pre_confidence=rlhf_res["pre_confidence"],
        post_confidence=rlhf_res["post_confidence"],
        loss_value=rlhf_res["loss"],
        weight_delta=rlhf_res["weight_delta_norm"],
        model_version=rlhf_res["model_version"],
    )

    return {
        "status": "ok",
        "model_version": rlhf_res["model_version"],
        "pre_confidence": rlhf_res["pre_confidence"],
        "post_confidence": rlhf_res["post_confidence"],
        "initial_confidence": rlhf_res["initial_confidence"],
        "updated_confidence": rlhf_res["updated_confidence"],
        "confidence_delta": rlhf_res["confidence_delta"],
        "loss": rlhf_res["loss"],
        "gradient_loss": rlhf_res["loss"],
        "weight_delta_norm": rlhf_res["weight_delta_norm"],
        "brown_dwarf_prob": rlhf_res["brown_dwarf_prob"],
        "planet_x_prob": rlhf_res["planet_x_prob"],
        "artifact_prob": rlhf_res["artifact_prob"],
        "total_votes": stats["total_votes"],
        "planet_votes": stats["planet_votes"],
        "artifact_votes": stats["artifact_votes"],
        "known_star_votes": stats["known_star_votes"],
        "total_community_votes": stats["total_votes"],
        "recent_votes": stats["recent_votes"],
        "csa_vetting_status": csa_status,
    }


@app.get("/api/feedback/stats")
def fetch_rlhf_feedback_stats():
    return get_feedback_stats(model_version=tri_model_pipeline.model_version)


@app.websocket("/ws/telemetry")
async def telemetry_websocket(websocket: WebSocket):
    await websocket.accept()
    seq = 0
    try:
        while True:
            raw = await websocket.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                continue

            msg_type = msg.get("type")
            if msg_type == "ping":
                await websocket.send_json({"type": "pong", "ts": msg.get("ts")})
            elif msg_type == "subscribe":
                seq += 1
                await websocket.send_json({
                    "id": seq,
                    "type": "telemetry_ack",
                    "snr_db": 42.8,
                    "proper_motion_mas_yr": 15.74,
                })
            elif msg_type == "scan_initiated":
                seq += 1
                await websocket.send_json({
                    "id": seq,
                    "type": "scan_stage",
                    "stage": "ALIGNING SPHEREx CRYOGENIC OPTICS...",
                })
                await asyncio.sleep(0)
    except WebSocketDisconnect:
        pass
