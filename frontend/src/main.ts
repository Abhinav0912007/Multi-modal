import './style.css'
import type { SystemStatus, PairItem, RegistrationMetrics, PipelineConfig, StageInfo, DatasetItem } from './types'
import { checkBackendHealth, fetchAvailablePairs } from './api'
import { Header } from './components/Header'
import { LunarHero } from './components/LunarHero'
import { DatasetCard } from './components/DatasetCard'
import { PipelineSection } from './components/PipelineSection'
import { StatisticsGrid } from './components/StatisticsGrid'
import { StageModal } from './components/StageModal'
import { LaunchController } from './components/LaunchController'
import { DatasetExplorer } from './components/DatasetExplorer'
import { RoiExplorer } from './components/RoiExplorer'
import { FeatureWorkspace } from './components/FeatureWorkspace'
import { SpatialWorkspace } from './components/SpatialWorkspace'
import { AlignmentStudio } from './components/AlignmentStudio'
import { TransformationAnalysis } from './components/TransformationAnalysis'
import { ExportWorkspace } from './components/ExportWorkspace'

// Current active view
type ActiveTab = 'mission-control' | 'dataset-explorer' | 'roi-explorer' | 'feature-correspondence' | 'spatial-analysis' | 'alignment-studio' | 'transformation-analysis' | 'export-workspace'

// Initial application state
const state: {
  currentTab: ActiveTab
  systemStatus: SystemStatus
  pairs: PairItem[]
  selectedPair: PairItem | null
  metrics: RegistrationMetrics | null
  isProcessing: boolean
} = {
  currentTab: 'mission-control',
  systemStatus: {
    backendOnline: false,
    activePair: 'pair_001',
    processingStatus: 'IDLE',
    currentStage: 'READY FOR INGESTION',
    mission: 'Chandrayaan-1',
  },
  pairs: [],
  selectedPair: null,
  metrics: null, // Initial metrics are null, displaying '—'
  isProcessing: false,
}

// Target DOM container
const appEl = document.querySelector<HTMLDivElement>('#app')!

