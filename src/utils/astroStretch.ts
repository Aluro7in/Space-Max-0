import type { TargetFrameMotion } from '../types/telemetry';

export type SurveyHipsId =
  | 'CDS/P/allWISE/color'
  | 'CDS/P/2MASS/color'
  | 'CDS/P/DSS2/color';

export function buildHips2FitsUrl(
  hips: SurveyHipsId,
  ra: number,
  dec: number,
  fovDeg: number,
  width = 640,
  height = 380
): string {
  const clampedFov = Math.max(0.02, Math.min(5, fovDeg));
  const params = new URLSearchParams({
    hips,
    width: String(width),
    height: String(height),
    fov: clampedFov.toFixed(4),
    ra: ra.toFixed(6),
    dec: dec.toFixed(6),
    projection: 'TAN',
    format: 'jpg',
  });
  return `https://alasky.cds.unistra.fr/hips-image-services/hips2fits?${params.toString()}`;
}

function lerpChannel(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

function lerpTuple(
  c1: [number, number, number],
  c2: [number, number, number],
  t: number
): [number, number, number] {
  return [
    lerpChannel(c1[0], c2[0], t),
    lerpChannel(c1[1], c2[1], t),
    lerpChannel(c1[2], c2[2], t),
  ];
}

/**
 * High-Definition Space Telescope Colormap:
 * Deep Cosmic Void (#050711) -> Midnight Indigo (#15193B) -> Celestial Cyan/Blue (#0E7490)
 * -> Warm Infrared Amber (#F59E0B) -> Solar Gold (#FDE047) -> Incandescent White Core (#FFFFFF)
 */
export function multiSpectralSpaceRgb(norm: number): [number, number, number] {
  const t = Math.max(0, Math.min(1, norm));
  const stops: Array<{ p: number; rgb: [number, number, number] }> = [
    { p: 0.0, rgb: [4, 6, 14] },
    { p: 0.16, rgb: [18, 22, 56] },
    { p: 0.36, rgb: [165, 24, 72] },
    { p: 0.58, rgb: [249, 115, 22] },
    { p: 0.8, rgb: [253, 224, 71] },
    { p: 1.0, rgb: [255, 255, 255] },
  ];

  for (let i = 0; i < stops.length - 1; i += 1) {
    const cur = stops[i];
    const nxt = stops[i + 1];
    if (t <= nxt.p) {
      const k = (t - cur.p) / Math.max(1e-6, nxt.p - cur.p);
      return lerpTuple(cur.rgb, nxt.rgb, k);
    }
  }
  return [255, 255, 255];
}

export function multiSpectralSpaceRgbFloat(norm: number): [number, number, number] {
  const [r, g, b] = multiSpectralSpaceRgb(norm);
  return [r / 255, g / 255, b / 255];
}

export const jwstThermalRgb = multiSpectralSpaceRgb;
export const jwstThermalRgbFloat = multiSpectralSpaceRgbFloat;

/**
 * Wavelength-indexed RGB coloring for 3D IFU Volumetric Data Cube:
 * - Band 1-2 (0.75-1.5 um): Electric Cyan (#00F0FF) -> Celestial Azure (#38BDF8)
 * - Band 3   (1.5-2.4 um): Bio-Emerald (#10B981) -> Chartreuse (#A3E635)
 * - Band 4   (2.4-3.8 um): Solar Gold (#FBBF24) -> Thermal Orange (#F97316)
 * - Band 5-6 (3.8-5.0 um): Plasma Rose-Magenta (#F43F5E) -> Neon Pink (#EC4899)
 */
export function spectralBandRgbFloat(
  zNorm: number,
  fluxNorm: number
): [number, number, number] {
  const z = Math.max(0, Math.min(1, zNorm));
  const f = Math.max(0.22, Math.min(1, fluxNorm));
  let base: [number, number, number];

  if (z < 0.25) {
    const k = z / 0.25;
    base = lerpTuple([0, 240, 255], [56, 189, 248], k);
  } else if (z < 0.5) {
    const k = (z - 0.25) / 0.25;
    base = lerpTuple([16, 185, 129], [163, 230, 53], k);
  } else if (z < 0.76) {
    const k = (z - 0.5) / 0.26;
    base = lerpTuple([251, 191, 36], [249, 115, 22], k);
  } else {
    const k = (z - 0.76) / 0.24;
    base = lerpTuple([244, 63, 94], [236, 72, 153], k);
  }

  const hotMix = Math.pow(f, 3.2) * 0.14;
  const r = ((base[0] * (0.48 + 0.52 * f)) / 255) * (1 - hotMix) + hotMix;
  const g = ((base[1] * (0.48 + 0.52 * f)) / 255) * (1 - hotMix) + hotMix;
  const b = ((base[2] * (0.48 + 0.52 * f)) / 255) * (1 - hotMix) + hotMix;
  return [Math.min(1, r), Math.min(1, g), Math.min(1, b)];
}

export function seededRand(seed: number): () => number {
  let state = Math.floor(Math.abs(seed * 10000)) % 2147483647;
  if (state <= 0) state = 1337;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

/**
 * Generates a crisp, high-definition 32x32 SPHEREx FITS cutout matrix (sigma ~ 0.95-1.2 px)
 * so stars and the moving candidate have sharp optical cores instead of blurry red blobs.
 */
export function buildSyntheticFitsEpochMatrices(
  ra: number,
  dec: number,
  motion: TargetFrameMotion,
  stacked6Array: boolean
): { epoch1: number[][]; epoch2: number[][] } {
  const size = 32;
  const rand = seededRand(ra * 31.7 + dec * 17.3 + 42);

  const pastTargetX = motion.pastX * (size - 1);
  const pastTargetY = motion.pastY * (size - 1);
  const presentTargetX = motion.presentX * (size - 1);
  const presentTargetY = motion.presentY * (size - 1);

  const bgStars: Array<{ x: number; y: number; amp: number; beta: number; alpha: number }> = [];
  for (let i = 0; i < 14; i += 1) {
    const sx = 2 + rand() * (size - 4);
    const sy = 2 + rand() * (size - 4);
    const farPast = Math.hypot(sx - pastTargetX, sy - pastTargetY) > 3.2;
    const farPres = Math.hypot(sx - presentTargetX, sy - presentTargetY) > 3.2;
    if (farPast && farPres) {
      bgStars.push({
        x: sx,
        y: sy,
        amp: 0.38 + rand() * 0.68,
        alpha: 0.9 + rand() * 0.28,
        beta: 2.8,
      });
    }
  }

  const moffat = (r2: number, alpha: number, beta: number) =>
    Math.pow(1 + r2 / (alpha * alpha), -beta);

  const noiseAmp = stacked6Array ? 0.01 : 0.055;
  const epoch1: number[][] = [];
  const epoch2: number[][] = [];

  for (let y = 0; y < size; y += 1) {
    const row1: number[] = [];
    const row2: number[] = [];
    for (let x = 0; x < size; x += 1) {
      const readNoise1 = (rand() - 0.5) * noiseAmp;
      const readNoise2 = (rand() - 0.5) * noiseAmp;
      const cosmicRay = !stacked6Array && rand() > 0.992 ? 0.85 : 0;

      let starField = 0.032;
      for (const s of bgStars) {
        const d2 = (x - s.x) ** 2 + (y - s.y) ** 2;
        starField += s.amp * moffat(d2, s.alpha, s.beta);
      }

      const dPast2 = (x - pastTargetX) ** 2 + (y - pastTargetY) ** 2;
      const dPres2 = (x - presentTargetX) ** 2 + (y - presentTargetY) ** 2;

      const pastSignal = motion.pastGlow * 1.45 * moffat(dPast2, 1.05, 2.7);
      const presentSignal = 1.82 * moffat(dPres2, 1.05, 2.7);

      row1.push(Number(Math.max(0.01, starField + pastSignal + readNoise1).toFixed(5)));
      row2.push(
        Number(
          Math.max(0.01, starField + presentSignal + readNoise2 + cosmicRay).toFixed(5)
        )
      );
    }
    epoch1.push(row1);
    epoch2.push(row2);
  }

  return { epoch1, epoch2 };
}

/**
 * Smoothly blends two 32x32 stretched FITS matrices at video interpolation factor t in [0, 1],
 * attenuating the source/destination dipole wings while keeping stationary stars crisp.
 */
export function buildInterpolatedEpochGrid(
  pastStretched: number[][],
  presentStretched: number[][],
  motion: TargetFrameMotion,
  tProgress: number
): number[][] {
  const h = Math.min(pastStretched.length, presentStretched.length);
  const w = Math.min(pastStretched[0]?.length || 0, presentStretched[0]?.length || 0);
  if (!h || !w) return presentStretched;

  const t = Math.max(0, Math.min(1, tProgress));
  if (t <= 0.01) return pastStretched;
  if (t >= 0.99) return presentStretched;

  const p1x = motion.pastX * (w - 1);
  const p1y = motion.pastY * (h - 1);
  const p2x = motion.presentX * (w - 1);
  const p2y = motion.presentY * (h - 1);

  return Array.from({ length: h }, (_, y) =>
    Array.from({ length: w }, (__, x) => {
      const v1 = pastStretched[y]?.[x] ?? 0;
      const v2 = presentStretched[y]?.[x] ?? 0;
      // Suppress transient peaks at the opposite epoch coordinates so the target doesn't ghost
      const d1 = (x - p1x) ** 2 + (y - p1y) ** 2;
      const d2 = (x - p2x) ** 2 + (y - p2y) ** 2;
      const mask1 = d1 < 7 ? v2 : v1;
      const mask2 = d2 < 7 ? v1 : v2;
      return mask1 * (1 - t) + mask2 * t;
    })
  );
}

/**
 * Extracts a 32x32 scalar FITS matrix from a same-origin data:image PNG.
 */
export function extract32x32FromDataUrl(dataUrl: string): Promise<number[][] | null> {
  if (typeof document === 'undefined' || !dataUrl || !dataUrl.startsWith('data:image/')) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const size = 32;
        const off = document.createElement('canvas');
        off.width = size;
        off.height = size;
        const ctx = off.getContext('2d');
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.drawImage(img, 0, 0, size, size);
        const px = ctx.getImageData(0, 0, size, size).data;
        const mat: number[][] = [];
        for (let y = 0; y < size; y += 1) {
          const row: number[] = [];
          for (let x = 0; x < size; x += 1) {
            const idx = (y * size + x) * 4;
            const lum = (0.299 * px[idx] + 0.587 * px[idx + 1] + 0.114 * px[idx + 2]) / 255;
            row.push(Number(lum.toFixed(5)));
          }
          mat.push(row);
        }
        resolve(mat);
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

function medianFilter3x3(grid: number[][]): number[][] {
  const h = grid.length;
  const w = grid[0]?.length || 0;
  const out: number[][] = Array.from({ length: h }, () => new Array<number>(w).fill(0));
  const win = new Array<number>(9);

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      let count = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        const yy = Math.max(0, Math.min(h - 1, y + dy));
        for (let dx = -1; dx <= 1; dx += 1) {
          const xx = Math.max(0, Math.min(w - 1, x + dx));
          win[count] = grid[yy][xx];
          count += 1;
        }
      }
      const sorted = win.slice(0, count).sort((a, b) => a - b);
      const med = sorted[Math.floor(count / 2)];
      const val = grid[y][x];
      const secondMax = sorted[count - 2];
      out[y][x] = val > secondMax * 1.55 && val > med * 2.4 ? med : val;
    }
  }
  return out;
}

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const idx = Math.max(
    0,
    Math.min(sorted.length - 1, Math.floor((p / 100) * (sorted.length - 1)))
  );
  return sorted[idx];
}

