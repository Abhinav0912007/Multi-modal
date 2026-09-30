export type PipelineStageId =
  | 'dataset'
  | 'roi'
  | 'preprocessing'
  | 'feature_matching'
  | 'spatial_analysis'
  | 'alignment'
  | 'transformation'
  | 'export'

export type StageStatus = 'idle' | 'ready' | 'running' | 'completed' | 'error'

export interface StageInfo {
  id: PipelineStageId
  stepNumber: number
  name: string
  shortDesc: string
  fullDesc: string
  status: StageStatus
  progress: number
  icon: string
  algorithm: string
  inputs: string[]
  outputs: string[]
  telemetryNote?: string
}

export interface PairItem {
  id: string
  has_source: boolean
  has_reference: boolean
  source_files: string[]
  reference_files: string[]
  mission?: string
  instrument?: string
  instrument_name?: string
  product_type?: string
  source_filename?: string
  reference_filename?: string
  reference_instrument?: string
  source_dimensions?: { lines: number; samples: number }
  status?: string
  status_label?: string
  reference_status?: string
  reference_status_label?: string
}

export interface PipelineConfig {
  pair_id: string
  roi_src: [number, number, number, number]
  roi_ref: [number, number, number, number]
  transform_type: 'homography' | 'affine'
  nfeatures: number
  ratio_thresh: number
  grid_size: number
  ransac_thresh: number
  do_subpixel: boolean
}

export interface RegistrationMetrics {
  image_dimensions: string | null
  gsd: string | null
  n_features: number | string | null
  candidate_matches: number | string | null
  inliers: number | string | null
  inlier_ratio?: string | null
  registration_error: number | string | null
  processing_time: number | string | null
  homography_matrix?: number[][] | null
  spatial_coverage?: number | string | null
  source_shape?: [number, number] | null
  ref_shape?: [number, number] | null
  rmse?: number | null
}

export interface SystemStatus {
  backendOnline: boolean
  activePair: string
  processingStatus: 'IDLE' | 'PROCESSING' | 'COMPLETED' | 'ERROR'
  currentStage: string
  mission: 'Chandrayaan-1' | 'Chandrayaan-2'
}

export interface DatasetFootprint {
  region_name: string
  lat_min: number
  lat_max: number
  lon_min: number
  lon_max: number
  center_lat: number
  center_lon: number
}

export interface DatasetItem {
  product_id: string
  title: string
  mission: 'Chandrayaan-1' | 'Chandrayaan-2'
  instrument: string
  instrument_code: 'TMC' | 'IIRS' | 'OHRC'
  product_type: string
  product_type_code: 'calibrated' | 'ortho' | 'dtm' | 'hyperspectral' | 'ohrc'
  acquisition_time: string
  dimensions: string
  spatial_reference: string
  resolution: string
  file_size: string
  format: string
  processing_status: 'Ready' | 'Processing' | 'Complete' | 'Archived'
  footprint: DatasetFootprint
  metadata: {
    orbit_number?: number
    orbit_altitude_km?: number
    incidence_angle_deg?: number
    emission_angle_deg?: number
    phase_angle_deg?: number
    solar_azimuth_deg?: number
    spectral_band?: string
    camera_view?: string
    calibration_level?: string
    data_provider?: string
    elevation_range_m?: string
    vertical_accuracy_m?: string
    stereo_parallax_angle?: string
    spectral_range?: string
    spectral_resolution?: string
    detection_objective?: string
    swath_width_km?: string
    ground_sampling_distance?: string
    camera_type?: string
    [key: string]: any
  }
}

export interface DatasetFilters {
  query: string
  mission: string
  instrument: string
  productType: string
  status: string
  yearPreset: string
}

export interface CatalogSummary {
  total_datasets: number
  missions: {
    chandrayaan_1: number
    chandrayaan_2: number
  }
  instruments: Record<string, number>
  product_types: Record<string, number>
  statuses: Record<string, number>
}