// Build base layout structure with Main Navigation Bar
appEl.innerHTML = `
  <!-- TOP NAVIGATION BAR -->
  <nav class="main-nav-bar">
    <div class="nav-tabs-group">
      <button id="nav-btn-mission" class="nav-tab-btn active">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(-30 12 12)"/>
        </svg>
        Mission Control Dashboard
      </button>

      <button id="nav-btn-catalog" class="nav-tab-btn">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <ellipse cx="12" cy="5" rx="9" ry="3"/>
          <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/>
          <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
        </svg>
        Lunar Dataset Explorer
        <span class="badge-counter" id="nav-catalog-count">10 Products</span>
      </button>

      <button id="nav-btn-roi" class="nav-tab-btn">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <line x1="22" y1="12" x2="18" y2="12"/>
          <line x1="6" y1="12" x2="2" y2="12"/>
          <line x1="12" y1="6" x2="12" y2="2"/>
          <line x1="12" y1="22" x2="12" y2="18"/>
        </svg>
        Scientific ROI Explorer
        <span class="badge-counter" style="background: rgba(56, 189, 248, 0.15); color: var(--cyan-bright); border: 1px solid rgba(56, 189, 248, 0.3);">Stage 02</span>
      </button>

      <button id="nav-btn-correspondence" class="nav-tab-btn">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="6" cy="12" r="3"/>
          <circle cx="18" cy="12" r="3"/>
          <line x1="9" y1="12" x2="15" y2="12"/>
          <path d="M6 9a6 6 0 0 1 12 0"/>
        </svg>
        Feature Correspondence
        <span class="badge-counter" style="background: rgba(16, 185, 129, 0.15); color: var(--emerald-status); border: 1px solid rgba(16, 185, 129, 0.3);">Stage 03</span>
      </button>

      <button id="nav-btn-spatial" class="nav-tab-btn">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="3" width="7" height="7"/>
          <rect x="14" y="3" width="7" height="7"/>
          <rect x="14" y="14" width="7" height="7"/>
          <rect x="3" y="14" width="7" height="7"/>
        </svg>
        Spatial Grid & Density
        <span class="badge-counter" style="background: rgba(245, 158, 11, 0.15); color: #f59e0b; border: 1px solid rgba(245, 158, 11, 0.3);">Stage 05</span>
      </button>

      <button id="nav-btn-alignment" class="nav-tab-btn">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
        </svg>
        Alignment Studio
        <span class="badge-counter" style="background: rgba(16, 185, 129, 0.15); color: var(--emerald-status); border: 1px solid rgba(16, 185, 129, 0.3);">Stage 06 & 07</span>
      </button>

      <button id="nav-btn-transformation" class="nav-tab-btn">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="3" width="18" height="18" rx="2"/>
          <path d="M7 8h10M7 12h10M7 16h10"/>
        </svg>
        Transformation Analysis
        <span class="badge-counter" style="background: rgba(168, 85, 247, 0.15); color: #c084fc; border: 1px solid rgba(168, 85, 247, 0.3);">Phase 09</span>
      </button>

      <button id="nav-btn-export" class="nav-tab-btn">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
        Export &amp; Artifacts
        <span class="badge-counter" style="background: rgba(34, 197, 94, 0.15); color: #4ade80; border: 1px solid rgba(34, 197, 94, 0.3);">Phase 10</span>
      </button>
    </div>

    <div style="display:flex; align-items:center; gap:12px; font-family:var(--font-mono); font-size:11px;">
      <span style="color:var(--text-muted);">ISRO CHANDRAYAAN PROGRAM</span>
      <span style="color:var(--border-card);">|</span>
      <span style="color:var(--cyan-bright); font-weight:600;">CATALOG v2.0</span>
    </div>
  </nav>

  <!-- VIEW 1: MISSION CONTROL DASHBOARD -->
  <div id="view-mission-control" style="display:flex; flex-direction:column; gap:20px;">
    <!-- HEADER MOUNT -->
    <div id="header-mount"></div>

    <!-- HERO SECTION: Lunar Celestial Visualization + Dataset Card -->
    <div class="hero-container">
      <div class="lunar-viewport-card glass-panel corner-reticle">
        <!-- 3D Canvas Mount -->
        <div id="lunar-canvas-mount" class="lunar-canvas-wrap"></div>

        <!-- Top HUD Overlay -->
        <div class="hero-hud-top">
          <div class="hud-title-box">
            <h3>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(-30 12 12)"/>
              </svg>
              Lunar Coordinate Tracking & Orbital Telemetry
            </h3>
            <p>TMC Polar Ground Track • Altitude: 100.0 km • Inclination: 89.9°</p>
          </div>

          <div class="hero-controls-bar">
            <button id="btn-toggle-rotate" class="hud-btn active" title="Toggle Auto-Rotation">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
              Rotation
            </button>
            <button id="btn-toggle-grid" class="hud-btn active" title="Toggle Coordinate Grid">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/></svg>
              Lat/Lon Grid
            </button>
            <button id="btn-toggle-orbit" class="hud-btn active" title="Toggle Orbital Path">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="12" rx="10" ry="5" transform="rotate(-45 12 12)"/></svg>
              Orbit
            </button>
            <button id="btn-toggle-footprint" class="hud-btn active" title="Toggle TMC Ground Swath">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="6" width="12" height="12"/></svg>
              TMC Footprint
            </button>
            <button id="btn-reset-view" class="hud-btn" title="Reset Camera View">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><polyline points="23 20 23 14 17 14"/><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/></svg>
              Reset
            </button>
          </div>
        </div>

        <!-- Bottom HUD Floating Telemetry -->
        <div class="hero-hud-bottom">
          <div class="telemetry-readout-box">
            <div class="telemetry-item">
              <span class="k">Sub-Spacecraft Lat:</span>
              <span id="hud-sc-lat" class="v">00°00'00" N</span>
            </div>
            <div class="telemetry-item">
              <span class="k">Sub-Spacecraft Lon:</span>
              <span id="hud-sc-lon" class="v">00°00'00" E</span>
            </div>
            <div class="telemetry-item">
              <span class="k">Orbital Altitude:</span>
              <span id="hud-sc-alt" class="v">100.2 km</span>
            </div>
          </div>

          <div class="telemetry-readout-box" style="text-align: right;">
            <div class="telemetry-item">
              <span class="k">Sub-Solar Point:</span>
              <span class="v">01°14' S, 44°30' W</span>
            </div>
            <div class="telemetry-item">
              <span class="k">Sensor Swath:</span>
              <span class="v" style="color:var(--isro-gold);">20 km Across-track (TMC)</span>
            </div>
            <div class="telemetry-item">
              <span class="k">Camera Mode:</span>
              <span class="v">Stereo Triplet (Fore/Nadir/Aft)</span>
            </div>
          </div>
        </div>
      </div>

      <!-- DATASET CARD MOUNT -->
      <div id="dataset-card-mount" class="dataset-telemetry-col"></div>
    </div>

    <!-- PIPELINE SECTION MOUNT -->
    <div id="pipeline-mount"></div>

    <!-- STATISTICS SECTION MOUNT -->
    <div id="statistics-mount"></div>

    <!-- COLLAPSIBLE MISSION TELEMETRY LOG -->
    <div class="glass-panel" style="padding: 12px 18px;">
      <div style="display: flex; align-items: center; justify-content: space-between; cursor: pointer; user-select: none;" id="console-toggle">
        <span style="font-family: var(--font-mono); font-size: 11px; color: var(--cyan-bright); text-transform: uppercase; letter-spacing: 0.05em; display: flex; align-items: center; gap: 8px;">
          <span class="pulse-dot"></span>
          Mission Control Event Stream & Console Telemetry
        </span>
        <span id="console-chevron" style="font-size: 11px; color: var(--text-muted); font-family: var(--font-mono);">[LIVE]</span>
      </div>
      <div id="console-body" class="live-console-wrap" style="margin-top: 10px;">
        <div class="console-entry">
          <span class="ts">[INIT]</span>
          <span>ISRO Chandrayaan TMC Image Registration System ready. Standby for target ingestion.</span>
        </div>
      </div>
    </div>
  </div>

  <!-- VIEW 2: LUNAR DATASET EXPLORER -->
  <div id="view-dataset-explorer" style="display:none; flex-direction:column; gap:20px;">
    <!-- Dataset Explorer Mount -->
    <div id="dataset-explorer-mount"></div>
  </div>

  <!-- VIEW 3: SCIENTIFIC ROI EXPLORER (PHASE 4) -->
  <div id="view-roi-explorer" style="display:none; flex-direction:column; gap:20px;">
    <!-- ROI Explorer Mount -->
    <div id="roi-explorer-mount"></div>
  </div>

  <!-- VIEW 4: FEATURE CORRESPONDENCE WORKSPACE (PHASE 6) -->
  <div id="view-feature-workspace" style="display:none; flex-direction:column; gap:20px;">
    <!-- Feature Workspace Mount -->
    <div id="feature-workspace-mount"></div>
  </div>

  <!-- VIEW 5: SPATIAL GRID & INLIER DENSITY WORKSPACE (PHASE 7) -->
  <div id="view-spatial-workspace" style="display:none; flex-direction:column; gap:20px;">
    <!-- Spatial Workspace Mount -->
    <div id="spatial-workspace-mount"></div>
  </div>

  <!-- VIEW 6: INTERACTIVE ALIGNMENT STUDIO (PHASE 8) -->
  <div id="view-alignment-studio" style="display:none; flex-direction:column; gap:20px;">
    <!-- Alignment Studio Mount -->
    <div id="alignment-studio-mount"></div>
  </div>

  <!-- VIEW 7: SCIENTIFIC TRANSFORMATION ANALYSIS (PHASE 9) -->
  <div id="view-transformation-analysis" style="display:none; flex-direction:column; gap:20px;">
    <!-- Transformation Analysis Mount -->
    <div id="transformation-analysis-mount"></div>
  </div>

  <!-- VIEW 8: EXPORT & ARTIFACTS WORKSPACE (PHASE 10) -->
  <div id="view-export-workspace" style="display:none; flex-direction:column; gap:20px;">
    <!-- Export Workspace Mount -->
    <div id="export-workspace-mount"></div>
  </div>
`

