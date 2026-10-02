import type { PairItem, PipelineConfig, RegistrationMetrics, DatasetItem, DatasetFilters, CatalogSummary, ArtifactItem, ScientificReportData } from './types'

export const API_BASE = (import.meta.env.VITE_API_BASE_URL ? (import.meta.env.VITE_API_BASE_URL as string).replace(/\/$/, '') : '') + '/api'

export async function fetchDatasets(filters?: Partial<DatasetFilters>): Promise<DatasetItem[]> {
  try {
    const params = new URLSearchParams()
    if (filters?.query) params.append('q', filters.query)
    if (filters?.mission && filters.mission !== 'all') params.append('mission', filters.mission)
    if (filters?.instrument && filters.instrument !== 'all') params.append('instrument', filters.instrument)
    if (filters?.productType && filters.productType !== 'all') params.append('product_type', filters.productType)
    if (filters?.status && filters.status !== 'all') params.append('status', filters.status)
    if (filters?.yearPreset && filters.yearPreset !== 'all') params.append('year_preset', filters.yearPreset)

    const url = `${API_BASE}/datasets${params.toString() ? `?${params.toString()}` : ''}`
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) })
    if (res.ok) {
      const data = await res.json()
      if (Array.isArray(data)) return data
    }
  } catch (err) {
    console.warn('Backend /datasets unavailable, using client dataset catalog:', err)
  }

  return []
}

export async function fetchDatasetById(productId: string): Promise<DatasetItem | null> {
  try {
    const res = await fetch(`${API_BASE}/datasets/${encodeURIComponent(productId)}`, { signal: AbortSignal.timeout(3000) })
    if (res.ok) {
      return await res.json()
    }
  } catch (err) {
    console.warn(`Failed to fetch dataset ${productId}:`, err)
  }
  return null
}

export async function fetchCatalogSummary(): Promise<CatalogSummary | null> {
  try {
    const res = await fetch(`${API_BASE}/datasets/summary`, { signal: AbortSignal.timeout(3000) })
    if (res.ok) {
      return await res.json()
    }
  } catch (err) {
    console.warn('Failed to fetch catalog summary:', err)
  }
  return null
}

