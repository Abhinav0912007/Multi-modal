import type { PairItem, SystemStatus } from '../types'

export class DatasetCard {
  private container: HTMLElement
  private pair: PairItem | null
  private status: SystemStatus
  private onSelectPair: (pairId: string) => void
  private onOpenCatalog?: () => void
  private pairs: PairItem[]

  constructor(
    container: HTMLElement,
    pair: PairItem | null,
    status: SystemStatus,
    pairs: PairItem[],
    onSelectPair: (pairId: string) => void,
    onOpenCatalog?: () => void
  ) {
    this.container = container
    this.pair = pair
    this.status = status
    this.pairs = pairs
    this.onSelectPair = onSelectPair
    this.onOpenCatalog = onOpenCatalog
    this.render()
  }

  public update(pair: PairItem | null, status: SystemStatus, pairs: PairItem[]) {
    this.pair = pair
    this.status = status
    this.pairs = pairs
    this.render()
  }

  public render() {
    const p = this.pair || {
      id: 'pair_001',
      has_source: true,
      has_reference: true,
      mission: 'Chandrayaan-2',
      instrument: 'OHRC',
      instrument_name: 'Chandrayaan-2 OHRC',
      source_filename: 'ch2_ohr_ncp_20240316T2008014680_d_img_d18.img',
      reference_filename: 'M1536201804CC.IMG',
      reference_instrument: 'LROC',
      status: 'pending_validation',
      status_label: 'Pending validation',
      reference_status: 'UNKNOWN',
      reference_status_label: 'Reference geographic overlap: NOT YET VERIFIED',
      source_files: ['ch2_ohr_ncp_20240316T2008014680_d_img_d18.img'],
      reference_files: ['M1536201804CC.IMG'],
    }

    const mission = p.mission || (p.id === 'pair_003' ? 'Chandrayaan-1' : 'Chandrayaan-2')
    const instrument = p.instrument || (p.id === 'pair_001' ? 'OHRC' : p.id === 'pair_002' ? 'IIRS' : 'TMC')
    const sourceFilename = p.source_filename || (p.source_files && p.source_files[0]) || '—'
    const referenceFilename = p.reference_filename || (p.reference_files && p.reference_files[0]) || 'M1536201804CC.IMG'

    let statusDisplay = p.status_label || 'Pending validation'
    let statusColor = 'var(--cyan-bright)'
    let statusClass = 'idle'

    if (p.id === 'pair_002' || instrument === 'IIRS') {
      statusDisplay = 'Requires spectral band extraction'
      statusColor = '#f59e0b'
      statusClass = 'warning'
    } else if (p.status === 'pending_validation' || p.id === 'pair_001') {
      statusDisplay = 'Pending geographic validation'
      statusColor = 'var(--cyan-bright)'
    } else if (this.status.processingStatus === 'PROCESSING') {
      statusDisplay = 'Processing'
      statusClass = 'processing'
      statusColor = 'var(--isro-gold)'
    } else if (this.status.processingStatus === 'COMPLETED') {
      statusDisplay = 'Complete'
      statusClass = ''
      statusColor = 'var(--emerald-status)'
    }

    this.container.innerHTML = `
      <div class="dataset-card glass-panel corner-reticle">
        <div class="card-header-clean">
          <h2>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--cyan-bright)" stroke-width="2">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
              <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
              <line x1="12" y1="22.08" x2="12" y2="12"/>
            </svg>
            Dataset Telemetry
          </h2>
          <span class="badge-status ${statusClass}">
            <span class="pulse-dot"></span>
            ${instrument}
          </span>
        </div>

        <!-- Pair Selector -->
        <div>
          <label class="spec-label" for="dataset-pair-dropdown">ACTIVE PAIR IDENTIFIER</label>
          <select id="dataset-pair-dropdown" class="pair-picker-select" style="margin-top: 4px;">
            ${this.pairs.map(item => `
              <option value="${item.id}" ${item.id === p.id ? 'selected' : ''}>
                ${item.id.toUpperCase()} • ${item.mission || ''} ${item.instrument || ''} (${item.status === 'requires_band_extraction' ? 'Requires Band Extraction' : 'Available'})
              </option>
            `).join('')}
          </select>
        </div>

        <!-- Dataset Specifications -->
        <div class="dataset-spec-list">
          <div class="spec-entry">
            <span class="spec-label">Mission</span>
            <span class="spec-val highlight">${mission}</span>
          </div>

          <div class="spec-entry">
            <span class="spec-label">Instrument</span>
            <span class="spec-val" style="color:var(--isro-gold); font-weight:600;">${instrument}</span>
          </div>

          <div class="spec-entry">
            <span class="spec-label">Source</span>
            <span class="spec-val" title="${sourceFilename}" style="word-break: break-all; font-size:11px;">
              ${sourceFilename}
            </span>
          </div>

          <div class="spec-entry">
            <span class="spec-label">Reference</span>
            <span class="spec-val" title="${referenceFilename}" style="word-break: break-all; font-size:11px;">
              ${referenceFilename} (${p.reference_instrument || 'LROC NAC'})
            </span>
          </div>

          <div class="spec-entry">
            <span class="spec-label">Status</span>
            <span class="spec-val" style="color: ${statusColor}; font-family: var(--font-mono); font-weight:600;">
              ${statusDisplay}
            </span>
          </div>

          <div class="spec-entry">
            <span class="spec-label">Ref Overlap</span>
            <span class="spec-val" style="color: #f59e0b; font-size:11px;">
              ${p.reference_status_label || 'Reference geographic overlap: NOT YET VERIFIED'}
            </span>
          </div>
        </div>

        ${p.id === 'pair_002' || instrument === 'IIRS' ? `
          <div style="background: rgba(16, 185, 129, 0.12); border: 1px solid rgba(16, 185, 129, 0.4); border-radius: 6px; padding: 10px; font-family: var(--font-mono); font-size: 11px; color: #a7f3d0; margin-bottom: 8px;">
            ✓ <b>IIRS 2D Continuum Band (1580nm) Extracted & Ready for Registration.</b>
          </div>
        ` : ''}

        <!-- Sensor Parameters Sub-panel -->
        <div style="background: rgba(5, 11, 26, 0.7); border: 1px solid var(--border-subtle); border-radius: 6px; padding: 10px; font-family: var(--font-mono); font-size: 11px; display: flex; flex-direction: column; gap: 4px;">
          <div style="display:flex; justify-content:space-between;">
            <span style="color:var(--text-muted);">GSD (Source):</span>
            <span style="color:#fff;">${instrument === 'OHRC' ? '0.25 m/px' : instrument === 'IIRS' ? '80.0 m/px' : '5.0 m/px'}</span>
          </div>
          <div style="display:flex; justify-content:space-between;">
            <span style="color:var(--text-muted);">Swath Width:</span>
            <span style="color:#fff;">${instrument === 'OHRC' ? '12,000 px' : instrument === 'IIRS' ? '1,104 channels' : '4,000 px'}</span>
          </div>
          <div style="display:flex; justify-content:space-between;">
            <span style="color:var(--text-muted);">Spectral Band:</span>
            <span style="color:#fff;">${instrument === 'OHRC' ? '450 – 900 nm (Optical)' : instrument === 'IIRS' ? '0.8 – 5.0 µm (Hyperspectral)' : '500 – 850 nm (Panchromatic)'}</span>
          </div>
        </div>

        <!-- Catalog Jump Button -->
        <button id="btn-browse-catalog" class="hud-btn" style="width:100%; justify-content:center; padding:8px 12px; margin-top:4px;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <ellipse cx="12" cy="5" rx="9" ry="3"/>
            <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/>
            <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
          </svg>
          Explore Full Lunar Dataset Catalog
        </button>
      </div>
    `

    const selectEl = this.container.querySelector<HTMLSelectElement>('#dataset-pair-dropdown')
    if (selectEl) {
      selectEl.addEventListener('change', (e) => {
        const val = (e.target as HTMLSelectElement).value
        this.onSelectPair(val)
      })
    }

    const catalogBtn = this.container.querySelector<HTMLButtonElement>('#btn-browse-catalog')
    catalogBtn?.addEventListener('click', () => {
      if (this.onOpenCatalog) this.onOpenCatalog()
    })
  }
}
