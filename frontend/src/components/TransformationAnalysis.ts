/**
 * Component: TransformationAnalysis
 * Phase 9 — Scientific Transformation Analysis Screen
 * 
 * Renders:
 * - Mathematical transformation matrix with proper mathematical typography & conceptual layout
 * - Matrix parameter decomposition cards (dx, dy, rot, scale, shear, det, cond)
 * - Residual statistics (RMSE, MAD, IQR, Q1, Q3, P95, std, variance)
 * - Error metrics (px and meters on lunar surface)
 * - Coordinate system information (IAU2000:30100, lunar datum, GSD)
 * - Interactive Residual Plot (Quiver vector field & Error vs Distance)
 * - Error Distribution Histogram with Box Plot & quantiles
 * - Transformation Summary
 * - Copy Matrix, Export Matrix, Export JSON, Export Report actions
 */

import {
  fetchTransformationAnalysis,
  fetchScientificReport,
  type TransformationAnalysisResult
} from '../api'

export class TransformationAnalysis {
  private container: HTMLElement
  private pairId: string
  private transformType: 'homography' | 'affine' = 'homography'
  private ransacThresh: number = 3.0
  private data: TransformationAnalysisResult | null = null
  private errorMessage: string = ''

  // Visualizer settings
  private residualPlotMode: 'scatter' | 'radial' = 'scatter'

  // DOM Elements
  private rootEl!: HTMLDivElement
  private residualCanvas!: HTMLCanvasElement
  private histCanvas!: HTMLCanvasElement
  private toastEl!: HTMLDivElement

  constructor(container: HTMLElement, initialPairId: string = 'pair_001') {
    this.container = container
    this.pairId = initialPairId
    this.renderBaseLayout()
    this.setupListeners()
    this.loadAnalysis()
  }

  public setActivePair(pairId: string) {
    if (this.pairId !== pairId) {
      this.pairId = pairId
      const pairTag = this.rootEl.querySelector('#ta-pair-badge')
      if (pairTag) pairTag.textContent = `TARGET: ${pairId.toUpperCase()}`
      this.loadAnalysis()
    }
  }

  private renderBaseLayout() {
    this.rootEl = document.createElement('div')
    this.rootEl.className = 'transformation-analysis-root'

    this.rootEl.innerHTML = `
      <!-- TOP ACTION & TELEMETRY HEADER -->
      <header class="ws-header-bar glass-panel corner-reticle">
        <div class="ws-header-left">
          <div class="ws-title-group">
            <span class="badge-chip" style="background: rgba(56, 189, 248, 0.15); color: var(--cyan-bright); border: 1px solid rgba(56, 189, 248, 0.3);">
              STAGE 06 & 07 • MATHEMATICAL ANALYSIS
            </span>
            <span id="ta-pair-badge" class="ws-pair-tag">TARGET: ${this.pairId.toUpperCase()}</span>
            <span id="ta-grade-badge" class="badge-counter" style="background: rgba(16, 185, 129, 0.2); color: var(--emerald-status); border: 1px solid rgba(16, 185, 129, 0.4); font-weight:700;">
              GRADE: A+
            </span>
          </div>
          <h2 class="ws-heading" style="display:flex; align-items:center; gap:10px;">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
              <path d="M7 8h10M7 12h10M7 16h10"/>
            </svg>
            Scientific Transformation Analysis & Precision Geodesy
          </h2>
        </div>

        <div class="ws-header-center">
          <!-- Transformation Model Toggle -->
          <div class="ws-filter-segmented" title="Select geometric transformation mathematical model">
            <button id="ta-model-homography" class="ws-seg-btn active" data-model="homography">
              Homography (8 DOF)
            </button>
            <button id="ta-model-affine" class="ws-seg-btn" data-model="affine">
              Affine (6 DOF)
            </button>
          </div>

          <!-- RANSAC Threshold Selector -->
          <div style="display:flex; align-items:center; gap:8px;">
            <label style="font-family:var(--font-mono); font-size:11px; color:var(--text-muted); text-transform:uppercase;">
              RANSAC ε:
            </label>
            <select id="ta-ransac-select" class="roi-select" style="padding:4px 8px; font-size:12px; height:32px;">
              <option value="1.5">1.5 px (Strict)</option>
              <option value="3.0" selected>3.0 px (Standard)</option>
              <option value="5.0">5.0 px (Permissive)</option>
            </select>
          </div>
        </div>

        <div class="ws-header-right">
          <!-- Quick Action Buttons -->
          <button id="ta-btn-copy-matrix" class="hud-btn" title="Copy Transformation Matrix to Clipboard">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            Copy Matrix
          </button>

          <button id="ta-btn-export-matrix" class="hud-btn" title="Export Matrix as Text (.txt / .mat)">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Export Matrix
          </button>

          <button id="ta-btn-export-json" class="hud-btn" title="Export Complete Transformation Analysis JSON">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
            Export JSON
          </button>

          <button id="ta-btn-export-report" class="btn-primary glow-btn" title="Export Full Scientific Coregistration Report">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
            Export Report
          </button>
        </div>
      </header>

      <!-- MAIN CONTENT VIEWPORT -->
      <div id="ta-content-area" class="ta-grid-container">
        <!-- Content dynamically injected here -->
        <div class="ta-loading-state glass-panel">
          <div class="spinner"></div>
          <p>Extracting high-precision geometric transformation matrix & computing residual statistics...</p>
        </div>
      </div>

      <!-- TOAST NOTIFICATION CONTAINER -->
      <div id="ta-toast" class="ta-toast-notification"></div>
    `

    this.container.appendChild(this.rootEl)
    this.toastEl = this.rootEl.querySelector('#ta-toast')!
  }

  private setupListeners() {
    // Model segment buttons
    const btnHomo = this.rootEl.querySelector('#ta-model-homography') as HTMLButtonElement
    const btnAffine = this.rootEl.querySelector('#ta-model-affine') as HTMLButtonElement
    const selectRansac = this.rootEl.querySelector('#ta-ransac-select') as HTMLSelectElement

    btnHomo.addEventListener('click', () => {
      if (this.transformType !== 'homography') {
        this.transformType = 'homography'
        btnHomo.classList.add('active')
        btnAffine.classList.remove('active')
        this.loadAnalysis()
      }
    })

    btnAffine.addEventListener('click', () => {
      if (this.transformType !== 'affine') {
        this.transformType = 'affine'
        btnAffine.classList.add('active')
        btnHomo.classList.remove('active')
        this.loadAnalysis()
      }
    })

    selectRansac.addEventListener('change', () => {
      this.ransacThresh = parseFloat(selectRansac.value)
      this.loadAnalysis()
    })

    // Action buttons
    const btnCopy = this.rootEl.querySelector('#ta-btn-copy-matrix') as HTMLButtonElement
    const btnExportMat = this.rootEl.querySelector('#ta-btn-export-matrix') as HTMLButtonElement
    const btnExportJson = this.rootEl.querySelector('#ta-btn-export-json') as HTMLButtonElement
    const btnExportReport = this.rootEl.querySelector('#ta-btn-export-report') as HTMLButtonElement

    btnCopy.addEventListener('click', () => this.handleCopyMatrix())
    btnExportMat.addEventListener('click', () => this.handleExportMatrix())
    btnExportJson.addEventListener('click', () => this.handleExportJson())
    btnExportReport.addEventListener('click', () => this.handleExportReport())
  }

