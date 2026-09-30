import type { RoiCoordinates, RoiShapeMode } from '../types'

export interface RoiPreset {
  id: string
  name: string
  region: string
  src: [number, number, number, number] // [line_start, line_end, sample_start, sample_end]
  ref: [number, number, number, number] // [y0, y1, x0, x1]
  description: string
}

export const ROI_PRESETS: RoiPreset[] = [
  {
    id: 'apollo11',
    name: 'Mare Tranquillitatis (Apollo 11)',
    region: 'Equatorial Mare Basalt',
    src: [0, 6000, 0, 4000],
    ref: [35000, 41000, 60000, 64000],
    description: 'Relatively flat basaltic plains with micro-craters, ideal high-confidence tie point field.'
  },
  {
    id: 'tycho',
    name: 'Tycho Crater Ejecta & Rim',
    region: 'Southern Highlands',
    src: [12000, 18000, 500, 3500],
    ref: [58000, 64000, 42000, 46000],
    description: 'Prominent young impact crater with high-albedo radial rays and steep topographic terraces.'
  },
  {
    id: 'aristarchus',
    name: 'Aristarchus Plateau & Vallis Schröteri',
    region: 'Oceanus Procellarum',
    src: [8000, 14000, 200, 3800],
    ref: [22000, 28000, 28000, 32000],
    description: 'Volcanic plateau featuring the largest lunar sinuous rille and rich spectral variations.'
  },
  {
    id: 'spa_rim',
    name: 'South Pole-Aitken Basin Rim',
    region: 'Lunar South Polar Region',
    src: [20000, 26000, 400, 3600],
    ref: [70000, 76000, 50000, 54000],
    description: 'Permanently shadowed craters, extreme low-sun illumination angles, and rugged relief.'
  },
  {
    id: 'sinus_iridum',
    name: 'Sinus Iridum (Bay of Rainbows)',
    region: 'Mare Imbrium Rim',
    src: [5000, 11000, 300, 3700],
    ref: [18000, 24000, 48000, 52000],
    description: 'Semi-circular basaltic bay bordered by Montes Jura with high contrast wrinkle ridges.'
  },
  {
    id: 'copernicus',
    name: 'Copernicus Central Peaks',
    region: 'Oceanus Procellarum Central',
    src: [15000, 21000, 600, 3600],
    ref: [32000, 38000, 36000, 40000],
    description: 'Terraced crater walls with distinct multi-peak central uplift and olivine signatures.'
  }
]

export class RoiControls {
  private container: HTMLElement
  private coords: RoiCoordinates
  private shapeMode: RoiShapeMode = 'rectangle'
  private activePresetId: string = 'apollo11'
  private onChange: (coords: RoiCoordinates) => void
  private onAutoFindTerrain: () => void
  private onPreviewRoi: () => void
  private onReset: () => void
  private onApplyRoi: () => void
  private onShapeModeChange: (mode: RoiShapeMode) => void
  private isAutoFinding: boolean = false
  private isPreviewing: boolean = false

  constructor(
    parent: HTMLElement,
    initialCoords: RoiCoordinates,
    handlers: {
      onChange: (coords: RoiCoordinates) => void
      onAutoFindTerrain: () => void
      onPreviewRoi: () => void
      onReset: () => void
      onApplyRoi: () => void
      onShapeModeChange: (mode: RoiShapeMode) => void
    }
  ) {
    this.container = document.createElement('div')
    this.container.className = 'roi-controls-panel'
    parent.appendChild(this.container)

    this.coords = { ...initialCoords }
    this.onChange = handlers.onChange
    this.onAutoFindTerrain = handlers.onAutoFindTerrain
    this.onPreviewRoi = handlers.onPreviewRoi
    this.onReset = handlers.onReset
    this.onApplyRoi = handlers.onApplyRoi
    this.onShapeModeChange = handlers.onShapeModeChange

    this.render()
  }

  public setCoordinates(coords: RoiCoordinates, emit: boolean = false) {
    this.coords = { ...coords }
    this.updateInputValues()
    if (emit) {
      this.onChange(this.coords)
    }
  }

  public getCoordinates(): RoiCoordinates {
    return { ...this.coords }
  }

  public getShapeMode(): RoiShapeMode {
    return this.shapeMode
  }

  public getIsAutoFinding(): boolean {
    return this.isAutoFinding
  }

  public getIsPreviewing(): boolean {
    return this.isPreviewing
  }

