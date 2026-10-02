import type { StageInfo } from '../types'

export class StageModal {
  private overlay: HTMLElement
  private onOpenRoiWorkspace?: () => void
  private onOpenCorrespondenceWorkspace?: () => void
  private onOpenSpatialWorkspace?: () => void
  private onOpenAlignmentStudio?: () => void
  private onOpenTransformationAnalysis?: () => void
  private onOpenExportWorkspace?: () => void

  constructor(
    onOpenRoiWorkspace?: () => void,
    onOpenCorrespondenceWorkspace?: () => void,
    onOpenSpatialWorkspace?: () => void,
    onOpenAlignmentStudio?: () => void,
    onOpenTransformationAnalysis?: () => void,
    onOpenExportWorkspace?: () => void
  ) {
    this.onOpenRoiWorkspace = onOpenRoiWorkspace
    this.onOpenCorrespondenceWorkspace = onOpenCorrespondenceWorkspace
    this.onOpenSpatialWorkspace = onOpenSpatialWorkspace
    this.onOpenAlignmentStudio = onOpenAlignmentStudio
    this.onOpenTransformationAnalysis = onOpenTransformationAnalysis
    this.onOpenExportWorkspace = onOpenExportWorkspace
    this.overlay = document.createElement('div')
    this.overlay.className = 'modal-overlay'
    this.overlay.setAttribute('role', 'dialog')
    this.overlay.setAttribute('aria-modal', 'true')
    this.overlay.setAttribute('aria-labelledby', 'stage-modal-title')
    document.body.appendChild(this.overlay)

    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) {
        this.close()
      }
    })

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.overlay.classList.contains('open')) {
        this.close()
      }
    })
  }

  public open(stage: StageInfo) {
    this.overlay.innerHTML = `
      <div class="stage-modal-box glass-panel corner-reticle">
        <div class="modal-header">
          <h3 id="stage-modal-title">
            <div class="stage-icon-wrap" style="width:28px; height:28px;" aria-hidden="true">
              ${stage.icon}
            </div>
            Stage 0${stage.stepNumber}: ${stage.name} Workspace
          </h3>
          <button id="modal-close-btn" class="btn-close-modal" aria-label="Close Workspace Details Dialog" title="Close Workspace (Esc)">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div class="modal-content">
          <!-- Scientific Overview -->
          <div>
            <div class="modal-section-title">Scientific Methodology & Overview</div>
            <p style="font-size: 13px; color: var(--text-primary); line-height: 1.6;">
              ${stage.fullDesc}
            </p>
          </div>

          <!-- Algorithm Specifications -->
          <div>
            <div class="modal-section-title">Core Mathematical / Computational Algorithm</div>
            <div style="background: rgba(5, 11, 26, 0.8); border: 1px solid var(--border-card); border-radius: 8px; padding: 12px 16px; font-family: var(--font-mono); font-size: 12px; color: var(--cyan-bright);">
              ${stage.algorithm}
            </div>
          </div>

          <!-- Parameter Configuration Grid -->
          <div>
            <div class="modal-section-title">Standard Execution Parameters</div>
            <div class="modal-param-grid">
              ${this.getParamsForStage(stage.id).map(p => `
                <div class="param-box">
                  <div class="name">${p.name}</div>
                  <div class="val">${p.val}</div>
                </div>
              `).join('')}
            </div>
          </div>

          <!-- Inputs & Outputs -->
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
            <div>
              <div class="modal-section-title">Inputs</div>
              <ul style="list-style: none; display: flex; flex-direction: column; gap: 6px; font-size: 12px; color: var(--text-secondary);">
                ${stage.inputs.map(i => `<li style="display:flex; align-items:center; gap:6px;"><span style="color:var(--cyan-bright);">▸</span> ${i}</li>`).join('')}
              </ul>
            </div>
            <div>
              <div class="modal-section-title">Outputs</div>
              <ul style="list-style: none; display: flex; flex-direction: column; gap: 6px; font-size: 12px; color: var(--text-secondary);">
                ${stage.outputs.map(o => `<li style="display:flex; align-items:center; gap:6px;"><span style="color:var(--emerald-status);">▸</span> ${o}</li>`).join('')}
              </ul>
            </div>
          </div>

          ${stage.telemetryNote ? `
            <div style="background: rgba(245, 158, 11, 0.1); border: 1px solid var(--isro-gold); border-radius: 6px; padding: 10px 14px; font-family: var(--font-mono); font-size: 11px; color: #fef08a;">
              <strong>Active Telemetry:</strong> ${stage.telemetryNote}
            </div>
          ` : ''}

          ${stage.id === 'roi' ? `
            <div style="margin-top: 14px; padding-top: 14px; border-top: 1px solid var(--border-card); display: flex; justify-content: flex-end;">
              <button id="btn-modal-open-roi" class="btn-toast-action" style="padding: 8px 16px; font-size: 12px; display:flex; align-items:center; gap:8px;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="22" y1="12" x2="18" y2="12"/>
                  <line x1="6" y1="12" x2="2" y2="12"/>
                  <line x1="12" y1="6" x2="12" y2="2"/>
                  <line x1="12" y1="22" x2="12" y2="18"/>
                </svg>
                Launch Scientific ROI Explorer &rarr;
              </button>
            </div>
          ` : ''}

          ${stage.id === 'feature_matching' ? `
            <div style="margin-top: 14px; padding-top: 14px; border-top: 1px solid var(--border-card); display: flex; justify-content: flex-end;">
              <button id="btn-modal-open-matching" class="btn-toast-action" style="padding: 8px 16px; font-size: 12px; display:flex; align-items:center; gap:8px; background:var(--emerald-status); color:#020612;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="6" cy="12" r="3"/>
                  <circle cx="18" cy="12" r="3"/>
                  <line x1="9" y1="12" x2="15" y2="12"/>
                </svg>
                Launch Feature Correspondence Workspace &rarr;
              </button>
            </div>
          ` : ''}

          ${stage.id === 'spatial_analysis' ? `
            <div style="margin-top: 14px; padding-top: 14px; border-top: 1px solid var(--border-card); display: flex; justify-content: flex-end;">
              <button id="btn-modal-open-spatial" class="btn-toast-action" style="padding: 8px 16px; font-size: 12px; display:flex; align-items:center; gap:8px; background:var(--cyan-bright); color:#020612;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="3" y="3" width="18" height="18" rx="2"/>
                  <path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>
                </svg>
                Launch Spatial Grid & Density Workspace &rarr;
              </button>
            </div>
          ` : ''}

          ${stage.id === 'alignment' || stage.id === 'transformation' ? `
            <div style="margin-top: 14px; padding-top: 14px; border-top: 1px solid var(--border-card); display: flex; justify-content: flex-end; gap: 10px; flex-wrap: wrap;">
              <button id="btn-modal-open-alignment" class="btn-toast-action" style="padding: 8px 18px; font-size: 12px; display:flex; align-items:center; gap:8px; background:linear-gradient(135deg, #10b981 0%, #059669 100%); color:#020612; font-weight:700; box-shadow:0 0 12px rgba(16, 185, 129, 0.4);">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4"/>
                </svg>
                Launch Alignment Studio &rarr;
              </button>

              <button id="btn-modal-open-transformation" class="btn-toast-action" style="padding: 8px 18px; font-size: 12px; display:flex; align-items:center; gap:8px; background:linear-gradient(135deg, #a855f7 0%, #7e22ce 100%); color:#fff; font-weight:700; box-shadow:0 0 12px rgba(168, 85, 247, 0.4);">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="3" y="3" width="18" height="18" rx="2"/>
                  <path d="M7 8h10M7 12h10M7 16h10"/>
                </svg>
                Transformation Analysis &amp; Residuals (Stage 07) &rarr;
              </button>
            </div>
          ` : ''}

          ${stage.id === 'export' ? `
            <div style="margin-top: 14px; padding-top: 14px; border-top: 1px solid var(--border-card); display: flex; justify-content: flex-end;">
              <button id="btn-modal-open-export" class="btn-toast-action" style="padding: 8px 18px; font-size: 12px; display:flex; align-items:center; gap:8px; background:linear-gradient(135deg, #0284c7 0%, #0369a1 100%); color:#fff; font-weight:700; box-shadow:0 0 12px rgba(56, 189, 248, 0.4);">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="7 10 12 15 17 10"/>
                  <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                Launch Export &amp; Artifacts Workspace (Stage 08) &rarr;
              </button>
            </div>
          ` : ''}
        </div>
      </div>
    `

    this.overlay.classList.add('open')

    const closeBtn = this.overlay.querySelector('#modal-close-btn')
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.close())
    }

    const openRoiBtn = this.overlay.querySelector('#btn-modal-open-roi')
    if (openRoiBtn && this.onOpenRoiWorkspace) {
      openRoiBtn.addEventListener('click', () => {
        this.close()
        this.onOpenRoiWorkspace!()
      })
    }

    const openMatchingBtn = this.overlay.querySelector('#btn-modal-open-matching')
    if (openMatchingBtn && this.onOpenCorrespondenceWorkspace) {
      openMatchingBtn.addEventListener('click', () => {
        this.close()
        this.onOpenCorrespondenceWorkspace!()
      })
    }

    const openSpatialBtn = this.overlay.querySelector('#btn-modal-open-spatial')
    if (openSpatialBtn && this.onOpenSpatialWorkspace) {
      openSpatialBtn.addEventListener('click', () => {
        this.close()
        this.onOpenSpatialWorkspace!()
      })
    }

    const openAlignBtn = this.overlay.querySelector('#btn-modal-open-alignment')
    if (openAlignBtn && this.onOpenAlignmentStudio) {
      openAlignBtn.addEventListener('click', () => {
        this.close()
        this.onOpenAlignmentStudio!()
      })
    }

    const openTransBtn = this.overlay.querySelector('#btn-modal-open-transformation')
    if (openTransBtn && this.onOpenTransformationAnalysis) {
      openTransBtn.addEventListener('click', () => {
        this.close()
        this.onOpenTransformationAnalysis!()
      })
    }

    const openExportBtn = this.overlay.querySelector('#btn-modal-open-export')
    if (openExportBtn && this.onOpenExportWorkspace) {
      openExportBtn.addEventListener('click', () => {
        this.close()
        this.onOpenExportWorkspace!()
      })
    }
  }

  public close() {
    this.overlay.classList.remove('open')
  }

  private getParamsForStage(id: string): { name: string; val: string }[] {
    switch (id) {
      case 'dataset':
        return [
          { name: 'Archive Format', val: 'ISRO TMC PDS3 Standard (.img + .lbl)' },
          { name: 'Reference Source', val: 'LRO WAC Global Morphologic Basemap' },
          { name: 'Radiometric Calibration', val: 'ISSDC Level-2 (DN to Reflectance)' },
          { name: 'Decompression Engine', val: 'Streaming Tar Extractor (backend.processing)' },
        ]
      case 'roi':
        return [
          { name: 'Source Bounding Box', val: 'Row: 0–6000 px | Col: 0–4000 px' },
          { name: 'Reference Search Box', val: 'Row: 35000–41000 px | Col: 60000–64000 px' },
          { name: 'Sub-scene Resolution', val: '5.0 meters / pixel' },
          { name: 'Spatial Area', val: '20 km × 30 km Lunar Surface' },
        ]
      case 'preprocessing':
        return [
          { name: 'Dynamic Range Scaling', val: '1st – 99th Percentile Normalization' },
          { name: 'CLAHE Clip Limit', val: '2.0 (Local Contrast Enhancement)' },
          { name: 'CLAHE Tile Grid Size', val: '8 × 8 Pixel Blocks' },
          { name: 'Bit-Depth Conversion', val: '16-bit Float → 8-bit Unsigned' },
        ]
      case 'feature_matching':
        return [
          { name: 'Max Keypoint Pool', val: '15,000 SIFT Keypoints' },
          { name: 'Scale-Space Octaves', val: '3 Octave Layers (DoG Extrema)' },
          { name: 'FLANN Matcher Type', val: 'KD-Tree Indexing (Trees=5, Checks=50)' },
          { name: 'Lowe\'s Ratio Threshold', val: '0.75 (Distance Second-Best)' },
        ]
      case 'spatial_analysis':
        return [
          { name: 'Grid Binning Size', val: '8 × 8 Spatial Cells (64 Sub-regions)' },
          { name: 'Max Features Per Cell', val: '25 Match Points / Cell' },
          { name: 'Density Equalization', val: 'Uniform Geographic Distribution' },
          { name: 'Minimum Cell Occupancy', val: '75% Active Grid Cells' },
        ]
      case 'alignment':
        return [
          { name: 'Estimator Model', val: 'Projective Homography (8-DOF Matrix H)' },
          { name: 'RANSAC Inlier Threshold', val: '3.0 Pixels Reprojection Distance' },
          { name: 'RANSAC Max Iterations', val: '3,000 Iterations (Confidence 99.9%)' },
          { name: 'Sub-Pixel Refinement', val: 'Lucas-Kanade Bidirectional Flow (Win: 15×15)' },
        ]
      case 'transformation':
        return [
          { name: 'Resampling Kernel', val: 'Bicubic Interpolation (cv2.INTER_CUBIC)' },
          { name: 'Coordinate Projection', val: 'Orthographic Lunar Reference Frame' },
          { name: 'Target Canvas Dimensions', val: 'Matching LRO Reference ROI' },
          { name: 'Edge Boundary Handling', val: 'Zero-Fill Border Replication' },
        ]
      case 'export':
        return [
          { name: 'Raster Output Format', val: 'GeoTIFF (.tif) with Coordinate Metadata' },
          { name: 'Verification Overlays', val: '50/50 Blended Overlay & Checkerboard 8×8' },
          { name: 'Tie-Points Export', val: 'CSV Inlier Coordinates (src_x, src_y, ref_x, ref_y)' },
          { name: 'Quality Metrics File', val: 'registration_metrics.json' },
        ]
      default:
        return []
    }
  }
}