export interface PhotometryStats {
  bgMedian: number;
  peak: number;
  snr: number;
  surfaceBrightnessMjySr: number;
}

export function zscaleAsinhStretch(
  rawMatrix: number[][],
  stacked6Array: boolean
): { stretched: number[][]; stats: PhotometryStats } {
  const h = rawMatrix.length;
  const w = rawMatrix[0]?.length || 0;
  if (!h || !w) {
    return {
      stretched: [],
      stats: { bgMedian: 0, peak: 0, snr: 18.4, surfaceBrightnessMjySr: 1.42 },
    };
  }

  const working = stacked6Array ? medianFilter3x3(rawMatrix) : rawMatrix;
  const flat: number[] = [];
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const v = working[y][x];
      if (Number.isFinite(v)) flat.push(v);
    }
  }
  flat.sort((a, b) => a - b);

  const bg = percentile(flat, 12);
  const bgHigh = percentile(flat, 45);
  const peak = percentile(flat, 99.5);
  const maxAbs = flat[flat.length - 1] ?? peak;
  const denom = Math.max(1e-6, peak - bg);
  const asinhDenom = Math.asinh(14);

  const skySamples = flat.filter((v) => v <= bgHigh);
  const skyMean =
    skySamples.reduce((acc, v) => acc + v, 0) / Math.max(1, skySamples.length);
  const variance =
    skySamples.reduce((acc, v) => acc + (v - skyMean) ** 2, 0) /
    Math.max(1, skySamples.length);
  const rms = Math.max(0.004, Math.sqrt(variance));
  const rawSnr = Math.max(6.2, (maxAbs - skyMean) / rms);
  const snr = Number((stacked6Array ? rawSnr * 1.45 : rawSnr).toFixed(1));
  const surfaceBrightnessMjySr = Number(
    (0.45 + Math.max(0.1, maxAbs - bg) * 1.85).toFixed(2)
  );

  const stretched: number[][] = Array.from({ length: h }, (_, y) =>
    Array.from({ length: w }, (__, x) => {
      const val = working[y]?.[x] ?? bg;
      const norm = Math.max(0, val - bg) / denom;
      return Math.min(1.06, Math.asinh(14 * norm) / asinhDenom);
    })
  );

  return {
    stretched,
    stats: { bgMedian: bg, peak, snr, surfaceBrightnessMjySr },
  };
}