// Navigation Tab Elements
const navBtnMission = document.querySelector<HTMLButtonElement>('#nav-btn-mission')!
const navBtnCatalog = document.querySelector<HTMLButtonElement>('#nav-btn-catalog')!
const navBtnRoi = document.querySelector<HTMLButtonElement>('#nav-btn-roi')!
const navBtnCorrespondence = document.querySelector<HTMLButtonElement>('#nav-btn-correspondence')!
const navBtnSpatial = document.querySelector<HTMLButtonElement>('#nav-btn-spatial')!
const navBtnAlignment = document.querySelector<HTMLButtonElement>('#nav-btn-alignment')!
const navBtnTransformation = document.querySelector<HTMLButtonElement>('#nav-btn-transformation')!
const navBtnExport = document.querySelector<HTMLButtonElement>('#nav-btn-export')!
const viewMission = document.querySelector<HTMLDivElement>('#view-mission-control')!
const viewCatalog = document.querySelector<HTMLDivElement>('#view-dataset-explorer')!
const viewRoi = document.querySelector<HTMLDivElement>('#view-roi-explorer')!
const viewCorrespondence = document.querySelector<HTMLDivElement>('#view-feature-workspace')!
const viewSpatial = document.querySelector<HTMLDivElement>('#view-spatial-workspace')!
const viewAlignment = document.querySelector<HTMLDivElement>('#view-alignment-studio')!
const viewTransformation = document.querySelector<HTMLDivElement>('#view-transformation-analysis')!
const viewExport = document.querySelector<HTMLDivElement>('#view-export-workspace')!

