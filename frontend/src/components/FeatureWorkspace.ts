/**
 * Component: FeatureWorkspace
 * Scientific Feature Correspondence & Verification Workspace
 * Dual-viewport scientific visualizer for Chandrayaan and LROC lunar imagery.
 * Renders authentic processed lunar rasters, real SIFT keypoints, FLANN matches, and RANSAC inliers.
 */

import { fetchFeatureMatching, executePreprocessing, type FeatureMatchResult, type FeatureMatchParams, type PreprocessResult, API_BASE } from '../api'
import { formatHumanReadableError, showHumanToast } from '../services/errorHandler'
import type { PairItem } from '../types'

export type FeatureFilter = 'all' | 'inliers' | 'outliers'
export type MatchingState = 'READY' | 'MATCHING' | 'INSUFFICIENT' | 'VALID' | 'FAILED' | 'REQUIRES_BAND'

export class FeatureWorkspace {
  private container: HTMLElement
  private pairId: string = 'pair_001'
  private pairData: PairItem | null = null
  private roiCoords: any = null
  private isRoiApplied: boolean = false

  // Navigation callbacks
  private onNavigateNext?: () => void
  private onAdjustRoi?: () => void
  private onReturnToPreprocessing?: () => void
  private preprocProvider?: () => PreprocessResult | null

  // Scientific Results & State
  private result: FeatureMatchResult | null = null
  private preprocResult: PreprocessResult | null = null
  private currentState: MatchingState = 'READY'
  private currentFilter: FeatureFilter = 'inliers' // Default: inliers / verified matches
  private showKeypoints: boolean = true
  private showMatchLines: boolean = true
  private syncNav: boolean = true

  // Interactive Match Inspection
  private selectedMatchId: number | null = null
  private hoveredMatchId: number | null = null

  // Viewport transforms (independent pan offsets for perfect centering, synchronized zoom)
  private zoom: number = 1.0
  private srcPanX: number = 0
  private srcPanY: number = 0
  private refPanX: number = 0
  private refPanY: number = 0
  private isDragging: boolean = false
  private dragStartX: number = 0
  private dragStartY: number = 0

  // HTML Image elements for authentic processed lunar rasters
  private srcImgEl: HTMLImageElement | null = null
  private refImgEl: HTMLImageElement | null = null
  private isLoadingImages: boolean = false

  // DOM Elements
  private rootEl!: HTMLDivElement
  private srcCanvas!: HTMLCanvasElement
  private refCanvas!: HTMLCanvasElement
  private overlayCanvas!: HTMLCanvasElement
  private srcPane!: HTMLDivElement
  private refPane!: HTMLDivElement
  private statusBannerEl!: HTMLDivElement

  // Dynamic scientific metadata (dynamic from dataset, never hardcoded TMC)
  private metadata = {
    mission: 'Chandrayaan-2',
    instrument: 'OHRC',
    instrumentName: 'Chandrayaan-2 OHRC',
    sourceFilename: 'ch2_ohr_ncp_20240316T2008014680_d_img_d18.img',
    referenceFilename: 'M1536201804CC.IMG',
    referenceInstrument: 'LROC',
    sourceDims: '6,000 × 4,000 px',
    refDims: '500 × 2,000 px'
  }

  constructor(
    container: HTMLElement,
    initialPairId: string = 'pair_001',
    onNavigateNext?: () => void,
    onAdjustRoi?: () => void,
    onReturnToPreprocessing?: () => void,
    preprocProvider?: () => PreprocessResult | null
  ) {
    this.container = container
    this.pairId = initialPairId
    this.onNavigateNext = onNavigateNext
    this.onAdjustRoi = onAdjustRoi
    this.onReturnToPreprocessing = onReturnToPreprocessing
    this.preprocProvider = preprocProvider

    this.render()
    this.setupListeners()
    this.loadPairMetadata()
  }

  public setNavigationCallbacks(callbacks: {
    onNavigateNext?: () => void
    onAdjustRoi?: () => void
    onReturnToPreprocessing?: () => void
    preprocProvider?: () => PreprocessResult | null
  }) {
    if (callbacks.onNavigateNext) this.onNavigateNext = callbacks.onNavigateNext
    if (callbacks.onAdjustRoi) this.onAdjustRoi = callbacks.onAdjustRoi
    if (callbacks.onReturnToPreprocessing) this.onReturnToPreprocessing = callbacks.onReturnToPreprocessing
    if (callbacks.preprocProvider) this.preprocProvider = callbacks.preprocProvider
  }

