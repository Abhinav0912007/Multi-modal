import type { RoiCoordinates, RoiShapeMode, PairItem } from '../types'
import { API_BASE, fetchRoiPreview } from '../api'
import { showHumanToast } from '../services/errorHandler'

interface PolygonPoint {
  x: number
  y: number
}

export class RoiExplorer {
  private container: HTMLElement
  private activePairId: string = 'pair_001'
  private pairData: PairItem | null = null
  private onApplyCallback: (coords: RoiCoordinates) => void
  private onNavigateNext?: () => void

  // Coordinates state
  // Coordinates state (calibrated for authentic lunar surface craters)
  private currentCoords: RoiCoordinates = {
    src_line_start: 42000,
    src_sample_start: 1000,
    src_line_end: 46000,
    src_sample_end: 7000,
    ref_x0: 100,
    ref_y0: 3000,
    ref_x1: 600,
    ref_y1: 5000,
  }

  private shapeMode: RoiShapeMode = 'rectangle'
  private isApplied: boolean = false

  // Canvas elements
  private srcCanvas!: HTMLCanvasElement
  private srcCtx!: CanvasRenderingContext2D
  private srcViewport!: HTMLElement

  private refCanvas!: HTMLCanvasElement
  private refCtx!: CanvasRenderingContext2D
  private refViewport!: HTMLElement

  // Images
  private srcImg: HTMLImageElement | null = null
  private refImg: HTMLImageElement | null = null

  // Dynamic Source Raster Dimensions (OHRC: 12000 samples x 50537 lines)
  private srcNativeW: number = 12000
  private srcNativeH: number = 50537
  private srcZoom: number = 0.05
  private srcPanX: number = 0
  private srcPanY: number = 0
  private isSrcPanning: boolean = false
  private srcPanStartX: number = 0
  private srcPanStartY: number = 0

  // Dynamic Reference Raster Dimensions (LROC WAC: 704 samples x 7420 lines)
  private refNativeW: number = 704
  private refNativeH: number = 7420
  private refZoom: number = 0.1
  private refPanX: number = 0
  private refPanY: number = 0
  private isRefPanning: boolean = false
  private refPanStartX: number = 0
  private refPanStartY: number = 0

  // Dragging & Resizing ROI on Source Canvas
  private isDraggingRoi: boolean = false
  private isResizingRoi: boolean = false
  private activeHandle: string | null = null
  private dragStartX: number = 0
  private dragStartY: number = 0
  private initialRoiSnapshot: RoiCoordinates | null = null

  // Polygon ROI points (in source space)
  private polygonPoints: PolygonPoint[] = []
  private activePolygonPointIdx: number | null = null

  // Offscreen sampler for dynamic valid illumination estimation
  private sampleCanvas: HTMLCanvasElement | null = null
  private sampleCtx: CanvasRenderingContext2D | null = null

  // Animation frame loop
  private animFrameId: number | null = null
  private resizeObserver: ResizeObserver | null = null

  constructor(
    parent: HTMLElement,
    initialPairId: string = 'pair_001',
    onApply: (coords: RoiCoordinates) => void,
    onNavigateNext?: () => void,
    initialPair?: PairItem | null
  ) {
    this.container = document.createElement('div')
    this.container.className = 'roi-explorer-workspace'
    parent.appendChild(this.container)

    this.activePairId = initialPairId
    this.pairData = initialPair || null
    this.onApplyCallback = onApply
    this.onNavigateNext = onNavigateNext

    this.updateDimensionsFromPair()
    this.initPolygonFromCoords()
    this.renderLayout()
    this.initCanvases()
    this.attachDomEvents()
    this.loadPairImages()

    // Start 60fps render loop
    this.startLoop()

    setTimeout(() => {
      this.fitSourceView()
      this.fitReferenceView()
    }, 80)
  }

  private updateDimensionsFromPair() {
    if (this.pairData?.source_dimensions) {
      this.srcNativeW = this.pairData.source_dimensions.samples || 12000
      this.srcNativeH = this.pairData.source_dimensions.lines || 50537
    } else if (this.activePairId === 'pair_001') {
      this.srcNativeW = 12000
      this.srcNativeH = 50537
    } else if (this.activePairId === 'pair_002') {
      this.srcNativeW = 1104
      this.srcNativeH = 4000
    } else {
      this.srcNativeW = 4000
      this.srcNativeH = 50537
    }

    if (this.pairData?.reference_dimensions) {
      this.refNativeW = this.pairData.reference_dimensions.samples || 704
      this.refNativeH = this.pairData.reference_dimensions.lines || 7420
    } else {
      this.refNativeW = 704
      this.refNativeH = 7420
    }

    if (this.pairData?.nominal_roi) {
      this.currentCoords = { ...this.pairData.nominal_roi }
    } else if (this.activePairId === 'pair_001') {
      this.currentCoords = {
        src_sample_start: 1000,
        src_sample_end: 7000,
        src_line_start: 42000,
        src_line_end: 46000,
        ref_x0: 100,
        ref_y0: 3000,
        ref_x1: 600,
        ref_y1: 5000,
      }
    }
  }

  public getActivePairId(): string {
    return this.activePairId
  }

  public setActivePair(pairId: string, pairData?: PairItem | null, forceReset: boolean = false) {
    const isNewPair = pairId !== this.activePairId
    this.activePairId = pairId
    if (pairData !== undefined) {
      this.pairData = pairData
    }
    if (isNewPair || forceReset) {
      this.isApplied = false
      this.updateDimensionsFromPair()
      this.initPolygonFromCoords()
      this.loadPairImages()
      setTimeout(() => {
        this.fitSourceView()
        this.fitReferenceView()
      }, 60)
    }
    this.updateHeaderMeta()
    this.updateInputFields()
    this.updateSummary()
  }

  public setPairData(pairData: PairItem | null) {
    this.pairData = pairData
    this.updateDimensionsFromPair()
    this.updateHeaderMeta()
    this.updateInputFields()
    this.updateSummary()
  }

  public onTabActive() {
    setTimeout(() => {
      this.resizeCanvases()
      // Only fit viewports if uninitialized
      if (this.srcZoom <= 0.02) {
        this.fitSourceView()
        this.fitReferenceView()
      }
    }, 60)
  }

  public onTabInactive() {
    // Can pause or keep ready
  }

  public getCoordinates(): RoiCoordinates {
    return { ...this.currentCoords }
  }

  public setCoordinates(coords: RoiCoordinates) {
    this.currentCoords = { ...coords }
    this.initPolygonFromCoords()
    this.updateInputFields()
    this.updateSummary()
  }