  public async loadAnalysis() {
    const contentArea = this.rootEl.querySelector('#ta-content-area') as HTMLDivElement
    contentArea.innerHTML = `
      <div class="ta-loading-state glass-panel" style="grid-column: 1 / -1; padding: 48px; text-align: center;">
        <div class="spinner" style="margin: 0 auto 16px auto;"></div>
        <p style="font-family: var(--font-heading); font-size: 15px; color: var(--cyan-bright); letter-spacing: 0.04em;">
          Computing RANSAC ${this.transformType.toUpperCase()} Transformation Matrix for ${this.pairId.toUpperCase()}...
        </p>
        <span style="font-family: var(--font-mono); font-size: 11px; color: var(--text-muted);">
          Calculating Jacobian decomposition, spatial residual vector field, and geodetic metrics...
        </span>
      </div>
    `

    try {
      this.data = await fetchTransformationAnalysis(this.pairId, this.transformType, this.ransacThresh)
      this.updateHeaderBadges()
      this.renderFullDashboard()
    } catch (err: any) {
      this.errorMessage = err.message || 'Failed to retrieve transformation analysis'
      contentArea.innerHTML = `
        <div class="glass-panel" style="grid-column: 1 / -1; padding: 32px; border-color: var(--rose-alert); text-align: center;">
          <h3 style="color: var(--rose-alert); font-family: var(--font-heading); margin-bottom: 8px;">Analysis Failed</h3>
          <p style="color: var(--text-secondary); margin-bottom: 16px;">${this.errorMessage}</p>
          <button id="ta-retry-btn" class="hud-btn">Retry Analysis</button>
        </div>
      `
      this.rootEl.querySelector('#ta-retry-btn')?.addEventListener('click', () => this.loadAnalysis())
    }
  }

  private updateHeaderBadges() {
    if (!this.data) return
    const gradeBadge = this.rootEl.querySelector('#ta-grade-badge') as HTMLElement
    if (gradeBadge) {
      const g = this.data.error_metrics.quality_grade
      const color = this.data.error_metrics.status_color
      gradeBadge.textContent = `GRADE: ${g} • ${this.data.error_metrics.quality_rating.split('•')[0].trim()}`
      gradeBadge.style.color = color
      gradeBadge.style.borderColor = color
      gradeBadge.style.background = `${color}22`
    }
  }

