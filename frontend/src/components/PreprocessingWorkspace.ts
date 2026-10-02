import type { PairItem } from '../types'
import { executePreprocessing, type PreprocessResult } from '../api'
import { showHumanToast } from '../services/errorHandler'

interface PreprocessConfig {
  enable_normalization: boolean
  p_low: number
  p_high: number
  enable_clahe: boolean
  clip_limit: number
  tile_grid_size: number
}

export type ViewMode = 'side-by-side' | 'raw' | 'processed'

export class PreprocessingWorkspace {
  private container: HTMLElement
  private activePairId: string = 'pair_001'
  private pairData: PairItem | null = null
  private configuredRoi: {
    roi_src: [number, number, number, number]
    roi_ref: [number, number, number, number]
  } = {
    roi_src: [42000, 46000, 1000, 7000],
    roi_ref: [3000, 5000, 100, 600],
  }
  private onNavigateNext?: () => void

  // Preprocessing parameters with sensible scientific defaults
  private config: PreprocessConfig = {
    enable_normalization: true,
    p_low: 1.0,
    p_high: 99.0,
    enable_clahe: true,
    clip_limit: 2.5,
    tile_grid_size: 8,
  }

  private isProcessing: boolean = false
  private isProcessed: boolean = false
  private processedResult: PreprocessResult | null = null

  // View comparison modes for Source and Reference panels
  private srcViewMode: ViewMode = 'side-by-side'
  private refViewMode: ViewMode = 'side-by-side'

  public getSourceViewMode(): ViewMode {
    return this.srcViewMode
  }

  public getReferenceViewMode(): ViewMode {
    return this.refViewMode
  }

  constructor(
    parent: HTMLElement,
    initialPairId: string = 'pair_001',
    initialRoi?: { roi_src: [number, number, number, number]; roi_ref: [number, number, number, number] },
    onNavigateNext?: () => void,
    pairData?: PairItem | null
  ) {
    this.container = document.createElement('div')
    this.container.className = 'preprocessing-workspace'
    parent.appendChild(this.container)

    this.activePairId = initialPairId
    this.pairData = pairData || null
    if (initialRoi) {
      this.configuredRoi = { ...initialRoi }
    }
    this.onNavigateNext = onNavigateNext

    this.renderLayout()
    this.attachDomEvents()
  }

  public setActivePair(
    pairId: string,
    pairData: PairItem | null,
    roi?: { roi_src: [number, number, number, number]; roi_ref: [number, number, number, number] }
  ) {
    const isNew = pairId !== this.activePairId
    this.activePairId = pairId
    this.pairData = pairData
    if (roi) {
      this.configuredRoi = { ...roi }
    }
    if (isNew) {
      this.isProcessed = false
      this.processedResult = null
    }
    this.updateHeaderMeta()
    this.updateRoiDimensionsDisplay()
    if (!this.processedResult) {
      this.runPreprocessing(false)
    }
  }

  public setRoi(roi: { roi_src: [number, number, number, number]; roi_ref: [number, number, number, number] }) {
    this.configuredRoi = { ...roi }
    this.updateRoiDimensionsDisplay()
    // Re-run preprocessing with the updated ROI
    this.runPreprocessing(false)
  }

  public onTabActive() {
    this.updateHeaderMeta()
    this.updateRoiDimensionsDisplay()
    // If not processed yet, automatically fetch and process active ROI
    if (!this.processedResult && !this.isProcessing) {
      this.runPreprocessing(false)
    }
  }

  public getProcessedResult(): PreprocessResult | null {
    return this.processedResult
  }

  public getIsProcessed(): boolean {
    return this.isProcessed
  }

