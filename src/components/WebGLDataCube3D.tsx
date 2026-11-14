import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Box, Orbit, RotateCcw, SlidersHorizontal } from 'lucide-react';
import type { DatacubeResponse } from '../types/telemetry';

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

const CUBE_XY = 3.2;
const CUBE_Z = 4.6;
const DEFAULT_CAMERA_POS = new THREE.Vector3(4.3, 3.0, 4.8);

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
    grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
    grad.addColorStop(0.35, 'rgba(255, 255, 255, 0.88)');
    grad.addColorStop(0.75, 'rgba(255, 255, 255, 0.25)');
    grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 32, 32);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

function fluxColor(norm: number): [number, number, number] {
  const t = Math.max(0, Math.min(1, norm));
  if (t < 0.35) {
    const k = t / 0.35;
    return [0.14 + k * 0.45, 0.08 + k * 0.22, 0.48 + k * 0.38];
  }
  if (t < 0.72) {
    const k = (t - 0.35) / 0.37;
    return [0.59 + k * 0.38, 0.3 + k * 0.25, 0.86 - k * 0.44];
  }
  const k = (t - 0.72) / 0.28;
  return [0.2 + k * 0.8, 0.88 + k * 0.12, 0.96 + k * 0.04];
}

function getBandFeatureHint(um: number): string {
  if (um >= 1.33 && um <= 1.47) return 'H₂O Absorption Dip (1.4 µm)';
  if (um >= 3.18 && um <= 3.42) return 'CH₄ Methane Dip (3.3 µm)';
  if (um >= 4.48 && um <= 4.82) return 'CO Band (4.6 µm)';
  return 'Infrared Continuum';
}

