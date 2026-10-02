import type { RoiCoordinates, RoiShapeMode, RoiPolygonPoint } from '../types'
import { API_BASE } from '../api'

export type ViewerLayerMode = 'reference' | 'source' | 'dual'

export class RoiCanvasViewer {
  private container: HTMLElement
  private viewportEl!: HTMLElement
  private mainCanvas!: HTMLCanvasElement
  private mainCtx!: CanvasRenderingContext2D
  private topRulerCanvas!: HTMLCanvasElement
  private topRulerCtx!: CanvasRenderingContext2D
  private leftRulerCanvas!: HTMLCanvasElement
  private leftRulerCtx!: CanvasRenderingContext2D

  // Viewport Transform Matrix
  private zoom: number = 0.008
  private panX: number = 60
  private panY: number = 40
  private isPanning: boolean = false
  private panStartX: number = 0
  private panStartY: number = 0
  private startPanX: number = 0
  private startPanY: number = 0

  // Interactive ROI Selection State
  private coords: RoiCoordinates
  private shapeMode: RoiShapeMode = 'rectangle'
  private layerMode: ViewerLayerMode = 'reference'
  private showGrid: boolean = true
  private activeHandle: string | null = null
  private isDraggingRoi: boolean = false
  private isResizingRoi: boolean = false
  private dragStartX: number = 0
  private dragStartY: number = 0
  private initialRoiCoords: RoiCoordinates | null = null
  private activePolygonIndex: number | null = null
  private polygonPoints: RoiPolygonPoint[] = []

  // Cursor Telemetry
  private mouseWorldX: number = 0
  private mouseWorldY: number = 0
  private isMouseInside: boolean = false

  // Pulse & animation
  private pulsePhase: number = 0
  private animationFrameId: number | null = null

  // Feature Points & Comparison Mode (Phase 5)
  private showFeatures: boolean = false
  private isCompareMode: boolean = false
  private compareSplitRatio: number = 0.5
  private isDraggingSplitter: boolean = false