  // --- Dynamic Metadata Formatting ---
  private getMetadataStrings() {
    const p = this.pairData
    const pairIdUpper = this.activePairId.toUpperCase()

    let mission = p?.mission || 'Chandrayaan-2'
    let instrument = p?.instrument || 'OHRC'
    let refInstrument = p?.reference_instrument || 'LROC'

    if (this.activePairId === 'pair_001') {
      mission = 'Chandrayaan-2'
      instrument = 'OHRC'
      refInstrument = 'LROC'
    } else if (this.activePairId === 'pair_002') {
      mission = 'Chandrayaan-2'
      instrument = 'IIRS'
      refInstrument = 'LROC NAC'
    } else if (this.activePairId === 'pair_003') {
      mission = 'Chandrayaan-1'
      instrument = 'TMC'
      refInstrument = 'LROC WAC'
    }

    const y0 = this.configuredRoi.roi_src[0]
    const y1 = this.configuredRoi.roi_src[1]
    const x0 = this.configuredRoi.roi_src[2]
    const x1 = this.configuredRoi.roi_src[3]
    const w = Math.max(1, x1 - x0)
    const h = Math.max(1, y1 - y0)

    return {
      pairIdUpper,
      mission,
      instrument,
      refInstrument,
      w,
      h,
      x0,
      x1,
      y0,
      y1,
    }
  }

  private updateHeaderMeta() {
    const meta = this.getMetadataStrings()

    const metaPair = this.container.querySelector('#prep-meta-pair')
    if (metaPair) {
      metaPair.textContent = `${meta.pairIdUpper} · ${meta.mission} · ${meta.instrument}`
    }

    const metaRef = this.container.querySelector('#prep-meta-ref')
    if (metaRef) {
      metaRef.textContent = `Reference · ${meta.refInstrument}`
    }

    const srcTitle = this.container.querySelector('#prep-src-panel-title')
    if (srcTitle) {
      srcTitle.textContent = `${meta.mission} ${meta.instrument}`
    }

    const refTitle = this.container.querySelector('#prep-ref-panel-title')
    if (refTitle) {
      refTitle.textContent = `${meta.refInstrument} Basemap`
    }

    const isIirs = this.activePairId === 'pair_002' || meta.instrument === 'IIRS' || (this.pairData?.product_type === 'HYPERSPECTRAL')
    const statusPill = this.container.querySelector('#prep-status-pill')
    const statusText = this.container.querySelector('#prep-status-text')
    const pipelineStatus = this.container.querySelector('#prep-sum-pipeline-status')
    const sumSrc = this.container.querySelector('#prep-sum-src-status')
    const btnApply = this.container.querySelector<HTMLButtonElement>('#btn-prep-apply')
    const btnHeader = this.container.querySelector<HTMLButtonElement>('#btn-preproc-apply-header')
    const btnNext = this.container.querySelector<HTMLButtonElement>('#btn-prep-next-stage')

    if (isIirs) {
      if (statusPill) statusPill.className = 'roi-status-pill warning'
      if (statusText) statusText.textContent = 'Band extraction required'
      if (pipelineStatus) {
        pipelineStatus.textContent = 'Band extraction required'
        pipelineStatus.className = 'v font-mono text-amber'
      }
      if (sumSrc) {
        sumSrc.textContent = 'Hyperspectral cube'
        sumSrc.className = 'sm-value font-mono text-amber'
      }
      if (btnApply) {
        btnApply.disabled = true
        btnApply.title = 'IIRS spatial band extraction required before preprocessing'
      }
      if (btnHeader) btnHeader.style.display = 'none'
      if (btnNext) btnNext.style.display = 'none'
      this.showIirsGuard()
    } else {
      this.hideIirsGuard()
      if (btnApply) {
        btnApply.disabled = false
        btnApply.title = 'Apply contrast normalization and CLAHE'
      }
      if (btnHeader) btnHeader.style.display = 'inline-flex'
      if (btnNext) btnNext.style.display = 'inline-flex'
    }
  }