  public setAutoFinding(loading: boolean) {
    this.isAutoFinding = loading
    const btn = this.container.querySelector<HTMLButtonElement>('#btn-auto-find-terrain')
    if (btn) {
      btn.disabled = loading
      btn.innerHTML = loading
        ? `<span class="spinner-inline"></span> Scanning Terrain...`
        : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg> Auto-Find Terrain`
    }
  }

  public setPreviewing(loading: boolean) {
    this.isPreviewing = loading
    const btn = this.container.querySelector<HTMLButtonElement>('#btn-preview-roi')
    if (btn) {
      btn.disabled = loading
      btn.innerHTML = loading
        ? `<span class="spinner-inline"></span> Extracting Crop...`
        : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg> Preview ROI`
    }
  }

  private render() {
    this.container.innerHTML = `
      <div class="roi-controls-header">
        <div class="workstation-badge">
          <span class="pulse-dot"></span>
          <span>SUB-SCENE BOUNDING WORKSTATION</span>
        </div>
        <div class="workstation-title">ROI Geometry & Bounds</div>
        <div class="workstation-desc">Specify sensor line/sample and reference coordinate matrices for sub-pixel registration.</div>
      </div>

      <!-- PRESET REGION SELECTOR -->
      <div class="ctrl-group">
        <label class="ctrl-label" for="roi-preset-select">
          <span>Target Geological Preset</span>
          <span class="ctrl-tag">ISRO ARCHIVE</span>
        </label>
        <div class="custom-select-wrapper">
          <select id="roi-preset-select" class="roi-select">
            ${ROI_PRESETS.map(p => `
              <option value="${p.id}" ${p.id === this.activePresetId ? 'selected' : ''}>
                ${p.name}
              </option>
            `).join('')}
            <option value="custom">Custom Specified Bounds</option>
          </select>
        </div>
      </div>

      <!-- ROI SHAPE SELECTION -->
      <div class="ctrl-group">
        <label class="ctrl-label">
          <span>ROI Geometry Type</span>
          <span class="ctrl-tag" id="shape-status-tag">RECTANGLE</span>
        </label>
        <div class="roi-shape-toggle-group">
          <button type="button" id="btn-shape-rect" class="shape-toggle-btn active" title="Bounding Box Bounding Box (Rectangular Strip)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
            </svg>
            Bounding Box
          </button>
          <button type="button" id="btn-shape-poly" class="shape-toggle-btn" title="Arbitrary Multi-Point Polygon Selection">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 2l8 5v10l-8 5-8-5V7z"/>
            </svg>
            Polygon ROI
          </button>
        </div>
      </div>

      <!-- SOURCE COORDINATES -->
      <div class="coords-box source-coords-box">
        <div class="coords-box-header">
          <div class="coords-box-title">
            <span class="box-indicator src-indicator"></span>
            <span>Source Image (TMC Sensor Frame)</span>
          </div>
          <span class="coords-chip">Lines: 0–52000 | Samples: 0–4000</span>
        </div>

        <div class="inputs-2x2-grid">
          <div class="input-item">
            <label for="src-line-start">Source line start</label>
            <div class="number-input-wrap">
              <input type="number" id="src-line-start" value="${this.coords.src_line_start}" min="0" max="50000" step="100" />
              <span class="unit">L0</span>
            </div>
          </div>

          <div class="input-item">
            <label for="src-sample-start">Source sample start</label>
            <div class="number-input-wrap">
              <input type="number" id="src-sample-start" value="${this.coords.src_sample_start}" min="0" max="4000" step="100" />
              <span class="unit">S0</span>
            </div>
          </div>

          <div class="input-item">
            <label for="src-line-end">Source line end</label>
            <div class="number-input-wrap">
              <input type="number" id="src-line-end" value="${this.coords.src_line_end}" min="100" max="52000" step="100" />
              <span class="unit">L1</span>
            </div>
          </div>

          <div class="input-item">
            <label for="src-sample-end">Source sample end</label>
            <div class="number-input-wrap">
              <input type="number" id="src-sample-end" value="${this.coords.src_sample_end}" min="100" max="4000" step="100" />
              <span class="unit">S1</span>
            </div>
          </div>
        </div>

        <div class="quick-nudge-row">
          <span class="nudge-label">Quick Nudge:</span>
          <button type="button" class="btn-nudge" data-target="src" data-delta="-500">-500L</button>
          <button type="button" class="btn-nudge" data-target="src" data-delta="-100">-100L</button>
          <button type="button" class="btn-nudge" data-target="src" data-delta="100">+100L</button>
          <button type="button" class="btn-nudge" data-target="src" data-delta="500">+500L</button>
        </div>
      </div>

      <!-- REFERENCE COORDINATES -->
      <div class="coords-box ref-coords-box">
        <div class="coords-box-header">
          <div class="coords-box-title">
            <span class="box-indicator ref-indicator"></span>
            <span>Reference Map (LRO Global Ortho)</span>
          </div>
          <span class="coords-chip">X: 0–100000 | Y: 0–75000</span>
        </div>

        <div class="inputs-2x2-grid">
          <div class="input-item">
            <label for="ref-x0">Reference X0</label>
            <div class="number-input-wrap">
              <input type="number" id="ref-x0" value="${this.coords.ref_x0}" min="0" max="98000" step="500" />
              <span class="unit">X0</span>
            </div>
          </div>

          <div class="input-item">
            <label for="ref-y0">Reference Y0</label>
            <div class="number-input-wrap">
              <input type="number" id="ref-y0" value="${this.coords.ref_y0}" min="0" max="73000" step="500" />
              <span class="unit">Y0</span>
            </div>
          </div>

          <div class="input-item">
            <label for="ref-x1">Reference X1</label>
            <div class="number-input-wrap">
              <input type="number" id="ref-x1" value="${this.coords.ref_x1}" min="500" max="100000" step="500" />
              <span class="unit">X1</span>
            </div>
          </div>

          <div class="input-item">
            <label for="ref-y1">Reference Y1</label>
            <div class="number-input-wrap">
              <input type="number" id="ref-y1" value="${this.coords.ref_y1}" min="500" max="75000" step="500" />
              <span class="unit">Y1</span>
            </div>
          </div>
        </div>

        <div class="quick-nudge-row">
          <span class="nudge-label">Quick Nudge:</span>
          <button type="button" class="btn-nudge" data-target="ref" data-delta="-1000">-1k X</button>
          <button type="button" class="btn-nudge" data-target="ref" data-delta="-200">-200 X</button>
          <button type="button" class="btn-nudge" data-target="ref" data-delta="200">+200 X</button>
          <button type="button" class="btn-nudge" data-target="ref" data-delta="1000">+1k X</button>
        </div>
      </div>

      <!-- WORKSTATION ACTION BUTTONS -->
      <div class="roi-actions-grid">
        <button type="button" id="btn-auto-find-terrain" class="roi-btn btn-auto-terrain" title="Scan reference mosaic for optimal topographic contrast & high feature density">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
          </svg>
          Auto-Find Terrain
        </button>

        <button type="button" id="btn-preview-roi" class="roi-btn btn-preview-roi" title="Fetch live high-resolution sub-scene crops from backend">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"/>
            <line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          Preview ROI
        </button>

        <button type="button" id="btn-reset-roi" class="roi-btn btn-reset-roi" title="Reset to nominal calibrated parameters">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="1 4 1 10 7 10"/>
            <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
          </svg>
          Reset
        </button>

        <button type="button" id="btn-apply-roi" class="roi-btn btn-apply-roi" title="Commit selected ROI to execution pipeline">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          Apply ROI
        </button>
      </div>

      <!-- REAL-TIME TELEMETRY CHIP -->
      <div class="roi-mini-telemetry">
        <div class="mini-tel-row">
          <span class="label">Source Swath:</span>
          <span id="mini-src-dim" class="val">${this.coords.src_sample_end - this.coords.src_sample_start} × ${this.coords.src_line_end - this.coords.src_line_start} px</span>
        </div>
        <div class="mini-tel-row">
          <span class="label">Reference Window:</span>
          <span id="mini-ref-dim" class="val">${this.coords.ref_x1 - this.coords.ref_x0} × ${this.coords.ref_y1 - this.coords.ref_y0} px</span>
        </div>
        <div class="mini-tel-row">
          <span class="label">Approx Resolution:</span>
          <span class="val text-gold">5.0 m/px Ground Sampling</span>
        </div>
      </div>
    `

    this.attachEventListeners()
  }

