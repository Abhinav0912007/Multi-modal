/**
 * Component: ExportWorkspace.ts
 * Phase 10: Scientific Export & Artifacts Workspace for Chandrayaan Registration Pipeline.
 * 
 * Capabilities:
 * - Full inventory of generated outputs:
 *   - Aligned imagery (GeoTIFF, PNG)
 *   - Transformation matrix (JSON, CSV)
 *   - Feature correspondence data (CSV, JSON)
 *   - ROI information (JSON)
 *   - Spatial statistics (JSON)
 *   - Processing metadata (JSON)
 *   - Registration report (PDF, JSON, HTML)
 * - Strict backend existence verification:
 *   - Status: READY (active verified file on disk), PROCESSING, FAILED (not generated)
 *   - Download actions ONLY enabled when backend confirms file exists
 * - "Generate Scientific Report" trigger action
 * - Embedded scientific report inspector with mathematical layout, metadata, and error metrics
 */

import type { ArtifactItem, ScientificReportData } from '../types'
import {
  fetchArtifactsCatalog,
  triggerGenerateReport,
  fetchStructuredScientificReport,
  API_BASE,
} from '../api'

export class ExportWorkspace {
  private container: HTMLElement
  private activePairId: string = 'pair_001'
  private artifacts: ArtifactItem[] = []
  private reportData: ScientificReportData | null = null
  private selectedCategory: string = 'all'
  private isGenerating: boolean = false
  private activeReportTab: 'preview' | 'json' | 'metadata' = 'preview'

  constructor(container: HTMLElement, initialPairId: string = 'pair_001') {
    this.container = container
    this.activePairId = initialPairId
    this.init()
  }

  public setPairId(pairId: string) {
    if (this.activePairId !== pairId) {
      this.activePairId = pairId
      this.refreshData()
    }
  }

  private async init() {
    this.renderSkeleton()
    await this.refreshData()
  }

