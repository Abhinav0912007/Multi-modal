import type { DatasetItem, DatasetFilters, CatalogSummary } from '../types'
import { fetchDatasets, fetchCatalogSummary } from '../api'
import { DatasetCardsView } from './DatasetCardsView'
import { DatasetTableView } from './DatasetTableView'
import { MetadataDrawer } from './MetadataDrawer'

export class DatasetExplorer {
  private container: HTMLElement
  private datasets: DatasetItem[] = []
  private summary: CatalogSummary | null = null
  private viewMode: 'cards' | 'table' = 'cards'
  private filters: DatasetFilters = {
    query: '',
    mission: 'all',
    instrument: 'all',
    productType: 'all',
    status: 'all',
    yearPreset: 'all',
  }

  private cardsView: DatasetCardsView | null = null
  private tableView: DatasetTableView | null = null
  private metadataDrawer: MetadataDrawer
  private onSelectForPipeline: (dataset: DatasetItem) => void

  constructor(container: HTMLElement, onSelectForPipeline: (dataset: DatasetItem) => void) {
    this.container = container
    this.onSelectForPipeline = onSelectForPipeline
    this.metadataDrawer = new MetadataDrawer((dataset) => {
      this.onSelectForPipeline(dataset)
    })

    this.renderSkeleton()
    this.loadCatalog()
  }

  public async loadCatalog() {
    this.datasets = await fetchDatasets(this.filters)
    this.summary = await fetchCatalogSummary()
    this.updateCounters()
    this.renderCurrentView()
  }

  private renderSkeleton() {
    this.container.innerHTML = `
      <section style="display:flex; flex-direction:column; gap:16px;">
        <!-- Toolbar & Filter Panel -->
        <div class="glass-panel corner-reticle catalog-toolbar-panel">
          <div class="catalog-top-row">
            <!-- Search Input -->
            <div class="search-input-wrap">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8"/>
                <line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input
                id="catalog-search-input"
                type="text"
                class="search-input-field"
                placeholder="Search by Product ID, region (e.g. Mare Tranquillitatis), instrument, or type..."
                value="${this.filters.query}"
              />
            </div>

            <!-- View Mode Switcher -->
            <div class="view-mode-toggle-group">
              <button id="view-mode-cards" class="view-toggle-btn ${this.viewMode === 'cards' ? 'active' : ''}">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="3" y="3" width="7" height="7"/>
                  <rect x="14" y="3" width="7" height="7"/>
                  <rect x="14" y="14" width="7" height="7"/>
                  <rect x="3" y="14" width="7" height="7"/>
                </svg>
                Cards View
              </button>
              <button id="view-mode-table" class="view-toggle-btn ${this.viewMode === 'table' ? 'active' : ''}">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="8" y1="6" x2="21" y2="6"/>
                  <line x1="8" y1="12" x2="21" y2="12"/>
                  <line x1="8" y1="18" x2="21" y2="18"/>
                  <line x1="3" y1="6" x2="3.01" y2="6"/>
                  <line x1="3" y1="12" x2="3.01" y2="12"/>
                  <line x1="3" y1="18" x2="3.01" y2="18"/>
                </svg>
                Table View
              </button>
            </div>
          </div>

          <!-- Multi-dimensional Filters Row -->
          <div class="filter-controls-row">
            <!-- Mission Filter -->
            <select id="filter-mission" class="filter-select-box" title="Filter by Mission">
              <option value="all">All Missions (Ch-1 & Ch-2)</option>
              <option value="Chandrayaan-1" ${this.filters.mission === 'Chandrayaan-1' ? 'selected' : ''}>Chandrayaan-1</option>
              <option value="Chandrayaan-2" ${this.filters.mission === 'Chandrayaan-2' ? 'selected' : ''}>Chandrayaan-2</option>
            </select>

            <!-- Instrument Filter -->
            <select id="filter-instrument" class="filter-select-box" title="Filter by Instrument">
              <option value="all">All Instruments</option>
              <option value="TMC" ${this.filters.instrument === 'TMC' ? 'selected' : ''}>TMC (Terrain Mapping Camera 1 & 2)</option>
              <option value="IIRS" ${this.filters.instrument === 'IIRS' ? 'selected' : ''}>IIRS (Imaging Infrared Spectrometer)</option>
              <option value="OHRC" ${this.filters.instrument === 'OHRC' ? 'selected' : ''}>OHRC (High Resolution Camera - 0.25m)</option>
            </select>

            <!-- Product Type Filter -->
            <select id="filter-product-type" class="filter-select-box" title="Filter by Product Type">
              <option value="all">All Product Types</option>
              <option value="calibrated" ${this.filters.productType === 'calibrated' ? 'selected' : ''}>Calibrated Products</option>
              <option value="ortho" ${this.filters.productType === 'ortho' ? 'selected' : ''}>Derived Ortho Products</option>
              <option value="dtm" ${this.filters.productType === 'dtm' ? 'selected' : ''}>Derived DTM Products</option>
              <option value="hyperspectral" ${this.filters.productType === 'hyperspectral' ? 'selected' : ''}>Hyperspectral Products (IIRS)</option>
              <option value="ohrc" ${this.filters.productType === 'ohrc' ? 'selected' : ''}>Ultra-High Resolution Products (OHRC)</option>
            </select>

            <!-- Date Era Filter -->
            <select id="filter-date-preset" class="filter-select-box" title="Filter by Mission Timeline">
              <option value="all">All Acquisition Dates</option>
              <option value="ch1_era" ${this.filters.yearPreset === 'ch1_era' ? 'selected' : ''}>Chandrayaan-1 Era (2008–2009)</option>
              <option value="ch2_era" ${this.filters.yearPreset === 'ch2_era' ? 'selected' : ''}>Chandrayaan-2 Era (2019+)</option>
            </select>

            <!-- Status Filter -->
            <select id="filter-status" class="filter-select-box" title="Filter by Processing Status">
              <option value="all">All Statuses</option>
              <option value="Ready" ${this.filters.status === 'Ready' ? 'selected' : ''}>Ready for Registration</option>
              <option value="Complete" ${this.filters.status === 'Complete' ? 'selected' : ''}>Registration Complete</option>
              <option value="Archived" ${this.filters.status === 'Archived' ? 'selected' : ''}>Archived Raw Product</option>
            </select>

            <!-- Reset Filters -->
            <button id="btn-reset-filters" class="btn-filter-reset">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
              Reset Filters
            </button>

            <!-- Result Count Badge -->
            <div style="margin-left:auto; font-family:var(--font-mono); font-size:11px; color:var(--text-secondary);" id="catalog-counter-text">
              Loading catalog...
            </div>
          </div>
        </div>

        <!-- Catalog Items View Mount -->
        <div id="catalog-items-mount"></div>
      </section>
    `

    this.wireFilterEvents()
  }

