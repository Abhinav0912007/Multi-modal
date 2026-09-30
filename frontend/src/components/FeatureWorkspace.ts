/**
 * Component: FeatureWorkspace
 * Scientific Feature Correspondence & SIFT/FLANN Matching Workspace
 * Synchronized dual-viewport, inlier/outlier visualization, telemetry panel, and mission state machine.
 */

import { fetchFeatureMatching, type FeatureMatchResult, type FeatureMatchParams, API_BASE } from '../api'

export type FeatureFilter = 'all' | 'inliers' | 'outliers'
export type WorkspaceState = 'idle' | 'processing' | 'completed' | 'insufficient' | 'failed'

export class FeatureWorkspace {
  private container: HTMLElement
  private pairId: string
  private result: FeatureMatchResult | null = null
  private currentState: WorkspaceState = 'idle'
  private errorMessage: string = ''
  private currentFilter: FeatureFilter = 'all'
  private showKeypoints: boolean = true
  private showMatchLines: boolean = true
  private syncNav: boolean = true

  // Viewport transforms (shared when syncNav is active)
  private zoom: number = 1.0
  private panX: number = 20
  private panY: number = 20
  private isDragging: boolean = false
  private dragStartX: number = 0
  private dragStartY: number = 0
  private hoveredMatchId: number | null = null

  // HTML Image elements for rendering
  private srcImgEl: HTMLImageElement | null = null
  private refImgEl: HTMLImageElement | null = null

  // DOM elements
  private rootEl!: HTMLDivElement
  private srcCanvas!: HTMLCanvasElement
  private refCanvas!: HTMLCanvasElement
  private overlayCanvas!: HTMLCanvasElement
  private srcPane!: HTMLDivElement
  private refPane!: HTMLDivElement
  private missionOverlayEl!: HTMLDivElement
  private tooltipEl!: HTMLDivElement

  // Processing stage interval
  private processingTimer: any = null
  private processingStageIdx: number = 0
  private readonly processingStages = [
    { title: 'FEATURE EXTRACTION', desc: 'Constructing Gaussian scale-space octaves & computing 128-D SIFT descriptors...' },
    { title: 'CORRESPONDENCE SEARCH', desc: 'Querying FLANN KD-Tree index & applying Lowe\'s Euclidean distance ratio filter...' },
    { title: 'GEOMETRIC VERIFICATION', desc: 'Iterating RANSAC sample consensus to reject planar outliers & estimate Homography...' }
  ]

  constructor(container: HTMLElement, initialPairId: string = 'pair_001') {
    this.container = container
    this.pairId = initialPairId
    this.render()
    this.setupListeners()
  }

  public setActivePair(pairId: string) {
    if (this.pairId !== pairId) {
      this.pairId = pairId
      const pairLabel = this.rootEl.querySelector('#ws-pair-badge')
      if (pairLabel) pairLabel.textContent = `TARGET: ${pairId.toUpperCase()}`

      const srcChip = this.rootEl.querySelector('#src-hud-chip')
      const srcFileEl = this.rootEl.querySelector('#src-file-readout')
      const refFileEl = this.rootEl.querySelector('#ref-file-readout')

      const inst = pairId === 'pair_001' ? 'OHRC' : pairId === 'pair_002' ? 'IIRS' : 'TMC'
      const mission = pairId === 'pair_003' ? 'Chandrayaan-1' : 'Chandrayaan-2'
      if (srcChip) srcChip.textContent = `SOURCE RASTER (${mission.toUpperCase()} ${inst})`
      if (srcFileEl) {
        srcFileEl.textContent = pairId === 'pair_001'
          ? 'ch2_ohr_ncp_20240316T2008014680_d_img_d18.img'
          : pairId === 'pair_002'
          ? 'ch2_iir_nci_20210115T0628272014_d_img_d32.qub'
          : 'ch1_tmc_nca_20090529T0853239926_d_img_d18.img'
      }
      if (refFileEl) refFileEl.textContent = 'M1536201804CC.IMG'

      // Automatically run matching for the newly selected pair
      this.runMatching()
    }
  }

