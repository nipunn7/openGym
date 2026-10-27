// Progress photos, kept on this device only.
//
// Everything else in the app lives in one JSON state that is synced to the server and written
// to backups. Photos can't go there: a handful would blow the server's request limit and the
// ~5 MB localStorage quota. So they go in IndexedDB, resized to a sensible size, and never
// leave the device — which is also the right default for photos of your body.

const DB = 'opengym_photos', STORE = 'photos', MAX = 1080, QUALITY = 0.82

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' })
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}
async function tx(mode, fn) {
  const db = await open()
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode)
    const out = fn(t.objectStore(STORE))
    t.oncomplete = () => { db.close(); resolve(out && 'result' in out ? out.result : undefined) }
    t.onerror = () => { db.close(); reject(t.error) }
  })
}

export const photosSupported = () => typeof indexedDB !== 'undefined'

/** All photos, newest first: [{ id, d, pose, blob }]. */
export async function listPhotos() {
  const all = await tx('readonly', s => s.getAll())
  return (all || []).sort((a, b) => (a.d === b.d ? b.t - a.t : a.d < b.d ? 1 : -1))
}
export const deletePhoto = id => tx('readwrite', s => s.delete(id))

/** Shrink an image file to MAX px on its long side, as JPEG. */
export async function resize(file) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => createImageBitmap(file))
  const k = Math.min(1, MAX / Math.max(bmp.width, bmp.height))
  const c = document.createElement('canvas')
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k)
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height)
  bmp.close && bmp.close()
  return new Promise((resolve, reject) => c.toBlob(b => (b ? resolve(b) : reject(new Error('encode failed'))), 'image/jpeg', QUALITY))
}

/** Store a photo taken/picked by the user. */
export async function addPhoto(file, d, pose) {
  const blob = await resize(file)
  const p = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), d, pose, t: Date.now(), blob }
  await tx('readwrite', s => s.put(p))
  return p
}