  private wireFilterEvents() {
    const searchInput = this.container.querySelector<HTMLInputElement>('#catalog-search-input')
    let debounceTimer: number
    searchInput?.addEventListener('input', () => {
      clearTimeout(debounceTimer)
      debounceTimer = window.setTimeout(() => {
        this.filters.query = searchInput.value
        this.loadCatalog()
      }, 250)
    })

    const missionSel = this.container.querySelector<HTMLSelectElement>('#filter-mission')
    missionSel?.addEventListener('change', () => {
      this.filters.mission = missionSel.value
      this.loadCatalog()
    })

    const instSel = this.container.querySelector<HTMLSelectElement>('#filter-instrument')
    instSel?.addEventListener('change', () => {
      this.filters.instrument = instSel.value
      this.loadCatalog()
    })

    const typeSel = this.container.querySelector<HTMLSelectElement>('#filter-product-type')
    typeSel?.addEventListener('change', () => {
      this.filters.productType = typeSel.value
      this.loadCatalog()
    })

    const dateSel = this.container.querySelector<HTMLSelectElement>('#filter-date-preset')
    dateSel?.addEventListener('change', () => {
      this.filters.yearPreset = dateSel.value
      this.loadCatalog()
    })

    const statusSel = this.container.querySelector<HTMLSelectElement>('#filter-status')
    statusSel?.addEventListener('change', () => {
      this.filters.status = statusSel.value
      this.loadCatalog()
    })

    const resetBtn = this.container.querySelector<HTMLButtonElement>('#btn-reset-filters')
    resetBtn?.addEventListener('click', () => {
      this.filters = {
        query: '',
        mission: 'all',
        instrument: 'all',
        productType: 'all',
        status: 'all',
        yearPreset: 'all',
      }
      this.renderSkeleton()
      this.loadCatalog()
    })

    // View toggles
    const btnCards = this.container.querySelector<HTMLButtonElement>('#view-mode-cards')
    const btnTable = this.container.querySelector<HTMLButtonElement>('#view-mode-table')

    btnCards?.addEventListener('click', () => {
      if (this.viewMode !== 'cards') {
        this.viewMode = 'cards'
        btnCards.classList.add('active')
        btnTable?.classList.remove('active')
        this.renderCurrentView()
      }
    })

    btnTable?.addEventListener('click', () => {
      if (this.viewMode !== 'table') {
        this.viewMode = 'table'
        btnTable.classList.add('active')
        btnCards?.classList.remove('active')
        this.renderCurrentView()
      }
    })
  }

  private updateCounters() {
    const counterEl = this.container.querySelector<HTMLElement>('#catalog-counter-text')
    if (counterEl) {
      const total = this.summary?.total_datasets || this.datasets.length
      counterEl.innerHTML = `Showing <strong style="color:var(--cyan-bright);">${this.datasets.length}</strong> of ${total} Scientific Products`
    }
  }

  private renderCurrentView() {
    const mount = this.container.querySelector<HTMLElement>('#catalog-items-mount')
    if (!mount) return

    if (this.viewMode === 'cards') {
      if (!this.cardsView) {
        this.cardsView = new DatasetCardsView(
          mount,
          this.datasets,
          (d) => this.metadataDrawer.open(d),
          (d) => this.onSelectForPipeline(d)
        )
      } else {
        this.cardsView.update(this.datasets)
      }
    } else {
      if (!this.tableView) {
        this.tableView = new DatasetTableView(
          mount,
          this.datasets,
          (d) => this.metadataDrawer.open(d),
          (d) => this.onSelectForPipeline(d)
        )
      } else {
        this.tableView.update(this.datasets)
      }
    }
  }
}
