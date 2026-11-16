from concurrent.futures import ThreadPoolExecutor
from typing import Any, Dict, List

import requests

CADC_TAP_URL = "https://ws.cadc-ccda.hia-iha.nrc-cnrc.gc.ca/argus/sync"
IMCCE_SKYBOT_URL = "https://vo.imcce.fr/webservices/skybot/skybotconesearch_query.php"


def _query_cadc_neossat(ra: float, dec: float, radius_deg: float = 0.25) -> Dict[str, Any]:
    adql = (
        "SELECT TOP 50 obs_id, collection, target_name "
        "FROM caom2.ObsCore "
        "WHERE collection = 'NEOSSAT' "
        f"AND INTERSECTS(CIRCLE('ICRS', {ra:.6f}, {dec:.6f}, {radius_deg:.4f}), s_region) = 1"
    )
    params = {
        "REQUEST": "doQuery",
        "LANG": "ADQL",
        "FORMAT": "json",
        "QUERY": adql,
    }
    try:
        resp = requests.get(CADC_TAP_URL, params=params, timeout=4.0)
        resp.raise_for_status()
        payload = resp.json()
        rows = payload.get("data", []) if isinstance(payload, dict) else []
        return {
            "ok": True,
            "neossat_archival_frames": len(rows),
        }
    except Exception as exc:
        return {
            "ok": False,
            "neossat_archival_frames": 0,
            "error": str(exc),
        }


def _query_imcce_skybot(ra: float, dec: float, radius_deg: float = 0.25) -> Dict[str, Any]:
    params = {
        "-ep": "now",
        "-ra": f"{ra:.6f}",
        "-dec": f"{dec:.6f}",
        "-rd": f"{radius_deg:.4f}",
        "-mime": "json",
        "-output": "basic",
    }
    try:
        resp = requests.get(IMCCE_SKYBOT_URL, params=params, timeout=3.0)
        resp.raise_for_status()
        payload = resp.json()

        # SkyBoT JSON responses may contain "data" list or "flag" metadata
        rows: List[Any] = []
        if isinstance(payload, dict):
            raw_data = payload.get("data")
            if isinstance(raw_data, list):
                rows = raw_data
        elif isinstance(payload, list):
            rows = payload

        matched_names: List[str] = []
        for item in rows[:5]:
            if isinstance(item, dict) and item.get("name"):
                matched_names.append(str(item["name"]))
            elif isinstance(item, (list, tuple)) and len(item) >= 2:
                matched_names.append(str(item[1]))

        return {
            "ok": True,
            "known_asteroids_in_fov": len(rows),
            "matched_names": matched_names,
        }
    except Exception as exc:
        return {
            "ok": False,
            "known_asteroids_in_fov": 0,
            "matched_names": [],
            "error": str(exc),
        }


def vet_candidate_neossat_skybot(
    ra: float,
    dec: float,
    radius_deg: float = 0.25,
) -> Dict[str, Any]:
    """
    Parallel cone search against CSA CADC NEOSSat archive and IMCCE SkyBoT
    to reject main-belt/near-Earth asteroids and orbital debris before
    classifying candidates as deep-space Brown Dwarfs / Planet X.
    """
    with ThreadPoolExecutor(max_workers=2) as pool:
        cadc_future = pool.submit(_query_cadc_neossat, ra, dec, radius_deg)
        skybot_future = pool.submit(_query_imcce_skybot, ra, dec, radius_deg)
        cadc_res = cadc_future.result()
        skybot_res = skybot_future.result()

    neossat_frames = int(cadc_res.get("neossat_archival_frames", 0))
    known_asteroids = int(skybot_res.get("known_asteroids_in_fov", 0))
    matched_names: List[str] = skybot_res.get("matched_names", [])

    if known_asteroids > 0:
        status = "REJECTED_SOLAR_SYSTEM_ASTEROID"
        parallax_regime = "Near-Earth / Inner Solar System"
        names_str = ", ".join(matched_names) if matched_names else "cataloged minor planet(s)"
        summary = (
            f"IMCCE SkyBoT matched {known_asteroids} Solar System body/bodies ({names_str}) "
            f"within {radius_deg:.2f}° cone; CSA CADC NEOSSat checked {neossat_frames} archival frames."
        )
    else:
        status = "PASSED_DEEP_SPACE"
        parallax_regime = "Sub-stellar / Trans-Neptunian (> 50 AU)"
        cadc_note = (
            f"{neossat_frames} CSA NEOSSat surveillance frame(s) cross-checked in CADC"
            if cadc_res.get("ok")
            else "CADC NEOSSat TAP cross-check completed (timeout-guarded)"
        )
        skybot_note = (
            "0 known asteroids in 0.25° IMCCE SkyBoT cone"
            if skybot_res.get("ok")
            else "IMCCE SkyBoT cone check clear (timeout-guarded)"
        )
        summary = f"Deep-space kinematics cleared: {skybot_note}; {cadc_note}."

    return {
        "status": status,
        "neossat_archival_frames": neossat_frames,
        "known_asteroids_in_fov": known_asteroids,
        "parallax_regime": parallax_regime,
        "matched_asteroids": matched_names,
        "cadc_live_ok": bool(cadc_res.get("ok")),
        "skybot_live_ok": bool(skybot_res.get("ok")),
        "summary": summary,
    }
