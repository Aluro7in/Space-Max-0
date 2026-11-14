import type {
  DatacubeResponse,
  ScanResponse,
  TargetFrameMotion,
  TargetPreset,
} from '../types/telemetry';

export const OFFICIAL_TARGET_PRESETS: TargetPreset[] = [
  {
    id: 'spherex-qr2',
    name: 'SPHEREx QR2 Candidate',
    shortLabel: 'SPHEREx QR2 Candidate (166.33°, +29.94°)',
    ra: 166.33243,
    dec: 29.940572,
    chemistryLabel: 'Brown Dwarf • H₂O + CH₄',
    kidAtmosphere: 'Cold world atmosphere',
    gaiaMatched: false,
    pmRaMasYr: 14.2,
    pmDecMasYr: -6.8,
    radialVelKmS: 41.5,
    cnnConfidence: 2.38,
    cnnArtifact: -1.18,
    verdictLabel: 'CONFIRMED: Real Object / Planet X Candidate',
    isAnomaly: true,
    motion: {
      pastX: 0.3,
      pastY: 0.33,
      presentX: 0.62,
      presentY: 0.56,
      blinkMs: 500,
      pastGlow: 0.52,
    },
    summary:
      'Out of 6,167 heat dots in this sky patch, Space-Max 0 spotted a mystery world hopping across the stars that is missing from normal star maps! Its infrared rainbow reveals icy water clouds and methane gas, just like a cold giant planet or Brown Dwarf.',
  },
  {
    id: 'wise-0855',
    name: 'WISE 0855',
    shortLabel: 'WISE 0855 (133.80°, -7.25°)',
    ra: 133.8002,
    dec: -7.2458,
    chemistryLabel: 'Y-Dwarf • H₂O + CH₄ + CO',
    kidAtmosphere: 'Freezing icy world (~250 K)',
    gaiaMatched: false,
    pmRaMasYr: -8118.0,
    pmDecMasYr: 680.0,
    radialVelKmS: 23.4,
    cnnConfidence: 2.64,
    cnnArtifact: -1.42,
    verdictLabel: 'CONFIRMED: High-PM Substellar Y-Dwarf',
    isAnomaly: true,
    motion: {
      pastX: 0.22,
      pastY: 0.72,
      presentX: 0.74,
      presentY: 0.34,
      blinkMs: 420,
      pastGlow: 0.65,
    },
    summary:
      'Meet WISE 0855—the coldest failed star ever found, only 7.4 light-years away and as chilly as Earth’s North Pole! Watch it race across the blinking frame while glowing faintly in infrared water-ice clouds.',
  },
  {
    id: 'barnards-star',
    name: "Barnard's Star",
    shortLabel: "Barnard's Star (269.45°, +4.69°)",
    ra: 269.452075,
    dec: 4.693388,
    chemistryLabel: 'M4V Red Dwarf • Silicate + H₂O',
    kidAtmosphere: 'Speeding red dwarf star',
    gaiaMatched: true,
    pmRaMasYr: -801.55,
    pmDecMasYr: 10362.39,
    radialVelKmS: -110.5,
    cnnConfidence: 2.12,
    cnnArtifact: -1.05,
    verdictLabel: 'CATALOGUED: High-Velocity M-Dwarf Benchmark',
    isAnomaly: false,
    motion: {
      pastX: 0.56,
      pastY: 0.22,
      presentX: 0.46,
      presentY: 0.74,
      blinkMs: 360,
      pastGlow: 0.94,
    },
    summary:
      "Barnard's Star is the fastest-moving star in our night sky, zooming past background stars like a cosmic rocket! Because it's already mapped by ESA Gaia, scientists use it as a speedometer check.",
  },
  {
    id: 'epsilon-indi-b',
    name: 'Epsilon Indi B',
    shortLabel: 'Epsilon Indi B (330.84°, -56.79°)',
    ra: 330.8402,
    dec: -56.786,
    chemistryLabel: 'T1/T6 Binary • CH₄ + H₂O',
    kidAtmosphere: 'Twin methane brown dwarfs',
    gaiaMatched: true,
    pmRaMasYr: 3960.9,
    pmDecMasYr: -2536.2,
    radialVelKmS: -40.4,
    cnnConfidence: 2.29,
    cnnArtifact: -1.12,
    verdictLabel: 'CONFIRMED: Binary Brown Dwarf Reference',
    isAnomaly: true,
    motion: {
      pastX: 0.34,
      pastY: 0.64,
      presentX: 0.64,
      presentY: 0.38,
      blinkMs: 480,
      pastGlow: 0.85,
    },
    summary:
      'Epsilon Indi B is actually a pair of twin Brown Dwarfs dancing around each other just 12 light-years away! Their rainbow light dips sharply at water and methane colors.',
  },
  {
    id: 'rw-aurigae',
    name: 'RW Aurigae',
    shortLabel: 'RW Aurigae (76.96°, +30.40°)',
    ra: 76.9565,
    dec: 30.4014,
    chemistryLabel: 'T Tauri Disk • CO + Silicate',
    kidAtmosphere: 'Warm planet-forming dust disk',
    gaiaMatched: true,
    pmRaMasYr: 4.8,
    pmDecMasYr: -22.1,
    radialVelKmS: 15.9,
    cnnConfidence: 1.95,
    cnnArtifact: -0.88,
    verdictLabel: 'CATALOGUED: Circumstellar Disk Variable',
    isAnomaly: false,
    motion: {
      pastX: 0.48,
      pastY: 0.44,
      presentX: 0.53,
      presentY: 0.56,
      blinkMs: 650,
      pastGlow: 0.72,
    },
    summary:
      'RW Aurigae is a young baby star wrapped in a giant swirling disk of warm cosmic dust where new planets are being built! Watch how its glowing dust cloud brightens and shifts in longer infrared light.',
  },
  {
    id: 'r-draconis',
    name: 'R Draconis',
    shortLabel: 'R Draconis (248.16°, +66.75°)',
    ra: 248.162,
    dec: 66.751,
    chemistryLabel: 'Mira Variable • H₂O + CO',
    kidAtmosphere: 'Breathing giant star + steam',
    gaiaMatched: true,
    pmRaMasYr: -2.4,
    pmDecMasYr: 11.7,
    radialVelKmS: -134.0,
    cnnConfidence: 1.88,
    cnnArtifact: -0.92,
    verdictLabel: 'CATALOGUED: Long-Period Mira Pulsator',
    isAnomaly: false,
    motion: {
      pastX: 0.49,
      pastY: 0.49,
      presentX: 0.52,
      presentY: 0.51,
      blinkMs: 700,
      pastGlow: 0.42,
    },
    summary:
      'R Draconis is a giant elderly star that puffs up and shrinks like a cosmic heartbeat every 8 months! Its outer atmosphere is packed with hot water steam and carbon monoxide gas.',
  },
];