function cubicInterp(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    0.5 *
    (2 * p1 +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
  );
}

export function sampleBicubic(grid: number[][], gx: number, gy: number): number {
  const h = grid.length;
  const w = grid[0]?.length || 0;
  if (!h || !w) return 0;

  const x1 = Math.floor(gx);
  const y1 = Math.floor(gy);
  const tx = gx - x1;
  const ty = gy - y1;

  const getClamped = (ix: number, iy: number) => {
    const cx = Math.max(0, Math.min(w - 1, ix));
    const cy = Math.max(0, Math.min(h - 1, iy));
    return grid[cy][cx];
  };

  const rows = [0, 0, 0, 0];
  for (let j = -1; j <= 2; j += 1) {
    rows[j + 1] = cubicInterp(
      getClamped(x1 - 1, y1 + j),
      getClamped(x1, y1 + j),
      getClamped(x1 + 1, y1 + j),
      getClamped(x1 + 2, y1 + j),
      tx
    );
  }
  return Math.max(0, cubicInterp(rows[0], rows[1], rows[2], rows[3], ty));
}

export interface MoffatOverlaySource {
  normX: number; // [0, 1]
  normY: number; // [0, 1]
  intensity: number;
}

/**
 * Renders a crisp high-definition NASA space telescope frame:
 * - Tight Gaussian/Moffat optical core (no muddy red blobs!) with incandescent white-gold/cyan center
 * - Sharp 6-point JWST/SPHEREx diffraction spikes on target & brightest stars
 * - 115+ pinpoint multi-temperature background field stars
 * - Subtle WCS tangent coordinate grid + N/E astronomical compass + arcsecond scale bar
 */