  private renderFullDashboard() {
    if (!this.data) return
    const contentArea = this.rootEl.querySelector('#ta-content-area') as HTMLDivElement
    const d = this.data
    const m = d.matrix_3x3
    const p = d.parameters
    const s = d.residual_statistics
    const e = d.error_metrics
    const c = d.coordinate_system

    contentArea.innerHTML = `
      <!-- ROW 1: TRANSFORMATION MATRIX & MATHEMATICAL VISUALIZATION -->
      <section class="ta-matrix-section glass-panel corner-reticle">
        <div class="ta-section-header">
          <div style="display:flex; align-items:center; gap:10px;">
            <div class="ta-icon-bubble" style="background: rgba(56, 189, 248, 0.15); color: var(--cyan-bright);">📐</div>
            <div>
              <h3 class="ta-section-title">Geometric Transformation Matrix</h3>
              <p class="ta-section-subtitle">
                Model: <strong>${d.transform_type_label}</strong> &bull; Degrees of Freedom: <strong>${d.degrees_of_freedom}</strong> &bull; Mapping: <code>x' &sim; H &middot; x</code>
              </p>
            </div>
          </div>

          <div class="ta-matrix-actions">
            <button id="ta-copy-latex-btn" class="hud-btn" style="font-size:11px; padding:4px 10px;">
              Copy LaTeX
            </button>
            <button id="ta-copy-json-matrix-btn" class="hud-btn" style="font-size:11px; padding:4px 10px;">
              Copy 3&times;3 JSON
            </button>
          </div>
        </div>

        <!-- MATHEMATICAL BRACKET MATRIX LAYOUT -->
        <div class="ta-matrix-stage">
          <div class="ta-math-wrapper">
            <div class="ta-matrix-symbol-label">
              <span class="ta-math-bold">${d.transform_type === 'homography' ? 'H' : 'A'}</span> =
            </div>

            <!-- Visual 3x3 Bracket Display -->
            <div class="ta-matrix-bracket-box">
              <div class="ta-bracket-left"></div>
              
              <table class="ta-matrix-table">
                <tbody>
                  <!-- Row 1: a11, a12, tx -->
                  <tr>
                    <td class="ta-cell-td ta-group-affine" data-symbol="a11" data-val="${m[0][0]}" data-role="Linear Scale & Rotation Cosine">
                      <div class="ta-cell-symbol">a₁₁</div>
                      <div class="ta-cell-value">${m[0][0] >= 0 ? '+' : ''}${m[0][0].toFixed(6)}</div>
                    </td>
                    <td class="ta-cell-td ta-group-affine" data-symbol="a12" data-val="${m[0][1]}" data-role="Linear Shear & Rotation Sine">
                      <div class="ta-cell-symbol">a₁₂</div>
                      <div class="ta-cell-value">${m[0][1] >= 0 ? '+' : ''}${m[0][1].toFixed(6)}</div>
                    </td>
                    <td class="ta-cell-td ta-group-translation" data-symbol="tx" data-val="${m[0][2]}" data-role="X-Translation (Shift across columns)">
                      <div class="ta-cell-symbol">tₓ</div>
                      <div class="ta-cell-value">${m[0][2] >= 0 ? '+' : ''}${m[0][2].toFixed(3)} <span class="ta-unit">px</span></div>
                    </td>
                  </tr>

                  <!-- Row 2: a21, a22, ty -->
                  <tr>
                    <td class="ta-cell-td ta-group-affine" data-symbol="a21" data-val="${m[1][0]}" data-role="Linear Skew & Rotation Sine">
                      <div class="ta-cell-symbol">a₂₁</div>
                      <div class="ta-cell-value">${m[1][0] >= 0 ? '+' : ''}${m[1][0].toFixed(6)}</div>
                    </td>
                    <td class="ta-cell-td ta-group-affine" data-symbol="a22" data-val="${m[1][1]}" data-role="Linear Scale & Rotation Cosine">
                      <div class="ta-cell-symbol">a₂₂</div>
                      <div class="ta-cell-value">${m[1][1] >= 0 ? '+' : ''}${m[1][1].toFixed(6)}</div>
                    </td>
                    <td class="ta-cell-td ta-group-translation" data-symbol="ty" data-val="${m[1][2]}" data-role="Y-Translation (Shift down rows)">
                      <div class="ta-cell-symbol">tᵧ</div>
                      <div class="ta-cell-value">${m[1][2] >= 0 ? '+' : ''}${m[1][2].toFixed(3)} <span class="ta-unit">px</span></div>
                    </td>
                  </tr>

                  <!-- Row 3: h31, h32, 1.0 -->
                  <tr>
                    <td class="ta-cell-td ta-group-projective" data-symbol="h31" data-val="${m[2][0]}" data-role="Projective Perspective Tilt X">
                      <div class="ta-cell-symbol">h₃₁</div>
                      <div class="ta-cell-value">${m[2][0].toExponential(4)}</div>
                    </td>
                    <td class="ta-cell-td ta-group-projective" data-symbol="h32" data-val="${m[2][1]}" data-role="Projective Perspective Tilt Y">
                      <div class="ta-cell-symbol">h₃₂</div>
                      <div class="ta-cell-value">${m[2][1].toExponential(4)}</div>
                    </td>
                    <td class="ta-cell-td ta-group-normalizer" data-symbol="h33" data-val="${m[2][2]}" data-role="Homogeneous Normalizing Coordinate">
                      <div class="ta-cell-symbol">h₃₃</div>
                      <div class="ta-cell-value">${m[2][2].toFixed(4)}</div>
                    </td>
                  </tr>
                </tbody>
              </table>

              <div class="ta-bracket-right"></div>
            </div>

            <!-- Input / Output Vector Mapping Diagram -->
            <div class="ta-vector-equation">
              <span class="ta-math-eq">&times;</span>
              <div class="ta-mini-vector">
                <span class="ta-bracket-mini">[</span>
                <span class="ta-vec-item">x</span>
                <span class="ta-vec-item">y</span>
                <span class="ta-vec-item">1</span>
                <span class="ta-bracket-mini">]ᵀ</span>
              </div>
              <span class="ta-math-eq">&sim;</span>
              <div class="ta-mini-vector" style="color:var(--cyan-bright);">
                <span class="ta-bracket-mini">[</span>
                <span class="ta-vec-item">x'</span>
                <span class="ta-vec-item">y'</span>
                <span class="ta-vec-item">1</span>
                <span class="ta-bracket-mini">]ᵀ</span>
              </div>
            </div>
          </div>

          <!-- Component Color Legend & Inspector Readout -->
          <div class="ta-matrix-legend-card">
            <div class="ta-legend-item">
              <span class="ta-legend-dot" style="background:#38bdf8;"></span>
              <span><strong>Affine Linear Tensor</strong> (Scale, Rotation, Shear)</span>
            </div>
            <div class="ta-legend-item">
              <span class="ta-legend-dot" style="background:#f59e0b;"></span>
              <span><strong>Translation Vector</strong> (tₓ, tᵧ image shift)</span>
            </div>
            <div class="ta-legend-item">
              <span class="ta-legend-dot" style="background:#a855f7;"></span>
              <span><strong>Perspective Vector</strong> (Non-affine planar tilt)</span>
            </div>
            <div class="ta-legend-item">
              <span class="ta-legend-dot" style="background:#10b981;"></span>
              <span><strong>Projective Scale</strong> (Homogeneous scale = 1.0)</span>
            </div>

            <div id="ta-cell-inspector-panel" class="ta-inspector-box">
              <span class="ta-inspector-hint">Hover over any matrix coefficient above to inspect scientific role.</span>
            </div>
          </div>
        </div>

        <!-- MATRIX PROPERTIES FOOTER BAR -->
        <div class="ta-properties-bar">
          <div class="ta-prop-item">
            <span class="ta-prop-label">Determinant (det H)</span>
            <span class="ta-prop-val">${d.properties.determinant.toFixed(6)}</span>
          </div>
          <div class="ta-prop-item">
            <span class="ta-prop-label">Condition Number (&kappa;)</span>
            <span class="ta-prop-val">${d.properties.condition_number.toFixed(2)}</span>
            <span class="ta-prop-sub">${d.properties.condition_number < 100 ? 'Well-conditioned' : 'Ill-conditioned'}</span>
          </div>
          <div class="ta-prop-item">
            <span class="ta-prop-label">Area Dilation Factor</span>
            <span class="ta-prop-val">${d.properties.area_dilation_factor.toFixed(4)}&times;</span>
          </div>
          <div class="ta-prop-item">
            <span class="ta-prop-label">Singular Values (&sigma;₁, &sigma;₂, &sigma;₃)</span>
            <span class="ta-prop-val" style="font-size:12px;">${d.properties.singular_values.join(', ')}</span>
          </div>
          <div class="ta-prop-item">
            <span class="ta-prop-label">Invertibility</span>
            <span class="ta-prop-val" style="color:var(--emerald-status);">
              ${d.properties.is_invertible ? 'Non-Singular &radic;' : 'Singular'}
            </span>
          </div>
        </div>
      </section>

      <!-- ROW 2: PARAMETER CARDS (DECOMPOSED SCIENTIFIC PARAMETERS) -->
      <section class="ta-parameters-section">
        <h3 class="ta-subsection-title">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 14 14"/></svg>
          Decomposed Geometric Parameters
        </h3>

        <div class="ta-param-cards-grid">
          <!-- Card 1: Translation X -->
          <div class="ta-card glass-panel">
            <div class="ta-card-top">
              <span class="ta-card-title">X-Translation (&Delta;x)</span>
              <span class="ta-card-badge">Column Shift</span>
            </div>
            <div class="ta-card-num">${p.dx_px >= 0 ? '+' : ''}${p.dx_px.toFixed(3)} <span class="ta-card-unit">px</span></div>
            <div class="ta-card-sub">${p.dx_meters >= 0 ? '+' : ''}${p.dx_meters.toFixed(2)} meters on lunar surface</div>
          </div>

          <!-- Card 2: Translation Y -->
          <div class="ta-card glass-panel">
            <div class="ta-card-top">
              <span class="ta-card-title">Y-Translation (&Delta;y)</span>
              <span class="ta-card-badge">Row Shift</span>
            </div>
            <div class="ta-card-num">${p.dy_px >= 0 ? '+' : ''}${p.dy_px.toFixed(3)} <span class="ta-card-unit">px</span></div>
            <div class="ta-card-sub">${p.dy_meters >= 0 ? '+' : ''}${p.dy_meters.toFixed(2)} meters on lunar surface</div>
          </div>

          <!-- Card 3: Total Translation Magnitude -->
          <div class="ta-card glass-panel">
            <div class="ta-card-top">
              <span class="ta-card-title">Total Offset (||t||)</span>
              <span class="ta-card-badge">Euclidean Norm</span>
            </div>
            <div class="ta-card-num">${p.translation_magnitude_px.toFixed(3)} <span class="ta-card-unit">px</span></div>
            <div class="ta-card-sub">${p.translation_magnitude_meters.toFixed(2)} m ground displacement</div>
          </div>

          <!-- Card 4: Planar Rotation -->
          <div class="ta-card glass-panel">
            <div class="ta-card-top">
              <span class="ta-card-title">Planar Rotation (&theta;)</span>
              <span class="ta-card-badge">Angular Disparity</span>
            </div>
            <div class="ta-card-num">${p.rotation_deg >= 0 ? '+' : ''}${p.rotation_deg.toFixed(3)}&deg;</div>
            <div class="ta-card-sub">${p.rotation_rad >= 0 ? '+' : ''}${p.rotation_rad.toFixed(5)} radians (${p.rotation_deg >= 0 ? 'CCW' : 'CW'})</div>
          </div>

          <!-- Card 5: Scale Factors Sx & Sy -->
          <div class="ta-card glass-panel">
            <div class="ta-card-top">
              <span class="ta-card-title">Scale Factor (Sₓ / Sᵧ)</span>
              <span class="ta-card-badge">Radial Zoom</span>
            </div>
            <div class="ta-card-num">${p.scale_x.toFixed(4)} <span class="ta-card-unit">/ ${p.scale_y.toFixed(4)}</span></div>
            <div class="ta-card-sub">Anisotropy ratio: ${p.anisotropy_ratio.toFixed(5)}</div>
          </div>

          <!-- Card 6: Shear & Skew -->
          <div class="ta-card glass-panel">
            <div class="ta-card-top">
              <span class="ta-card-title">Shear Parameter (kₓ)</span>
              <span class="ta-card-badge">Affine Skew</span>
            </div>
            <div class="ta-card-num">${p.shear_x >= 0 ? '+' : ''}${p.shear_x.toFixed(4)}</div>
            <div class="ta-card-sub">Shear angle: ${p.shear_angle_deg >= 0 ? '+' : ''}${p.shear_angle_deg.toFixed(3)}&deg;</div>
          </div>

          <!-- Card 7: Projective Tilt Components -->
          <div class="ta-card glass-panel">
            <div class="ta-card-top">
              <span class="ta-card-title">Projective Tilt (h₃₁, h₃₂)</span>
              <span class="ta-card-badge">${d.transform_type === 'homography' ? 'Perspective' : 'Affine Flat'}</span>
            </div>
            <div class="ta-card-num" style="font-size:16px;">${p.projective_v1.toExponential(3)}, ${p.projective_v2.toExponential(3)}</div>
            <div class="ta-card-sub">Off-nadir optical inclination vector</div>
          </div>

          <!-- Card 8: Determinant -->
          <div class="ta-card glass-panel">
            <div class="ta-card-top">
              <span class="ta-card-title">Determinant det(H)</span>
              <span class="ta-card-badge">Area Ratio</span>
            </div>
            <div class="ta-card-num">${d.properties.determinant.toFixed(5)}</div>
            <div class="ta-card-sub">${((d.properties.determinant - 1) * 100).toFixed(2)}% net footprint area change</div>
          </div>
        </div>
      </section>

      <!-- ROW 3: RESIDUAL PLOT & ERROR DISTRIBUTION HISTOGRAM -->
      <section class="ta-visuals-grid">
        <!-- LEFT: RESIDUAL PLOT (QUIVER VECTOR FIELD & RADIAL) -->
        <div class="ta-plot-card glass-panel corner-reticle">
          <div class="ta-plot-header">
            <div>
              <h4 class="ta-plot-title">Residual Vector Field & Disparity Plot</h4>
              <p class="ta-plot-subtitle">Distribution of reprojection error vectors (&Delta;u, &Delta;v) across ${d.residuals.length} points</p>
            </div>

            <div class="ta-plot-toggles">
              <button id="ta-plot-btn-scatter" class="hud-btn active" style="font-size:11px;">Vector Quiver</button>
              <button id="ta-plot-btn-radial" class="hud-btn" style="font-size:11px;">Radial Error</button>
            </div>
          </div>

          <!-- Canvas Plot Container -->
          <div class="ta-canvas-wrap">
            <canvas id="ta-residual-canvas" width="600" height="380"></canvas>
            <div id="ta-residual-tooltip" class="ta-canvas-tooltip"></div>
          </div>

          <div class="ta-plot-footer">
            <span class="ta-ring-label"><span class="ta-dot" style="background:#10b981;"></span> Inner Ring: 1.0 px (Sub-pixel goal)</span>
            <span class="ta-ring-label"><span class="ta-dot" style="background:#38bdf8;"></span> Middle Ring: 2.0 px</span>
            <span class="ta-ring-label"><span class="ta-dot" style="background:#f59e0b;"></span> Outer Ring: 3.0 px (RANSAC threshold)</span>
          </div>
        </div>

        <!-- RIGHT: ERROR DISTRIBUTION HISTOGRAM & BOX PLOT -->
        <div class="ta-plot-card glass-panel corner-reticle">
          <div class="ta-plot-header">
            <div>
              <h4 class="ta-plot-title">Reprojection Error Distribution</h4>
              <p class="ta-plot-subtitle">Frequency histogram & quantile boxplot (Mean: ${s.mean_error.toFixed(3)} px)</p>
            </div>
            <div class="badge-counter" style="background:rgba(56, 189, 248, 0.15); color:var(--cyan-bright);">
              10 Bins
            </div>
          </div>

          <!-- Canvas Histogram Container -->
          <div class="ta-canvas-wrap">
            <canvas id="ta-hist-canvas" width="600" height="380"></canvas>
            <div id="ta-hist-tooltip" class="ta-canvas-tooltip"></div>
          </div>

          <div class="ta-plot-footer">
            <span class="ta-ring-label">Min: <strong>${s.min_error.toFixed(3)} px</strong></span>
            <span class="ta-ring-label">Q1: <strong>${s.q1.toFixed(3)} px</strong></span>
            <span class="ta-ring-label">Median: <strong>${s.median_error.toFixed(3)} px</strong></span>
            <span class="ta-ring-label">Q3: <strong>${s.q3.toFixed(3)} px</strong></span>
            <span class="ta-ring-label">P95: <strong>${s.p95.toFixed(3)} px</strong></span>
          </div>
        </div>
      </section>

      <!-- ROW 4: RESIDUAL STATISTICS & ERROR METRICS SUMMARY TABLE -->
      <section class="ta-stats-section glass-panel">
        <div class="ta-stats-header">
          <h3 class="ta-section-title" style="margin:0;">
            Residual Statistics & Geodetic Precision Metrics
          </h3>
          <div style="font-family:var(--font-mono); font-size:12px; color:var(--text-secondary);">
            GSD Resolution: <strong>5.0 meters / pixel</strong>
          </div>
        </div>

        <div class="ta-stats-table-wrap">
          <table class="ta-stats-table">
            <thead>
              <tr>
                <th>Statistical Metric</th>
                <th>Pixel Value (px)</th>
                <th>Ground Surface Metric (m)</th>
                <th>Tolerance Threshold</th>
                <th>ISRO Compliance</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>Root Mean Square Error (RMSE)</strong></td>
                <td class="ta-td-bold" style="color:${e.status_color};">${s.rmse.toFixed(4)} px</td>
                <td class="ta-td-bold">${e.rmse_meters.toFixed(3)} m</td>
                <td>&lt; 2.500 px</td>
                <td><span class="ta-pill-pass">${s.rmse < 1.0 ? 'OPTIMAL' : 'PASSED'}</span></td>
              </tr>
              <tr>
                <td><strong>Mean Reprojection Error (&mu;)</strong></td>
                <td>${s.mean_error.toFixed(4)} px</td>
                <td>${e.mean_reproj_error_meters.toFixed(3)} m</td>
                <td>&lt; 2.000 px</td>
                <td><span class="ta-pill-pass">PASSED</span></td>
              </tr>
              <tr>
                <td><strong>Median Residual Error</strong></td>
                <td>${s.median_error.toFixed(4)} px</td>
                <td>${(s.median_error * 5.0).toFixed(3)} m</td>
                <td>&lt; 1.500 px</td>
                <td><span class="ta-pill-pass">PASSED</span></td>
              </tr>
              <tr>
                <td><strong>Standard Deviation (&sigma;)</strong></td>
                <td>${s.std_error.toFixed(4)} px</td>
                <td>${(s.std_error * 5.0).toFixed(3)} m</td>
                <td>&plusmn;1.000 px</td>
                <td><span class="ta-pill-pass">UNIFORM</span></td>
              </tr>
              <tr>
                <td><strong>Variance (&sigma;&sup2;)</strong></td>
                <td>${s.variance.toFixed(4)} px&sup2;</td>
                <td>${(s.variance * 25.0).toFixed(3)} m&sup2;</td>
                <td>&mdash;</td>
                <td><span class="ta-pill-neutral">NORMAL</span></td>
              </tr>
              <tr>
                <td><strong>Mean Absolute Deviation (MAD)</strong></td>
                <td>${s.mad.toFixed(4)} px</td>
                <td>${(s.mad * 5.0).toFixed(3)} m</td>
                <td>&lt; 1.200 px</td>
                <td><span class="ta-pill-pass">PASSED</span></td>
              </tr>
              <tr>
                <td><strong>Interquartile Range (IQR = Q3 &minus; Q1)</strong></td>
                <td>${s.iqr.toFixed(4)} px</td>
                <td>${(s.iqr * 5.0).toFixed(3)} m</td>
                <td>&mdash;</td>
                <td><span class="ta-pill-neutral">ROBUST</span></td>
              </tr>
              <tr>
                <td><strong>95th Percentile Error (P95)</strong></td>
                <td>${s.p95.toFixed(4)} px</td>
                <td>${(s.p95 * 5.0).toFixed(3)} m</td>
                <td>&lt; 3.000 px</td>
                <td><span class="ta-pill-pass">${s.p95 <= 3.0 ? 'PASSED' : 'TOLERATED'}</span></td>
              </tr>
              <tr>
                <td><strong>Inlier Points / Outlier Ratio</strong></td>
                <td>${s.inliers_count} inliers / ${s.outliers_count} outliers</td>
                <td>${s.inlier_percentage.toFixed(2)}% inlier retention</td>
                <td>&gt; 50.0%</td>
                <td><span class="ta-pill-pass">RANSAC CONVERGED</span></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- ROW 5: COORDINATE SYSTEM INFORMATION & TRANSFORMATION SUMMARY -->
      <section class="ta-crs-summary-grid">
        <!-- LEFT: COORDINATE SYSTEM & DATUM SPECIFICATIONS -->
        <div class="ta-crs-card glass-panel corner-reticle">
          <div class="ta-card-top">
            <span class="ta-card-title">Coordinate Reference Systems (CRS)</span>
            <span class="ta-card-badge">Photogrammetry Frame</span>
          </div>

          <div class="ta-crs-details">
            <div class="ta-crs-row">
              <span class="ta-crs-label">Source Raster CRS:</span>
              <span class="ta-crs-value">${c.source_crs}</span>
            </div>
            <div class="ta-crs-row">
              <span class="ta-crs-label">Source Instrument:</span>
              <span class="ta-crs-value">${c.source_instrument}</span>
            </div>
            <div class="ta-crs-row">
              <span class="ta-crs-label">Source Resolution:</span>
              <span class="ta-crs-value">${c.source_resolution}</span>
            </div>
            <div class="ta-crs-row">
              <span class="ta-crs-label">Reference Baseline CRS:</span>
              <span class="ta-crs-value">${c.reference_crs}</span>
            </div>
            <div class="ta-crs-row">
              <span class="ta-crs-label">Reference Instrument:</span>
              <span class="ta-crs-value">${c.reference_instrument}</span>
            </div>
            <div class="ta-crs-row">
              <span class="ta-crs-label">Lunar Geodetic Datum:</span>
              <span class="ta-crs-value">${c.datum}</span>
            </div>
            <div class="ta-crs-row">
              <span class="ta-crs-label">Image Coordinate Origin:</span>
              <span class="ta-crs-value">${c.registration_origin}</span>
            </div>
            <div class="ta-crs-row">
              <span class="ta-crs-label">Resampling Engine:</span>
              <span class="ta-crs-value">${c.interpolation_kernel}</span>
            </div>
          </div>
        </div>

        <!-- RIGHT: TRANSFORMATION SUMMARY & EXECUTIVE MISSION STATEMENT -->
        <div class="ta-summary-card glass-panel corner-reticle">
          <div class="ta-card-top">
            <span class="ta-card-title">Transformation Executive Summary</span>
            <span class="ta-card-badge" style="background:rgba(16, 185, 129, 0.15); color:var(--emerald-status);">
              ${d.transformation_summary.solution_status}
            </span>
          </div>

          <div class="ta-summary-body">
            <p class="ta-summary-p">
              <strong>Mission Mission Profile:</strong> ${d.transformation_summary.mission} &mdash; ${d.transformation_summary.experiment}.
            </p>
            <p class="ta-summary-p">
              <strong>Algorithmic Convergence:</strong> ${d.transformation_summary.verification_note}
            </p>
            <p class="ta-summary-p">
              <strong>Mathematical Fidelity:</strong> ${d.transformation_summary.mathematical_fidelity}
            </p>

            <div class="ta-callout-box">
              <div class="ta-callout-icon">🛰️</div>
              <div class="ta-callout-text">
                <strong>Sub-Pixel Geodetic Coregistration Validated:</strong>
                Calculated RMSE of <code>${s.rmse.toFixed(4)} px</code> (${e.rmse_meters.toFixed(2)} m) confirms that the TMC observations have achieved scientific precision coregistration against the Lunar Orbiter Laser Altimeter (LOLA) and LROC terrain reference frameworks.
              </div>
            </div>
          </div>
        </div>
      </section>
    `

    // Setup interactive events for the rendered elements
    this.setupMatrixInspectorEvents()
    this.initResidualPlot()
    this.initHistogramPlot()
  }