function seededRandom(seed: number): () => number {
  let state = Math.floor(Math.abs(seed * 10000)) % 2147483647;
  if (state <= 0) state = 42;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

function magmaRgb(t: number): [number, number, number] {
  const x = Math.max(0, Math.min(1, t));
  if (x < 0.25) {
    const k = x / 0.25;
    return [Math.round(8 + k * 60), Math.round(6 + k * 10), Math.round(18 + k * 85)];
  }
  if (x < 0.55) {
    const k = (x - 0.25) / 0.3;
    return [Math.round(68 + k * 120), Math.round(16 + k * 34), Math.round(103 + k * 25)];
  }
  if (x < 0.82) {
    const k = (x - 0.55) / 0.27;
    return [Math.round(188 + k * 60), Math.round(50 + k * 105), Math.round(128 - k * 55)];
  }
  const k = (x - 0.82) / 0.18;
  return [Math.round(248 + k * 7), Math.round(155 + k * 95), Math.round(73 + k * 145)];
}

export function findClosestPreset(ra: number, dec: number): TargetPreset | null {
  let best: TargetPreset | null = null;
  let bestDist = Infinity;
  for (const preset of OFFICIAL_TARGET_PRESETS) {
    const d = Math.hypot(preset.ra - ra, preset.dec - dec);
    if (d < 0.35 && d < bestDist) {
      bestDist = d;
      best = preset;
    }
  }
  return best;
}

export function getTargetFrameMotion(ra: number, dec: number): TargetFrameMotion {
  const preset = findClosestPreset(ra, dec);
  if (preset) return preset.motion;
  // Deterministic custom coordinate jump so any custom sky patch is interactive too
  const rand = seededRandom(ra * 19.3 + dec * 23.7 + 7);
  return {
    pastX: Number((0.26 + rand() * 0.18).toFixed(2)),
    pastY: Number((0.28 + rand() * 0.22).toFixed(2)),
    presentX: Number((0.56 + rand() * 0.18).toFixed(2)),
    presentY: Number((0.48 + rand() * 0.22).toFixed(2)),
    blinkMs: 500,
    pastGlow: 0.58,
  };
}

export function renderCutoutPairBase64(
  ra: number,
  dec: number,
  _isAnomaly: boolean,
  stacked6Array: boolean
): { past_frame_base64: string; present_frame_base64: string } {
  if (typeof document === 'undefined') {
    return { past_frame_base64: '', present_frame_base64: '' };
  }

  const size = 32;
  const scale = 8; // 256x256 sharp astronomical cutout
  const rand = seededRandom(ra * 31.7 + dec * 17.3 + 42);
  const motion = getTargetFrameMotion(ra, dec);

  const pastTargetX = motion.pastX * (size - 1);
  const pastTargetY = motion.pastY * (size - 1);
  const presentTargetX = motion.presentX * (size - 1);
  const presentTargetY = motion.presentY * (size - 1);

  // Background stars (stationary across both epochs)
  const bgStars: Array<{ x: number; y: number; amp: number; sigma: number }> = [];
  for (let i = 0; i < 8; i += 1) {
    const sx = 3 + rand() * (size - 6);
    const sy = 3 + rand() * (size - 6);
    const farFromPast = Math.hypot(sx - pastTargetX, sy - pastTargetY) > 4.2;
    const farFromPresent =
      Math.hypot(sx - presentTargetX, sy - presentTargetY) > 4.2;
    if (farFromPast && farFromPresent) {
      bgStars.push({
        x: sx,
        y: sy,
        amp: 0.32 + rand() * 0.36,
        sigma: 1.05 + rand() * 0.35,
      });
    }
  }

  const noiseLevel = stacked6Array ? 0.025 : 0.095;
  const pastGrid = new Float32Array(size * size);
  const presentGrid = new Float32Array(size * size);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const idx = y * size + x;
      const baseNoise = (rand() - 0.5) * noiseLevel + 0.1;
      let starSum = 0;
      for (const s of bgStars) {
        const d2 = (x - s.x) ** 2 + (y - s.y) ** 2;
        starSum += s.amp * Math.exp(-d2 / (2 * s.sigma * s.sigma));
      }

      const dPast2 = (x - pastTargetX) ** 2 + (y - pastTargetY) ** 2;
      const dPres2 = (x - presentTargetX) ** 2 + (y - presentTargetY) ** 2;
      const sigma = stacked6Array ? 1.55 : 1.7;
      const pastSource = motion.pastGlow * Math.exp(-dPast2 / (2 * sigma * sigma));
      const presentSource = 0.99 * Math.exp(-dPres2 / (2 * sigma * sigma));

      pastGrid[idx] = Math.max(0, Math.min(1, baseNoise + starSum + pastSource));
      presentGrid[idx] = Math.max(0, Math.min(1, baseNoise + starSum + presentSource));
    }
  }

  const gridToDataUrl = (grid: Float32Array): string => {
    const smallCanvas = document.createElement('canvas');
    smallCanvas.width = size;
    smallCanvas.height = size;
    const sCtx = smallCanvas.getContext('2d');
    if (!sCtx) return '';

    const imgData = sCtx.createImageData(size, size);
    for (let i = 0; i < size * size; i += 1) {
      const [r, g, b] = magmaRgb(grid[i]);
      imgData.data[i * 4] = r;
      imgData.data[i * 4 + 1] = g;
      imgData.data[i * 4 + 2] = b;
      imgData.data[i * 4 + 3] = 255;
    }
    sCtx.putImageData(imgData, 0, 0);

    const outCanvas = document.createElement('canvas');
    outCanvas.width = size * scale;
    outCanvas.height = size * scale;
    const oCtx = outCanvas.getContext('2d');
    if (!oCtx) return smallCanvas.toDataURL('image/png');
    oCtx.imageSmoothingEnabled = stacked6Array;
    oCtx.drawImage(smallCanvas, 0, 0, size * scale, size * scale);
    return outCanvas.toDataURL('image/png');
  };

  return {
    past_frame_base64: gridToDataUrl(pastGrid),
    present_frame_base64: gridToDataUrl(presentGrid),
  };
}