  private render() {
    this.rootEl = document.createElement('div')
    this.rootEl.className = 'feature-workspace-root'

    this.rootEl.innerHTML = `
      <!-- TOP CONTROL & TELEMETRY HEADER -->
      <header class="ws-header-bar glass-panel">
        <div class="ws-header-left">
          <div class="ws-title-group">
            <span class="badge-chip">STAGE 03 • CV WORKSPACE</span>
            <span id="ws-pair-badge" class="ws-pair-tag">TARGET: ${this.pairId.toUpperCase()}</span>
          </div>
          <h2 class="ws-heading">SIFT Feature Correspondence & Geometric Verification</h2>
        </div>

        <div class="ws-header-center">
          <!-- Filter toggles -->
          <div class="ws-filter-segmented">
            <button id="btn-filter-all" class="ws-seg-btn active" data-filter="all">All Matches</button>
            <button id="btn-filter-inliers" class="ws-seg-btn" data-filter="inliers">Inliers Only</button>
            <button id="btn-filter-outliers" class="ws-seg-btn" data-filter="outliers">Outliers Only</button>
          </div>

          <!-- Feature & Line visibility -->
          <div class="ws-view-toggles">
            <button id="btn-toggle-kps" class="hud-btn active" title="Toggle Keypoint Markers">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>
              Keypoints
            </button>
            <button id="btn-toggle-lines" class="hud-btn active" title="Toggle Correspondence Lines">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/><circle cx="5" cy="12" r="3"/><circle cx="19" cy="12" r="3"/></svg>
              Match Lines
            </button>
            <button id="btn-toggle-sync" class="hud-btn active" title="Lock Synchronized Pan & Zoom across viewports">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              Sync Pan/Zoom
            </button>
          </div>
        </div>

        <div class="ws-header-right">
          <!-- Zoom readout and reset -->
          <div class="ws-zoom-controls">
            <button id="btn-zoom-out" class="icon-btn" title="Zoom Out">−</button>
            <span id="ws-zoom-readout" class="ws-zoom-badge">100%</span>
            <button id="btn-zoom-in" class="icon-btn" title="Zoom In">+</button>
            <button id="btn-zoom-reset" class="icon-btn" title="Fit to Screen">⟲</button>
          </div>

          <!-- Export PDF Report Action Button -->
          <button id="btn-export-pdf" class="hud-btn active" style="color:var(--cyan-bright); border-color:rgba(56,189,248,0.4); background:rgba(56,189,248,0.12); font-weight:600; gap:6px;" title="Generate and Download Official PDF Registration Report">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
              <polyline points="10 9 9 9 8 9"/>
            </svg>
            Export PDF Report
          </button>

          <!-- Primary Action Button -->
          <button id="btn-run-matching" class="btn-primary glow-btn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            Run Feature Matching
          </button>
        </div>
      </header>

      <!-- MAIN WORKSPACE SPLIT VIEW -->
      <div class="ws-viewport-layout">
        <div class="ws-dual-pane-container glass-panel corner-reticle" id="ws-dual-container">
          <!-- FLOATING CORRESPONDENCE HUD LEGEND -->
          <div class="ws-legend-hud" id="ws-legend-hud">
            <div class="ws-legend-header">
              <span class="ws-legend-title">CORRESPONDENCE RETICLE</span>
              <span class="badge-chip" id="ws-legend-filter-badge" style="font-size:9px; padding:1px 5px;">ALL</span>
            </div>
            <div class="ws-legend-item">
              <span class="legend-arrow-symbol inlier-arrow">➔</span>
              <span class="legend-text"><b>INLIER MATCH</b> (Consensus)</span>
              <span class="legend-count inlier-count-badge" id="legend-inlier-count">—</span>
            </div>
            <div class="ws-legend-item">
              <span class="legend-arrow-symbol outlier-arrow">⇢</span>
              <span class="legend-text"><b>OUTLIER MATCH</b> (Rejected)</span>
              <span class="legend-count outlier-count-badge" id="legend-outlier-count">—</span>
            </div>
            <div class="ws-legend-item">
              <span class="legend-target-symbol">◎</span>
              <span class="legend-text">Reference Landing Node</span>
            </div>
          </div>

          <!-- LEFT PANE: SOURCE IMAGE -->
          <div class="ws-image-pane" id="ws-src-pane">
            <div class="ws-pane-hud-label">
              <div class="ws-hud-chip source-chip" id="src-hud-chip">SOURCE RASTER (CHANDRAYAAN-2 OHRC)</div>
              <div id="src-dim-readout" class="ws-hud-dims">DIM: — × — px</div>
            </div>
            <div id="src-file-readout" style="position:absolute; top:36px; left:12px; font-family:var(--font-mono); font-size:10px; color:var(--text-muted); background:rgba(5,11,26,0.85); padding:2px 6px; border-radius:4px; border:1px solid var(--border-subtle); z-index:5; pointer-events:none; max-width:280px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;"></div>
            <canvas id="ws-src-canvas" class="ws-sub-canvas"></canvas>
          </div>

          <!-- RIGHT PANE: REFERENCE IMAGE -->
          <div class="ws-image-pane" id="ws-ref-pane">
            <div class="ws-pane-hud-label">
              <div class="ws-hud-chip ref-chip" id="ref-hud-chip">REFERENCE RASTER (LROC NAC)</div>
              <div id="ref-dim-readout" class="ws-hud-dims">DIM: — × — px</div>
            </div>
            <div id="ref-file-readout" style="position:absolute; top:36px; left:12px; font-family:var(--font-mono); font-size:10px; color:var(--text-muted); background:rgba(5,11,26,0.85); padding:2px 6px; border-radius:4px; border:1px solid var(--border-subtle); z-index:5; pointer-events:none; max-width:280px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;"></div>
            <div id="ref-overlap-badge" style="position:absolute; bottom:12px; left:12px; font-family:var(--font-mono); font-size:10px; color:#f59e0b; background:rgba(5,11,26,0.85); padding:2px 6px; border-radius:4px; border:1px solid rgba(245,158,11,0.4); z-index:5; pointer-events:none;">Reference geographic overlap: NOT YET VERIFIED</div>
            <canvas id="ws-ref-canvas" class="ws-sub-canvas"></canvas>
          </div>

          <!-- SPANNING MATCH LINE OVERLAY CANVAS -->
          <canvas id="ws-overlay-canvas" class="ws-overlay-layer"></canvas>

          <!-- INTERACTIVE HOVER TOOLTIP -->
          <div id="ws-hover-tooltip" class="ws-hover-tooltip" style="display:none;"></div>

          <!-- RESTRAINED SCIENTIFIC PROCESSING STATE OVERLAY -->
          <div id="ws-mission-overlay" class="ws-mission-overlay" style="display:none;">
            <div class="mission-telemetry-modal glass-panel">
              <div class="radar-scan-anim">
                <div class="radar-circle"></div>
                <div class="radar-sweep"></div>
                <div class="radar-reticle"></div>
              </div>
              <div class="mission-status-body">
                <div class="mission-stage-badge">MISSION STAGE IN PROGRESS</div>
                <h3 id="mission-stage-title" class="mission-stage-title">FEATURE EXTRACTION</h3>
                <p id="mission-stage-desc" class="mission-stage-desc">Constructing Gaussian scale-space octaves & computing 128-D SIFT descriptors...</p>
                
                <div class="mission-progress-bar-wrap">
                  <div id="mission-progress-bar" class="mission-progress-bar"></div>
                </div>

                <div class="mission-steps-indicators">
                  <div class="step-dot active" id="dot-step-1">
                    <span class="dot-num">01</span>
                    <span class="dot-txt">SIFT DETECTION</span>
                  </div>
                  <div class="step-connector"></div>
                  <div class="step-dot" id="dot-step-2">
                    <span class="dot-num">02</span>
                    <span class="dot-txt">FLANN MATCHING</span>
                  </div>
                  <div class="step-connector"></div>
                  <div class="step-dot" id="dot-step-3">
                    <span class="dot-num">03</span>
                    <span class="dot-txt">RANSAC VERIFICATION</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- STATE: INSUFFICIENT MATCHES / FAILED OVERLAY BANNER -->
          <div id="ws-state-banner" class="ws-state-banner" style="display:none;">
            <div class="state-banner-card glass-panel">
              <div class="state-icon-box" id="state-banner-icon">⚠</div>
              <div class="state-text-box">
                <h4 id="state-banner-title">INSUFFICIENT MATCHES DETECTED</h4>
                <p id="state-banner-msg">Fewer than 4 correspondences passed Lowe's ratio test. Try widening the ROI window or lowering contrast threshold.</p>
              </div>
              <button id="state-banner-retry" class="hud-btn active">Retry Search</button>
            </div>
          </div>
        </div>

        <!-- RIGHT SIDE: COMPREHENSIVE SCIENTIFIC STATISTICS PANEL -->
        <aside class="ws-statistics-sidebar glass-panel" id="ws-stats-panel">
          <div class="stats-panel-header">
            <span class="badge-chip" style="font-size:10px;">TELEMETRY</span>
            <h3>Registration Metrics</h3>
          </div>

          <!-- Scientific Validity State Banner / Card -->
          <div class="stat-kpi-card highlight-amber" id="card-validation-state" style="margin-bottom: 10px; border-left: 3px solid #f59e0b;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span class="stat-kpi-label">VALIDATION STATUS</span>
              <span id="badge-validity-state" style="font-family:var(--font-mono); font-weight:700; font-size:11px; padding:2px 8px; border-radius:4px; background:rgba(245,158,11,0.2); color:#f59e0b;">PENDING</span>
            </div>
            <div id="stat-validity-reason" style="font-family:var(--font-mono); font-size:11px; color:var(--text-muted); margin-top:6px; line-height:1.35;">
              Awaiting feature correspondence verification.
            </div>
          </div>

          <div class="stats-kpi-grid">
            <div class="stat-kpi-card">
              <span class="stat-kpi-label">Features Detected</span>
              <div class="stat-kpi-val" id="stat-features-detected">—</div>
              <span class="stat-kpi-sub" id="stat-features-breakdown">Src: — | Ref: —</span>
            </div>

            <div class="stat-kpi-card">
              <span class="stat-kpi-label">Candidate Matches</span>
              <div class="stat-kpi-val" id="stat-candidates">—</div>
              <span class="stat-kpi-sub">FLANN Nearest-Neighbor</span>
            </div>

            <div class="stat-kpi-card">
              <span class="stat-kpi-label">Verified Matches</span>
              <div class="stat-kpi-val" id="stat-verified">—</div>
              <span class="stat-kpi-sub">Lowe's Ratio ≤ 0.75</span>
            </div>

            <div class="stat-kpi-card highlight-green">
              <span class="stat-kpi-label">Inliers (Consensus)</span>
              <div class="stat-kpi-val green" id="stat-inliers">—</div>
              <span class="stat-kpi-sub" id="stat-inlier-ratio">Ratio: —%</span>
            </div>

            <div class="stat-kpi-card highlight-red">
              <span class="stat-kpi-label">Outliers (Rejected)</span>
              <div class="stat-kpi-val red" id="stat-outliers">—</div>
              <span class="stat-kpi-sub">RANSAC Outlier Rejection</span>
            </div>

            <div class="stat-kpi-card highlight-cyan">
              <span class="stat-kpi-label">Alignment Error (RMSE)</span>
              <div class="stat-kpi-val cyan" id="stat-rmse" style="font-size:13px; font-family:var(--font-mono);">—</div>
              <span class="stat-kpi-sub" id="stat-mean-error">Mean Reproj: — px</span>
            </div>
          </div>
          <div id="stat-rmse-note" style="margin-top:6px; padding:6px 8px; background:rgba(245,158,11,0.1); border:1px solid rgba(245,158,11,0.3); border-radius:4px; font-size:10px; font-family:var(--font-mono); color:#fde68a; line-height:1.35; display:none;">
            RMSE is not statistically meaningful because the homography was fitted with only the minimum number of correspondences.
          </div>

          <!-- Model & Transformation Telemetry -->
          <div class="stats-model-telemetry">
            <div class="model-row">
              <span class="k">Geometric Model:</span>
              <span class="v">Planar Homography (3×3)</span>
            </div>
            <div class="model-row">
              <span class="k">Search Algorithm:</span>
              <span class="v">SIFT 128-D + FLANN KD-Tree</span>
            </div>
            <div class="model-row">
              <span class="k">Spatial Grid Coverage:</span>
              <span class="v" style="color:var(--cyan-bright);">8 × 8 Grid (Binned)</span>
            </div>
            <div class="model-row">
              <span class="k">Compute Engine:</span>
              <span class="v" id="stat-engine-badge">FastAPI Python Scientific Service</span>
            </div>
          </div>

          <!-- Active Correspondence Inspector -->
          <div class="hover-match-detail-card" id="hover-detail-box">
            <div class="hover-card-title">Active Feature Reticle</div>
            <div class="hover-data-row">
              <span>Status:</span>
              <span id="hover-status" style="font-weight:600; color:var(--text-muted);">Hover a match line</span>
            </div>
            <div class="hover-data-row">
              <span>Source Coord (X, Y):</span>
              <span id="hover-src-coord">—, —</span>
            </div>
            <div class="hover-data-row">
              <span>Reference Coord (X, Y):</span>
              <span id="hover-ref-coord">—, —</span>
            </div>
            <div class="hover-data-row">
              <span>Euclidean Distance:</span>
              <span id="hover-dist">—</span>
            </div>
            <div class="hover-data-row">
              <span>Reprojection Error:</span>
              <span id="hover-err">—</span>
            </div>
          </div>

          <!-- Scientific PDF Report Export Card -->
          <div class="pdf-export-card glass-panel" style="margin-top:4px; padding:12px; border-radius:8px; border:1px solid rgba(56,189,248,0.3); background:rgba(6,16,38,0.75);">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
              <span style="font-size:11px; font-weight:700; color:var(--cyan-bright); font-family:var(--font-mono); letter-spacing:0.04em;">MISSION REPORT EXPORT</span>
              <span style="font-size:9px; font-family:var(--font-mono); background:rgba(239,68,68,0.15); color:#f87171; border:1px solid rgba(239,68,68,0.3); padding:1px 5px; border-radius:3px; font-weight:600;">PDF v2.0</span>
            </div>
            <p style="font-size:11px; color:var(--text-muted); line-height:1.4; margin-bottom:10px;">
              Generate and download formal ISRO/NASA STR registration report with mathematical matrix, feature counts, and certification status.
            </p>
            <button id="btn-sidebar-export-pdf" class="btn-primary glow-btn" style="width:100%; display:flex; justify-content:center; align-items:center; gap:8px; font-size:11px; padding:8px 12px; font-weight:600; cursor:pointer;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              Download Scientific PDF
            </button>
            <div id="pdf-download-toast" style="display:none; margin-top:8px; font-size:10px; font-family:var(--font-mono); color:var(--emerald-status); text-align:center;">
              &check; Scientific PDF Report Downloaded
            </div>
          </div>
        </aside>
      </div>
    `

    this.container.appendChild(this.rootEl)

    // Cache elements
    this.srcCanvas = this.rootEl.querySelector('#ws-src-canvas')!
    this.refCanvas = this.rootEl.querySelector('#ws-ref-canvas')!
    this.overlayCanvas = this.rootEl.querySelector('#ws-overlay-canvas')!
    this.srcPane = this.rootEl.querySelector('#ws-src-pane')!
    this.refPane = this.rootEl.querySelector('#ws-ref-pane')!
    this.missionOverlayEl = this.rootEl.querySelector('#ws-mission-overlay')!
    this.tooltipEl = this.rootEl.querySelector('#ws-hover-tooltip')!

    this.fitCanvasSizes()
  }

