import asyncio
import json
import os
import sys

# Ensure 'backend/' is on sys.path so 'from server...' works from any directory
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from typing import Optional
from fastapi import FastAPI, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from server.spherex_pipeline import pipeline

app = FastAPI(title="Space-Max 0 Discovery Engine")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

rlhf_feedback_memory = []


class RLHFFeedbackPayload(BaseModel):
    ra: float
    dec: float
    user_vote: str  # "confirm_planet" | "flag_artifact" | "known_star"


@app.get("/health")
def health_check():
    return {"status": "online", "service": "space-max-0-backend"}


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
    is_positive = payload.user_vote.lower() in {
        "confirm_planet",
        "confirm planet x candidate",
        "confirm_candidate",
    }
    reward = 1 if is_positive else -1
    entry = {
        "ra": payload.ra,
        "dec": payload.dec,
        "user_vote": payload.user_vote,
        "rl_reward": reward,
    }
    rlhf_feedback_memory.append(entry)
    return {
        "status": "feedback_recorded",
        "total_community_votes": len(rlhf_feedback_memory),
        "latest_entry": entry,
    }


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