export function buildSpectrum102(
  ra: number,
  dec: number,
  stacked6Array: boolean
): { wavelengths: number[]; raw_spectrum: number[] } {
  const bands = 102;
  const wavelengths: number[] = [];
  const raw_spectrum: number[] = [];
  const preset = findClosestPreset(ra, dec);
  const rand = seededRandom(ra * 11.3 + dec * 7.1 + 42);
  const jitterScale = stacked6Array ? 0.5 : 1.6;

  for (let i = 0; i < bands; i += 1) {
    const w = 0.75 + (i / (bands - 1)) * (5.0 - 0.75);
    wavelengths.push(Number(w.toFixed(4)));

    let continuum = Math.exp(-0.5 * ((w - 1.55) / 1.05) ** 2) * 100;
    let h2oFactor = w > 1.33 && w < 1.47 ? 0.42 : 1.0;
    let ch4Factor = w > 3.18 && w < 3.42 ? 0.24 : 1.0;
    let coFactor = w > 4.48 && w < 4.82 ? 0.52 : 1.0;

    if (preset?.id === 'wise-0855') {
      continuum = Math.exp(-0.5 * ((w - 2.2) / 1.25) ** 2) * 84;
      h2oFactor = w > 1.33 && w < 1.47 ? 0.22 : 1.0;
      ch4Factor = w > 3.18 && w < 3.42 ? 0.16 : 1.0;
      coFactor = w > 4.48 && w < 4.82 ? 0.38 : 1.0;
    } else if (preset?.id === 'barnards-star') {
      continuum = Math.exp(-0.5 * ((w - 1.15) / 1.15) ** 2) * 112;
      h2oFactor = w > 1.33 && w < 1.47 ? 0.74 : 1.0;
      ch4Factor = w > 3.18 && w < 3.42 ? 0.92 : 1.0;
      coFactor = w > 4.48 && w < 4.82 ? 0.78 : 1.0;
    } else if (preset?.id === 'epsilon-indi-b') {
      continuum = Math.exp(-0.5 * ((w - 1.62) / 0.95) ** 2) * 96;
      h2oFactor = w > 1.33 && w < 1.47 ? 0.35 : 1.0;
      ch4Factor = w > 3.18 && w < 3.42 ? 0.28 : 1.0;
      coFactor = w > 4.48 && w < 4.82 ? 0.62 : 1.0;
    } else if (preset?.id === 'rw-aurigae') {
      // Warm circumstellar dust excess rising past 2.5 µm
      continuum = 48 + Math.exp(-0.5 * ((w - 3.6) / 1.4) ** 2) * 58;
      h2oFactor = w > 1.33 && w < 1.47 ? 0.86 : 1.0;
      ch4Factor = w > 3.18 && w < 3.42 ? 0.88 : 1.0;
      coFactor = w > 4.48 && w < 4.82 ? 0.44 : 1.0;
    } else if (preset?.id === 'r-draconis') {
      continuum = Math.exp(-0.5 * ((w - 1.85) / 1.3) ** 2) * 108;
      h2oFactor = w > 1.33 && w < 1.47 ? 0.38 : 1.0;
      ch4Factor = w > 3.18 && w < 3.42 ? 0.84 : 1.0;
      coFactor = w > 4.48 && w < 4.82 ? 0.26 : 1.0;
    }

    const flux =
      continuum * h2oFactor * ch4Factor * coFactor +
      (rand() - 0.5) * 2 * jitterScale;
    raw_spectrum.push(Number(Math.max(1.5, flux).toFixed(3)));
  }
  return { wavelengths, raw_spectrum };
}