export async function fetchAutoDetectTerrain(pairId: string): Promise<{ y0: number; y1: number; x0: number; x1: number }> {
  try {
    const res = await fetch(`${API_BASE}/terrain/auto-detect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pair_id: pairId }),
      signal: AbortSignal.timeout(6000),
    })
    if (res.ok) {
      return await res.json()
    }
  } catch (err) {
    console.warn('Auto-detect terrain error:', err)
  }
  return { y0: 35000, y1: 41000, x0: 60000, x1: 64000 }
}

export async function fetchRoiPreview(
  pairId: string,
  roiSrc: [number, number, number, number],
  roiRef: [number, number, number, number]
): Promise<any> {
  try {
    const res = await fetch(`${API_BASE}/preview/roi`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pair_id: pairId, roi_src: roiSrc, roi_ref: roiRef }),
      signal: AbortSignal.timeout(8000),
    })
    if (res.ok) {
      return await res.json()
    }
  } catch (err) {
    console.warn('Preview ROI request error:', err)
  }
  return null
}

export async function checkBackendHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(2000) })
    if (!res.ok) return false
    const data = await res.json()
    return data.status === 'ok'
  } catch {
    return false
  }
}

export async function fetchAvailablePairs(): Promise<PairItem[]> {
  try {
    const res = await fetch(`${API_BASE}/pairs`, { signal: AbortSignal.timeout(3000) })
    if (res.ok) {
      const data = await res.json()
      if (Array.isArray(data) && data.length > 0) {
        return data
      }
    }
  } catch (err) {
    console.warn('Backend not responding to /pairs, using fallback pair data:', err)
  }

  // Fallback defaults matching canonical dataset manifest
  return [
    {
      id: 'pair_001',
      has_source: true,
      has_reference: true,
      mission: 'Chandrayaan-2',
      instrument: 'OHRC',
      instrument_name: 'Chandrayaan-2 OHRC',
      source_filename: 'ch2_ohr_ncp_20240316T2008014680_d_img_d18.img',
      reference_filename: 'M1536201804CC.IMG',
      reference_instrument: 'LROC',
      status: 'pending_validation',
      status_label: 'Pending validation',
      reference_status: 'UNKNOWN',
      reference_status_label: 'Reference geographic overlap: NOT YET VERIFIED',
      source_files: ['ch2_ohr_ncp_20240316T2008014680_d_img_d18.img', 'ch2_ohr_ncp_20240316T2008014680_d_img_d18.lbl'],
      reference_files: ['M1536201804CC.IMG'],
    },
    {
      id: 'pair_002',
      has_source: true,
      has_reference: true,
      mission: 'Chandrayaan-2',
      instrument: 'IIRS',
      instrument_name: 'Chandrayaan-2 IIRS',
      product_type: 'HYPERSPECTRAL',
      is_hyperspectral: true,
      band_extracted: false,
      source_filename: 'ch2_iir_nci_20210115T0628272014_d_img_d32.qub',
      reference_filename: 'M1536201804CC.IMG',
      reference_instrument: 'LROC',
      status: 'band_extraction_required',
      status_label: 'Band extraction required',
      reference_status: 'UNKNOWN',
      reference_status_label: 'Reference geographic overlap: NOT YET VERIFIED',
      source_files: ['ch2_iir_nci_20210115T0628272014_d_img_d32.qub'],
      reference_files: ['M1536201804CC.IMG'],
    },
    {
      id: 'pair_003',
      has_source: true,
      has_reference: true,
      mission: 'Chandrayaan-1',
      instrument: 'TMC',
      instrument_name: 'Chandrayaan-1 TMC',
      source_filename: 'ch1_tmc_nca_20090529T0853239926_d_img_d18.img',
      reference_filename: 'M1536201804CC.IMG',
      reference_instrument: 'LROC',
      status: 'pending_validation',
      status_label: 'Pending validation',
      reference_status: 'UNKNOWN',
      reference_status_label: 'Reference geographic overlap: NOT YET VERIFIED',
      source_files: ['ch1_tmc_nca_20090529T0853239926_d_img_d18.img'],
      reference_files: ['M1536201804CC.IMG'],
    }
  ]
}

export async function launchRegistrationApi(config: PipelineConfig): Promise<{ job_id: string; isReal: boolean }> {
  try {
    const res = await fetch(`${API_BASE}/pipeline/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
      signal: AbortSignal.timeout(5000)
    })
    if (res.ok) {
      const data = await res.json()
      return { job_id: data.job_id, isReal: true }
    }
  } catch (err) {
    console.warn('Backend /pipeline/run unreachable, engaging mission simulation runner:', err)
  }

  // Return simulated job id
  return { job_id: `sim_job_${Date.now().toString(36)}`, isReal: false }
}

export function subscribeToPipelineEvents(
  jobId: string,
  isReal: boolean,
  callbacks: {
    onProgress: (step: number, progress: number, message: string) => void
    onComplete: (metrics: RegistrationMetrics, artifacts: Record<string, string>) => void
    onError: (err: string) => void
  }
): () => void {
  if (isReal && !jobId.startsWith('sim_')) {
    const eventSource = new EventSource(`${API_BASE}/pipeline/status/${jobId}`)

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        if (data.type === 'progress') {
          callbacks.onProgress(data.step, data.progress, data.message)
        } else if (data.type === 'completed') {
          callbacks.onComplete(data.metrics, data.artifacts || {})
          eventSource.close()
        } else if (data.type === 'failed' || data.type === 'error') {
          callbacks.onError(data.error || 'Pipeline execution failed')
          eventSource.close()
        }
      } catch (e) {
        console.error('Error parsing SSE event:', e)
      }
    }

    eventSource.onerror = () => {
      console.warn('SSE connection closed or errored')
      eventSource.close()
    }

    return () => eventSource.close()
  }

  // Simulated scientific registration execution
  let active = true
  const steps = [
    { step: 1, prog: 12, msg: 'TMC Archive Ingestion: Extracting tar package & validating PDS headers...' },
    { step: 2, prog: 25, msg: 'Region of Interest (ROI): Bounding sub-scene to (0:6000, 0:4000) px...' },
    { step: 3, prog: 38, msg: 'Preprocessing: Performing 16-bit 1st-99th percentile scaling and CLAHE...' },
    { step: 4, prog: 52, msg: 'Feature Matching: Extracting multiscale SIFT keypoints and FLANN k-NN matching...' },
    { step: 5, prog: 65, msg: 'Spatial Analysis: Applying 8x8 cell grid uniformity filtering (25 max/cell)...' },
    { step: 6, prog: 78, msg: 'Alignment & Outlier Rejection: Estimating RANSAC Homography & LK subpixel refinement...' },
    { step: 7, prog: 90, msg: 'Transformation: Warping TMC source image to LRO reference coordinate frame...' },
    { step: 8, prog: 100, msg: 'Export: Writing registered GeoTIFF, checkerboard overlay, and CSV metrics...' },
  ]

  let idx = 0
  const timer = setInterval(() => {
    if (!active) {
      clearInterval(timer)
      return
    }

    if (idx < steps.length) {
      const s = steps[idx]
      callbacks.onProgress(s.step, s.prog, s.msg)
      idx++
    } else {
      clearInterval(timer)
      const simulatedMetrics: RegistrationMetrics = {
        image_dimensions: '4000 × 6000 px',
        gsd: '5.0 m/px (TMC) / 100 m/px (Ref)',
        n_features: 15000,
        candidate_matches: 3418,
        inliers: 1842,
        inlier_ratio: '53.89%',
        registration_error: '0.84 px RMSE',
        processing_time: '14.28 s',
        rmse: 0.84,
      }
      callbacks.onComplete(simulatedMetrics, {
        registered: '/api/artifacts/pair_001/registered.png',
        checkerboard: '/api/artifacts/pair_001/checkerboard.png',
        matches_filtered: '/api/artifacts/pair_001/matches_filtered.png',
        spatial_grid: '/api/artifacts/pair_001/spatial_grid.png',
        overlay: '/api/artifacts/pair_001/overlay.png',
      })
    }
  }, 1600)

  return () => {
    active = false
    clearInterval(timer)
  }
}

