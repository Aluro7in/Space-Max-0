import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Box, Orbit, RotateCcw, SlidersHorizontal } from 'lucide-react';
import type { DatacubeResponse } from '../types/telemetry';
import {
  multiSpectralSpaceRgb,
  seededRand,
  spectralBandRgbFloat,
} from '../utils/astroStretch';

interface WebGLDataCube3DProps {
  datacube: DatacubeResponse;
  sliceIndex: number;
  onSliceIndexChange: (index: number) => void;
}

type CubeViewMode = 'cube' | 'gaia3d';

interface AnimatedStarNode {
  orbitR: number;
  baseAngle: number;
  omega: number;
  baseZ: number;
  tiltAmp: number;
  tiltPhase: number;
  colorR: number;
  colorG: number;
  colorB: number;
}

interface StarAnimState {
  pointsGeo: THREE.BufferGeometry;
  trailGeo: THREE.BufferGeometry;
  stars: AnimatedStarNode[];
  segmentsPerStar: number;
}

const CUBE_XY = 3.25;
const CUBE_Z = 4.65;
const DEFAULT_CAMERA_POS = new THREE.Vector3(4.35, 2.85, 4.95);
const _raycaster = new THREE.Raycaster();
const _pointerNdc = new THREE.Vector2();
const _projVec = new THREE.Vector3();
const _upAxis = new THREE.Vector3(0, 1, 0);

function detectSoftwareWebGL(renderer: THREE.WebGLRenderer): boolean {
  try {
    const gl = renderer.getContext();
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    if (!debugInfo) return false;
    const unmasked = String(
      gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || ''
    );
    return /swiftshader|llvmpipe|software/i.test(unmasked);
  } catch {
    return false;
  }
}

function createPointSpriteTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, 'rgba(255, 255, 255, 0.82)');
    grad.addColorStop(0.32, 'rgba(255, 255, 255, 0.34)');
    grad.addColorStop(0.68, 'rgba(255, 255, 255, 0.08)');
    grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 32, 32);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

function getBandFeatureHint(um: number): string {
  if (um >= 1.33 && um <= 1.47) return 'H₂O Absorption Dip (1.4 µm)';
  if (um >= 2.38 && um <= 2.46) return 'Dichroic Split (BLANKCH 51–52)';
  if (um >= 3.18 && um <= 3.42) return 'CH₄ Methane Dip (3.3 µm)';
  if (um >= 4.48 && um <= 4.82) return 'CO Band (4.6 µm)';
  if (um < 1.5) return 'Near-IR Band 1–2 (Cyan)';
  if (um < 2.4) return 'Near-IR Band 3 (Emerald)';
  if (um < 3.8) return 'Mid-IR Band 4 (Solar Gold)';
  return 'Thermal Band 5–6 (Magenta)';
}

function getWavelengthSliceAccentHex(um: number): string {
  if (um < 1.5) return '#00F0FF';
  if (um < 2.4) return '#10B981';
  if (um < 3.8) return '#FBBF24';
  return '#F43F5E';
}