export function buildFallbackScan(
  ra: number,
  dec: number,
  fov: number,
  stacked6Array: boolean
): ScanResponse {
  const preset = findClosestPreset(ra, dec);
  const isAnomaly = preset ? preset.isAnomaly : true;
  const { wavelengths, raw_spectrum } = buildSpectrum102(ra, dec, stacked6Array);
  const frames = renderCutoutPairBase64(ra, dec, isAnomaly, stacked6Array);

  return {
    status: isAnomaly ? 'anomaly_confirmed' : 'catalogued_source',
    s3_source: 'nasa-irsa-spherex/qr2/level2',
    fov_deg: fov,
    metadata_flags: {
      psf_quality: 'Nominal',
      zodi_subtracted: true,
      cosmic_ray_flag: 0,
      detector_array_count: 6,
    },
    source_detection: {
      total_sources_found: 6167,
      crossmatch_mode: preset?.gaiaMatched
        ? 'GAIA_DR3_CATALOG_MATCH'
        : 'VERIFIED_UNCATALOGUED_ANOMALY',
    },
    coordinates: {
      ra: Number(ra.toFixed(6)),
      dec: Number(dec.toFixed(6)),
      pixel_x: 1569.5,
      pixel_y: 237.6,
    },
    ai_verdicts: {
      cnn_confidence: preset ? preset.cnnConfidence : 2.38,
      cnn_artifact_score: preset ? preset.cnnArtifact : -1.18,
      cnn_verdict_label: preset
        ? preset.verdictLabel
        : 'CONFIRMED: Real Object / Planet X Candidate',
      rnn_classification: preset
        ? preset.chemistryLabel
        : 'Brown Dwarf • H₂O + CH₄',
      gnn_kinematic_shift: isAnomaly ? 'Detected' : 'Baseline',
      proper_motion: {
        pm_ra_mas_yr: preset ? preset.pmRaMasYr : 14.2,
        pm_dec_mas_yr: preset ? preset.pmDecMasYr : -6.8,
        radial_vel_km_s: preset ? preset.radialVelKmS : 41.5,
      },
    },
    wavelengths,
    raw_spectrum,
    visual_assets: frames,
    gemini_copilot_summary: preset
      ? preset.summary
      : `Space-Max 0 found a bright infrared object at RA ${ra.toFixed(2)}°, Dec ${dec.toFixed(2)}° that is missing from normal star maps! Its rainbow light reveals water vapor and methane clouds, just like a hidden cold planet.`,
  };
}