function switchTab(tab: ActiveTab) {
  state.currentTab = tab
  navBtnMission.classList.toggle('active', tab === 'mission-control')
  navBtnCatalog.classList.toggle('active', tab === 'dataset-explorer')
  navBtnRoi.classList.toggle('active', tab === 'roi-explorer')
  navBtnCorrespondence.classList.toggle('active', tab === 'feature-correspondence')
  navBtnSpatial.classList.toggle('active', tab === 'spatial-analysis')
  navBtnAlignment.classList.toggle('active', tab === 'alignment-studio')
  navBtnTransformation.classList.toggle('active', tab === 'transformation-analysis')
  navBtnExport.classList.toggle('active', tab === 'export-workspace')

  viewMission.style.display = tab === 'mission-control' ? 'flex' : 'none'
  viewCatalog.style.display = tab === 'dataset-explorer' ? 'flex' : 'none'
  viewRoi.style.display = tab === 'roi-explorer' ? 'flex' : 'none'
  viewCorrespondence.style.display = tab === 'feature-correspondence' ? 'flex' : 'none'
  viewSpatial.style.display = tab === 'spatial-analysis' ? 'flex' : 'none'
  viewAlignment.style.display = tab === 'alignment-studio' ? 'flex' : 'none'
  viewTransformation.style.display = tab === 'transformation-analysis' ? 'flex' : 'none'
  viewExport.style.display = tab === 'export-workspace' ? 'flex' : 'none'

  if (tab === 'roi-explorer') {
    roiExplorer.setActivePair(state.systemStatus.activePair)
    roiExplorer.onTabActive()
  }
  if (tab === 'feature-correspondence') {
    featureWorkspace.setActivePair(state.systemStatus.activePair)
    featureWorkspace.onTabActive()
  }
  if (tab === 'spatial-analysis') {
    spatialWorkspace.setActivePair(state.systemStatus.activePair)
    spatialWorkspace.onTabActive()
  }
  if (tab === 'alignment-studio') {
    alignmentStudio.setActivePair(state.systemStatus.activePair)
  }
  if (tab === 'transformation-analysis') {
    transformationAnalysis.setActivePair(state.systemStatus.activePair)
  }
  if (tab === 'export-workspace') {
    exportWorkspace.setPairId(state.systemStatus.activePair)
  }
}