export interface RoiCoordinates {
  src_line_start: number
  src_sample_start: number
  src_line_end: number
  src_sample_end: number
  ref_x0: number
  ref_y0: number
  ref_x1: number
  ref_y1: number
}

export interface RoiPreviewData {
  source: string
  reference: string
  source_shape: [number, number]
  reference_shape: [number, number]
  simulated?: boolean
}

export type RoiShapeMode = 'rectangle' | 'polygon'

export interface RoiPolygonPoint {
  x: number
  y: number
}

export interface RoiMetadataStats {
  widthPx: number
  heightPx: number
  widthKm: number
  heightKm: number
  pixelCount: number
  aspectRatio: string
  latMin: string
  latMax: string
  lonMin: string
  lonMax: string
  centerCoord: string
  surfaceAreaKm2: number
  contrastScore: number
  estimatedKeypoints: number
  inlierRatio: number
}

export type ArtifactStatus = 'READY' | 'PROCESSING' | 'FAILED'

export interface ArtifactItem {
  id: string
  category: 'imagery' | 'transformation' | 'features' | 'metadata' | 'report'
  title: string
  description: string
  filename: string
  format: 'JSON' | 'CSV' | 'GeoTIFF' | 'PDF' | 'PNG' | 'HTML' | string
  mime_type: string
  exists: boolean
  status: ArtifactStatus
  size_bytes: number
  sha256?: string | null
  created_at?: string | null
  download_url?: string | null
}

export interface ScientificReportData {
  report_id: string
  generated_at: string
  project_information: {
    title: string
    agency: string
    mission: string
    software_version: string
    coordinate_reference_system: string
    classification: string
  }
  dataset_information: {
    pair_id: string
    target_lunar_feature: string
    center_latitude: string
    center_longitude: string
    spectral_band: string
    illumination_condition: string
  }
  source_metadata: {
    instrument: string
    nominal_resolution: string
    radiometric_depth: string
    swath_samples: number
    compression: string
  }
  reference_metadata: {
    instrument: string
    nominal_resolution: string
    radiometric_depth: string
    frame_type: string
    compression: string
  }
  roi_information: {
    source_roi: {
      line_start: number
      line_end: number
      sample_start: number
      sample_end: number
      dimensions: [number, number]
    }
    reference_roi: {
      y0: number
      y1: number
      x0: number
      x1: number
      dimensions: [number, number]
    }
    effective_overlap_percentage: number
  }
  processing_pipeline: {
    preprocessing: string
    feature_detector: string
    matcher: string
    ratio_test: string
    spatial_filtering: string
    estimator: string
    subpixel_refinement: string
  }
  feature_statistics: {
    source_keypoints_detected: number
    reference_keypoints_detected: number
    initial_matches: number
    good_matches_ratio_test: number
    inlier_count: number
    outlier_count: number
    inlier_ratio: number
    inlier_percentage: number
    spatial_grid_occupancy_ratio: number
  }
  transformation_model: {
    model_type: string
    degrees_of_freedom: number
    matrix_3x3: number[][]
    parameters: {
      scale_x: number
      scale_y: number
      rotation_deg: number
      rotation_rad: number
      translation_x_px: number
      translation_y_px: number
      translation_x_m: number
      translation_y_m: number
      shear: number
      condition_number: number
      determinant: number
    }
  }
  error_metrics: {
    rmse_px: number
    rmse_meters: number
    mean_reprojection_error_px: number
    max_reprojection_error_px: number
    subpixel_accuracy_level: string
    quality_grade: string
    confidence_score: number
  }
  processing_time: {
    total_wall_time_seconds: number
    io_and_decompression_s: number
    clahe_preprocessing_s: number
    sift_feature_detection_s: number
    flann_matching_s: number
    ransac_and_subpixel_s: number
    warping_and_rendering_s: number
  }
  output_artifacts: string[]
}


