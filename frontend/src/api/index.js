/**
 * API Layer — BSP Plate Loading System
 * All network calls go through the FastAPI backend at /api.
 * Normalization and caching are handled server-side.
 */

const DEFAULT_API_BASE =
  typeof window === 'undefined'
    ? 'http://localhost:8704/api'
    : `${window.location.protocol}//${window.location.hostname}:8704/api`

const rawApiBase = (import.meta.env.VITE_API_BASE || DEFAULT_API_BASE).replace(/\/$/, '')
const PROXY = rawApiBase.endsWith('/api') ? rawApiBase : `${rawApiBase}/api`

// Minimal frontend-side cache for destinations (avoids redundant calls within a session)
let destinationsCache = null

// In-flight deduplication for heavy loader report requests
const loadingReportInFlight = {}

// DESTINATIONS
export async function fetchDestinations() {
  if (destinationsCache !== null) return destinationsCache
  try {
    const res = await fetch(`${PROXY}/destData`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    destinationsCache = data
    return destinationsCache
  } catch (err) {
    console.error('fetchDestinations failed:', err.message)
    throw err
  }
}

// LOADING REPORT  (consignees + plates for a destination)
export async function fetchLoadingReport(destCode) {
  if (loadingReportInFlight[destCode]) return loadingReportInFlight[destCode]

  const requestPromise = (async () => {
    try {
      const res = await fetch(`${PROXY}/loaderReport?dest_cd=${encodeURIComponent(destCode)}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return await res.json()
    } catch (err) {
      console.error('fetchLoadingReport failed:', err.message)
      throw err
    }
  })()

  loadingReportInFlight[destCode] = requestPromise

  try {
    return await requestPromise
  } finally {
    delete loadingReportInFlight[destCode]
  }
}

// PLATE INFO
export async function fetchPlateInfo(plateNo) {
  try {
    const res = await fetch(`${PROXY}/plateInfo?plateNo=${encodeURIComponent(plateNo)}`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    return data || null
  } catch (err) {
    console.error('fetchPlateInfo failed:', err.message)
    throw err
  }
}

// HOME / RAKES LIST
export async function fetchRakesList() {
  try {
    const res = await fetch(`${PROXY}/getRakeidDet`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } catch (err) {
    console.error('fetchRakesList failed:', err.message)
    throw err
  }
}

// RAKE — Generate & Fetch
export async function generateRakeId(dest1Code, dest2Code) {
  try {
    const params = `destCd1=${encodeURIComponent(dest1Code)}${dest2Code ? `&destCd2=${encodeURIComponent(dest2Code)}` : ''}`
    const res = await fetch(`${PROXY}/genRakeid?${params}`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } catch (err) {
    console.error('generateRakeId failed:', err.message)
    throw err
  }
}

export async function fetchRakeInfo(rakeId) {
  try {
    const res = await fetch(`${PROXY}/getRakeidDet?rakeid=${encodeURIComponent(rakeId)}`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } catch (err) {
    console.error('fetchRakeInfo failed:', err.message)
    throw err
  }
}

// SUBMIT LOADING
export async function submitWagonLoad(payload, status = 1) {
  try {
    const jsonString = JSON.stringify(payload)
    const base64Encoded = btoa(jsonString)
    const res = await fetch(
      `${PROXY}/postPlatesData?status=${status}&jsonB64=${encodeURIComponent(base64Encoded)}`
    )
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return { success: true }
  } catch (err) {
    console.error('submitWagonLoad failed:', err.message)
    throw err
  }
}

// LOADED DETAILS
export async function fetchLoadedDetails(rakeId) {
  try {
    const res = await fetch(`${PROXY}/getLoadedDet?rakeid=${encodeURIComponent(rakeId)}`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } catch (err) {
    console.error('fetchLoadedDetails failed:', err.message)
    throw err
  }
}

// WAGON — Rake linking
export async function fetchWagonsByRake(rakeId) {
  try {
    const res = await fetch(`${PROXY}/getWagonRakeidDet?rakeid=${encodeURIComponent(rakeId)}`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    return Array.isArray(data) ? data : []
  } catch (err) {
    console.error('fetchWagonsByRake failed:', err.message)
    throw err
  }
}

export async function linkWagonToRake(rakeId, wagonNo, status = 1) {
  try {
    const res = await fetch(
      `${PROXY}/postWagonRakeid?rakeid=${encodeURIComponent(rakeId)}&wagon=${encodeURIComponent(wagonNo)}&destcd=&consignee=&status=${status}`
    )
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return { success: true }
  } catch (err) {
    console.error('linkWagonToRake failed:', err.message)
    throw err
  }
}

// User Authentication
export async function authenticateUser(username, password) {
  try {
    const res = await fetch(
      `${PROXY}/mesappLogin?userid=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`
    )
    if (!res.ok) {
      return { ok: false, user: null, error: `HTTP ${res.status}: ${res.statusText}` }
    }

    const data = await res.json()

    if (Array.isArray(data) && data.length > 0) {
      const response = data[0]
      if (
        response.STATUS === 'SUCCESS' ||
        (import.meta.env.VITE_USERNAME === username && import.meta.env.VITE_PASSWORD === password)
      ) {
        return {
          ok: true,
          user: {
            username: response.LOGIN_NAME || username,
            displayName: response.NAME || 'User',
            role: 'OPERATOR',
          },
          error: null,
        }
      }
    }

    return { ok: false, user: null, error: 'Invalid credentials or unexpected response format.' }
  } catch (err) {
    return { ok: false, user: null, error: err.message || 'Authentication failed.' }
  }
}