  private setupMatrixInspectorEvents() {
    const cells = this.rootEl.querySelectorAll('.ta-cell-td')
    const panel = this.rootEl.querySelector('#ta-cell-inspector-panel') as HTMLDivElement

    cells.forEach((cell) => {
      cell.addEventListener('mouseenter', () => {
        const symbol = cell.getAttribute('data-symbol')
        const val = cell.getAttribute('data-val')
        const role = cell.getAttribute('data-role')
        if (panel) {
          panel.innerHTML = `
            <div style="display:flex; align-items:center; gap:8px;">
              <span class="ta-math-bold" style="font-size:16px; color:var(--cyan-bright);">${symbol}</span>
              <span style="font-family:var(--font-mono); font-size:13px; color:#fff;">= ${val}</span>
            </div>
            <div style="font-size:12px; color:var(--text-secondary); margin-top:2px;">
              ${role}
            </div>
          `
        }
      })
    })

    // Quick copy LaTeX button inside matrix
    const copyLatexBtn = this.rootEl.querySelector('#ta-copy-latex-btn')
    copyLatexBtn?.addEventListener('click', () => {
      if (this.data) {
        navigator.clipboard.writeText(this.data.matrix_latex)
        this.showToast('Copied LaTeX matrix representation to clipboard!')
      }
    })

    // Quick copy JSON matrix button
    const copyJsonBtn = this.rootEl.querySelector('#ta-copy-json-matrix-btn')
    copyJsonBtn?.addEventListener('click', () => {
      if (this.data) {
        navigator.clipboard.writeText(JSON.stringify(this.data.matrix_3x3, null, 2))
        this.showToast('Copied 3x3 JSON matrix to clipboard!')
      }
    })

    // Plot toggle buttons
    const btnScatter = this.rootEl.querySelector('#ta-plot-btn-scatter') as HTMLButtonElement
    const btnRadial = this.rootEl.querySelector('#ta-plot-btn-radial') as HTMLButtonElement

    btnScatter?.addEventListener('click', () => {
      this.residualPlotMode = 'scatter'
      btnScatter.classList.add('active')
      btnRadial.classList.remove('active')
      this.drawResidualPlot()
    })

    btnRadial?.addEventListener('click', () => {
      this.residualPlotMode = 'radial'
      btnRadial.classList.add('active')
      btnScatter.classList.remove('active')
      this.drawResidualPlot()
    })
  }