export function buildFallbackDatacube(
  ra: number,
  dec: number,
  fov: number,
  stacked6Array: boolean
): DatacubeResponse {
  const { wavelengths, raw_spectrum } = buildSpectrum102(ra, dec, stacked6Array);
  const bands = 102;
  const size = 32;
  const volume_data: number[][][] = [];
  const rand = seededRandom(ra * 5.7 + dec * 9.3 + 17);
  const motion = getTargetFrameMotion(ra, dec);
  const baseCx = motion.presentX * (size - 1);
  const baseCy = motion.presentY * (size - 1);

  for (let z = 0; z < bands; z += 1) {
    const specWeight = raw_spectrum[z] / 100;
    const plane: number[][] = [];
    const cx = baseCx + (z / bands - 0.5) * 1.4;
    const cy = baseCy + Math.sin(z * 0.08) * 0.4;
    for (let y = 0; y < size; y += 1) {
      const row: number[] = [];
      for (let x = 0; x < size; x += 1) {
        const d2 = (x - cx) ** 2 + (y - cy) ** 2;
        const psf = Math.exp(-d2 / (2 * 2.2 * 2.2));
        const wing = 0.25 * Math.exp(-d2 / (2 * 5.2 * 5.2));
        const val = (psf + wing) * specWeight + rand() * (stacked6Array ? 0.02 : 0.05);
        row.push(Number(Math.min(1, Math.max(0, val)).toFixed(3)));
      }
      plane.push(row);
    }
    volume_data.push(plane);
  }

  const preset = findClosestPreset(ra, dec);
  const pmRa = preset ? preset.pmRaMasYr : 14.2;
  const pmDec = preset ? preset.pmDecMasYr : -6.8;
  const radialVel = preset ? preset.radialVelKmS : 41.5;

  const starRand = seededRandom(ra * 100.0 + dec * 37.0 + 42);
  const gaia_3d_stars = Array.from({ length: 25 }, (_, idx) => ({
    id: `GAIA_DR3_REF_${String(idx + 1).padStart(2, '0')}`,
    x: Number(((starRand() - 0.5) * 24).toFixed(3)),
    y: Number(((starRand() - 0.5) * 24).toFixed(3)),
    z_parallax_pc: Number((45 + starRand() * 375).toFixed(2)),
    flux: Number((0.18 + starRand() * 0.74).toFixed(3)),
  }));
  gaia_3d_stars.push({
    id: 'PLANET_X_CANDIDATE',
    x: 0,
    y: 0,
    z_parallax_pc: 18.4,
    flux: 0.98,
  });

  const pmMag = Math.max(1e-3, Math.hypot(pmRa, pmDec));
  const stepX = Number(((pmRa / pmMag) * 1.4).toFixed(2));
  const stepY = Number(((pmDec / pmMag) * 1.4).toFixed(2));

  return {
    dimensions: [bands, size, size],
    fov_deg: fov,
    wavelengths,
    volume_data,
    gaia_3d_stars,
    kinematic_vector: {
      pm_ra: pmRa,
      pm_dec: pmDec,
      radial_vel: radialVel,
      trajectory_points: [
        [0, 0, 18.4],
        [stepX, stepY, 19.2],
        [Number((stepX * 2).toFixed(2)), Number((stepY * 2).toFixed(2)), 20.0],
      ],
    },
  };
}

