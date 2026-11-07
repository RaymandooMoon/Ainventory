import { COLOR_PALETTE } from './api.js';

function hexToRgb(hex) {
  const clean = hex.replace('#', '');
  const n = parseInt(clean, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbToHex(r, g, b) {
  return (
    '#' +
    [r, g, b]
      .map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0'))
      .join('')
  );
}

export function findClosestPaletteColor(hex) {
  const target = hexToRgb(hex);
  let best = COLOR_PALETTE[0];
  let bestDist = Infinity;

  for (const entry of COLOR_PALETTE) {
    const c = hexToRgb(entry.hex);
    // Weighted RGB distance approximating human perception
    const dr = target.r - c.r;
    const dg = target.g - c.g;
    const db = target.b - c.b;
    const dist = Math.sqrt(2 * dr * dr + 4 * dg * dg + 3 * db * db);
    if (dist < bestDist) {
      bestDist = dist;
      best = entry;
    }
  }
  return best;
}

export function processUploadedImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('이미지를 읽을 수 없습니다.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('이미지 디코딩에 실패했습니다.'));
      img.onload = () => {
        const maxEdge = 1000;
        let { width, height } = img;
        if (width > maxEdge || height > maxEdge) {
          if (width >= height) {
            height = Math.round((height * maxEdge) / width);
            width = maxEdge;
          } else {
            width = Math.round((width * maxEdge) / height);
            height = maxEdge;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        // Sample central 46% region where the garment usually sits
        const sx = Math.floor(width * 0.27);
        const sy = Math.floor(height * 0.24);
        const sw = Math.max(1, Math.floor(width * 0.46));
        const sh = Math.max(1, Math.floor(height * 0.52));
        const { data } = ctx.getImageData(sx, sy, sw, sh);

        let rSum = 0;
        let gSum = 0;
        let bSum = 0;
        let count = 0;

        for (let i = 0; i < data.length; i += 16) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const a = data[i + 3];
          if (a < 180) continue;
          // Ignore near-studio-background pixels (#F6F4EF / bright walls) unless image is all white
          if (r > 238 && g > 235 && b > 228) continue;
          rSum += r;
          gSum += g;
          bSum += b;
          count += 1;
        }

        let detectedHex = '#F2F1EC';
        if (count > 20) {
          detectedHex = rgbToHex(rSum / count, gSum / count, bSum / count);
        }

        const matchedColor = findClosestPaletteColor(detectedHex);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.86);

        resolve({
          dataUrl,
          detectedHex,
          matchedColor,
        });
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