export function WebGLDataCube3D({
  datacube,
  sliceIndex,
  onSliceIndexChange,
}: WebGLDataCube3DProps) {
  const [view3D, setView3D] = useState<CubeViewMode>('cube');
  const [webglUnavailable, setWebglUnavailable] = useState<boolean>(false);
  const [vectorTooltipPos, setVectorTooltipPos] = useState<{
    x: number;
    y: number;
  } | null>(null);

  const totalBands = Math.max(2, datacube.wavelengths.length || 102);
  const activeWavelength = useMemo(() => {
    const arr = datacube.wavelengths;
    if (!arr.length) return 1.4;
    const idx = Math.max(0, Math.min(arr.length - 1, sliceIndex));
    return arr[idx];
  }, [datacube.wavelengths, sliceIndex]);

  const view3DRef = useRef<CubeViewMode>('cube');
  const sliceMiniCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const mountRef = useRef<HTMLDivElement | null>(null);

  const sceneCtxRef = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    cubeGroup: THREE.Group;
    gaiaGroup: THREE.Group;
    sliceGroup: THREE.Group;
    slicePlaneMat: THREE.MeshBasicMaterial;
    sliceLoopMat: THREE.LineBasicMaterial;
    pointsObj: THREE.Points | null;
    spriteTex: THREE.CanvasTexture;
    isSoftwareGl: boolean;
    requestRender: () => void;
    starAnim: StarAnimState | null;
    vectorHitMeshes: THREE.Object3D[];
    vectorMidpoint: THREE.Vector3 | null;
  } | null>(null);

  // Initialize Three.js WebGL scene once
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance',
      });
    } catch {
      setWebglUnavailable(true);
      return;
    }

    const isSoftwareGl = detectSoftwareWebGL(renderer);
    renderer.setPixelRatio(
      isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2)
    );
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;

    const width = Math.max(240, container.clientWidth);
    const height = Math.max(190, container.clientHeight);
    renderer.setSize(width, height, false);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#04060C');

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 60);
    camera.position.copy(DEFAULT_CAMERA_POS);
    camera.lookAt(0, 0, 0);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false;
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.08;
    controls.minDistance = 2.8;
    controls.maxDistance = 14;
    controls.target.set(0, 0, 0);
    controls.update();

    const cubeGroup = new THREE.Group();
    const gaiaGroup = new THREE.Group();
    gaiaGroup.visible = false;
    scene.add(cubeGroup);
    scene.add(gaiaGroup);

    // Wireframe bounding box for Multi-Spectral IFU Cube (Electric Cyan / Slate)
    const boxGeo = new THREE.BoxGeometry(CUBE_XY, CUBE_XY, CUBE_Z);
    const edgesGeo = new THREE.EdgesGeometry(boxGeo);
    const edgesMat = new THREE.LineBasicMaterial({
      color: 0x0ea5e9,
      transparent: true,
      opacity: 0.48,
    });
    cubeGroup.add(new THREE.LineSegments(edgesGeo, edgesMat));
    boxGeo.dispose();

    const gridHelper = new THREE.GridHelper(CUBE_XY, 8, 0x00f0ff, 0x1e293b);
    gridHelper.position.y = -CUBE_XY / 2;
    cubeGroup.add(gridHelper);

    // Glowing Cyan/Gold Laser Slicing Plane
    const sliceGroup = new THREE.Group();
    const planeGeo = new THREE.PlaneGeometry(CUBE_XY * 1.03, CUBE_XY * 1.03);
    const slicePlaneMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.14,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    sliceGroup.add(new THREE.Mesh(planeGeo, slicePlaneMat));

    const half = (CUBE_XY * 1.03) / 2;
    const loopGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-half, -half, 0),
      new THREE.Vector3(half, -half, 0),
      new THREE.Vector3(half, half, 0),
      new THREE.Vector3(-half, half, 0),
    ]);
    const sliceLoopMat = new THREE.LineBasicMaterial({
      color: 0xfbbf24,
      transparent: true,
      opacity: 0.95,
    });
    sliceGroup.add(new THREE.LineLoop(loopGeo, sliceLoopMat));
    cubeGroup.add(sliceGroup);

    // Concentric 3D Parsec Distance Radar Rings (10 pc, 50 pc, 100 pc) on floor of Gaia 3D Star-Field
    const floorY = -1.75;
    const radarRadii = [0.75, 1.5, 2.25];
    const radarColors = [0x00f0ff, 0x38bdf8, 0xfbbf24];
    radarRadii.forEach((rad, rIdx) => {
      const pts: THREE.Vector3[] = [];
      for (let a = 0; a < 48; a += 1) {
        const theta = (a / 48) * Math.PI * 2;
        pts.push(new THREE.Vector3(Math.cos(theta) * rad, floorY, Math.sin(theta) * rad));
      }
      const ringGeo = new THREE.BufferGeometry().setFromPoints(pts);
      const ringMat = new THREE.LineBasicMaterial({
        color: radarColors[rIdx],
        transparent: true,
        opacity: rIdx === 0 ? 0.55 : 0.34,
      });
      gaiaGroup.add(new THREE.LineLoop(ringGeo, ringMat));
    });

    // Cross-axis radar hairlines
    const axisGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-2.35, floorY, 0),
      new THREE.Vector3(2.35, floorY, 0),
      new THREE.Vector3(0, floorY, -2.35),
      new THREE.Vector3(0, floorY, 2.35),
    ]);
    const axisMat = new THREE.LineBasicMaterial({
      color: 0x1e293b,
      transparent: true,
      opacity: 0.85,
    });
    gaiaGroup.add(new THREE.LineSegments(axisGeo, axisMat));

    const spriteTex = createPointSpriteTexture();

    let rafId = 0;
    let swTimerId = 0;
    let needsRender = true;
    let activeUntil = 0;
    let disposed = false;
    const startTime = performance.now();

    const evalStarOrbit = (
      s: AnimatedStarNode,
      tSec: number
    ): [number, number, number] => {
      const theta = s.baseAngle + s.omega * tSec;
      const x = Math.cos(theta) * s.orbitR;
      const y = Math.sin(theta) * s.orbitR * 0.84;
      const z = s.baseZ + Math.sin(theta + s.tiltPhase) * s.tiltAmp;
      return [x, y, z];
    };

    const updateStarTrails = (nowMs: number) => {
      const ctx = sceneCtxRef.current;
      if (!ctx || !ctx.starAnim || view3DRef.current !== 'gaia3d') return;
      const { pointsGeo, trailGeo, stars, segmentsPerStar } = ctx.starAnim;
      const elapsedSec = (nowMs - startTime) * 0.001;

      const starPosAttr = pointsGeo.getAttribute('position') as THREE.BufferAttribute;
      const starColAttr = pointsGeo.getAttribute('color') as THREE.BufferAttribute;
      const trailPosAttr = trailGeo.getAttribute('position') as THREE.BufferAttribute;
      const trailColAttr = trailGeo.getAttribute('color') as THREE.BufferAttribute;

      const starPos = starPosAttr.array as Float32Array;
      const starCol = starColAttr.array as Float32Array;
      const trailPos = trailPosAttr.array as Float32Array;
      const trailCol = trailColAttr.array as Float32Array;

      const trailWindowSec = 2.4;

      for (let i = 0; i < stars.length; i += 1) {
        const s = stars[i];
        const [hx, hy, hz] = evalStarOrbit(s, elapsedSec);

        starPos[i * 3] = hx;
        starPos[i * 3 + 1] = hy;
        starPos[i * 3 + 2] = hz;

        starCol[i * 3] = s.colorR;
        starCol[i * 3 + 1] = s.colorG;
        starCol[i * 3 + 2] = s.colorB;

        for (let seg = 0; seg < segmentsPerStar; seg += 1) {
          const frac0 = seg / segmentsPerStar;
          const frac1 = (seg + 1) / segmentsPerStar;

          const t0 = elapsedSec - (1 - frac0) * trailWindowSec;
          const t1 = elapsedSec - (1 - frac1) * trailWindowSec;

          const [x0, y0, z0] = evalStarOrbit(s, t0);
          const [x1, y1, z1] = evalStarOrbit(s, t1);

          const vBase = (i * segmentsPerStar + seg) * 6;
          trailPos[vBase] = x0;
          trailPos[vBase + 1] = y0;
          trailPos[vBase + 2] = z0;

          trailPos[vBase + 3] = x1;
          trailPos[vBase + 4] = y1;
          trailPos[vBase + 5] = z1;

          const fade0 = Math.pow(frac0, 2.3) * 0.36;
          const fade1 = Math.pow(frac1, 2.3) * 0.36;

          trailCol[vBase] = s.colorR * fade0;
          trailCol[vBase + 1] = s.colorG * fade0;
          trailCol[vBase + 2] = s.colorB * fade0;

          trailCol[vBase + 3] = s.colorR * fade1;
          trailCol[vBase + 4] = s.colorG * fade1;
          trailCol[vBase + 5] = s.colorB * fade1;
        }
      }

      starPosAttr.needsUpdate = true;
      starColAttr.needsUpdate = true;
      trailPosAttr.needsUpdate = true;
      trailColAttr.needsUpdate = true;
    };

    const renderFrame = (nowMs: number = performance.now()) => {
      rafId = 0;
      if (disposed) return;

      if (view3DRef.current === 'gaia3d') {
        updateStarTrails(nowMs);
      }

      if (controls.enableDamping) {
        controls.update();
      }
      renderer.render(scene, camera);
      needsRender = false;

      if (view3DRef.current === 'gaia3d') {
        if (isSoftwareGl) {
          swTimerId = window.setTimeout(() => {
            if (!disposed && !rafId) {
              rafId = window.requestAnimationFrame(renderFrame);
            }
          }, 66);
        } else {
          rafId = window.requestAnimationFrame(renderFrame);
        }
      } else if (
        !isSoftwareGl &&
        controls.enableDamping &&
        performance.now() < activeUntil
      ) {
        rafId = window.requestAnimationFrame(renderFrame);
      }
    };

    const requestRender = () => {
      if (disposed) return;
      if (needsRender && rafId) return;
      needsRender = true;
      if (!rafId) {
        rafId = window.requestAnimationFrame(renderFrame);
      }
    };

    const onStart = () => {
      activeUntil = performance.now() + 1200;
      requestRender();
    };
    const onChange = () => {
      activeUntil = performance.now() + 900;
      requestRender();
    };

    controls.addEventListener('start', onStart);
    controls.addEventListener('change', onChange);

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const w = Math.max(200, Math.floor(entry.contentRect.width));
      const h = Math.max(170, Math.floor(entry.contentRect.height));
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
      requestRender();
    });
    resizeObserver.observe(container);

    sceneCtxRef.current = {
      renderer,
      scene,
      camera,
      controls,
      cubeGroup,
      gaiaGroup,
      sliceGroup,
      slicePlaneMat,
      sliceLoopMat,
      pointsObj: null,
      spriteTex,
      isSoftwareGl,
      requestRender,
      starAnim: null,
      vectorHitMeshes: [],
      vectorMidpoint: null,
    };

    let lastRaycastMs = 0;
    const onPointerMove = (e: PointerEvent) => {
      const ctx = sceneCtxRef.current;
      if (
        !ctx ||
        view3DRef.current !== 'gaia3d' ||
        !ctx.vectorHitMeshes.length ||
        !ctx.vectorMidpoint
      ) {
        setVectorTooltipPos(null);
        return;
      }
      const now = performance.now();
      if (now - lastRaycastMs < 48) return;
      lastRaycastMs = now;

      const rect = renderer.domElement.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      _pointerNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      _pointerNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      _raycaster.setFromCamera(_pointerNdc, camera);
      const hits = _raycaster.intersectObjects(ctx.vectorHitMeshes, false);
      if (hits.length > 0) {
        _projVec.copy(ctx.vectorMidpoint).project(camera);
        const sx = Math.max(
          90,
          Math.min(rect.width - 90, ((_projVec.x + 1) / 2) * rect.width)
        );
        const sy = Math.max(
          38,
          Math.min(rect.height - 38, ((-_projVec.y + 1) / 2) * rect.height)
        );
        setVectorTooltipPos({ x: sx, y: sy });
      } else {
        setVectorTooltipPos(null);
      }
    };

    const onPointerLeave = () => {
      setVectorTooltipPos(null);
    };

    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerleave', onPointerLeave);

    requestRender();

    return () => {
      disposed = true;
      if (rafId) window.cancelAnimationFrame(rafId);
      if (swTimerId) window.clearTimeout(swTimerId);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerleave', onPointerLeave);
      resizeObserver.disconnect();
      controls.removeEventListener('start', onStart);
      controls.removeEventListener('change', onChange);
      controls.dispose();

      if (sceneCtxRef.current?.pointsObj) {
        sceneCtxRef.current.pointsObj.geometry.dispose();
        (sceneCtxRef.current.pointsObj.material as THREE.Material).dispose();
      }
      edgesGeo.dispose();
      edgesMat.dispose();
      planeGeo.dispose();
      slicePlaneMat.dispose();
      loopGeo.dispose();
      sliceLoopMat.dispose();
      axisGeo.dispose();
      axisMat.dispose();
      spriteTex.dispose();
      renderer.dispose();
      sceneCtxRef.current = null;
    };
  }, []);

  useEffect(() => {
    view3DRef.current = view3D;
    setVectorTooltipPos(null);
    const ctx = sceneCtxRef.current;
    if (!ctx) return;
    ctx.cubeGroup.visible = view3D === 'cube';
    ctx.gaiaGroup.visible = view3D === 'gaia3d';
    ctx.requestRender();
  }, [view3D]);

  // Rebuild Multi-Spectral IFU Spectral Cube + Rich 68+ Gaia 3D Parallax Starfield + TubeGeometry Trajectory
  useEffect(() => {
    const ctx = sceneCtxRef.current;
    if (!ctx) return;

    // 1. Rebuild Volumetric Multi-Spectral IFU Cube
    if (ctx.pointsObj) {
      ctx.cubeGroup.remove(ctx.pointsObj);
      ctx.pointsObj.geometry.dispose();
      (ctx.pointsObj.material as THREE.Material).dispose();
      ctx.pointsObj = null;
    }

    const volume = datacube.volume_data;
    const zDim = volume.length;
    const yDim = volume[0]?.length || 0;
    const xDim = volume[0]?.[0]?.length || 0;

    if (zDim && yDim && xDim) {
      let maxVal = 0.001;
      for (let z = 0; z < zDim; z += 1) {
        for (let y = 0; y < yDim; y += 1) {
          for (let x = 0; x < xDim; x += 1) {
            const v = volume[z][y][x];
            if (v > maxVal) maxVal = v;
          }
        }
      }

      const positions: number[] = [];
      const colors: number[] = [];
      const threshold = maxVal * 0.08;
      const spreadXY = CUBE_XY * 0.88;
      const spreadZ = CUBE_Z * 0.92;

      for (let z = 0; z < zDim; z += 1) {
        const zNorm = z / Math.max(1, zDim - 1);
        const wz = (zNorm - 0.5) * spreadZ;
        for (let y = 0; y < yDim; y += 1) {
          const wy = (y / Math.max(1, yDim - 1) - 0.5) * spreadXY;
          for (let x = 0; x < xDim; x += 1) {
            const val = volume[z][y][x];
            if (val < threshold) continue;
            // Sub-sample adjacent core pixels slightly to prevent additive white blow-out at the center
            const isCoreCluster =
              Math.abs(x - xDim / 2) <= 3 && Math.abs(y - yDim / 2) <= 3;
            if (isCoreCluster && (x + y + z) % 2 !== 0) continue;

            const norm = Math.pow(Math.min(1, val / maxVal), 0.85);
            const wx = (x / Math.max(1, xDim - 1) - 0.5) * spreadXY;
            positions.push(wx, wy, wz);
            const [r, g, b] = spectralBandRgbFloat(zNorm, norm * 0.88);
            colors.push(r * 0.85, g * 0.85, b * 0.85);
          }
        }
      }

      // 14 distributed multi-spectral IFU field-star columns & volumetric emission shells filling ~85% of cube bounds
      const colRand = seededRand(
        (datacube.kinematic_vector?.pm_ra ?? 14.2) * 37.1 + zDim * 3.1
      );
      const secondaryStars: Array<{ sx: number; sy: number; amp: number; rWing: number }> = [
        { sx: -1.24, sy: 1.12, amp: 0.82, rWing: 0.14 },
        { sx: 1.21, sy: -1.04, amp: 0.78, rWing: 0.13 },
        { sx: -0.94, sy: -1.18, amp: 0.74, rWing: 0.12 },
        { sx: 0.98, sy: 1.18, amp: 0.79, rWing: 0.13 },
        { sx: 1.32, sy: 0.22, amp: 0.70, rWing: 0.11 },
        { sx: -1.31, sy: -0.24, amp: 0.72, rWing: 0.12 },
        { sx: 0.18, sy: 1.32, amp: 0.68, rWing: 0.11 },
        { sx: -0.24, sy: -1.28, amp: 0.67, rWing: 0.11 },
        { sx: -0.58, sy: 0.64, amp: 0.62, rWing: 0.10 },
        { sx: 0.62, sy: -0.56, amp: 0.63, rWing: 0.10 },
        { sx: 0.56, sy: 0.58, amp: 0.60, rWing: 0.10 },
        { sx: -0.62, sy: -0.58, amp: 0.61, rWing: 0.10 },
        { sx: 1.12, sy: 0.78, amp: 0.59, rWing: 0.09 },
        { sx: -1.14, sy: 0.44, amp: 0.58, rWing: 0.09 },
      ];
      const wingOffsets = [
        [0, 0],
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ];

      for (const starCol of secondaryStars) {
        const phase = colRand() * Math.PI * 2;
        for (let z = 0; z < zDim; z += 2) {
          const zNorm = z / Math.max(1, zDim - 1);
          const wz = (zNorm - 0.5) * spreadZ;
          const mod = 0.62 + 0.38 * Math.sin(zNorm * 6.5 + phase);
          const intensity = Math.min(0.92, starCol.amp * mod);
          const [r, g, b] = spectralBandRgbFloat(zNorm, intensity);
          for (let wIdx = 0; wIdx < wingOffsets.length; wIdx += 1) {
            const [ox, oy] = wingOffsets[wIdx];
            const falloff = wIdx === 0 ? 0.9 : 0.48;
            positions.push(
              starCol.sx + ox * starCol.rWing,
              starCol.sy + oy * starCol.rWing,
              wz
            );
            colors.push(r * falloff, g * falloff, b * falloff);
          }
        }
      }

      // Soft ambient volumetric IR continuum cloud points distributed across X/Y/Z
      for (let i = 0; i < 320; i += 1) {
        const ax = (colRand() - 0.5) * spreadXY * 0.94;
        const ay = (colRand() - 0.5) * spreadXY * 0.94;
        const zNorm = colRand();
        const az = (zNorm - 0.5) * spreadZ;
        const [r, g, b] = spectralBandRgbFloat(zNorm, 0.32 + colRand() * 0.22);
        positions.push(ax, ay, az);
        colors.push(r * 0.72, g * 0.72, b * 0.72);
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(positions, 3)
      );
      geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

      const mat = new THREE.PointsMaterial({
        size: 0.075,
        map: ctx.spriteTex,
        vertexColors: true,
        transparent: true,
        opacity: 0.58,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });

      const points = new THREE.Points(geo, mat);
      ctx.cubeGroup.add(points);
      ctx.pointsObj = points;
    }

    // 2. Rebuild Rich 68+ Gaia 3D Star-Field + Parsec Radar Rings (kept at indices 0..3) + Glowing Trajectory Tube
    ctx.starAnim = null;
    while (ctx.gaiaGroup.children.length > 4) {
      const child = ctx.gaiaGroup.children[ctx.gaiaGroup.children.length - 1];
      ctx.gaiaGroup.remove(child);
      child.traverse((obj) => {
        const meshLike = obj as THREE.Mesh | THREE.Line | THREE.Points;
        if (meshLike.geometry) {
          meshLike.geometry.dispose();
        }
        if (meshLike.material) {
          if (Array.isArray(meshLike.material)) {
            meshLike.material.forEach((m) => m.dispose());
          } else {
            meshLike.material.dispose();
          }
        }
      });
    }

    const stars = datacube.gaia_3d_stars || [];
    const mapZPc = (pc: number) => ((pc - 18.4) / 420) * 4.0 - 1.5;
    const mapXY = (coord: number) => coord * 0.18;

    const pmRaVal = datacube.kinematic_vector?.pm_ra ?? 14.2;
    const pmDecVal = datacube.kinematic_vector?.pm_dec ?? -6.8;
    const orbitSign = pmRaVal >= 0 ? -1 : 1;

    const spectralPalette: Array<[number, number, number]> = [
      [0.0, 0.94, 1.0],   // Electric Cyan blue giant
      [0.22, 0.74, 0.97], // Celestial Azure
      [0.99, 0.88, 0.28], // Solar Gold dwarf
      [0.96, 0.25, 0.37], // Crimson M-dwarf
      [0.95, 0.98, 1.0],  // Hot White A-star
    ];

    const animStars: AnimatedStarNode[] = [];
    let planetPos = new THREE.Vector3(0, 0, mapZPc(18.4));

    stars.forEach((star, idx) => {
      const sx = mapXY(star.x);
      const sy = mapXY(star.y);
      const sz = mapZPc(star.z_parallax_pc);
      if (star.id === 'PLANET_X_CANDIDATE') {
        planetPos = new THREE.Vector3(sx, sy, sz);
      } else {
        const f = Math.max(0.45, Math.min(1, star.flux));
        const depthFactor = Math.max(0.4, 165 / Math.max(45, star.z_parallax_pc));
        const orbitR = Math.max(0.42, Math.hypot(sx, sy));
        const baseAngle = Math.atan2(sy, sx);
        const omega = orbitSign * (0.14 + 0.12 * depthFactor);
        const pal = spectralPalette[idx % spectralPalette.length];

        animStars.push({
          orbitR,
          baseAngle,
          omega,
          baseZ: sz,
          tiltAmp: 0.1 + (idx % 4) * 0.03,
          tiltPhase: (idx * 0.71 + Math.abs(pmDecVal) * 0.05) % (Math.PI * 2),
          colorR: pal[0] * f,
          colorG: pal[1] * f,
          colorB: pal[2] * f,
        });
      }
    });

    // Augment up to 68 total multi-colored parallax stars so the 3D field feels deeply populated
    const augRand = seededRand(Math.abs(pmRaVal * 29.3 + pmDecVal * 17.7) + 99);
    const targetStarCount = 68;
    for (let i = animStars.length; i < targetStarCount; i += 1) {
      const orbitR = 0.45 + augRand() * 2.05;
      const baseAngle = augRand() * Math.PI * 2;
      const pc = 14 + augRand() * 320;
      const depthFactor = Math.max(0.35, 165 / Math.max(40, pc));
      const pal = spectralPalette[i % spectralPalette.length];
      const f = 0.45 + augRand() * 0.52;
      animStars.push({
        orbitR,
        baseAngle,
        omega: orbitSign * (0.1 + 0.13 * depthFactor),
        baseZ: mapZPc(pc),
        tiltAmp: 0.08 + augRand() * 0.14,
        tiltPhase: augRand() * Math.PI * 2,
        colorR: pal[0] * f,
        colorG: pal[1] * f,
        colorB: pal[2] * f,
      });
    }

    if (animStars.length > 0) {
      const segmentsPerStar = 16;
      const starPosBuf = new Float32Array(animStars.length * 3);
      const starColBuf = new Float32Array(animStars.length * 3);

      animStars.forEach((s, i) => {
        starPosBuf[i * 3] = Math.cos(s.baseAngle) * s.orbitR;
        starPosBuf[i * 3 + 1] = Math.sin(s.baseAngle) * s.orbitR * 0.84;
        starPosBuf[i * 3 + 2] = s.baseZ;
        starColBuf[i * 3] = s.colorR;
        starColBuf[i * 3 + 1] = s.colorG;
        starColBuf[i * 3 + 2] = s.colorB;
      });

      const starGeo = new THREE.BufferGeometry();
      starGeo.setAttribute('position', new THREE.BufferAttribute(starPosBuf, 3));
      starGeo.setAttribute('color', new THREE.BufferAttribute(starColBuf, 3));
      const starMat = new THREE.PointsMaterial({
        size: 0.22,
        map: ctx.spriteTex,
        vertexColors: true,
        transparent: true,
        opacity: 0.94,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      ctx.gaiaGroup.add(new THREE.Points(starGeo, starMat));

      const trailPosBuf = new Float32Array(animStars.length * segmentsPerStar * 6);
      const trailColBuf = new Float32Array(animStars.length * segmentsPerStar * 6);
      const trailGeo = new THREE.BufferGeometry();
      trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPosBuf, 3));
      trailGeo.setAttribute('color', new THREE.BufferAttribute(trailColBuf, 3));
      const trailMat = new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.48,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      ctx.gaiaGroup.add(new THREE.LineSegments(trailGeo, trailMat));

      ctx.starAnim = {
        pointsGeo: starGeo,
        trailGeo,
        stars: animStars,
        segmentsPerStar,
      };
    }

    // 3D Kinematic Vector Trajectory TubeGeometry: Epoch 1 (Crimson) -> Epoch 2 (Electric Cyan & Solar Gold)
    ctx.vectorHitMeshes = [];
    ctx.vectorMidpoint = null;

    const traj = datacube.kinematic_vector?.trajectory_points || [
      [0, 0, 18.4],
      [1.4, -0.7, 19.2],
      [2.8, -1.4, 20.0],
    ];
    const trajVecs = traj.map(
      ([tx, ty, tz]) =>
        new THREE.Vector3(mapXY(tx * 4), mapXY(ty * 4), mapZPc(tz * 6 - 92))
    );
    if (trajVecs.length >= 2) {
      const origin = trajVecs[0].clone();
      const tip = trajVecs[trajVecs.length - 1].clone();
      const dir = tip.clone().sub(origin);
      const len = Math.max(0.8, dir.length());
      dir.normalize();
      const mid = origin.clone().addScaledVector(dir, len * 0.5);
      ctx.vectorMidpoint = mid;

      // Epoch 1 negative footprint node (Plasma Rose-Crimson)
      const e1Core = new THREE.Mesh(
        new THREE.SphereGeometry(0.105, 16, 16),
        new THREE.MeshBasicMaterial({ color: 0xf43f5e })
      );
      e1Core.position.copy(origin);
      ctx.gaiaGroup.add(e1Core);

      const e1Halo = new THREE.Mesh(
        new THREE.RingGeometry(0.145, 0.21, 24),
        new THREE.MeshBasicMaterial({
          color: 0xf43f5e,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.75,
        })
      );
      e1Halo.position.copy(origin);
      ctx.gaiaGroup.add(e1Halo);

      // Epoch 2 positive detection node (Electric Cyan core + Solar Gold halo ring)
      const e2Core = new THREE.Mesh(
        new THREE.SphereGeometry(0.12, 16, 16),
        new THREE.MeshBasicMaterial({ color: 0x00f0ff })
      );
      e2Core.position.copy(tip);
      ctx.gaiaGroup.add(e2Core);

      const e2Ring = new THREE.Mesh(
        new THREE.RingGeometry(0.16, 0.23, 24),
        new THREE.MeshBasicMaterial({
          color: 0xfbbf24,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.92,
        })
      );
      e2Ring.position.copy(tip);
      ctx.gaiaGroup.add(e2Ring);

      // Bright Glowing Trajectory TubeGeometry along CatmullRomCurve3
      const curvePts =
        trajVecs.length >= 3
          ? trajVecs
          : [origin, mid.clone().add(new THREE.Vector3(0, 0.08, 0)), tip];
      const curve = new THREE.CatmullRomCurve3(curvePts);
      const tubeGeo = new THREE.TubeGeometry(curve, 24, 0.032, 10, false);
      const tubeMat = new THREE.MeshBasicMaterial({
        color: 0xfbbf24,
        transparent: true,
        opacity: 0.92,
      });
      ctx.gaiaGroup.add(new THREE.Mesh(tubeGeo, tubeMat));

      const glowTubeGeo = new THREE.TubeGeometry(curve, 24, 0.068, 10, false);
      const glowTubeMat = new THREE.MeshBasicMaterial({
        color: 0x00f0ff,
        transparent: true,
        opacity: 0.26,
      });
      ctx.gaiaGroup.add(new THREE.Mesh(glowTubeGeo, glowTubeMat));

      // Arrowhead cone at Epoch 2 tip
      const headCone = new THREE.Mesh(
        new THREE.ConeGeometry(0.09, 0.24, 14),
        new THREE.MeshBasicMaterial({ color: 0x00f0ff })
      );
      headCone.position.copy(tip).addScaledVector(dir, -0.14);
      headCone.quaternion.setFromUnitVectors(_upAxis, dir);
      ctx.gaiaGroup.add(headCone);

      const proxyMesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.24, 0.24, len + 0.35, 8),
        new THREE.MeshBasicMaterial({ visible: false })
      );
      proxyMesh.position.copy(mid);
      proxyMesh.quaternion.setFromUnitVectors(_upAxis, dir);
      ctx.gaiaGroup.add(proxyMesh);
      ctx.vectorHitMeshes.push(proxyMesh, e1Core, e2Core);
    } else {
      const fallbackMesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.11, 16, 16),
        new THREE.MeshBasicMaterial({ color: 0x00f0ff })
      );
      fallbackMesh.position.copy(planetPos);
      ctx.gaiaGroup.add(fallbackMesh);
    }

    ctx.requestRender();
  }, [datacube]);

  // Sync Z-Slice plane position + Laser Color + Live 2D Cross-Section Slice Mini-Preview Canvas
  useEffect(() => {
    const ctx = sceneCtxRef.current;
    if (ctx) {
      ctx.sliceGroup.position.z =
        (sliceIndex / Math.max(1, totalBands - 1) - 0.5) * CUBE_Z;
      const accentHex = getWavelengthSliceAccentHex(activeWavelength);
      ctx.slicePlaneMat.color.set(accentHex);
      ctx.sliceLoopMat.color.set(accentHex);
      ctx.requestRender();
    }

    const mini = sliceMiniCanvasRef.current;
    const volume = datacube.volume_data;
    if (!mini || !volume.length) return;
    const clampedIdx = Math.max(0, Math.min(volume.length - 1, sliceIndex));
    const slice2d = volume[clampedIdx];
    const h = slice2d?.length || 0;
    const w = slice2d?.[0]?.length || 0;
    if (!h || !w) return;

    const previewSize = 76;
    mini.width = previewSize;
    mini.height = previewSize;
    const mctx = mini.getContext('2d');
    if (!mctx) return;

    let minS = Infinity;
    let maxS = -Infinity;
    let peakX = Math.floor(w / 2);
    let peakY = Math.floor(h / 2);
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const v = slice2d[y][x];
        if (v < minS) minS = v;
        if (v > maxS) {
          maxS = v;
          peakX = x;
          peakY = y;
        }
      }
    }
    const spanS = Math.max(1e-5, maxS - minS);
    const sliceNorm = clampedIdx / Math.max(1, volume.length - 1);

    const imgData = mctx.createImageData(previewSize, previewSize);
    for (let py = 0; py < previewSize; py += 1) {
      const fy = (py / (previewSize - 1)) * (h - 1);
      const y0 = Math.floor(fy);
      const y1 = Math.min(h - 1, y0 + 1);
      const wy = fy - y0;
      for (let px = 0; px < previewSize; px += 1) {
        const fx = (px / (previewSize - 1)) * (w - 1);
        const x0 = Math.floor(fx);
        const x1 = Math.min(w - 1, x0 + 1);
        const wx = fx - x0;

        // Smooth bilinear interpolation across the 32x32 slice
        const v00 = slice2d[y0]?.[x0] ?? 0;
        const v10 = slice2d[y0]?.[x1] ?? 0;
        const v01 = slice2d[y1]?.[x0] ?? 0;
        const v11 = slice2d[y1]?.[x1] ?? 0;
        const interp =
          (v00 * (1 - wx) + v10 * wx) * (1 - wy) +
          (v01 * (1 - wx) + v11 * wx) * wy;

        const rawNorm = Math.min(1, Math.max(0, (interp - minS) / spanS));
        const boosted = Math.pow(rawNorm, 0.56);
        const [msR, msG, msB] = multiSpectralSpaceRgb(boosted);
        const [sbR, sbG, sbB] = spectralBandRgbFloat(sliceNorm, Math.min(1, boosted * 1.15));

        // Blend deep-space background with wavelength-tinted PSF core glow
        const r = Math.round(5 + msR * 0.52 + sbR * 255 * 0.48 * Math.pow(boosted, 0.8));
        const g = Math.round(7 + msG * 0.52 + sbG * 255 * 0.48 * Math.pow(boosted, 0.8));
        const b = Math.round(17 + msB * 0.52 + sbB * 255 * 0.48 * Math.pow(boosted, 0.8));

        const idx = (py * previewSize + px) * 4;
        imgData.data[idx] = Math.min(255, r);
        imgData.data[idx + 1] = Math.min(255, g);
        imgData.data[idx + 2] = Math.min(255, b);
        imgData.data[idx + 3] = 255;
      }
    }
    mctx.putImageData(imgData, 0, 0);

    // Subtle precision crosshair centered on slice PSF peak
    const cx = ((peakX + 0.5) / w) * previewSize;
    const cy = ((peakY + 0.5) / h) * previewSize;
    mctx.strokeStyle = 'rgba(0, 240, 255, 0.65)';
    mctx.lineWidth = 1;
    mctx.beginPath();
    mctx.moveTo(cx - 10, cy);
    mctx.lineTo(cx - 4, cy);
    mctx.moveTo(cx + 4, cy);
    mctx.lineTo(cx + 10, cy);
    mctx.moveTo(cx, cy - 10);
    mctx.lineTo(cx, cy - 4);
    mctx.moveTo(cx, cy + 4);
    mctx.lineTo(cx, cy + 10);
    mctx.stroke();
  }, [sliceIndex, totalBands, activeWavelength, datacube.volume_data]);

  const handleResetView = useCallback(() => {
    const ctx = sceneCtxRef.current;
    if (!ctx) return;
    ctx.camera.position.copy(DEFAULT_CAMERA_POS);
    ctx.controls.target.set(0, 0, 0);
    ctx.controls.update();
    ctx.requestRender();
  }, []);

  const pmRa = datacube.kinematic_vector?.pm_ra ?? 14.2;
  const pmDec = datacube.kinematic_vector?.pm_dec ?? -6.8;
  const radialVel = datacube.kinematic_vector?.radial_vel ?? 41.5;
  const pmTotal3D = Math.hypot(pmRa, pmDec);
  const displacementArcsec3D = (pmTotal3D * 25) / 1000;

  return (
    <div data-tour="step-3" className="flex flex-col rounded-xl">
      {/* Header + 3D Mode Switcher */}
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div
          role="tablist"
          aria-label="Three.js WebGL 3D view mode"
          className="flex items-center gap-1 rounded-xl border border-white/[0.08] bg-[#050811] p-0.5"
        >
          <button
            type="button"
            role="tab"
            aria-selected={view3D === 'cube'}
            onClick={() => setView3D('cube')}
            className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[10.5px] font-medium transition-colors ${
              view3D === 'cube'
                ? 'bg-cyan-500/20 text-cyan-200 ring-1 ring-cyan-400/40'
                : 'text-slate-400 hover:text-slate-100'
            }`}
          >
            <Box className="h-3 w-3 text-cyan-400" aria-hidden="true" />
            <span>3D Light Cube</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={view3D === 'gaia3d'}
            onClick={() => setView3D('gaia3d')}
            className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[10.5px] font-medium transition-colors ${
              view3D === 'gaia3d'
                ? 'bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-400/40'
                : 'text-slate-400 hover:text-slate-100'
            }`}
          >
            <Orbit className="h-3 w-3 text-emerald-400" aria-hidden="true" />
            <span>3D Gaia Star-Field</span>
          </button>
        </div>

        <button
          type="button"
          onClick={handleResetView}
          className="inline-flex items-center gap-1 rounded-lg border border-white/[0.08] bg-[#050811] px-2 py-1 text-[10px] font-medium text-slate-300 transition-colors hover:border-cyan-400/50 hover:text-cyan-200"
        >
          <RotateCcw className="h-3 w-3" aria-hidden="true" />
          <span>Reset Orbit</span>
        </button>
      </div>

      {/* Unified 3D Cube Card with Docked Bottom Wavelength Slice Scrubber Footer */}
      <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-[#04060C] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]">
        {webglUnavailable ? (
          <div className="flex h-[215px] w-full flex-col items-center justify-center p-4 text-center xl:h-[235px]">
            <Box className="mb-2 h-7 w-7 text-cyan-400" aria-hidden="true" />
            <p className="text-xs font-medium text-slate-200">
              WebGL 3D View Unavailable
            </p>
            <p className="mt-1 text-[11px] text-slate-400">
              Use the Z-Slice scrubber and rainbow spectrometer below.
            </p>
          </div>
        ) : (
          <div className="relative h-[215px] w-full overflow-hidden xl:h-[235px]">
            <div
              ref={mountRef}
              aria-label="Interactive Three.js WebGL 3D visualization"
              className="h-full w-full cursor-grab active:cursor-grabbing"
            />

            {/* Live 2D Cross-Section Slice Mini-Preview Overlay (Cube Mode) */}
            {view3D === 'cube' && (
              <div className="pointer-events-none absolute top-2 left-2 z-10 overflow-hidden rounded-lg border border-white/[0.12] bg-slate-950/75 p-1 backdrop-blur-md">
                <canvas
                  ref={sliceMiniCanvasRef}
                  aria-label="2D cross-section slice preview"
                  className="block h-[54px] w-[54px] rounded border border-white/[0.08]"
                />
                <div className="mt-0.5 flex items-center justify-between gap-1 px-0.5 font-mono text-[8px] font-semibold tabular-nums text-cyan-200">
                  <span className="text-slate-400">SLICE</span>
                  <span>{activeWavelength.toFixed(2)}µm</span>
                </div>
              </div>
            )}

            {/* Parsec Radar Ring Legend (Gaia 3D Mode) */}
            {view3D === 'gaia3d' && (
              <div className="pointer-events-none absolute top-2 left-2 z-10 rounded-full border border-white/[0.1] bg-slate-950/70 px-2.5 py-0.5 font-mono text-[9px] text-slate-300 backdrop-blur-md">
                <span className="text-cyan-300">10 pc</span> ·{' '}
                <span className="text-sky-300">50 pc</span> ·{' '}
                <span className="text-amber-300">100 pc</span>
              </div>
            )}

            {view3D === 'gaia3d' && vectorTooltipPos && (
              <div
                role="tooltip"
                style={{
                  left: `${vectorTooltipPos.x}px`,
                  top: `${vectorTooltipPos.y}px`,
                }}
                className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-1/2 rounded-lg border border-cyan-400/45 bg-slate-950/90 px-2.5 py-1.5 font-mono text-[10px] shadow-xl backdrop-blur-md"
              >
                <div className="whitespace-nowrap font-semibold text-amber-300">
                  Proper Motion (μ): +{pmTotal3D.toFixed(1)} mas/yr
                </div>
                <div className="mt-0.5 whitespace-nowrap text-cyan-300">
                  Displacement: {displacementArcsec3D.toFixed(2)} arcsec
                </div>
              </div>
            )}
          </div>
        )}

        {/* Docked Footer inside the 3D Card */}
        {view3D === 'cube' ? (
          <div className="border-t border-white/[0.07] bg-[#060A14]/95 px-3 py-2">
            <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-[10px]">
              <span className="inline-flex items-center gap-1 font-medium text-slate-300">
                <SlidersHorizontal
                  className="h-3 w-3 text-cyan-400"
                  aria-hidden="true"
                />
                <span>IFU Wavelength Slice</span>
              </span>
              <span className="font-mono tabular-nums text-cyan-200">
                Ch {sliceIndex + 1}/{totalBands} • {activeWavelength.toFixed(2)} µm
              </span>
              <span className="font-mono text-[9.5px] font-medium text-amber-300">
                {getBandFeatureHint(activeWavelength)}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span className="font-mono text-[9px] text-cyan-300/80">0.75µm</span>
              <input
                type="range"
                min={0}
                max={totalBands - 1}
                step={1}
                value={sliceIndex}
                onChange={(e) => onSliceIndexChange(Number(e.target.value))}
                aria-label="Wavelength Z-Slice Slider from 0.75 to 5.0 microns"
                className="h-1.5 w-full cursor-pointer accent-cyan-400"
              />
              <span className="font-mono text-[9px] text-rose-300/80">5.0µm</span>
            </div>
          </div>
        ) : (
          <div className="border-t border-white/[0.07] bg-[#060A14]/95 px-3 py-2 text-[10px]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium text-emerald-300">
                3D Parallax Star-Field &amp; Trajectory Tube (68 Gaia Stars)
              </span>
              <span className="font-mono tabular-nums text-cyan-200">
                18.4 pc · {radialVel.toFixed(1)} km/s · pm({pmRa >= 0 ? '+' : ''}
                {pmRa.toFixed(1)}, {pmDec >= 0 ? '+' : ''}
                {pmDec.toFixed(1)}) mas/yr
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
