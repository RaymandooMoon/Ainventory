/**
 * Lazy-Loaded On-Device MediaPipe Face Landmarker (Requirements 9.b & 10.c)
 * - Dynamically imports `@mediapipe/tasks-vision` ONLY after explicit user biometric consent.
 * - Processes 478 facial landmarks strictly in local device memory (zero server transmission).
 * - Immediately closes/disposes WASM instance after sampling cheek/forehead skin regions,
 *   with automatic local canvas ROI fallback when offline.
 */

export async function analyzeFaceSkinOnDevice(imageElement) {
  let landmarkPoints = null;
  let usedWasm = false;
  let faceLandmarker = null;

  try {
    const vision = await import('@mediapipe/tasks-vision');
    if (vision?.FilesetResolver && vision?.FaceLandmarker) {
      const fileset = await Promise.race([
        vision.FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
        ),
        new Promise((_, reject) => setTimeout(() => reject(new Error('wasm-timeout')), 3200)),
      ]);
      faceLandmarker = await vision.FaceLandmarker.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath:
            'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
          delegate: 'CPU',
        },
        runningMode: 'IMAGE',
        numFaces: 1,
      });
      const result = faceLandmarker.detect(imageElement);
      if (result?.faceLandmarks?.[0]?.length >= 468) {
        const lm = result.faceLandmarks[0];
        // Left cheek (#234/#50), right cheek (#454/#280), forehead (#10/#151), chin (#152)
        landmarkPoints = {
          cheekL: { x: lm[50].x, y: lm[50].y },
          cheekR: { x: lm[280].x, y: lm[280].y },
          forehead: { x: lm[151].x, y: lm[151].y },
          chin: { x: lm[152].x, y: lm[152].y },
        };
        usedWasm = true;
      }
    }
  } catch {
    // Offline or sandbox environment without external WASM model CDN — fall back to local portrait ROI
  } finally {
    try {
      faceLandmarker?.close?.();
    } catch {
      // ignore close error
    }
  }

  return {
    usedWasm,
    processedLocally: true,
    pins: landmarkPoints || {
      cheekL: { x: 0.37, y: 0.54 },
      cheekR: { x: 0.63, y: 0.54 },
      forehead: { x: 0.50, y: 0.34 },
      chin: { x: 0.50, y: 0.72 },
    },
  };
}