  private showIirsGuard() {
    const wrap = this.container.querySelector<HTMLElement>('#prep-src-viewport-wrap')
    const comp = this.container.querySelector<HTMLElement>('#prep-src-comparison')
    if (comp) comp.style.display = 'none'

    let guard = wrap?.querySelector('#prep-iirs-guard')
    if (!guard && wrap) {
      const guardDiv = document.createElement('div')
      guardDiv.id = 'prep-iirs-guard'
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
          contrast enhancement and correspondence can be performed.
        </p>
        <button class="btn-iirs-extract" id="prep-btn-iirs-extract">[ Select / Extract Band ]</button>
      `
      wrap.appendChild(guardDiv)

      guardDiv.querySelector('#prep-btn-iirs-extract')?.addEventListener('click', () => {
        showHumanToast('IIRS Band Extraction: PDS QUB spectral parser is indexing continuum channels (Band 1580nm). Feature matching is blocked until 2D spatial raster is calibrated.', 'info')
      })
    }
  }

  private hideIirsGuard() {
    const wrap = this.container.querySelector<HTMLElement>('#prep-src-viewport-wrap')
    const comp = this.container.querySelector<HTMLElement>('#prep-src-comparison')
    if (comp) comp.style.display = 'grid'
    const guard = wrap?.querySelector('#prep-iirs-guard')
    if (guard) guard.remove()
  }

  private updateRoiDimensionsDisplay() {
    const meta = this.getMetadataStrings()
    const badge = this.container.querySelector('#prep-roi-dims-badge')
    if (badge) {
      badge.textContent = `ROI: ${meta.w.toLocaleString()} × ${meta.h.toLocaleString()} px`
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
            <h1 class="roi-title">PREPROCESSING</h1>
            <span class="roi-status-pill" id="prep-status-pill">
              <span class="pulse-dot"></span>
              <span id="prep-status-text">Ready for processing</span>
            </span>
          </div>
          <p class="roi-subtitle">
            Prepare selected source and reference image regions for reliable feature correspondence.
          </p>
          <div class="roi-meta-breadcrumbs">
            <span class="meta-item primary" id="prep-meta-pair">${meta.pairIdUpper} · ${meta.mission} · ${meta.instrument}</span>
            <span class="meta-sep">&bull;</span>
            <span class="meta-item" id="prep-meta-ref">Reference · ${meta.refInstrument}</span>
            <span class="meta-sep">&bull;</span>
            <span class="meta-item helper" id="prep-roi-dims-badge">ROI: ${meta.w.toLocaleString()} × ${meta.h.toLocaleString()} px</span>
          </div>
        </div>

        <div class="roi-header-actions">
          <button type="button" id="btn-preproc-apply-header" class="btn-primary-space">
            <span>Apply Preprocessing &rarr;</span>
          </button>
        </div>
      </div>

      <!-- Warning Box (Hidden by default) -->
      <div id="prep-warning-banner" class="roi-data-warning" style="display:none; margin-bottom:16px;">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        <span id="prep-warning-message">PREPROCESSING WARNING: Processed image contains insufficient valid image data.</span>
      </div>

      <!-- 2. MAIN IMAGE WORKSPACE (COMPARISON LAYOUT) -->
      <div class="prep-dual-viewers-grid">
        <!-- SOURCE COMPARISON CARD -->
        <div class="prep-viewer-card glass-panel" id="prep-source-card">
          <div class="prep-viewer-header">
            <div class="prep-viewer-title-row">
              <span class="viewer-tag source">SOURCE</span>
              <span class="prep-card-title" id="prep-src-panel-title">${meta.mission} ${meta.instrument}</span>
              <span class="font-mono text-slate-400" style="font-size:11px;">16-bit PDS</span>
            </div>

            <!-- View Mode Selector -->
            <div class="prep-view-toggle" role="group" aria-label="Source View Toggle">
              <button type="button" class="btn-toggle active" data-target="src" data-mode="side-by-side">Side by Side</button>
              <button type="button" class="btn-toggle" data-target="src" data-mode="raw">Raw</button>
              <button type="button" class="btn-toggle" data-target="src" data-mode="processed">Processed</button>
            </div>
          </div>

          <!-- Imagery Container -->
          <div class="prep-image-viewport-wrap" id="prep-src-viewport-wrap">
            <div class="prep-images-comparison" id="prep-src-comparison">
              <!-- Raw Sub-scene -->
              <div class="prep-sub-pane pane-raw" id="prep-src-pane-raw">
                <span class="prep-pane-badge raw">RAW ROI</span>
                <div class="prep-canvas-container">
                  <img id="img-src-raw" class="prep-raster-img" alt="Source Raw ROI" />
                  <div class="prep-placeholder" id="placeholder-src-raw">
                    <span class="spinner-inline"></span>
                    <span>Extracting raw source ROI...</span>
                  </div>
                </div>
              </div>

              <!-- Processed Sub-scene -->
              <div class="prep-sub-pane pane-proc" id="prep-src-pane-proc">
                <span class="prep-pane-badge proc">PROCESSED (CLAHE)</span>
                <div class="prep-canvas-container">
                  <img id="img-src-proc" class="prep-raster-img" alt="Source Enhanced ROI" />
                  <div class="prep-placeholder" id="placeholder-src-proc">
                    <span class="spinner-inline"></span>
                    <span>Awaiting enhancement...</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- REFERENCE COMPARISON CARD -->
        <div class="prep-viewer-card glass-panel" id="prep-reference-card">
          <div class="prep-viewer-header">
            <div class="prep-viewer-title-row">
              <span class="viewer-tag reference">REFERENCE</span>
              <span class="prep-card-title" id="prep-ref-panel-title">${meta.refInstrument} Basemap</span>
              <span class="font-mono text-slate-400" style="font-size:11px;">Candidate Region</span>
            </div>

            <!-- View Mode Selector -->
            <div class="prep-view-toggle" role="group" aria-label="Reference View Toggle">
              <button type="button" class="btn-toggle active" data-target="ref" data-mode="side-by-side">Side by Side</button>
              <button type="button" class="btn-toggle" data-target="ref" data-mode="raw">Raw</button>
              <button type="button" class="btn-toggle" data-target="ref" data-mode="processed">Processed</button>
            </div>
          </div>

          <!-- Imagery Container -->
          <div class="prep-image-viewport-wrap" id="prep-ref-viewport-wrap">
            <div class="prep-images-comparison" id="prep-ref-comparison">
              <!-- Raw Sub-scene -->
              <div class="prep-sub-pane pane-raw" id="prep-ref-pane-raw">
                <span class="prep-pane-badge raw">RAW ROI</span>
                <div class="prep-canvas-container">
                  <img id="img-ref-raw" class="prep-raster-img" alt="Reference Raw ROI" />
                  <div class="prep-placeholder" id="placeholder-ref-raw">
                    <span class="spinner-inline"></span>
                    <span>Extracting raw reference ROI...</span>
                  </div>
                </div>
              </div>

              <!-- Processed Sub-scene -->
              <div class="prep-sub-pane pane-proc" id="prep-ref-pane-proc">
                <span class="prep-pane-badge proc">PROCESSED (CLAHE)</span>
                <div class="prep-canvas-container">
                  <img id="img-ref-proc" class="prep-raster-img" alt="Reference Enhanced ROI" />
                  <div class="prep-placeholder" id="placeholder-ref-proc">
                    <span class="spinner-inline"></span>
                    <span>Awaiting enhancement...</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 3. COMPACT SCIENTIFIC CONTROLS & WORKFLOW ACTIONS -->
      <div class="prep-bottom-grid">
        <!-- CONTROLS CARD -->
        <div class="prep-controls-card glass-panel">
          <div class="card-header-clean">
            <span class="card-eyebrow">SCIENTIFIC PREPROCESSING PARAMETERS</span>
            <h2 class="card-title">Preprocessing Configuration</h2>
          </div>

          <div class="prep-controls-form">
            <!-- Group 1: Percentile Intensity Normalization -->
            <div class="prep-control-group">
              <div class="prep-group-header">
                <label class="prep-checkbox-label">
                  <input type="checkbox" id="chk-norm-enable" ${this.config.enable_normalization ? 'checked' : ''} />
                  <span class="prep-group-title">Intensity Normalization &amp; Percentile Clipping</span>
                </label>
              </div>

              <div class="prep-inputs-row">
                <div class="prep-field">
                  <label for="inp-p-low">Lower Percentile (p_low)</label>
                  <div class="prep-input-wrap">
                    <input type="number" id="inp-p-low" value="${this.config.p_low}" min="0.0" max="10.0" step="0.5" />
                    <span class="unit font-mono">%</span>
                  </div>
                </div>

                <div class="prep-field">
                  <label for="inp-p-high">Upper Percentile (p_high)</label>
                  <div class="prep-input-wrap">
                    <input type="number" id="inp-p-high" value="${this.config.p_high}" min="90.0" max="100.0" step="0.5" />
                    <span class="unit font-mono">%</span>
                  </div>
                </div>
              </div>
              <p class="prep-field-hint">
                Percentile clipping scales extreme 16-bit lunar sensor values and suppresses night-side dark pedestal.
              </p>
            </div>

            <!-- Group 2: Local Contrast (CLAHE) -->
            <div class="prep-control-group">
              <div class="prep-group-header">
                <label class="prep-checkbox-label">
                  <input type="checkbox" id="chk-clahe-enable" ${this.config.enable_clahe ? 'checked' : ''} />
                  <span class="prep-group-title">Local Contrast Enhancement (CLAHE)</span>
                </label>
              </div>

              <div class="prep-inputs-row">
                <div class="prep-field">
                  <label for="inp-clip-limit">CLAHE Clip Limit</label>
                  <div class="prep-input-wrap">
                    <input type="number" id="inp-clip-limit" value="${this.config.clip_limit}" min="1.0" max="5.0" step="0.1" />
                    <span class="unit font-mono">gain</span>
                  </div>
                </div>

                <div class="prep-field">
                  <label for="sel-tile-grid">Tile Grid Size</label>
                  <div class="prep-input-wrap">
                    <select id="sel-tile-grid" class="prep-select">
                      <option value="4" ${this.config.tile_grid_size === 4 ? 'selected' : ''}>4 × 4 (Fine Detail)</option>
                      <option value="8" ${this.config.tile_grid_size === 8 ? 'selected' : ''}>8 × 8 (Recommended)</option>
                      <option value="16" ${this.config.tile_grid_size === 16 ? 'selected' : ''}>16 × 16 (Broad Terrain)</option>
                    </select>
                  </div>
                </div>
              </div>
              <p class="prep-field-hint">
                Enhances high-frequency crater rims, ejecta ridges, and shadowed terrain features for reliable keypoint extraction.
              </p>
            </div>
          </div>

          <!-- Bottom Action Buttons inside Controls -->
          <div class="prep-actions-row">
            <button type="button" id="btn-prep-reset" class="btn-ghost-space" title="Reset parameters to scientific defaults">
              Reset Defaults
            </button>
            <button type="button" id="btn-prep-apply" class="btn-primary-space">
              <span id="btn-prep-apply-label">Apply Preprocessing</span>
            </button>
          </div>
        </div>

        <!-- SUMMARY & NEXT STAGE CARD -->
        <div class="prep-summary-card glass-panel">
          <div class="card-header-clean">
            <span class="card-eyebrow">PREPROCESSING SUMMARY</span>
            <h2 class="card-title">Enhancement Status</h2>
          </div>

          <div class="summary-metrics-grid" style="grid-template-columns: 1fr;">
            <div class="summary-metric-cell">
              <span class="sm-label">SOURCE REGION</span>
              <span class="sm-value font-mono" id="prep-sum-src-status">Raw loaded</span>
            </div>
            <div class="summary-metric-cell">
              <span class="sm-label">REFERENCE REGION</span>
              <span class="sm-value font-mono" id="prep-sum-ref-status">Raw loaded</span>
            </div>
            <div class="summary-metric-cell">
              <span class="sm-label">CURRENT ALGORITHM</span>
              <span class="sm-value font-mono text-cyan" id="prep-sum-algo">Percentile Stretch + CLAHE</span>
            </div>
          </div>

          <div class="summary-sources-box" style="margin-top:12px;">
            <div class="src-line status">
              <span class="k">PIPELINE STATUS:</span>
              <span class="v font-mono text-cyan" id="prep-sum-pipeline-status">Ready to process</span>
            </div>
          </div>

          <div class="summary-footer-next" style="margin-top:16px;">
            <button type="button" id="btn-continue-feature-matching" class="btn-primary-space" style="width:100%; justify-content:center; padding:12px 18px;" disabled>
              <span>CONTINUE TO FEATURE CORRESPONDENCE &rarr;</span>
            </button>
          </div>
        </div>
      </div>
    `
  }

  // --- Attach DOM Events ---
  private attachDomEvents() {
    // Mode toggles for Source
    this.container.querySelectorAll<HTMLButtonElement>('.btn-toggle[data-target="src"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const mode = btn.getAttribute('data-mode') as ViewMode
        this.setSourceViewMode(mode)
      })
    })

    // Mode toggles for Reference
    this.container.querySelectorAll<HTMLButtonElement>('.btn-toggle[data-target="ref"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const mode = btn.getAttribute('data-mode') as ViewMode
        this.setReferenceViewMode(mode)
      })
    })

    // Inputs change listeners
    const chkNorm = this.container.querySelector<HTMLInputElement>('#chk-norm-enable')
    const inpLow = this.container.querySelector<HTMLInputElement>('#inp-p-low')
    const inpHigh = this.container.querySelector<HTMLInputElement>('#inp-p-high')
    const chkClahe = this.container.querySelector<HTMLInputElement>('#chk-clahe-enable')
    const inpClip = this.container.querySelector<HTMLInputElement>('#inp-clip-limit')
    const selGrid = this.container.querySelector<HTMLSelectElement>('#sel-tile-grid')

    const syncInputs = () => {
      this.config.enable_normalization = chkNorm?.checked ?? true
      this.config.p_low = parseFloat(inpLow?.value || '1.0')
      this.config.p_high = parseFloat(inpHigh?.value || '99.0')
      this.config.enable_clahe = chkClahe?.checked ?? true
      this.config.clip_limit = parseFloat(inpClip?.value || '2.5')
      this.config.tile_grid_size = parseInt(selGrid?.value || '8', 10)
    }

    chkNorm?.addEventListener('change', syncInputs)
    inpLow?.addEventListener('change', syncInputs)
    inpHigh?.addEventListener('change', syncInputs)
    chkClahe?.addEventListener('change', syncInputs)
    inpClip?.addEventListener('change', syncInputs)
    selGrid?.addEventListener('change', syncInputs)

    // Reset button
    this.container.querySelector('#btn-prep-reset')?.addEventListener('click', () => {
      this.config = {
        enable_normalization: true,
        p_low: 1.0,
        p_high: 99.0,
        enable_clahe: true,
        clip_limit: 2.5,
        tile_grid_size: 8,
      }
      if (chkNorm) chkNorm.checked = true
      if (inpLow) inpLow.value = '1.0'
      if (inpHigh) inpHigh.value = '99.0'
      if (chkClahe) chkClahe.checked = true
      if (inpClip) inpClip.value = '2.5'
      if (selGrid) selGrid.value = '8'
      showHumanToast('Preprocessing parameters reset to scientific defaults', 'info')
    })

    // Apply button
    this.container.querySelector('#btn-prep-apply')?.addEventListener('click', () => {
      syncInputs()
      this.runPreprocessing(true)
    })
    this.container.querySelector('#btn-preproc-apply-header')?.addEventListener('click', () => {
      syncInputs()
      this.runPreprocessing(true)
    })

    // Continue to Feature Matching
    this.container.querySelector('#btn-continue-feature-matching')?.addEventListener('click', () => {
      if (this.onNavigateNext) {
        this.onNavigateNext()
      } else {
        showHumanToast('Proceeding to Feature Correspondence...', 'info')
      }
    })
  }

  // --- View Mode Handlers ---
  private setSourceViewMode(mode: ViewMode) {
    this.srcViewMode = mode
    const container = this.container.querySelector('#prep-src-comparison')
    const paneRaw = this.container.querySelector<HTMLElement>('#prep-src-pane-raw')
    const paneProc = this.container.querySelector<HTMLElement>('#prep-src-pane-proc')

    this.container.querySelectorAll<HTMLButtonElement>('.btn-toggle[data-target="src"]').forEach((b) => {
      b.classList.toggle('active', b.getAttribute('data-mode') === mode)
    })

    if (!container || !paneRaw || !paneProc) return

    if (mode === 'side-by-side') {
      paneRaw.style.display = 'flex'
      paneProc.style.display = 'flex'
      container.className = 'prep-images-comparison side-by-side'
    } else if (mode === 'raw') {
      paneRaw.style.display = 'flex'
      paneProc.style.display = 'none'
      container.className = 'prep-images-comparison single'
    } else {
      paneRaw.style.display = 'none'
      paneProc.style.display = 'flex'
      container.className = 'prep-images-comparison single'
    }
  }

  private setReferenceViewMode(mode: ViewMode) {
    this.refViewMode = mode
    const container = this.container.querySelector('#prep-ref-comparison')
    const paneRaw = this.container.querySelector<HTMLElement>('#prep-ref-pane-raw')
    const paneProc = this.container.querySelector<HTMLElement>('#prep-ref-pane-proc')

    this.container.querySelectorAll<HTMLButtonElement>('.btn-toggle[data-target="ref"]').forEach((b) => {
      b.classList.toggle('active', b.getAttribute('data-mode') === mode)
    })

    if (!container || !paneRaw || !paneProc) return

    if (mode === 'side-by-side') {
      paneRaw.style.display = 'flex'
      paneProc.style.display = 'flex'
      container.className = 'prep-images-comparison side-by-side'
    } else if (mode === 'raw') {
      paneRaw.style.display = 'flex'
      paneProc.style.display = 'none'
      container.className = 'prep-images-comparison single'
    } else {
      paneRaw.style.display = 'none'
      paneProc.style.display = 'flex'
      container.className = 'prep-images-comparison single'
    }
  }

  // --- Run Preprocessing Pipeline ---
  public async runPreprocessing(showToastNotification: boolean = true) {
    if (this.isProcessing) return

    const isIirs = this.activePairId === 'pair_002' || this.pairData?.instrument === 'IIRS' || (this.pairData?.product_type === 'HYPERSPECTRAL')
    if (isIirs) {
      this.isProcessing = false
      this.showIirsGuard()
      if (showToastNotification) {
        showHumanToast('IIRS spatial band extraction required. Preprocessing cannot be applied to raw spectral cube.', 'warning')
      }
      return
    }

    this.isProcessing = true

    // UI Loading state
    const btnApply = this.container.querySelector<HTMLButtonElement>('#btn-prep-apply')
    const btnHeader = this.container.querySelector<HTMLButtonElement>('#btn-preproc-apply-header')
    const labelApply = this.container.querySelector('#btn-prep-apply-label')
    const statusPill = this.container.querySelector('#prep-status-pill')
    const statusText = this.container.querySelector('#prep-status-text')
    const pipelineStatus = this.container.querySelector('#prep-sum-pipeline-status')

    if (btnApply) btnApply.disabled = true
    if (btnHeader) btnHeader.disabled = true
    if (labelApply) labelApply.textContent = 'Processing...'
    if (statusText) statusText.textContent = 'Processing regions...'
    if (statusPill) statusPill.className = 'roi-status-pill processing'
    if (pipelineStatus) {
      pipelineStatus.textContent = 'Preparing source and reference regions...'
      pipelineStatus.className = 'v font-mono text-cyan'
    }

    try {
      const result = await executePreprocessing({
        pair_id: this.activePairId,
        roi_src: this.configuredRoi.roi_src,
        roi_ref: this.configuredRoi.roi_ref,
        enable_normalization: this.config.enable_normalization,
        p_low: this.config.p_low,
        p_high: this.config.p_high,
        enable_clahe: this.config.enable_clahe,
        clip_limit: this.config.clip_limit,
        tile_grid_size: this.config.tile_grid_size,
      })

      if (result && result.status === 'ready') {
        this.processedResult = result
        this.isProcessed = true

        // Display images
        this.displayImages(result)

        // Quality warning
        const warnBanner = this.container.querySelector<HTMLElement>('#prep-warning-banner')
        const warnMsg = this.container.querySelector('#prep-warning-message')
        if (result.warning) {
          if (warnBanner) warnBanner.style.display = 'flex'
          if (warnMsg) warnMsg.textContent = result.warning
        } else {
          if (warnBanner) warnBanner.style.display = 'none'
        }

        // Update status indicators
        if (statusText) statusText.textContent = 'Preprocessing ready'
        if (statusPill) statusPill.className = 'roi-status-pill applied'

        const sumSrc = this.container.querySelector('#prep-sum-src-status')
        const sumRef = this.container.querySelector('#prep-sum-ref-status')
        if (sumSrc) {
          sumSrc.textContent = 'Processed ✓'
          sumSrc.className = 'sm-value font-mono text-emerald'
        }
        if (sumRef) {
          sumRef.textContent = 'Processed ✓'
          sumRef.className = 'sm-value font-mono text-emerald'
        }
        if (pipelineStatus) {
          pipelineStatus.textContent = '✓ Preprocessing ready'
          pipelineStatus.className = 'v font-mono text-emerald'
        }

        // Enable Continue button
        const btnNext = this.container.querySelector<HTMLButtonElement>('#btn-continue-feature-matching')
        if (btnNext) {
          btnNext.disabled = false
          btnNext.classList.add('pulse-glow')
        }

        if (showToastNotification) {
          showHumanToast('Preprocessing complete. Lunar crater topography calibrated and ready for feature extraction.', 'success')
        }
      } else {
        throw new Error('Preprocessing backend returned invalid response')
      }
    } catch (err: any) {
      if (statusText) statusText.textContent = 'Processing error'
      if (statusPill) statusPill.className = 'roi-status-pill'
      if (pipelineStatus) {
        pipelineStatus.textContent = 'Processing failed'
        pipelineStatus.className = 'v font-mono text-red-400'
      }
      showHumanToast(`Preprocessing failed: ${err.message || err}`, 'warning')
    } finally {
      this.isProcessing = false
      if (btnApply) btnApply.disabled = false
      if (btnHeader) btnHeader.disabled = false
      if (labelApply) labelApply.textContent = 'Apply Preprocessing'
    }
  }

  private displayImages(result: PreprocessResult) {
    const imgSrcRaw = this.container.querySelector<HTMLImageElement>('#img-src-raw')
    const imgSrcProc = this.container.querySelector<HTMLImageElement>('#img-src-proc')
    const imgRefRaw = this.container.querySelector<HTMLImageElement>('#img-ref-raw')
    const imgRefProc = this.container.querySelector<HTMLImageElement>('#img-ref-proc')

    const phSrcRaw = this.container.querySelector<HTMLElement>('#placeholder-src-raw')
    const phSrcProc = this.container.querySelector<HTMLElement>('#placeholder-src-proc')
    const phRefRaw = this.container.querySelector<HTMLElement>('#placeholder-ref-raw')
    const phRefProc = this.container.querySelector<HTMLElement>('#placeholder-ref-proc')

    if (imgSrcRaw && result.source_raw) {
      imgSrcRaw.src = `data:image/png;base64,${result.source_raw}`
      imgSrcRaw.style.display = 'block'
      if (phSrcRaw) phSrcRaw.style.display = 'none'
    }
    if (imgSrcProc && result.source_processed) {
      imgSrcProc.src = `data:image/png;base64,${result.source_processed}`
      imgSrcProc.style.display = 'block'
      if (phSrcProc) phSrcProc.style.display = 'none'
    }
    if (imgRefRaw && result.reference_raw) {
      imgRefRaw.src = `data:image/png;base64,${result.reference_raw}`
      imgRefRaw.style.display = 'block'
      if (phRefRaw) phRefRaw.style.display = 'none'
    }
    if (imgRefProc && result.reference_processed) {
      imgRefProc.src = `data:image/png;base64,${result.reference_processed}`
      imgRefProc.style.display = 'block'
      if (phRefProc) phRefProc.style.display = 'none'
    }
  }
}
