import type { StageInfo } from '../types'

export const DEFAULT_STAGES: StageInfo[] = [
  {
    id: 'dataset',
    stepNumber: 1,
    name: 'Dataset',
    shortDesc: 'TMC PDS bundle ingestion & extraction',
    fullDesc: 'Scans and parses NASA PDS3 / ISRO ISSDC calibrated archives, verifying telemetry headers, exposure parameters, and label descriptors.',
    status: 'ready',
    progress: 100,
    icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"/><path d="M18 14h-8M15 18h-5M10 6h8v4h-8V6Z"/></svg>`,
    algorithm: 'PDS3/VICAR Archive Parser & Tar Extractor',
    inputs: ['TMC Calibrated Archive (.tar, .img, .lbl)', 'LRO WAC Reference Basemap (.tif)'],
    outputs: ['Raw 16-bit TMC Scientific Array', 'GeoTIFF Reference Array'],
  },
  {
    id: 'roi',
    stepNumber: 2,
    name: 'ROI',
    shortDesc: 'Sub-scene coordinate windowing & cropping',
    fullDesc: 'Bounds the active sub-scene to target pixel coordinates, isolating high-contrast lunar maria and impact craters for precision alignment.',
    status: 'ready',
    progress: 100,
    icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M18 22V8a2 2 0 0 0-2-2H2"/></svg>`,
    algorithm: '2D Pixel Coordinate Windowing & Memory Slicing',
    inputs: ['Full Swath Array (4000 × 50000+ px)'],
    outputs: ['Target Sub-scene Source ROI (0:6000, 0:4000) px', 'Reference Search ROI'],
  },
  {
    id: 'preprocessing',
    stepNumber: 3,
    name: 'Preprocessing',
    shortDesc: '16-bit percentile dynamic range & CLAHE',
    fullDesc: 'Normalizes extreme lunar shadow and sunlit photometric contrasts using 1st–99th percentile dynamic range stretching followed by tile-adaptive CLAHE.',
    status: 'idle',
    progress: 0,
    icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 0 1 0 20Z"/></svg>`,
    algorithm: '1st–99th Percentile Scaling + CLAHE (Tile: 8×8, Clip: 2.0)',
    inputs: ['Raw 16-bit Scientific Image Arrays'],
    outputs: ['Radiometrically Enhanced 8-bit Spatial Arrays'],
  },
  {
    id: 'feature_matching',
    stepNumber: 4,
    name: 'Feature Matching',
    shortDesc: 'Multiscale SIFT & FLANN ratio matching',
    fullDesc: 'Extracts scale-space invariant keypoints across Difference-of-Gaussians octaves, performing bi-directional FLANN k-NN matching with Lowe\'s ratio test.',
    status: 'idle',
    progress: 0,
    icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>`,
    algorithm: 'SIFT Scale-Space Invariant Detector + FLANN Matcher (k=2, ratio=0.75)',
    inputs: ['Enhanced TMC Source & Reference Rasters'],
    outputs: ['Initial Candidate Match Coordinate Vectors (15,000 max features)'],
  },
  {
    id: 'spatial_analysis',
    stepNumber: 5,
    name: 'Spatial Analysis',
    shortDesc: '8×8 cell grid uniformity filtering',
    fullDesc: 'Partitions the lunar field into an 8×8 spatial grid to suppress dense feature clustering around dominant crater rims and guarantee uniform spatial coverage.',
    status: 'idle',
    progress: 0,
    icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/></svg>`,
    algorithm: 'Spatial Uniformity Grid Filter (Grid: 8×8, Max 25 keypoints/cell)',
    inputs: ['Raw Candidate SIFT Matches'],
    outputs: ['Uniformly Distributed Tie Points & Grid Density Heatmap'],
  },
  {
    id: 'alignment',
    stepNumber: 6,
    name: 'Alignment',
    shortDesc: 'RANSAC homography & LK sub-pixel',
    fullDesc: 'Computes robust projective geometric transformation using RANSAC outlier elimination, refined by Lucas-Kanade forward-backward optical flow tracking.',
    status: 'idle',
    progress: 0,
    icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="22" y1="12" x2="18" y2="12"/><line x1="6" y1="12" x2="2" y2="12"/><line x1="12" y1="6" x2="12" y2="2"/><line x1="12" y1="22" x2="12" y2="18"/></svg>`,
    algorithm: 'RANSAC Homography (Thresh: 3.0 px) + Lucas-Kanade Subpixel Refinement',
    inputs: ['Spatially Filtered Match Coordinates'],
    outputs: ['Optimized 3×3 Projective Matrix H & Sub-pixel Coordinates'],
  },
  {
    id: 'transformation',
    stepNumber: 7,
    name: 'Transformation',
    shortDesc: 'Bicubic surface warping to reference frame',
    fullDesc: 'Applies inverse perspective transformation to resample and warp the TMC source image into the exact spatial coordinate system of the reference product.',
    status: 'idle',
    progress: 0,
    icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="21 8 21 21 3 21"/><path d="m1 1 20 20"/><path d="m21 1-5 5"/></svg>`,
    algorithm: 'Projective Inverse Mapping & Bicubic Convolution Warping',
    inputs: ['TMC Source Raster + Transformation Matrix H'],
    outputs: ['Registered TMC Scientific Raster aligned to LRO Reference'],
  },
  {
    id: 'export',
    stepNumber: 8,
    name: 'Export',
    shortDesc: 'GeoTIFF, verification overlays & CSV metrics',
    fullDesc: 'Exports aligned GeoTIFF rasters with embedded spatial georeferencing, blended checkerboard inspection tiles, and comprehensive CSV tie-point tables.',
    status: 'idle',
    progress: 0,
    icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
    algorithm: 'GeoTIFF Serializer, 50/50 Alpha Blender, Checkerboard & JSON Exporter',
    inputs: ['Registered Raster, Reference Raster, Tie Point Coordinates'],
    outputs: ['registered.tif, checkerboard.png, overlay.png, metrics.json, matches.csv'],
  },
]