  private fitCanvasSizes() {
    const paneRect = this.srcPane.getBoundingClientRect()
    const w = Math.floor(paneRect.width) || 450
    const h = Math.floor(paneRect.height) || 520

    this.srcCanvas.width = w
    this.srcCanvas.height = h
    this.refCanvas.width = w
    this.refCanvas.height = h

    const dualContainer = this.rootEl.querySelector('#ws-dual-container')!
    const dualRect = dualContainer.getBoundingClientRect()
    this.overlayCanvas.width = Math.floor(dualRect.width) || (w * 2 + 10)
    this.overlayCanvas.height = Math.floor(dualRect.height) || h

    this.drawAll()
  }

  private setupListeners() {
    window.addEventListener('resize', () => {
      this.fitCanvasSizes()
    })

    // Filter Buttons
    const filterBtns = this.rootEl.querySelectorAll<HTMLButtonElement>('.ws-seg-btn')
    filterBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        filterBtns.forEach(b => b.classList.remove('active'))
        btn.classList.add('active')
        this.currentFilter = (btn.dataset.filter as FeatureFilter) || 'all'
        const filterBadge = this.rootEl.querySelector('#ws-legend-filter-badge')
        if (filterBadge) filterBadge.textContent = this.currentFilter.toUpperCase()
        this.drawAll()
      })
    })

    // Toggle Keypoints
    const btnKps = this.rootEl.querySelector('#btn-toggle-kps')!
    btnKps.addEventListener('click', () => {
      this.showKeypoints = !this.showKeypoints
      btnKps.classList.toggle('active', this.showKeypoints)
      this.drawAll()
    })

    // Toggle Match Lines
    const btnLines = this.rootEl.querySelector('#btn-toggle-lines')!
    btnLines.addEventListener('click', () => {
      this.showMatchLines = !this.showMatchLines
      btnLines.classList.toggle('active', this.showMatchLines)
      this.drawAll()
    })

    // Toggle Sync
    const btnSync = this.rootEl.querySelector('#btn-toggle-sync')!
    btnSync.addEventListener('click', () => {
      this.syncNav = !this.syncNav
      btnSync.classList.toggle('active', this.syncNav)
    })

    // Zoom Buttons
    const btnZoomIn = this.rootEl.querySelector('#btn-zoom-in')!
    const btnZoomOut = this.rootEl.querySelector('#btn-zoom-out')!
    const btnZoomReset = this.rootEl.querySelector('#btn-zoom-reset')!

    btnZoomIn.addEventListener('click', () => {
      this.setZoom(this.zoom * 1.25)
    })
    btnZoomOut.addEventListener('click', () => {
      this.setZoom(this.zoom / 1.25)
    })
    btnZoomReset.addEventListener('click', () => {
      this.resetView()
    })

    // Run Matching Action
    const btnRun = this.rootEl.querySelector('#btn-run-matching')!
    btnRun.addEventListener('click', () => {
      this.runMatching()
    })

    // State banner retry
    const btnRetry = this.rootEl.querySelector('#state-banner-retry')!
    btnRetry.addEventListener('click', () => {
      this.runMatching()
    })

    // PDF Export Buttons (Header and Sidebar)
    const btnPdf = this.rootEl.querySelector('#btn-export-pdf')
    if (btnPdf) {
      btnPdf.addEventListener('click', () => {
        this.generatePdfReport()
      })
    }

    const btnSidebarPdf = this.rootEl.querySelector('#btn-sidebar-export-pdf')
    if (btnSidebarPdf) {
      btnSidebarPdf.addEventListener('click', () => {
        this.generatePdfReport()
      })
    }

    // Pan & Zoom on the viewports
    const dualContainer = this.rootEl.querySelector('#ws-dual-container') as HTMLDivElement

    dualContainer.addEventListener('wheel', (e: WheelEvent) => {
      e.preventDefault()
      const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87
      const rect = dualContainer.getBoundingClientRect()
      const mouseX = e.clientX - rect.left
      const mouseY = e.clientY - rect.top

      const newZoom = Math.min(Math.max(this.zoom * zoomFactor, 0.2), 10.0)
      this.panX = mouseX - (mouseX - this.panX) * (newZoom / this.zoom)
      this.panY = mouseY - (mouseY - this.panY) * (newZoom / this.zoom)
      this.zoom = newZoom
      this.updateZoomReadout()
      this.drawAll()
    }, { passive: false })

    dualContainer.addEventListener('mousedown', (e: MouseEvent) => {
      if (e.button !== 0) return
      this.isDragging = true
      this.dragStartX = e.clientX - this.panX
      this.dragStartY = e.clientY - this.panY
      dualContainer.style.cursor = 'grabbing'
    })

    window.addEventListener('mousemove', (e: MouseEvent) => {
      if (this.isDragging) {
        this.panX = e.clientX - this.dragStartX
        this.panY = e.clientY - this.dragStartY
        this.drawAll()
      } else {
        this.handleHover(e)
      }
    })

    window.addEventListener('mouseup', () => {
      if (this.isDragging) {
        this.isDragging = false
        dualContainer.style.cursor = 'crosshair'
      }
    })
  }

  private setZoom(newZoom: number) {
    this.zoom = Math.min(Math.max(newZoom, 0.2), 10.0)
    this.updateZoomReadout()
    this.drawAll()
  }

  private resetView() {
    this.zoom = 1.0
    this.panX = 20
    this.panY = 20
    this.updateZoomReadout()
    this.drawAll()
  }

  private updateZoomReadout() {
    const el = this.rootEl.querySelector('#ws-zoom-readout')
    if (el) el.textContent = `${Math.round(this.zoom * 100)}%`
  }

  public async runMatching() {
    if (this.currentState === 'processing') return
    this.startProcessingAnimation()

    try {
      const params: FeatureMatchParams = {
        pair_id: this.pairId,
        nfeatures: 3000,
        ratio_thresh: 0.75,
        ransac_thresh: 3.0,
        transform_type: 'homography',
        max_return_matches: 250
      }

      const res = await fetchFeatureMatching(params)
      this.stopProcessingAnimation()

      this.result = res
      if (res.status === 'requires_band_extraction') {
        this.currentState = 'insufficient'
        this.showBanner('IIRS HYPERSPECTRAL CUBE DETECTED', res.message || 'IIRS spectral cube requires band extraction before 2D registration.', 'warning')
        this.populateStats(res)
      } else if (res.status === 'completed') {
        this.currentState = 'completed'
        this.hideBanner()
        this.loadImagesAndDraw()
        this.populateStats(res)
      } else if (res.status === 'insufficient_matches') {
        this.currentState = 'insufficient'
        this.showBanner('INSUFFICIENT MATCHES DETECTED', res.message || 'Fewer than 4 verified correspondences found. Try adjusting ROI coordinates or feature thresholds.', 'warning')
        this.loadImagesAndDraw()
        this.populateStats(res)
      } else {
        this.currentState = 'failed'
        this.showBanner('GEOMETRIC VERIFICATION FAILED', res.message || 'RANSAC was unable to converge on a valid transformation model.', 'error')
        this.populateStats(res)
      }
    } catch (err: any) {
      this.stopProcessingAnimation()
      this.currentState = 'failed'
      this.errorMessage = err.message || 'Failed to communicate with scientific processing backend.'
      this.showBanner('BACKEND PROCESSING ERROR', this.errorMessage, 'error')
    }
  }

  private startProcessingAnimation() {
    this.currentState = 'processing'
    this.hideBanner()
    this.missionOverlayEl.style.display = 'flex'
    this.processingStageIdx = 0

    const titleEl = this.rootEl.querySelector('#mission-stage-title')!
    const descEl = this.rootEl.querySelector('#mission-stage-desc')!
    const barEl = this.rootEl.querySelector('#mission-progress-bar') as HTMLElement

    const updateStageUI = () => {
      const st = this.processingStages[this.processingStageIdx]
      if (titleEl) titleEl.textContent = st.title
      if (descEl) descEl.textContent = st.desc

      for (let i = 1; i <= 3; i++) {
        const dot = this.rootEl.querySelector(`#dot-step-${i}`)
        if (dot) {
          dot.classList.toggle('active', i - 1 <= this.processingStageIdx)
        }
      }

      if (barEl) {
        barEl.style.width = `${((this.processingStageIdx + 1) / 3) * 100}%`
      }
    }

    updateStageUI()

    this.processingTimer = setInterval(() => {
      this.processingStageIdx = (this.processingStageIdx + 1) % this.processingStages.length
      updateStageUI()
    }, 1100)
  }

  private stopProcessingAnimation() {
    if (this.processingTimer) {
      clearInterval(this.processingTimer)
      this.processingTimer = null
    }
    this.missionOverlayEl.style.display = 'none'
  }

  private showBanner(title: string, msg: string, type: 'warning' | 'error') {
    const banner = this.rootEl.querySelector('#ws-state-banner') as HTMLElement
    const titleEl = this.rootEl.querySelector('#state-banner-title')!
    const msgEl = this.rootEl.querySelector('#state-banner-msg')!
    const iconEl = this.rootEl.querySelector('#state-banner-icon')!

    if (banner) {
      banner.style.display = 'flex'
      titleEl.textContent = title
      msgEl.textContent = msg
      iconEl.textContent = type === 'warning' ? '⚠' : '✖'
      iconEl.className = `state-icon-box ${type}`
    }
  }

  private hideBanner() {
    const banner = this.rootEl.querySelector('#ws-state-banner') as HTMLElement
    if (banner) banner.style.display = 'none'
  }

  private loadImagesAndDraw() {
    if (!this.result) return

    let loadedCount = 0
    const checkReady = () => {
      loadedCount++
      if (loadedCount >= 2) {
        this.updateDimensionsReadout()
        this.drawAll()
      }
    }

    if (this.result.source_image) {
      this.srcImgEl = new Image()
      this.srcImgEl.onload = checkReady
      this.srcImgEl.src = `data:image/png;base64,${this.result.source_image}`
    }

    if (this.result.reference_image) {
      this.refImgEl = new Image()
      this.refImgEl.onload = checkReady
      this.refImgEl.src = `data:image/png;base64,${this.result.reference_image}`
    }
  }

  private updateDimensionsReadout() {
    if (!this.result) return
    const srcDim = this.rootEl.querySelector('#src-dim-readout')
    const refDim = this.rootEl.querySelector('#ref-dim-readout')
    if (srcDim) srcDim.textContent = `DIM: ${this.result.source_dimensions[1]} × ${this.result.source_dimensions[0]} px`
    if (refDim) refDim.textContent = `DIM: ${this.result.reference_dimensions[1]} × ${this.result.reference_dimensions[0]} px`
  }

  private populateStats(res: FeatureMatchResult) {
    const s = res.stats
    const setVal = (id: string, text: string) => {
      const el = this.rootEl.querySelector(id)
      if (el) el.textContent = text
    }

    setVal('#stat-features-detected', (s.source_features_count + s.reference_features_count).toLocaleString())
    setVal('#stat-features-breakdown', `Src: ${s.source_features_count.toLocaleString()} | Ref: ${s.reference_features_count.toLocaleString()}`)
    setVal('#stat-candidates', s.candidate_matches_count.toLocaleString())
    setVal('#stat-verified', s.verified_matches_count.toLocaleString())
    setVal('#stat-inliers', s.inliers_count.toLocaleString())
    setVal('#stat-inlier-ratio', `Inlier Ratio: ${(s.inlier_ratio * 100).toFixed(1)}%`)
    setVal('#stat-outliers', s.outliers_count.toLocaleString())

    // Update HUD Legend counts
    setVal('#legend-inlier-count', `${s.inliers_count} inliers`)
    setVal('#legend-outlier-count', `${s.outliers_count} outliers`)

    // Precise RMSE display with 6 decimals (Phase 8)
    const rmseText = s.rmse_formatted || (s.rmse !== undefined && s.rmse !== null ? `${Number(s.rmse).toFixed(6)} px` : '0.000000 px')
    setVal('#stat-rmse', rmseText)
    setVal('#stat-mean-error', `Mean Reproj: ${s.mean_reprojection_error.toFixed(4)} px`)

    // Scientific Validity State (Phase 7)
    const valState = res.validation_state || s.validation_state || (s.inliers_count < 12 ? 'INSUFFICIENT' : 'VALID')
    const valReason = res.validation_reason || s.validation_reason || (valState === 'INSUFFICIENT' ? 'Fewer than 12 inliers detected. Statistical overdetermination not achieved.' : 'Statistically valid registration.')

    const badgeEl = this.rootEl.querySelector('#badge-validity-state') as HTMLElement | null
    const reasonEl = this.rootEl.querySelector('#stat-validity-reason')
    const noteEl = this.rootEl.querySelector('#stat-rmse-note') as HTMLElement | null
    const cardEl = this.rootEl.querySelector('#card-validation-state') as HTMLElement | null

    if (badgeEl) {
      badgeEl.textContent = valState
      if (valState === 'VALID') {
        badgeEl.style.background = 'rgba(16,185,129,0.2)'
        badgeEl.style.color = 'var(--emerald-status)'
        if (cardEl) cardEl.style.borderLeftColor = 'var(--emerald-status)'
      } else if (valState === 'INSUFFICIENT') {
        badgeEl.style.background = 'rgba(245,158,11,0.2)'
        badgeEl.style.color = '#f59e0b'
        if (cardEl) cardEl.style.borderLeftColor = '#f59e0b'
      } else {
        badgeEl.style.background = 'rgba(244,63,94,0.2)'
        badgeEl.style.color = 'var(--rose-alert)'
        if (cardEl) cardEl.style.borderLeftColor = 'var(--rose-alert)'
      }
    }
    if (reasonEl) reasonEl.textContent = valReason

    if (noteEl) {
      if (valState !== 'VALID') {
        noteEl.style.display = 'block'
        noteEl.textContent = s.inliers_count <= 4
          ? 'RMSE is not statistically meaningful because the homography was fitted with only the minimum number of correspondences (4 points, 0 residual degrees of freedom).'
          : valReason
      } else {
        noteEl.style.display = 'none'
      }
    }

    // Dynamic HUD Chips & Filenames (Phase 3)
    const srcChip = this.rootEl.querySelector('#src-hud-chip')
    const refChip = this.rootEl.querySelector('#ref-hud-chip')
    const srcFileEl = this.rootEl.querySelector('#src-file-readout')
    const refFileEl = this.rootEl.querySelector('#ref-file-readout')
    const refOverlapEl = this.rootEl.querySelector('#ref-overlap-badge')

    const inst = res.instrument || (this.pairId === 'pair_001' ? 'OHRC' : this.pairId === 'pair_002' ? 'IIRS' : 'TMC')
    const mission = res.mission || (this.pairId === 'pair_003' ? 'Chandrayaan-1' : 'Chandrayaan-2')
    if (srcChip) srcChip.textContent = `SOURCE RASTER (${mission.toUpperCase()} ${inst})`
    if (refChip) refChip.textContent = `REFERENCE RASTER (LROC NAC)`
    if (srcFileEl) srcFileEl.textContent = res.source_filename || ''
    if (refFileEl) refFileEl.textContent = res.reference_filename || 'M1536201804CC.IMG'
    if (refOverlapEl) refOverlapEl.textContent = res.reference_status_label || 'Reference geographic overlap: NOT YET VERIFIED'

    const engineBadge = this.rootEl.querySelector('#stat-engine-badge')
    if (engineBadge) {
      engineBadge.textContent = res.is_simulated
        ? 'FastAPI Scientific Engine (Simulated Lunar Field)'
        : 'FastAPI Scientific Engine (Live PDS Data)'
    }
  }

  private drawAll() {
    this.drawSourcePane()
    this.drawRefPane()
    this.drawMatchLinesOverlay()
  }

  private drawSourcePane() {
    const ctx = this.srcCanvas.getContext('2d')
    if (!ctx) return
    const w = this.srcCanvas.width
    const h = this.srcCanvas.height

    ctx.clearRect(0, 0, w, h)

    // Background lunar raster
    if (this.srcImgEl && this.srcImgEl.complete) {
      ctx.save()
      ctx.translate(this.panX, this.panY)
      ctx.scale(this.zoom, this.zoom)
      ctx.imageSmoothingEnabled = false
      ctx.drawImage(this.srcImgEl, 0, 0)
      ctx.restore()
    } else {
      // Standby dark background
      ctx.fillStyle = '#050914'
      ctx.fillRect(0, 0, w, h)
      this.drawRulerGrid(ctx, w, h)
    }

    // Keypoints background cloud
    if (this.showKeypoints && this.result?.source_keypoints) {
      ctx.save()
      ctx.translate(this.panX, this.panY)
      ctx.scale(this.zoom, this.zoom)

      for (const kp of this.result.source_keypoints) {
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.40)'
        ctx.fillStyle = 'rgba(56, 189, 248, 0.15)'
        ctx.lineWidth = 1.0 / this.zoom
        ctx.beginPath()
        ctx.arc(kp.x, kp.y, Math.max(3, (kp.size || 5) * 0.5), 0, Math.PI * 2)
        ctx.stroke()
        ctx.fill()
      }
      ctx.restore()
    }

    // Highlight matched keypoints with high-contrast target rings
    if (this.result?.matches && this.result.matches.length > 0) {
      ctx.save()
      ctx.translate(this.panX, this.panY)
      ctx.scale(this.zoom, this.zoom)

      for (const m of this.result.matches) {
        if (this.currentFilter === 'inliers' && !m.is_inlier) continue
        if (this.currentFilter === 'outliers' && m.is_inlier) continue

        const isHovered = this.hoveredMatchId === m.id
        const px = m.source_pt[0]
        const py = m.source_pt[1]
        const r = isHovered ? 8.0 / this.zoom : (m.is_inlier ? 5.5 / this.zoom : 4.5 / this.zoom)

        // Outer glow circle
        ctx.beginPath()
        ctx.arc(px, py, r, 0, Math.PI * 2)
        ctx.strokeStyle = isHovered ? '#38bdf8' : (m.is_inlier ? '#10b981' : '#f43f5e')
        ctx.lineWidth = (isHovered ? 2.8 : 1.8) / this.zoom
        ctx.stroke()

        // Center dot
        ctx.beginPath()
        ctx.arc(px, py, 2.0 / this.zoom, 0, Math.PI * 2)
        ctx.fillStyle = isHovered ? '#38bdf8' : (m.is_inlier ? '#10b981' : '#f43f5e')
        ctx.fill()
      }
      ctx.restore()
    }
  }

  private drawRefPane() {
    const ctx = this.refCanvas.getContext('2d')
    if (!ctx) return
    const w = this.refCanvas.width
    const h = this.refCanvas.height

    ctx.clearRect(0, 0, w, h)

    // Background lunar raster
    if (this.refImgEl && this.refImgEl.complete) {
      ctx.save()
      ctx.translate(this.panX, this.panY)
      ctx.scale(this.zoom, this.zoom)
      ctx.imageSmoothingEnabled = false
      ctx.drawImage(this.refImgEl, 0, 0)
      ctx.restore()
    } else {
      // Standby dark background
      ctx.fillStyle = '#050914'
      ctx.fillRect(0, 0, w, h)
      this.drawRulerGrid(ctx, w, h)
    }

    // Keypoints background cloud
    if (this.showKeypoints && this.result?.reference_keypoints) {
      ctx.save()
      ctx.translate(this.panX, this.panY)
      ctx.scale(this.zoom, this.zoom)

      for (const kp of this.result.reference_keypoints) {
        ctx.strokeStyle = 'rgba(234, 179, 8, 0.40)'
        ctx.fillStyle = 'rgba(234, 179, 8, 0.15)'
        ctx.lineWidth = 1.0 / this.zoom
        ctx.beginPath()
        ctx.arc(kp.x, kp.y, Math.max(3, (kp.size || 5) * 0.5), 0, Math.PI * 2)
        ctx.stroke()
        ctx.fill()
      }
      ctx.restore()
    }

    // Highlight matched keypoints with target landing reticles
    if (this.result?.matches && this.result.matches.length > 0) {
      ctx.save()
      ctx.translate(this.panX, this.panY)
      ctx.scale(this.zoom, this.zoom)

      for (const m of this.result.matches) {
        if (this.currentFilter === 'inliers' && !m.is_inlier) continue
        if (this.currentFilter === 'outliers' && m.is_inlier) continue

        const isHovered = this.hoveredMatchId === m.id
        const px = m.ref_pt[0]
        const py = m.ref_pt[1]
        const r = isHovered ? 8.0 / this.zoom : (m.is_inlier ? 5.5 / this.zoom : 4.5 / this.zoom)

        if (m.is_inlier || isHovered) {
          // Landing reticle with crosshairs
          ctx.beginPath()
          ctx.arc(px, py, r, 0, Math.PI * 2)
          ctx.strokeStyle = isHovered ? '#38bdf8' : '#10b981'
          ctx.lineWidth = (isHovered ? 2.5 : 1.6) / this.zoom
          ctx.stroke()

          // Crosshairs
          ctx.beginPath()
          ctx.moveTo(px - r * 1.5, py)
          ctx.lineTo(px + r * 1.5, py)
          ctx.moveTo(px, py - r * 1.5)
          ctx.lineTo(px, py + r * 1.5)
          ctx.strokeStyle = isHovered ? '#38bdf8' : '#10b981'
          ctx.lineWidth = 1.0 / this.zoom
          ctx.stroke()
        } else {
          // Rejection cross marker '×' for outliers
          const cr = r * 0.9
          ctx.beginPath()
          ctx.moveTo(px - cr, py - cr)
          ctx.lineTo(px + cr, py + cr)
          ctx.moveTo(px + cr, py - cr)
          ctx.lineTo(px - cr, py + cr)
          ctx.strokeStyle = '#f43f5e'
          ctx.lineWidth = 1.8 / this.zoom
          ctx.stroke()
        }
      }
      ctx.restore()
    }
  }

  private drawRulerGrid(ctx: CanvasRenderingContext2D, w: number, h: number) {
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.08)'
    ctx.lineWidth = 1
    const step = 40
    for (let x = 0; x < w; x += step) {
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, h)
      ctx.stroke()
    }
    for (let y = 0; y < h; y += step) {
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(w, y)
      ctx.stroke()
    }
  }

  private drawMatchLinesOverlay() {
    const ctx = this.overlayCanvas.getContext('2d')
    if (!ctx) return
    const w = this.overlayCanvas.width
    const h = this.overlayCanvas.height

    ctx.clearRect(0, 0, w, h)

    if (!this.showMatchLines || !this.result?.matches || this.result.matches.length === 0) {
      return
    }

    // Calculate pane offset relative to overlay container
    const dualContainer = this.rootEl.querySelector('#ws-dual-container')!
    const contRect = dualContainer.getBoundingClientRect()
    const srcRect = this.srcPane.getBoundingClientRect()
    const refRect = this.refPane.getBoundingClientRect()

    const srcOffsetX = srcRect.left - contRect.left
    const srcOffsetY = srcRect.top - contRect.top
    const refOffsetX = refRect.left - contRect.left
    const refOffsetY = refRect.top - contRect.top

    // Sort: outliers first, then inliers, then hovered last (so inliers & hovered are always visible on top)
    const matchesToDraw = [...this.result.matches].sort((a, b) => {
      if (a.id === this.hoveredMatchId) return 1
      if (b.id === this.hoveredMatchId) return -1
      if (a.is_inlier && !b.is_inlier) return 1
      if (!a.is_inlier && b.is_inlier) return -1
      return 0
    })

    for (const m of matchesToDraw) {
      // Filter test
      if (this.currentFilter === 'inliers' && !m.is_inlier) continue
      if (this.currentFilter === 'outliers' && m.is_inlier) continue

      const x1 = srcOffsetX + this.panX + m.source_pt[0] * this.zoom
      const y1 = srcOffsetY + this.panY + m.source_pt[1] * this.zoom
      const x2 = refOffsetX + this.panX + m.ref_pt[0] * this.zoom
      const y2 = refOffsetY + this.panY + m.ref_pt[1] * this.zoom

      const dx = x2 - x1
      const dy = y2 - y1
      const dist = Math.hypot(dx, dy)
      if (dist < 2) continue
      const angle = Math.atan2(dy, dx)

      const isHovered = this.hoveredMatchId === m.id

      ctx.save()

      if (isHovered) {
        ctx.strokeStyle = '#38bdf8'
        ctx.fillStyle = '#38bdf8'
        ctx.lineWidth = 3.5
        ctx.setLineDash([])
        ctx.shadowColor = 'rgba(56, 189, 248, 0.95)'
        ctx.shadowBlur = 12
      } else if (m.is_inlier) {
        ctx.strokeStyle = '#10b981' // Vibrant Emerald Green
        ctx.fillStyle = '#10b981'
        ctx.lineWidth = 2.0
        ctx.setLineDash([])
        ctx.shadowColor = 'rgba(16, 185, 129, 0.85)'
        ctx.shadowBlur = 6
      } else {
        ctx.strokeStyle = '#f43f5e' // Vibrant Rose Red
        ctx.fillStyle = '#f43f5e'
        ctx.lineWidth = 1.6
        ctx.setLineDash([7, 5]) // Distinct Dashed line for outliers
        ctx.shadowColor = 'rgba(244, 63, 94, 0.55)'
        ctx.shadowBlur = 4
      }

      // 1. Draw Connecting Vector Line (stop slightly before arrowhead tip at x2, y2)
      const arrowHeadLen = isHovered ? 14 : 11
      const endLineX = x2 - arrowHeadLen * 0.7 * Math.cos(angle)
      const endLineY = y2 - arrowHeadLen * 0.7 * Math.sin(angle)

      ctx.beginPath()
      ctx.moveTo(x1, y1)
      ctx.lineTo(endLineX, endLineY)
      ctx.stroke()

      // Reset dash for symbols and anchors
      ctx.setLineDash([])

      // 2. Source Anchor Node at (x1, y1)
      ctx.beginPath()
      ctx.arc(x1, y1, isHovered ? 5.5 : 3.5, 0, Math.PI * 2)
      ctx.fill()
      ctx.lineWidth = 1.0
      ctx.strokeStyle = 'rgba(5, 11, 26, 0.95)'
      ctx.stroke()

      // Source outer halo ring
      ctx.beginPath()
      ctx.arc(x1, y1, isHovered ? 9 : (m.is_inlier ? 6 : 5), 0, Math.PI * 2)
      ctx.strokeStyle = isHovered ? '#38bdf8' : (m.is_inlier ? 'rgba(16, 185, 129, 0.65)' : 'rgba(244, 63, 94, 0.55)')
      ctx.stroke()

      // 3. Arrowhead pointing directly at Landing Coordinate (x2, y2)
      ctx.beginPath()
      ctx.moveTo(x2, y2)
      const leftX = x2 - arrowHeadLen * Math.cos(angle - Math.PI / 6)
      const leftY = y2 - arrowHeadLen * Math.sin(angle - Math.PI / 6)
      const rightX = x2 - arrowHeadLen * Math.cos(angle + Math.PI / 6)
      const rightY = y2 - arrowHeadLen * Math.sin(angle + Math.PI / 6)
      ctx.lineTo(leftX, leftY)
      // Inward notch for high-tech aesthetic
      const notchX = x2 - arrowHeadLen * 0.72 * Math.cos(angle)
      const notchY = y2 - arrowHeadLen * 0.72 * Math.sin(angle)
      ctx.lineTo(notchX, notchY)
      ctx.lineTo(rightX, rightY)
      ctx.closePath()

      ctx.fillStyle = isHovered ? '#38bdf8' : (m.is_inlier ? '#10b981' : '#f43f5e')
      ctx.fill()
      ctx.strokeStyle = 'rgba(2, 6, 18, 0.95)'
      ctx.lineWidth = 1.2
      ctx.stroke()

      // 4. Reference Node Marker at (x2, y2)
      if (m.is_inlier) {
        // Landing Reticle Target (Green)
        const reticleR = isHovered ? 7.5 : 5.5
        ctx.strokeStyle = isHovered ? '#38bdf8' : '#10b981'
        ctx.lineWidth = 1.4
        ctx.beginPath()
        ctx.arc(x2, y2, reticleR, 0, Math.PI * 2)
        ctx.stroke()

        // Tiny crosshairs outside the circle
        ctx.beginPath()
        ctx.moveTo(x2 - reticleR - 3, y2)
        ctx.lineTo(x2 - reticleR, y2)
        ctx.moveTo(x2 + reticleR, y2)
        ctx.lineTo(x2 + reticleR + 3, y2)
        ctx.moveTo(x2, y2 - reticleR - 3)
        ctx.lineTo(x2, y2 - reticleR)
        ctx.moveTo(x2, y2 + reticleR)
        ctx.lineTo(x2, y2 + reticleR + 3)
        ctx.stroke()
      } else {
        // Rejection Cross '×' at Reference Point for Outliers
        const cr = isHovered ? 5.5 : 4.0
        ctx.strokeStyle = isHovered ? '#38bdf8' : '#f43f5e'
        ctx.lineWidth = 1.8
        ctx.beginPath()
        ctx.moveTo(x2 - cr, y2 - cr)
        ctx.lineTo(x2 + cr, y2 + cr)
        ctx.moveTo(x2 + cr, y2 - cr)
        ctx.lineTo(x2 - cr, y2 + cr)
        ctx.stroke()
      }

      // 5. Mid-line Direction Flow Chevron (shows unambiguous flow direction from Source -> Reference)
      if (dist > 50) {
        const midX = (x1 + x2) / 2
        const midY = (y1 + y2) / 2
        const chevLen = isHovered ? 8 : 6
        ctx.beginPath()
        ctx.moveTo(midX - chevLen * Math.cos(angle - Math.PI / 4), midY - chevLen * Math.sin(angle - Math.PI / 4))
        ctx.lineTo(midX, midY)
        ctx.lineTo(midX - chevLen * Math.cos(angle + Math.PI / 4), midY - chevLen * Math.sin(angle + Math.PI / 4))
        ctx.strokeStyle = isHovered ? '#38bdf8' : (m.is_inlier ? 'rgba(16, 185, 129, 0.95)' : 'rgba(244, 63, 94, 0.85)')
        ctx.lineWidth = isHovered ? 2.6 : 1.8
        ctx.stroke()
      }

      ctx.restore()
    }
  }

  private handleHover(e: MouseEvent) {
    if (!this.result?.matches || this.result.matches.length === 0 || !this.showMatchLines) {
      return
    }

    const dualContainer = this.rootEl.querySelector('#ws-dual-container')!
    const contRect = dualContainer.getBoundingClientRect()
    const mx = e.clientX - contRect.left
    const my = e.clientY - contRect.top

    const srcRect = this.srcPane.getBoundingClientRect()
    const refRect = this.refPane.getBoundingClientRect()
    const srcOffsetX = srcRect.left - contRect.left
    const srcOffsetY = srcRect.top - contRect.top
    const refOffsetX = refRect.left - contRect.left
    const refOffsetY = refRect.top - contRect.top

    let closestMatch: any = null
    let minDist = 14 // hover sensitivity distance in pixels

    for (const m of this.result.matches) {
      if (this.currentFilter === 'inliers' && !m.is_inlier) continue
      if (this.currentFilter === 'outliers' && m.is_inlier) continue

      const x1 = srcOffsetX + this.panX + m.source_pt[0] * this.zoom
      const y1 = srcOffsetY + this.panY + m.source_pt[1] * this.zoom
      const x2 = refOffsetX + this.panX + m.ref_pt[0] * this.zoom
      const y2 = refOffsetY + this.panY + m.ref_pt[1] * this.zoom

      // Distance from mouse to line segment
      const d = this.distToSegment(mx, my, x1, y1, x2, y2)
      if (d < minDist) {
        minDist = d
        closestMatch = m
      }
    }

    if (closestMatch) {
      if (this.hoveredMatchId !== closestMatch.id) {
        this.hoveredMatchId = closestMatch.id
        this.updateHoverTelemetry(closestMatch)
        this.drawMatchLinesOverlay()
      }
      this.showTooltip(e.clientX, e.clientY, closestMatch)
    } else {
      if (this.hoveredMatchId !== null) {
        this.hoveredMatchId = null
        this.clearHoverTelemetry()
        this.drawMatchLinesOverlay()
      }
      this.hideTooltip()
    }
  }

  private distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
    const l2 = (x2 - x1) ** 2 + (y2 - y1) ** 2
    if (l2 === 0) return Math.hypot(px - x1, py - y1)
    let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2
    t = Math.max(0, Math.min(1, t))
    return Math.hypot(px - (x1 + t * (x2 - x1)), py - (y1 + t * (y2 - y1)))
  }

  private updateHoverTelemetry(m: any) {
    const statusEl = this.rootEl.querySelector('#hover-status') as HTMLElement | null
    const srcCoordEl = this.rootEl.querySelector('#hover-src-coord')
    const refCoordEl = this.rootEl.querySelector('#hover-ref-coord')
    const distEl = this.rootEl.querySelector('#hover-dist')
    const errEl = this.rootEl.querySelector('#hover-err')

    if (statusEl) {
      statusEl.textContent = m.is_inlier ? 'INLIER (Consensus)' : 'OUTLIER (Rejected)'
      statusEl.style.color = m.is_inlier ? 'var(--emerald-status)' : 'var(--rose-alert)'
    }
    if (srcCoordEl) srcCoordEl.textContent = `(${m.source_pt[0]}, ${m.source_pt[1]})`
    if (refCoordEl) refCoordEl.textContent = `(${m.ref_pt[0]}, ${m.ref_pt[1]})`
    if (distEl) distEl.textContent = `${m.distance.toFixed(3)} (L2)`
    if (errEl) errEl.textContent = `${m.error.toFixed(3)} px`
  }

  private clearHoverTelemetry() {
    const statusEl = this.rootEl.querySelector('#hover-status') as HTMLElement | null
    if (statusEl) {
      statusEl.textContent = 'Hover a match line'
      statusEl.style.color = 'var(--text-muted)'
    }
  }

  private showTooltip(clientX: number, clientY: number, m: any) {
    const t = this.tooltipEl
    t.style.display = 'block'
    t.style.left = `${clientX + 14}px`
    t.style.top = `${clientY + 14}px`
    t.innerHTML = `
      <div class="tt-header">MATCH #${m.id} ${m.is_inlier ? '<span class="tt-inlier">INLIER</span>' : '<span class="tt-outlier">OUTLIER</span>'}</div>
      <div class="tt-row"><span>Source:</span> <b>(${m.source_pt[0]}, ${m.source_pt[1]})</b></div>
      <div class="tt-row"><span>Reference:</span> <b>(${m.ref_pt[0]}, ${m.ref_pt[1]})</b></div>
      <div class="tt-row"><span>Error:</span> <b>${m.error.toFixed(2)} px</b></div>
    `
  }

  private hideTooltip() {
    this.tooltipEl.style.display = 'none'
  }

  public async generatePdfReport() {
    const btnHeader = this.rootEl.querySelector('#btn-export-pdf') as HTMLButtonElement | null
    const btnSidebar = this.rootEl.querySelector('#btn-sidebar-export-pdf') as HTMLButtonElement | null
    const toastEl = this.rootEl.querySelector('#pdf-download-toast') as HTMLElement | null

    const setGenerating = (generating: boolean) => {
      if (btnHeader) {
        btnHeader.disabled = generating
        btnHeader.innerHTML = generating
          ? `<svg class="spin-anim" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10" stroke-dasharray="32" stroke-linecap="round"/></svg> Generating PDF...`
          : `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg> Export PDF Report`
      }
      if (btnSidebar) {
        btnSidebar.disabled = generating
        btnSidebar.innerHTML = generating
          ? `<svg class="spin-anim" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10" stroke-dasharray="32" stroke-linecap="round"/></svg> Generating Scientific PDF...`
          : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Download Scientific PDF`
      }
    }

    try {
      setGenerating(true)
      const resp = await fetch(`${API_BASE}/artifacts/${this.pairId}/generate-report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      })

      if (!resp.ok) {
        throw new Error(`Report generation failed: HTTP ${resp.status}`)
      }

      // Trigger instant browser download of the generated PDF
      const downloadUrl = `${API_BASE}/artifacts/${this.pairId}/scientific_report.pdf`
      const a = document.createElement('a')
      a.href = downloadUrl
      a.download = `scientific_report_${this.pairId}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)

      if (toastEl) {
        toastEl.style.display = 'block'
        toastEl.style.color = 'var(--emerald-status)'
        toastEl.textContent = `✓ Scientific PDF Report Downloaded (${this.pairId.toUpperCase()})`
        setTimeout(() => {
          toastEl.style.display = 'none'
        }, 5000)
      }
    } catch (err: any) {
      console.error('PDF export error:', err)
      if (toastEl) {
        toastEl.style.display = 'block'
        toastEl.style.color = 'var(--rose-alert)'
        toastEl.textContent = `✖ Export failed: ${err.message || 'Server error'}`
        setTimeout(() => {
          toastEl.style.display = 'none'
          toastEl.style.color = 'var(--emerald-status)'
        }, 6000)
      }
    } finally {
      setGenerating(false)
    }
  }
}