  private attachEventListeners() {
    // Inputs
    const inputs: [string, keyof RoiCoordinates][] = [
      ['src-line-start', 'src_line_start'],
      ['src-sample-start', 'src_sample_start'],
      ['src-line-end', 'src_line_end'],
      ['src-sample-end', 'src_sample_end'],
      ['ref-x0', 'ref_x0'],
      ['ref-y0', 'ref_y0'],
      ['ref-x1', 'ref_x1'],
      ['ref-y1', 'ref_y1'],
    ]

    inputs.forEach(([id, key]) => {
      const el = this.container.querySelector<HTMLInputElement>(`#${id}`)
      if (el) {
        el.addEventListener('change', () => {
          let val = parseInt(el.value, 10)
          if (isNaN(val)) val = 0
          this.coords[key] = val
          this.validateAndNormalize()
          this.updateInputValues()
          this.onChange(this.coords)
        })
      }
    })

    // Presets
    const presetSelect = this.container.querySelector<HTMLSelectElement>('#roi-preset-select')
    if (presetSelect) {
      presetSelect.addEventListener('change', () => {
        const selectedId = presetSelect.value
        this.activePresetId = selectedId
        const preset = ROI_PRESETS.find(p => p.id === selectedId)
        if (preset) {
          this.coords = {
            src_line_start: preset.src[0],
            src_line_end: preset.src[1],
            src_sample_start: preset.src[2],
            src_sample_end: preset.src[3],
            ref_y0: preset.ref[0],
            ref_y1: preset.ref[1],
            ref_x0: preset.ref[2],
            ref_x1: preset.ref[3],
          }
          this.updateInputValues()
          this.onChange(this.coords)
        }
      })
    }

    // Shape Mode
    const btnRect = this.container.querySelector<HTMLButtonElement>('#btn-shape-rect')
    const btnPoly = this.container.querySelector<HTMLButtonElement>('#btn-shape-poly')
    const shapeTag = this.container.querySelector<HTMLElement>('#shape-status-tag')

    btnRect?.addEventListener('click', () => {
      this.shapeMode = 'rectangle'
      btnRect.classList.add('active')
      btnPoly?.classList.remove('active')
      if (shapeTag) shapeTag.textContent = 'RECTANGLE'
      this.onShapeModeChange('rectangle')
    })

    btnPoly?.addEventListener('click', () => {
      this.shapeMode = 'polygon'
      btnPoly.classList.add('active')
      btnRect?.classList.remove('active')
      if (shapeTag) shapeTag.textContent = 'POLYGON (6-VERTEX)'
      this.onShapeModeChange('polygon')
    })

    // Quick Nudge Buttons
    this.container.querySelectorAll<HTMLButtonElement>('.btn-nudge').forEach(btn => {
      btn.addEventListener('click', () => {
        const target = btn.dataset.target
        const delta = parseInt(btn.dataset.delta || '0', 10)
        if (target === 'src') {
          this.coords.src_line_start = Math.max(0, this.coords.src_line_start + delta)
          this.coords.src_line_end = Math.max(this.coords.src_line_start + 500, this.coords.src_line_end + delta)
        } else if (target === 'ref') {
          this.coords.ref_x0 = Math.max(0, this.coords.ref_x0 + delta)
          this.coords.ref_x1 = Math.max(this.coords.ref_x0 + 500, this.coords.ref_x1 + delta)
        }
        this.validateAndNormalize()
        this.updateInputValues()
        this.onChange(this.coords)
      })
    })

    // Action Buttons
    this.container.querySelector('#btn-auto-find-terrain')?.addEventListener('click', () => {
      this.onAutoFindTerrain()
    })

    this.container.querySelector('#btn-preview-roi')?.addEventListener('click', () => {
      this.onPreviewRoi()
    })

    this.container.querySelector('#btn-reset-roi')?.addEventListener('click', () => {
      this.onReset()
    })

    this.container.querySelector('#btn-apply-roi')?.addEventListener('click', () => {
      this.onApplyRoi()
    })
  }