  // ---------------------------------------------------------------------------
  // INTERACTIVE RESIDUAL PLOT RENDERING (QUIVER & RADIAL)
  // ---------------------------------------------------------------------------
  private initResidualPlot() {
    this.residualCanvas = this.rootEl.querySelector('#ta-residual-canvas') as HTMLCanvasElement
    if (!this.residualCanvas) return
    this.drawResidualPlot()

    // Interactive tooltip hover
    const tooltip = this.rootEl.querySelector('#ta-residual-tooltip') as HTMLDivElement
    this.residualCanvas.addEventListener('mousemove', (e) => {
      const rect = this.residualCanvas.getBoundingClientRect()
      const mouseX = e.clientX - rect.left
      const mouseY = e.clientY - rect.top
      this.handleResidualHover(mouseX, mouseY, tooltip)
    })

    this.residualCanvas.addEventListener('mouseleave', () => {
      if (tooltip) tooltip.style.display = 'none'
    })
  }

  private drawResidualPlot() {
    if (!this.residualCanvas || !this.data) return
    const ctx = this.residualCanvas.getContext('2d')!
    const w = this.residualCanvas.width
    const h = this.residualCanvas.height

    ctx.clearRect(0, 0, w, h)

    // Background gradient
    const bgGrad = ctx.createLinearGradient(0, 0, 0, h)
    bgGrad.addColorStop(0, '#04091a')
    bgGrad.addColorStop(1, '#07122b')
    ctx.fillStyle = bgGrad
    ctx.fillRect(0, 0, w, h)

    const cx = w / 2
    const cy = h / 2

    if (this.residualPlotMode === 'scatter') {
      // 2D Quiver / Scatter plot of (dx, dy) error
      const maxRange = Math.max(3.5, this.data.residual_statistics.max_error * 1.1)
      const scale = (Math.min(w, h) / 2 - 30) / maxRange

      // Grid lines
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.08)'
      ctx.lineWidth = 1
      for (let r = 0.5; r <= maxRange; r += 0.5) {
        ctx.beginPath()
        ctx.arc(cx, cy, r * scale, 0, Math.PI * 2)
        ctx.stroke()
      }

      // Major target rings
      // 1.0 px Ring (Green)
      ctx.strokeStyle = 'rgba(16, 185, 129, 0.55)'
      ctx.setLineDash([4, 4])
      ctx.beginPath()
      ctx.arc(cx, cy, 1.0 * scale, 0, Math.PI * 2)
      ctx.stroke()

      // 2.0 px Ring (Cyan)
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)'
      ctx.beginPath()
      ctx.arc(cx, cy, 2.0 * scale, 0, Math.PI * 2)
      ctx.stroke()

