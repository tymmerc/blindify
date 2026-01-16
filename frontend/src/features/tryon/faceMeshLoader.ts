type FaceMeshModule = {
  FaceMesh?: any
  Camera?: any
}

async function loadScript(src: string): Promise<void> {
  const existing = document.querySelector(`script[src="${src}"]`) as HTMLScriptElement | null
  if (existing && existing.dataset.loaded === "1") return

  return new Promise((resolve, reject) => {
    const script = existing ?? document.createElement("script")
    script.src = src
    script.async = true
    script.dataset.loaded = "1"
    script.onload = () => resolve()
    script.onerror = () => reject(new Error(`Failed to load ${src}`))
    if (!existing) document.head.appendChild(script)
  })
}

/**
  * Loads the MediaPipe FaceMesh UMD bundle from a CDN so we can run entirely in-browser.
  */
export async function loadFaceMeshBundle(): Promise<Required<FaceMeshModule>> {
  if (typeof window === "undefined") {
    throw new Error("FaceMesh must run in the browser")
  }

  const w = window as unknown as FaceMeshModule
  if (w.FaceMesh && w.Camera) {
    return { FaceMesh: w.FaceMesh, Camera: w.Camera }
  }

  await loadScript("https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4/face_mesh.js")
  await loadScript("https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils@0.3/camera_utils.js")

  const { FaceMesh, Camera } = window as unknown as FaceMeshModule
  if (!FaceMesh || !Camera) {
    throw new Error("MediaPipe FaceMesh could not be initialised")
  }
  return { FaceMesh, Camera }
}