  private validateAndNormalize() {
    // Source bounds
    if (this.coords.src_line_end <= this.coords.src_line_start) {
      this.coords.src_line_end = this.coords.src_line_start + 1000
    }
    if (this.coords.src_sample_end <= this.coords.src_sample_start) {
      this.coords.src_sample_end = this.coords.src_sample_start + 1000
    }

    // Reference bounds
    if (this.coords.ref_x1 <= this.coords.ref_x0) {
      this.coords.ref_x1 = this.coords.ref_x0 + 1000
    }
    if (this.coords.ref_y1 <= this.coords.ref_y0) {
      this.coords.ref_y1 = this.coords.ref_y0 + 1000
    }
  }

  private updateInputValues() {
    const ids: [string, number][] = [
      ['src-line-start', this.coords.src_line_start],
      ['src-sample-start', this.coords.src_sample_start],
      ['src-line-end', this.coords.src_line_end],
      ['src-sample-end', this.coords.src_sample_end],
      ['ref-x0', this.coords.ref_x0],
      ['ref-y0', this.coords.ref_y0],
      ['ref-x1', this.coords.ref_x1],
      ['ref-y1', this.coords.ref_y1],
    ]

    ids.forEach(([id, val]) => {
      const el = this.container.querySelector<HTMLInputElement>(`#${id}`)
      if (el) el.value = val.toString()
    })

    const miniSrc = this.container.querySelector('#mini-src-dim')
    const miniRef = this.container.querySelector('#mini-ref-dim')
    if (miniSrc) {
      miniSrc.textContent = `${this.coords.src_sample_end - this.coords.src_sample_start} × ${this.coords.src_line_end - this.coords.src_line_start} px`
    }
    if (miniRef) {
      miniRef.textContent = `${this.coords.ref_x1 - this.coords.ref_x0} × ${this.coords.ref_y1 - this.coords.ref_y0} px`
    }
  }
}