navBtnMission.addEventListener('click', () => switchTab('mission-control'))
navBtnCatalog.addEventListener('click', () => switchTab('dataset-explorer'))
navBtnRoi.addEventListener('click', () => switchTab('roi-explorer'))
navBtnCorrespondence.addEventListener('click', () => switchTab('feature-correspondence'))
navBtnSpatial.addEventListener('click', () => switchTab('spatial-analysis'))
navBtnAlignment.addEventListener('click', () => switchTab('alignment-studio'))
navBtnTransformation.addEventListener('click', () => switchTab('transformation-analysis'))
navBtnExport.addEventListener('click', () => switchTab('export-workspace'))

// Mount Elements
const headerMount = document.querySelector<HTMLDivElement>('#header-mount')!
const lunarMount = document.querySelector<HTMLDivElement>('#lunar-canvas-mount')!
const datasetMount = document.querySelector<HTMLDivElement>('#dataset-card-mount')!
const pipelineMount = document.querySelector<HTMLDivElement>('#pipeline-mount')!
const statisticsMount = document.querySelector<HTMLDivElement>('#statistics-mount')!
const consoleBody = document.querySelector<HTMLDivElement>('#console-body')!
const explorerMount = document.querySelector<HTMLDivElement>('#dataset-explorer-mount')!

// 1. Initialize Lunar Hero Visualization
const lunarHero = new LunarHero(lunarMount)
lunarMount.appendChild(lunarHero.getCanvas())

// Update HUD coordinates at 10Hz
setInterval(() => {
  const tel = lunarHero.getTelemetry()
  const latEl = document.querySelector('#hud-sc-lat')
  const lonEl = document.querySelector('#hud-sc-lon')
  const altEl = document.querySelector('#hud-sc-alt')
  if (latEl) latEl.textContent = tel.scLat
  if (lonEl) lonEl.textContent = tel.scLon
  if (altEl) altEl.textContent = tel.altitude
}, 100)

// Hero HUD Controls
const btnRotate = document.querySelector<HTMLButtonElement>('#btn-toggle-rotate')
const btnGrid = document.querySelector<HTMLButtonElement>('#btn-toggle-grid')
const btnOrbit = document.querySelector<HTMLButtonElement>('#btn-toggle-orbit')
const btnFootprint = document.querySelector<HTMLButtonElement>('#btn-toggle-footprint')
const btnReset = document.querySelector<HTMLButtonElement>('#btn-reset-view')

btnRotate?.addEventListener('click', () => {
  const active = lunarHero.toggleAutoRotate()
  btnRotate.classList.toggle('active', active)
})
btnGrid?.addEventListener('click', () => {
  const active = lunarHero.toggleGrid()
  btnGrid.classList.toggle('active', active)
})
btnOrbit?.addEventListener('click', () => {
  const active = lunarHero.toggleOrbit()
  btnOrbit.classList.toggle('active', active)
})
btnFootprint?.addEventListener('click', () => {
  const active = lunarHero.toggleFootprint()
  btnFootprint.classList.toggle('active', active)
})
btnReset?.addEventListener('click', () => {
  lunarHero.resetView()
})

// 2. Initialize Stage Modal with links to ROI, Feature Correspondence, Spatial, Alignment Studio, Transformation Analysis, & Export workspaces
const stageModal = new StageModal(
  () => switchTab('roi-explorer'),
  () => switchTab('feature-correspondence'),
  () => switchTab('spatial-analysis'),
  () => switchTab('alignment-studio'),
  () => switchTab('transformation-analysis'),
  () => switchTab('export-workspace')
)

// 3. Initialize Pipeline Section
const pipelineSection = new PipelineSection(pipelineMount, (stage: StageInfo) => {
  stageModal.open(stage)
})

