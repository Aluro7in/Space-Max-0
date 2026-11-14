declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    A: any;
  }
}

export interface Coordinates {
  ra: number;
  dec: number;
  pixel_x: number;
  pixel_y: number;
}

export interface ProperMotion {
  pm_ra_mas_yr: number;
  pm_dec_mas_yr: number;
  radial_vel_km_s: number;
}

export interface MetadataFlags {
  psf_quality: string;
  zodi_subtracted: boolean;
  cosmic_ray_flag: number;
  detector_array_count: number;
}

export interface AiVerdicts {
  cnn_confidence: number;
  cnn_artifact_score: number;
  cnn_verdict_label: string;
  rnn_classification: string;
  gnn_kinematic_shift: string;
  proper_motion?: ProperMotion;
}

export interface VisualAssets {
  past_frame_base64: string;
  present_frame_base64: string;
  cnn_dashboard_base64?: string;
  timemachine_dashboard_base64?: string;
}

export interface SourceDetectionInfo {
  total_sources_found: number;
  crossmatch_mode: string;
}

export interface ScanResponse {
  status: string;
  s3_source?: string;
  fov_deg?: number;
  metadata_flags?: MetadataFlags;
  source_detection?: SourceDetectionInfo;
  coordinates: Coordinates;
  ai_verdicts: AiVerdicts;
  wavelengths: number[];
  raw_spectrum: number[];
  visual_assets: VisualAssets;
  gemini_copilot_summary: string;
}

export interface Gaia3DStar {
  id: string;
  x: number;
  y: number;
  z_parallax_pc: number;
  flux: number;
}

export interface KinematicVector {
  pm_ra: number;
  pm_dec: number;
  radial_vel: number;
  trajectory_points: [number, number, number][];
}

export interface DatacubeResponse {
  dimensions: [number, number, number];
  fov_deg?: number;
  wavelengths: number[];
  volume_data: number[][][];
  gaia_3d_stars?: Gaia3DStar[];
  kinematic_vector?: KinematicVector;
}

export interface TargetFrameMotion {
  pastX: number; // normalized [0, 1]
  pastY: number; // normalized [0, 1]
  presentX: number; // normalized [0, 1]
  presentY: number; // normalized [0, 1]
  blinkMs: number;
  pastGlow: number;
}

export interface TargetPreset {
  id: string;
  name: string;
  shortLabel: string;
  ra: number;
  dec: number;
  chemistryLabel: string;
  kidAtmosphere: string;
  gaiaMatched: boolean;
  pmRaMasYr: number;
  pmDecMasYr: number;
  radialVelKmS: number;
  cnnConfidence: number;
  cnnArtifact: number;
  verdictLabel: string;
  isAnomaly: boolean;
  motion: TargetFrameMotion;
  summary: string;
}

export interface ScanHistoryEntry {
  id: string;
  timestamp: string;
  status: string;
  fov_deg: number;
  coordinates: Coordinates;
  ai_verdicts: AiVerdicts;
  gemini_copilot_summary: string;
  wavelengths?: number[];
  raw_spectrum?: number[];
  visual_assets?: VisualAssets;
}

export type BackendConnectionMode = 'checking' | 'connected' | 'offline';

export type SkyViewMode = 'blink' | 'difference' | 'aladin';

export type AladinBaseSurvey = 'P/WISE/color' | 'P/2MASS/color' | 'P/DSS2/color';

export interface TelescopeOverlayState {
  gaiaStarMap: boolean;
  wiseHeatMap: boolean;
  twoMass: boolean;
}

export type VoteKey = 'confirm_planet' | 'flag_artifact' | 'known_star';

export interface CommunityVotes {
  confirm_planet: number;
  flag_artifact: number;
  known_star: number;
}

export type ChatRoleId = 'explorer' | 'astrophysicist' | 'analyst';

export type ChatModelMode = 'fast' | 'balanced' | 'deep';

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  modelUsed?: string;
  persona?: ChatRoleId;
  timestamp: string;
}