export interface FeatureMatchParams {
  pair_id: string
  roi_src?: [number, number, number, number]
  roi_ref?: [number, number, number, number]
  nfeatures?: number
  ratio_thresh?: number
  ransac_thresh?: number
  transform_type?: string
  max_return_matches?: number
}

export interface FeatureMatchResult {
  status: 'completed' | 'insufficient_matches' | 'failed' | 'requires_band_extraction'
  message?: string
  elapsed_seconds?: number
  is_simulated?: boolean
  instrument?: string
  mission?: string
  instrument_name?: string
  source_filename?: string
  reference_filename?: string
  reference_status_label?: string
  validation_state?: string
  validation_reason?: string
  is_statistically_valid?: boolean
  native_source_dimensions?: [number, number]
  native_reference_dimensions?: [number, number]
  source_dimensions: [number, number]
  reference_dimensions: [number, number]
  source_image?: string
  reference_image?: string
  source_keypoints: { x: number; y: number; size?: number }[]
  reference_keypoints: { x: number; y: number; size?: number }[]
  matches: {
    id: number
    source_pt: [number, number]
    ref_pt: [number, number]
    distance: number
    is_inlier: boolean
    error: number
  }[]
  stats: {
    source_features_count: number
    reference_features_count: number
    candidate_matches_count: number
    verified_matches_count: number
    inliers_count: number
    outliers_count: number
    inlier_ratio: number
    mean_reprojection_error: number
    rmse: number
    rmse_formatted?: string
    spatial_coverage?: number
    validation_state?: string
    validation_reason?: string
    is_statistically_valid?: boolean
  }
  transformation_matrix?: number[][]
}

export async function fetchFeatureMatching(params: FeatureMatchParams): Promise<FeatureMatchResult> {
  const res = await fetch(`${API_BASE}/features/match`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
    signal: AbortSignal.timeout(25000),
  })
  if (!res.ok) {
    const errorText = await res.text()
    throw new Error(`Feature matching service responded with ${res.status}: ${errorText}`)
  }
  return await res.json()
}

export interface SpatialCell {
  row: number
  col: number
  x0: number
  y0: number
  w: number
  h: number
  inliers: number
  outliers: number
  status: 'active' | 'empty' | 'deficient'
}

export interface SpatialAnalyzeParams {
  pair_id: string
  grid_rows?: number
  grid_cols?: number
  min_inliers_per_cell?: number
  roi_src?: [number, number, number, number]
  roi_ref?: [number, number, number, number]
}

export interface SpatialAnalyzeResult {
  status: string
  pair_id: string
  grid_dimensions: { rows: number; cols: number; total_cells: number }
  cell_size_px: { width: number; height: number }
  reference_image: string
  source_image: string
  dimensions: { ref_h: number; ref_w: number; src_h: number; src_w: number }
  inliers: [number, number][]
  outliers: [number, number][]
  keypoints: { x: number; y: number; size?: number }[]
  cells: SpatialCell[]
  statistics: {
    total_inliers: number
    total_outliers: number
    active_cells: number
    empty_cells: number
    deficient_cells: number
    coverage_ratio: number
    coverage_percentage: number
    mean_inliers_per_active_cell: number
    max_inliers_in_cell: number
    coefficient_of_variation: number
    spatial_uniformity_index: number
    quadrants: {
      nw: number
      ne: number
      sw: number
      se: number
    }
    assessment: string
    assessment_level: 'optimal' | 'warning' | 'critical'
  }
}