// 4. Initialize Launch Controller
const launchController = new LaunchController({
  onProgress: (step, prog, msg) => {
    state.systemStatus.processingStatus = 'PROCESSING'
    const stepNames = [
      'DATASET INGESTION',
      'ROI BOUNDING',
      'PREPROCESSING',
      'FEATURE MATCHING',
      'SPATIAL ANALYSIS',
      'ALIGNMENT & RANSAC',
      'TRANSFORMATION',
      'EXPORT'
    ]
    state.systemStatus.currentStage = `STEP ${step}/8: ${stepNames[step - 1] || 'PROCESSING'}`
    header.updateStatus(state.systemStatus)
    datasetCard.update(state.selectedPair, state.systemStatus, state.pairs)
    pipelineSection.updateStageProgress(step, prog, msg)
  },
  onComplete: (metrics, artifacts) => {
    state.isProcessing = false
    state.metrics = metrics
    state.systemStatus.processingStatus = 'COMPLETED'
    state.systemStatus.currentStage = 'REGISTRATION COMPLETE'

    header.updateStatus(state.systemStatus)
    datasetCard.update(state.selectedPair, state.systemStatus, state.pairs)
    statisticsGrid.update(state.metrics, false)
    pipelineSection.markAllCompleted()

    launchController.logToConsole(`Artifacts ready: ${Object.keys(artifacts).join(', ')}`)
  },
  onError: (err) => {
    state.isProcessing = false
    state.systemStatus.processingStatus = 'ERROR'
    state.systemStatus.currentStage = `FAILED: ${err}`
    header.updateStatus(state.systemStatus)
    datasetCard.update(state.selectedPair, state.systemStatus, state.pairs)
    statisticsGrid.update(state.metrics, false)
  }
})
launchController.setConsoleElement(consoleBody)

// 5. Initialize Statistics Grid (starts with '—' as required)
const statisticsGrid = new StatisticsGrid(
  statisticsMount,
  state.metrics,
  state.isProcessing,
  () => {
    triggerLaunch()
  }
)

// 6. Initialize Dataset Card with Catalog Jump button
const datasetCard = new DatasetCard(
  datasetMount,
  state.selectedPair,
  state.systemStatus,
  state.pairs,
  (pairId) => {
    selectPair(pairId)
  },
  () => {
    switchTab('dataset-explorer')
  }
)

// 7. Initialize Header
const header = new Header(
  headerMount,
  state.systemStatus,
  state.pairs,
  (pairId) => {
    selectPair(pairId)
  }
)

// 8. Initialize Lunar Dataset Explorer (Phase 3)
new DatasetExplorer(explorerMount, (dataset: DatasetItem) => {
  // Handle dataset selected for pipeline execution
  state.systemStatus.activePair = dataset.product_id
  state.systemStatus.mission = dataset.mission
  launchController.logToConsole(`Selected dataset from catalog: [${dataset.product_id}] ${dataset.title} (${dataset.instrument})`)

  header.updateStatus(state.systemStatus)
  datasetCard.update(
    {
      id: dataset.product_id,
      has_source: true,
      has_reference: true,
      source_files: [dataset.product_id],
      reference_files: ['lro_wac_ortho.tif'],
    },
    state.systemStatus,
    state.pairs
  )

  // Switch back to mission control to prepare registration
  switchTab('mission-control')
})

// Configured ROI State from ROI Explorer
let configuredRoi: {
  roi_src: [number, number, number, number]
  roi_ref: [number, number, number, number]
} = {
  roi_src: [0, 6000, 0, 4000],
  roi_ref: [35000, 41000, 60000, 64000],
}

