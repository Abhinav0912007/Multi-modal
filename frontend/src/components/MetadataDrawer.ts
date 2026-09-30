import type { DatasetItem } from '../types'
import { LunarFootprintMap } from './LunarFootprintMap'

export class MetadataDrawer {
  private backdrop: HTMLElement
  private drawer: HTMLElement
  private currentDataset: DatasetItem | null = null
  private onSelectForPipeline: (dataset: DatasetItem) => void

  constructor(onSelectForPipeline: (dataset: DatasetItem) => void) {
    this.onSelectForPipeline = onSelectForPipeline

    this.backdrop = document.createElement('div')
    this.backdrop.className = 'metadata-drawer-backdrop'

    this.drawer = document.createElement('div')
    this.drawer.className = 'metadata-drawer-container'

    document.body.appendChild(this.backdrop)
    document.body.appendChild(this.drawer)

    this.backdrop.addEventListener('click', () => this.close())
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen()) {
        this.close()
      }
    })
  }

  public isOpen(): boolean {
    return this.drawer.classList.contains('open')
  }

  public open(dataset: DatasetItem) {
    this.currentDataset = dataset
    this.render()
    this.backdrop.classList.add('open')
    this.drawer.classList.add('open')

    // Initialize footprint mini-map inside drawer
    const mapContainer = this.drawer.querySelector<HTMLElement>('#drawer-footprint-map')
    if (mapContainer && dataset.footprint) {
      const footprintMap = new LunarFootprintMap(mapContainer)
      footprintMap.setFootprint(dataset.footprint)
    }
  }

  public close() {
    this.backdrop.classList.remove('open')
    this.drawer.classList.remove('open')
  }

  private render() {
    if (!this.currentDataset) return
    const d = this.currentDataset
    const m = d.metadata || {}
    const fp = d.footprint

    const dateFormatted = new Date(d.acquisition_time).toUTCString()

    this.drawer.innerHTML = `
      <div class="drawer-header">
        <div style="display:flex; flex-direction:column; gap:6px;">
          <div style="display:flex; align-items:center; gap:8px;">
            <span class="card-product-id">${d.product_id}</span>
            <span class="badge-status ${d.processing_status === 'Ready' ? 'idle' : d.processing_status === 'Complete' ? '' : 'processing'}">
              <span class="pulse-dot"></span>
              ${d.processing_status}
            </span>
          </div>
          <h3>${d.title}</h3>
        </div>
        <button id="drawer-close-btn" class="btn-close-modal" title="Close Drawer (Esc)">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      <div class="drawer-body">
        <!-- Visual Lunar Footprint Area -->
        <div class="drawer-section">
          <div class="drawer-section-title">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <polygon points="12 2 15 8 22 9 17 14 18 21 12 17 6 21 7 14 2 9 9 8 12 2"/>
            </svg>
            Geographic Lunar Footprint & Coverage
          </div>
          <div class="footprint-map-card" id="drawer-footprint-map"></div>
          <div class="footprint-coords-overlay" style="position:static; margin-top:6px;">
            <span>Latitude: ${fp.lat_min}° to ${fp.lat_max}°</span>
            <span>Longitude: ${fp.lon_min}° to ${fp.lon_max}°</span>
          </div>
        </div>

        <!-- Section 1: Scientific Product Classification -->
        <div class="drawer-section">
          <div class="drawer-section-title">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="2" y="7" width="20" height="14" rx="2" ry="2"/>
              <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>
            </svg>
            Scientific Classification
          </div>
          <div class="drawer-metadata-grid">
            <div class="drawer-meta-cell">
              <div class="label">Mission</div>
              <div class="value" style="color:var(--isro-gold); font-family:var(--font-mono);">${d.mission}</div>
            </div>
            <div class="drawer-meta-cell">
              <div class="label">Instrument</div>
              <div class="value">${d.instrument}</div>
            </div>
            <div class="drawer-meta-cell">
              <div class="label">Product Type</div>
              <div class="value" style="color:var(--cyan-bright);">${d.product_type}</div>
            </div>
            <div class="drawer-meta-cell">
              <div class="label">Acquisition UTC</div>
              <div class="value" style="font-family:var(--font-mono); font-size:11px;">${dateFormatted}</div>
            </div>
          </div>
        </div>

        <!-- Section 2: Spatial & Geometric Properties -->
        <div class="drawer-section">
          <div class="drawer-section-title">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <line x1="2" y1="12" x2="22" y2="12"/>
            </svg>
            Spatial & Geometric Parameters
          </div>
          <div class="drawer-metadata-grid">
            <div class="drawer-meta-cell">
              <div class="label">Ground Sampling Distance</div>
              <div class="value" style="color:var(--cyan-bright); font-family:var(--font-mono); font-size:14px; font-weight:700;">${d.resolution}</div>
            </div>
            <div class="drawer-meta-cell">
              <div class="label">Array Dimensions</div>
              <div class="value" style="font-family:var(--font-mono);">${d.dimensions}</div>
            </div>
            <div class="drawer-meta-cell" style="grid-column: span 2;">
              <div class="label">Spatial Reference System</div>
              <div class="value" style="font-family:var(--font-mono); font-size:11px;">${d.spatial_reference}</div>
            </div>
          </div>
        </div>

        <!-- Section 3: Photometric & Orbit Geometry -->
        <div class="drawer-section">
          <div class="drawer-section-title">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="5"/>
              <line x1="12" y1="1" x2="12" y2="3"/>
              <line x1="12" y1="21" x2="12" y2="23"/>
            </svg>
            Orbital & Solar Illumination Geometry
          </div>
          <div class="drawer-metadata-grid">
            <div class="drawer-meta-cell">
              <div class="label">Orbit Number</div>
              <div class="value" style="font-family:var(--font-mono);">${m.orbit_number || '—'}</div>
            </div>
            <div class="drawer-meta-cell">
              <div class="label">Orbit Altitude</div>
              <div class="value" style="font-family:var(--font-mono);">${m.orbit_altitude_km ? `${m.orbit_altitude_km} km` : '100.0 km'}</div>
            </div>
            <div class="drawer-meta-cell">
              <div class="label">Solar Incidence Angle</div>
              <div class="value" style="font-family:var(--font-mono);">${m.incidence_angle_deg ? `${m.incidence_angle_deg}°` : '—'}</div>
            </div>
            <div class="drawer-meta-cell">
              <div class="label">Emission Angle</div>
              <div class="value" style="font-family:var(--font-mono);">${m.emission_angle_deg ? `${m.emission_angle_deg}°` : '—'}</div>
            </div>
            <div class="drawer-meta-cell">
              <div class="label">Phase Angle</div>
              <div class="value" style="font-family:var(--font-mono);">${m.phase_angle_deg ? `${m.phase_angle_deg}°` : '—'}</div>
            </div>
            <div class="drawer-meta-cell">
              <div class="label">Solar Azimuth Angle</div>
              <div class="value" style="font-family:var(--font-mono);">${m.solar_azimuth_deg ? `${m.solar_azimuth_deg}°` : '—'}</div>
            </div>
          </div>
        </div>

        <!-- Section 4: File Archive & Data Governance -->
        <div class="drawer-section">
          <div class="drawer-section-title">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
            Archive & Governance Details
          </div>
          <div class="drawer-metadata-grid">
            <div class="drawer-meta-cell">
              <div class="label">Storage Format</div>
              <div class="value" style="font-family:var(--font-mono);">${d.format}</div>
            </div>
            <div class="drawer-meta-cell">
              <div class="label">File Size</div>
              <div class="value" style="font-family:var(--font-mono);">${d.file_size}</div>
            </div>
            <div class="drawer-meta-cell" style="grid-column: span 2;">
              <div class="label">Calibration Standard</div>
              <div class="value">${m.calibration_level || 'Level-2 Calibrated Standard'}</div>
            </div>
            <div class="drawer-meta-cell" style="grid-column: span 2;">
              <div class="label">Data Provider</div>
              <div class="value">${m.data_provider || 'ISRO / ISSDC Indian Space Science Data Centre'}</div>
            </div>
          </div>
        </div>
      </div>

      <div class="drawer-footer-actions">
        <button id="btn-select-for-pipeline" class="btn-launch" style="flex:1;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polygon points="5 3 19 12 5 21 5 3"/>
          </svg>
          Select for Registration Pipeline
        </button>
        <button id="btn-copy-product-id" class="hud-btn" style="padding:10px 14px;" title="Copy Product ID">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
          </svg>
        </button>
      </div>
    `

    const closeBtn = this.drawer.querySelector('#drawer-close-btn')
    closeBtn?.addEventListener('click', () => this.close())

    const selectBtn = this.drawer.querySelector('#btn-select-for-pipeline')
    selectBtn?.addEventListener('click', () => {
      this.close()
      this.onSelectForPipeline(d)
    })

    const copyBtn = this.drawer.querySelector<HTMLButtonElement>('#btn-copy-product-id')
    copyBtn?.addEventListener('click', () => {
      navigator.clipboard.writeText(d.product_id)
      copyBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--emerald-status)" stroke-width="2">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      `
      setTimeout(() => {
        copyBtn.innerHTML = `
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
          </svg>
        `
      }, 1500)
    })
  }
}