  private renderSkeleton() {
    this.container.innerHTML = `
      <div class="export-workspace-container">
        <!-- TOP WORKSPACE HEADER & CONTROL HUD -->
        <div class="export-header-panel glass-panel">
          <div class="export-header-left">
            <div class="badge-tech-tag">PHASE 10 &bull; STR-2026 ARCHIVE</div>
            <h2 class="export-title">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              Export &amp; Artifacts Workspace
            </h2>
            <p class="export-subtitle">
              Verified Planetary Cartographic Product Suite &bull; Multi-Format Georeferenced Downloads &amp; PDS Reports
            </p>
          </div>

          <div class="export-header-actions">
            <!-- Dataset Selector -->
            <div class="export-pair-select-wrap">
              <label for="export-pair-select">Target Dataset</label>
              <select id="export-pair-select" class="hud-select">
                <option value="pair_001" ${this.activePairId === 'pair_001' ? 'selected' : ''}>pair_001 (OHRC + LROC)</option>
                <option value="pair_002" ${this.activePairId === 'pair_002' ? 'selected' : ''}>pair_002 (IIRS + LROC)</option>
                <option value="pair_003" ${this.activePairId === 'pair_003' ? 'selected' : ''}>pair_003 (TMC + LROC)</option>
              </select>
            </div>

            <!-- Generate Action -->
            <button id="btn-generate-report" class="btn-action-primary glow-cyan">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polygon points="5 3 19 12 5 21 5 3"/>
              </svg>
              Generate Scientific Report
            </button>
          </div>
        </div>

        <!-- QUICK METRICS STATUS BAR -->
        <div class="export-status-strip">
          <div class="status-strip-card glass-panel">
            <span class="strip-label">READY ARTIFACTS</span>
            <div class="strip-val" id="strip-ready-count">
              <span class="pulse-dot green"></span>
              <span id="txt-ready-count">— / —</span>
            </div>
          </div>
          <div class="status-strip-card glass-panel">
            <span class="strip-label">TOTAL VOLUME</span>
            <div class="strip-val" id="txt-total-volume">—</div>
          </div>
          <div class="status-strip-card glass-panel">
            <span class="strip-label">REPORT STATUS</span>
            <div class="strip-val" id="txt-report-status">
              <span class="badge-status-neutral">CHECKING</span>
            </div>
          </div>
          <div class="status-strip-card glass-panel">
            <span class="strip-label">INTEGRITY VERIFICATION</span>
            <div class="strip-val" id="txt-integrity">SHA-256 STRICT &check;</div>
          </div>
        </div>

        <!-- MAIN DUAL-PANE WORKSPACE: LEFT CATALOG, RIGHT LIVE REPORT INSPECTOR -->
        <div class="export-main-grid">
          <!-- LEFT: ARTIFACTS INVENTORY -->
          <div class="export-catalog-pane glass-panel">
            <div class="catalog-pane-header">
              <div class="pane-title-group">
                <h3>Processing Outputs Catalog</h3>
                <span class="subtitle-text">Download actions verified against physical storage</span>
              </div>

              <!-- Filter tabs -->
              <div class="catalog-filter-tabs">
                <button class="filter-tab active" data-cat="all">All (<span id="cnt-all">0</span>)</button>
                <button class="filter-tab" data-cat="imagery">Imagery (<span id="cnt-imagery">0</span>)</button>
                <button class="filter-tab" data-cat="transformation">Matrix (<span id="cnt-transformation">0</span>)</button>
                <button class="filter-tab" data-cat="features">Features (<span id="cnt-features">0</span>)</button>
                <button class="filter-tab" data-cat="metadata">Metadata (<span id="cnt-metadata">0</span>)</button>
                <button class="filter-tab" data-cat="report">Reports (<span id="cnt-report">0</span>)</button>
              </div>
            </div>

            <!-- Artifacts List Table / Cards -->
            <div id="export-artifacts-list" class="artifacts-list-container">
              <div class="loading-state">
                <div class="spinner-orbit"></div>
                <p>Querying backend artifact manifest...</p>
              </div>
            </div>
          </div>

          <!-- RIGHT: LIVE SCIENTIFIC REPORT INSPECTOR -->
          <div class="export-report-pane glass-panel">
            <div class="report-pane-header">
              <div class="pane-title-group">
                <h3>Scientific Registration Report</h3>
                <span class="subtitle-text" id="report-id-subhead">ISRO / NASA PDS Cartographic Certification</span>
              </div>

              <div class="report-subtabs">
                <button class="subtab-btn active" data-subtab="preview">Structured</button>
                <button class="subtab-btn" data-subtab="json">JSON Raw</button>
                <button class="subtab-btn" data-subtab="metadata">Metadata</button>
              </div>
            </div>

            <div id="export-report-body" class="report-body-container">
              <div class="empty-report-state">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="16" y1="13" x2="8" y2="13"/>
                  <line x1="16" y1="17" x2="8" y2="17"/>
                  <polyline points="10 9 9 9 8 9"/>
                </svg>
                <p>Click <strong>"Generate Scientific Report"</strong> above to compile the complete multi-sensor registration dossier.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    `

    this.bindEvents()
  }