// 9. Initialize Scientific ROI Explorer (Phase 4)
const roiMount = document.querySelector<HTMLDivElement>('#roi-explorer-mount')!
const roiExplorer = new RoiExplorer(roiMount, state.systemStatus.activePair, (coords) => {
  configuredRoi.roi_src = [
    coords.src_line_start,
    coords.src_line_end,
    coords.src_sample_start,
    coords.src_sample_end,
  ]
  configuredRoi.roi_ref = [
    coords.ref_y0,
    coords.ref_y1,
    coords.ref_x0,
    coords.ref_x1,
  ]
  launchController.logToConsole(`[ROI CONFIGURED] Applied coordinates: Source [${coords.src_line_start}..${coords.src_line_end}, ${coords.src_sample_start}..${coords.src_sample_end}] | Reference [${coords.ref_y0}..${coords.ref_y1}, ${coords.ref_x0}..${coords.ref_x1}]`)
})

// 10. Initialize Feature Correspondence Workspace (Phase 6)
const wsMount = document.querySelector<HTMLDivElement>('#feature-workspace-mount')!
const featureWorkspace = new FeatureWorkspace(wsMount, state.systemStatus.activePair)

// 11. Initialize Spatial Grid & Inlier Density Workspace (Phase 7)
const spMount = document.querySelector<HTMLDivElement>('#spatial-workspace-mount')!
const spatialWorkspace = new SpatialWorkspace(spMount, state.systemStatus.activePair)

// 12. Initialize Interactive Scientific Alignment Studio (Phase 8)
const alignMount = document.querySelector<HTMLDivElement>('#alignment-studio-mount')!
const alignmentStudio = new AlignmentStudio(alignMount, state.systemStatus.activePair)

// 13. Initialize Scientific Transformation Analysis (Phase 9)
const taMount = document.querySelector<HTMLDivElement>('#transformation-analysis-mount')!
const transformationAnalysis = new TransformationAnalysis(taMount, state.systemStatus.activePair)

// 14. Initialize Export & Artifacts Workspace (Phase 10)
const exportMount = document.querySelector<HTMLDivElement>('#export-workspace-mount')!
const exportWorkspace = new ExportWorkspace(exportMount, state.systemStatus.activePair)

function selectPair(pairId: string) {
  state.systemStatus.activePair = pairId
  const match = state.pairs.find(p => p.id === pairId)
  state.selectedPair = match || null
  header.updateStatus(state.systemStatus)
  datasetCard.update(state.selectedPair, state.systemStatus, state.pairs)
  roiExplorer.setActivePair(pairId)
  featureWorkspace.setActivePair(pairId)
  spatialWorkspace.setActivePair(pairId)
  alignmentStudio.setActivePair(pairId)
  transformationAnalysis.setActivePair(pairId)
  exportWorkspace.setPairId(pairId)
  launchController.logToConsole(`Active pair changed to '${pairId}'`)
}

function triggerLaunch() {
  if (state.isProcessing) return
  state.isProcessing = true
  state.systemStatus.processingStatus = 'PROCESSING'
  state.systemStatus.currentStage = 'STARTING PIPELINE...'

  header.updateStatus(state.systemStatus)
  datasetCard.update(state.selectedPair, state.systemStatus, state.pairs)
  statisticsGrid.update(state.metrics, true)

  const config: PipelineConfig = {
    pair_id: state.systemStatus.activePair,
    roi_src: configuredRoi.roi_src,
    roi_ref: configuredRoi.roi_ref,
    transform_type: 'homography',
    nfeatures: 15000,
    ratio_thresh: 0.75,
    grid_size: 8,
    ransac_thresh: 3.0,
    do_subpixel: true,
  }

  launchController.launch(config)
}

// Background poll & live data fetching
async function initSystem() {
  const isOnline = await checkBackendHealth()
  state.systemStatus.backendOnline = isOnline
  launchController.logToConsole(`Backend health status: ${isOnline ? 'ONLINE (FastAPI 2.0)' : 'STANDALONE (Simulation Active)'}`)

  const pairs = await fetchAvailablePairs()
  state.pairs = pairs
  if (pairs.length > 0) {
    state.selectedPair = pairs[0]
    state.systemStatus.activePair = pairs[0].id
  }

  header.updateStatus(state.systemStatus)
  header.updatePairs(state.pairs)
  datasetCard.update(state.selectedPair, state.systemStatus, state.pairs)
}

initSystem()