export async function fetchSpatialAnalysis(params: SpatialAnalyzeParams): Promise<SpatialAnalyzeResult> {
  const res = await fetch(`${API_BASE}/spatial/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
    signal: AbortSignal.timeout(25000),
  })
  if (!res.ok) {
    const errorText = await res.text()
    throw new Error(`Spatial analysis service responded with ${res.status}: ${errorText}`)
  }
  return await res.json()
}

export interface AlignmentMetrics {
  rmse: number
  mad: number
  ncc: number
  overlap_ratio: number
  quality_rating: string
}

export interface AlignmentParameters {
  dx: number
  dy: number
  rotation_deg: number
  scale_x: number
  scale_y: number
  shear_x: number
  shear_y: number
}

export interface AlignmentPairResult {
  status: string
  pair_id: string
  is_simulated: boolean
  dimensions: { width: number; height: number }
  source_image: string
  reference_image: string
  aligned_image: string
  auto_parameters: AlignmentParameters
  matrix_3x3: number[][]
  inliers_count: number
  total_matches: number
  before_metrics: AlignmentMetrics
  after_metrics: AlignmentMetrics
}

export interface TransformWarpParams {
  pair_id: string
  dx: number
  dy: number
  rotation_deg: number
  scale_x: number
  scale_y: number
  shear_x: number
  shear_y: number
  transform_type?: string
}

export async function fetchAlignmentPair(pairId: string): Promise<AlignmentPairResult> {
  try {
    const res = await fetch(`${API_BASE}/alignment/pair/${encodeURIComponent(pairId)}`, {
      signal: AbortSignal.timeout(15000),
    })
    if (res.ok) {
      return await res.json()
    }
  } catch (err) {
    console.warn(`Alignment endpoint failed for ${pairId}, using client synthetic generator:`, err)
  }

  // Standalone client fallback if backend is offline
  return generateClientSyntheticAlignment(pairId)
}

export async function fetchAlignmentWarp(params: AlignmentParameters & { pair_id: string }): Promise<{
  status: string
  pair_id: string
  aligned_image: string
  parameters: AlignmentParameters
  matrix_3x3: number[][]
  metrics: AlignmentMetrics
}> {
  const res = await fetch(`${API_BASE}/alignment/warp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Alignment warp responded with ${res.status}: ${errText}`)
  }
  return await res.json()
}

/** Client-side fallback generator if backend is not reachable */
function generateClientSyntheticAlignment(pairId: string): AlignmentPairResult {
  const size = 512
  const cSrc = document.createElement('canvas')
  cSrc.width = size
  cSrc.height = size
  const ctxSrc = cSrc.getContext('2d')!

  // Background lunar regolith
  ctxSrc.fillStyle = '#7a828e'
  ctxSrc.fillRect(0, 0, size, size)

  // Draw procedural craters
  const craters = [
    { x: 180, y: 190, r: 64, d: 25 },
    { x: 340, y: 160, r: 42, d: 18 },
    { x: 260, y: 350, r: 80, d: 32 },
    { x: 110, y: 380, r: 35, d: 14 },
    { x: 420, y: 390, r: 50, d: 20 },
    { x: 390, y: 270, r: 28, d: 12 },
    { x: 120, y: 120, r: 30, d: 12 },
  ]

  for (const c of craters) {
    const g = ctxSrc.createRadialGradient(c.x, c.y, 2, c.x, c.y, c.r)
    g.addColorStop(0, '#2d333b')
    g.addColorStop(0.7, '#49515c')
    g.addColorStop(0.85, '#9aa5b5')
    g.addColorStop(1, '#7a828e')
    ctxSrc.fillStyle = g
    ctxSrc.beginPath()
    ctxSrc.arc(c.x, c.y, c.r, 0, Math.PI * 2)
    ctxSrc.fill()

    // Solar rim highlight
    ctxSrc.strokeStyle = 'rgba(255, 255, 255, 0.45)'
    ctxSrc.lineWidth = 3
    ctxSrc.beginPath()
    ctxSrc.arc(c.x, c.y, c.r, -Math.PI * 0.75, -Math.PI * 0.1)
    ctxSrc.stroke()
  }

  // Create Reference with physical satellite offset: dx=14.5, dy=-9.2, rot=2.45deg, scale=1.025
  const cRef = document.createElement('canvas')
  cRef.width = size
  cRef.height = size
  const ctxRef = cRef.getContext('2d')!

  ctxRef.fillStyle = '#737a85'
  ctxRef.fillRect(0, 0, size, size)

  ctxRef.save()
  ctxRef.translate(size / 2, size / 2)
  ctxRef.rotate((2.45 * Math.PI) / 180)
  ctxRef.scale(1.025, 1.025)
  ctxRef.translate(-size / 2 + 14.5, -size / 2 - 9.2)
  ctxRef.drawImage(cSrc, 0, 0)
  ctxRef.restore()

  // Aligned canvas matches reference geometry
  const cAligned = document.createElement('canvas')
  cAligned.width = size
  cAligned.height = size
  const ctxAligned = cAligned.getContext('2d')!
  ctxAligned.drawImage(cRef, 0, 0)

  const srcB64 = cSrc.toDataURL('image/png').split(',')[1]
  const refB64 = cRef.toDataURL('image/png').split(',')[1]
  const alignedB64 = cAligned.toDataURL('image/png').split(',')[1]

  return {
    status: 'success',
    pair_id: pairId,
    is_simulated: true,
    dimensions: { width: size, height: size },
    source_image: srcB64,
    reference_image: refB64,
    aligned_image: alignedB64,
    auto_parameters: {
      dx: 14.5,
      dy: -9.2,
      rotation_deg: 2.45,
      scale_x: 1.025,
      scale_y: 1.025,
      shear_x: 0.012,
      shear_y: 0.0,
    },
    matrix_3x3: [
      [1.024, -0.0438, 14.5],
      [0.0438, 1.024, -9.2],
      [0.0, 0.0, 1.0],
    ],
    inliers_count: 1842,
    total_matches: 2450,
    before_metrics: {
      rmse: 28.45,
      mad: 22.18,
      ncc: 0.542,
      overlap_ratio: 0.94,
      quality_rating: 'UNREGISTERED • High Disparity (~28 px)',
    },
    after_metrics: {
      rmse: 0.84,
      mad: 0.62,
      ncc: 0.988,
      overlap_ratio: 0.985,
      quality_rating: 'EXCELLENT • Sub-pixel Registration',
    },
  }
}

// -----------------------------------------------------------------------------
// PHASE 9: SCIENTIFIC TRANSFORMATION ANALYSIS
// -----------------------------------------------------------------------------

export interface MatrixElement {
  symbol: string
  value: number
  role: string
  group: 'affine_linear' | 'translation' | 'projective' | 'normalizer'
  unit?: string
}

export interface TransformationAnalysisResult {
  status: string
  pair_id: string
  is_simulated: boolean
  dimensions: { width: number; height: number }
  transform_type: 'homography' | 'affine'
  transform_type_label: string
  degrees_of_freedom: number
  matrix_3x3: number[][]
  matrix_layout: MatrixElement[][]
  matrix_latex: string
  properties: {
    determinant: number
    condition_number: number
    singular_values: number[]
    is_invertible: boolean
    area_dilation_factor: number
  }
  parameters: {
    dx_px: number
    dy_px: number
    dx_meters: number
    dy_meters: number
    translation_magnitude_px: number
    translation_magnitude_meters: number
    rotation_deg: number
    rotation_rad: number
    scale_x: number
    scale_y: number
    scale_average: number
    anisotropy_ratio: number
    shear_x: number
    shear_y: number
    shear_angle_deg: number
    projective_v1: number
    projective_v2: number
  }
  residual_statistics: {
    inliers_count: number
    outliers_count: number
    total_candidates: number
    inlier_ratio: number
    inlier_percentage: number
    min_error: number
    max_error: number
    mean_error: number
    median_error: number
    std_error: number
    variance: number
    rmse: number
    mad: number
    q1: number
    q3: number
    iqr: number
    p95: number
    p99: number
  }
  error_metrics: {
    rmse_px: number
    rmse_meters: number
    mean_reproj_error_px: number
    mean_reproj_error_meters: number
    max_reproj_error_px: number
    max_reproj_error_meters: number
    subpixel_accuracy: boolean
    quality_rating: string
    quality_grade: string
    status_color: string
    ransac_threshold_px: number
    spatial_coverage_percentage: number
  }
  coordinate_system: {
    source_crs: string
    source_instrument: string
    source_resolution: string
    reference_crs: string
    reference_instrument: string
    reference_resolution: string
    datum: string
    registration_origin: string
    mapping_equation: string
    spatial_units: string
    interpolation_kernel: string
  }
  error_distribution: {
    bin_index: number
    range_min: number
    range_max: number
    range_label: string
    count: number
    percentage: number
    cumulative_percentage: number
  }[]
  residuals: {
    id: number
    source_x: number
    source_y: number
    ref_x: number
    ref_y: number
    projected_x: number
    projected_y: number
    residual_dx: number
    residual_dy: number
    residual_error: number
    dist_from_center: number
    is_inlier: boolean
  }[]
  transformation_summary: {
    mission: string
    experiment: string
    solution_status: string
    algorithm: string
    verification_note: string
    mathematical_fidelity: string
  }
}

export async function fetchTransformationAnalysis(
  pairId: string,
  transformType: 'homography' | 'affine' = 'homography',
  ransacThresh: number = 3.0
): Promise<TransformationAnalysisResult> {
  const url = `${API_BASE}/transformation/${encodeURIComponent(pairId)}?transform_type=${transformType}&ransac_thresh=${ransacThresh}`
  const res = await fetch(url, { signal: AbortSignal.timeout(20000) })
  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Transformation analysis failed (${res.status}): ${errText}`)
  }
  return await res.json()
}

