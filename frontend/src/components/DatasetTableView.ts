import type { DatasetItem } from '../types'
import { renderEmptyDatasetState } from '../services/errorHandler'

export class DatasetTableView {
  private container: HTMLElement
  private datasets: DatasetItem[]
  private onSelectDataset: (dataset: DatasetItem) => void
  private onSelectForPipeline: (dataset: DatasetItem) => void
  private onResetFilters?: () => void

  constructor(
    container: HTMLElement,
    datasets: DatasetItem[],
    onSelectDataset: (dataset: DatasetItem) => void,
    onSelectForPipeline: (dataset: DatasetItem) => void,
    onResetFilters?: () => void
  ) {
    this.container = container
    this.datasets = datasets
    this.onSelectDataset = onSelectDataset
    this.onSelectForPipeline = onSelectForPipeline
    this.onResetFilters = onResetFilters
    this.render()
  }

  public update(datasets: DatasetItem[]) {
    this.datasets = datasets
    this.render()
  }

  public render() {
    if (this.datasets.length === 0) {
      this.container.innerHTML = renderEmptyDatasetState({
        title: 'No Lunar Datasets Found',
        message: 'No planetary products matched the current table filter conditions.',
        actionNext: 'Reset table filter parameters or clear your search term to browse all available Chandrayaan-1 and Chandrayaan-2 products.',
        actionBtnText: 'Reset Filter Criteria',
        actionBtnId: 'btn-table-empty-reset',
      })

      this.container.querySelector('#btn-table-empty-reset')?.addEventListener('click', () => {
        if (this.onResetFilters) this.onResetFilters()
      })
      return
    }

    this.container.innerHTML = `
      <div class="glass-panel dataset-table-card">
        <table class="dataset-table">
          <thead>
            <tr>
              <th>Product Identifier</th>
              <th>Mission</th>
              <th>Instrument</th>
              <th>Product Classification</th>
              <th>Target Region</th>
              <th>Resolution (GSD)</th>
              <th>Acquisition UTC</th>
              <th>Dimensions</th>
              <th>Format & Size</th>
              <th>Status</th>
              <th style="text-align:right;">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${this.datasets.map(d => {
              const isCh1 = d.mission === 'Chandrayaan-1'
              const dateStr = new Date(d.acquisition_time).toISOString().split('T')[0]

              let statusClass = 'idle'
              if (d.processing_status === 'Complete') statusClass = ''
              else if (d.processing_status === 'Processing') statusClass = 'processing'

              return `
                <tr data-product-id="${d.product_id}">
                  <td>
                    <span class="card-product-id">${d.product_id}</span>
                  </td>
                  <td>
                    <span class="badge-mission" style="font-size:9px; padding:2px 6px; border-color:${isCh1 ? 'var(--border-gold)' : 'var(--border-active)'}; color:${isCh1 ? 'var(--isro-gold)' : 'var(--cyan-bright)'};">
                      ${d.mission}
                    </span>
                  </td>
                  <td>
                    <span style="font-family:var(--font-mono); color:#fff;">${d.instrument_code}</span>
                  </td>
                  <td style="color:var(--text-primary); font-weight:500;">
                    ${d.product_type}
                  </td>
                  <td style="color:var(--text-secondary);">
                    ${d.footprint.region_name}
                  </td>
                  <td>
                    <span style="color:var(--cyan-bright); font-family:var(--font-mono); font-weight:600;">${d.resolution}</span>
                  </td>
                  <td style="font-family:var(--font-mono); font-size:11px;">
                    ${dateStr}
                  </td>
                  <td style="font-family:var(--font-mono); font-size:11px;">
                    ${d.dimensions}
                  </td>
                  <td style="font-family:var(--font-mono); font-size:11px;">
                    ${d.file_size} (${d.format.split(' ')[0]})
                  </td>
                  <td>
                    <span class="badge-status ${statusClass}" style="font-size:10px; padding:2px 6px;">
                      <span class="pulse-dot"></span>
                      ${d.processing_status}
                    </span>
                  </td>
                  <td style="text-align:right;">
                    <div style="display:inline-flex; gap:6px;">
                      <button class="btn-card-action btn-inspect-row" data-product-id="${d.product_id}" style="padding:3px 8px; font-size:10px;">
                        Inspect
                      </button>
                      <button class="btn-card-action btn-select-row" data-product-id="${d.product_id}" style="padding:3px 8px; font-size:10px; color:var(--isro-gold); border-color:rgba(245,158,11,0.3);" title="Select for Pipeline">
                        Select
                      </button>
                    </div>
                  </td>
                </tr>
              `
            }).join('')}
          </tbody>
        </table>
      </div>
    `

    // Wire up row click
    this.container.querySelectorAll<HTMLTableRowElement>('tbody tr').forEach(row => {
      row.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).closest('.btn-select-row')) return
        const pId = row.getAttribute('data-product-id')
        const item = this.datasets.find(d => d.product_id === pId)
        if (item) this.onSelectDataset(item)
      })
    })

    this.container.querySelectorAll<HTMLButtonElement>('.btn-select-row').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation()
        const pId = btn.getAttribute('data-product-id')
        const item = this.datasets.find(d => d.product_id === pId)
        if (item) this.onSelectForPipeline(item)
      })
    })
  }
}
