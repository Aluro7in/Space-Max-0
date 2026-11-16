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
  zodi_subtracted_mjy_sr?: number;
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
  epoch1?: number[][];
  epoch2?: number[][];
  epoch1_centroid?: [number, number];
  epoch2_centroid?: [number, number];
}

export interface SourceDetectionInfo {
  total_sources_found: number;
  crossmatch_mode: string;
}

export interface PhotometryMetrics {
  snr?: number;
  surface_brightness_mjy_sr?: number;
  zodi_subtracted_mjy_sr?: number;
  gaia_residual_arcsec?: number;
  wcs_projection?: string;
  bunit?: string;
  pixel_scale_arcsec?: number;
  background_rms_sigma?: number;
}

export interface KnnSpectralMatch {
  template_name: string;
  spectral_type: string;
  estimated_teff_k: number;
  similarity_pct: number;
}

export interface AbsorptionDepths {
  h2o_1_4um: number;
  h2o_1_9um: number;
  ch4_2_3um: number;
  ch4_3_3um: number;
  co_4_6um: number;
}

export interface AstrometryTelemetry {
  epoch1_centroid?: [number, number];
  epoch2_centroid?: [number, number];
  dx_px?: number;
  dy_px?: number;
  displacement_arcsec: number;
  pm_ra_mas_yr: number;
  pm_dec_mas_yr: number;
  pm_ra?: number;
  pm_dec?: number;
  mu_total_mas_yr: number;
  total_pm_mas_yr?: number;
  estimated_distance_pc: number;
  estimated_distance_au: number;
  distance_regime?: string;
  dao_sources_epoch1?: number;
  dao_sources_epoch2?: number;
  extraction_method?: string;
}

export interface PartnerVetting {
  csa_neossat_frames: number;
  known_asteroids_count: number;
  vetting_verdict: 'VERIFIED_DEEP_SPACE_CANDIDATE' | 'KNOWN_SOLAR_SYSTEM_OBJECT' | string;
  s3_bucket_uri: string;
  zodi_subtracted_mjy_sr: number;
  dichroic_blankch_masked: boolean;
  matched_asteroids?: string[];
  parallax_regime?: string;
  cadc_live_ok?: boolean;
  skybot_live_ok?: boolean;
  summary: string;
  // Legacy aliases for backward compatibility
  status?: 'PASSED_DEEP_SPACE' | 'REJECTED_SOLAR_SYSTEM_ASTEROID' | string;
  neossat_archival_frames?: number;
  known_asteroids_in_fov?: number;
}

export type CsaNeossatVetting = PartnerVetting;

export interface TriModelScores {
  cnn_score: number;
  rnn_score: number;
  gnn_score: number;
  confidence: number;
  brown_dwarf_prob: number;
  planet_x_prob: number;
  artifact_prob: number;
  model_version: string;
}

export interface MlTelemetry {
  model_version: string;
  model_version_step: number;
  candidate_confidence_pct: number;
  brown_dwarf_prob: number;
  planet_x_prob: number;
  artifact_prob: number;
  cnn_score?: number;
  rnn_score?: number;
  gnn_score?: number;
  displacement_arcsec?: number;
}

export interface FitsEpochHeaderInfo {
  survey?: string;
  CRVAL1?: number;
  CRVAL2?: number;
  CDELT1?: number;
  CDELT2?: number;
  BUNIT?: string;
  detector_band?: number;
  pixel_scale_arcsec?: number;
  zodi_flux_mjy_sr?: number;
  rms_sigma?: number;
  peak_snr?: number;
  live_fits?: boolean;
}

export interface FitsHeaderMetadata {
  source_mode?: string;
  epoch1?: FitsEpochHeaderInfo;
  epoch2?: FitsEpochHeaderInfo;
  astrometry?: AstrometryTelemetry;
}

export interface RlhfVoteRecord {
  id: number;
  ra: number;
  dec: number;
  target_name: string;
  vote_type: string;
  pre_confidence: number;
  post_confidence: number;
  loss_value: number;
  weight_delta: number;
  model_version: string;
  created_at: string;
}

export interface RlhfTrainingMetrics {
  status: string;
  model_version: string;
  pre_confidence: number;
  post_confidence: number;
  initial_confidence?: number;
  updated_confidence?: number;
  confidence_delta?: number;
  loss: number;
  gradient_loss?: number;
  weight_delta_norm: number;
  brown_dwarf_prob?: number;
  planet_x_prob?: number;
  artifact_prob?: number;
  total_votes: number;
  planet_votes: number;
  artifact_votes: number;
  known_star_votes: number;
  total_community_votes?: number;
  recent_votes?: RlhfVoteRecord[];
  csa_vetting_status?: string;
}

export type RlhfFeedbackResponse = RlhfTrainingMetrics;

export interface FeedbackStatsResponse {
  total_votes: number;
  planet_votes: number;
  artifact_votes: number;
  known_star_votes: number;
  breakdown?: {
    confirm_planet: number;
    flag_artifact: number;
    known_star: number;
  };
  total_scans_logged?: number;
  loss_history?: Array<{
    id: number;
    loss: number;
    weight_delta: number;
    model_version: string;
    created_at: string;
  }>;
  recent_votes?: RlhfVoteRecord[];
  model_version?: string;
}

export interface ScanResponse {
  status: string;
  s3_source?: string;
  s3_bucket_uri?: string;
  s3_reachable?: boolean;
  wise_s3_reachable?: boolean;
  sia_collection?: string;
  mef_extensions?: string[];
  fov_deg?: number;
  metadata_flags?: MetadataFlags;
  zodi_subtracted_mjy_sr?: number;
  blank_channels?: number[];
  dichroic_gap_um?: number;
  absorption_depths?: AbsorptionDepths;
  source_detection?: SourceDetectionInfo;
  photometry?: PhotometryMetrics;
  astrometry?: AstrometryTelemetry;
  partner_vetting?: PartnerVetting;
  csa_neossat_vetting?: PartnerVetting;
  tri_model_scores?: TriModelScores;
  knn_spectral_matches?: KnnSpectralMatch[];
  ml_telemetry?: MlTelemetry;
  rlhf_stats?: FeedbackStatsResponse;
  fits_header?: FitsHeaderMetadata;
  epoch1?: number[][];
  epoch2?: number[][];
  coordinates: Coordinates;
  ai_verdicts: AiVerdicts;
  wavelengths: number[];
  raw_spectrum: number[];
  spectrum?: number[];
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