export async function fetchScientificReport(
  pairId: string,
  transformType: string = 'homography',
  ransacThresh: number = 3.0
): Promise<{ status: string; pair_id: string; format: string; report_content: string }> {
  const url = `${API_BASE}/transformation/${encodeURIComponent(pairId)}/export/report?transform_type=${transformType}&ransac_thresh=${ransacThresh}`
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Report export failed (${res.status}): ${errText}`)
  }
  return await res.json()
}

export async function fetchArtifactsCatalog(pairId: string): Promise<ArtifactItem[]> {
  try {
    const res = await fetch(`${API_BASE}/artifacts/${encodeURIComponent(pairId)}`, {
      signal: AbortSignal.timeout(6000)
    })
    if (res.ok) {
      return await res.json()
    }
  } catch (err) {
    console.warn(`Artifacts catalog fetch failed for ${pairId}:`, err)
  }
  return []
}

export async function triggerGenerateReport(
  pairId: string,
  roiSrc?: [number, number, number, number],
  roiRef?: [number, number, number, number]
): Promise<{ status: string; artifacts: ArtifactItem[]; report: ScientificReportData }> {
  const url = `${API_BASE}/artifacts/${encodeURIComponent(pairId)}/generate-report`
  const payload: any = {}
  if (roiSrc) payload.roi_src = roiSrc
  if (roiRef) payload.roi_ref = roiRef

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30000)
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Report generation failed (${res.status}): ${errText}`)
  }
  return await res.json()
}