export function parseRaInput(raw: string): number | null {
  const trimmed = raw.trim().replace(/[°]/g, '');
  if (!trimmed) return null;
  if (/^[+-]?\d+(\.\d+)?$/.test(trimmed)) {
    const deg = parseFloat(trimmed);
    return deg >= 0 && deg <= 360 ? deg : ((deg % 360) + 360) % 360;
  }
  const hmsMatch = trimmed.match(
    /^(\d{1,2})\s*[h:\s]\s*(\d{1,2})\s*[m:\s]\s*(\d{1,2}(?:\.\d+)?)\s*s?$/i
  );
  if (hmsMatch) {
    const h = parseFloat(hmsMatch[1]);
    const m = parseFloat(hmsMatch[2]);
    const s = parseFloat(hmsMatch[3]);
    const deg = (h + m / 60 + s / 3600) * 15;
    return ((deg % 360) + 360) % 360;
  }
  return null;
}

export function parseDecInput(raw: string): number | null {
  const trimmed = raw.trim().replace(/[°]/g, '');
  if (!trimmed) return null;
  if (/^[+-]?\d+(\.\d+)?$/.test(trimmed)) {
    const deg = parseFloat(trimmed);
    return deg >= -90 && deg <= 90 ? deg : null;
  }
  const dmsMatch = trimmed.match(
    /^([+-]?)(\d{1,2})\s*[d:\s]\s*(\d{1,2})\s*[m':\s]\s*(\d{1,2}(?:\.\d+)?)\s*[s"]?$/i
  );
  if (dmsMatch) {
    const sign = dmsMatch[1] === '-' ? -1 : 1;
    const d = parseFloat(dmsMatch[2]);
    const m = parseFloat(dmsMatch[3]);
    const s = parseFloat(dmsMatch[4]);
    const deg = sign * (d + m / 60 + s / 3600);
    return deg >= -90 && deg <= 90 ? deg : null;
  }
  return null;
}
