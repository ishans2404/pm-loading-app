from datetime import datetime
from typing import Optional

import httpx
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from config import config
from normalizers import (
    normalize_destinations,
    normalize_loading_data,
    normalize_rakes_list,
)

app = FastAPI(title="BSP Plate Loading API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_destinations_cache = None
_destinations_cached_at: Optional[datetime] = None
_loading_report_cache: dict = {}


async def _upstream_get(path: str, params: dict = None):
    url = f"{config.UPSTREAM_BASE}/{path}"
    try:
        async with httpx.AsyncClient(timeout=config.REQUEST_TIMEOUT, verify=False) as client:
            resp = await client.get(url, params=params)
        resp.raise_for_status()
        
        # Try to parse as JSON, but fall back to raw response for non-JSON endpoints
        try:
            return resp.json()
        except ValueError:
            # Response is not valid JSON (e.g., empty or plain text)
            # Return the raw text for submission endpoints
            return resp.text or ""
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=exc.response.status_code, detail="Upstream request failed") from exc
    except httpx.RequestError as exc:
        raise HTTPException(status_code=502, detail="Upstream request error") from exc


@app.get("/api/destData")
async def dest_data():
    global _destinations_cache, _destinations_cached_at
    now = datetime.now()
    if _destinations_cache is not None and _destinations_cached_at:
        age = (now - _destinations_cached_at).total_seconds()
        if age < config.DESTINATION_CACHE_TTL:
            return _destinations_cache

    raw = await _upstream_get("destData.jsp")
    normalized = normalize_destinations(raw)
    _destinations_cache = normalized
    _destinations_cached_at = now
    return normalized


@app.get("/api/loaderReport")
async def loader_report(dest_cd: str = Query(...)):
    now = datetime.now()
    if dest_cd in _loading_report_cache:
        data, cached_at = _loading_report_cache[dest_cd]
        if (now - cached_at).total_seconds() < config.LOADING_REPORT_CACHE_TTL:
            return data

    raw = await _upstream_get(
        "loaderReport.jsp",
        {"dest_cd": dest_cd, "dispatch_mode": "RAIL", "ord_status": "O"},
    )
    normalized = normalize_loading_data(raw, dest_cd)
    _loading_report_cache[dest_cd] = (normalized, now)
    return normalized


@app.get("/api/plateInfo")
async def plate_info(plateNo: str = Query(...)):
    import re

    p_str = str(plateNo)
    full_plate_no = p_str if re.search(r"/\d+$", p_str) else f"{p_str}/1"
    raw = await _upstream_get("plateInfo.jsp", {"plateNo": full_plate_no})
    if isinstance(raw, list) and raw:
        return raw[0]
    return None


@app.get("/api/getRakeidDet")
async def get_rakeid_det(rakeid: Optional[str] = None):
    params = {"rakeid": rakeid} if rakeid else None
    raw = await _upstream_get("getRakeidDet.jsp", params)
    normalized = normalize_rakes_list(raw)
    if rakeid:
        if normalized:
            return normalized[0]
        return {
            "rakeId": str(rakeid),
            "status": "ACTIVE",
            "destinations": [],
            "totalWagons": None,
            "createdAt": datetime.now().isoformat(),
        }
    return normalized


@app.get("/api/genRakeid")
async def gen_rakeid(destCd1: str = Query(...), destCd2: Optional[str] = None):
    params = {"destCd1": destCd1}
    if destCd2:
        params["destCd2"] = destCd2

    raw = await _upstream_get("genRakeid.jsp", params)
    if isinstance(raw, list) and raw and "RakeId" in raw[0]:
        return {"rakeId": raw[0]["RakeId"]}
    raise HTTPException(status_code=500, detail="Invalid rake response: RakeId not found")


@app.get("/api/postPlatesData")
async def post_plates_data(status: int = Query(...), jsonB64: str = Query(...)):
    await _upstream_get("postPlatesData.jsp", {"status": status, "jsonB64": jsonB64})
    return {"success": True}


@app.get("/api/getLoadedDet")
async def get_loaded_det(rakeid: str = Query(...)):
    raw = await _upstream_get("getLoadedDet.jsp", {"rakeid": rakeid})
    return raw


@app.get("/api/getWagonRakeidDet")
async def get_wagon_rakeid_det(rakeid: str = Query(...)):
    raw = await _upstream_get("getWagonRakeidDet.jsp", {"rakeid": rakeid})
    return raw if isinstance(raw, list) else []


@app.get("/api/postWagonRakeid")
async def post_wagon_rakeid(
    rakeid: str = Query(...),
    wagon: str = Query(...),
    destcd: str = Query(default=""),
    consignee: str = Query(default=""),
    status: int = Query(default=1),
):
    await _upstream_get(
        "postWagonRakeid.jsp",
        {
            "rakeid": rakeid,
            "wagon": wagon,
            "destcd": destcd,
            "consignee": consignee,
            "status": status,
        },
    )
    return {"success": True}


@app.get("/api/mesappLogin")
async def mesapp_login(userid: str = Query(...), password: str = Query(...)):
    raw = await _upstream_get("mesappLogin.jsp", {"userid": userid, "password": password})
    return raw
