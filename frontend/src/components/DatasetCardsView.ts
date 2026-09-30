import type { DatasetItem } from '../types'

export class DatasetCardsView {
  private container: HTMLElement
  private datasets: DatasetItem[]
  private onSelectDataset: (dataset: DatasetItem) => void
  private onSelectForPipeline: (dataset: DatasetItem) => void

  constructor(
    container: HTMLElement,
    datasets: DatasetItem[],
    onSelectDataset: (dataset: DatasetItem) => void,
    onSelectForPipeline: (dataset: DatasetItem) => void
  ) {
    this.container = container
    this.datasets = datasets
    this.onSelectDataset = onSelectDataset
    this.onSelectForPipeline = onSelectForPipeline
    this.render()
  }

  public update(datasets: DatasetItem[]) {
    this.datasets = datasets
    this.render()
  }

  public render() {
    if (this.datasets.length === 0) {
      this.container.innerHTML = `
        <div style="grid-column: 1 / -1; padding: 60px 20px; text-align: center; color: var(--text-muted); font-family: var(--font-mono);">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin: 0 auto 12px; opacity: 0.5;">
            <circle cx="11" cy="11" r="8"/>
            <line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <p style="font-size: 14px; color: var(--text-secondary);">No lunar datasets matched the selected filter criteria.</p>
          <p style="font-size: 11px; margin-top: 4px;">Try adjusting search terms, clearing filters, or switching mission eras.</p>
        </div>
      `
      return
    }

    this.container.innerHTML = `
      <div class="dataset-cards-grid">
        ${this.datasets.map(d => {
          const isCh1 = d.mission === 'Chandrayaan-1'
          const dateStr = new Date(d.acquisition_time).toISOString().split('T')[0]

          let statusClass = 'idle'
          if (d.processing_status === 'Complete') statusClass = ''
          else if (d.processing_status === 'Processing') statusClass = 'processing'

          return `
            <div class="dataset-catalog-card" data-product-id="${d.product_id}">
              <!-- Top Badges -->
              <div class="card-top-badges">
                <span class="card-product-id">${d.product_id}</span>
                <span class="badge-status ${statusClass}">
                  <span class="pulse-dot"></span>
                  ${d.processing_status}
                </span>
              </div>

              <!-- Title & Mission / Instrument -->
              <div style="display:flex; flex-direction:column; gap:4px;">
                <div style="display:flex; align-items:center; gap:8px;">
                  <span class="badge-mission" style="font-size:10px; padding:2px 8px; border-color:${isCh1 ? 'var(--border-gold)' : 'var(--border-active)'}; color:${isCh1 ? 'var(--isro-gold)' : 'var(--cyan-bright)'};">
                    ${d.mission}
                  </span>
                  <span style="font-family:var(--font-mono); font-size:11px; color:var(--text-secondary);">
                    ${d.instrument}
                  </span>
                </div>
                <h4 class="card-title-text">${d.title}</h4>
              </div>

              <!-- Target Region Footprint -->
              <div class="card-footprint-tag">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                  <circle cx="12" cy="10" r="3"/>
                </svg>
                <span>${d.footprint.region_name}</span>
              </div>

              <!-- Specifications Matrix -->
              <div class="card-specs-matrix">
                <div class="card-spec-item">
                  <span class="k">Resolution (GSD)</span>
                  <span class="v" style="color:var(--cyan-bright);">${d.resolution}</span>
                </div>
                <div class="card-spec-item">
                  <span class="k">Product Type</span>
                  <span class="v">${d.product_type}</span>
                </div>
                <div class="card-spec-item">
                  <span class="k">Dimensions</span>
                  <span class="v">${d.dimensions}</span>
                </div>
                <div class="card-spec-item">
                  <span class="k">Format & Size</span>
                  <span class="v">${d.file_size} • ${d.format.split(' ')[0]}</span>
                </div>
              </div>

              <!-- Bottom Actions -->
              <div class="card-bottom-actions">
                <span style="font-family:var(--font-mono); font-size:10px; color:var(--text-muted);">
                  Acquired: ${dateStr}
                </span>
                <div style="display:flex; gap:6px;">
                  <button class="btn-card-action btn-inspect-card" data-product-id="${d.product_id}">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <circle cx="12" cy="12" r="10"/>
                      <line x1="12" y1="16" x2="12" y2="12"/>
                      <line x1="12" y1="8" x2="12.01" y2="8"/>
                    </svg>
                    Metadata
                  </button>
                  <button class="btn-card-action btn-select-card" data-product-id="${d.product_id}" style="color:var(--isro-gold); border-color:rgba(245,158,11,0.3);" title="Load into Registration Pipeline">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <polygon points="5 3 19 12 5 21 5 3"/>
                    </svg>
                    Select
                  </button>
                </div>
              </div>
            </div>
          `
        }).join('')}
      </div>
    `

    // Wire up events
    this.container.querySelectorAll<HTMLElement>('.dataset-catalog-card').forEach(card => {
      card.addEventListener('click', (e) => {
        // Prevent trigger if clicking the select button
        if ((e.target as HTMLElement).closest('.btn-select-card')) return
        const pId = card.getAttribute('data-product-id')
        const item = this.datasets.find(d => d.product_id === pId)
        if (item) this.onSelectDataset(item)
      })
    })

    this.container.querySelectorAll<HTMLButtonElement>('.btn-select-card').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation()
        const pId = btn.getAttribute('data-product-id')
        const item = this.datasets.find(d => d.product_id === pId)
        if (item) this.onSelectForPipeline(item)
      })
    })
  }
}