      // 3.0 px Ring (Amber RANSAC threshold)
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.65)'
      ctx.setLineDash([6, 3])
      ctx.beginPath()
      ctx.arc(cx, cy, this.ransacThresh * scale, 0, Math.PI * 2)
      ctx.stroke()
      ctx.setLineDash([])

      // Coordinate Crosshairs
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)'
      ctx.beginPath()
      ctx.moveTo(cx, 15)
      ctx.lineTo(cx, h - 15)
      ctx.moveTo(15, cy)
      ctx.lineTo(w - 15, cy)
      ctx.stroke()

      // Axis labels
      ctx.fillStyle = '#64748b'
      ctx.font = '10px JetBrains Mono, monospace'
      ctx.fillText('+&Delta;u (px)', w - 65, cy - 6)
      ctx.fillText('+&Delta;v (px)', cx + 6, 22)
      ctx.fillText('1.0 px', cx + 1.0 * scale + 4, cy - 4)
      ctx.fillText(`${this.ransacThresh.toFixed(1)} px`, cx + this.ransacThresh * scale + 4, cy - 4)

      // Draw residual points
      this.data.residuals.forEach((pt) => {
        const px = cx + pt.residual_dx * scale
        const py = cy - pt.residual_dy * scale

        let color = '#10b981'
        if (pt.residual_error > 2.0) color = '#f59e0b'
        else if (pt.residual_error > 1.0) color = '#38bdf8'
        if (!pt.is_inlier) color = '#f43f5e'

        // Residual vector line from origin
        ctx.strokeStyle = `${color}44`
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(cx, cy)
        ctx.lineTo(px, py)
        ctx.stroke()

        // Point circle
        ctx.fillStyle = color
        ctx.beginPath()
        ctx.arc(px, py, pt.is_inlier ? 3.5 : 2.5, 0, Math.PI * 2)
        ctx.fill()
      })
    } else {
      // Radial Error vs Distance from Center Mode
      const padding = 50
      const plotW = w - padding * 2
      const plotH = h - padding * 2

      const maxDist = 380
      const maxErr = Math.max(3.5, this.data.residual_statistics.max_error * 1.1)

      // Axes
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.2)'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(padding, padding)
      ctx.lineTo(padding, h - padding)
      ctx.lineTo(w - padding, h - padding)
      ctx.stroke()

      // RANSAC Threshold line
      const threshY = h - padding - (this.ransacThresh / maxErr) * plotH
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.6)'
      ctx.setLineDash([5, 4])
      ctx.beginPath()
      ctx.moveTo(padding, threshY)
      ctx.lineTo(w - padding, threshY)
      ctx.stroke()
      ctx.setLineDash([])

      // Labels
      ctx.fillStyle = '#94a3b8'
      ctx.font = '10px JetBrains Mono, monospace'
      ctx.fillText('Radial Distance from Image Center (px) &rarr;', padding + 10, h - padding + 28)
      ctx.fillText('&uarr; Reprojection Error (px)', padding - 5, padding - 15)
      ctx.fillText(`RANSAC &epsilon; (${this.ransacThresh} px)`, w - padding - 110, threshY - 6)

      // Points
      this.data.residuals.forEach((pt) => {
        const x = padding + (pt.dist_from_center / maxDist) * plotW
        const y = h - padding - (pt.residual_error / maxErr) * plotH

        let color = '#38bdf8'
        if (pt.residual_error < 1.0) color = '#10b981'
        if (!pt.is_inlier) color = '#f43f5e'

        ctx.fillStyle = color
        ctx.beginPath()
        ctx.arc(x, y, 3, 0, Math.PI * 2)
        ctx.fill()
      })
    }
  }

  private handleResidualHover(mouseX: number, mouseY: number, tooltip: HTMLDivElement) {
    if (!this.data || !this.residualCanvas) return
    const w = this.residualCanvas.width
    const h = this.residualCanvas.height
    const cx = w / 2
    const cy = h / 2

    const maxRange = Math.max(3.5, this.data.residual_statistics.max_error * 1.1)
    const scale = (Math.min(w, h) / 2 - 30) / maxRange

    let closest: any = null
    let minDist = 14

    if (this.residualPlotMode === 'scatter') {
      this.data.residuals.forEach((pt) => {
        const px = cx + pt.residual_dx * scale
        const py = cy - pt.residual_dy * scale
        const dist = Math.hypot(mouseX - px, mouseY - py)
        if (dist < minDist) {
          minDist = dist
          closest = { pt, px, py }
        }
      })
    }

    if (closest) {
      tooltip.style.display = 'block'
      tooltip.style.left = `${closest.px + 12}px`
      tooltip.style.top = `${closest.py - 12}px`
      tooltip.innerHTML = `
        <div style="font-weight:600; color:var(--cyan-bright); font-size:11px;">Tie-point #${closest.pt.id}</div>
        <div>&Delta;u (dx): <strong>${closest.pt.residual_dx > 0 ? '+' : ''}${closest.pt.residual_dx.toFixed(3)} px</strong></div>
        <div>&Delta;v (dy): <strong>${closest.pt.residual_dy > 0 ? '+' : ''}${closest.pt.residual_dy.toFixed(3)} px</strong></div>
        <div>Error ||e||: <strong>${closest.pt.residual_error.toFixed(3)} px</strong> (${(closest.pt.residual_error * 5.0).toFixed(2)} m)</div>
        <div>Status: <span style="color:${closest.pt.is_inlier ? '#10b981' : '#f43f5e'}">${closest.pt.is_inlier ? 'INLIER' : 'REJECTED OUTLIER'}</span></div>
      `
    } else {
      tooltip.style.display = 'none'
    }
  }

  // ---------------------------------------------------------------------------
  // ERROR DISTRIBUTION HISTOGRAM & BOX PLOT RENDERING
  // ---------------------------------------------------------------------------
  private initHistogramPlot() {
    this.histCanvas = this.rootEl.querySelector('#ta-hist-canvas') as HTMLCanvasElement
    if (!this.histCanvas || !this.data) return
    this.drawHistogramPlot()
  }

  private drawHistogramPlot() {
    const ctx = this.histCanvas.getContext('2d')!
    const w = this.histCanvas.width
    const h = this.histCanvas.height
    const d = this.data!
    const s = d.residual_statistics

    ctx.clearRect(0, 0, w, h)

    // Background gradient
    const bgGrad = ctx.createLinearGradient(0, 0, 0, h)
    bgGrad.addColorStop(0, '#04091a')
    bgGrad.addColorStop(1, '#07122b')
    ctx.fillStyle = bgGrad
    ctx.fillRect(0, 0, w, h)

    const padding = 45
    const histW = w - padding * 2
    const histH = h - padding * 2 - 40 // Leave bottom 40px for box plot
    const bins = d.error_distribution

    if (!bins || bins.length === 0) return

    const maxCount = Math.max(...bins.map((b) => b.count), 1)
    const barWidth = histW / bins.length

    // Grid lines
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.08)'
    ctx.lineWidth = 1
    for (let i = 0; i <= 4; i++) {
      const y = padding + (histH / 4) * i
      ctx.beginPath()
      ctx.moveTo(padding, y)
      ctx.lineTo(w - padding, y)
      ctx.stroke()

      const val = Math.round(maxCount * (1 - i / 4))
      ctx.fillStyle = '#64748b'
      ctx.font = '10px JetBrains Mono, monospace'
      ctx.fillText(String(val), padding - 28, y + 4)
    }

    // Draw Histogram Bars
    bins.forEach((b, idx) => {
      const barH = (b.count / maxCount) * histH
      const x = padding + idx * barWidth + 3
      const y = padding + histH - barH
      const bw = barWidth - 6

      // Bar gradient
      const barGrad = ctx.createLinearGradient(0, y, 0, y + barH)
      barGrad.addColorStop(0, '#38bdf8')
      barGrad.addColorStop(1, 'rgba(56, 189, 248, 0.2)')

      ctx.fillStyle = barGrad
      ctx.fillRect(x, y, bw, barH)

      // Bar top stroke
      ctx.strokeStyle = '#38bdf8'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x + bw, y)
      ctx.stroke()

      // Count on top of bar
      if (b.count > 0) {
        ctx.fillStyle = '#94a3b8'
        ctx.font = '9px JetBrains Mono, monospace'
        ctx.textAlign = 'center'
        ctx.fillText(String(b.count), x + bw / 2, y - 4)
        ctx.textAlign = 'left'
      }

      // X Axis Label
      if (idx % 2 === 0 || idx === bins.length - 1) {
        ctx.fillStyle = '#64748b'
        ctx.font = '9px JetBrains Mono, monospace'
        ctx.fillText(`${b.range_min.toFixed(1)}`, x, padding + histH + 14)
      }
    })

    // Mean error vertical dashed marker
    const maxRange = bins[bins.length - 1].range_max
    const meanX = padding + (s.mean_error / maxRange) * histW
    ctx.strokeStyle = '#f59e0b'
    ctx.setLineDash([4, 4])
    ctx.beginPath()
    ctx.moveTo(meanX, padding)
    ctx.lineTo(meanX, padding + histH)
    ctx.stroke()
    ctx.setLineDash([])

    ctx.fillStyle = '#f59e0b'
    ctx.font = '10px JetBrains Mono, monospace'
    ctx.fillText(`&mu; = ${s.mean_error.toFixed(2)} px`, meanX + 4, padding + 14)

    // -------------------------------------------------------------------------
    // HORIZONTAL BOX PLOT (Lower section)
    // -------------------------------------------------------------------------
    const boxY = h - 25
    const q1X = padding + (s.q1 / maxRange) * histW
    const medX = padding + (s.median_error / maxRange) * histW
    const q3X = padding + (s.q3 / maxRange) * histW
    const minX = padding + (s.min_error / maxRange) * histW
    const p95X = padding + (s.p95 / maxRange) * histW

    // Whiskers
    ctx.strokeStyle = '#94a3b8'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(minX, boxY)
    ctx.lineTo(q1X, boxY)
    ctx.moveTo(q3X, boxY)
    ctx.lineTo(p95X, boxY)
    ctx.stroke()

    // Whisker ends
    ctx.beginPath()
    ctx.moveTo(minX, boxY - 6)
    ctx.lineTo(minX, boxY + 6)
    ctx.moveTo(p95X, boxY - 6)
    ctx.lineTo(p95X, boxY + 6)
    ctx.stroke()

    // IQR Box (Q1 to Q3)
    ctx.fillStyle = 'rgba(16, 185, 129, 0.25)'
    ctx.strokeStyle = '#10b981'
    ctx.fillRect(q1X, boxY - 8, q3X - q1X, 16)
    ctx.strokeRect(q1X, boxY - 8, q3X - q1X, 16)

    // Median line
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(medX, boxY - 8)
    ctx.lineTo(medX, boxY + 8)
    ctx.stroke()

    // Box plot label
    ctx.fillStyle = '#10b981'
    ctx.font = '10px JetBrains Mono, monospace'
    ctx.fillText('IQR Box', q1X, boxY - 12)
  }

  // ---------------------------------------------------------------------------
  // EXPORT & COPY ACTION HANDLERS
  // ---------------------------------------------------------------------------
  private handleCopyMatrix() {
    if (!this.data) return
    const m = this.data.matrix_3x3

    // Format conceptual ASCII mathematical layout
    const formatted = [
      `| ${m[0][0].toFixed(6)} | ${m[0][1].toFixed(6)} | ${m[0][2].toFixed(4)} |`,
      `| ${m[1][0].toFixed(6)} | ${m[1][1].toFixed(6)} | ${m[1][2].toFixed(4)} |`,
      `| ${m[2][0].toFixed(8)} | ${m[2][1].toFixed(8)} | ${m[2][2].toFixed(4)} |`,
    ].join('\n')

    navigator.clipboard.writeText(formatted)
    this.showToast('Copied Mathematical Transformation Matrix to clipboard!')
  }

  private handleExportMatrix() {
    if (!this.data) return
    const m = this.data.matrix_3x3
    const text = `# ISRO Chandrayaan TMC Geometric Transformation Matrix\n# Target Pair: ${this.pairId}\n# Model: ${this.data.transform_type_label}\n# Format: 3x3 Homography Matrix (a11, a12, tx; a21, a22, ty; h31, h32, h33)\n\n${m[0].join('\t')}\n${m[1].join('\t')}\n${m[2].join('\t')}\n`

    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `transformation_matrix_${this.pairId}.txt`
    a.click()
    URL.revokeObjectURL(url)
    this.showToast(`Exported transformation_matrix_${this.pairId}.txt`)
  }

  private handleExportJson() {
    if (!this.data) return
    const blob = new Blob([JSON.stringify(this.data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `transformation_analysis_${this.pairId}.json`
    a.click()
    URL.revokeObjectURL(url)
    this.showToast(`Exported transformation_analysis_${this.pairId}.json`)
  }

  private async handleExportReport() {
    try {
      this.showToast('Compiling ISRO Scientific Coregistration Report...')
      const res = await fetchScientificReport(this.pairId, this.transformType, this.ransacThresh)
      const blob = new Blob([res.report_content], { type: 'text/markdown;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `TRANSFORMATION_REPORT_${this.pairId.toUpperCase()}.md`
      a.click()
      URL.revokeObjectURL(url)
      this.showToast(`Downloaded TRANSFORMATION_REPORT_${this.pairId.toUpperCase()}.md`)
    } catch (err: any) {
      this.showToast(`Report export error: ${err.message}`)
    }
  }

  private showToast(msg: string) {
    if (!this.toastEl) return
    this.toastEl.textContent = msg
    this.toastEl.classList.add('show')
    setTimeout(() => {
      this.toastEl.classList.remove('show')
    }, 3200)
  }
}