export function WebGLDataCube3D({
  datacube,
  sliceIndex,
  onSliceIndexChange,
}: WebGLDataCube3DProps) {
  const [view3D, setView3D] = useState<CubeViewMode>('cube');
  const [webglUnavailable, setWebglUnavailable] = useState<boolean>(false);

  const totalBands = Math.max(2, datacube.wavelengths.length || 102);
  const activeWavelength = useMemo(() => {
    const arr = datacube.wavelengths;
    if (!arr.length) return 1.4;
    const idx = Math.max(0, Math.min(arr.length - 1, sliceIndex));
    return arr[idx];
  }, [datacube.wavelengths, sliceIndex]);

  const view3DRef = useRef<CubeViewMode>('cube');

  const mountRef = useRef<HTMLDivElement | null>(null);
  const sceneCtxRef = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    cubeGroup: THREE.Group;
    gaiaGroup: THREE.Group;
    sliceGroup: THREE.Group;
    pointsObj: THREE.Points | null;
    spriteTex: THREE.CanvasTexture;
    isSoftwareGl: boolean;
    requestRender: () => void;
    starAnim: StarAnimState | null;
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
    renderer.toneMappingExposure = 1.1;

    const width = Math.max(240, container.clientWidth);
    const height = Math.max(200, container.clientHeight);
    renderer.setSize(width, height, false);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#040710');

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

    // Wireframe bounding box for Spectral Cube
    const boxGeo = new THREE.BoxGeometry(CUBE_XY, CUBE_XY, CUBE_Z);
    const edgesGeo = new THREE.EdgesGeometry(boxGeo);
    const edgesMat = new THREE.LineBasicMaterial({
      color: 0x1e3a5f,
      transparent: true,
      opacity: 0.75,
    });
    cubeGroup.add(new THREE.LineSegments(edgesGeo, edgesMat));
    boxGeo.dispose();

    const gridHelper = new THREE.GridHelper(CUBE_XY, 8, 0x0e7490, 0x0f172a);
    gridHelper.position.y = -CUBE_XY / 2;
    cubeGroup.add(gridHelper);

    // Movable Cyan Z-Slice Plane
    const sliceGroup = new THREE.Group();
    const planeGeo = new THREE.PlaneGeometry(CUBE_XY * 1.02, CUBE_XY * 1.02);
    const planeMat = new THREE.MeshBasicMaterial({
      color: 0x22d3ee,
      transparent: true,
      opacity: 0.14,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    sliceGroup.add(new THREE.Mesh(planeGeo, planeMat));

    const half = (CUBE_XY * 1.02) / 2;
    const loopGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-half, -half, 0),
      new THREE.Vector3(half, -half, 0),
      new THREE.Vector3(half, half, 0),
      new THREE.Vector3(-half, half, 0),
    ]);
    const loopMat = new THREE.LineBasicMaterial({
      color: 0x22d3ee,
      transparent: true,
      opacity: 0.9,
    });
    sliceGroup.add(new THREE.LineLoop(loopGeo, loopMat));
    cubeGroup.add(sliceGroup);

    // Subtle spatial reference grid for Gaia 3D Starfield
    const starGrid = new THREE.GridHelper(4.4, 8, 0x0e7490, 0x0f172a);
    starGrid.position.y = -1.8;
    gaiaGroup.add(starGrid);

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
      const y = Math.sin(theta) * s.orbitR * 0.86;
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

      const trailWindowSec = 2.6;

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

          // Sample historical timestamps behind the star so trails curve smoothly along its orbit
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

          // Faint exponential fade from 0.0 at oldest tail end up to soft glow at star head
          const fade0 = Math.pow(frac0, 2.4) * 0.34;
          const fade1 = Math.pow(frac1, 2.4) * 0.34;

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
      const h = Math.max(180, Math.floor(entry.contentRect.height));
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
      pointsObj: null,
      spriteTex,
      isSoftwareGl,
      requestRender,
      starAnim: null,
    };

    requestRender();

    return () => {
      disposed = true;
      if (rafId) window.cancelAnimationFrame(rafId);
      if (swTimerId) window.clearTimeout(swTimerId);
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
      planeMat.dispose();
      loopGeo.dispose();
      loopMat.dispose();
      spriteTex.dispose();
      renderer.dispose();
      sceneCtxRef.current = null;
    };
  }, []);

  // Toggle between 3D Spectral Cube and 3D Gaia Parallax Starfield
  useEffect(() => {
    view3DRef.current = view3D;
    const ctx = sceneCtxRef.current;
    if (!ctx) return;
    ctx.cubeGroup.visible = view3D === 'cube';
    ctx.gaiaGroup.visible = view3D === 'gaia3d';
    ctx.requestRender();
  }, [view3D]);

  // Rebuild 3D Spectral Cube points + Gaia 3D Starfield + Additive Star Trails + GNN Trajectory ArrowHelper
  useEffect(() => {
    const ctx = sceneCtxRef.current;
    if (!ctx) return;

    // 1. Rebuild Volumetric Spectral Cube Points
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
      const threshold = maxVal * 0.14;

      for (let z = 0; z < zDim; z += 1) {
        const wz = (z / Math.max(1, zDim - 1) - 0.5) * CUBE_Z;
        for (let y = 0; y < yDim; y += 1) {
          const wy = (y / Math.max(1, yDim - 1) - 0.5) * CUBE_XY;
          for (let x = 0; x < xDim; x += 1) {
            const val = volume[z][y][x];
            if (val < threshold) continue;
            const norm = val / maxVal;
            const wx = (x / Math.max(1, xDim - 1) - 0.5) * CUBE_XY;
            positions.push(wx, wy, wz);
            const [r, g, b] = fluxColor(norm);
            colors.push(r, g, b);
          }
        }
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(positions, 3)
      );
      geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

      const mat = new THREE.PointsMaterial({
        size: ctx.isSoftwareGl ? 0.13 : 0.11,
        map: ctx.spriteTex,
        vertexColors: true,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });

      const points = new THREE.Points(geo, mat);
      ctx.cubeGroup.add(points);
      ctx.pointsObj = points;
    }

    // 2. Rebuild Gaia 3D Starfield + Additive Fading Trails + GNN Trajectory ArrowHelper
    ctx.starAnim = null;
    while (ctx.gaiaGroup.children.length > 1) {
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
    const mapZPc = (pc: number) => ((pc - 18.4) / 420) * 4.0 - 1.6;
    const mapXY = (coord: number) => coord * 0.18;

    const pmRaVal = datacube.kinematic_vector?.pm_ra ?? 14.2;
    const pmDecVal = datacube.kinematic_vector?.pm_dec ?? -6.8;
    const orbitSign = pmRaVal >= 0 ? -1 : 1;

    const animStars: AnimatedStarNode[] = [];
    let planetPos = new THREE.Vector3(0, 0, mapZPc(18.4));

    stars.forEach((star, idx) => {
      const sx = mapXY(star.x);
      const sy = mapXY(star.y);
      const sz = mapZPc(star.z_parallax_pc);
      if (star.id === 'PLANET_X_CANDIDATE') {
        planetPos = new THREE.Vector3(sx, sy, sz);
      } else {
        const f = Math.max(0.35, Math.min(1, star.flux));
        // Closer stars (smaller parallax distance) orbit faster for 3D parallax depth
        const depthFactor = Math.max(0.38, 165 / Math.max(45, star.z_parallax_pc));
        const orbitR = Math.max(0.42, Math.hypot(sx, sy));
        const baseAngle = Math.atan2(sy, sx);
        const omega = orbitSign * (0.14 + 0.12 * depthFactor);

        animStars.push({
          orbitR,
          baseAngle,
          omega,
          baseZ: sz,
          tiltAmp: 0.12 + (idx % 4) * 0.03,
          tiltPhase: (idx * 0.71 + Math.abs(pmDecVal) * 0.05) % (Math.PI * 2),
          colorR: 0.34 * f,
          colorG: 0.82 * f,
          colorB: 1.0 * f,
        });
      }
    });

    if (animStars.length > 0) {
      const segmentsPerStar = 16;
      const starPosBuf = new Float32Array(animStars.length * 3);
      const starColBuf = new Float32Array(animStars.length * 3);

      animStars.forEach((s, i) => {
        starPosBuf[i * 3] = Math.cos(s.baseAngle) * s.orbitR;
        starPosBuf[i * 3 + 1] = Math.sin(s.baseAngle) * s.orbitR * 0.86;
        starPosBuf[i * 3 + 2] = s.baseZ;
        starColBuf[i * 3] = s.colorR;
        starColBuf[i * 3 + 1] = s.colorG;
        starColBuf[i * 3 + 2] = s.colorB;
      });

      const starGeo = new THREE.BufferGeometry();
      starGeo.setAttribute('position', new THREE.BufferAttribute(starPosBuf, 3));
      starGeo.setAttribute('color', new THREE.BufferAttribute(starColBuf, 3));
      const starMat = new THREE.PointsMaterial({
        size: 0.24,
        map: ctx.spriteTex,
        vertexColors: true,
        transparent: true,
        opacity: 0.92,
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

    // Highlighted Target Planet X Anomaly Node
    const targetGeo = new THREE.SphereGeometry(0.11, 16, 16);
    const targetMat = new THREE.MeshBasicMaterial({ color: 0xa3e635 });
    const targetMesh = new THREE.Mesh(targetGeo, targetMat);
    targetMesh.position.copy(planetPos);
    ctx.gaiaGroup.add(targetMesh);

    // GNN Trajectory Line + Glowing Lime ArrowHelper
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
      const origin = trajVecs[0];
      const tip = trajVecs[trajVecs.length - 1];
      const dir = tip.clone().sub(origin);
      const len = Math.max(0.8, dir.length());
      dir.normalize();

      const trajGeo = new THREE.BufferGeometry().setFromPoints(trajVecs);
      const trajMat = new THREE.LineBasicMaterial({
        color: 0xa3e635,
        transparent: true,
        opacity: 0.85,
      });
      ctx.gaiaGroup.add(new THREE.Line(trajGeo, trajMat));

      const arrow = new THREE.ArrowHelper(dir, origin, len, 0xa3e635, 0.28, 0.16);
      ctx.gaiaGroup.add(arrow);
    }

    ctx.requestRender();
  }, [datacube]);

  // Sync Z-Slice plane position
  useEffect(() => {
    const ctx = sceneCtxRef.current;
    if (!ctx) return;
    ctx.sliceGroup.position.z =
      (sliceIndex / Math.max(1, totalBands - 1) - 0.5) * CUBE_Z;
    ctx.requestRender();
  }, [sliceIndex, totalBands]);

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

  return (
    <div data-tour="step-3" className="flex flex-col rounded-xl">
      {/* Header + 3D Mode Switcher */}
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        <div
          role="tablist"
          aria-label="Three.js WebGL 3D view mode"
          className="flex items-center gap-1 rounded-xl border border-slate-800 bg-slate-950/90 p-1"
        >
          <button
            type="button"
            role="tab"
            aria-selected={view3D === 'cube'}
            onClick={() => setView3D('cube')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
              view3D === 'cube'
                ? 'bg-cyan-500/20 text-cyan-300'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Box className="h-3.5 w-3.5" aria-hidden="true" />
            <span>3D Light Cube</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={view3D === 'gaia3d'}
            onClick={() => setView3D('gaia3d')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
              view3D === 'gaia3d'
                ? 'bg-lime-500/20 text-lime-300'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Orbit className="h-3.5 w-3.5" aria-hidden="true" />
            <span>3D Gaia Star-Field</span>
          </button>
        </div>

        <button
          type="button"
          onClick={handleResetView}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-950/80 px-2.5 py-1 text-[11px] font-medium text-slate-300 transition-colors hover:border-cyan-500/50 hover:text-cyan-300"
        >
          <RotateCcw className="h-3 w-3" aria-hidden="true" />
          <span>Reset Orbit</span>
        </button>
      </div>

      {/* Three.js WebGL Canvas Container */}
      {webglUnavailable ? (
        <div className="flex h-60 w-full flex-col items-center justify-center rounded-xl border border-slate-800 bg-[#040710] p-4 text-center">
          <Box className="mb-2 h-7 w-7 text-cyan-400" aria-hidden="true" />
          <p className="text-xs font-medium text-slate-200">
            WebGL 3D View Unavailable
          </p>
          <p className="mt-1 text-[11px] text-slate-400">
            Use the Z-Slice scrubber and rainbow spectrometer below.
          </p>
        </div>
      ) : (
        <div
          ref={mountRef}
          aria-label="Interactive Three.js WebGL 3D visualization"
          className="h-60 w-full cursor-grab overflow-hidden rounded-xl border border-slate-800 bg-[#040710] active:cursor-grabbing"
        />
      )}

      {/* 1-line kid-friendly helper label */}
      <p className="mt-1.5 text-center text-[11px] font-medium text-cyan-300/90">
        Drag to rotate 3D cube • Slide to slice infrared colors
      </p>

      {/* Mode-Specific Interactive Controls */}
      {view3D === 'cube' ? (
        <div className="mt-2 rounded-xl border border-slate-800 bg-slate-950/75 px-3 py-2">
          <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2 text-[11px]">
            <span className="inline-flex items-center gap-1.5 font-medium text-slate-300">
              <SlidersHorizontal
                className="h-3.5 w-3.5 text-cyan-400"
                aria-hidden="true"
              />
              <span>Infrared Color Slice</span>
            </span>
            <span className="font-mono tabular-nums text-cyan-300">
              Color {sliceIndex + 1}/{totalBands} · {activeWavelength.toFixed(2)} µm
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] text-slate-500">0.75µm</span>
            <input
              type="range"
              min={0}
              max={totalBands - 1}
              step={1}
              value={sliceIndex}
              onChange={(e) => onSliceIndexChange(Number(e.target.value))}
              aria-label="Wavelength Z-Slice Slider from 0.75 to 5.0 microns"
              className="w-full accent-cyan-400"
            />
            <span className="font-mono text-[10px] text-slate-500">5.0µm</span>
          </div>

          <div className="mt-1 flex items-center justify-between text-[10px] font-mono text-slate-400">
            <span>32×32×{totalBands} Light Voxels</span>
            <span className="text-fuchsia-300">
              {getBandFeatureHint(activeWavelength)}
            </span>
          </div>
        </div>
      ) : (
        <div className="mt-2 rounded-xl border border-slate-800 bg-slate-950/75 px-3 py-2 text-[11px]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-medium text-lime-300">
              3D Star Trails &amp; Planet X Motion Path
            </span>
            <span className="font-mono tabular-nums text-slate-300">
              18.4 pc · {radialVel.toFixed(1)} km/s
            </span>
          </div>
          <div className="mt-1 flex items-center justify-between font-mono text-[10px] text-slate-400">
            <span>25 Gaia Stars + Moving Target</span>
            <span className="text-cyan-300">
              pmRA {pmRa >= 0 ? '+' : ''}
              {pmRa.toFixed(1)} | pmDec {pmDec >= 0 ? '+' : ''}
              {pmDec.toFixed(1)} mas/yr
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