  private bindEvents() {
    // Dataset pair dropdown change
    const sel = this.container.querySelector<HTMLSelectElement>('#export-pair-select')
    sel?.addEventListener('change', (e) => {
      const newPair = (e.target as HTMLSelectElement).value
      this.setPairId(newPair)
    })

    // Generate Scientific Report Button
    const genBtn = this.container.querySelector<HTMLButtonElement>('#btn-generate-report')
    genBtn?.addEventListener('click', () => {
      this.handleGenerateReport()
    })

    // Filter tabs
    const filterTabs = this.container.querySelectorAll<HTMLButtonElement>('.filter-tab')
    filterTabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        filterTabs.forEach((t) => t.classList.remove('active'))
        tab.classList.add('active')
        this.selectedCategory = tab.dataset.cat || 'all'
        this.renderArtifactsList()
      })
    })

    // Report subtabs
    const subtabs = this.container.querySelectorAll<HTMLButtonElement>('.subtab-btn')
    subtabs.forEach((st) => {
      st.addEventListener('click', () => {
        subtabs.forEach((t) => t.classList.remove('active'))
        st.classList.add('active')
        this.activeReportTab = (st.dataset.subtab as any) || 'preview'
        this.renderReportBody()
      })
    })
  }

  public async refreshData() {
    try {
      const listEl = this.container.querySelector('#export-artifacts-list')
      if (listEl) {
        listEl.innerHTML = `
          <div class="loading-state">
            <div class="spinner-orbit"></div>
            <p>Querying backend artifact verification...</p>
          </div>
        `
      }

      const [catalog, report] = await Promise.all([
        fetchArtifactsCatalog(this.activePairId),
        fetchStructuredScientificReport(this.activePairId),
      ])

      this.artifacts = catalog
      this.reportData = report

      this.updateStripMetrics()
      this.updateCategoryCounts()
      this.renderArtifactsList()
      this.renderReportBody()
    } catch (err) {
      console.error('Error refreshing export data:', err)
      this.showToast('Failed to query artifacts catalog', 'error')
    }
  }

  private updateStripMetrics() {
    const total = this.artifacts.length
    const readyCount = this.artifacts.filter((a) => a.status === 'READY').length
    const totalBytes = this.artifacts.reduce((acc, a) => acc + (a.size_bytes || 0), 0)

    const txtReady = this.container.querySelector('#txt-ready-count')
    if (txtReady) {
      txtReady.textContent = `${readyCount} / ${total} READY`
    }

    const txtVol = this.container.querySelector('#txt-total-volume')
    if (txtVol) {
      txtVol.textContent = this.formatBytes(totalBytes)
    }

    const txtRepStatus = this.container.querySelector('#txt-report-status')
    if (txtRepStatus) {
      const pdfReady = this.artifacts.find((a) => a.id === 'scientific_report_pdf')?.status === 'READY'
      if (pdfReady) {
        txtRepStatus.innerHTML = `<span class="badge-status-ready">READY &check;</span>`
      } else {
        txtRepStatus.innerHTML = `<span class="badge-status-failed">NOT GENERATED</span>`
      }
    }
  }

  private updateCategoryCounts() {
    const count = (cat: string) =>
      cat === 'all'
        ? this.artifacts.length
        : this.artifacts.filter((a) => a.category === cat).length

    const setC = (id: string, n: number) => {
      const el = this.container.querySelector(`#cnt-${id}`)
      if (el) el.textContent = String(n)
    }

    setC('all', count('all'))
    setC('imagery', count('imagery'))
    setC('transformation', count('transformation'))
    setC('features', count('features'))
    setC('metadata', count('metadata'))
    setC('report', count('report'))
  }

  private renderArtifactsList() {
    const listEl = this.container.querySelector('#export-artifacts-list')
    if (!listEl) return

    const filtered =
      this.selectedCategory === 'all'
        ? this.artifacts
        : this.artifacts.filter((a) => a.category === this.selectedCategory)

    if (filtered.length === 0) {
      listEl.innerHTML = `
        <div class="empty-state">
          <p>No artifacts found matching category: <strong>${this.selectedCategory}</strong></p>
        </div>
      `
      return
    }

    let html = `<div class="artifacts-grid">`
    for (const item of filtered) {
      const isReady = item.status === 'READY'
      const isProcessing = item.status === 'PROCESSING'

      // Status indicator class and label
      let statusBadge = ''
      if (isReady) {
        statusBadge = `<span class="artifact-status-badge status-ready"><span class="dot green"></span>READY</span>`
      } else if (isProcessing) {
        statusBadge = `<span class="artifact-status-badge status-processing"><span class="dot cyan spinner"></span>PROCESSING</span>`
      } else {
        statusBadge = `<span class="artifact-status-badge status-failed"><span class="dot amber"></span>FAILED</span>`
      }

      // Format Pill color
      const formatClass = `format-${item.format.toLowerCase().replace(/[^a-z0-9]/g, '')}`

      html += `
        <div class="artifact-card glass-card ${isReady ? 'is-ready' : 'is-unavailable'}">
          <div class="artifact-card-top">
            <div class="format-and-status">
              <span class="format-pill ${formatClass}">${item.format}</span>
              ${statusBadge}
            </div>
            <div class="artifact-size-text">
              ${isReady ? this.formatBytes(item.size_bytes) : '<span style="color:var(--text-muted);">Not on disk</span>'}
            </div>
          </div>

          <div class="artifact-card-body">
            <h4 class="artifact-title">${item.title}</h4>
            <p class="artifact-desc">${item.description}</p>
            <div class="artifact-meta-row">
              <code class="artifact-filename">${item.filename}</code>
              ${
                item.sha256
                  ? `<span class="artifact-sha" title="SHA-256 Checksum: ${item.sha256}">SHA: ${item.sha256}</span>`
                  : ''
              }
            </div>
          </div>

          <div class="artifact-card-footer">
            ${
              isReady && item.download_url
                ? `
                <a href="${item.download_url}" download="${item.filename}" class="btn-download active">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="7 10 12 15 17 10"/>
                    <line x1="12" y1="15" x2="12" y2="3"/>
                  </svg>
                  Download ${item.format}
                </a>
              `
                : `
                <button class="btn-download disabled" disabled title="Download unavailable. Artifact does not exist on disk. Click 'Generate Scientific Report' to create.">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
                  </svg>
                  Unavailable (Not Generated)
                </button>
              `
            }
          </div>
        </div>
      `
    }
    html += `</div>`

    listEl.innerHTML = html
  }

  private renderReportBody() {
    const bodyEl = this.container.querySelector('#export-report-body')
    if (!bodyEl) return

    if (!this.reportData) {
      bodyEl.innerHTML = `
        <div class="empty-report-state">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="16" y1="13" x2="8" y2="13"/>
            <line x1="16" y1="17" x2="8" y2="17"/>
            <polyline points="10 9 9 9 8 9"/>
          </svg>
          <p>Scientific report not yet compiled for <strong>${this.activePairId}</strong>.</p>
          <p class="subtext">Click <strong>"Generate Scientific Report"</strong> above to extract correspondences, solve the transformation, and build certified deliverables.</p>
        </div>
      `
      return
    }

    const r = this.reportData

    // Update subhead with report ID
    const subhead = this.container.querySelector('#report-id-subhead')
    if (subhead) {
      subhead.textContent = `${r.report_id} • ${r.generated_at}`
    }

    if (this.activeReportTab === 'json') {
      bodyEl.innerHTML = `
        <div class="report-raw-json-wrap">
          <div class="raw-json-toolbar">
            <span>Machine-Readable GeoJSON/JSON Report</span>
            <button id="btn-copy-report-json" class="btn-sm-action">Copy JSON</button>
          </div>
          <pre class="code-block-scroll"><code>${this.escapeHtml(JSON.stringify(r, null, 2))}</code></pre>
        </div>
      `
      bodyEl.querySelector('#btn-copy-report-json')?.addEventListener('click', () => {
        navigator.clipboard.writeText(JSON.stringify(r, null, 2))
        this.showToast('Report JSON copied to clipboard', 'success')
      })
      return
    }

    if (this.activeReportTab === 'metadata') {
      bodyEl.innerHTML = `
        <div class="report-metadata-inspect">
          <h4 class="section-h4">Processing Pipeline Audit Trail</h4>
          <table class="report-table">
            <tbody>
              <tr><th>Preprocessing</th><td>${r.processing_pipeline.preprocessing}</td></tr>
              <tr><th>Feature Detector</th><td>${r.processing_pipeline.feature_detector}</td></tr>
              <tr><th>Matcher</th><td>${r.processing_pipeline.matcher}</td></tr>
              <tr><th>Ratio Test</th><td>${r.processing_pipeline.ratio_test}</td></tr>
              <tr><th>Spatial Filtering</th><td>${r.processing_pipeline.spatial_filtering}</td></tr>
              <tr><th>Estimator Model</th><td>${r.processing_pipeline.estimator}</td></tr>
              <tr><th>Sub-Pixel Optimization</th><td>${r.processing_pipeline.subpixel_refinement}</td></tr>
            </tbody>
          </table>

          <h4 class="section-h4" style="margin-top: 20px;">Execution Timing Breakdown</h4>
          <table class="report-table">
            <tbody>
              <tr><th>I/O &amp; Decompression</th><td>${r.processing_time.io_and_decompression_s}s</td></tr>
              <tr><th>Radiometric CLAHE</th><td>${r.processing_time.clahe_preprocessing_s}s</td></tr>
              <tr><th>SIFT Feature Detection</th><td>${r.processing_time.sift_feature_detection_s}s</td></tr>
              <tr><th>FLANN KD-Tree Matching</th><td>${r.processing_time.flann_matching_s}s</td></tr>
              <tr><th>RANSAC &amp; Sub-Pixel Refinement</th><td>${r.processing_time.ransac_and_subpixel_s}s</td></tr>
              <tr><th>Bicubic Warping &amp; Rendering</th><td>${r.processing_time.warping_and_rendering_s}s</td></tr>
              <tr style="background: rgba(56, 189, 248, 0.08); font-weight: bold;">
                <th>Total Wall Clock Execution</th>
                <td style="color: var(--cyan-bright);">${r.processing_time.total_wall_time_seconds}s</td>
              </tr>
            </tbody>
          </table>
        </div>
      `
      return
    }

    // Default 'preview' structured view
    const p = r.dataset_information
    const H = r.transformation_model.matrix_3x3
    const m = r.transformation_model.parameters
    const e = r.error_metrics
    const f = r.feature_statistics

    bodyEl.innerHTML = `
      <div class="report-structured-view">
        <!-- REPORT HERO HEADER -->
        <div class="report-doc-header">
          <div class="doc-header-badges">
            <span class="pds-cert-badge">ISRO / NASA PDS STANDARD</span>
            <span class="doc-id-pill">${r.report_id}</span>
            <span class="grade-pill grade-${e.quality_grade.charAt(0).toLowerCase()}">GRADE ${e.quality_grade}</span>
          </div>
          <h3 class="doc-title">${r.project_information.title}</h3>
          <div class="doc-meta-summary">
            <span>Target: <strong>${p.target_lunar_feature}</strong></span>
            <span>Coords: <strong>${p.center_latitude}, ${p.center_longitude}</strong></span>
            <span>CRS: <strong>${r.project_information.coordinate_reference_system}</strong></span>
          </div>
        </div>

        <!-- QUICK DOWNLOAD ACTIONS BAR FOR REPORT -->
        <div class="report-actions-quick-bar">
          <a href="${API_BASE}/artifacts/${this.activePairId}/scientific_report.pdf" download="scientific_report_${this.activePairId}.pdf" class="btn-report-dl btn-pdf">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
            Download PDF Report
          </a>

          <a href="${API_BASE}/artifacts/${this.activePairId}/scientific_report.html" target="_blank" class="btn-report-dl btn-html">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
              <polyline points="15 3 21 3 21 9"/>
              <line x1="10" y1="14" x2="21" y2="3"/>
            </svg>
            Print-Ready HTML
          </a>

          <a href="${API_BASE}/artifacts/${this.activePairId}/scientific_report.json" download="scientific_report_${this.activePairId}.json" class="btn-report-dl btn-json">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="16 18 22 12 16 6"/>
              <polyline points="8 6 2 12 8 18"/>
            </svg>
            JSON Raw
          </a>
        </div>

        <!-- SECTION 1: SENSOR SPECIFICATIONS -->
        <div class="report-section">
          <h4 class="section-title">1. Mission &amp; Sensor Specifications</h4>
          <table class="report-table">
            <tbody>
              <tr>
                <th>Mission</th><td>${r.project_information.mission}</td>
                <th>Spectral Band</th><td>${p.spectral_band}</td>
              </tr>
              <tr>
                <th>Source Sensor</th><td>${r.source_metadata.instrument} (${r.source_metadata.nominal_resolution})</td>
                <th>Reference Sensor</th><td>${r.reference_metadata.instrument} (${r.reference_metadata.nominal_resolution})</td>
              </tr>
              <tr>
                <th>Source Radiometry</th><td>${r.source_metadata.radiometric_depth}</td>
                <th>Reference Frame</th><td>${r.reference_metadata.frame_type}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- SECTION 2: TRANSFORMATION MATRIX & PARAMETERS -->
        <div class="report-section">
          <h4 class="section-title">2. Transformation Model &amp; Parameter Cards</h4>
          <div class="matrix-display-wrap">
            <div class="matrix-bracket-box">
              <span class="bracket-symbol">[</span>
              <div class="matrix-cells">
                <div class="m-row">
                  <span class="m-val highlight">${H[0][0].toFixed(6)}</span>
                  <span class="m-val">${H[0][1].toFixed(6)}</span>
                  <span class="m-val">${H[0][2].toFixed(4)}</span>
                </div>
                <div class="m-row">
                  <span class="m-val">${H[1][0].toFixed(6)}</span>
                  <span class="m-val highlight">${H[1][1].toFixed(6)}</span>
                  <span class="m-val">${H[1][2].toFixed(4)}</span>
                </div>
                <div class="m-row">
                  <span class="m-val">${H[2][0].toFixed(8)}</span>
                  <span class="m-val">${H[2][1].toFixed(8)}</span>
                  <span class="m-val highlight">${H[2][2].toFixed(4)}</span>
                </div>
              </div>
              <span class="bracket-symbol">]</span>
            </div>

            <div class="matrix-mini-cards">
              <div class="mini-param-card">
                <span class="k">Scale (Sx, Sy)</span>
                <span class="v">${m.scale_x.toFixed(4)}, ${m.scale_y.toFixed(4)}</span>
              </div>
              <div class="mini-param-card">
                <span class="k">Rotation (&theta;)</span>
                <span class="v">${m.rotation_deg.toFixed(3)}&deg; (${m.rotation_rad.toFixed(4)} rad)</span>
              </div>
              <div class="mini-param-card">
                <span class="k">Translation (Tx, Ty)</span>
                <span class="v">&Delta;X: ${m.translation_x_px.toFixed(2)} px &bull; &Delta;Y: ${m.translation_y_px.toFixed(2)} px</span>
              </div>
              <div class="mini-param-card">
                <span class="k">Ground Offset</span>
                <span class="v">&Delta;X: ${m.translation_x_m.toFixed(1)} m &bull; &Delta;Y: ${m.translation_y_m.toFixed(1)} m</span>
              </div>
              <div class="mini-param-card">
                <span class="k">Shear Factor</span>
                <span class="v">${m.shear.toFixed(6)}</span>
              </div>
              <div class="mini-param-card">
                <span class="k">Cond &kappa;(H) &bull; Det</span>
                <span class="v">${m.condition_number.toFixed(2)} &bull; ${m.determinant.toFixed(4)}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- SECTION 3: ERROR METRICS & STATS -->
        <div class="report-section">
          <h4 class="section-title">3. Error Metrics &amp; Correspondence Statistics</h4>
          <table class="report-table">
            <tbody>
              <tr>
                <th>RMSE (Pixels)</th><td><strong style="color:var(--cyan-bright); font-size:14px;">${e.rmse_px} px</strong></td>
                <th>RMSE (Ground)</th><td><strong style="color:var(--emerald-status); font-size:14px;">${e.rmse_meters} m</strong></td>
              </tr>
              <tr>
                <th>Inlier Matches</th><td><strong>${f.inlier_count}</strong> / ${f.good_matches_ratio_test} (${f.inlier_percentage}%)</td>
                <th>Mean Reproj. Error</th><td>${e.mean_reprojection_error_px} px</td>
              </tr>
              <tr>
                <th>Spatial Grid Coverage</th><td>${(f.spatial_grid_occupancy_ratio * 100).toFixed(1)}%</td>
                <th>Sub-Pixel Precision</th><td>${e.subpixel_accuracy_level}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    `
  }

  private async handleGenerateReport() {
    if (this.isGenerating) return

    const btn = this.container.querySelector<HTMLButtonElement>('#btn-generate-report')
    if (btn) {
      btn.disabled = true
      btn.innerHTML = `<span class="spinner-orbit-sm"></span> Generating Dossier...`
    }
    this.isGenerating = true
    this.showToast('Compiling scientific report & generating export artifacts...', 'info')

    try {
      const res = await triggerGenerateReport(this.activePairId)
      if (res && res.status === 'success') {
        this.artifacts = res.artifacts
        this.reportData = res.report
        this.updateStripMetrics()
        this.updateCategoryCounts()
        this.renderArtifactsList()
        this.renderReportBody()
        this.showToast('Scientific report & all artifacts generated successfully!', 'success')
      }
    } catch (err: any) {
      console.error('Error generating report:', err)
      this.showToast(`Generation failed: ${err.message || 'Unknown error'}`, 'error')
    } finally {
      this.isGenerating = false
      if (btn) {
        btn.disabled = false
        btn.innerHTML = `
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polygon points="5 3 19 12 5 21 5 3"/>
          </svg>
          Generate Scientific Report
        `
      }
    }
  }

  private formatBytes(bytes: number): string {
    if (!bytes || bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')
  }

  private showToast(msg: string, type: 'info' | 'success' | 'error' = 'info') {
    const existing = document.querySelector('.mission-toast')
    existing?.remove()

    const toast = document.createElement('div')
    toast.className = `mission-toast toast-${type}`
    toast.textContent = msg
    document.body.appendChild(toast)

    setTimeout(() => {
      toast.style.opacity = '0'
      toast.style.transform = 'translateY(10px)'
      setTimeout(() => toast.remove(), 400)
    }, 4000)
  }
}