  public destroy() {
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId)
      this.animFrameId = null
    }
    if (this.resizeObserver) {
      this.resizeObserver.disconnect()
      this.resizeObserver = null
    }
  }

  public getIsApplied(): boolean {
    return this.isApplied
  }

  // --- Image Loading ---
  private loadPairImages() {
    const srcOverlay = this.container.querySelector<HTMLElement>('#src-loading-overlay')
    const refOverlay = this.container.querySelector<HTMLElement>('#ref-loading-overlay')
    if (srcOverlay) srcOverlay.style.display = 'flex'
    if (refOverlay) refOverlay.style.display = 'flex'

    const isIirs = this.activePairId === 'pair_002' || this.pairData?.instrument === 'IIRS' || (this.pairData?.product_type === 'HYPERSPECTRAL')

    if (isIirs) {
      if (srcOverlay) srcOverlay.style.display = 'none'
      this.srcImg = null
      this.showIirsGuard()

      const ref = new Image()
      ref.crossOrigin = 'anonymous'
      ref.onload = () => {
        this.refImg = ref
        if (refOverlay) refOverlay.style.display = 'none'
        this.fitReferenceView()
      }
      ref.onerror = () => {
        if (refOverlay) refOverlay.style.display = 'none'
      }
      ref.src = `${API_BASE}/pairs/${this.activePairId}/reference-preview?t=${Date.now()}`
      return
    }

    this.hideIirsGuard()

    const src = new Image()
    src.crossOrigin = 'anonymous'
    src.onload = () => {
      this.srcImg = src
      if (srcOverlay) srcOverlay.style.display = 'none'
      this.fitSourceView()
    }
    src.onerror = () => {
      if (srcOverlay) srcOverlay.style.display = 'none'
    }
    src.src = `${API_BASE}/pairs/${this.activePairId}/source-preview?t=${Date.now()}`

    const ref = new Image()
    ref.crossOrigin = 'anonymous'
    ref.onload = () => {
      this.refImg = ref
      if (refOverlay) refOverlay.style.display = 'none'
      this.fitReferenceView()
    }
    ref.onerror = () => {
      if (refOverlay) refOverlay.style.display = 'none'
    }
    ref.src = `${API_BASE}/pairs/${this.activePairId}/reference-preview?t=${Date.now()}`
  }

  private showIirsGuard() {
    const viewport = this.container.querySelector<HTMLElement>('#source-canvas-viewport')
    const canvas = this.container.querySelector<HTMLCanvasElement>('#source-viewer-canvas')
    const hint = viewport?.querySelector('.canvas-hint-overlay') as HTMLElement | null
    if (canvas) canvas.style.display = 'none'
    if (hint) hint.style.display = 'none'

    let guard = viewport?.querySelector('#roi-iirs-guard')
    if (!guard && viewport) {
      const guardDiv = document.createElement('div')
      guardDiv.id = 'roi-iirs-guard'
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
        <button class="btn-iirs-extract" id="roi-btn-iirs-extract">[ Select / Extract Band ]</button>
      `
      viewport.appendChild(guardDiv)

      guardDiv.querySelector('#roi-btn-iirs-extract')?.addEventListener('click', () => {
        showHumanToast('IIRS Band Extraction: PDS QUB spectral parser is indexing continuum channels (Band 1580nm). Feature matching is blocked until 2D spatial raster is calibrated.', 'info')
      })
    }
  }

  private hideIirsGuard() {
    const viewport = this.container.querySelector<HTMLElement>('#source-canvas-viewport')
    const canvas = this.container.querySelector<HTMLCanvasElement>('#source-viewer-canvas')
    const hint = viewport?.querySelector('.canvas-hint-overlay') as HTMLElement | null
    if (canvas) canvas.style.display = 'block'
    if (hint) hint.style.display = 'flex'
    const guard = viewport?.querySelector('#roi-iirs-guard')
    if (guard) guard.remove()
  }

  // --- Dynamic Metadata Formatting ---
  private getMetadataStrings() {
    const p = this.pairData
    const pairIdUpper = this.activePairId.toUpperCase()

    let mission = p?.mission
    let instrument = p?.instrument
    let refInstrument = p?.reference_instrument || 'LROC NAC'
    let srcFile = p?.source_filename || (p?.source_files && p.source_files[0]) || ''
    let refFile = p?.reference_filename || (p?.reference_files && p.reference_files[0]) || 'M1536201804CC.IMG'

    if (!mission || !instrument) {
      if (this.activePairId === 'pair_001') {
        mission = 'Chandrayaan-2'
        instrument = 'OHRC'
        srcFile = srcFile || 'ch2_ohr_ncp_20240316T2008014680_d_img_d18.img'
      } else if (this.activePairId === 'pair_002') {
        mission = 'Chandrayaan-2'
        instrument = 'IIRS'
        srcFile = srcFile || 'ch2_iirs_calibrated_band1580.img'
      } else if (this.activePairId === 'pair_003') {
        mission = 'Chandrayaan-1'
        instrument = 'TMC'
        srcFile = srcFile || 'ch1_tmc_orbit_1234_cal.img'
      } else {
        mission = 'Chandrayaan-2'
        instrument = 'OHRC'
      }
    }

    return {
      pairIdUpper,
      mission,
      instrument,
      refInstrument,
      srcFile,
      refFile,
    }
  }

  private updateHeaderMeta() {
    const meta = this.getMetadataStrings()

    const metaPair = this.container.querySelector('#roi-meta-pair')
    if (metaPair) {
      metaPair.textContent = `${meta.pairIdUpper} · ${meta.mission} · ${meta.instrument}`
    }

    const metaRef = this.container.querySelector('#roi-meta-ref')
    if (metaRef) {
      metaRef.textContent = `Reference · ${meta.refInstrument}`
    }

    const srcTitle = this.container.querySelector('#source-panel-title')
    if (srcTitle) {
      srcTitle.textContent = `${meta.mission} ${meta.instrument}`
    }

    const srcFilename = this.container.querySelector('#source-panel-filename')
    if (srcFilename) {
      srcFilename.textContent = meta.srcFile
    }

    const srcDims = this.container.querySelector('#source-panel-dims')
    if (srcDims) {
      srcDims.textContent = `${this.srcNativeW.toLocaleString()} × ${this.srcNativeH.toLocaleString()} px`
    }

    const refTitle = this.container.querySelector('#reference-panel-title')
    if (refTitle) {
      refTitle.textContent = `${meta.refInstrument} Basemap`
    }

    const refFilename = this.container.querySelector('#reference-panel-filename')
    if (refFilename) {
      refFilename.textContent = meta.refFile
    }

    const refDims = this.container.querySelector('#reference-panel-dims')
    if (refDims) {
      refDims.textContent = `${this.refNativeW.toLocaleString()} × ${this.refNativeH.toLocaleString()} px`
    }

    const sumSrc = this.container.querySelector('#sum-src-name')
    if (sumSrc) sumSrc.textContent = `${meta.instrument}`

    const sumRef = this.container.querySelector('#sum-ref-name')
    if (sumRef) sumRef.textContent = `${meta.refInstrument}`

    // Status pill and button updates based on instrument type
    const isIirs = this.activePairId === 'pair_002' || meta.instrument === 'IIRS' || (this.pairData?.product_type === 'HYPERSPECTRAL')
    const statusPill = this.container.querySelector('#roi-status-pill')
    const statusBadge = this.container.querySelector('#roi-status-badge')
    const srcStatusTag = this.container.querySelector('#source-status-tag') as HTMLElement | null
    const refStatusTag = this.container.querySelector('#reference-status-tag') as HTMLElement | null
    const btnApply = this.container.querySelector<HTMLButtonElement>('#btn-apply-roi')
    const btnNextHeader = this.container.querySelector<HTMLButtonElement>('#btn-roi-next-stage-header')
    const btnNextSummary = this.container.querySelector<HTMLButtonElement>('#btn-roi-next-stage')

    if (isIirs) {
      if (statusPill) statusPill.className = 'roi-status-pill warning'
      if (statusBadge) statusBadge.textContent = 'Band extraction required'
      if (srcStatusTag) {
        srcStatusTag.textContent = 'HYPERSPECTRAL CUBE'
        srcStatusTag.style.color = '#f59e0b'
        srcStatusTag.style.background = 'rgba(245, 158, 11, 0.15)'
      }
      if (refStatusTag) {
        refStatusTag.textContent = 'Overlap: NOT YET VERIFIED'
        refStatusTag.style.color = '#f59e0b'
        refStatusTag.style.background = 'rgba(245, 158, 11, 0.15)'
      }
      if (btnApply) {
        btnApply.disabled = true
        btnApply.title = 'IIRS spatial band extraction required before ROI can be applied'
      }
      if (btnNextHeader) btnNextHeader.style.display = 'none'
      if (btnNextSummary) btnNextSummary.style.display = 'none'
    } else {
      if (statusPill && !this.isApplied) {
        statusPill.className = 'roi-status-pill'
        if (statusBadge) statusBadge.textContent = 'Ready to apply'
      }
      if (srcStatusTag) {
        srcStatusTag.textContent = 'Preview validated'
        srcStatusTag.style.color = '#10b981'
        srcStatusTag.style.background = 'rgba(16,185,129,0.12)'
      }
      if (refStatusTag) {
        refStatusTag.textContent = 'Preview validated'
        refStatusTag.style.color = '#10b981'
        refStatusTag.style.background = 'rgba(16,185,129,0.12)'
      }
      if (btnApply) {
        btnApply.disabled = false
        btnApply.title = 'Apply and lock active ROI coordinates'
      }
    }
  }

  // --- Layout Render ---
  private renderLayout() {
    const meta = this.getMetadataStrings()

    this.container.innerHTML = `
      <!-- 1. CLEAN SCIENTIFIC PAGE HEADER -->
      <div class="roi-page-header glass-panel">
        <div class="roi-header-info">
          <div class="roi-header-title-row">
            <h1 class="roi-title">ROI SELECTION</h1>
            <span class="roi-status-pill" id="roi-status-pill">
              <span class="pulse-dot"></span>
              <span id="roi-status-badge">Ready to apply</span>
            </span>
          </div>
          <p class="roi-subtitle">
            Define the image region that will be used for feature correspondence and registration.
          </p>
          <div class="roi-meta-breadcrumbs">
            <span class="meta-item primary" id="roi-meta-pair">${meta.pairIdUpper} · ${meta.mission} · ${meta.instrument}</span>
            <span class="meta-sep">•</span>
            <span class="meta-item" id="roi-meta-ref">Reference · ${meta.refInstrument}</span>
            <span class="meta-sep">•</span>
            <span class="meta-item helper">Select the region to be processed in the next stages.</span>
          </div>
        </div>

        <div class="roi-header-cta-wrap">
          <button id="btn-roi-next-stage-header" class="btn-primary-space" style="display:none;" aria-label="Continue to next processing stage">
            <span>CONTINUE TO PREPROCESSING &rarr;</span>
          </button>
        </div>
      </div>

      <!-- 2. SIDE-BY-SIDE DUAL SCIENTIFIC VIEWERS -->
      <div class="roi-dual-viewers-grid">
        <!-- LEFT: SOURCE IMAGE PANEL -->
        <div class="roi-viewer-panel glass-panel" id="roi-source-panel">
          <div class="panel-header">
            <div class="panel-header-left">
              <span class="panel-role-badge source">SOURCE</span>
              <span class="panel-title" id="source-panel-title">${meta.mission} ${meta.instrument}</span>
              <span class="panel-filename font-mono" id="source-panel-filename" title="${meta.srcFile}">${meta.srcFile}</span>
              <span class="font-mono text-cyan" id="source-panel-dims" style="font-size:11px; opacity:0.85;">${this.srcNativeW.toLocaleString()} × ${this.srcNativeH.toLocaleString()} px</span>
              <span id="source-status-tag" style="font-size:10px; color:#10b981; background:rgba(16,185,129,0.12); padding:2px 7px; border-radius:4px; font-weight:600;">Preview validated</span>
            </div>
            <div class="panel-controls-group">
              <button type="button" class="btn-tool" id="btn-src-zoom-out" title="Zoom Out (−)" aria-label="Zoom Out">−</button>
              <button type="button" class="btn-tool" id="btn-src-zoom-in" title="Zoom In (+)" aria-label="Zoom In">+</button>
              <button type="button" class="btn-tool" id="btn-src-fit" title="Fit Entire Swath to Screen" aria-label="Fit View">Fit</button>
              <button type="button" class="btn-tool" id="btn-src-reset" title="Reset View" aria-label="Reset View">Reset</button>
              <button type="button" class="btn-tool" id="btn-src-fullscreen" title="Toggle Expanded View" aria-label="Fullscreen">⛶</button>
            </div>
          </div>

          <div class="canvas-viewport" id="source-canvas-viewport">
            <canvas id="source-viewer-canvas"></canvas>
            <div class="canvas-hint-overlay">
              <span>Drag ROI to reposition • Drag 8 corner/edge handles to resize</span>
            </div>
            <div class="canvas-loading-overlay" id="src-loading-overlay" style="display:none;">
              <span class="spinner-inline"></span>
              <span>Loading source raster...</span>
            </div>
          </div>
        </div>

        <!-- RIGHT: REFERENCE IMAGE PANEL -->
        <div class="roi-viewer-panel glass-panel" id="roi-reference-panel">
          <div class="panel-header">
            <div class="panel-header-left">
              <span class="panel-role-badge reference">REFERENCE</span>
              <span class="panel-title" id="reference-panel-title">${meta.refInstrument} Basemap</span>
              <span class="panel-filename font-mono" id="reference-panel-filename" title="${meta.refFile}">${meta.refFile}</span>
              <span class="font-mono text-amber" id="reference-panel-dims" style="font-size:11px; opacity:0.85;">${this.refNativeW.toLocaleString()} × ${this.refNativeH.toLocaleString()} px</span>
              <span id="reference-status-tag" style="font-size:10px; color:#10b981; background:rgba(16,185,129,0.12); padding:2px 7px; border-radius:4px; font-weight:600;">Preview validated</span>
            </div>
            <div class="panel-controls-group">
              <button type="button" class="btn-tool" id="btn-ref-zoom-out" title="Zoom Out (−)" aria-label="Zoom Out">−</button>
              <button type="button" class="btn-tool" id="btn-ref-zoom-in" title="Zoom In (+)" aria-label="Zoom In">+</button>
              <button type="button" class="btn-tool" id="btn-ref-fit" title="Fit Reference Scene" aria-label="Fit View">Fit</button>
              <button type="button" class="btn-tool" id="btn-ref-reset" title="Reset View" aria-label="Reset View">Reset</button>
            </div>
          </div>

          <div class="canvas-viewport" id="reference-canvas-viewport">
            <canvas id="reference-viewer-canvas"></canvas>
            <div class="canvas-hint-overlay">
              <span id="ref-hint-text">Candidate reference region</span>
            </div>
            <div class="canvas-loading-overlay" id="ref-loading-overlay" style="display:none;">
              <span class="spinner-inline"></span>
              <span>Loading reference basemap...</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 3. BOTTOM WORKSPACE: ROI CONTROLS + SELECTION SUMMARY -->
      <div class="roi-bottom-layout-grid">
        <!-- ROI CONTROLS (LEFT/CENTER) -->
        <div class="roi-controls-card glass-panel">
          <div class="card-header-clean">
            <span class="card-eyebrow">ROI CONFIGURATION</span>
            <h2 class="card-title">Region Selection Controls</h2>
          </div>

          <div class="controls-content-flow">
            <!-- Mode Toggle: Bounding Box / Polygon -->
            <div class="ctrl-mode-row">
              <span class="ctrl-subhead">Selection Geometry:</span>
              <div class="shape-toggle-pill-group" role="radiogroup" aria-label="ROI Geometry Mode">
                <button type="button" id="btn-mode-bbox" class="btn-shape-pill active" role="radio" aria-checked="true">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>
                  Bounding Box
                </button>
                <button type="button" id="btn-mode-poly" class="btn-shape-pill" role="radio" aria-checked="false">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5 12 2"/></svg>
                  Polygon ROI
                </button>
              </div>
            </div>

            <!-- Source Coordinates Grid (Line & Sample) -->
            <div class="coords-inputs-grid">
              <div class="coord-field">
                <label for="input-src-line-start">Line Start (L0)</label>
                <div class="coord-input-wrap">
                  <input type="number" id="input-src-line-start" value="${this.currentCoords.src_line_start}" min="0" max="${this.srcNativeH}" step="100" />
                  <span class="coord-unit font-mono">px</span>
                </div>
              </div>
              <div class="coord-field">
                <label for="input-src-sample-start">Sample Start (S0)</label>
                <div class="coord-input-wrap">
                  <input type="number" id="input-src-sample-start" value="${this.currentCoords.src_sample_start}" min="0" max="${this.srcNativeW}" step="100" />
                  <span class="coord-unit font-mono">px</span>
                </div>
              </div>
              <div class="coord-field">
                <label for="input-src-line-end">Line End (L1)</label>
                <div class="coord-input-wrap">
                  <input type="number" id="input-src-line-end" value="${this.currentCoords.src_line_end}" min="100" max="${this.srcNativeH}" step="100" />
                  <span class="coord-unit font-mono">px</span>
                </div>
              </div>
              <div class="coord-field">
                <label for="input-src-sample-end">Sample End (S1)</label>
                <div class="coord-input-wrap">
                  <input type="number" id="input-src-sample-end" value="${this.currentCoords.src_sample_end}" min="100" max="${this.srcNativeW}" step="100" />
                  <span class="coord-unit font-mono">px</span>
                </div>
              </div>
            </div>


            <!-- Quick Nudge Buttons -->
            <div class="nudge-bar-row">
              <span class="nudge-label">Quick Nudge:</span>
              <button type="button" class="btn-nudge" data-dim="line" data-delta="-500">−500L</button>
              <button type="button" class="btn-nudge" data-dim="line" data-delta="-100">−100L</button>
              <button type="button" class="btn-nudge" data-dim="line" data-delta="100">+100L</button>
              <button type="button" class="btn-nudge" data-dim="line" data-delta="500">+500L</button>
              <span class="nudge-sep">|</span>
              <button type="button" class="btn-nudge" data-dim="sample" data-delta="-200">−200S</button>
              <button type="button" class="btn-nudge" data-dim="sample" data-delta="200">+200S</button>
            </div>

            <!-- Advanced Reference Coordinates (Collapsible) -->
            <details class="advanced-coords-details">
              <summary class="advanced-coords-summary">Advanced coordinates ▾</summary>
              <div class="coords-inputs-grid" style="margin-top:10px;">
                <div class="coord-field">
                  <label for="input-ref-x0">Reference X0 (Col)</label>
                  <div class="coord-input-wrap">
                    <input type="number" id="input-ref-x0" value="${this.currentCoords.ref_x0}" min="0" max="100000" step="500" />
                    <span class="coord-unit font-mono">px</span>
                  </div>
                </div>
                <div class="coord-field">
                  <label for="input-ref-y0">Reference Y0 (Row)</label>
                  <div class="coord-input-wrap">
                    <input type="number" id="input-ref-y0" value="${this.currentCoords.ref_y0}" min="0" max="75000" step="500" />
                    <span class="coord-unit font-mono">px</span>
                  </div>
                </div>
                <div class="coord-field">
                  <label for="input-ref-x1">Reference X1 (Col)</label>
                  <div class="coord-input-wrap">
                    <input type="number" id="input-ref-x1" value="${this.currentCoords.ref_x1}" min="500" max="100000" step="500" />
                    <span class="coord-unit font-mono">px</span>
                  </div>
                </div>
                <div class="coord-field">
                  <label for="input-ref-y1">Reference Y1 (Row)</label>
                  <div class="coord-input-wrap">
                    <input type="number" id="input-ref-y1" value="${this.currentCoords.ref_y1}" min="500" max="75000" step="500" />
                    <span class="coord-unit font-mono">px</span>
                  </div>
                </div>
              </div>
            </details>

            <!-- Bottom Action Row -->
            <div class="roi-actions-row">
              <button type="button" id="btn-roi-reset" class="btn-ghost-space" title="Reset to nominal coordinates">
                Reset
              </button>
              <button type="button" id="btn-roi-preview" class="btn-ghost-space" title="Preview extracted sub-scene crop">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                Preview ROI
              </button>
              <button type="button" id="btn-roi-apply" class="btn-primary-space" title="Apply region and update registration pipeline">
                <span>APPLY ROI &rarr;</span>
              </button>
            </div>
          </div>
        </div>

        <!-- ROI SUMMARY (RIGHT) -->
        <div class="roi-summary-card glass-panel">
          <div class="card-header-clean">
            <span class="card-eyebrow">SELECTION SUMMARY</span>
            <h2 class="card-title">ROI Summary</h2>
          </div>

          <div class="summary-metrics-grid" style="grid-template-columns: 1fr;">
            <div class="summary-metric-cell">
              <span class="sm-label">ROI SIZE</span>
              <span class="sm-value font-mono" id="sum-val-size">6,000 × 4,000 px</span>
            </div>
            <div class="summary-metric-cell">
              <span class="sm-label">SOURCE COORDINATES</span>
              <div class="coords-compact-view font-mono">
                <div><span class="coord-tag">X:</span> <span id="sum-val-x">1,000 → 7,000</span></div>
                <div><span class="coord-tag">Y:</span> <span id="sum-val-y">42,000 → 46,000</span></div>
              </div>
            </div>
            <div class="summary-metric-cell">
              <span class="sm-label">VALID PIXELS</span>
              <span class="sm-value font-mono text-cyan" id="sum-val-valid">94%</span>
            </div>
          </div>

          <!-- Subtle warning when ROI has limited data -->
          <div id="roi-low-data-warning" class="roi-data-warning" style="display:none;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            <span>Selected region contains limited valid image data.</span>
          </div>

          <div class="summary-sources-box" style="margin-top:12px;">
            <div class="src-line status">
              <span class="k">STATUS:</span>
              <span class="v font-mono text-cyan" id="sum-status-text">Ready to apply</span>
            </div>
          </div>

          <div class="summary-footer-next" style="margin-top:14px;">
            <button type="button" id="btn-continue-preprocessing" class="btn-primary-space" style="width:100%; justify-content:center; padding:12px 18px;" disabled>
              <span>CONTINUE TO PREPROCESSING &rarr;</span>
            </button>
          </div>
        </div>
      </div>

      <!-- 4. CLEAN ROI PREVIEW MODAL DIALOG -->
      <div id="roi-preview-modal-backdrop" class="about-modal-backdrop" style="display:none;" role="dialog" aria-modal="true" aria-labelledby="preview-modal-title">
        <div class="about-modal-card" style="max-width:760px;">
          <div class="about-modal-header">
            <div style="display:flex; align-items:center; gap:8px;">
              <span class="pulse-dot"></span>
              <h3 id="preview-modal-title" style="font-family:var(--font-heading); font-size:16px; font-weight:700; color:#fff; margin:0;">
                ROI PREVIEW &bull; SUB-SCENE CROPS
              </h3>
            </div>
            <button id="preview-modal-close" class="about-modal-close-btn" aria-label="Close dialog">&times;</button>
          </div>

          <div class="preview-modal-body" style="display:flex; flex-direction:column; gap:16px;">
            <p style="font-size:13px; color:#94a3b8; margin:0;">
              High-contrast extracted lunar sub-scenes for downstream radiometric normalization and SIFT keypoint detection.
            </p>
            <div class="preview-crops-grid" style="display:grid; grid-template-columns:1fr 1fr; gap:14px;">
              <div class="crop-box" style="display:flex; flex-direction:column; gap:8px;">
                <span class="font-mono text-cyan" style="font-size:11px; font-weight:600;" id="modal-crop-src-label">SOURCE ROI PREVIEW</span>
                <div class="crop-canvas-wrap" style="background:#020308; border:1px solid rgba(255,255,255,0.08); border-radius:8px; overflow:hidden; aspect-ratio:4/3; display:flex; align-items:center; justify-content:center;">
                  <canvas id="modal-crop-src-canvas" width="340" height="255" style="width:100%; height:100%; object-fit:contain;"></canvas>
                </div>
              </div>
              <div class="crop-box" style="display:flex; flex-direction:column; gap:8px;">
                <span class="font-mono" style="font-size:11px; font-weight:600; color:#f59e0b;" id="modal-crop-ref-label">CANDIDATE REFERENCE PREVIEW</span>
                <div class="crop-canvas-wrap" style="background:#020308; border:1px solid rgba(255,255,255,0.08); border-radius:8px; overflow:hidden; aspect-ratio:4/3; display:flex; align-items:center; justify-content:center;">
                  <canvas id="modal-crop-ref-canvas" width="340" height="255" style="width:100%; height:100%; object-fit:contain;"></canvas>
                </div>
              </div>
            </div>
          </div>

          <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:8px;">
            <button id="preview-modal-back" class="btn-ghost-space" style="padding:8px 18px; font-size:12px;">Back to Selection</button>
            <button id="preview-modal-apply" class="btn-primary-space" style="padding:8px 20px; font-size:12px;">Apply ROI &rarr;</button>
          </div>
        </div>
      </div>
    `
  }

  // --- Initialize Canvases ---
  private initCanvases() {
    this.srcCanvas = this.container.querySelector<HTMLCanvasElement>('#source-viewer-canvas')!
    this.srcCtx = this.srcCanvas.getContext('2d')!
    this.srcViewport = this.container.querySelector<HTMLElement>('#source-canvas-viewport')!

    this.refCanvas = this.container.querySelector<HTMLCanvasElement>('#reference-viewer-canvas')!
    this.refCtx = this.refCanvas.getContext('2d')!
    this.refViewport = this.container.querySelector<HTMLElement>('#reference-canvas-viewport')!

    this.resizeCanvases()

    this.resizeObserver = new ResizeObserver(() => {
      this.resizeCanvases()
    })
    this.resizeObserver.observe(this.srcViewport)
    this.resizeObserver.observe(this.refViewport)
  }

  private resizeCanvases() {
    if (!this.srcViewport || !this.refViewport) return

    const srcRect = this.srcViewport.getBoundingClientRect()
    if (srcRect.width > 0 && srcRect.height > 0) {
      const dpr = window.devicePixelRatio || 1
      this.srcCanvas.width = srcRect.width * dpr
      this.srcCanvas.height = srcRect.height * dpr
      this.srcCanvas.style.width = `${srcRect.width}px`
      this.srcCanvas.style.height = `${srcRect.height}px`
      this.srcCtx.resetTransform()
      this.srcCtx.scale(dpr, dpr)
    }

    const refRect = this.refViewport.getBoundingClientRect()
    if (refRect.width > 0 && refRect.height > 0) {
      const dpr = window.devicePixelRatio || 1
      this.refCanvas.width = refRect.width * dpr
      this.refCanvas.height = refRect.height * dpr
      this.refCanvas.style.width = `${refRect.width}px`
      this.refCanvas.style.height = `${refRect.height}px`
      this.refCtx.resetTransform()
      this.refCtx.scale(dpr, dpr)
    }
  }

  // --- View Helpers ---
  private fitSourceView() {
    const rect = this.srcViewport.getBoundingClientRect()
    const availW = Math.max(100, rect.width - 40)
    const availH = Math.max(100, rect.height - 40)

    // Center on the ROI in source space
    const roiW = Math.max(200, this.currentCoords.src_sample_end - this.currentCoords.src_sample_start)
    const roiH = Math.max(200, this.currentCoords.src_line_end - this.currentCoords.src_line_start)
    const roiMidX = this.currentCoords.src_sample_start + roiW / 2
    const roiMidY = this.currentCoords.src_line_start + roiH / 2

    // Scale so ROI fits comfortably with contextual margins
    const targetW = Math.max(roiW * 1.3, 3000)
    const targetH = Math.max(roiH * 1.3, 3000)

    const scaleX = availW / targetW
    const scaleY = availH / targetH
    this.srcZoom = Math.min(scaleX, scaleY)

    this.srcPanX = rect.width / 2 - roiMidX * this.srcZoom
    this.srcPanY = rect.height / 2 - roiMidY * this.srcZoom
  }

  private fitReferenceView() {
    const rect = this.refViewport.getBoundingClientRect()
    const availW = Math.max(100, rect.width - 40)
    const availH = Math.max(100, rect.height - 40)

    const refW = Math.max(100, this.currentCoords.ref_x1 - this.currentCoords.ref_x0)
    const refH = Math.max(100, this.currentCoords.ref_y1 - this.currentCoords.ref_y0)
    const refMidX = this.currentCoords.ref_x0 + refW / 2
    const refMidY = this.currentCoords.ref_y0 + refH / 2

    const targetW = Math.max(refW * 1.3, this.refNativeW * 1.2)
    const targetH = Math.max(refH * 1.3, 2200)

    const scaleX = availW / targetW
    const scaleY = availH / targetH
    this.refZoom = Math.min(scaleX, scaleY)

    this.refPanX = rect.width / 2 - refMidX * this.refZoom
    this.refPanY = rect.height / 2 - refMidY * this.refZoom
  }

  // --- Coordinate conversions for Source Canvas ---
  private srcWorldToScreen(wx: number, wy: number) {
    return {
      x: wx * this.srcZoom + this.srcPanX,
      y: wy * this.srcZoom + this.srcPanY,
    }
  }

  private srcScreenToWorld(sx: number, sy: number) {
    return {
      wx: (sx - this.srcPanX) / this.srcZoom,
      wy: (sy - this.srcPanY) / this.srcZoom,
    }
  }

  // --- Coordinate conversions for Reference Canvas ---
  private refWorldToScreen(wx: number, wy: number) {
    return {
      x: wx * this.refZoom + this.refPanX,
      y: wy * this.refZoom + this.refPanY,
    }
  }

  // --- Polygon Initialization ---
  private initPolygonFromCoords() {
    const x0 = this.currentCoords.src_sample_start
    const y0 = this.currentCoords.src_line_start
    const x1 = this.currentCoords.src_sample_end
    const y1 = this.currentCoords.src_line_end
    const w = x1 - x0
    const h = y1 - y0

    this.polygonPoints = [
      { x: x0, y: y0 },
      { x: x0 + w * 0.5, y: y0 - h * 0.05 },
      { x: x1, y: y0 },
      { x: x1, y: y1 },
      { x: x0 + w * 0.45, y: y1 + h * 0.06 },
      { x: x0, y: y1 },
    ]
  }

  private syncCoordsFromPolygon() {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    for (const p of this.polygonPoints) {
      minX = Math.min(minX, p.x)
      maxX = Math.max(maxX, p.x)
      minY = Math.min(minY, p.y)
      maxY = Math.max(maxY, p.y)
    }
    this.currentCoords.src_sample_start = Math.max(0, Math.round(minX))
    this.currentCoords.src_sample_end = Math.min(this.srcNativeW, Math.round(maxX))
    this.currentCoords.src_line_start = Math.max(0, Math.round(minY))
    this.currentCoords.src_line_end = Math.min(this.srcNativeH, Math.round(maxY))

    this.updateInputFields()
    this.updateSummary()
  }

  // --- ROI Handles on Source Screen ---
  private getSourceHandles() {
    const p0 = this.srcWorldToScreen(this.currentCoords.src_sample_start, this.currentCoords.src_line_start)
    const p1 = this.srcWorldToScreen(this.currentCoords.src_sample_end, this.currentCoords.src_line_end)
    const midX = (p0.x + p1.x) / 2
    const midY = (p0.y + p1.y) / 2

    return [
      { name: 'nw', x: p0.x, y: p0.y },
      { name: 'n',  x: midX, y: p0.y },
      { name: 'ne', x: p1.x, y: p0.y },
      { name: 'e',  x: p1.x, y: midY },
      { name: 'se', x: p1.x, y: p1.y },
      { name: 's',  x: midX, y: p1.y },
      { name: 'sw', x: p0.x, y: p1.y },
      { name: 'w',  x: p0.x, y: midY },
    ]
  }

  private getHandleAt(sx: number, sy: number): string | null {
    const handles = this.getSourceHandles()
    const radius = 9
    for (const h of handles) {
      if (Math.hypot(sx - h.x, sy - h.y) <= radius) {
        return h.name
      }
    }
    return null
  }

  private isInsideSourceRoi(wx: number, wy: number) {
    return (
      wx >= this.currentCoords.src_sample_start &&
      wx <= this.currentCoords.src_sample_end &&
      wy >= this.currentCoords.src_line_start &&
      wy <= this.currentCoords.src_line_end
    )
  }

  // --- Event Handling ---
  private attachDomEvents() {
    // Mode toggles
    const btnBbox = this.container.querySelector('#btn-mode-bbox')
    const btnPoly = this.container.querySelector('#btn-mode-poly')

    btnBbox?.addEventListener('click', () => {
      this.shapeMode = 'rectangle'
      btnBbox.classList.add('active')
      btnBbox.setAttribute('aria-checked', 'true')
      btnPoly?.classList.remove('active')
      btnPoly?.setAttribute('aria-checked', 'false')
      this.initPolygonFromCoords()
    })

    btnPoly?.addEventListener('click', () => {
      this.shapeMode = 'polygon'
      btnPoly.classList.add('active')
      btnPoly.setAttribute('aria-checked', 'true')
      btnBbox?.classList.remove('active')
      btnBbox?.setAttribute('aria-checked', 'false')
      this.initPolygonFromCoords()
    })

    // Source view buttons
    this.container.querySelector('#btn-src-zoom-in')?.addEventListener('click', () => {
      this.srcZoom *= 1.3
    })
    this.container.querySelector('#btn-src-zoom-out')?.addEventListener('click', () => {
      this.srcZoom /= 1.3
    })
    this.container.querySelector('#btn-src-fit')?.addEventListener('click', () => {
      this.fitSourceView()
    })
    this.container.querySelector('#btn-src-reset')?.addEventListener('click', () => {
      this.fitSourceView()
    })
    this.container.querySelector('#btn-src-fullscreen')?.addEventListener('click', () => {
      const p = this.container.querySelector('#roi-source-panel')
      p?.classList.toggle('expanded')
      setTimeout(() => this.resizeCanvases(), 150)
    })

    // Reference view buttons
    this.container.querySelector('#btn-ref-zoom-in')?.addEventListener('click', () => {
      this.refZoom *= 1.3
    })
    this.container.querySelector('#btn-ref-zoom-out')?.addEventListener('click', () => {
      this.refZoom /= 1.3
    })
    this.container.querySelector('#btn-ref-fit')?.addEventListener('click', () => {
      this.fitReferenceView()
    })
    this.container.querySelector('#btn-ref-reset')?.addEventListener('click', () => {
      this.fitReferenceView()
    })

    // Coordinate inputs
    const inL0 = this.container.querySelector<HTMLInputElement>('#input-src-line-start')
    const inS0 = this.container.querySelector<HTMLInputElement>('#input-src-sample-start')
    const inL1 = this.container.querySelector<HTMLInputElement>('#input-src-line-end')
    const inS1 = this.container.querySelector<HTMLInputElement>('#input-src-sample-end')

    const updateFromInputs = () => {
      if (inL0 && inS0 && inL1 && inS1) {
        const l0 = parseInt(inL0.value, 10) || 0
        const s0 = parseInt(inS0.value, 10) || 0
        const l1 = parseInt(inL1.value, 10) || 6000
        const s1 = parseInt(inS1.value, 10) || 4000
        if (l1 > l0 && s1 > s0) {
          this.currentCoords.src_line_start = l0
          this.currentCoords.src_sample_start = s0
          this.currentCoords.src_line_end = l1
          this.currentCoords.src_sample_end = s1
          this.initPolygonFromCoords()
          this.updateSummary()
        }
      }
    }

    inL0?.addEventListener('change', updateFromInputs)
    inS0?.addEventListener('change', updateFromInputs)
    inL1?.addEventListener('change', updateFromInputs)
    inS1?.addEventListener('change', updateFromInputs)

    // Advanced Ref inputs
    const inRx0 = this.container.querySelector<HTMLInputElement>('#input-ref-x0')
    const inRy0 = this.container.querySelector<HTMLInputElement>('#input-ref-y0')
    const inRx1 = this.container.querySelector<HTMLInputElement>('#input-ref-x1')
    const inRy1 = this.container.querySelector<HTMLInputElement>('#input-ref-y1')

    const updateFromRefInputs = () => {
      if (inRx0 && inRy0 && inRx1 && inRy1) {
        this.currentCoords.ref_x0 = parseInt(inRx0.value, 10) || 60000
        this.currentCoords.ref_y0 = parseInt(inRy0.value, 10) || 35000
        this.currentCoords.ref_x1 = parseInt(inRx1.value, 10) || 64000
        this.currentCoords.ref_y1 = parseInt(inRy1.value, 10) || 41000
        this.updateSummary()
      }
    }
    inRx0?.addEventListener('change', updateFromRefInputs)
    inRy0?.addEventListener('change', updateFromRefInputs)
    inRx1?.addEventListener('change', updateFromRefInputs)
    inRy1?.addEventListener('change', updateFromRefInputs)

    // Nudge buttons
    this.container.querySelectorAll<HTMLButtonElement>('.btn-nudge').forEach(btn => {
      btn.addEventListener('click', () => {
        const dim = btn.getAttribute('data-dim')
        const delta = parseInt(btn.getAttribute('data-delta') || '0', 10)
        if (dim === 'line') {
          const h = this.currentCoords.src_line_end - this.currentCoords.src_line_start
          const newL0 = Math.max(0, Math.min(this.srcNativeH - h, this.currentCoords.src_line_start + delta))
          this.currentCoords.src_line_start = newL0
          this.currentCoords.src_line_end = newL0 + h
        } else if (dim === 'sample') {
          const w = this.currentCoords.src_sample_end - this.currentCoords.src_sample_start
          const newS0 = Math.max(0, Math.min(this.srcNativeW - w, this.currentCoords.src_sample_start + delta))
          this.currentCoords.src_sample_start = newS0
          this.currentCoords.src_sample_end = newS0 + w
        }
        this.initPolygonFromCoords()
        this.updateInputFields()
        this.updateSummary()
      })
    })

    // Reset button
    this.container.querySelector('#btn-roi-reset')?.addEventListener('click', () => {
      this.updateDimensionsFromPair()
      this.initPolygonFromCoords()
      this.updateInputFields()
      this.updateSummary()
      this.fitSourceView()
      this.fitReferenceView()
      showHumanToast('Coordinates reset to nominal lunar sub-scene bounds', 'info')
    })

    // Preview ROI action
    this.container.querySelector('#btn-roi-preview')?.addEventListener('click', () => {
      this.openPreviewModal()
    })

    // Apply ROI actions
    this.container.querySelector('#btn-roi-apply')?.addEventListener('click', () => {
      this.applyRoi()
    })

    // Next step navigation
    this.container.querySelector('#btn-continue-preprocessing')?.addEventListener('click', () => {
      this.navigateToNextStage()
    })
    this.container.querySelector('#btn-roi-next-stage-header')?.addEventListener('click', () => {
      this.navigateToNextStage()
    })

    // Preview modal close / back / apply
    const modal = this.container.querySelector<HTMLElement>('#roi-preview-modal-backdrop')
    this.container.querySelector('#preview-modal-close')?.addEventListener('click', () => {
      if (modal) modal.style.display = 'none'
    })
    this.container.querySelector('#preview-modal-back')?.addEventListener('click', () => {
      if (modal) modal.style.display = 'none'
    })
    this.container.querySelector('#preview-modal-apply')?.addEventListener('click', () => {
      if (modal) modal.style.display = 'none'
      this.applyRoi()
    })

    // Attach Canvas interaction listeners
    this.attachSourceCanvasInteractions()
    this.attachReferenceCanvasInteractions()
  }

  // --- Source Canvas Mouse Interactions (ROI Drag, Resize, Pan, Zoom) ---
  private attachSourceCanvasInteractions() {
    this.srcViewport.addEventListener('wheel', (e: WheelEvent) => {
      e.preventDefault()
      const rect = this.srcViewport.getBoundingClientRect()
      const mouseX = e.clientX - rect.left
      const mouseY = e.clientY - rect.top
      const zoomFactor = e.deltaY < 0 ? 1.15 : 1 / 1.15

      const newZoom = Math.max(0.01, Math.min(1.5, this.srcZoom * zoomFactor))
      this.srcPanX = mouseX - (mouseX - this.srcPanX) * (newZoom / this.srcZoom)
      this.srcPanY = mouseY - (mouseY - this.srcPanY) * (newZoom / this.srcZoom)
      this.srcZoom = newZoom
    }, { passive: false })

    this.srcViewport.addEventListener('mousedown', (e: MouseEvent) => {
      const rect = this.srcViewport.getBoundingClientRect()
      const sx = e.clientX - rect.left
      const sy = e.clientY - rect.top
      const { wx, wy } = this.srcScreenToWorld(sx, sy)

      // 1. Check Handle Click
      const handle = this.getHandleAt(sx, sy)
      if (handle) {
        this.isResizingRoi = true
        this.activeHandle = handle
        this.dragStartX = sx
        this.dragStartY = sy
        this.initialRoiSnapshot = { ...this.currentCoords }
        return
      }

      // 2. Check Polygon Point
      if (this.shapeMode === 'polygon') {
        for (let i = 0; i < this.polygonPoints.length; i++) {
          const ptScr = this.srcWorldToScreen(this.polygonPoints[i].x, this.polygonPoints[i].y)
          if (Math.hypot(sx - ptScr.x, sy - ptScr.y) <= 8) {
            this.activePolygonPointIdx = i
            this.isDraggingRoi = true
            return
          }
        }
      }

      // 3. Check Inside ROI Box (Drag)
      if (this.isInsideSourceRoi(wx, wy)) {
        this.isDraggingRoi = true
        this.dragStartX = sx
        this.dragStartY = sy
        this.initialRoiSnapshot = { ...this.currentCoords }
        this.srcViewport.style.cursor = 'grabbing'
        return
      }

      // 4. Pan Viewport
      this.isSrcPanning = true
      this.srcPanStartX = sx - this.srcPanX
      this.srcPanStartY = sy - this.srcPanY
      this.srcViewport.style.cursor = 'grabbing'
    })

    window.addEventListener('mousemove', (e: MouseEvent) => {
      const rect = this.srcViewport.getBoundingClientRect()
      const sx = e.clientX - rect.left
      const sy = e.clientY - rect.top
      const isInside = sx >= 0 && sx <= rect.width && sy >= 0 && sy <= rect.height

      // Polygon Point Drag
      if (this.shapeMode === 'polygon' && this.isDraggingRoi && this.activePolygonPointIdx !== null) {
        const { wx, wy } = this.srcScreenToWorld(sx, sy)
        this.polygonPoints[this.activePolygonPointIdx] = {
          x: Math.max(0, Math.min(this.srcNativeW, wx)),
          y: Math.max(0, Math.min(this.srcNativeH, wy)),
        }
        this.syncCoordsFromPolygon()
        return
      }

      // Handle Resizing Drag
      if (this.isResizingRoi && this.activeHandle && this.initialRoiSnapshot) {
        const dxWorld = (sx - this.dragStartX) / this.srcZoom
        const dyWorld = (sy - this.dragStartY) / this.srcZoom

        let s0 = this.initialRoiSnapshot.src_sample_start
        let s1 = this.initialRoiSnapshot.src_sample_end
        let l0 = this.initialRoiSnapshot.src_line_start
        let l1 = this.initialRoiSnapshot.src_line_end

        if (this.activeHandle.includes('w')) s0 = Math.min(s1 - 200, Math.max(0, s0 + dxWorld))
        if (this.activeHandle.includes('e')) s1 = Math.max(s0 + 200, Math.min(this.srcNativeW, s1 + dxWorld))
        if (this.activeHandle.includes('n')) l0 = Math.min(l1 - 200, Math.max(0, l0 + dyWorld))
        if (this.activeHandle.includes('s')) l1 = Math.max(l0 + 200, Math.min(this.srcNativeH, l1 + dyWorld))

        this.currentCoords.src_sample_start = Math.round(s0)
        this.currentCoords.src_sample_end = Math.round(s1)
        this.currentCoords.src_line_start = Math.round(l0)
        this.currentCoords.src_line_end = Math.round(l1)

        this.initPolygonFromCoords()
        this.updateInputFields()
        this.updateSummary()
        return
      }

      // ROI Box Move Drag
      if (this.isDraggingRoi && this.initialRoiSnapshot) {
        const dxWorld = (sx - this.dragStartX) / this.srcZoom
        const dyWorld = (sy - this.dragStartY) / this.srcZoom

        const w = this.initialRoiSnapshot.src_sample_end - this.initialRoiSnapshot.src_sample_start
        const h = this.initialRoiSnapshot.src_line_end - this.initialRoiSnapshot.src_line_start

        const newS0 = Math.max(0, Math.min(this.srcNativeW - w, Math.round(this.initialRoiSnapshot.src_sample_start + dxWorld)))
        const newL0 = Math.max(0, Math.min(this.srcNativeH - h, Math.round(this.initialRoiSnapshot.src_line_start + dyWorld)))

        this.currentCoords.src_sample_start = newS0
        this.currentCoords.src_sample_end = newS0 + w
        this.currentCoords.src_line_start = newL0
        this.currentCoords.src_line_end = newL0 + h

        this.initPolygonFromCoords()
        this.updateInputFields()
        this.updateSummary()
        return
      }

      // Viewport Pan Drag
      if (this.isSrcPanning) {
        this.srcPanX = sx - this.srcPanStartX
        this.srcPanY = sy - this.srcPanStartY
        return
      }

      // Update Cursor style
      if (isInside) {
        const handle = this.getHandleAt(sx, sy)
        if (handle) {
          switch (handle) {
            case 'nw': case 'se': this.srcViewport.style.cursor = 'nwse-resize'; break
            case 'ne': case 'sw': this.srcViewport.style.cursor = 'nesw-resize'; break
            case 'n': case 's': this.srcViewport.style.cursor = 'ns-resize'; break
            case 'e': case 'w': this.srcViewport.style.cursor = 'ew-resize'; break
          }
        } else {
          const { wx, wy } = this.srcScreenToWorld(sx, sy)
          if (this.isInsideSourceRoi(wx, wy)) {
            this.srcViewport.style.cursor = 'move'
          } else {
            this.srcViewport.style.cursor = 'grab'
          }
        }
      }
    })

    window.addEventListener('mouseup', () => {
      this.isSrcPanning = false
      this.isDraggingRoi = false
      this.isResizingRoi = false
      this.activeHandle = null
      this.activePolygonPointIdx = null
      this.initialRoiSnapshot = null
      this.srcViewport.style.cursor = 'grab'
    })
  }

  // --- Reference Canvas Mouse Interactions (Pan & Zoom) ---
  private attachReferenceCanvasInteractions() {
    this.refViewport.addEventListener('wheel', (e: WheelEvent) => {
      e.preventDefault()
      const rect = this.refViewport.getBoundingClientRect()
      const mouseX = e.clientX - rect.left
      const mouseY = e.clientY - rect.top
      const zoomFactor = e.deltaY < 0 ? 1.15 : 1 / 1.15

      const newZoom = Math.max(0.001, Math.min(0.2, this.refZoom * zoomFactor))
      this.refPanX = mouseX - (mouseX - this.refPanX) * (newZoom / this.refZoom)
      this.refPanY = mouseY - (mouseY - this.refPanY) * (newZoom / this.refZoom)
      this.refZoom = newZoom
    }, { passive: false })

    this.refViewport.addEventListener('mousedown', (e: MouseEvent) => {
      const rect = this.refViewport.getBoundingClientRect()
      const sx = e.clientX - rect.left
      const sy = e.clientY - rect.top
      this.isRefPanning = true
      this.refPanStartX = sx - this.refPanX
      this.refPanStartY = sy - this.refPanY
      this.refViewport.style.cursor = 'grabbing'
    })

    window.addEventListener('mousemove', (e: MouseEvent) => {
      if (!this.isRefPanning) return
      const rect = this.refViewport.getBoundingClientRect()
      const sx = e.clientX - rect.left
      const sy = e.clientY - rect.top
      this.refPanX = sx - this.refPanStartX
      this.refPanY = sy - this.refPanStartY
    })

    window.addEventListener('mouseup', () => {
      this.isRefPanning = false
      this.refViewport.style.cursor = 'grab'
    })
  }

  // --- 60FPS Draw Loop ---
  private startLoop() {
    const loop = () => {
      this.drawSourceScene()
      this.drawReferenceScene()
      this.animFrameId = requestAnimationFrame(loop)
    }
    this.animFrameId = requestAnimationFrame(loop)
  }

  // --- Drawing Source Canvas ---
  private drawSourceScene() {
    if (!this.srcCtx || !this.srcViewport) return
    const rect = this.srcViewport.getBoundingClientRect()
    const w = rect.width
    const h = rect.height
    if (w <= 0 || h <= 0) return

    const ctx = this.srcCtx
    ctx.clearRect(0, 0, w, h)

    // Background Void
    ctx.fillStyle = '#030509'
    ctx.fillRect(0, 0, w, h)

    // Subtle Grid
    this.drawSubtleGrid(ctx, w, h, this.srcZoom, this.srcPanX, this.srcPanY)

    // Draw Source Image
    ctx.save()
    if (this.srcImg && this.srcImg.complete && this.srcImg.naturalWidth > 0) {
      const p0 = this.srcWorldToScreen(0, 0)
      const p1 = this.srcWorldToScreen(this.srcNativeW, this.srcNativeH)
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(this.srcImg, p0.x, p0.y, p1.x - p0.x, p1.y - p0.y)

      // Swath border
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)'
      ctx.lineWidth = 1
      ctx.strokeRect(p0.x, p0.y, p1.x - p0.x, p1.y - p0.y)
    } else {
      const p0 = this.srcWorldToScreen(0, 0)
      ctx.fillStyle = '#64748b'
      ctx.font = '12px "JetBrains Mono", monospace'
      ctx.fillText('Loading source lunar imagery...', p0.x + 20, p0.y + 40)
    }
    ctx.restore()

    // Draw ROI Selection Box on Source
    const roiP0 = this.srcWorldToScreen(this.currentCoords.src_sample_start, this.currentCoords.src_line_start)
    const roiP1 = this.srcWorldToScreen(this.currentCoords.src_sample_end, this.currentCoords.src_line_end)
    const roiW = roiP1.x - roiP0.x
    const roiH = roiP1.y - roiP0.y

    // ROI Fill & Glow
    ctx.save()
    if (this.shapeMode === 'rectangle') {
      ctx.fillStyle = 'rgba(56, 189, 248, 0.12)'
      ctx.fillRect(roiP0.x, roiP0.y, roiW, roiH)

      ctx.strokeStyle = '#38bdf8'
      ctx.lineWidth = 1.5
      ctx.shadowColor = 'rgba(56, 189, 248, 0.45)'
      ctx.shadowBlur = 8
      ctx.strokeRect(roiP0.x, roiP0.y, roiW, roiH)
      ctx.shadowBlur = 0

      // Corner accent brackets
      const bracketLen = Math.min(18, roiW * 0.2, roiH * 0.2)
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 2
      // Top-Left
      ctx.beginPath()
      ctx.moveTo(roiP0.x, roiP0.y + bracketLen)
      ctx.lineTo(roiP0.x, roiP0.y)
      ctx.lineTo(roiP0.x + bracketLen, roiP0.y)
      ctx.stroke()
      // Top-Right
      ctx.beginPath()
      ctx.moveTo(roiP1.x - bracketLen, roiP0.y)
      ctx.lineTo(roiP1.x, roiP0.y)
      ctx.lineTo(roiP1.x, roiP0.y + bracketLen)
      ctx.stroke()
      // Bottom-Right
      ctx.beginPath()
      ctx.moveTo(roiP1.x, roiP1.y - bracketLen)
      ctx.lineTo(roiP1.x, roiP1.y)
      ctx.lineTo(roiP1.x - bracketLen, roiP1.y)
      ctx.stroke()
      // Bottom-Left
      ctx.beginPath()
      ctx.moveTo(roiP0.x + bracketLen, roiP1.y)
      ctx.lineTo(roiP0.x, roiP1.y)
      ctx.lineTo(roiP0.x, roiP1.y - bracketLen)
      ctx.stroke()

      // Center Crosshair
      const midX = roiP0.x + roiW / 2
      const midY = roiP0.y + roiH / 2
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.6)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(midX - 8, midY)
      ctx.lineTo(midX + 8, midY)
      ctx.moveTo(midX, midY - 8)
      ctx.lineTo(midX, midY + 8)
      ctx.stroke()

      // Handles
      const handles = this.getSourceHandles()
      for (const h of handles) {
        ctx.fillStyle = '#030509'
        ctx.strokeStyle = '#38bdf8'
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.rect(h.x - 4, h.y - 4, 8, 8)
        ctx.fill()
        ctx.stroke()
      }

      // Small Label
      ctx.fillStyle = '#060910'
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.5)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.roundRect(roiP0.x + 4, roiP0.y + 4, 110, 18, 3)
      ctx.fill()
      ctx.stroke()

      ctx.fillStyle = '#38bdf8'
      ctx.font = '600 10px "JetBrains Mono", monospace'
      ctx.fillText(`ROI: ${Math.round(this.currentCoords.src_sample_end - this.currentCoords.src_sample_start)} × ${Math.round(this.currentCoords.src_line_end - this.currentCoords.src_line_start)}`, roiP0.x + 8, roiP0.y + 16)
    } else {
      // Polygon Mode
      ctx.beginPath()
      for (let i = 0; i < this.polygonPoints.length; i++) {
        const pScr = this.srcWorldToScreen(this.polygonPoints[i].x, this.polygonPoints[i].y)
        if (i === 0) ctx.moveTo(pScr.x, pScr.y)
        else ctx.lineTo(pScr.x, pScr.y)
      }
      ctx.closePath()
      ctx.fillStyle = 'rgba(56, 189, 248, 0.12)'
      ctx.fill()
      ctx.strokeStyle = '#38bdf8'
      ctx.lineWidth = 1.5
      ctx.stroke()

      // Polygon Vertices
      for (const p of this.polygonPoints) {
        const pScr = this.srcWorldToScreen(p.x, p.y)
        ctx.fillStyle = '#38bdf8'
        ctx.strokeStyle = '#ffffff'
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.arc(pScr.x, pScr.y, 4.5, 0, Math.PI * 2)
        ctx.fill()
        ctx.stroke()
      }
    }
    ctx.restore()
  }

  // --- Drawing Reference Canvas ---
  private drawReferenceScene() {
    if (!this.refCtx || !this.refViewport) return
    const rect = this.refViewport.getBoundingClientRect()
    const w = rect.width
    const h = rect.height
    if (w <= 0 || h <= 0) return

    const ctx = this.refCtx
    ctx.clearRect(0, 0, w, h)

    // Background Void
    ctx.fillStyle = '#030509'
    ctx.fillRect(0, 0, w, h)

    // Subtle Grid
    this.drawSubtleGrid(ctx, w, h, this.refZoom, this.refPanX, this.refPanY)

    // Draw Reference Basemap
    ctx.save()
    if (this.refImg && this.refImg.complete && this.refImg.naturalWidth > 0) {
      const p0 = this.refWorldToScreen(0, 0)
      const p1 = this.refWorldToScreen(this.refNativeW, this.refNativeH)
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(this.refImg, p0.x, p0.y, p1.x - p0.x, p1.y - p0.y)

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)'
      ctx.lineWidth = 1
      ctx.strokeRect(p0.x, p0.y, p1.x - p0.x, p1.y - p0.y)
    } else {
      const p0 = this.refWorldToScreen(0, 0)
      ctx.fillStyle = '#64748b'
      ctx.font = '12px "JetBrains Mono", monospace'
      ctx.fillText('Loading reference lunar imagery...', p0.x + 20, p0.y + 40)
    }
    ctx.restore()

    // Draw Candidate Reference Region Box
    const refP0 = this.refWorldToScreen(this.currentCoords.ref_x0, this.currentCoords.ref_y0)
    const refP1 = this.refWorldToScreen(this.currentCoords.ref_x1, this.currentCoords.ref_y1)
    const boxW = refP1.x - refP0.x
    const boxH = refP1.y - refP0.y

    ctx.save()
    ctx.fillStyle = 'rgba(245, 158, 11, 0.08)'
    ctx.fillRect(refP0.x, refP0.y, boxW, boxH)

    ctx.strokeStyle = '#f59e0b'
    ctx.lineWidth = 1.5
    ctx.setLineDash([4, 4])
    ctx.strokeRect(refP0.x, refP0.y, boxW, boxH)
    ctx.setLineDash([])

    // Label badge on reference candidate box
    ctx.fillStyle = '#060910'
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.5)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.roundRect(refP0.x + 4, refP0.y + 4, 150, 18, 3)
    ctx.fill()
    ctx.stroke()

    ctx.fillStyle = '#f59e0b'
    ctx.font = '600 10px "JetBrains Mono", monospace'
    ctx.fillText('CANDIDATE REFERENCE REGION', refP0.x + 8, refP0.y + 16)
    ctx.restore()
  }

  private drawSubtleGrid(ctx: CanvasRenderingContext2D, w: number, h: number, zoom: number, panX: number, panY: number) {
    ctx.save()
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.025)'
    ctx.lineWidth = 1

    const stepWorld = 5000
    const stepScreen = stepWorld * zoom
    if (stepScreen > 15 && stepScreen < 300) {
      const startX = panX % stepScreen
      for (let x = startX; x < w; x += stepScreen) {
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, h)
        ctx.stroke()
      }
      const startY = panY % stepScreen
      for (let y = startY; y < h; y += stepScreen) {
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(w, y)
        ctx.stroke()
      }
    }
    ctx.restore()
  }

  // --- Update UI Inputs & Summary ---
  private updateInputFields() {
    const inL0 = this.container.querySelector<HTMLInputElement>('#input-src-line-start')
    const inS0 = this.container.querySelector<HTMLInputElement>('#input-src-sample-start')
    const inL1 = this.container.querySelector<HTMLInputElement>('#input-src-line-end')
    const inS1 = this.container.querySelector<HTMLInputElement>('#input-src-sample-end')

    if (inL0 && document.activeElement !== inL0) inL0.value = `${this.currentCoords.src_line_start}`
    if (inS0 && document.activeElement !== inS0) inS0.value = `${this.currentCoords.src_sample_start}`
    if (inL1 && document.activeElement !== inL1) inL1.value = `${this.currentCoords.src_line_end}`
    if (inS1 && document.activeElement !== inS1) inS1.value = `${this.currentCoords.src_sample_end}`

    const inRx0 = this.container.querySelector<HTMLInputElement>('#input-ref-x0')
    const inRy0 = this.container.querySelector<HTMLInputElement>('#input-ref-y0')
    const inRx1 = this.container.querySelector<HTMLInputElement>('#input-ref-x1')
    const inRy1 = this.container.querySelector<HTMLInputElement>('#input-ref-y1')

    if (inRx0 && document.activeElement !== inRx0) inRx0.value = `${this.currentCoords.ref_x0}`
    if (inRy0 && document.activeElement !== inRy0) inRy0.value = `${this.currentCoords.ref_y0}`
    if (inRx1 && document.activeElement !== inRx1) inRx1.value = `${this.currentCoords.ref_x1}`
    if (inRy1 && document.activeElement !== inRy1) inRy1.value = `${this.currentCoords.ref_y1}`
  }

  private computeValidPixelPercent(): number {
    if (!this.srcImg || !this.srcImg.complete || this.srcImg.naturalWidth <= 0) {
      return 92
    }
    try {
      if (!this.sampleCanvas) {
        this.sampleCanvas = document.createElement('canvas')
        this.sampleCanvas.width = 50
        this.sampleCanvas.height = 50
        this.sampleCtx = this.sampleCanvas.getContext('2d', { willReadFrequently: true })
      }
      if (!this.sampleCtx) return 92

      const nw = this.srcImg.naturalWidth
      const nh = this.srcImg.naturalHeight

      const sx0 = Math.max(0, Math.min(nw - 1, Math.round((this.currentCoords.src_sample_start / this.srcNativeW) * nw)))
      const sy0 = Math.max(0, Math.min(nh - 1, Math.round((this.currentCoords.src_line_start / this.srcNativeH) * nh)))
      const sx1 = Math.max(sx0 + 1, Math.min(nw, Math.round((this.currentCoords.src_sample_end / this.srcNativeW) * nw)))
      const sy1 = Math.max(sy0 + 1, Math.min(nh, Math.round((this.currentCoords.src_line_end / this.srcNativeH) * nh)))

      const sw = sx1 - sx0
      const sh = sy1 - sy0

      this.sampleCtx.clearRect(0, 0, 50, 50)
      this.sampleCtx.drawImage(this.srcImg, sx0, sy0, sw, sh, 0, 0, 50, 50)
      const data = this.sampleCtx.getImageData(0, 0, 50, 50).data

      let validCount = 0
      const totalPixels = 50 * 50
      for (let i = 0; i < data.length; i += 4) {
        // Lunar terrain illuminated feature threshold (> 15 DN)
        if (data[i] >= 16) {
          validCount++
        }
      }
      return Math.min(100, Math.max(0, Math.round((validCount / totalPixels) * 100)))
    } catch {
      return 92
    }
  }

  private updateSummary() {
    const x0 = this.currentCoords.src_sample_start
    const x1 = this.currentCoords.src_sample_end
    const y0 = this.currentCoords.src_line_start
    const y1 = this.currentCoords.src_line_end

    const w = Math.max(0, x1 - x0)
    const h = Math.max(0, y1 - y0)
    const validPercent = this.computeValidPixelPercent()

    const elSize = this.container.querySelector('#sum-val-size')
    const elX = this.container.querySelector('#sum-val-x')
    const elY = this.container.querySelector('#sum-val-y')
    const elValid = this.container.querySelector('#sum-val-valid')
    const warnBox = this.container.querySelector<HTMLElement>('#roi-low-data-warning')

    if (elSize) elSize.textContent = `${w.toLocaleString()} × ${h.toLocaleString()} px`
    if (elX) elX.textContent = `${x0.toLocaleString()} → ${x1.toLocaleString()}`
    if (elY) elY.textContent = `${y0.toLocaleString()} → ${y1.toLocaleString()}`
    if (elValid) elValid.textContent = `${validPercent}%`

    if (warnBox) {
      if (validPercent < 25) {
        warnBox.style.display = 'flex'
      } else {
        warnBox.style.display = 'none'
      }
    }
  }

  // --- Actions ---
  private applyRoi() {
    const x0 = this.currentCoords.src_sample_start
    const x1 = this.currentCoords.src_sample_end
    const y0 = this.currentCoords.src_line_start
    const y1 = this.currentCoords.src_line_end

    const w = x1 - x0
    const h = y1 - y0
    const validPercent = this.computeValidPixelPercent()

    // 8. ROI Validation rules
    const isValid = (
      w > 0 &&
      h > 0 &&
      w >= 100 &&
      h >= 100 &&
      x0 >= 0 &&
      y0 >= 0 &&
      x1 <= this.srcNativeW &&
      y1 <= this.srcNativeH &&
      validPercent >= 5
    )

    if (!isValid) {
      showHumanToast('Select a valid image region.', 'warning')
      return
    }

    this.isApplied = true
    this.onApplyCallback(this.currentCoords)

    // Update status badge
    const badge = this.container.querySelector('#roi-status-badge')
    const sumStatus = this.container.querySelector('#sum-status-text')
    if (badge) {
      badge.textContent = 'Applied ✓'
      badge.className = 'text-emerald'
    }
    if (sumStatus) {
      sumStatus.textContent = 'Applied ✓'
      sumStatus.className = 'v font-mono text-emerald'
    }

    // Enable Continue button
    const btnNext = this.container.querySelector<HTMLButtonElement>('#btn-continue-preprocessing')
    if (btnNext) {
      btnNext.disabled = false
      btnNext.classList.add('pulse-glow')
    }
    const btnHeader = this.container.querySelector<HTMLElement>('#btn-roi-next-stage-header')
    if (btnHeader) {
      btnHeader.style.display = 'inline-flex'
    }

    showHumanToast(
      `ROI Applied: Source [${y0}..${y1}, ${x0}..${x1}] (${w.toLocaleString()} × ${h.toLocaleString()} px)`,
      'success'
    )
  }

  private navigateToNextStage() {
    if (this.onNavigateNext) {
      this.onNavigateNext()
    } else {
      showHumanToast('Proceeding to Preprocessing & Feature Correspondence...', 'info')
    }
  }

  // --- Preview Modal ---
  private async openPreviewModal() {
    const modal = this.container.querySelector<HTMLElement>('#roi-preview-modal-backdrop')
    if (!modal) return
    modal.style.display = 'flex'

    const srcCanvas = this.container.querySelector<HTMLCanvasElement>('#modal-crop-src-canvas')
    const refCanvas = this.container.querySelector<HTMLCanvasElement>('#modal-crop-ref-canvas')

    if (srcCanvas && this.srcImg && this.srcImg.complete) {
      const ctx = srcCanvas.getContext('2d')!
      ctx.clearRect(0, 0, 340, 255)
      // Crop from source image
      const sx0 = (this.currentCoords.src_sample_start / this.srcNativeW) * this.srcImg.naturalWidth
      const sy0 = (this.currentCoords.src_line_start / this.srcNativeH) * this.srcImg.naturalHeight
      const sw = ((this.currentCoords.src_sample_end - this.currentCoords.src_sample_start) / this.srcNativeW) * this.srcImg.naturalWidth
      const sh = ((this.currentCoords.src_line_end - this.currentCoords.src_line_start) / this.srcNativeH) * this.srcImg.naturalHeight
      ctx.drawImage(this.srcImg, Math.max(0, sx0), Math.max(0, sy0), Math.max(10, sw), Math.max(10, sh), 0, 0, 340, 255)
    }

    if (refCanvas && this.refImg && this.refImg.complete) {
      const ctx = refCanvas.getContext('2d')!
      ctx.clearRect(0, 0, 340, 255)
      const rx0 = (this.currentCoords.ref_x0 / this.refNativeW) * this.refImg.naturalWidth
      const ry0 = (this.currentCoords.ref_y0 / this.refNativeH) * this.refImg.naturalHeight
      const rw = ((this.currentCoords.ref_x1 - this.currentCoords.ref_x0) / this.refNativeW) * this.refImg.naturalWidth
      const rh = ((this.currentCoords.ref_y1 - this.currentCoords.ref_y0) / this.refNativeH) * this.refImg.naturalHeight
      ctx.drawImage(this.refImg, Math.max(0, rx0), Math.max(0, ry0), Math.max(10, rw), Math.max(10, rh), 0, 0, 340, 255)
    }

    // Attempt backend preview fetch if online
    try {
      const roiSrc: [number, number, number, number] = [
        this.currentCoords.src_line_start,
        this.currentCoords.src_line_end,
        this.currentCoords.src_sample_start,
        this.currentCoords.src_sample_end,
      ]
      const roiRef: [number, number, number, number] = [
        this.currentCoords.ref_y0,
        this.currentCoords.ref_y1,
        this.currentCoords.ref_x0,
        this.currentCoords.ref_x1,
      ]
      const previewData = await fetchRoiPreview(this.activePairId, roiSrc, roiRef)
      if (previewData && previewData.source && srcCanvas) {
        const img = new Image()
        img.onload = () => {
          const ctx = srcCanvas.getContext('2d')!
          ctx.drawImage(img, 0, 0, 340, 255)
        }
        img.src = `data:image/png;base64,${previewData.source}`
      }
      if (previewData && previewData.reference && refCanvas) {
        const img = new Image()
        img.onload = () => {
          const ctx = refCanvas.getContext('2d')!
          ctx.drawImage(img, 0, 0, 340, 255)
        }
        img.src = `data:image/png;base64,${previewData.reference}`
      }
    } catch {
      // Local crop already rendered on canvas
    }
  }
}