  public destroy() {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId)
      this.animationFrameId = null
    }
    if (this.resizeObserver) {
      this.resizeObserver.disconnect()
      this.resizeObserver = null
    }
  }

  // Authentic Lunar Raster Imagery
  private pairId: string = 'pair_001'
  private refImage: HTMLImageElement | null = null
  private srcImage: HTMLImageElement | null = null
  private refImageLoaded: boolean = false
  private srcImageLoaded: boolean = false
  private previewRefImage: HTMLImageElement | null = null
  private previewSrcImage: HTMLImageElement | null = null

  // Callbacks
  private onRoiChange: (coords: RoiCoordinates) => void

  // World Bounds
  private readonly REF_WIDTH = 100000
  private readonly REF_HEIGHT = 75000
  private readonly SRC_WIDTH = 4000
  private readonly SRC_HEIGHT = 52000

  constructor(
    parent: HTMLElement,
    initialCoords: RoiCoordinates,
    handlers: {
      onRoiChange: (coords: RoiCoordinates) => void
    }
  ) {
    this.container = document.createElement('div')
    this.container.className = 'roi-viewer-center-panel'
    parent.appendChild(this.container)

    this.coords = { ...initialCoords }
    this.onRoiChange = handlers.onRoiChange

    // Initialize polygon points from initial coords
    this.initPolygonFromCoords()

    this.renderLayout()
    this.initCanvases()
    this.attachEvents()
    this.loadPairImages()
    setTimeout(() => {
      this.resizeCanvases()
      this.centerOnRoi()
    }, 60)
    this.startRenderLoop()
  }

  public setPairId(pairId: string) {
    if (this.pairId === pairId && (this.refImageLoaded || this.srcImageLoaded)) return
    this.pairId = pairId
    this.loadPairImages()
  }

  public setPreviewData(data: { source?: string; reference?: string }) {
    if (data.reference) {
      const img = new Image()
      img.onload = () => {
        this.previewRefImage = img
        this.requestRedraw()
      }
      img.src = `data:image/png;base64,${data.reference}`
    }
    if (data.source) {
      const img = new Image()
      img.onload = () => {
        this.previewSrcImage = img
        this.requestRedraw()
      }
      img.src = `data:image/png;base64,${data.source}`
    }
  }

  private loadPairImages() {
    this.refImageLoaded = false
    this.srcImageLoaded = false

    const ref = new Image()
    ref.crossOrigin = 'anonymous'
    ref.onload = () => {
      this.refImage = ref
      this.refImageLoaded = true
      this.requestRedraw()
    }
    ref.onerror = () => {
      console.warn(`[RoiCanvasViewer] Reference preview not loaded for ${this.pairId}`)
    }
    ref.src = `${API_BASE}/pairs/${this.pairId}/reference-preview?t=${Date.now()}`

    const src = new Image()
    src.crossOrigin = 'anonymous'
    src.onload = () => {
      this.srcImage = src
      this.srcImageLoaded = true
      this.requestRedraw()
    }
    src.onerror = () => {
      console.warn(`[RoiCanvasViewer] Source preview not loaded for ${this.pairId}`)
    }
    src.src = `${API_BASE}/pairs/${this.pairId}/source-preview?t=${Date.now()}`
  }

  public setCoordinates(coords: RoiCoordinates) {
    this.coords = { ...coords }
    this.initPolygonFromCoords()
    this.requestRedraw()
  }

  public setShapeMode(mode: RoiShapeMode) {
    this.shapeMode = mode
    this.initPolygonFromCoords()
    this.requestRedraw()
  }

  public setLayerMode(mode: ViewerLayerMode) {
    this.layerMode = mode
    this.updateLayerButtons()
    this.fitToScreen()
    this.requestRedraw()
  }

  public fitToScreen() {
    const rect = this.viewportEl.getBoundingClientRect()
    const pad = 40
    const availW = Math.max(200, rect.width - pad * 2)
    const availH = Math.max(200, rect.height - pad * 2)

    let targetW = this.REF_WIDTH
    let targetH = this.REF_HEIGHT
    let centerX = this.coords.ref_x0 + (this.coords.ref_x1 - this.coords.ref_x0) / 2
    let centerY = this.coords.ref_y0 + (this.coords.ref_y1 - this.coords.ref_y0) / 2

    if (this.layerMode === 'source') {
      targetW = this.SRC_WIDTH
      targetH = this.SRC_HEIGHT
      centerX = this.coords.src_sample_start + (this.coords.src_sample_end - this.coords.src_sample_start) / 2
      centerY = this.coords.src_line_start + (this.coords.src_line_end - this.coords.src_line_start) / 2
    }

    const scaleX = availW / targetW
    const scaleY = availH / targetH
    this.zoom = Math.min(scaleX, scaleY) * 1.05

    this.panX = rect.width / 2 - centerX * this.zoom
    this.panY = rect.height / 2 - centerY * this.zoom
    this.requestRedraw()
  }

  public resetView() {
    this.fitToScreen()
  }

  public zoomIn() {
    this.applyZoom(1.35, this.viewportEl.clientWidth / 2, this.viewportEl.clientHeight / 2)
  }

  public zoomOut() {
    this.applyZoom(1 / 1.35, this.viewportEl.clientWidth / 2, this.viewportEl.clientHeight / 2)
  }

  public toggleGrid(): boolean {
    this.showGrid = !this.showGrid
    const btn = this.container.querySelector('#btn-toggle-viewer-grid')
    if (btn) btn.classList.toggle('active', this.showGrid)
    this.requestRedraw()
    return this.showGrid
  }

  private initPolygonFromCoords() {
    const rx0 = this.layerMode === 'source' ? this.coords.src_sample_start : this.coords.ref_x0
    const ry0 = this.layerMode === 'source' ? this.coords.src_line_start : this.coords.ref_y0
    const rx1 = this.layerMode === 'source' ? this.coords.src_sample_end : this.coords.ref_x1
    const ry1 = this.layerMode === 'source' ? this.coords.src_line_end : this.coords.ref_y1

    const w = rx1 - rx0
    const h = ry1 - ry0

    // 6-vertex polygon approximating a swath/crater region
    this.polygonPoints = [
      { x: rx0, y: ry0 },
      { x: rx0 + w * 0.5, y: ry0 - h * 0.05 },
      { x: rx1, y: ry0 },
      { x: rx1, y: ry1 },
      { x: rx0 + w * 0.45, y: ry1 + h * 0.06 },
      { x: rx0, y: ry1 },
    ]
  }

  private renderLayout() {
    this.container.innerHTML = `
      <!-- TOP HUD TOOLBAR -->
      <div class="viewer-toolbar glass-panel">
        <div class="toolbar-left">
          <div class="active-layer-indicator">
            <span class="pulse-dot"></span>
            <span id="active-layer-name" class="font-mono text-cyan">LRO_WAC_GLOBAL_ORTHO_V2.0.TIF</span>
          </div>
          <div class="layer-selector-group">
            <button type="button" class="btn-layer-toggle active" data-layer="reference" title="View Global Lunar Reference Mosaic (LRO WAC)">Reference Mosaic</button>
            <button type="button" class="btn-layer-toggle" data-layer="source" title="View Calibrated TMC Sensor Strip">TMC Strip</button>
            <button type="button" class="btn-layer-toggle" data-layer="dual" title="Side-by-side Dual Layer Mode">Dual View</button>
          </div>
        </div>

        <div class="toolbar-center">
          <span class="dim-chip" id="chip-image-dim">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>
            100,000 × 75,000 px (Virtual Tiled Raster)
          </span>
          <span class="dim-chip" id="chip-zoom-level">Zoom: 100%</span>
        </div>

        <div class="toolbar-right">
          <button type="button" id="btn-zoom-in" class="hud-tool-btn" title="Zoom In (+)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
          </button>
          <button type="button" id="btn-zoom-out" class="hud-tool-btn" title="Zoom Out (-)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
          </button>
          <button type="button" id="btn-fit-screen" class="hud-tool-btn" title="Fit Entire Scene to Viewport">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>
            Fit
          </button>
          <button type="button" id="btn-reset-viewer" class="hud-tool-btn" title="Reset Viewport Pan & Scale">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><polyline points="23 20 23 14 17 14"/><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/></svg>
            Reset
          </button>
          <button type="button" id="btn-toggle-viewer-grid" class="hud-tool-btn active" title="Toggle Lat/Lon & Pixel Grid">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/></svg>
            Grid
          </button>
          <button type="button" id="btn-center-roi" class="hud-tool-btn" title="Center Viewport on Active ROI">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/></svg>
            ROI
          </button>
          <button type="button" id="btn-toggle-viewer-features" class="hud-tool-btn" title="Toggle SIFT Keypoints & Matched Feature Lines">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="6" cy="6" r="3"/><circle cx="18" cy="18" r="3"/><line x1="8.5" y1="8.5" x2="15.5" y2="15.5"/></svg>
            Features
          </button>
          <button type="button" id="btn-toggle-viewer-compare" class="hud-tool-btn" title="Toggle Split Wipe Comparison Slider">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M2 12h20"/></svg>
            Compare
          </button>
        </div>
      </div>

      <!-- WORKSTATION VIEWPORT CANVAS CONTAINER WITH RULERS -->
      <div class="viewer-workspace-stage">
        <!-- TOP-LEFT CORNER RULER ORIGIN -->
        <div class="ruler-corner-box" title="Lunar Projection Frame: IAU2000 Equidistant Cylindrical">
          <span class="corner-unit">px</span>
        </div>

        <!-- TOP SCIENTIFIC COORDINATE RULER -->
        <div class="ruler-top-container">
          <canvas id="ruler-top-canvas" height="24"></canvas>
        </div>

        <!-- LEFT SCIENTIFIC COORDINATE RULER -->
        <div class="ruler-left-container">
          <canvas id="ruler-left-canvas" width="42"></canvas>
        </div>

        <!-- MAIN LUNAR VIEWPORT CANVAS -->
        <div class="viewer-main-canvas-wrap" id="viewer-main-wrap">
          <canvas id="viewer-main-canvas"></canvas>

          <!-- CORNER RETICLES -->
          <div class="reticle-tl"></div>
          <div class="reticle-tr"></div>
          <div class="reticle-bl"></div>
          <div class="reticle-br"></div>

          <!-- FLOATING CURSOR TELEMETRY READOUT (BOTTOM-LEFT) -->
          <div class="viewer-telemetry-hud bottom-left">
            <div class="hud-stat-line">
              <span class="k">PIXEL:</span>
              <span id="hud-readout-px" class="v">X: — | Y: —</span>
            </div>
            <div class="hud-stat-line">
              <span class="k">LUNAR:</span>
              <span id="hud-readout-geo" class="v text-cyan">Lat: — | Lon: —</span>
            </div>
            <div class="hud-stat-line">
              <span class="k">SENSOR DN:</span>
              <span id="hud-readout-dn" class="v text-gold">DN: — (Reflectance: —)</span>
            </div>
          </div>

          <!-- FLOATING SCALE BAR (BOTTOM-RIGHT) -->
          <div class="viewer-telemetry-hud bottom-right">
            <div class="scale-bar-display">
              <div class="scale-bar-line" id="scale-bar-graphic">
                <span class="scale-tick start"></span>
                <span class="scale-tick mid"></span>
                <span class="scale-tick end"></span>
              </div>
              <div class="scale-bar-labels">
                <span id="scale-distance-label" class="v">10.0 km</span>
                <span id="scale-gsd-label" class="sub">GSD: 5.0 m/px</span>
              </div>
            </div>
          </div>

          <!-- DRAG GUIDE HINT -->
          <div class="viewer-hint-overlay" id="viewer-guide-hint">
            <span>DRAG BOX TO MOVE ROI • USE CORNER HANDLES TO RESIZE • WHEEL TO ZOOM</span>
          </div>
        </div>
      </div>
    `

    this.viewportEl = this.container.querySelector('#viewer-main-wrap')!
    this.mainCanvas = this.container.querySelector('#viewer-main-canvas')!
    this.mainCtx = this.mainCanvas.getContext('2d', { alpha: false })!

    this.topRulerCanvas = this.container.querySelector('#ruler-top-canvas')!
    this.topRulerCtx = this.topRulerCanvas.getContext('2d')!

    this.leftRulerCanvas = this.container.querySelector('#ruler-left-canvas')!
    this.leftRulerCtx = this.leftRulerCanvas.getContext('2d')!
  }

  private resizeObserver: ResizeObserver | null = null

  private initCanvases() {
    this.resizeCanvases()
    window.addEventListener('resize', () => {
      this.resizeCanvases()
      this.requestRedraw()
    })

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          if (entry.contentRect.width > 20 && entry.contentRect.height > 20) {
            this.resizeCanvases()
            this.centerOnRoi()
            break
          }
        }
      })
      this.resizeObserver.observe(this.viewportEl)
    }
  }

  public resizeCanvases() {
    const rect = this.viewportEl.getBoundingClientRect()
    if (!rect || rect.width <= 0 || rect.height <= 0) return

    const dpr = window.devicePixelRatio || 1

    this.mainCanvas.width = rect.width * dpr
    this.mainCanvas.height = rect.height * dpr
    this.mainCanvas.style.width = `${rect.width}px`
    this.mainCanvas.style.height = `${rect.height}px`
    this.mainCtx.resetTransform?.()
    this.mainCtx.scale(dpr, dpr)

    this.topRulerCanvas.width = rect.width * dpr
    this.topRulerCanvas.height = 24 * dpr
    this.topRulerCanvas.style.width = `${rect.width}px`
    this.topRulerCanvas.style.height = `24px`
    this.topRulerCtx.resetTransform?.()
    this.topRulerCtx.scale(dpr, dpr)

    this.leftRulerCanvas.width = 42 * dpr
    this.leftRulerCanvas.height = rect.height * dpr
    this.leftRulerCanvas.style.width = `42px`
    this.leftRulerCanvas.style.height = `${rect.height}px`
    this.leftRulerCtx.resetTransform?.()
    this.leftRulerCtx.scale(dpr, dpr)
    this.requestRedraw()
  }

  private updateLayerButtons() {
    const btns = this.container.querySelectorAll('.btn-layer-toggle')
    btns.forEach(b => {
      const el = b as HTMLButtonElement
      el.classList.toggle('active', el.dataset.layer === this.layerMode)
    })

    const nameEl = this.container.querySelector('#active-layer-name')
    const dimEl = this.container.querySelector('#chip-image-dim')

    if (this.layerMode === 'source') {
      if (nameEl) nameEl.textContent = 'CH1_TMC_NADIR_20090529_CALIBRATED.IMG'
      if (dimEl) dimEl.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/></svg> 4,000 × 52,000 px (Pushbroom Swath)`
    } else {
      if (nameEl) nameEl.textContent = 'LRO_WAC_GLOBAL_ORTHO_V2.0.TIF'
      if (dimEl) dimEl.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/></svg> 100,000 × 75,000 px (Virtual Tiled Raster)`
    }
  }

  private attachEvents() {
    // Toolbar buttons
    this.container.querySelector('#btn-zoom-in')?.addEventListener('click', () => this.zoomIn())
    this.container.querySelector('#btn-zoom-out')?.addEventListener('click', () => this.zoomOut())
    this.container.querySelector('#btn-fit-screen')?.addEventListener('click', () => this.fitToScreen())
    this.container.querySelector('#btn-reset-viewer')?.addEventListener('click', () => this.resetView())
    this.container.querySelector('#btn-toggle-viewer-grid')?.addEventListener('click', () => this.toggleGrid())
    this.container.querySelector('#btn-center-roi')?.addEventListener('click', () => {
      this.centerOnRoi()
    })

    const btnFeatures = this.container.querySelector('#btn-toggle-viewer-features')
    btnFeatures?.addEventListener('click', () => {
      this.showFeatures = !this.showFeatures
      btnFeatures.classList.toggle('active', this.showFeatures)
      this.requestRedraw()
    })

    const btnCompare = this.container.querySelector('#btn-toggle-viewer-compare')
    btnCompare?.addEventListener('click', () => {
      this.isCompareMode = !this.isCompareMode
      btnCompare.classList.toggle('active', this.isCompareMode)
      this.requestRedraw()
    })

    // Layer switcher
    this.container.querySelectorAll('.btn-layer-toggle').forEach(b => {
      b.addEventListener('click', () => {
        const layer = (b as HTMLElement).dataset.layer as ViewerLayerMode
        this.setLayerMode(layer)
      })
    })

    // Wheel Zoom
    this.viewportEl.addEventListener('wheel', (e) => {
      e.preventDefault()
      const rect = this.viewportEl.getBoundingClientRect()
      const mouseX = e.clientX - rect.left
      const mouseY = e.clientY - rect.top
      const factor = e.deltaY < 0 ? 1.2 : 1 / 1.2
      this.applyZoom(factor, mouseX, mouseY)
    }, { passive: false })

    // Mouse Down
    this.viewportEl.addEventListener('mousedown', (e) => {
      const rect = this.viewportEl.getBoundingClientRect()
      const mouseX = e.clientX - rect.left
      const mouseY = e.clientY - rect.top

      // Check comparison wipe slider drag
      if (this.isCompareMode) {
        const splitX = rect.width * this.compareSplitRatio
        if (Math.abs(mouseX - splitX) < 16) {
          this.isDraggingSplitter = true
          this.viewportEl.style.cursor = 'ew-resize'
          return
        }
      }

      const { worldX, worldY } = this.screenToWorld(mouseX, mouseY)

      // Check handle click first
      const handle = this.getHandleAt(mouseX, mouseY)
      if (handle) {
        this.isResizingRoi = true
        this.activeHandle = handle
        this.dragStartX = mouseX
        this.dragStartY = mouseY
        this.initialRoiCoords = { ...this.coords }
        return
      }

      // Check polygon point drag in polygon mode
      if (this.shapeMode === 'polygon') {
        const polyIdx = this.getPolygonPointAt(mouseX, mouseY)
        if (polyIdx !== null) {
          this.activePolygonIndex = polyIdx
          this.isDraggingRoi = true
          this.dragStartX = mouseX
          this.dragStartY = mouseY
          return
        }
      }

      // Check ROI inside click
      if (this.isPointInsideRoi(worldX, worldY)) {
        this.isDraggingRoi = true
        this.dragStartX = mouseX
        this.dragStartY = mouseY
        this.initialRoiCoords = { ...this.coords }
        this.viewportEl.style.cursor = 'grabbing'
        return
      }

      // Canvas pan
      this.isPanning = true
      this.panStartX = mouseX
      this.panStartY = mouseY
      this.startPanX = this.panX
      this.startPanY = this.panY
      this.viewportEl.style.cursor = 'grabbing'
    })

    // Mouse Move
    window.addEventListener('mousemove', (e) => {
      const rect = this.viewportEl.getBoundingClientRect()
      const mouseX = e.clientX - rect.left
      const mouseY = e.clientY - rect.top
      const isInside = mouseX >= 0 && mouseX <= rect.width && mouseY >= 0 && mouseY <= rect.height
      this.isMouseInside = isInside

      if (isInside) {
        const { worldX, worldY } = this.screenToWorld(mouseX, mouseY)
        this.mouseWorldX = worldX
        this.mouseWorldY = worldY
        this.updateTelemetryHud(worldX, worldY)
      }

      // Handle Split Wipe Drag
      if (this.isDraggingSplitter) {
        this.compareSplitRatio = Math.max(0.05, Math.min(0.95, mouseX / rect.width))
        this.requestRedraw()
        return
      }

      // Handle Resizing
      if (this.isResizingRoi && this.activeHandle && this.initialRoiCoords) {
        this.handleResizeDrag(mouseX, mouseY)
        this.requestRedraw()
        return
      }

      // Handle Polygon Point Drag
      if (this.shapeMode === 'polygon' && this.isDraggingRoi && this.activePolygonIndex !== null) {
        const { worldX, worldY } = this.screenToWorld(mouseX, mouseY)
        this.polygonPoints[this.activePolygonIndex] = { x: worldX, y: worldY }
        this.syncCoordsFromPolygon()
        this.requestRedraw()
        return
      }

      // Handle Box Drag
      if (this.isDraggingRoi && this.initialRoiCoords) {
        const dxScreen = mouseX - this.dragStartX
        const dyScreen = mouseY - this.dragStartY
        const dxWorld = dxScreen / this.zoom
        const dyWorld = dyScreen / this.zoom

        if (this.layerMode === 'source') {
          const w = this.initialRoiCoords.src_sample_end - this.initialRoiCoords.src_sample_start
          const h = this.initialRoiCoords.src_line_end - this.initialRoiCoords.src_line_start
          let newS0 = Math.max(0, Math.min(this.SRC_WIDTH - w, Math.round(this.initialRoiCoords.src_sample_start + dxWorld)))
          let newL0 = Math.max(0, Math.min(this.SRC_HEIGHT - h, Math.round(this.initialRoiCoords.src_line_start + dyWorld)))
          this.coords.src_sample_start = newS0
          this.coords.src_sample_end = newS0 + w
          this.coords.src_line_start = newL0
          this.coords.src_line_end = newL0 + h
        } else {
          const w = this.initialRoiCoords.ref_x1 - this.initialRoiCoords.ref_x0
          const h = this.initialRoiCoords.ref_y1 - this.initialRoiCoords.ref_y0
          let newX0 = Math.max(0, Math.min(this.REF_WIDTH - w, Math.round(this.initialRoiCoords.ref_x0 + dxWorld)))
          let newY0 = Math.max(0, Math.min(this.REF_HEIGHT - h, Math.round(this.initialRoiCoords.ref_y0 + dyWorld)))
          this.coords.ref_x0 = newX0
          this.coords.ref_x1 = newX0 + w
          this.coords.ref_y0 = newY0
          this.coords.ref_y1 = newY0 + h
        }

        this.initPolygonFromCoords()
        this.onRoiChange(this.coords)
        this.requestRedraw()
        return
      }

      // Handle Panning
      if (this.isPanning) {
        this.panX = this.startPanX + (mouseX - this.panStartX)
        this.panY = this.startPanY + (mouseY - this.panStartY)
        this.requestRedraw()
        return
      }

      // Update Cursor style
      if (isInside) {
        if (this.isCompareMode && Math.abs(mouseX - rect.width * this.compareSplitRatio) < 14) {
          this.viewportEl.style.cursor = 'ew-resize'
        } else {
          const handle = this.getHandleAt(mouseX, mouseY)
          if (handle) {
            this.viewportEl.style.cursor = this.getCursorForHandle(handle)
          } else if (this.shapeMode === 'polygon' && this.getPolygonPointAt(mouseX, mouseY) !== null) {
            this.viewportEl.style.cursor = 'crosshair'
          } else {
            const { worldX, worldY } = this.screenToWorld(mouseX, mouseY)
            if (this.isPointInsideRoi(worldX, worldY)) {
              this.viewportEl.style.cursor = 'move'
            } else {
              this.viewportEl.style.cursor = 'grab'
            }
          }
        }
        this.requestRedraw()
      }
    })

    // Mouse Up
    window.addEventListener('mouseup', () => {
      if (this.isPanning || this.isDraggingRoi || this.isResizingRoi || this.isDraggingSplitter) {
        this.isPanning = false
        this.isDraggingRoi = false
        this.isResizingRoi = false
        this.isDraggingSplitter = false
        this.activeHandle = null
        this.activePolygonIndex = null
        this.initialRoiCoords = null
        this.viewportEl.style.cursor = 'grab'
        this.requestRedraw()
      }
    })

    // Touch Support (Mobile & Tablet)
    let touchStartDist = 0
    let isPinching = false

    this.viewportEl.addEventListener('touchstart', (e: TouchEvent) => {
      if (e.touches.length === 1) {
        const touch = e.touches[0]
        const rect = this.viewportEl.getBoundingClientRect()
        const mouseX = touch.clientX - rect.left
        const mouseY = touch.clientY - rect.top

        // Comparison slider
        if (this.isCompareMode && Math.abs(mouseX - rect.width * this.compareSplitRatio) < 28) {
          this.isDraggingSplitter = true
          return
        }

        const { worldX, worldY } = this.screenToWorld(mouseX, mouseY)
        if (this.isPointInsideRoi(worldX, worldY)) {
          this.isDraggingRoi = true
          this.dragStartX = mouseX
          this.dragStartY = mouseY
          this.initialRoiCoords = { ...this.coords }
          return
        }

        this.isPanning = true
        this.panStartX = mouseX
        this.panStartY = mouseY
        this.startPanX = this.panX
        this.startPanY = this.panY
      } else if (e.touches.length === 2) {
        this.isPanning = false
        this.isDraggingRoi = false
        this.isDraggingSplitter = false
        isPinching = true
        const dx = e.touches[0].clientX - e.touches[1].clientX
        const dy = e.touches[0].clientY - e.touches[1].clientY
        touchStartDist = Math.hypot(dx, dy)
      }
    }, { passive: false })

    window.addEventListener('touchmove', (e: TouchEvent) => {
      const rect = this.viewportEl.getBoundingClientRect()
      if (this.isDraggingSplitter && e.touches.length === 1) {
        const mouseX = e.touches[0].clientX - rect.left
        this.compareSplitRatio = Math.max(0.05, Math.min(0.95, mouseX / rect.width))
        this.requestRedraw()
        if (e.cancelable) e.preventDefault()
        return
      }

      if (this.isDraggingRoi && this.initialRoiCoords && e.touches.length === 1) {
        const mouseX = e.touches[0].clientX - rect.left
        const mouseY = e.touches[0].clientY - rect.top
        const dxScreen = mouseX - this.dragStartX
        const dyScreen = mouseY - this.dragStartY
        const dxWorld = dxScreen / this.zoom
        const dyWorld = dyScreen / this.zoom

        if (this.layerMode === 'source') {
          const w = this.initialRoiCoords.src_sample_end - this.initialRoiCoords.src_sample_start
          const h = this.initialRoiCoords.src_line_end - this.initialRoiCoords.src_line_start
          let newS0 = Math.max(0, Math.min(this.SRC_WIDTH - w, Math.round(this.initialRoiCoords.src_sample_start + dxWorld)))
          let newL0 = Math.max(0, Math.min(this.SRC_HEIGHT - h, Math.round(this.initialRoiCoords.src_line_start + dyWorld)))
          this.coords.src_sample_start = newS0
          this.coords.src_sample_end = newS0 + w
          this.coords.src_line_start = newL0
          this.coords.src_line_end = newL0 + h
        } else {
          const w = this.initialRoiCoords.ref_x1 - this.initialRoiCoords.ref_x0
          const h = this.initialRoiCoords.ref_y1 - this.initialRoiCoords.ref_y0
          let newX0 = Math.max(0, Math.min(this.REF_WIDTH - w, Math.round(this.initialRoiCoords.ref_x0 + dxWorld)))
          let newY0 = Math.max(0, Math.min(this.REF_HEIGHT - h, Math.round(this.initialRoiCoords.ref_y0 + dyWorld)))
          this.coords.ref_x0 = newX0
          this.coords.ref_x1 = newX0 + w
          this.coords.ref_y0 = newY0
          this.coords.ref_y1 = newY0 + h
        }
        this.initPolygonFromCoords()
        this.onRoiChange(this.coords)
        this.requestRedraw()
        if (e.cancelable) e.preventDefault()
        return
      }

      if (this.isPanning && e.touches.length === 1) {
        const mouseX = e.touches[0].clientX - rect.left
        const mouseY = e.touches[0].clientY - rect.top
        this.panX = this.startPanX + (mouseX - this.panStartX)
        this.panY = this.startPanY + (mouseY - this.panStartY)
        this.requestRedraw()
        if (e.cancelable) e.preventDefault()
        return
      }

      if (isPinching && e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX
        const dy = e.touches[0].clientY - e.touches[1].clientY
        const currentDist = Math.hypot(dx, dy)
        if (touchStartDist > 0 && Math.abs(currentDist - touchStartDist) > 2) {
          const factor = currentDist / touchStartDist
          const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left
          const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top
          this.applyZoom(factor, midX, midY)
          touchStartDist = currentDist
        }
        if (e.cancelable) e.preventDefault()
      }
    }, { passive: false })

    window.addEventListener('touchend', () => {
      this.isPanning = false
      this.isDraggingRoi = false
      this.isDraggingSplitter = false
      isPinching = false
      touchStartDist = 0
    })
  }

  private applyZoom(factor: number, cx: number, cy: number) {
    const newZoom = Math.min(40.0, Math.max(0.0005, this.zoom * factor))
    if (newZoom === this.zoom) return

    // Keep world coordinate under (cx, cy) invariant
    const world = this.screenToWorld(cx, cy)
    this.zoom = newZoom
    this.panX = cx - world.worldX * this.zoom
    this.panY = cy - world.worldY * this.zoom

    // Update Zoom chip
    const chip = this.container.querySelector('#chip-zoom-level')
    if (chip) {
      chip.textContent = `Zoom: ${Math.round(this.zoom * 1000)}%`
    }

    this.requestRedraw()
  }

  public centerOnRoi() {
    const rect = this.viewportEl.getBoundingClientRect()
    let cx = this.coords.ref_x0 + (this.coords.ref_x1 - this.coords.ref_x0) / 2
    let cy = this.coords.ref_y0 + (this.coords.ref_y1 - this.coords.ref_y0) / 2
    let rw = Math.max(500, this.coords.ref_x1 - this.coords.ref_x0)
    let rh = Math.max(500, this.coords.ref_y1 - this.coords.ref_y0)

    if (this.layerMode === 'source') {
      cx = this.coords.src_sample_start + (this.coords.src_sample_end - this.coords.src_sample_start) / 2
      cy = this.coords.src_line_start + (this.coords.src_line_end - this.coords.src_line_start) / 2
      rw = Math.max(500, this.coords.src_sample_end - this.coords.src_sample_start)
      rh = Math.max(500, this.coords.src_line_end - this.coords.src_line_start)
    }

    const availW = Math.max(200, rect.width - 80)
    const availH = Math.max(200, rect.height - 80)
    this.zoom = Math.min(availW / (rw * 1.6), availH / (rh * 1.6))
    this.panX = rect.width / 2 - cx * this.zoom
    this.panY = rect.height / 2 - cy * this.zoom

    const chip = this.container.querySelector('#chip-zoom-level')
    if (chip) {
      chip.textContent = `Zoom: ${Math.round(this.zoom * 1000)}%`
    }

    this.requestRedraw()
  }

  private screenToWorld(sx: number, sy: number): { worldX: number; worldY: number } {
    return {
      worldX: (sx - this.panX) / this.zoom,
      worldY: (sy - this.panY) / this.zoom,
    }
  }

  private worldToScreen(wx: number, wy: number): { screenX: number; screenY: number } {
    return {
      screenX: wx * this.zoom + this.panX,
      screenY: wy * this.zoom + this.panY,
    }
  }

  private isPointInsideRoi(wx: number, wy: number): boolean {
    if (this.layerMode === 'source') {
      return (
        wx >= this.coords.src_sample_start &&
        wx <= this.coords.src_sample_end &&
        wy >= this.coords.src_line_start &&
        wy <= this.coords.src_line_end
      )
    }
    return (
      wx >= this.coords.ref_x0 &&
      wx <= this.coords.ref_x1 &&
      wy >= this.coords.ref_y0 &&
      wy <= this.coords.ref_y1
    )
  }

  private getHandleAt(sx: number, sy: number): string | null {
    const handles = this.getRoiHandlesScreen()
    const hitRadius = 8

    for (const h of handles) {
      const dist = Math.hypot(sx - h.x, sy - h.y)
      if (dist <= hitRadius) {
        return h.name
      }
    }
    return null
  }

  private getPolygonPointAt(sx: number, sy: number): number | null {
    for (let i = 0; i < this.polygonPoints.length; i++) {
      const p = this.polygonPoints[i]
      const scr = this.worldToScreen(p.x, p.y)
      if (Math.hypot(sx - scr.screenX, sy - scr.screenY) <= 8) {
        return i
      }
    }
    return null
  }

  private syncCoordsFromPolygon() {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    for (const p of this.polygonPoints) {
      minX = Math.min(minX, p.x)
      maxX = Math.max(maxX, p.x)
      minY = Math.min(minY, p.y)
      maxY = Math.max(maxY, p.y)
    }

    if (this.layerMode === 'source') {
      this.coords.src_sample_start = Math.round(minX)
      this.coords.src_sample_end = Math.round(maxX)
      this.coords.src_line_start = Math.round(minY)
      this.coords.src_line_end = Math.round(maxY)
    } else {
      this.coords.ref_x0 = Math.round(minX)
      this.coords.ref_x1 = Math.round(maxX)
      this.coords.ref_y0 = Math.round(minY)
      this.coords.ref_y1 = Math.round(maxY)
    }
    this.onRoiChange(this.coords)
  }

  private getRoiHandlesScreen(): { name: string; x: number; y: number }[] {
    let wx0 = this.coords.ref_x0
    let wy0 = this.coords.ref_y0
    let wx1 = this.coords.ref_x1
    let wy1 = this.coords.ref_y1

    if (this.layerMode === 'source') {
      wx0 = this.coords.src_sample_start
      wy0 = this.coords.src_line_start
      wx1 = this.coords.src_sample_end
      wy1 = this.coords.src_line_end
    }

    const p0 = this.worldToScreen(wx0, wy0)
    const p1 = this.worldToScreen(wx1, wy1)
    const midX = (p0.screenX + p1.screenX) / 2
    const midY = (p0.screenY + p1.screenY) / 2

    return [
      { name: 'nw', x: p0.screenX, y: p0.screenY },
      { name: 'n',  x: midX,       y: p0.screenY },
      { name: 'ne', x: p1.screenX, y: p0.screenY },
      { name: 'e',  x: p1.screenX, y: midY },
      { name: 'se', x: p1.screenX, y: p1.screenY },
      { name: 's',  x: midX,       y: p1.screenY },
      { name: 'sw', x: p0.screenX, y: p1.screenY },
      { name: 'w',  x: p0.screenX, y: midY },
    ]
  }

  private getCursorForHandle(handle: string): string {
    switch (handle) {
      case 'nw': case 'se': return 'nwse-resize'
      case 'ne': case 'sw': return 'nesw-resize'
      case 'n':  case 's':  return 'ns-resize'
      case 'e':  case 'w':  return 'ew-resize'
      default: return 'default'
    }
  }

  private handleResizeDrag(sx: number, sy: number) {
    if (!this.initialRoiCoords || !this.activeHandle) return

    const dxWorld = (sx - this.dragStartX) / this.zoom
    const dyWorld = (sy - this.dragStartY) / this.zoom

    if (this.layerMode === 'source') {
      let s0 = this.initialRoiCoords.src_sample_start
      let s1 = this.initialRoiCoords.src_sample_end
      let l0 = this.initialRoiCoords.src_line_start
      let l1 = this.initialRoiCoords.src_line_end

      if (this.activeHandle.includes('w')) s0 = Math.min(s1 - 200, Math.max(0, s0 + dxWorld))
      if (this.activeHandle.includes('e')) s1 = Math.max(s0 + 200, Math.min(this.SRC_WIDTH, s1 + dxWorld))
      if (this.activeHandle.includes('n')) l0 = Math.min(l1 - 200, Math.max(0, l0 + dyWorld))
      if (this.activeHandle.includes('s')) l1 = Math.max(l0 + 200, Math.min(this.SRC_HEIGHT, l1 + dyWorld))

      this.coords.src_sample_start = Math.round(s0)
      this.coords.src_sample_end = Math.round(s1)
      this.coords.src_line_start = Math.round(l0)
      this.coords.src_line_end = Math.round(l1)
    } else {
      let x0 = this.initialRoiCoords.ref_x0
      let x1 = this.initialRoiCoords.ref_x1
      let y0 = this.initialRoiCoords.ref_y0
      let y1 = this.initialRoiCoords.ref_y1

      if (this.activeHandle.includes('w')) x0 = Math.min(x1 - 500, Math.max(0, x0 + dxWorld))
      if (this.activeHandle.includes('e')) x1 = Math.max(x0 + 500, Math.min(this.REF_WIDTH, x1 + dxWorld))
      if (this.activeHandle.includes('n')) y0 = Math.min(y1 - 500, Math.max(0, y0 + dyWorld))
      if (this.activeHandle.includes('s')) y1 = Math.max(y0 + 500, Math.min(this.REF_HEIGHT, y1 + dyWorld))

      this.coords.ref_x0 = Math.round(x0)
      this.coords.ref_x1 = Math.round(x1)
      this.coords.ref_y0 = Math.round(y0)
      this.coords.ref_y1 = Math.round(y1)
    }

    this.initPolygonFromCoords()
    this.onRoiChange(this.coords)
  }

  private updateTelemetryHud(wx: number, wy: number) {
    const pxEl = this.container.querySelector('#hud-readout-px')
    const geoEl = this.container.querySelector('#hud-readout-geo')
    const dnEl = this.container.querySelector('#hud-readout-dn')

    const clampedX = Math.max(0, Math.round(wx))
    const clampedY = Math.max(0, Math.round(wy))

    if (pxEl) {
      if (this.layerMode === 'source') {
        pxEl.textContent = `Sample: ${clampedX.toLocaleString()} | Line: ${clampedY.toLocaleString()}`
      } else {
        pxEl.textContent = `X: ${clampedX.toLocaleString()} px | Y: ${clampedY.toLocaleString()} px`
      }
    }

    // Lunar Geographic Equidistant Projection:
    // Reference center: Lat 0, Lon 0 at (50000, 37500)
    // 100,000 px = 360 deg Lon (0.0036 deg/px)
    // 75,000 px = 180 deg Lat (0.0024 deg/px)
    const latDeg = (37500 - clampedY) * 0.0024
    const lonDeg = (clampedX - 50000) * 0.0036

    const latDms = this.formatDms(latDeg, true)
    const lonDms = this.formatDms(lonDeg, false)

    if (geoEl) {
      geoEl.textContent = `Lat: ${latDms} | Lon: ${lonDms}`
    }

    // Realistic procedural reflectance and DN value under crosshair
    const pseudoDn = Math.round(90 + (Math.sin(clampedX * 0.01) * 30) + (Math.cos(clampedY * 0.01) * 25) + ((clampedX % 17) * 2))
    const reflectance = (pseudoDn / 1024).toFixed(3)

    if (dnEl) {
      dnEl.textContent = `DN: ${pseudoDn} (Albedo: ${reflectance})`
    }

    // Update dynamic scale bar
    this.updateScaleBar()
  }

  private formatDms(degVal: number, isLat: boolean): string {
    const dir = isLat ? (degVal >= 0 ? 'N' : 'S') : (degVal >= 0 ? 'E' : 'W')
    const absDeg = Math.abs(degVal)
    const d = Math.floor(absDeg)
    const m = Math.floor((absDeg - d) * 60)
    const s = Math.round(((absDeg - d) * 60 - m) * 60)
    return `${d.toString().padStart(2, '0')}°${m.toString().padStart(2, '0')}'${s.toString().padStart(2, '0')}" ${dir}`
  }

  private updateScaleBar() {
    const distEl = this.container.querySelector('#scale-distance-label')
    const gsdEl = this.container.querySelector('#scale-gsd-label')
    const graphicEl = this.container.querySelector<HTMLElement>('#scale-bar-graphic')

    // Screen distance represented by 120 pixels:
    const screenWidthPx = 120
    const worldWidthUnits = screenWidthPx / this.zoom
    // Assume 5 meters per unit in source or 100 meters in ref
    const metersPerUnit = this.layerMode === 'source' ? 5.0 : 50.0
    const totalMeters = worldWidthUnits * metersPerUnit

    let label = ''
    if (totalMeters >= 1000) {
      label = `${(totalMeters / 1000).toFixed(1)} km`
    } else {
      label = `${Math.round(totalMeters)} m`
    }

    if (distEl) distEl.textContent = label
    if (gsdEl) gsdEl.textContent = `GSD: ${metersPerUnit.toFixed(1)} m/px`
    if (graphicEl) graphicEl.style.width = `${screenWidthPx}px`
  }

  private isActive: boolean = true
  private needsRedraw: boolean = false

  public setActive(active: boolean) {
    this.isActive = active
    if (active) {
      this.requestRedraw()
    } else if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId)
      this.animationFrameId = null
      this.needsRedraw = false
    }
  }

  private startRenderLoop() {
    // Initial draw
    this.requestRedraw()
  }

  public requestRedraw() {
    // Skip rendering if hidden or destroyed
    if (!this.isActive || (this.viewportEl && this.viewportEl.offsetParent === null)) {
      return
    }
    if (this.needsRedraw) return

    this.needsRedraw = true
    this.animationFrameId = requestAnimationFrame(() => {
      this.needsRedraw = false
      this.pulsePhase += 0.03
      this.draw()
      this.drawRulers()

      // If active drag/pan or compare mode interaction, keep frame rate responsive
      if (this.isDraggingRoi || this.activeHandle !== null || this.isPanning || this.isDraggingSplitter) {
        this.requestRedraw()
      }
    })
  }

  // =========================================================================
  // MAIN VIEWPORT RENDERING ENGINE
  // =========================================================================
  private draw() {
    const ctx = this.mainCtx
    const w = this.viewportEl.clientWidth
    const h = this.viewportEl.clientHeight

    // Clear background
    ctx.fillStyle = '#02050e'
    ctx.fillRect(0, 0, w, h)

    // Render Scientific Lunar Basemap (Tiled Procedural Elevation & Albedo)
    this.renderLunarBasemap(ctx, w, h)

    // Render Planetary Coordinate Graticule (Lat/Lon)
    if (this.showGrid) {
      this.renderCoordinateGrid(ctx, w, h)
    }

    // Render ROI Bounding Box & Polygon Overlay
    if (this.shapeMode === 'polygon') {
      this.renderRoiPolygon(ctx)
    } else {
      this.renderRoiRectangle(ctx)
    }

    // Render SIFT Keypoints and Matched Lines if enabled (Phase 5)
    if (this.showFeatures) {
      this.renderFeaturesAndMatches(ctx)
    }

    // Render Split Wipe Comparison if enabled (Phase 5)
    if (this.isCompareMode) {
      this.renderSplitWipeComparison(ctx, w, h)
    }

    // Render Crosshairs and Cursor Marker
    if (this.isMouseInside) {
      this.renderCursorCrosshair(ctx)
    }
  }

  private renderFeaturesAndMatches(ctx: CanvasRenderingContext2D) {
    ctx.save()

    let rx0 = this.coords.ref_x0
    let ry0 = this.coords.ref_y0
    let rx1 = this.coords.ref_x1
    let ry1 = this.coords.ref_y1

    if (this.layerMode === 'source') {
      rx0 = this.coords.src_sample_start
      ry0 = this.coords.src_line_start
      rx1 = this.coords.src_sample_end
      ry1 = this.coords.src_line_end
    }

    const rw = rx1 - rx0
    const rh = ry1 - ry0

    // Deterministic feature points and tie-point vectors
    const seed = Math.abs(rx0 * 13 + ry0 * 29)
    const numFeatures = 28

    for (let i = 0; i < numFeatures; i++) {
      const px = ((seed * (i + 1) * 37) % 1000) / 1000
      const py = ((seed * (i + 1) * 53) % 1000) / 1000
      const isRef = i % 2 === 0
      const inlier = i % 5 !== 0 // 80% inliers, 20% outliers

      const wx = rx0 + px * rw
      const wy = ry0 + py * rh

      const pScreen = this.worldToScreen(wx, wy)

      // Keypoint circle
      ctx.fillStyle = isRef ? '#f59e0b' : '#38bdf8'
      ctx.strokeStyle = '#020617'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.arc(pScreen.screenX, pScreen.screenY, 4, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()

      // Orientation vector needle
      const angle = (i * 35) * (Math.PI / 180)
      ctx.strokeStyle = isRef ? '#fef08a' : '#e0f2fe'
      ctx.lineWidth = 1.2
      ctx.beginPath()
      ctx.moveTo(pScreen.screenX, pScreen.screenY)
      ctx.lineTo(pScreen.screenX + Math.cos(angle) * 11, pScreen.screenY + Math.sin(angle) * 11)
      ctx.stroke()

      // Draw match vector to paired coordinate
      if (isRef && i + 1 < numFeatures) {
        const offsetDx = ((i % 3) - 1) * 20
        const offsetDy = (((i * 2) % 3) - 1) * 20
        const pPair = this.worldToScreen(wx + offsetDx, wy + offsetDy)

        ctx.strokeStyle = inlier ? 'rgba(16, 185, 129, 0.75)' : 'rgba(244, 63, 94, 0.65)'
        ctx.lineWidth = inlier ? 1.5 : 1
        ctx.setLineDash(inlier ? [] : [3, 3])
        ctx.beginPath()
        ctx.moveTo(pScreen.screenX, pScreen.screenY)
        ctx.lineTo(pPair.screenX, pPair.screenY)
        ctx.stroke()
        ctx.setLineDash([])
      }
    }

    ctx.restore()
  }

  private renderSplitWipeComparison(ctx: CanvasRenderingContext2D, w: number, h: number) {
    const splitX = w * this.compareSplitRatio

    ctx.save()

    // Right side semi-transparent overlay to simulate comparison strip
    ctx.fillStyle = 'rgba(245, 158, 11, 0.08)'
    ctx.fillRect(splitX, 0, w - splitX, h)

    // Dividing line
    ctx.strokeStyle = '#38bdf8'
    ctx.lineWidth = 2
    ctx.setLineDash([4, 4])
    ctx.beginPath()
    ctx.moveTo(splitX, 0)
    ctx.lineTo(splitX, h)
    ctx.stroke()
    ctx.setLineDash([])

    // Center circular thumb
    const thumbY = h / 2
    ctx.fillStyle = '#38bdf8'
    ctx.strokeStyle = '#020617'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(splitX, thumbY, 14, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()

    // Arrow icon inside thumb
    ctx.fillStyle = '#020617'
    ctx.font = 'bold 12px sans-serif'
    ctx.fillText('⇄', splitX - 6, thumbY + 4)

    // Left label: Reference
    ctx.fillStyle = 'rgba(5, 11, 26, 0.85)'
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.rect(splitX - 110, 10, 100, 22)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = '#38bdf8'
    ctx.font = '10px "JetBrains Mono", monospace'
    ctx.fillText('◀ REFERENCE', splitX - 98, 25)

    // Right label: Source
    ctx.fillStyle = 'rgba(5, 11, 26, 0.85)'
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.4)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.rect(splitX + 10, 10, 100, 22)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = '#f59e0b'
    ctx.fillText('SOURCE TMC ▶', splitX + 20, 25)

    ctx.restore()
  }

  private renderLunarBasemap(ctx: CanvasRenderingContext2D, screenW: number, screenH: number) {
    // 1. Draw Authentic Lunar Basemap plate across the workstation canvas
    const basemapImg = this.layerMode === 'source'
      ? (this.srcImage && this.srcImageLoaded ? this.srcImage : (this.refImage && this.refImageLoaded ? this.refImage : null))
      : (this.refImage && this.refImageLoaded ? this.refImage : (this.srcImage && this.srcImageLoaded ? this.srcImage : null))

    if (basemapImg && basemapImg.complete) {
      ctx.save()
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      // Draw basemap scaled across canvas
      ctx.drawImage(basemapImg, 0, 0, screenW, screenH)

      // Contrast enhancing lunar atmosphere tint
      const grad = ctx.createLinearGradient(0, 0, screenW, screenH)
      grad.addColorStop(0, 'rgba(2, 6, 23, 0.40)')
      grad.addColorStop(0.5, 'rgba(15, 23, 42, 0.20)')
      grad.addColorStop(1, 'rgba(2, 6, 23, 0.50)')
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, screenW, screenH)
      ctx.restore()
    } else {
      // High-contrast lunar surface gradient fallback
      const grad = ctx.createLinearGradient(0, 0, screenW, screenH)
      if (this.layerMode === 'source') {
        grad.addColorStop(0, '#101726')
        grad.addColorStop(0.5, '#1e293b')
        grad.addColorStop(1, '#0f172a')
      } else {
        grad.addColorStop(0, '#141d2e')
        grad.addColorStop(0.35, '#243248')
        grad.addColorStop(0.65, '#3b4c66')
        grad.addColorStop(1, '#1a2336')
      }
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, screenW, screenH)
      this.renderProceduralCraters(ctx, 0, 0, screenW, screenH)
    }

    // 2. Draw High-Resolution Authentic Sub-Scene Crop inside the active ROI box!
    let rx0 = this.coords.ref_x0
    let ry0 = this.coords.ref_y0
    let rx1 = this.coords.ref_x1
    let ry1 = this.coords.ref_y1

    if (this.layerMode === 'source') {
      rx0 = this.coords.src_sample_start
      ry0 = this.coords.src_line_start
      rx1 = this.coords.src_sample_end
      ry1 = this.coords.src_line_end
    }

    const roiP0 = this.worldToScreen(rx0, ry0)
    const roiP1 = this.worldToScreen(rx1, ry1)
    const roiX = roiP0.screenX
    const roiY = roiP0.screenY
    const roiW = roiP1.screenX - roiP0.screenX
    const roiH = roiP1.screenY - roiP0.screenY

    const activeCrop = this.layerMode === 'source'
      ? (this.previewSrcImage || this.srcImage)
      : (this.previewRefImage || this.refImage)

    if (activeCrop && activeCrop.complete) {
      ctx.save()
      ctx.beginPath()
      ctx.rect(roiX, roiY, roiW, roiH)
      ctx.clip()
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(activeCrop, roiX, roiY, roiW, roiH)

      // Sub-scene contrast boost overlay
      ctx.fillStyle = 'rgba(56, 189, 248, 0.04)'
      ctx.fillRect(roiX, roiY, roiW, roiH)
      ctx.restore()
    }

    // Outer Map Border Reticle
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)'
    ctx.lineWidth = 1.5
    ctx.strokeRect(10, 10, screenW - 20, screenH - 20)

    // Corner brackets
    this.drawCornerBrackets(ctx, 10, 10, screenW - 20, screenH - 20, 20)
  }

  private renderProceduralCraters(ctx: CanvasRenderingContext2D, mapX: number, mapY: number, mapW: number, mapH: number) {
    // Generate deterministic crater fields based on world space coordinates
    const craters = [
      // Major Impact Basins & Craters (including Apollo 11 ROI region)
      { x: 0.62, y: 0.49, r: 0.05, name: 'Tranquillity Base (Apollo 11)' },
      { x: 0.61, y: 0.47, r: 0.025, name: 'Aldrin Crater' },
      { x: 0.63, y: 0.51, r: 0.02, name: 'Collins Crater' },
      { x: 0.60, y: 0.52, r: 0.018, name: 'Armstrong Crater' },
      { x: 0.25, y: 0.32, r: 0.08, name: 'Mare Serenitatis Basin' },
      { x: 0.65, y: 0.62, r: 0.12, name: 'Tycho Impact' },
      { x: 0.38, y: 0.72, r: 0.06, name: 'Clavius Rim' },
      { x: 0.78, y: 0.28, r: 0.09, name: 'Copernicus Complex' },
      { x: 0.18, y: 0.58, r: 0.05, name: 'Ptolemaeus' },
      { x: 0.48, y: 0.42, r: 0.07, name: 'Mare Tranquillitatis Central' },
      { x: 0.82, y: 0.78, r: 0.14, name: 'South Pole-Aitken Rim' },
      { x: 0.52, y: 0.18, r: 0.06, name: 'Sinus Iridum Arc' },
      { x: 0.30, y: 0.85, r: 0.05, name: 'Moretus Crater' },
      { x: 0.88, y: 0.45, r: 0.07, name: 'Kepler Rays' },
      { x: 0.12, y: 0.22, r: 0.04, name: 'Plato Floor' },
      { x: 0.72, y: 0.14, r: 0.05, name: 'Archimedes' },
    ]

    for (const c of craters) {
      const cx = mapX + c.x * mapW
      const cy = mapY + c.y * mapH
      const cr = c.r * Math.min(mapW, mapH)

      if (cr < 2) continue

      // Crater floor shadow & sunlit rim (sun from top-left ~315 deg)
      const craterGrad = ctx.createRadialGradient(cx - cr * 0.25, cy - cr * 0.25, cr * 0.1, cx, cy, cr)
      craterGrad.addColorStop(0, '#040711')
      craterGrad.addColorStop(0.7, '#0b1120')
      craterGrad.addColorStop(0.9, '#475569')
      craterGrad.addColorStop(1, '#94a3b8')

      ctx.fillStyle = craterGrad
      ctx.beginPath()
      ctx.arc(cx, cy, cr, 0, Math.PI * 2)
      ctx.fill()

      // High albedo sunlit rim edge
      ctx.strokeStyle = 'rgba(241, 245, 249, 0.45)'
      ctx.lineWidth = Math.max(1, cr * 0.08)
      ctx.beginPath()
      ctx.arc(cx, cy, cr, Math.PI * 0.7, Math.PI * 1.8)
      ctx.stroke()

      // Shadowed rim edge
      ctx.strokeStyle = 'rgba(2, 6, 23, 0.75)'
      ctx.lineWidth = Math.max(1, cr * 0.1)
      ctx.beginPath()
      ctx.arc(cx, cy, cr, Math.PI * 1.8, Math.PI * 0.7)
      ctx.stroke()

      // Central peak for large impact structures
      if (cr > 35) {
        ctx.fillStyle = '#cbd5e1'
        ctx.beginPath()
        ctx.arc(cx - cr * 0.05, cy - cr * 0.05, cr * 0.15, 0, Math.PI * 2)
        ctx.fill()
      }

      // Feature Label when zoomed in
      if (cr > 60) {
        ctx.fillStyle = 'rgba(148, 163, 184, 0.75)'
        ctx.font = '9px "JetBrains Mono", monospace'
        ctx.fillText(c.name, cx - cr * 0.8, cy + cr + 14)
      }
    }
  }

  private renderCoordinateGrid(ctx: CanvasRenderingContext2D, screenW: number, screenH: number) {
    const maxW = this.layerMode === 'source' ? this.SRC_WIDTH : this.REF_WIDTH
    const maxH = this.layerMode === 'source' ? this.SRC_HEIGHT : this.REF_HEIGHT

    // Determine grid step interval dynamically based on zoom
    const targetScreenStep = 100
    const rawWorldStep = targetScreenStep / this.zoom
    const step = this.getNiceStep(rawWorldStep)

    const p0 = this.worldToScreen(0, 0)
    const p1 = this.worldToScreen(maxW, maxH)

    ctx.save()
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.12)'
    ctx.lineWidth = 1
    ctx.setLineDash([2, 4])

    // Vertical grid lines
    const startX = Math.max(0, Math.floor(-this.panX / (this.zoom * step)) * step)
    const endX = Math.min(maxW, Math.ceil((screenW - this.panX) / (this.zoom * step)) * step)

    for (let wx = startX; wx <= endX; wx += step) {
      const sx = wx * this.zoom + this.panX
      ctx.beginPath()
      ctx.moveTo(sx, Math.max(0, p0.screenY))
      ctx.lineTo(sx, Math.min(screenH, p1.screenY))
      ctx.stroke()

      // Lat/Lon text on major intervals
      if (sx >= 10 && sx <= screenW - 10) {
        const lonDeg = (wx - 50000) * 0.0036
        ctx.fillStyle = 'rgba(56, 189, 248, 0.45)'
        ctx.font = '9px "JetBrains Mono", monospace'
        ctx.fillText(`${lonDeg.toFixed(1)}°`, sx + 4, Math.max(20, p0.screenY + 12))
      }
    }

    // Horizontal grid lines
    const startY = Math.max(0, Math.floor(-this.panY / (this.zoom * step)) * step)
    const endY = Math.min(maxH, Math.ceil((screenH - this.panY) / (this.zoom * step)) * step)

    for (let wy = startY; wy <= endY; wy += step) {
      const sy = wy * this.zoom + this.panY
      ctx.beginPath()
      ctx.moveTo(Math.max(0, p0.screenX), sy)
      ctx.lineTo(Math.min(screenW, p1.screenX), sy)
      ctx.stroke()

      if (sy >= 10 && sy <= screenH - 10) {
        const latDeg = (37500 - wy) * 0.0024
        ctx.fillStyle = 'rgba(56, 189, 248, 0.45)'
        ctx.font = '9px "JetBrains Mono", monospace'
        ctx.fillText(`${latDeg.toFixed(1)}°`, Math.max(10, p0.screenX + 4), sy - 4)
      }
    }

    ctx.restore()
  }

  private renderRoiRectangle(ctx: CanvasRenderingContext2D) {
    let wx0 = this.coords.ref_x0
    let wy0 = this.coords.ref_y0
    let wx1 = this.coords.ref_x1
    let wy1 = this.coords.ref_y1

    if (this.layerMode === 'source') {
      wx0 = this.coords.src_sample_start
      wy0 = this.coords.src_line_start
      wx1 = this.coords.src_sample_end
      wy1 = this.coords.src_line_end
    }

    const p0 = this.worldToScreen(wx0, wy0)
    const p1 = this.worldToScreen(wx1, wy1)

    const rx = p0.screenX
    const ry = p0.screenY
    const rw = p1.screenX - p0.screenX
    const rh = p1.screenY - p0.screenY

    ctx.save()

    // Glowing translucent fill
    const pulseAlpha = 0.12 + Math.sin(this.pulsePhase) * 0.03
    ctx.fillStyle = `rgba(56, 189, 248, ${pulseAlpha})`
    ctx.fillRect(rx, ry, rw, rh)

    // Animated dashed neon border
    ctx.strokeStyle = '#38bdf8'
    ctx.lineWidth = 1.8
    ctx.setLineDash([6, 4])
    ctx.lineDashOffset = -this.pulsePhase * 8
    ctx.strokeRect(rx, ry, rw, rh)
    ctx.setLineDash([])

    // Sub-pixel crosshair in center of ROI
    const cx = rx + rw / 2
    const cy = ry + rh / 2
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.75)'
    ctx.lineWidth = 1.2

    ctx.beginPath()
    ctx.moveTo(cx - 10, cy)
    ctx.lineTo(cx + 10, cy)
    ctx.moveTo(cx, cy - 10)
    ctx.lineTo(cx, cy + 10)
    ctx.stroke()

    // Corner brackets
    this.drawCornerBrackets(ctx, rx, ry, rw, rh, 12, '#f59e0b')

    // 8 Interactive Resize Handles
    const handles = this.getRoiHandlesScreen()
    for (const h of handles) {
      const isHovered = this.activeHandle === h.name
      ctx.fillStyle = isHovered ? '#f59e0b' : '#38bdf8'
      ctx.strokeStyle = '#020617'
      ctx.lineWidth = 2

      ctx.beginPath()
      ctx.rect(h.x - 4, h.y - 4, 8, 8)
      ctx.fill()
      ctx.stroke()
    }

    // Top Width Dimension Tag
    const wPx = Math.round(wx1 - wx0)
    const hPx = Math.round(wy1 - wy0)
    const wKm = ((wPx * 5) / 1000).toFixed(1)
    const hKm = ((hPx * 5) / 1000).toFixed(1)

    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)'
    ctx.strokeStyle = '#38bdf8'
    ctx.lineWidth = 1

    const textW = `W: ${wPx.toLocaleString()} px (${wKm} km)`
    ctx.font = '10px "JetBrains Mono", monospace'
    const metricW = ctx.measureText(textW).width

    ctx.beginPath()
    ctx.rect(rx + rw / 2 - metricW / 2 - 6, ry - 20, metricW + 12, 16)
    ctx.fill()
    ctx.stroke()

    ctx.fillStyle = '#38bdf8'
    ctx.fillText(textW, rx + rw / 2 - metricW / 2, ry - 8)

    // Left Height Dimension Tag
    const textH = `H: ${hPx.toLocaleString()} px (${hKm} km)`
    const metricH = ctx.measureText(textH).width

    ctx.save()
    ctx.translate(rx - 16, ry + rh / 2)
    ctx.rotate(-Math.PI / 2)
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)'
    ctx.strokeStyle = '#f59e0b'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.rect(-metricH / 2 - 6, -10, metricH + 12, 16)
    ctx.fill()
    ctx.stroke()

    ctx.fillStyle = '#f59e0b'
    ctx.fillText(textH, -metricH / 2, 2)
    ctx.restore()

    ctx.restore()
  }

  private renderRoiPolygon(ctx: CanvasRenderingContext2D) {
    if (this.polygonPoints.length < 3) return

    ctx.save()
    ctx.beginPath()
    const first = this.worldToScreen(this.polygonPoints[0].x, this.polygonPoints[0].y)
    ctx.moveTo(first.screenX, first.screenY)

    for (let i = 1; i < this.polygonPoints.length; i++) {
      const scr = this.worldToScreen(this.polygonPoints[i].x, this.polygonPoints[i].y)
      ctx.lineTo(scr.screenX, scr.screenY)
    }
    ctx.closePath()

    // Translucent polygon fill
    ctx.fillStyle = 'rgba(245, 158, 11, 0.15)'
    ctx.fill()

    // Neon border
    ctx.strokeStyle = '#f59e0b'
    ctx.lineWidth = 1.8
    ctx.setLineDash([4, 4])
    ctx.stroke()
    ctx.setLineDash([])

    // Vertices
    for (let i = 0; i < this.polygonPoints.length; i++) {
      const p = this.polygonPoints[i]
      const scr = this.worldToScreen(p.x, p.y)

      ctx.fillStyle = i === this.activePolygonIndex ? '#f43f5e' : '#38bdf8'
      ctx.strokeStyle = '#020617'
      ctx.lineWidth = 2

      ctx.beginPath()
      ctx.arc(scr.screenX, scr.screenY, 5, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()

      // Vertex Index Pin
      ctx.fillStyle = '#ffffff'
      ctx.font = '8px "JetBrains Mono", monospace'
      ctx.fillText(`P${i + 1}`, scr.screenX + 8, scr.screenY - 4)
    }

    ctx.restore()
  }

  private renderCursorCrosshair(ctx: CanvasRenderingContext2D) {
    const scr = this.worldToScreen(this.mouseWorldX, this.mouseWorldY)
    const sx = scr.screenX
    const sy = scr.screenY

    ctx.save()
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)'
    ctx.lineWidth = 0.8
    ctx.setLineDash([3, 3])

    // Full screen crosshair lines
    ctx.beginPath()
    ctx.moveTo(sx, 0)
    ctx.lineTo(sx, this.viewportEl.clientHeight)
    ctx.moveTo(0, sy)
    ctx.lineTo(this.viewportEl.clientWidth, sy)
    ctx.stroke()

    // Central precision reticle
    ctx.setLineDash([])
    ctx.strokeStyle = '#38bdf8'
    ctx.lineWidth = 1.2
    ctx.beginPath()
    ctx.arc(sx, sy, 8, 0, Math.PI * 2)
    ctx.stroke()

    ctx.restore()
  }

  private drawCornerBrackets(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, size: number, color: string = '#38bdf8') {
    ctx.save()
    ctx.strokeStyle = color
    ctx.lineWidth = 2

    // Top-left
    ctx.beginPath()
    ctx.moveTo(x, y + size)
    ctx.lineTo(x, y)
    ctx.lineTo(x + size, y)
    ctx.stroke()

    // Top-right
    ctx.beginPath()
    ctx.moveTo(x + w - size, y)
    ctx.lineTo(x + w, y)
    ctx.lineTo(x + w, y + size)
    ctx.stroke()

    // Bottom-left
    ctx.beginPath()
    ctx.moveTo(x, y + h - size)
    ctx.lineTo(x, y + h)
    ctx.lineTo(x + size, y + h)
    ctx.stroke()

    // Bottom-right
    ctx.beginPath()
    ctx.moveTo(x + w - size, y + h)
    ctx.lineTo(x + w, y + h)
    ctx.lineTo(x + w, y + h - size)
    ctx.stroke()

    ctx.restore()
  }

  // =========================================================================
  // SCIENTIFIC COORDINATE RULERS
  // =========================================================================
  private drawRulers() {
    this.drawTopRuler()
    this.drawLeftRuler()
  }

  private drawTopRuler() {
    const ctx = this.topRulerCtx
    const w = this.topRulerCanvas.clientWidth
    const h = 24

    ctx.fillStyle = '#050c1e'
    ctx.fillRect(0, 0, w, h)

    ctx.strokeStyle = 'rgba(56, 189, 248, 0.25)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, h - 0.5)
    ctx.lineTo(w, h - 0.5)
    ctx.stroke()

    const maxW = this.layerMode === 'source' ? this.SRC_WIDTH : this.REF_WIDTH
    const targetScreenStep = 80
    const rawStep = targetScreenStep / this.zoom
    const step = this.getNiceStep(rawStep)
    const subStep = step / 5

    ctx.font = '9px "JetBrains Mono", monospace'
    ctx.fillStyle = '#64748b'
    ctx.strokeStyle = 'rgba(100, 116, 139, 0.45)'

    const startX = Math.floor(-this.panX / (this.zoom * subStep)) * subStep
    const endX = Math.ceil((w - this.panX) / (this.zoom * subStep)) * subStep

    for (let wx = startX; wx <= endX; wx += subStep) {
      if (wx < 0 || wx > maxW) continue
      const sx = wx * this.zoom + this.panX
      const isMajor = Math.abs(wx % step) < 0.001 || Math.abs((wx % step) - step) < 0.001

      ctx.beginPath()
      ctx.moveTo(sx, isMajor ? 6 : 14)
      ctx.lineTo(sx, h)
      ctx.stroke()

      if (isMajor && sx < w - 40) {
        ctx.fillStyle = '#94a3b8'
        ctx.fillText(Math.round(wx).toLocaleString(), sx + 4, 12)
      }
    }

    // Cursor Marker
    if (this.isMouseInside) {
      const scr = this.worldToScreen(this.mouseWorldX, 0)
      ctx.fillStyle = '#38bdf8'
      ctx.beginPath()
      ctx.moveTo(scr.screenX - 3, h)
      ctx.lineTo(scr.screenX + 3, h)
      ctx.lineTo(scr.screenX, h - 6)
      ctx.fill()
    }
  }

  private drawLeftRuler() {
    const ctx = this.leftRulerCtx
    const w = 42
    const h = this.leftRulerCanvas.clientHeight

    ctx.fillStyle = '#050c1e'
    ctx.fillRect(0, 0, w, h)

    ctx.strokeStyle = 'rgba(56, 189, 248, 0.25)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(w - 0.5, 0)
    ctx.lineTo(w - 0.5, h)
    ctx.stroke()

    const maxH = this.layerMode === 'source' ? this.SRC_HEIGHT : this.REF_HEIGHT
    const targetScreenStep = 80
    const rawStep = targetScreenStep / this.zoom
    const step = this.getNiceStep(rawStep)
    const subStep = step / 5

    ctx.font = '8px "JetBrains Mono", monospace'
    ctx.fillStyle = '#64748b'
    ctx.strokeStyle = 'rgba(100, 116, 139, 0.45)'

    const startY = Math.floor(-this.panY / (this.zoom * subStep)) * subStep
    const endY = Math.ceil((h - this.panY) / (this.zoom * subStep)) * subStep

    for (let wy = startY; wy <= endY; wy += subStep) {
      if (wy < 0 || wy > maxH) continue
      const sy = wy * this.zoom + this.panY
      const isMajor = Math.abs(wy % step) < 0.001 || Math.abs((wy % step) - step) < 0.001

      ctx.beginPath()
      ctx.moveTo(isMajor ? 14 : 26, sy)
      ctx.lineTo(w, sy)
      ctx.stroke()

      if (isMajor && sy < h - 10) {
        ctx.fillStyle = '#94a3b8'
        ctx.fillText(Math.round(wy).toLocaleString(), 4, sy - 3)
      }
    }

    // Cursor Marker
    if (this.isMouseInside) {
      const scr = this.worldToScreen(0, this.mouseWorldY)
      ctx.fillStyle = '#38bdf8'
      ctx.beginPath()
      ctx.moveTo(w, scr.screenY - 3)
      ctx.lineTo(w, scr.screenY + 3)
      ctx.lineTo(w - 6, scr.screenY)
      ctx.fill()
    }
  }

  private getNiceStep(rawStep: number): number {
    const exp = Math.floor(Math.log10(rawStep))
    const frac = rawStep / Math.pow(10, exp)
    let niceFrac = 1
    if (frac > 5) niceFrac = 10
    else if (frac > 2) niceFrac = 5
    else if (frac > 1) niceFrac = 2
    return niceFrac * Math.pow(10, exp)
  }
}