export async function fetchStructuredScientificReport(pairId: string): Promise<ScientificReportData | null> {
  try {
    const res = await fetch(`${API_BASE}/artifacts/${encodeURIComponent(pairId)}/report`, {
      signal: AbortSignal.timeout(6000)
    })
    if (res.ok) {
      return await res.json()
    }
  } catch (err) {
    console.warn(`Scientific report fetch failed for ${pairId}:`, err)
  }
  return null
}

export interface PreprocessParams {
  pair_id: string
  roi_src: [number, number, number, number]
  roi_ref: [number, number, number, number]
  enable_normalization?: boolean
  p_low?: number
  p_high?: number
  enable_clahe?: boolean
  clip_limit?: number
  tile_grid_size?: number
}

export interface PreprocessResult {
  status: string
  pair_id: string
  source_raw: string
  source_processed: string
  reference_raw: string
  reference_processed: string
  source_shape: [number, number]
  reference_shape: [number, number]
  warning: string | null
  parameters: {
    enable_normalization: boolean
    p_low: number
    p_high: number
    enable_clahe: boolean
    clip_limit: number
    tile_grid_size: number
  }
}

export async function executePreprocessing(params: PreprocessParams): Promise<PreprocessResult | null> {
  try {
    const res = await fetch(`${API_BASE}/preprocessing/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
      signal: AbortSignal.timeout(15000),
    })
    if (res.ok) {
      return await res.json()
    }
  } catch (err) {
    console.warn('Preprocessing execution error:', err)
  }
  return null
}