export class PipelineSection {
  private container: HTMLElement
  private stages: StageInfo[]
  private onSelectStage: (stage: StageInfo) => void

  constructor(
    container: HTMLElement,
    onSelectStage: (stage: StageInfo) => void,
    initialStages: StageInfo[] = DEFAULT_STAGES
  ) {
    this.container = container
    this.stages = initialStages
    this.onSelectStage = onSelectStage
    this.render()
  }

  public updateStageProgress(stepNumber: number, progress: number, message?: string) {
    this.stages = this.stages.map((st) => {
      if (st.stepNumber < stepNumber) {
        return { ...st, status: 'completed', progress: 100 }
      } else if (st.stepNumber === stepNumber) {
        return {
          ...st,
          status: 'running',
          progress: progress,
          telemetryNote: message,
        }
      } else {
        return { ...st, status: 'idle', progress: 0 }
      }
    })
    this.render()
  }

  public markAllCompleted() {
    this.stages = this.stages.map((st) => ({
      ...st,
      status: 'completed',
      progress: 100,
    }))
    this.render()
  }

  public resetStages() {
    this.stages = DEFAULT_STAGES.map((s) => ({ ...s }))
    this.render()
  }

  public render() {
    this.container.innerHTML = `
      <section class="pipeline-section glass-panel corner-reticle">
        <div class="pipeline-header">
          <h2>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--cyan-bright)" stroke-width="2">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
            Sequential Processing Pipeline Flow
          </h2>
          <span style="font-family: var(--font-mono); font-size: 11px; color: var(--text-secondary);">
            Click any stage node to inspect algorithm parameters & workspace
          </span>
        </div>

        <div class="pipeline-flow-grid">
          ${this.stages
            .map((stage) => {
              const isActive = stage.status === 'running'
              const isDone = stage.status === 'completed'
              const nodeClass = isActive ? 'active' : isDone ? 'complete' : ''

              let statusText = 'READY'
              if (isActive) statusText = `${stage.progress}%`
              else if (isDone) statusText = 'DONE'
              else if (stage.status === 'idle') statusText = 'IDLE'

              return `
                <div class="stage-node-card ${nodeClass}" data-stage-id="${stage.id}" title="${stage.name}: Click to inspect workspace">
                  <div class="stage-top">
                    <span class="stage-number">0${stage.stepNumber}</span>
                    <span class="badge-status ${isActive ? 'processing' : isDone ? '' : 'idle'}" style="padding: 2px 6px; font-size: 10px;">
                      ${statusText}
                    </span>
                  </div>

                  <div style="display: flex; align-items: center; gap: 8px;">
                    <div class="stage-icon-wrap">
                      ${stage.icon}
                    </div>
                    <span class="stage-title">${stage.name}</span>
                  </div>

                  <div class="stage-body">
                    <p class="stage-desc">${stage.shortDesc}</p>
                    <div class="stage-progress-bar">
                      <div class="stage-progress-fill" style="width: ${stage.progress}%;"></div>
                    </div>
                  </div>
                </div>
              `
            })
            .join('')}
        </div>
      </section>
    `

    // Add click listeners to open workspace modal
    const cards = this.container.querySelectorAll<HTMLElement>('.stage-node-card')
    cards.forEach((card) => {
      card.addEventListener('click', () => {
        const stageId = card.getAttribute('data-stage-id')
        const stage = this.stages.find((s) => s.id === stageId)
        if (stage) {
          this.onSelectStage(stage)
        }
      })
    })
  }
}