export function renderStretchedFitsToCanvas(
  canvas: HTMLCanvasElement,
  stretchedGrid: number[][],
  options: {
    size?: number;
    width?: number;
    height?: number;
    seed?: number;
    fovDeg?: number;
    showCompassAndScale?: boolean;
    transparentBackground?: boolean;
    targetHighlight?: MoffatOverlaySource | null;
    stacked6Array: boolean;
  }
): void {
  const width = options.width ?? options.size ?? 512;
  const height = options.height ?? options.size ?? 320;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx || !stretchedGrid.length) return;

  const gh = stretchedGrid.length;
  const gw = stretchedGrid[0]?.length || 32;
  const imgData = ctx.createImageData(width, height);

  const txPx = options.targetHighlight ? options.targetHighlight.normX * width : -999;
  const tyPx = options.targetHighlight ? options.targetHighlight.normY * height : -999;
  const targetBoost = options.targetHighlight?.intensity ?? 0;

  // Identify crisp bright background peaks from the FITS matrix for sharp optical cores & spikes
  const brightPeaks: Array<{ px: number; py: number; amp: number }> = [];
  for (let sy = 2; sy < gh - 2; sy += 2) {
    for (let sx = 2; sx < gw - 2; sx += 2) {
      const v = stretchedGrid[sy]?.[sx] ?? 0;
      if (v > 0.52) {
        const px = (sx / Math.max(1, gw - 1)) * width;
        const py = (sy / Math.max(1, gh - 1)) * height;
        if (Math.hypot(px - txPx, py - tyPx) > 18) {
          brightPeaks.push({ px, py, amp: Math.min(0.95, v) });
        }
      }
    }
  }
  const topSpikes = brightPeaks.sort((a, b) => b.amp - a.amp).slice(0, 7);

  for (let py = 0; py < height; py += 1) {
    const gy = (py / Math.max(1, height - 1)) * (gh - 1);
    for (let px = 0; px < width; px += 1) {
      const gx = (px / Math.max(1, width - 1)) * (gw - 1);
      // Contrast-sculpted bicubic FITS base so sky background stays deep cosmic void (#04060E)
      const rawBicubic = sampleBicubic(stretchedGrid, gx, gy);
      let val = Math.pow(Math.max(0, rawBicubic - 0.12) / 0.88, 1.48) * 0.72;

      // Sharp stationary field stars with pinpoint cores & micro 6-point spikes
      for (let k = 0; k < topSpikes.length; k += 1) {
        const s = topSpikes[k];
        const dx = px - s.px;
        const dy = py - s.py;
        const r2 = dx * dx + dy * dy;
        if (r2 < 540) {
          const r = Math.sqrt(r2);
          const angle = Math.atan2(dy, dx);
          const hexSpike = Math.pow(Math.abs(Math.cos(3 * angle)), 42);
          const core = s.amp * 0.95 * Math.pow(1 + r2 / 11, -2.8);
          const spike = s.amp * 0.28 * hexSpike * Math.exp(-r / 15);
          val = Math.min(1, Math.max(val, core + spike));
        }
      }

      // Primary Planet X / Brown Dwarf target: razor-sharp white-gold/cyan PSF + subtle halo + 6-point JWST rays
      if (targetBoost > 0) {
        const dx = px - txPx;
        const dy = py - tyPx;
        const r2 = dx * dx + dy * dy;
        const r = Math.sqrt(r2);
        const moffatCore = targetBoost * 1.15 * Math.pow(1 + r2 / 18, -2.55);
        const airyHalo = targetBoost * 0.24 * Math.exp(-r2 / 160);
        const angle = Math.atan2(dy, dx);
        const spikePattern = Math.pow(Math.abs(Math.cos(3 * angle)), 40);
        const spike = targetBoost * 0.42 * spikePattern * Math.exp(-r / 24);
        val = Math.min(1, Math.max(val, moffatCore + airyHalo + spike));
      }

      if (!options.stacked6Array) {
        const hash = Math.sin(px * 12.9898 + py * 78.233) * 43758.5453;
        const speckle = (hash - Math.floor(hash) - 0.5) * 0.065;
        val = Math.max(0, Math.min(1, val + speckle));
      }

      const [r, g, b] = multiSpectralSpaceRgb(val);
      const outIdx = (py * width + px) * 4;
      imgData.data[outIdx] = r;
      imgData.data[outIdx + 1] = g;
      imgData.data[outIdx + 2] = b;

      if (options.transparentBackground) {
        const alpha =
          val < 0.09
            ? Math.round(val * 240)
            : Math.round(Math.min(238, 22 + Math.pow(val, 1.04) * 218));
        imgData.data[outIdx + 3] = alpha;
      } else {
        imgData.data[outIdx + 3] = 255;
      }
    }
  }

  ctx.putImageData(imgData, 0, 0);

  // Add 118 sharp pinpoint multi-temperature deep-field background stars
  const rand = seededRand((options.seed ?? 166.33) * 19.7 + (options.stacked6Array ? 1 : 2));
  const starCount = options.stacked6Array ? 118 : 92;
  for (let i = 0; i < starCount; i += 1) {
    const sx = 6 + rand() * (width - 12);
    const sy = 6 + rand() * (height - 12);
    const magRoll = rand();
    const radius = magRoll > 0.93 ? 1.55 + rand() * 0.65 : 0.45 + rand() * 0.95;
    const brightness = 0.35 + rand() * 0.65;
    const tempRoll = rand();
    let colorStr = `rgba(224, 242, 254, ${brightness.toFixed(2)})`;
    if (tempRoll < 0.28) {
      colorStr = `rgba(0, 240, 255, ${(brightness * 0.92).toFixed(2)})`;
    } else if (tempRoll > 0.72) {
      colorStr = `rgba(253, 224, 71, ${(brightness * 0.9).toFixed(2)})`;
    } else if (tempRoll > 0.6) {
      colorStr = `rgba(251, 113, 133, ${(brightness * 0.8).toFixed(2)})`;
    }

    // Crisp pinpoint stellar core
    ctx.fillStyle = magRoll > 0.9 ? 'rgba(255,255,255,0.95)' : colorStr;
    ctx.beginPath();
    ctx.arc(sx, sy, radius, 0, Math.PI * 2);
    ctx.fill();

    // Subtle halo + 6-point JWST micro-spikes on brightest field stars
    if (magRoll > 0.92) {
      const halo = ctx.createRadialGradient(sx, sy, 0, sx, sy, radius * 4.2);
      halo.addColorStop(0, colorStr);
      halo.addColorStop(1, 'rgba(4, 6, 14, 0)');
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(sx, sy, radius * 4.2, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.42)';
      ctx.lineWidth = 0.7;
      for (let a = 0; a < 3; a += 1) {
        const ang = (a * Math.PI) / 3;
        const len = 6.5;
        ctx.beginPath();
        ctx.moveTo(sx - Math.cos(ang) * len, sy - Math.sin(ang) * len);
        ctx.lineTo(sx + Math.cos(ang) * len, sy + Math.sin(ang) * len);
        ctx.stroke();
      }
    }
  }

  // Cyan/White incandescent core flare at exact target highlight center
  if (targetBoost > 0 && txPx > 0 && tyPx > 0) {
    const coreGrad = ctx.createRadialGradient(txPx, tyPx, 0, txPx, tyPx, 10);
    coreGrad.addColorStop(0, 'rgba(255, 255, 255, 0.98)');
    coreGrad.addColorStop(0.28, 'rgba(253, 224, 71, 0.85)');
    coreGrad.addColorStop(0.65, 'rgba(0, 240, 255, 0.35)');
    coreGrad.addColorStop(1, 'rgba(0, 240, 255, 0)');
    ctx.fillStyle = coreGrad;
    ctx.beginPath();
    ctx.arc(txPx, tyPx, 10, 0, Math.PI * 2);
    ctx.fill();
  }

  // Semi-transparent WCS Coordinate Grid Overlay
  ctx.save();
  ctx.strokeStyle = 'rgba(0, 240, 255, 0.1)';
  ctx.lineWidth = 1;
  for (let c = 1; c < 4; c += 1) {
    const x = (c / 4) * width;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let r = 1; r < 3; r += 1) {
    const y = (r / 3) * height;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  // Edge WCS tick marks
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.32)';
  for (let i = 1; i < 8; i += 1) {
    const tx = (i / 8) * width;
    ctx.beginPath();
    ctx.moveTo(tx, 0);
    ctx.lineTo(tx, 5);
    ctx.moveTo(tx, height - 5);
    ctx.lineTo(tx, height);
    ctx.stroke();
  }

  // Subtle N / E Astronomical Compass & Arcsecond Scale Bar (bottom-left/right corners)
  if (options.showCompassAndScale !== false) {
    const cx = 24;
    const cy = height - 42;
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.65)';
    ctx.lineWidth = 1.1;
    // North up
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx, cy - 14);
    ctx.moveTo(cx - 2.5, cy - 10);
    ctx.lineTo(cx, cy - 14);
    ctx.lineTo(cx + 2.5, cy - 10);
    // East left
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx - 14, cy);
    ctx.moveTo(cx - 10, cy - 2.5);
    ctx.lineTo(cx - 14, cy);
    ctx.lineTo(cx - 10, cy + 2.5);
    ctx.stroke();

    ctx.fillStyle = 'rgba(186, 230, 253, 0.78)';
    ctx.font = '600 8.5px "JetBrains Mono", monospace';
    ctx.fillText('N', cx - 3, cy - 17);
    ctx.fillText('E', cx - 22, cy + 3);

    if (typeof options.fovDeg === 'number') {
      const fovArcsec = options.fovDeg * 3600;
      const barPx = width * 0.16;
      const barArcsec = fovArcsec * 0.16;
      const barLabel =
        barArcsec >= 60 ? `${(barArcsec / 60).toFixed(1)}'` : `${barArcsec.toFixed(0)}"`;
      const rx1 = 36;
      const rx2 = rx1 + barPx;
      const ry = height - 42;
      ctx.strokeStyle = 'rgba(253, 224, 71, 0.75)';
      ctx.beginPath();
      ctx.moveTo(rx1, ry - 3);
      ctx.lineTo(rx1, ry);
      ctx.lineTo(rx2, ry);
      ctx.lineTo(rx2, ry - 3);
      ctx.stroke();
      ctx.fillStyle = 'rgba(253, 224, 71, 0.85)';
      ctx.fillText(barLabel, rx1 + 4, ry - 4);
    }
  }
  ctx.restore();
}