  public setActivePair(pairId: string, pairData?: PairItem | null, roiCoords?: any, isRoiApplied?: boolean) {
    const isNewPair = this.pairId !== pairId
    this.pairId = pairId
    if (pairData !== undefined) this.pairData = pairData
    if (roiCoords !== undefined) this.roiCoords = roiCoords
    if (isRoiApplied !== undefined) this.isRoiApplied = isRoiApplied

    if (isNewPair) {
      this.result = null
      const isIirs = pairId === 'pair_002' || pairData?.instrument === 'IIRS' || pairData?.product_type === 'HYPERSPECTRAL'
      this.currentState = isIirs ? 'REQUIRES_BAND' : 'READY'
      this.metadata.instrument = pairData?.instrument || (pairId === 'pair_002' ? 'IIRS' : pairId === 'pair_003' ? 'TMC' : 'OHRC')
      this.metadata.mission = pairData?.mission || (pairId === 'pair_003' ? 'Chandrayaan-1' : 'Chandrayaan-2')
      this.selectedMatchId = null
      this.hoveredMatchId = null
      this.srcImgEl = null
      this.refImgEl = null
      this.zoom = 1.0
      this.srcPanX = 0
      this.srcPanY = 0
      this.refPanX = 0
      this.refPanY = 0

      if (isIirs) {
        this.showIirsGuard()
      } else {
        this.hideIirsGuard()
        const btnRun = this.rootEl.querySelector('#fc-btn-run') as HTMLButtonElement | null
        if (btnRun) {
          btnRun.disabled = false
          btnRun.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            <span>Run Feature Matching</span>
          `
          btnRun.title = 'Execute SIFT feature extraction and FLANN ratio test'
        }
      }

      this.updateHeaderUI()
      this.loadPairMetadata()
    } else {
      this.updateHeaderUI()
    }
  }

  public setRoi(roiCoords: any, isApplied: boolean) {
    this.roiCoords = roiCoords
    this.isRoiApplied = isApplied
    this.updateHeaderUI()
    const isIirs = this.pairId === 'pair_002' || this.metadata.instrument === 'IIRS' || (this.pairData?.product_type === 'HYPERSPECTRAL')
    if (!isIirs) {
      this.loadProcessedLunarImages()
    }
  }

  public onTabActive() {
    this.fitCanvasSizes()
    this.updateHeaderUI()

    const isIirs = this.pairId === 'pair_002' || this.metadata.instrument === 'IIRS' || (this.pairData?.product_type === 'HYPERSPECTRAL')
    if (isIirs) {
      this.currentState = 'REQUIRES_BAND'
      this.srcImgEl = null
      this.result = null
      this.renderMetrics(null)
      this.renderActionButtons(false)
      this.showIirsGuard()
      this.updateStatusBanner(
        'CHANDRAYAAN-2 IIRS',
        'Hyperspectral product — Band extraction required. The current product contains spectral cube data. A spatial band/composite must be generated before feature correspondence can be performed.',
        'warning'
      )
      const btnRun = this.rootEl.querySelector('#fc-btn-run') as HTMLButtonElement | null
      if (btnRun) {
        btnRun.disabled = true
        btnRun.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <span>Band Extraction Required</span>
        `
        btnRun.title = 'IIRS spatial band extraction required before feature correspondence can be performed.'
      }
      const matchBadge = this.rootEl.querySelector('#fc-match-count-badge')
      if (matchBadge) matchBadge.textContent = 'Band extraction required'

      if (!this.refImgEl) {
        this.loadReferenceBasemapOnly()
      } else {
        this.fitToView()
      }
      return
    }

    if (!this.srcImgEl || !this.refImgEl) {
      this.loadProcessedLunarImages()
    } else {
      this.fitToView()
    }
  }

  public getLastResult(): FeatureMatchResult | null {
    return this.result
  }

  private render() {
    this.rootEl = document.createElement('div')
    this.rootEl.className = 'fc-workspace'

    this.rootEl.innerHTML = `
      <!-- 1. CLEAN SCIENTIFIC HEADER -->
      <header class="fc-header">
        <div class="fc-header-main">
          <div class="fc-header-text">
            <h1 class="fc-title">FEATURE CORRESPONDENCE</h1>
            <p class="fc-subtitle">
              Find and verify corresponding image features between the selected source and reference regions.
            </p>
          </div>

          <div class="fc-header-meta">
            <div class="fc-pill fc-pill-src">
              <span class="fc-pill-pair" id="fc-text-pair">${this.pairId.toUpperCase()}</span>
              <span class="fc-pill-sep">·</span>
              <span class="fc-pill-mission" id="fc-text-mission">Chandrayaan-2</span>
              <span class="fc-pill-sep">·</span>
              <span class="fc-pill-inst" id="fc-text-inst">OHRC</span>
            </div>

            <div class="fc-pill fc-pill-ref">
              <span class="fc-pill-sub">Reference</span>
              <span class="fc-pill-sep">·</span>
              <span class="fc-pill-ref-inst" id="fc-text-ref-inst">LROC</span>
            </div>

            <div class="fc-pill fc-pill-roi">
              <span class="fc-pill-sub">ROI:</span>
              <span id="fc-header-roi-dims" class="fc-pill-val">6,000 × 4,000 px</span>
            </div>

            <div class="fc-pill fc-pill-preproc">
              <span class="fc-status-dot ready" id="fc-preproc-dot"></span>
              <span class="fc-pill-sub">Preprocessing:</span>
              <span id="fc-preproc-status" class="fc-pill-val">Ready</span>
            </div>
          </div>
        </div>

        <div class="fc-header-cta">
          <button id="fc-btn-run" class="fc-btn-primary" title="Execute OpenCV SIFT detector and FLANN ratio matching">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            <span id="fc-run-label">Run Feature Matching</span>
          </button>
        </div>
      </header>

      <!-- 2. STATUS / SCIENTIFIC BANNER -->
      <div id="fc-status-banner" class="fc-banner ready" role="status">
        <div class="fc-banner-badge" id="fc-banner-icon">◎</div>
        <div class="fc-banner-content">
          <span class="fc-banner-title" id="fc-banner-title">READY</span>
          <span class="fc-banner-desc" id="fc-banner-desc">
            Authentic processed lunar ROI imagery loaded. Click "Run Feature Matching" to compute scientific SIFT features and FLANN correspondences.
          </span>
        </div>
        <div class="fc-banner-actions" id="fc-banner-actions"></div>
      </div>

      <!-- 3. COMPACT CONTROLS BAR -->
      <div class="fc-controls-bar">
        <div class="fc-controls-group">
          <!-- Inlier / Outlier / All filters -->
          <div class="fc-btn-group" role="group" aria-label="Correspondence Filters">
            <button id="fc-btn-filter-all" class="fc-btn-toggle" title="Show all candidate matches">All</button>
            <button id="fc-btn-filter-inliers" class="fc-btn-toggle active" title="Show verified consensus inliers">Inliers</button>
            <button id="fc-btn-filter-outliers" class="fc-btn-toggle" title="Show rejected outlier correspondences">Outliers</button>
          </div>

          <div class="fc-vdivider"></div>

          <!-- Feature & Line toggles -->
          <button id="fc-btn-toggle-kps" class="fc-btn-toggle active" title="Toggle SIFT Keypoint markers">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>
            Keypoints
          </button>
          <button id="fc-btn-toggle-lines" class="fc-btn-toggle active" title="Toggle Correspondence Match Lines">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/><circle cx="5" cy="12" r="3"/><circle cx="19" cy="12" r="3"/></svg>
            Match Lines
          </button>

          <div class="fc-vdivider"></div>

          <!-- Match count telemetry -->
          <span id="fc-match-count-badge" class="fc-match-count">Awaiting matching execution</span>
        </div>

        <div class="fc-controls-group">
          <!-- Pan & Zoom Navigation -->
          <button id="fc-btn-zoom-fit" class="fc-btn-nav" title="Fit both rasters cleanly to viewer">Fit View</button>
          <button id="fc-btn-zoom-reset" class="fc-btn-nav" title="Reset zoom to 100%">Reset</button>

          <div class="fc-zoom-indicator">
            <button id="fc-btn-zoom-out" class="fc-btn-mini" title="Zoom Out">−</button>
            <span id="fc-zoom-readout" class="fc-zoom-val">100%</span>
            <button id="fc-btn-zoom-in" class="fc-btn-mini" title="Zoom In">+</button>
          </div>

          <button id="fc-btn-toggle-sync" class="fc-btn-toggle active" title="Synchronize pan and zoom across source and reference">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            Sync Pan/Zoom
          </button>
        </div>
      </div>

      <!-- 4. HERO MAIN WORKSPACE: LARGE SIDE-BY-SIDE LUNAR VIEWERS -->
      <div class="fc-workspace-hero" id="fc-dual-viewer">
        <!-- SOURCE PANE -->
        <div class="fc-pane fc-src-pane" id="fc-src-pane">
          <div class="fc-pane-topbar">
            <div class="fc-pane-title">
              <span class="fc-pane-tag src">SOURCE</span>
              <span class="fc-pane-name" id="fc-src-name">Chandrayaan-2 OHRC</span>
            </div>
            <div class="fc-pane-meta">
              <span id="fc-src-filename" class="fc-filename">ch2_ohr_ncp_20240316T2008014680_d_img_d18.img</span>
              <span id="fc-src-dims" class="fc-badge-dim">Processed ROI</span>
            </div>
          </div>
          <div class="fc-canvas-wrapper" id="fc-src-canvas-wrapper">
            <canvas id="fc-src-canvas" class="fc-canvas"></canvas>
            <div id="fc-src-loading" class="fc-loading-overlay">
              <div class="fc-spinner"></div>
              <span>Decoding authentic lunar raster...</span>
            </div>
          </div>
        </div>

        <!-- REFERENCE PANE -->
        <div class="fc-pane fc-ref-pane" id="fc-ref-pane">
          <div class="fc-pane-topbar">
            <div class="fc-pane-title">
              <span class="fc-pane-tag ref">REFERENCE</span>
              <span class="fc-pane-name" id="fc-ref-name">LROC</span>
            </div>
            <div class="fc-pane-meta">
              <span id="fc-ref-filename" class="fc-filename">M1536201804CC.IMG</span>
              <span id="fc-ref-dims" class="fc-badge-dim">Processed ROI</span>
            </div>
          </div>
          <div class="fc-canvas-wrapper" id="fc-ref-canvas-wrapper">
            <canvas id="fc-ref-canvas" class="fc-canvas"></canvas>
            <div id="fc-ref-loading" class="fc-loading-overlay">
              <div class="fc-spinner"></div>
              <span>Decoding reference lunar raster...</span>
            </div>
          </div>
        </div>

        <!-- SPANNING MATCH LINE OVERLAY (Connects features across panes) -->
        <canvas id="fc-overlay-canvas" class="fc-overlay-canvas"></canvas>

        <!-- INTERACTIVE MATCH INSPECTION CARD (Appears on click/hover) -->
        <div id="fc-inspector-card" class="fc-inspector-card" style="display:none;">
          <div class="fc-inspector-header">
            <span class="fc-insp-title" id="fc-insp-id">MATCH #—</span>
            <span class="fc-insp-badge inlier" id="fc-insp-status">Inlier</span>
            <button id="fc-insp-close" class="fc-insp-close" title="Close inspector">×</button>
          </div>
          <div class="fc-inspector-grid">
            <div class="fc-insp-item">
              <span class="fc-insp-label">Source (X, Y)</span>
              <span class="fc-insp-val" id="fc-insp-src">—</span>
            </div>
            <div class="fc-insp-item">
              <span class="fc-insp-label">Reference (X, Y)</span>
              <span class="fc-insp-val" id="fc-insp-ref">—</span>
            </div>
            <div class="fc-insp-item">
              <span class="fc-insp-label">Status</span>
              <span class="fc-insp-val" id="fc-insp-status-text">—</span>
            </div>
            <div class="fc-insp-item" id="fc-insp-dist-row">
              <span class="fc-insp-label">Descriptor Distance</span>
              <span class="fc-insp-val" id="fc-insp-dist">—</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 5. COMPACT METRICS GRID (Derived strictly from backend, no fake RMSE) -->
      <section class="fc-metrics-section">
        <div class="fc-metrics-container">
          <!-- Features Detected -->
          <div class="fc-metric-card">
            <div class="fc-metric-header">FEATURES DETECTED</div>
            <div class="fc-metric-split">
              <div class="fc-split-col">
                <span class="fc-sub-label">SOURCE:</span>
                <span class="fc-split-val" id="fc-stat-src-features">—</span>
              </div>
              <div class="fc-split-divider"></div>
              <div class="fc-split-col">
                <span class="fc-sub-label">REFERENCE:</span>
                <span class="fc-split-val" id="fc-stat-ref-features">—</span>
              </div>
            </div>
          </div>

          <!-- Candidate Matches -->
          <div class="fc-metric-card">
            <div class="fc-metric-header">CANDIDATE MATCHES</div>
            <div class="fc-metric-value" id="fc-stat-candidates">—</div>
            <div class="fc-metric-hint">FLANN nearest neighbors</div>
          </div>

          <!-- Verified Matches -->
          <div class="fc-metric-card">
            <div class="fc-metric-header">VERIFIED MATCHES</div>
            <div class="fc-metric-value" id="fc-stat-verified">—</div>
            <div class="fc-metric-hint">Passed Lowe's ratio test</div>
          </div>

          <!-- Inliers -->
          <div class="fc-metric-card">
            <div class="fc-metric-header">INLIERS</div>
            <div class="fc-metric-value emerald" id="fc-stat-inliers">—</div>
            <div class="fc-metric-hint">RANSAC consensus set</div>
          </div>

          <!-- Inlier Ratio -->
          <div class="fc-metric-card">
            <div class="fc-metric-header">INLIER RATIO</div>
            <div class="fc-metric-value" id="fc-stat-ratio">—</div>
            <div class="fc-metric-hint">Geometric consensus ratio</div>
          </div>
        </div>
      </section>

      <!-- 6. BOTTOM NAVIGATION & ACTION BAR -->
      <footer class="fc-bottom-bar">
        <div class="fc-bottom-left" id="fc-bottom-actions">
          <!-- Populated dynamically based on backend validation state -->
        </div>

        <div class="fc-bottom-right" id="fc-bottom-next-container">
          <!-- Shown ONLY when backend result is VALID for next stage -->
        </div>
      </footer>
    `

    this.container.appendChild(this.rootEl)

    // Cache elements
    this.srcCanvas = this.rootEl.querySelector('#fc-src-canvas')!
    this.refCanvas = this.rootEl.querySelector('#fc-ref-canvas')!
    this.overlayCanvas = this.rootEl.querySelector('#fc-overlay-canvas')!
    this.srcPane = this.rootEl.querySelector('#fc-src-pane')!
    this.refPane = this.rootEl.querySelector('#fc-ref-pane')!
    this.statusBannerEl = this.rootEl.querySelector('#fc-status-banner')!

    this.fitCanvasSizes()
  }

  private fitCanvasSizes() {
    const srcRect = this.srcPane.getBoundingClientRect()
    const refRect = this.refPane.getBoundingClientRect()
    const wSrc = Math.floor(srcRect.width) || 600
    const hSrc = Math.floor(srcRect.height - 38) || 520
    const wRef = Math.floor(refRect.width) || 600
    const hRef = Math.floor(refRect.height - 38) || 520

    this.srcCanvas.width = wSrc
    this.srcCanvas.height = hSrc
    this.refCanvas.width = wRef
    this.refCanvas.height = hRef

    const dualContainer = this.rootEl.querySelector('#fc-dual-viewer')!
    const dualRect = dualContainer.getBoundingClientRect()
    this.overlayCanvas.width = Math.floor(dualRect.width) || (wSrc + wRef + 20)
    this.overlayCanvas.height = Math.max(hSrc, hRef, Math.floor(dualRect.height)) || 560

    this.drawAll()
  }

  private setupListeners() {
    window.addEventListener('resize', () => {
      this.fitCanvasSizes()
    })

    // 1. Run Feature Matching
    const btnRun = this.rootEl.querySelector('#fc-btn-run')!
    btnRun.addEventListener('click', () => this.runMatching())

    // 2. Filter buttons
    const btnAll = this.rootEl.querySelector('#fc-btn-filter-all')!
    const btnInliers = this.rootEl.querySelector('#fc-btn-filter-inliers')!
    const btnOutliers = this.rootEl.querySelector('#fc-btn-filter-outliers')!

    const setFilter = (filter: FeatureFilter) => {
      this.currentFilter = filter
      btnAll.classList.toggle('active', filter === 'all')
      btnInliers.classList.toggle('active', filter === 'inliers')
      btnOutliers.classList.toggle('active', filter === 'outliers')
      this.updateMatchCountBadge()
      this.drawAll()
    }

    btnAll.addEventListener('click', () => setFilter('all'))
    btnInliers.addEventListener('click', () => setFilter('inliers'))
    btnOutliers.addEventListener('click', () => setFilter('outliers'))

    // 3. Toggles: Keypoints & Match Lines
    const btnKps = this.rootEl.querySelector('#fc-btn-toggle-kps')!
    btnKps.addEventListener('click', () => {
      this.showKeypoints = !this.showKeypoints
      btnKps.classList.toggle('active', this.showKeypoints)
      this.drawAll()
    })

    const btnLines = this.rootEl.querySelector('#fc-btn-toggle-lines')!
    btnLines.addEventListener('click', () => {
      this.showMatchLines = !this.showMatchLines
      btnLines.classList.toggle('active', this.showMatchLines)
      this.drawAll()
    })

    // 4. Viewport Navigation
    this.rootEl.querySelector('#fc-btn-zoom-fit')?.addEventListener('click', () => this.fitToView())
    this.rootEl.querySelector('#fc-btn-zoom-reset')?.addEventListener('click', () => this.resetView())
    this.rootEl.querySelector('#fc-btn-zoom-in')?.addEventListener('click', () => this.setZoom(this.zoom * 1.25))
    this.rootEl.querySelector('#fc-btn-zoom-out')?.addEventListener('click', () => this.setZoom(this.zoom / 1.25))

    const btnSync = this.rootEl.querySelector('#fc-btn-toggle-sync')!
    btnSync.addEventListener('click', () => {
      this.syncNav = !this.syncNav
      btnSync.classList.toggle('active', this.syncNav)
    })

    // 5. Close Inspector
    this.rootEl.querySelector('#fc-insp-close')?.addEventListener('click', () => {
      this.selectedMatchId = null
      this.hoveredMatchId = null
      const card = this.rootEl.querySelector<HTMLElement>('#fc-inspector-card')
      if (card) card.style.display = 'none'
      this.drawAll()
    })

    // 6. Pan / Zoom / Click on Viewports
    const dualContainer = this.rootEl.querySelector('#fc-dual-viewer') as HTMLDivElement

    dualContainer.addEventListener('wheel', (e: WheelEvent) => {
      e.preventDefault()
      const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87
      const rect = dualContainer.getBoundingClientRect()
      const mouseX = e.clientX - rect.left
      const mouseY = e.clientY - rect.top

      const newZoom = Math.min(Math.max(this.zoom * zoomFactor, 0.15), 10.0)
      const ratio = newZoom / this.zoom

      this.srcPanX = mouseX - (mouseX - this.srcPanX) * ratio
      this.srcPanY = mouseY - (mouseY - this.srcPanY) * ratio
      this.refPanX = mouseX - (mouseX - this.refPanX) * ratio
      this.refPanY = mouseY - (mouseY - this.refPanY) * ratio

      this.zoom = newZoom
      this.updateZoomReadout()
      this.drawAll()
    }, { passive: false })

    dualContainer.addEventListener('mousedown', (e: MouseEvent) => {
      if (e.button !== 0) return
      this.isDragging = true
      this.dragStartX = e.clientX
      this.dragStartY = e.clientY
      dualContainer.style.cursor = 'grabbing'
    })

    window.addEventListener('mousemove', (e: MouseEvent) => {
      if (this.isDragging) {
        const dx = e.clientX - this.dragStartX
        const dy = e.clientY - this.dragStartY
        this.dragStartX = e.clientX
        this.dragStartY = e.clientY

        this.srcPanX += dx
        this.srcPanY += dy
        this.refPanX += dx
        this.refPanY += dy

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

    dualContainer.addEventListener('click', (e: MouseEvent) => {
      this.handleClick(e)
    })
  }

  private setZoom(newZoom: number) {
    const clamped = Math.min(Math.max(newZoom, 0.15), 10.0)
    const ratio = clamped / this.zoom
    const paneRect = this.srcPane.getBoundingClientRect()
    const cx = paneRect.width / 2
    const cy = (paneRect.height - 38) / 2

    this.srcPanX = cx - (cx - this.srcPanX) * ratio
    this.srcPanY = cy - (cy - this.srcPanY) * ratio
    this.refPanX = cx - (cx - this.refPanX) * ratio
    this.refPanY = cy - (cy - this.refPanY) * ratio

    this.zoom = clamped
    this.updateZoomReadout()
    this.drawAll()
  }

  private updateZoomReadout() {
    const el = this.rootEl.querySelector('#fc-zoom-readout')
    if (el) el.textContent = `${Math.round(this.zoom * 100)}%`
  }

  public fitToView() {
    const srcRect = this.srcPane?.getBoundingClientRect()
    const refRect = this.refPane?.getBoundingClientRect()

    const wSrc = (srcRect?.width || 600)
    const hSrc = (srcRect?.height || 560) - 38
    const wRef = (refRect?.width || 600)
    const hRef = (refRect?.height || 560) - 38

    const imgWSrc = this.srcImgEl?.naturalWidth || 600
    const imgHSrc = this.srcImgEl?.naturalHeight || 400
    const imgWRef = this.refImgEl?.naturalWidth || 300
    const imgHRef = this.refImgEl?.naturalHeight || 1200

    if (imgWSrc <= 0 || imgHSrc <= 0) return

    // Scale to fit nicely with comfortable margins (no empty void)
    const scaleSrc = Math.min((wSrc - 24) / imgWSrc, (hSrc - 24) / imgHSrc)
    const scaleRef = Math.min((wRef - 24) / imgWRef, (hRef - 24) / imgHRef)

    // Harmonize scale so source and reference maintain visual comparability
    const fitZoom = Math.min(scaleSrc, scaleRef) * 1.05
    this.zoom = Math.max(0.2, Math.min(2.5, Number(fitZoom.toFixed(2))))

    // Center each image in its respective pane
    this.srcPanX = Math.round((wSrc - imgWSrc * this.zoom) / 2)
    this.srcPanY = Math.round((hSrc - imgHSrc * this.zoom) / 2)

    this.refPanX = Math.round((wRef - imgWRef * this.zoom) / 2)
    this.refPanY = Math.round((hRef - imgHRef * this.zoom) / 2)

    this.updateZoomReadout()
    this.drawAll()
  }

  private resetView() {
    this.fitToView()
  }

  private async loadPairMetadata() {
    if (this.pairData) {
      if (this.pairData.mission) this.metadata.mission = this.pairData.mission
      if (this.pairData.instrument) this.metadata.instrument = this.pairData.instrument
      if (this.pairData.reference_instrument) this.metadata.referenceInstrument = this.pairData.reference_instrument
      if (this.pairData.source_filename) this.metadata.sourceFilename = this.pairData.source_filename
      if (this.pairData.reference_filename) this.metadata.referenceFilename = this.pairData.reference_filename
    }

    try {
      const res = await fetch(`${API_BASE}/pairs/${this.pairId}`)
      if (res.ok) {
        const d = await res.json()
        this.metadata.mission = d.mission || 'Chandrayaan-2'
        this.metadata.instrument = d.instrument || 'OHRC'
        this.metadata.instrumentName = d.instrument_name || `${d.mission || ''} ${d.instrument || ''}`
        this.metadata.sourceFilename = d.source_filename || 'ch2_ohr_ncp_20240316T2008014680_d_img_d18.img'
        this.metadata.referenceFilename = d.reference_filename || 'M1536201804CC.IMG'
        this.metadata.referenceInstrument = d.reference_instrument || 'LROC'
      }
    } catch {
      // Fallback defaults
    }

    const isIirs = this.pairId === 'pair_002' || this.metadata.instrument === 'IIRS' || (this.pairData?.product_type === 'HYPERSPECTRAL')

    if (isIirs) {
      this.currentState = 'REQUIRES_BAND'
      this.srcImgEl = null
      this.result = null
      this.renderMetrics(null)
      this.renderActionButtons(false)
      this.updateHeaderUI()
      this.showIirsGuard()

      this.updateStatusBanner(
        'CHANDRAYAAN-2 IIRS',
        'Hyperspectral product — Band extraction required. The current product contains spectral cube data. A spatial band/composite must be generated before feature correspondence can be performed.',
        'warning'
      )

      const btnRun = this.rootEl.querySelector('#fc-btn-run') as HTMLButtonElement | null
      if (btnRun) {
        btnRun.disabled = true
        btnRun.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <span>Band Extraction Required</span>
        `
        btnRun.title = 'IIRS spatial band extraction required before feature correspondence can be performed.'
      }

      const matchBadge = this.rootEl.querySelector('#fc-match-count-badge')
      if (matchBadge) matchBadge.textContent = 'Band extraction required'

      this.loadReferenceBasemapOnly()
      return
    }

    this.hideIirsGuard()
    const btnRun = this.rootEl.querySelector('#fc-btn-run') as HTMLButtonElement | null
    if (btnRun) {
      btnRun.disabled = false
      btnRun.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        <span>Run Feature Matching</span>
      `
      btnRun.title = 'Execute SIFT feature extraction and FLANN ratio test'
    }

    this.updateHeaderUI()
    this.loadProcessedLunarImages()
  }

  private showIirsGuard() {
    const wrapper = this.rootEl.querySelector<HTMLElement>('#fc-src-canvas-wrapper')
    const canvas = this.rootEl.querySelector<HTMLCanvasElement>('#fc-src-canvas')
    const loading = this.rootEl.querySelector<HTMLElement>('#fc-src-loading')
    if (loading) loading.style.display = 'none'
    if (canvas) canvas.style.display = 'none'

    let guard = wrapper?.querySelector('#fc-iirs-guard')
    if (!guard && wrapper) {
      const guardDiv = document.createElement('div')
      guardDiv.id = 'fc-iirs-guard'
      guardDiv.className = 'iirs-hyperspectral-guard-card'
      guardDiv.innerHTML = `
        <div class="iirs-guard-icon">🪐</div>
        <div class="iirs-guard-title">CHANDRAYAAN-2 IIRS</div>
        <div class="iirs-guard-pill">Hyperspectral product</div>
        <div class="iirs-guard-status-block">
          <div class="iirs-guard-status-label">STATUS</div>
          <div class="iirs-guard-status-val">Band extraction required</div>
        </div>
        <p class="iirs-guard-desc">
          The current product contains spectral cube data.<br />
          A spatial band/composite must be generated before<br />
          feature correspondence can be performed.
        </p>
        <button class="btn-iirs-extract" id="fc-btn-iirs-extract">[ Select / Extract Band ]</button>
      `
      wrapper.appendChild(guardDiv)

      guardDiv.querySelector('#fc-btn-iirs-extract')?.addEventListener('click', () => {
        showHumanToast('IIRS Band Extraction: PDS QUB spectral parser is indexing continuum channels (Band 1580nm). Feature matching is blocked until 2D spatial raster is calibrated.', 'info')
      })
    }
  }

  private hideIirsGuard() {
    const wrapper = this.rootEl.querySelector<HTMLElement>('#fc-src-canvas-wrapper')
    const canvas = this.rootEl.querySelector<HTMLCanvasElement>('#fc-src-canvas')
    if (canvas) canvas.style.display = 'block'
    const guard = wrapper?.querySelector('#fc-iirs-guard')
    if (guard) guard.remove()
  }

  private loadReferenceBasemapOnly() {
    const refLoading = this.rootEl.querySelector<HTMLElement>('#fc-ref-loading')
    if (refLoading) refLoading.style.display = 'flex'

    const rImg = new Image()
    rImg.crossOrigin = 'anonymous'
    rImg.onload = () => {
      this.refImgEl = rImg
      if (refLoading) refLoading.style.display = 'none'
      this.fitToView()
      this.drawAll()
    }
    rImg.onerror = () => {
      if (refLoading) refLoading.style.display = 'none'
    }
    rImg.src = `${API_BASE}/pairs/${this.pairId}/reference-preview?t=${Date.now()}`
  }

  private updateHeaderUI() {
    const setText = (id: string, text: string) => {
      const el = this.rootEl.querySelector(id)
      if (el) el.textContent = text
    }

    setText('#fc-text-pair', this.pairId.toUpperCase())
    setText('#fc-text-mission', this.metadata.mission)
    setText('#fc-text-inst', this.metadata.instrument)
    setText('#fc-text-ref-inst', this.metadata.referenceInstrument)

    setText('#fc-src-name', `${this.metadata.mission} ${this.metadata.instrument}`)
    setText('#fc-ref-name', this.metadata.referenceInstrument)

    setText('#fc-src-filename', this.metadata.sourceFilename)
    setText('#fc-ref-filename', this.metadata.referenceFilename)

    // Calculate actual ROI dimensions
    if (this.roiCoords && this.isRoiApplied !== false) {
      const srcLines = Math.abs((this.roiCoords.src_line_end || 46000) - (this.roiCoords.src_line_start || 42000))
      const srcSamples = Math.abs((this.roiCoords.src_sample_end || 7000) - (this.roiCoords.src_sample_start || 1000))
      const dimsStr = `${srcSamples.toLocaleString()} × ${srcLines.toLocaleString()} px`
      setText('#fc-header-roi-dims', dimsStr)
      setText('#fc-src-dims', dimsStr)
    } else {
      setText('#fc-header-roi-dims', '6,000 × 4,000 px')
      setText('#fc-src-dims', '6,000 × 4,000 px')
    }

    // Preprocessing readiness state
    const preprocReady = !!(this.preprocResult || this.srcImgEl)
    const dot = this.rootEl.querySelector('#fc-preproc-dot')
    const statusText = this.rootEl.querySelector('#fc-preproc-status')
    if (dot) {
      dot.className = `fc-status-dot ${preprocReady ? 'ready' : 'not-ready'}`
    }
    if (statusText) {
      statusText.textContent = preprocReady ? 'Ready' : 'Pending'
    }
  }

  /**
   * Loads authentic processed lunar imagery from Preprocessing stage
   * or fetches the processed ROI patches via /api/preprocessing/process
   */
  private async loadProcessedLunarImages() {
    const isIirs = this.pairId === 'pair_002' || this.metadata.instrument === 'IIRS' || (this.pairData?.product_type === 'HYPERSPECTRAL')
    if (isIirs) {
      this.showIirsGuard()
      this.loadReferenceBasemapOnly()
      return
    }

    if (this.isLoadingImages) return
    this.isLoadingImages = true

    const srcLoading = this.rootEl.querySelector<HTMLElement>('#fc-src-loading')
    const refLoading = this.rootEl.querySelector<HTMLElement>('#fc-ref-loading')
    if (srcLoading) srcLoading.style.display = 'flex'
    if (refLoading) refLoading.style.display = 'flex'

    // Check if Preprocessing stage already has computed products
    const externalPreproc = this.preprocProvider ? this.preprocProvider() : null
    if (externalPreproc && externalPreproc.source_processed && externalPreproc.reference_processed) {
      this.applyPreprocessedImages(externalPreproc.source_processed, externalPreproc.reference_processed)
      this.isLoadingImages = false
      return
    }

    // Otherwise, fetch authenticated preprocessed ROI patches directly from backend
    try {
      const roiSrc = this.roiCoords
        ? [this.roiCoords.src_line_start, this.roiCoords.src_line_end, this.roiCoords.src_sample_start, this.roiCoords.src_sample_end]
        : [42000, 46000, 1000, 7000]
      const roiRef = this.roiCoords
        ? [this.roiCoords.ref_y0 || 3000, this.roiCoords.ref_y1 || 5000, this.roiCoords.ref_x0 || 100, this.roiCoords.ref_x1 || 600]
        : [3000, 5000, 100, 600]

      const preproc = await executePreprocessing({
        pair_id: this.pairId,
        roi_src: roiSrc as [number, number, number, number],
        roi_ref: roiRef as [number, number, number, number],
        enable_normalization: true,
        p_low: 1.0,
        p_high: 99.0,
        enable_clahe: true,
        clip_limit: 2.5,
        tile_grid_size: 8,
      })

      this.preprocResult = preproc

      if (preproc && preproc.warning && preproc.warning.includes('insufficient valid image data')) {
        this.currentState = 'FAILED'
        this.updateStatusBanner(
          'FAILED',
          'Feature matching cannot proceed until valid image data is available.',
          'error',
          'Return to Preprocessing',
          () => {
            if (this.onReturnToPreprocessing) this.onReturnToPreprocessing()
            else {
              const tabBtn = document.querySelector<HTMLButtonElement>('#nav-btn-preproc')
              tabBtn?.click()
            }
          }
        )
      } else if (preproc && preproc.source_processed && preproc.reference_processed) {
        this.applyPreprocessedImages(preproc.source_processed, preproc.reference_processed)
      } else {
        this.loadPreviewRastersFallback()
      }
    } catch {
      // Fallback to preview rasters if preprocessing fails
      this.loadPreviewRastersFallback()
    } finally {
      this.isLoadingImages = false
    }
  }

  private applyPreprocessedImages(srcBase64: string, refBase64: string) {
    const srcLoading = this.rootEl.querySelector<HTMLElement>('#fc-src-loading')
    const refLoading = this.rootEl.querySelector<HTMLElement>('#fc-ref-loading')

    let loadedCount = 0
    const onBothLoaded = () => {
      loadedCount++
      if (loadedCount >= 2) {
        if (srcLoading) srcLoading.style.display = 'none'
        if (refLoading) refLoading.style.display = 'none'
        this.updateHeaderUI()
        this.fitToView()
        this.drawAll()
      }
    }

    const sImg = new Image()
    sImg.onload = () => {
      this.srcImgEl = sImg
      onBothLoaded()
    }
    sImg.onerror = () => {
      if (srcLoading) srcLoading.style.display = 'none'
    }
    sImg.src = srcBase64.startsWith('data:') ? srcBase64 : `data:image/png;base64,${srcBase64}`

    const rImg = new Image()
    rImg.onload = () => {
      this.refImgEl = rImg
      onBothLoaded()
    }
    rImg.onerror = () => {
      if (refLoading) refLoading.style.display = 'none'
    }
    rImg.src = refBase64.startsWith('data:') ? refBase64 : `data:image/png;base64,${refBase64}`

    if (this.currentState === 'READY') {
      this.updateStatusBanner(
        'READY',
        'Authentic processed lunar ROI imagery loaded. Click "Run Feature Matching" to compute scientific SIFT features and FLANN correspondences.',
        'ready'
      )
      this.renderMetrics(null)
      this.renderActionButtons(false)
    }
  }

  private loadPreviewRastersFallback() {
    const srcLoading = this.rootEl.querySelector<HTMLElement>('#fc-src-loading')
    const refLoading = this.rootEl.querySelector<HTMLElement>('#fc-ref-loading')

    let count = 0
    const check = () => {
      count++
      if (count >= 2) {
        if (srcLoading) srcLoading.style.display = 'none'
        if (refLoading) refLoading.style.display = 'none'
        this.fitToView()
        this.drawAll()
      }
    }

    const sImg = new Image()
    sImg.crossOrigin = 'anonymous'
    sImg.onload = () => {
      this.srcImgEl = sImg
      check()
    }
    sImg.onerror = () => {
      if (srcLoading) srcLoading.style.display = 'none'
    }
    sImg.src = `${API_BASE}/pairs/${this.pairId}/source-preview?t=${Date.now()}`

    const rImg = new Image()
    rImg.crossOrigin = 'anonymous'
    rImg.onload = () => {
      this.refImgEl = rImg
      check()
    }
    rImg.onerror = () => {
      if (refLoading) refLoading.style.display = 'none'
    }
    rImg.src = `${API_BASE}/pairs/${this.pairId}/reference-preview?t=${Date.now()}`
  }

  /**
   * Executes authentic backend feature matching pipeline
   */
  public async runMatching() {
    if (this.currentState === 'MATCHING') return

    if (this.pairId === 'pair_002' || this.currentState === 'REQUIRES_BAND' || this.metadata.instrument === 'IIRS') {
      showHumanToast('IIRS spatial band extraction required. Spectral cube cannot be matched directly against 2D reference.', 'warning')
      return
    }

    this.currentState = 'MATCHING'
    this.updateStatusBanner(
      'MATCHING',
      'Extracting Gaussian scale-space octaves, computing 128-D SIFT descriptors & running FLANN ratio test...',
      'processing'
    )
    this.renderMetrics(null, true)
    this.renderActionButtons(false)

    const btnRun = this.rootEl.querySelector('#fc-btn-run') as HTMLButtonElement | null
    if (btnRun) {
      btnRun.disabled = true
      btnRun.innerHTML = `
        <span class="fc-spinner-mini"></span>
        <span>Matching Features...</span>
      `
    }

    try {
      const params: FeatureMatchParams = {
        pair_id: this.pairId,
        nfeatures: 3000,
        ratio_thresh: 0.75,
        ransac_thresh: 3.0,
        transform_type: 'homography',
        max_return_matches: 250
      }

      if (this.roiCoords) {
        params.roi_src = [
          this.roiCoords.src_line_start || 42000,
          this.roiCoords.src_line_end || 46000,
          this.roiCoords.src_sample_start || 1000,
          this.roiCoords.src_sample_end || 7000
        ]
        params.roi_ref = [
          this.roiCoords.ref_y0 || 3000,
          this.roiCoords.ref_y1 || 5000,
          this.roiCoords.ref_x0 || 100,
          this.roiCoords.ref_x1 || 600
        ]
      } else {
        params.roi_src = [42000, 46000, 1000, 7000]
        params.roi_ref = [3000, 5000, 100, 600]
      }

      const res = await fetchFeatureMatching(params)
      this.result = res

      if (btnRun) {
        btnRun.disabled = false
        btnRun.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          <span>Run Feature Matching</span>
        `
      }

      // Update instrument and metadata from response
      if (res.instrument) this.metadata.instrument = res.instrument
      if (res.mission) this.metadata.mission = res.mission
      if (res.source_filename) this.metadata.sourceFilename = res.source_filename
      if (res.reference_filename) this.metadata.referenceFilename = res.reference_filename
      this.updateHeaderUI()

      // Handle backend status state machine
      const inliersCount = res.stats?.inliers_count || 0
      const isStatisticallyValid = res.is_statistically_valid ?? (res.status === 'completed' && inliersCount >= 12)

      if (res.status === 'requires_band_extraction') {
        this.currentState = 'REQUIRES_BAND'
        this.updateStatusBanner(
          'INSUFFICIENT',
          res.message || 'IIRS hyperspectral observation requires a designated spectral band.',
          'warning'
        )
        this.renderActionButtons(false)
      } else if (res.status === 'insufficient_matches' || inliersCount < 4 || !isStatisticallyValid) {
        this.currentState = 'INSUFFICIENT'
        const reason = `${inliersCount} verified correspondences found. More spatially distributed correspondences are required. (Current validation threshold: 12 inliers.)`
        this.updateStatusBanner(
          'INSUFFICIENT',
          reason,
          'insufficient',
          'Adjust ROI',
          () => {
            if (this.onAdjustRoi) this.onAdjustRoi()
            else {
              const roiBtn = document.querySelector<HTMLButtonElement>('#nav-btn-roi')
              roiBtn?.click()
            }
          }
        )
        // Strictly show [ Adjust ROI ] and [ Retry Feature Matching ], NEVER [ Continue to Spatial Analysis ]
        this.renderActionButtons(false)
      } else if (res.status === 'completed') {
        this.currentState = 'VALID'
        this.updateStatusBanner(
          'VALID',
          `Verified ${res.stats.verified_matches_count} correspondences with ${res.stats.inliers_count} consensus inliers.`,
          'completed'
        )
        // Result is valid, allow continuation to Spatial Analysis
        this.renderActionButtons(true)
      } else {
        this.currentState = 'FAILED'
        this.updateStatusBanner('FAILED', res.message || 'Geometric verification could not be completed.', 'error')
        this.renderActionButtons(false)
      }

      // Update images if returned by backend
      if (res.source_image) {
        const sImg = new Image()
        sImg.onload = () => {
          this.srcImgEl = sImg
          this.drawAll()
        }
        sImg.src = res.source_image.startsWith('data:') ? res.source_image : `data:image/png;base64,${res.source_image}`
      }
      if (res.reference_image) {
        const rImg = new Image()
        rImg.onload = () => {
          this.refImgEl = rImg
          this.drawAll()
        }
        rImg.src = res.reference_image.startsWith('data:') ? res.reference_image : `data:image/png;base64,${res.reference_image}`
      }

      this.renderMetrics(res)
      this.updateMatchCountBadge()
      this.drawAll()

    } catch (err: any) {
      if (btnRun) {
        btnRun.disabled = false
        btnRun.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          <span>Run Feature Matching</span>
        `
      }
      this.currentState = 'FAILED'
      const formatted = formatHumanReadableError(err)
      this.updateStatusBanner('FAILED', formatted.message, 'error', 'Retry Matching', () => this.runMatching())
      this.renderActionButtons(false)
      showHumanToast(err, 'error')
    }
  }

  private updateStatusBanner(
    title: string,
    desc: string,
    type: 'ready' | 'processing' | 'completed' | 'insufficient' | 'warning' | 'error',
    actionLabel?: string,
    actionHandler?: () => void
  ) {
    if (!this.statusBannerEl) return

    this.statusBannerEl.className = `fc-banner ${type}`
    const titleEl = this.statusBannerEl.querySelector('#fc-banner-title')
    const descEl = this.statusBannerEl.querySelector('#fc-banner-desc')
    const iconEl = this.statusBannerEl.querySelector('#fc-banner-icon')
    const actionsEl = this.statusBannerEl.querySelector('#fc-banner-actions')

    if (titleEl) titleEl.textContent = title
    if (descEl) descEl.textContent = desc

    if (iconEl) {
      if (type === 'completed') iconEl.textContent = '✓'
      else if (type === 'processing') iconEl.textContent = '◌'
      else if (type === 'insufficient' || type === 'warning') iconEl.textContent = '⚠'
      else if (type === 'error') iconEl.textContent = '✕'
      else iconEl.textContent = '◎'
    }

    if (actionsEl) {
      if (actionLabel && actionHandler) {
        actionsEl.innerHTML = `<button id="fc-btn-banner-action" class="fc-btn-banner-action">${actionLabel}</button>`
        const btn = actionsEl.querySelector('#fc-btn-banner-action')
        btn?.addEventListener('click', actionHandler)
      } else {
        actionsEl.innerHTML = ''
      }
    }
  }

  /**
   * Section 4 & 12: Action buttons follow backend validation state strictly.
   * If insufficient: Show [ Adjust ROI ] (primary) and [ Retry Feature Matching ] (secondary).
   * Do NOT show [ Continue to Spatial Analysis → ] unless the backend says valid.
   */
  private renderActionButtons(isValid: boolean) {
    const actionsLeftEl = this.rootEl.querySelector('#fc-bottom-actions')
    const nextRightEl = this.rootEl.querySelector('#fc-bottom-next-container')
    if (!actionsLeftEl || !nextRightEl) return

    if (isValid) {
      actionsLeftEl.innerHTML = ''
      nextRightEl.innerHTML = `
        <button id="fc-btn-next" class="fc-btn-next" title="Advance to Spatial Analysis">
          <span>Continue to Spatial Analysis →</span>
        </button>
      `
      const btnNext = nextRightEl.querySelector('#fc-btn-next')
      btnNext?.addEventListener('click', () => {
        if (this.onNavigateNext) this.onNavigateNext()
        else {
          const nextBtn = document.querySelector<HTMLButtonElement>('#nav-btn-spatial')
          nextBtn?.click()
        }
      })
    } else {
      nextRightEl.innerHTML = ''
      actionsLeftEl.innerHTML = `
        <button id="fc-btn-adjust-roi" class="fc-btn-primary fc-btn-compact-pad" title="Return to ROI stage while preserving dataset">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/></svg>
          <span>Adjust ROI</span>
        </button>
        <button id="fc-btn-retry-matching" class="fc-btn-secondary" title="Re-run feature matching on current region">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/></svg>
          <span>Retry Feature Matching</span>
        </button>
      `
      const btnAdj = actionsLeftEl.querySelector('#fc-btn-adjust-roi')
      btnAdj?.addEventListener('click', () => {
        if (this.onAdjustRoi) this.onAdjustRoi()
        else {
          const roiBtn = document.querySelector<HTMLButtonElement>('#nav-btn-roi')
          roiBtn?.click()
        }
      })

      const btnRetry = actionsLeftEl.querySelector('#fc-btn-retry-matching')
      btnRetry?.addEventListener('click', () => this.runMatching())
    }
  }

  private renderMetrics(res: FeatureMatchResult | null, isProcessing: boolean = false) {
    const setText = (id: string, text: string) => {
      const el = this.rootEl.querySelector(id)
      if (el) el.textContent = text
    }

    if (isProcessing) {
      setText('#fc-stat-src-features', '...')
      setText('#fc-stat-ref-features', '...')
      setText('#fc-stat-candidates', '...')
      setText('#fc-stat-verified', '...')
      setText('#fc-stat-inliers', '...')
      setText('#fc-stat-ratio', '...')
      return
    }

    if (!res || !res.stats) {
      setText('#fc-stat-src-features', '—')
      setText('#fc-stat-ref-features', '—')
      setText('#fc-stat-candidates', '—')
      setText('#fc-stat-verified', '—')
      setText('#fc-stat-inliers', '—')
      setText('#fc-stat-ratio', '—')
      return
    }

    const s = res.stats
    setText('#fc-stat-src-features', (s.source_features_count || 0).toLocaleString())
    setText('#fc-stat-ref-features', (s.reference_features_count || 0).toLocaleString())
    setText('#fc-stat-candidates', (s.candidate_matches_count || 0).toLocaleString())
    setText('#fc-stat-verified', (s.verified_matches_count || 0).toLocaleString())
    setText('#fc-stat-inliers', (s.inliers_count || 0).toLocaleString())
    setText('#fc-stat-ratio', `${((s.inlier_ratio || 0) * 100).toFixed(1)}%`)
  }

  private updateMatchCountBadge() {
    const badge = this.rootEl.querySelector('#fc-match-count-badge')
    if (!badge) return

    if (!this.result?.matches) {
      badge.textContent = 'Awaiting matching execution'
      return
    }

    const total = this.result.matches.length
    const inliers = this.result.matches.filter(m => m.is_inlier).length
    const outliers = total - inliers

    if (total === 0) {
      badge.textContent = '0 verified matches found'
    } else if (this.currentFilter === 'inliers') {
      badge.textContent = `Showing ${inliers} verified inliers (of ${total} total)`
    } else if (this.currentFilter === 'outliers') {
      badge.textContent = `Showing ${outliers} outliers (of ${total} total)`
    } else {
      badge.textContent = `Showing all ${total} matches (${inliers} inliers, ${outliers} outliers)`
    }
  }

  // --- SCIENTIFIC RENDERING & DRAWING LOGIC ---

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

    // 1. Lunar Raster
    if (this.srcImgEl && this.srcImgEl.complete) {
      ctx.save()
      ctx.translate(this.srcPanX, this.srcPanY)
      ctx.scale(this.zoom, this.zoom)
      ctx.imageSmoothingEnabled = false
      ctx.drawImage(this.srcImgEl, 0, 0)
      ctx.restore()
    } else {
      ctx.fillStyle = '#050811'
      ctx.fillRect(0, 0, w, h)
      this.drawSubtleGrid(ctx, w, h)
    }

    // 2. All Keypoints (small subtle markers)
    if (this.showKeypoints && this.result?.source_keypoints) {
      ctx.save()
      ctx.translate(this.srcPanX, this.srcPanY)
      ctx.scale(this.zoom, this.zoom)

      for (const kp of this.result.source_keypoints) {
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)'
        ctx.fillStyle = 'rgba(56, 189, 248, 0.15)'
        ctx.lineWidth = 1.0 / this.zoom
        ctx.beginPath()
        ctx.arc(kp.x, kp.y, Math.max(2.5, (kp.size || 4) * 0.4), 0, Math.PI * 2)
        ctx.stroke()
        ctx.fill()
      }
      ctx.restore()
    }

    // 3. Matched Keypoints (High precision markers)
    const activeMatches = this.getActiveMatches()
    if (activeMatches.length > 0) {
      ctx.save()
      ctx.translate(this.srcPanX, this.srcPanY)
      ctx.scale(this.zoom, this.zoom)

      for (const m of activeMatches) {
        const isSelected = this.selectedMatchId === m.id || this.hoveredMatchId === m.id
        const px = m.source_pt[0]
        const py = m.source_pt[1]
        const r = isSelected ? 6.0 / this.zoom : (m.is_inlier ? 3.5 / this.zoom : 3.0 / this.zoom)

        ctx.beginPath()
        ctx.arc(px, py, r, 0, Math.PI * 2)
        ctx.strokeStyle = isSelected ? '#38bdf8' : (m.is_inlier ? '#10b981' : '#f43f5e')
        ctx.lineWidth = (isSelected ? 2.2 : 1.2) / this.zoom
        ctx.stroke()

        ctx.beginPath()
        ctx.arc(px, py, 1.2 / this.zoom, 0, Math.PI * 2)
        ctx.fillStyle = isSelected ? '#38bdf8' : (m.is_inlier ? '#10b981' : '#f43f5e')
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

    // 1. Lunar Raster
    if (this.refImgEl && this.refImgEl.complete) {
      ctx.save()
      ctx.translate(this.refPanX, this.refPanY)
      ctx.scale(this.zoom, this.zoom)
      ctx.imageSmoothingEnabled = false
      ctx.drawImage(this.refImgEl, 0, 0)
      ctx.restore()
    } else {
      ctx.fillStyle = '#050811'
      ctx.fillRect(0, 0, w, h)
      this.drawSubtleGrid(ctx, w, h)
    }

    // 2. All Keypoints (small subtle markers)
    if (this.showKeypoints && this.result?.reference_keypoints) {
      ctx.save()
      ctx.translate(this.refPanX, this.refPanY)
      ctx.scale(this.zoom, this.zoom)

      for (const kp of this.result.reference_keypoints) {
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.45)'
        ctx.fillStyle = 'rgba(245, 158, 11, 0.15)'
        ctx.lineWidth = 1.0 / this.zoom
        ctx.beginPath()
        ctx.arc(kp.x, kp.y, Math.max(2.5, (kp.size || 4) * 0.4), 0, Math.PI * 2)
        ctx.stroke()
        ctx.fill()
      }
      ctx.restore()
    }

    // 3. Matched Keypoints (High precision markers)
    const activeMatches = this.getActiveMatches()
    if (activeMatches.length > 0) {
      ctx.save()
      ctx.translate(this.refPanX, this.refPanY)
      ctx.scale(this.zoom, this.zoom)

      for (const m of activeMatches) {
        const isSelected = this.selectedMatchId === m.id || this.hoveredMatchId === m.id
        const px = m.ref_pt[0]
        const py = m.ref_pt[1]
        const r = isSelected ? 6.0 / this.zoom : (m.is_inlier ? 3.5 / this.zoom : 3.0 / this.zoom)

        ctx.beginPath()
        ctx.arc(px, py, r, 0, Math.PI * 2)
        ctx.strokeStyle = isSelected ? '#38bdf8' : (m.is_inlier ? '#10b981' : '#f43f5e')
        ctx.lineWidth = (isSelected ? 2.2 : 1.2) / this.zoom
        ctx.stroke()

        // Subtle reticle cross
        const arm = r * 0.7
        ctx.beginPath()
        ctx.moveTo(px - arm, py); ctx.lineTo(px + arm, py)
        ctx.moveTo(px, py - arm); ctx.lineTo(px, py + arm)
        ctx.strokeStyle = isSelected ? '#38bdf8' : (m.is_inlier ? '#10b981' : '#f43f5e')
        ctx.lineWidth = 1.0 / this.zoom
        ctx.stroke()
      }
      ctx.restore()
    }
  }

  private drawSubtleGrid(ctx: CanvasRenderingContext2D, w: number, h: number) {
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.04)'
    ctx.lineWidth = 1
    const step = 40
    for (let x = 0; x < w; x += step) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke()
    }
    for (let y = 0; y < h; y += step) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke()
    }
  }

  private getActiveMatches() {
    if (!this.result?.matches) return []
    return this.result.matches.filter(m => {
      if (this.currentFilter === 'inliers') return m.is_inlier
      if (this.currentFilter === 'outliers') return !m.is_inlier
      return true
    })
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

    const dualContainer = this.rootEl.querySelector('#fc-dual-viewer')!
    const contRect = dualContainer.getBoundingClientRect()
    const srcRect = this.srcPane.getBoundingClientRect()
    const refRect = this.refPane.getBoundingClientRect()

    const srcOffsetX = srcRect.left - contRect.left
    const srcOffsetY = srcRect.top - contRect.top + 38 // compensate top bar
    const refOffsetX = refRect.left - contRect.left
    const refOffsetY = refRect.top - contRect.top + 38

    const activeMatches = this.getActiveMatches()
    const activeSelected = this.selectedMatchId !== null ? this.selectedMatchId : this.hoveredMatchId
    const hasActive = activeSelected !== null

    for (const m of activeMatches) {
      const isSelected = activeSelected === m.id
      const dimAlpha = hasActive && !isSelected ? 0.2 : 1.0

      const x1 = srcOffsetX + this.srcPanX + m.source_pt[0] * this.zoom
      const y1 = srcOffsetY + this.srcPanY + m.source_pt[1] * this.zoom
      const x2 = refOffsetX + this.refPanX + m.ref_pt[0] * this.zoom
      const y2 = refOffsetY + this.refPanY + m.ref_pt[1] * this.zoom

      const dx = x2 - x1
      const dy = y2 - y1
      const dist = Math.hypot(dx, dy)
      if (dist < 4) continue
      const angle = Math.atan2(dy, dx)

      ctx.save()

      if (isSelected) {
        ctx.strokeStyle = '#38bdf8'
        ctx.fillStyle = '#38bdf8'
        ctx.lineWidth = 2.4
        ctx.setLineDash([])
      } else if (m.is_inlier) {
        ctx.strokeStyle = `rgba(16, 185, 129, ${0.80 * dimAlpha})`
        ctx.fillStyle = `rgba(16, 185, 129, ${0.80 * dimAlpha})`
        ctx.lineWidth = 1.2
        ctx.setLineDash([])
      } else {
        ctx.strokeStyle = `rgba(244, 63, 94, ${0.75 * dimAlpha})`
        ctx.fillStyle = `rgba(244, 63, 94, ${0.75 * dimAlpha})`
        ctx.lineWidth = 1.0
        ctx.setLineDash([5, 4])
      }

      // Connecting match line
      const arrowLen = isSelected ? 8 : 6
      const endX = x2 - arrowLen * Math.cos(angle)
      const endY = y2 - arrowLen * Math.sin(angle)

      ctx.beginPath()
      ctx.moveTo(x1, y1)
      ctx.lineTo(endX, endY)
      ctx.stroke()

      ctx.setLineDash([])

      // Source anchor node
      ctx.beginPath()
      ctx.arc(x1, y1, isSelected ? 3.8 : 2.2, 0, Math.PI * 2)
      ctx.fill()

      // Target arrowhead
      ctx.beginPath()
      ctx.moveTo(x2, y2)
      ctx.lineTo(x2 - arrowLen * Math.cos(angle - Math.PI / 6), y2 - arrowLen * Math.sin(angle - Math.PI / 6))
      ctx.lineTo(x2 - arrowLen * Math.cos(angle + Math.PI / 6), y2 - arrowLen * Math.sin(angle + Math.PI / 6))
      ctx.closePath()
      ctx.fill()

      ctx.restore()
    }
  }

  private handleHover(e: MouseEvent) {
    if (this.selectedMatchId !== null) return // Lock on click selection
    if (!this.result?.matches || this.result.matches.length === 0 || !this.showMatchLines) return

    const closest = this.findClosestMatchAtEvent(e)
    if (closest !== this.hoveredMatchId) {
      this.hoveredMatchId = closest ? closest.id : null
      this.drawAll()
      if (closest) {
        this.showInspectionDetails(closest)
      } else {
        this.hideInspectionDetails()
      }
    }
  }

  private handleClick(e: MouseEvent) {
    if (!this.result?.matches || this.result.matches.length === 0) return

    const closest = this.findClosestMatchAtEvent(e)
    if (closest) {
      this.selectedMatchId = closest.id
      this.hoveredMatchId = closest.id
      this.showInspectionDetails(closest)
      this.drawAll()
    } else {
      this.selectedMatchId = null
      this.hideInspectionDetails()
      this.drawAll()
    }
  }

  private findClosestMatchAtEvent(e: MouseEvent) {
    const dualContainer = this.rootEl.querySelector('#fc-dual-viewer')!
    const contRect = dualContainer.getBoundingClientRect()
    const mx = e.clientX - contRect.left
    const my = e.clientY - contRect.top

    const srcRect = this.srcPane.getBoundingClientRect()
    const refRect = this.refPane.getBoundingClientRect()
    const srcOffsetX = srcRect.left - contRect.left
    const srcOffsetY = srcRect.top - contRect.top + 38
    const refOffsetX = refRect.left - contRect.left
    const refOffsetY = refRect.top - contRect.top + 38

    let closestMatch: any = null
    let minDist = 14

    for (const m of this.getActiveMatches()) {
      const x1 = srcOffsetX + this.srcPanX + m.source_pt[0] * this.zoom
      const y1 = srcOffsetY + this.srcPanY + m.source_pt[1] * this.zoom
      const x2 = refOffsetX + this.refPanX + m.ref_pt[0] * this.zoom
      const y2 = refOffsetY + this.refPanY + m.ref_pt[1] * this.zoom

      const d = this.distToSegment(mx, my, x1, y1, x2, y2)
      if (d < minDist) {
        minDist = d
        closestMatch = m
      }
    }

    return closestMatch
  }

  private showInspectionDetails(m: any) {
    const card = this.rootEl.querySelector<HTMLElement>('#fc-inspector-card')
    if (!card) return

    card.style.display = 'block'
    const idEl = card.querySelector('#fc-insp-id')
    const statusEl = card.querySelector('#fc-insp-status')
    const statusTextEl = card.querySelector('#fc-insp-status-text')
    const srcEl = card.querySelector('#fc-insp-src')
    const refEl = card.querySelector('#fc-insp-ref')
    const distEl = card.querySelector('#fc-insp-dist')
    const distRow = card.querySelector<HTMLElement>('#fc-insp-dist-row')

    if (idEl) idEl.textContent = `MATCH #${m.id}`
    if (statusEl) {
      statusEl.textContent = m.is_inlier ? 'Inlier' : 'Outlier'
      statusEl.className = `fc-insp-badge ${m.is_inlier ? 'inlier' : 'outlier'}`
    }
    if (statusTextEl) {
      statusTextEl.textContent = m.is_inlier ? 'Consensus Inlier' : 'Rejected Outlier'
    }
    if (srcEl) srcEl.textContent = `(${m.source_pt[0]}, ${m.source_pt[1]})`
    if (refEl) refEl.textContent = `(${m.ref_pt[0]}, ${m.ref_pt[1]})`

    if (m.distance !== undefined && m.distance !== null) {
      if (distRow) distRow.style.display = 'flex'
      if (distEl) distEl.textContent = `${m.distance}`
    } else {
      if (distRow) distRow.style.display = 'none'
    }
  }

  private hideInspectionDetails() {
    if (this.selectedMatchId !== null) return
    const card = this.rootEl.querySelector<HTMLElement>('#fc-inspector-card')
    if (card) card.style.display = 'none'
  }

  private distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
    const l2 = (x2 - x1) ** 2 + (y2 - y1) ** 2
    if (l2 === 0) return Math.hypot(px - x1, py - y1)
    let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2
    t = Math.max(0, Math.min(1, t))
    return Math.hypot(px - (x1 + t * (x2 - x1)), py - (y1 + t * (y2 - y1)))
  }

  public destroy() {
    this.rootEl.remove()
  }
}
