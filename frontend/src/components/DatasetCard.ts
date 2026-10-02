import type { PairItem, SystemStatus } from '../types'
import { renderEmptyDatasetState } from '../services/errorHandler'

export class DatasetCard {
  private container: HTMLElement
  private pair: PairItem | null
  private status: SystemStatus
  private onSelectPair: (pairId: string) => void
  private onOpenCatalog?: () => void
  private onStartRegistration?: () => void
  private pairs: PairItem[]

  constructor(
    container: HTMLElement,
    pair: PairItem | null,
    status: SystemStatus,
    pairs: PairItem[],
    onSelectPair: (pairId: string) => void,
    onOpenCatalog?: () => void,
    onStartRegistration?: () => void
  ) {
    this.container = container
    this.pair = pair
    this.status = status
    this.pairs = pairs
    this.onSelectPair = onSelectPair
    this.onOpenCatalog = onOpenCatalog
    this.onStartRegistration = onStartRegistration
    this.render()
  }

  public update(pair: PairItem | null, status: SystemStatus, pairs: PairItem[]) {
    this.pair = pair
    this.status = status
    this.pairs = pairs
    this.render()
  }

  public render() {
    if (this.pairs.length === 0) {
      this.container.innerHTML = `
        <div class="current-dataset-strip glass-panel corner-reticle" style="padding: 24px;">
          ${renderEmptyDatasetState({
            title: 'No Lunar Observation Pairs Loaded',
            message: 'No active observation pairs are currently registered in the mission telemetry catalog.',
            actionNext: 'Switch to Dataset Explorer to scan and index raw lunar imagery or verify that the Chandrayaan backend service is online.',
            actionBtnText: 'Open Dataset Catalog',
            actionBtnId: 'btn-open-dataset-catalog-empty'
          })}
        </div>
      `
      const actionBtn = this.container.querySelector<HTMLButtonElement>('#btn-open-dataset-catalog-empty')
      actionBtn?.addEventListener('click', () => {
        if (this.onOpenCatalog) this.onOpenCatalog()
      })
      return
    }

    const p = this.pair || this.pairs[0] || {
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

    let statusDisplay = p.status_label || 'Ready for registration'
    let statusClass = 'idle'

    if (p.id === 'pair_002' || instrument === 'IIRS' || p.product_type === 'HYPERSPECTRAL') {
      statusDisplay = 'Band extraction required'
      statusClass = 'warning'
    } else if (p.status === 'pending_validation' || p.id === 'pair_001') {
      statusDisplay = 'Ready for registration'
      statusClass = 'idle'
    } else if (this.status.processingStatus === 'PROCESSING') {
      statusDisplay = 'Registration In Progress'
      statusClass = 'processing'
    } else if (this.status.processingStatus === 'COMPLETED') {
      statusDisplay = 'Registration Complete'
      statusClass = ''
    }

    this.container.innerHTML = `
      <div class="current-dataset-strip glass-panel corner-reticle" role="region" aria-label="Active Lunar Dataset">
        <div class="dataset-info-col">
          <div class="dataset-eyebrow-tag">
            <span class="pulse-dot" style="background: var(--isro-gold);" aria-hidden="true"></span>
            CURRENT DATASET
          </div>
          <div class="dataset-headline-row">
            <span class="dataset-id-tag font-mono">${p.id.toUpperCase()}</span>
            <span class="dataset-title-text">${mission} ${instrument}</span>
          </div>
          <div class="dataset-reference-sub">
            <span class="ref-item">
              <span class="ref-k">Reference:</span>
              <span class="ref-v">${p.reference_instrument || 'LROC NAC'} (${referenceFilename})</span>
            </span>
            <span class="ref-sep">&bull;</span>
            <span class="ref-item">
              <span class="ref-k">Source:</span>
              <span class="ref-v font-mono" title="${sourceFilename}">${sourceFilename}</span>
            </span>
          </div>
        </div>

        <div class="dataset-status-col">
          <span class="status-clean-label">Status</span>
          <span class="badge-status ${statusClass}">
            <span class="pulse-dot" aria-hidden="true"></span>
            ${statusDisplay}
          </span>
        </div>

        <div class="dataset-actions-col">
          <div class="dataset-dropdown-wrap">
            <label for="dataset-pair-dropdown" class="sr-only">Change Dataset Pair</label>
            <select id="dataset-pair-dropdown" class="pair-picker-select" aria-label="Change Dataset Observation Pair">
              ${this.pairs.map(item => `
                <option value="${item.id}" ${item.id === p.id ? 'selected' : ''}>
                  ${item.id.toUpperCase()} • ${item.mission || ''} ${item.instrument || ''}
                </option>
              `).join('')}
            </select>
          </div>

          <button id="btn-browse-catalog" class="btn-ghost-space" aria-label="Explore Full Lunar Dataset Catalog">
            Explore Catalog
          </button>

          <button id="btn-dataset-start-reg" class="btn-primary-space" aria-label="Start Registration for selected dataset">
            <span>Start Registration</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          </button>
        </div>
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

    const startBtn = this.container.querySelector<HTMLButtonElement>('#btn-dataset-start-reg')
    startBtn?.addEventListener('click', () => {
      if (this.onStartRegistration) {
        this.onStartRegistration()
      } else if (this.onOpenCatalog) {
        this.onOpenCatalog()
      }
    })
  }
}