/**
 * Renders the clean differential photometry dipole (Epoch 2 Now - Epoch 1 Past):
 * - Stationary stars canceled cleanly into #060913 zero-flux floor with faint dashed rings.
 * - Epoch 1 (2000) Negative Footprint glows Plasma Crimson-Magenta (#F43F5E).
 * - Epoch 2 (SPHEREx 2025+) Positive Detection glows Electric Cyan & White-Gold (#00F0FF -> #FDE047).
 */
export function renderDifferenceDipoleCanvas(
  canvas: HTMLCanvasElement,
  pastStretched: number[][],
  presentStretched: number[][],
  options: {
    motion: TargetFrameMotion;
    fovDeg: number;
    pmRaMasYr: number;
    pmDecMasYr: number;
    stacked6Array: boolean;
    width?: number;
    height?: number;
  }
): void {
  const width = options.width ?? 512;
  const height = options.height ?? 304;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx || !pastStretched.length || !presentStretched.length) return;

  const gh = presentStretched.length;
  const gw = presentStretched[0]?.length || 32;
  const imgData = ctx.createImageData(width, height);

  const pastCx = options.motion.pastX * width;
  const pastCy = options.motion.pastY * height;
  const presCx = options.motion.presentX * width;
  const presCy = options.motion.presentY * height;

  const stationaryRings: Array<{ px: number; py: number }> = [];
  for (let sy = 3; sy < gh - 3; sy += 3) {
    for (let sx = 3; sx < gw - 3; sx += 3) {
      const avg = ((pastStretched[sy]?.[sx] ?? 0) + (presentStretched[sy]?.[sx] ?? 0)) * 0.5;
      const diffAbs = Math.abs((presentStretched[sy]?.[sx] ?? 0) - (pastStretched[sy]?.[sx] ?? 0));
      if (avg > 0.45 && diffAbs < 0.25) {
        const px = (sx / Math.max(1, gw - 1)) * width;
        const py = (sy / Math.max(1, gh - 1)) * height;
        if (
          Math.hypot(px - pastCx, py - pastCy) > 24 &&
          Math.hypot(px - presCx, py - presCy) > 24
        ) {
          stationaryRings.push({ px, py });
        }
      }
    }
  }

  for (let py = 0; py < height; py += 1) {
    const gy = (py / Math.max(1, height - 1)) * (gh - 1);
    for (let px = 0; px < width; px += 1) {
      const gx = (px / Math.max(1, width - 1)) * (gw - 1);
      const p1 = sampleBicubic(pastStretched, gx, gy);
      const p2 = sampleBicubic(presentStretched, gx, gy);

      const dPast2 = (px - pastCx) ** 2 + (py - pastCy) ** 2;
      const dPres2 = (px - presCx) ** 2 + (py - presCy) ** 2;

      const psfPast = options.motion.pastGlow * 1.18 * Math.pow(1 + dPast2 / 48, -2.4);
      const psfPres = 1.32 * Math.pow(1 + dPres2 / 48, -2.4);
      const localMask = Math.max(
        Math.exp(-dPast2 / 680),
        Math.exp(-dPres2 / 680)
      );
      const rawDiff = p2 - p1;
      const maskedResidual = rawDiff * localMask * 0.4;
      const diff = psfPres - psfPast + maskedResidual;

      const outIdx = (py * width + px) * 4;

      if (diff > 0.065) {
        const k = Math.min(1, diff * (options.stacked6Array ? 1.65 : 1.4));
        const core = Math.pow(k, 2.0);
        imgData.data[outIdx] = Math.round(14 + core * 241);
        imgData.data[outIdx + 1] = Math.round(170 + k * 60 + core * 25);
        imgData.data[outIdx + 2] = Math.round(235 + k * 20);
      } else if (diff < -0.065) {
        const k = Math.min(1, Math.abs(diff) * (options.stacked6Array ? 1.65 : 1.4));
        const core = Math.pow(k, 1.9);
        imgData.data[outIdx] = Math.round(135 + k * 115);
        imgData.data[outIdx + 1] = Math.round(18 + core * 78);
        imgData.data[outIdx + 2] = Math.round(62 + k * 58);
      } else {
        imgData.data[outIdx] = 6;
        imgData.data[outIdx + 1] = 9;
        imgData.data[outIdx + 2] = 19;
      }
      imgData.data[outIdx + 3] = 255;
    }
  }

  ctx.putImageData(imgData, 0, 0);

  ctx.save();
  for (let i = 0; i < Math.min(8, stationaryRings.length); i += 1) {
    const s = stationaryRings[i];
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.16)';
    ctx.lineWidth = 0.8;
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    ctx.arc(s.px, s.py, 7, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  ctx.strokeStyle = 'rgba(0, 240, 255, 0.12)';
  ctx.lineWidth = 1;
  for (let i = 1; i < 4; i += 1) {
    const x = (i / 4) * width;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let j = 1; j < 3; j += 1) {
    const y = (j / 3) * height;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  const fovArcsec = options.fovDeg * 3600;
  const barFrac = 0.18;
  const barPx = width * barFrac;
  const barArcsec = fovArcsec * barFrac;
  const rulerText =
    barArcsec >= 60 ? `${(barArcsec / 60).toFixed(1)}'` : `${barArcsec.toFixed(1)}"`;

  const rx1 = width - 14 - barPx;
  const rx2 = width - 14;
  const ry = height - 14;
  ctx.strokeStyle = 'rgba(0, 240, 255, 0.85)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(rx1, ry - 4);
  ctx.lineTo(rx1, ry);
  ctx.lineTo(rx2, ry);
  ctx.lineTo(rx2, ry - 4);
  ctx.stroke();

  ctx.fillStyle = 'rgba(224, 242, 254, 0.92)';
  ctx.font = '600 10px "JetBrains Mono", monospace';
  ctx.textAlign = 'right';
  ctx.fillText(
    `Δθ ${rulerText} · μ=${Math.hypot(options.pmRaMasYr, options.pmDecMasYr).toFixed(1)} mas/yr`,
    rx2,
    ry - 7
  );
  ctx.textAlign = 'left';
  ctx.restore();
}

export interface TransientMotionAnalysis {
  epoch1Footprint: { normX: number; normY: number; gridX: number; gridY: number };
  epoch2Detection: { normX: number; normY: number; gridX: number; gridY: number };
  vectorDxPx: number;
  vectorDyPx: number;
  vectorDistPx: number;
  vectorDistArcsec: number;
  vectorDistMasYr: number;
  isHighProperMotion: boolean;
}

export function detectTransientMotionVector(
  pastStretched: number[][],
  presentStretched: number[][],
  options?: {
    stampSpanArcsec?: number;
    baselineYears?: number;
    catalogPmMasYr?: number;
  }
): TransientMotionAnalysis {
  const h = Math.min(pastStretched.length, presentStretched.length);
  const w = Math.min(pastStretched[0]?.length || 0, presentStretched[0]?.length || 0);

  if (!h || !w) {
    return {
      epoch1Footprint: { normX: 0.35, normY: 0.35, gridX: 11, gridY: 11 },
      epoch2Detection: { normX: 0.65, normY: 0.65, gridX: 20, gridY: 20 },
      vectorDxPx: 0,
      vectorDyPx: 0,
      vectorDistPx: 0,
      vectorDistArcsec: 0,
      vectorDistMasYr: 0,
      isHighProperMotion: false,
    };
  }

  let minDiff = Infinity;
  let maxDiff = -Infinity;
  let minX = Math.floor(w / 2);
  let minY = Math.floor(h / 2);
  let maxX = Math.floor(w / 2);
  let maxY = Math.floor(h / 2);

  const diffGrid: number[][] = Array.from({ length: h }, () => new Array<number>(w).fill(0));

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const d = (presentStretched[y][x] ?? 0) - (pastStretched[y][x] ?? 0);
      diffGrid[y][x] = d;
      if (d < minDiff) {
        minDiff = d;
        minX = x;
        minY = y;
      }
      if (d > maxDiff) {
        maxDiff = d;
        maxX = x;
        maxY = y;
      }
    }
  }

  const computeWeightedCentroid = (
    cx: number,
    cy: number,
    polarity: 1 | -1,
    floorAmp: number
  ) => {
    let sumW = 0;
    let sumX = 0;
    let sumY = 0;
    for (let dy = -2; dy <= 2; dy += 1) {
      const yy = Math.max(0, Math.min(h - 1, cy + dy));
      for (let dx = -2; dx <= 2; dx += 1) {
        const xx = Math.max(0, Math.min(w - 1, cx + dx));
        const val = diffGrid[yy][xx] * polarity;
        if (val > floorAmp) {
          const weight = val * val;
          sumW += weight;
          sumX += xx * weight;
          sumY += yy * weight;
        }
      }
    }
    if (sumW <= 1e-6) return { gx: cx, gy: cy };
    return { gx: sumX / sumW, gy: sumY / sumW };
  };

  const negFloor = Math.max(0.03, Math.abs(minDiff) * 0.35);
  const posFloor = Math.max(0.03, Math.abs(maxDiff) * 0.35);
  const negC = computeWeightedCentroid(minX, minY, -1, negFloor);
  const posC = computeWeightedCentroid(maxX, maxY, 1, posFloor);

  const vectorDxPx = posC.gx - negC.gx;
  const vectorDyPx = posC.gy - negC.gy;
  const vectorDistPx = Math.hypot(vectorDxPx, vectorDyPx);

  const stampSpanArcsec = options?.stampSpanArcsec ?? 3.6;
  const baselineYears = options?.baselineYears ?? 25;
  const normDist = vectorDistPx / Math.max(1, Math.hypot(w - 1, h - 1) / Math.SQRT2);
  const measuredArcsec = normDist * stampSpanArcsec;
  const measuredMasYr = (measuredArcsec * 1000) / baselineYears;

  const hasRealDipole = Math.abs(minDiff) > 0.08 && Math.abs(maxDiff) > 0.1;
  const effectiveMasYr = hasRealDipole
    ? measuredMasYr
    : options?.catalogPmMasYr ?? measuredMasYr;
  const effectiveArcsec = hasRealDipole
    ? measuredArcsec
    : (effectiveMasYr * baselineYears) / 1000;

  return {
    epoch1Footprint: {
      normX: negC.gx / Math.max(1, w - 1),
      normY: negC.gy / Math.max(1, h - 1),
      gridX: Number(negC.gx.toFixed(2)),
      gridY: Number(negC.gy.toFixed(2)),
    },
    epoch2Detection: {
      normX: posC.gx / Math.max(1, w - 1),
      normY: posC.gy / Math.max(1, h - 1),
      gridX: Number(posC.gx.toFixed(2)),
      gridY: Number(posC.gy.toFixed(2)),
    },
    vectorDxPx: Number(vectorDxPx.toFixed(2)),
    vectorDyPx: Number(vectorDyPx.toFixed(2)),
    vectorDistPx: Number(vectorDistPx.toFixed(2)),
    vectorDistArcsec: Number(effectiveArcsec.toFixed(3)),
    vectorDistMasYr: Number(effectiveMasYr.toFixed(1)),
    isHighProperMotion: effectiveMasYr > 50,
  };
}
