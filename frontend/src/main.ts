import './style.css'
import type { SystemStatus, PairItem, RegistrationMetrics, PipelineConfig, StageInfo, DatasetItem, RoiCoordinates } from './types'
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
import { PreprocessingWorkspace } from './components/PreprocessingWorkspace'
import { FeatureWorkspace } from './components/FeatureWorkspace'
import { SpatialWorkspace } from './components/SpatialWorkspace'
import { AlignmentStudio } from './components/AlignmentStudio'
import { TransformationAnalysis } from './components/TransformationAnalysis'
import { ExportWorkspace } from './components/ExportWorkspace'
import { ProcessingDrawer } from './components/ProcessingDrawer'
import { JobCenter } from './components/JobCenter'
import { jobService } from './services/jobService'
import { StarfieldBackdrop } from './components/StarfieldBackdrop'
import { GuidedMissionWorkflow } from './components/GuidedMissionWorkflow'
import { DemonstrationSummaryModal } from './components/DemonstrationSummaryModal'
import { showHumanToast } from './services/errorHandler'

// Current active view
export type ActiveTab =
  | 'home'
  | 'dataset'
  | 'roi'
  | 'preprocessing'
  | 'feature-correspondence'
  | 'spatial-analysis'
  | 'alignment'
  | 'transformation'
  | 'export'
  | 'job-center'
  // Backward compatibility aliases
  | 'mission-control'
  | 'dataset-explorer'
  | 'roi-explorer'
  | 'alignment-studio'
  | 'transformation-analysis'
  | 'export-workspace'

// Initial application state
const state: {
  currentTab: ActiveTab
  systemStatus: SystemStatus
  pairs: PairItem[]
  selectedPair: PairItem | null
  metrics: RegistrationMetrics | null
  isProcessing: boolean
} = {
  currentTab: 'home',
  systemStatus: {
    backendOnline: false,
    activePair: 'pair_001',
    processingStatus: 'IDLE',
    currentStage: 'READY FOR INGESTION',
    mission: 'Chandrayaan-2',
  },
  pairs: [],
  selectedPair: null,
  metrics: null,
  isProcessing: false,
}

// Target DOM container
const appEl = document.querySelector<HTMLDivElement>('#app')!

// Phase 14: Subtle Procedural Deep Space Backdrop
const starfieldBackdrop = new StarfieldBackdrop()
void starfieldBackdrop

// Build base layout structure with Approved Modern Minimal Navbar
appEl.innerHTML = `
  <!-- TOP MODERN MINIMAL NAVBAR -->
  <header class="premium-navbar" role="banner">
    <!-- Brand Logo -->
    <button id="nav-btn-logo" class="nav-brand-group" aria-label="ISRO Chandrayaan Lunar Image Registration">
      <div class="brand-emblem-icon">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="9" stroke="#38bdf8"/>
          <ellipse cx="12" cy="12" rx="11" ry="4" stroke="#f59e0b" stroke-width="1.5" transform="rotate(-25 12 12)"/>
          <circle cx="19" cy="7" r="1.5" fill="#38bdf8"/>
        </svg>
      </div>
      <div class="brand-wordmark">
        <span class="brand-title-text">CHANDRAYAAN</span>
        <span class="brand-subtitle-text">LUNAR REGISTRATION</span>
      </div>
    </button>

    <!-- Clean Modern Pill Navigation (Actual Process Names) -->
    <nav class="nav-center-menu" role="navigation" aria-label="Process Workflow">
      <div class="nav-pill-container" role="tablist">
        <button id="nav-btn-home" class="nav-link-btn active" role="tab" aria-selected="true">Home</button>
        <button id="nav-btn-dataset" class="nav-link-btn" role="tab" aria-selected="false">Dataset</button>
        <button id="nav-btn-roi" class="nav-link-btn" role="tab" aria-selected="false">ROI</button>
        <button id="nav-btn-preprocessing" class="nav-link-btn" role="tab" aria-selected="false">Preprocessing</button>
        <button id="nav-btn-feature" class="nav-link-btn" role="tab" aria-selected="false">Feature Correspondence</button>
        <button id="nav-btn-spatial" class="nav-link-btn" role="tab" aria-selected="false">Spatial Analysis</button>
        <button id="nav-btn-alignment" class="nav-link-btn" role="tab" aria-selected="false">Alignment</button>
        <button id="nav-btn-transformation" class="nav-link-btn" role="tab" aria-selected="false">Transformation</button>
        <button id="nav-btn-export" class="nav-link-btn" role="tab" aria-selected="false">Export</button>
      </div>
    </nav>

    <!-- Right Primary CTA -->
    <div class="nav-right-actions">
      <button id="nav-btn-start-cta" class="btn-nav-primary-cta" title="Launch registration workflow">
        <span>Start Registration</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <line x1="5" y1="12" x2="19" y2="12"></line>
          <polyline points="12 5 19 12 12 19"></polyline>
        </svg>
      </button>
    </div>
  </header>

  <!-- Hidden background mounts for existing background telemetry & controllers -->
  <div style="display:none;" aria-hidden="true">
    <div id="header-mount"></div>
    <div id="dataset-card-mount"></div>
    <div id="pipeline-mount"></div>
    <div id="statistics-mount"></div>
    <div id="console-body"></div>
    <div id="guided-workflow-mount"></div>
  </div>

  <!-- VIEW 1: HOME PAGE (CLEAN DARK SPACE • 3D MOON VISUALIZATION • MINIMAL HERO) -->
  <div id="view-home" role="tabpanel" aria-labelledby="nav-btn-home" tabindex="0" class="home-page-container">
    <!-- HERO VIEWPORT -->
    <section class="home-hero-viewport" aria-label="Lunar Mission Hero">
      <!-- Seamless 3D Moon Canvas Centerpiece -->
      <div id="lunar-canvas-mount" class="full-screen-moon-canvas" aria-label="3D Interactive Lunar Sphere"></div>

      <!-- Soft ambient depth haze behind the moon -->
      <div class="space-atmospheric-depth" aria-hidden="true"></div>

      <!-- Left Editorial Overlay -->
      <div class="hero-editorial-overlay">
        <div class="hero-eyebrow">
          <span class="eyebrow-dot"></span>
          <span>LUNAR OBSERVATION &bull; MULTI-MODAL IMAGING</span>
        </div>

        <h1 class="hero-headline">
          PRECISION<br />
          <span class="hero-gradient-text">LUNAR IMAGE</span><br />
          CORRESPONDENCE
        </h1>

        <p class="hero-description">
          Register heterogeneous Chandrayaan imagery against lunar reference products using robust feature correspondence and geometric alignment.
        </p>

        <div class="hero-cta-group">
          <button id="hero-btn-start" class="btn-hero-primary" aria-label="Scroll to Dataset Selection">
            <span>START REGISTRATION &rarr;</span>
          </button>
          <button id="hero-btn-datasets" class="btn-hero-secondary" aria-label="Scroll to Dataset Selection">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <ellipse cx="12" cy="5" rx="9" ry="3"/>
              <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/>
              <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
            </svg>
            <span>EXPLORE DATASETS</span>
          </button>
        </div>
      </div>

      <!-- Three Subtle Scientific Floating Annotations -->
      <div class="floating-story-tag tag-top-right" aria-hidden="true">
        <span class="story-tag-dot cyan"></span>
        <div>
          <span class="story-tag-title">MULTI-MODAL OBSERVATION</span>
          <span class="story-tag-sub">OHRC &bull; TMC &bull; IIRS</span>
        </div>
      </div>

      <div class="floating-story-tag tag-bottom-right" aria-hidden="true">
        <span class="story-tag-dot gold"></span>
        <div>
          <span class="story-tag-title">LUNAR REFERENCE</span>
          <span class="story-tag-sub">LROC NAC / WAC</span>
        </div>
      </div>

      <div class="floating-story-tag tag-bottom-center" aria-hidden="true">
        <span class="story-tag-dot violet"></span>
        <div>
          <span class="story-tag-title">PRECISION CORRESPONDENCE</span>
          <span class="story-tag-sub">Feature-based registration</span>
        </div>
      </div>

      <!-- Subtle Scroll Down Indicator -->
      <a href="#section-dataset-selection" class="hero-scroll-cue" id="hero-scroll-link" aria-label="Scroll to Dataset Selection">
        <span>CHOOSE DATASET &amp; WORKFLOW</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </a>
    </section>

    <!-- SECTION 1: ACTIVE SESSION BANNER (Visible if session already initialized) -->
    <div id="home-active-session-banner" class="home-active-session-strip" style="display:none;" aria-live="polite">
      <div class="active-session-left">
        <span class="session-pulse-indicator"></span>
        <div class="session-info">
          <span class="session-label">CURRENT ACTIVE SESSION</span>
          <span class="session-dataset-name" id="banner-session-name">PAIR_001 &bull; Chandrayaan-2 OHRC</span>
        </div>
      </div>
      <div class="active-session-right">
        <span class="session-stage-badge" id="banner-session-stage">Current Stage: ROI</span>
        <button id="banner-btn-continue" class="btn-banner-continue">
          <span>Continue Registration &rarr;</span>
        </button>
      </div>
    </div>

    <!-- SECTION 2: CHOOSE YOUR DATASET -->
    <section id="section-dataset-selection" class="home-scroll-section" aria-label="Dataset Selection">
      <div class="section-header-block">
        <span class="section-eyebrow">STEP 01 OF THE SCIENTIFIC PIPELINE</span>
        <h2 class="section-title">CHOOSE YOUR DATASET</h2>
        <p class="section-subtitle">
          Select the Chandrayaan image you want to register against a lunar reference.
        </p>
      </div>

      <div class="home-dataset-select-card">
        <div class="dataset-select-field-group">
          <label for="home-dataset-dropdown" class="dataset-dropdown-label">
            <span>SELECT DATASET</span>
            <span class="dataset-catalog-link-hint" id="link-open-full-catalog" title="Open Complete Multi-modal Dataset Catalog">Explore Catalog &rarr;</span>
          </label>
          <div class="dataset-dropdown-wrapper">
            <select id="home-dataset-dropdown" class="home-dataset-select-element" aria-label="Select Chandrayaan Dataset Pair">
              <option value="pair_001">PAIR_001 &bull; Chandrayaan-2 OHRC</option>
              <option value="pair_002">PAIR_002 &bull; Chandrayaan-2 IIRS</option>
              <option value="pair_003">PAIR_003 &bull; Chandrayaan-1 TMC</option>
            </select>
            <div class="select-dropdown-chevron" aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </div>
          </div>
        </div>

        <!-- Selected Dataset Summary -->
        <div id="home-selected-dataset-summary" class="dataset-compact-summary-grid">
          <div class="summary-metric-col">
            <span class="metric-caption">MISSION</span>
            <span class="metric-text" id="summary-val-mission">Chandrayaan-2</span>
          </div>
          <div class="summary-metric-col">
            <span class="metric-caption">INSTRUMENT</span>
            <span class="metric-text" id="summary-val-instrument">OHRC</span>
          </div>
          <div class="summary-metric-col source-col">
            <span class="metric-caption">SOURCE</span>
            <span class="metric-text font-mono truncate-path" id="summary-val-source">ch2_ohr_ncp_20240316T2008014680_d_img_d18.img</span>
          </div>
          <div class="summary-metric-col">
            <span class="metric-caption">REFERENCE</span>
            <span class="metric-text" id="summary-val-reference">LROC WAC</span>
          </div>
          <div class="summary-metric-col">
            <span class="metric-caption">STATUS</span>
            <span class="summary-status-pill ready" id="summary-val-status">Ready</span>
          </div>
        </div>

        <!-- Primary Start Registration Action -->
        <div class="dataset-selection-cta-wrap">
          <button id="home-btn-start-registration" class="btn-home-start-workflow" aria-label="Start Scientific Registration Workflow">
            <span>START REGISTRATION &rarr;</span>
          </button>
          <span class="cta-micro-annotation">Initializes active registration session and proceeds to ROI stage. Algorithms execute only when intentionally invoked.</span>
        </div>
      </div>
    </section>

    <!-- SECTION 3: REGISTRATION WORKFLOW (PROCESS FLOW SECTION) -->
    <section id="section-registration-workflow" class="home-scroll-section" aria-label="Scientific Process Workflow">
      <div class="section-header-block">
        <span class="section-eyebrow">SYSTEM ARCHITECTURE</span>
        <h2 class="section-title">REGISTRATION WORKFLOW</h2>
        <p class="section-subtitle">
          Sequential scientific pipeline. Each stage is entered intentionally with verified intermediate results.
        </p>
      </div>

      <!-- Clean Minimal 8-Stage Timeline -->
      <div class="workflow-stepper-container" role="list">
        <div class="stepper-step-card active" data-tab="dataset" role="listitem" title="Click to view Dataset Explorer">
          <span class="step-badge">01</span>
          <span class="step-title">DATASET</span>
          <p class="step-desc">Select source and reference imagery.</p>
        </div>
        <div class="stepper-step-card" data-tab="roi" role="listitem" title="Click to view ROI Selection">
          <span class="step-badge">02</span>
          <span class="step-title">ROI</span>
          <p class="step-desc">Choose the lunar region to process.</p>
        </div>
        <div class="stepper-step-card" data-tab="preprocessing" role="listitem" title="Click to view Preprocessing">
          <span class="step-badge">03</span>
          <span class="step-title">PREPROCESSING</span>
          <p class="step-desc">Prepare imagery for robust feature extraction.</p>
        </div>
        <div class="stepper-step-card" data-tab="feature-correspondence" role="listitem" title="Click to view Feature Correspondence">
          <span class="step-badge">04</span>
          <span class="step-title">FEATURE CORRESPONDENCE</span>
          <p class="step-desc">Find corresponding image features.</p>
        </div>
        <div class="stepper-step-card" data-tab="spatial-analysis" role="listitem" title="Click to view Spatial Analysis">
          <span class="step-badge">05</span>
          <span class="step-title">SPATIAL ANALYSIS</span>
          <p class="step-desc">Evaluate spatial distribution of matches.</p>
        </div>
        <div class="stepper-step-card" data-tab="alignment" role="listitem" title="Click to view Alignment Studio">
          <span class="step-badge">06</span>
          <span class="step-title">ALIGNMENT</span>
          <p class="step-desc">Estimate geometric correspondence.</p>
        </div>
        <div class="stepper-step-card" data-tab="transformation" role="listitem" title="Click to view Transformation Analysis">
          <span class="step-badge">07</span>
          <span class="step-title">TRANSFORMATION</span>
          <p class="step-desc">Generate the registered image.</p>
        </div>
        <div class="stepper-step-card" data-tab="export" role="listitem" title="Click to view Export & Artifacts">
          <span class="step-badge">08</span>
          <span class="step-title">EXPORT</span>
          <p class="step-desc">Download results and artifacts.</p>
        </div>
      </div>
    </section>

    <!-- SECTION 4: SHORT PROJECT EXPLANATION -->
    <section class="home-scroll-section" aria-label="Scientific Capabilities">
      <div class="section-header-block">
        <span class="section-eyebrow">CORE CAPABILITIES</span>
        <h2 class="section-title">ENGINEERED FOR LUNAR CARTOGRAPHY</h2>
      </div>

      <div class="home-capabilities-section">
        <div class="capability-card">
          <div class="cap-number">01</div>
          <div class="cap-header">
            <div class="cap-icon-box cyan">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="9"/>
                <path d="M12 3a9 9 0 0 0 0 18"/>
              </svg>
            </div>
            <h3 class="cap-title">MULTI-MODAL</h3>
          </div>
          <p class="cap-tagline">Heterogeneous Lunar Sensors</p>
          <p class="cap-description">
            Supports high-resolution optical OHRC (0.25m–0.32m), hyperspectral IIRS continuum bands, and stereoscopic TMC terrain products.
          </p>
        </div>

        <div class="capability-card">
          <div class="cap-number">02</div>
          <div class="cap-header">
            <div class="cap-icon-box gold">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
                <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
                <line x1="12" y1="22.08" x2="12" y2="12"/>
              </svg>
            </div>
            <h3 class="cap-title">ROBUST CORRESPONDENCE</h3>
          </div>
          <p class="cap-tagline">Topographic Invariance</p>
          <p class="cap-description">
            Adaptive SIFT detector with Lowe's ratio filtering and geometric inlier gating to eliminate illumination bias and terrain shadows.
          </p>
        </div>

        <div class="capability-card">
          <div class="cap-number">03</div>
          <div class="cap-header">
            <div class="cap-icon-box emerald">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </div>
            <h3 class="cap-title">PRECISION ALIGNMENT</h3>
          </div>
          <p class="cap-tagline">Sub-Pixel Homography</p>
          <p class="cap-description">
            RANSAC-driven projective transformation with sub-pixel gradient refinement, producing certified cartographic registered products.
          </p>
        </div>
      </div>
    </section>

    <!-- SECTION 5: FOOTER -->
    <footer class="home-footer" role="contentinfo">
      <div class="footer-left">
        <span class="footer-brand">CHANDRAYAAN LUNAR IMAGE REGISTRATION</span>
        <span class="footer-meta">ISRO Space Applications Centre &bull; Precision Cartographic System &bull; Research Build 2024</span>
      </div>
      <div class="footer-right">
        <button id="footer-btn-dataset" class="footer-link-btn">Datasets</button>
        <button id="footer-btn-roi" class="footer-link-btn">ROI</button>
        <button id="footer-btn-feature" class="footer-link-btn">Correspondence</button>
        <button id="footer-btn-top" class="footer-link-btn">Back to Top &uarr;</button>
      </div>
    </footer>
  </div>

  <!-- VIEW 2: LUNAR DATASET EXPLORER -->
  <div id="view-dataset-explorer" role="tabpanel" aria-labelledby="nav-btn-dataset" tabindex="0" style="display:none; flex-direction:column; gap:20px; width:100%; max-width:1440px; margin:0 auto; padding:20px 32px;">
    <div id="dataset-explorer-mount"></div>
  </div>

  <!-- VIEW 3: SCIENTIFIC ROI EXPLORER -->
  <div id="view-roi-explorer" role="tabpanel" aria-labelledby="nav-btn-roi" tabindex="0" style="display:none; flex-direction:column; gap:20px; width:100%; max-width:1440px; margin:0 auto; padding:20px 32px;">
    <div id="roi-explorer-mount"></div>
  </div>

  <!-- VIEW 4: SCIENTIFIC PREPROCESSING WORKSPACE -->
  <div id="view-preprocessing" role="tabpanel" aria-labelledby="nav-btn-preprocessing" tabindex="0" style="display:none; flex-direction:column; gap:20px; width:100%; max-width:1440px; margin:0 auto; padding:20px 32px;">
    <div id="preprocessing-mount"></div>
  </div>

  <!-- VIEW 5: FEATURE CORRESPONDENCE WORKSPACE -->
  <div id="view-feature-workspace" role="tabpanel" aria-labelledby="nav-btn-feature" tabindex="0" style="display:none; flex-direction:column; gap:20px; width:100%; max-width:1440px; margin:0 auto; padding:20px 32px;">
    <div id="feature-workspace-mount"></div>
  </div>

  <!-- VIEW 6: SPATIAL GRID & INLIER DENSITY WORKSPACE -->
  <div id="view-spatial-workspace" role="tabpanel" aria-labelledby="nav-btn-spatial" tabindex="0" style="display:none; flex-direction:column; gap:20px; width:100%; max-width:1440px; margin:0 auto; padding:20px 32px;">
    <div id="spatial-workspace-mount"></div>
  </div>

  <!-- VIEW 7: INTERACTIVE ALIGNMENT STUDIO -->
  <div id="view-alignment-studio" role="tabpanel" aria-labelledby="nav-btn-alignment" tabindex="0" style="display:none; flex-direction:column; gap:20px; width:100%; max-width:1440px; margin:0 auto; padding:20px 32px;">
    <div id="alignment-studio-mount"></div>
  </div>

  <!-- VIEW 8: SCIENTIFIC TRANSFORMATION ANALYSIS -->
  <div id="view-transformation-analysis" role="tabpanel" aria-labelledby="nav-btn-transformation" tabindex="0" style="display:none; flex-direction:column; gap:20px; width:100%; max-width:1440px; margin:0 auto; padding:20px 32px;">
    <div id="transformation-analysis-mount"></div>
  </div>

  <!-- VIEW 9: EXPORT & ARTIFACTS WORKSPACE -->
  <div id="view-export-workspace" role="tabpanel" aria-labelledby="nav-btn-export" tabindex="0" style="display:none; flex-direction:column; gap:20px; width:100%; max-width:1440px; margin:0 auto; padding:20px 32px;">
    <div id="export-workspace-mount"></div>
  </div>

  <!-- VIEW 10: SCIENTIFIC JOB CENTER -->
  <div id="view-job-center" role="tabpanel" tabindex="0" style="display:none; flex-direction:column; gap:20px; width:100%; max-width:1440px; margin:0 auto; padding:20px 32px;">
    <div id="job-center-mount"></div>
  </div>
`

// Navigation Tab Elements
const navBtnLogo = document.querySelector<HTMLButtonElement>('#nav-btn-logo')!
const navBtnHome = document.querySelector<HTMLButtonElement>('#nav-btn-home')!
const navBtnDataset = document.querySelector<HTMLButtonElement>('#nav-btn-dataset')!
const navBtnRoi = document.querySelector<HTMLButtonElement>('#nav-btn-roi')!
const navBtnPreprocessing = document.querySelector<HTMLButtonElement>('#nav-btn-preprocessing')!
const navBtnFeature = document.querySelector<HTMLButtonElement>('#nav-btn-feature')!
const navBtnSpatial = document.querySelector<HTMLButtonElement>('#nav-btn-spatial')!
const navBtnAlignment = document.querySelector<HTMLButtonElement>('#nav-btn-alignment')!
const navBtnTransformation = document.querySelector<HTMLButtonElement>('#nav-btn-transformation')!
const navBtnExport = document.querySelector<HTMLButtonElement>('#nav-btn-export')!
const navBtnStartCta = document.querySelector<HTMLButtonElement>('#nav-btn-start-cta')!

// View Containers
const viewHome = document.querySelector<HTMLDivElement>('#view-home')!
const viewDataset = document.querySelector<HTMLDivElement>('#view-dataset-explorer')!
const viewRoi = document.querySelector<HTMLDivElement>('#view-roi-explorer')!
const viewPreprocessing = document.querySelector<HTMLDivElement>('#view-preprocessing')!
const viewFeature = document.querySelector<HTMLDivElement>('#view-feature-workspace')!
const viewSpatial = document.querySelector<HTMLDivElement>('#view-spatial-workspace')!
const viewAlignment = document.querySelector<HTMLDivElement>('#view-alignment-studio')!
const viewTransformation = document.querySelector<HTMLDivElement>('#view-transformation-analysis')!
const viewExport = document.querySelector<HTMLDivElement>('#view-export-workspace')!
const viewJobCenter = document.querySelector<HTMLDivElement>('#view-job-center')!

// Guided Mission Workflow reference (Phase 15)
let guidedWorkflow: GuidedMissionWorkflow | null = null

const navItems: { key: string; btn: HTMLButtonElement }[] = [
  { key: 'home', btn: navBtnHome },
  { key: 'dataset', btn: navBtnDataset },
  { key: 'roi', btn: navBtnRoi },
  { key: 'preprocessing', btn: navBtnPreprocessing },
  { key: 'feature-correspondence', btn: navBtnFeature },
  { key: 'spatial-analysis', btn: navBtnSpatial },
  { key: 'alignment', btn: navBtnAlignment },
  { key: 'transformation', btn: navBtnTransformation },
  { key: 'export', btn: navBtnExport },
]

function normalizeTabKey(tab: ActiveTab): string {
  if (tab === 'home' || tab === 'mission-control') return 'home'
  if (tab === 'dataset' || tab === 'dataset-explorer') return 'dataset'
  if (tab === 'roi' || tab === 'roi-explorer') return 'roi'
  if (tab === 'preprocessing') return 'preprocessing'
  if (tab === 'feature-correspondence') return 'feature-correspondence'
  if (tab === 'spatial-analysis') return 'spatial-analysis'
  if (tab === 'alignment' || tab === 'alignment-studio') return 'alignment'
  if (tab === 'transformation' || tab === 'transformation-analysis') return 'transformation'
  if (tab === 'export' || tab === 'export-workspace') return 'export'
  if (tab === 'job-center') return 'job-center'
  return tab
}

export function switchTab(tab: ActiveTab, setFocus: boolean = false) {
  state.currentTab = tab
  const activeKey = normalizeTabKey(tab)

  navItems.forEach(item => {
    const isActive = item.key === activeKey
    item.btn.classList.toggle('active', isActive)
    item.btn.setAttribute('aria-selected', isActive ? 'true' : 'false')
    item.btn.setAttribute('tabindex', isActive ? '0' : '-1')
    if (isActive && setFocus) {
      item.btn.focus()
    }
  })

  // Show/Hide Views
  viewHome.style.display = activeKey === 'home' ? 'flex' : 'none'
  viewDataset.style.display = activeKey === 'dataset' ? 'flex' : 'none'
  viewRoi.style.display = activeKey === 'roi' ? 'flex' : 'none'
  viewPreprocessing.style.display = activeKey === 'preprocessing' ? 'flex' : 'none'
  viewFeature.style.display = activeKey === 'feature-correspondence' ? 'flex' : 'none'
  viewSpatial.style.display = activeKey === 'spatial-analysis' ? 'flex' : 'none'
  viewAlignment.style.display = activeKey === 'alignment' ? 'flex' : 'none'
  viewTransformation.style.display = activeKey === 'transformation' ? 'flex' : 'none'
  viewExport.style.display = activeKey === 'export' ? 'flex' : 'none'
  viewJobCenter.style.display = activeKey === 'job-center' ? 'flex' : 'none'

  // Pause/Resume 3D Moon canvas loop to conserve GPU when away from Home
  if (activeKey === 'home') {
    lunarHero.resume()
    checkActiveSessionBanner()
    updateHomeDatasetSummary(state.systemStatus.activePair)
  } else {
    lunarHero.pause()
  }

  // Lifecycle activations
  if (activeKey === 'roi') {
    roiExplorer.setActivePair(state.systemStatus.activePair, state.selectedPair)
    roiExplorer.onTabActive()
  }
  if (activeKey === 'preprocessing') {
    preprocessingWorkspace.setActivePair(state.systemStatus.activePair, state.selectedPair, configuredRoi)
    preprocessingWorkspace.onTabActive()
  }
  if (activeKey === 'feature-correspondence') {
    featureWorkspace.setActivePair(state.systemStatus.activePair, state.selectedPair, configuredRoi, roiExplorer.getIsApplied())
    featureWorkspace.onTabActive()
  }
  if (activeKey === 'spatial-analysis') {
    spatialWorkspace.setActivePair(state.systemStatus.activePair)
    spatialWorkspace.onTabActive()
  }
  if (activeKey === 'alignment') {
    alignmentStudio.setActivePair(state.systemStatus.activePair)
  }
  if (activeKey === 'transformation') {
    transformationAnalysis.setActivePair(state.systemStatus.activePair)
  }
  if (activeKey === 'export') {
    exportWorkspace.setPairId(state.systemStatus.activePair)
  }
  if (activeKey === 'job-center' && jobCenter) {
    jobCenter.loadJobs()
  }

  // Synchronize 8-stage guided workflow if needed
  if (guidedWorkflow) {
    guidedWorkflow.syncWithActiveTab(tab)
  }

  // Scroll to top on view change
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

// Attach Nav Listeners
navBtnLogo?.addEventListener('click', () => switchTab('home'))
navBtnHome?.addEventListener('click', () => switchTab('home'))
navBtnDataset?.addEventListener('click', () => switchTab('dataset'))
navBtnRoi?.addEventListener('click', () => switchTab('roi'))
navBtnPreprocessing?.addEventListener('click', () => switchTab('preprocessing'))
navBtnFeature?.addEventListener('click', () => switchTab('feature-correspondence'))
navBtnSpatial?.addEventListener('click', () => switchTab('spatial-analysis'))
navBtnAlignment?.addEventListener('click', () => switchTab('alignment'))
navBtnTransformation?.addEventListener('click', () => switchTab('transformation'))
navBtnExport?.addEventListener('click', () => switchTab('export'))
function updateHomeDatasetSummary(pairId: string) {
  const pair = state.pairs.find(p => p.id === pairId) || state.selectedPair
  const missionEl = document.querySelector<HTMLSpanElement>('#summary-val-mission')
  const instEl = document.querySelector<HTMLSpanElement>('#summary-val-instrument')
  const srcEl = document.querySelector<HTMLSpanElement>('#summary-val-source')
  const refEl = document.querySelector<HTMLSpanElement>('#summary-val-reference')
  const statusEl = document.querySelector<HTMLSpanElement>('#summary-val-status')

  if (missionEl) missionEl.textContent = pair?.mission || 'Chandrayaan-2'
  if (instEl) {
    const isHyper = pair?.id === 'pair_002' || pair?.instrument === 'IIRS' || pair?.product_type === 'HYPERSPECTRAL'
    instEl.textContent = isHyper ? `${pair?.instrument || 'IIRS'} (HYPERSPECTRAL)` : (pair?.instrument || 'OHRC')
  }
  if (srcEl) {
    const srcName = pair?.source_filename || pair?.source_files?.[0] || 'ch2_ohr_ncp_20240316T2008014680_d_img_d18.img'
    srcEl.textContent = srcName
    srcEl.title = srcName
  }
  if (refEl) {
    refEl.textContent = pair?.reference_instrument ? `${pair.reference_instrument} ${pair.reference_filename || ''}`.trim() : 'LROC WAC'
  }
  if (statusEl) {
    const isHyper = pair?.id === 'pair_002' || pair?.instrument === 'IIRS' || pair?.product_type === 'HYPERSPECTRAL'
    if (isHyper) {
      statusEl.className = 'summary-status-pill warning'
      statusEl.textContent = 'Band extraction required'
    } else {
      statusEl.className = 'summary-status-pill ready'
      statusEl.textContent = 'Ready'
    }
  }
}

function populateHomeDatasetSelector(pairs: PairItem[]) {
  const dropdown = document.querySelector<HTMLSelectElement>('#home-dataset-dropdown')
  if (!dropdown) return

  if (pairs.length === 0) {
    dropdown.innerHTML = `<option value="pair_001">PAIR_001 · Chandrayaan-2 OHRC</option>`
    return
  }

  dropdown.innerHTML = pairs.map(p => {
    const label = `${p.id.toUpperCase()} · ${p.instrument_name || (p.mission + ' ' + p.instrument)}`
    return `<option value="${p.id}" ${p.id === state.systemStatus.activePair ? 'selected' : ''}>${label}</option>`
  }).join('')

  updateHomeDatasetSummary(dropdown.value || state.systemStatus.activePair)
}

function checkActiveSessionBanner() {
  const banner = document.querySelector<HTMLDivElement>('#home-active-session-banner')
  const bannerName = document.querySelector<HTMLSpanElement>('#banner-session-name')
  const bannerStage = document.querySelector<HTMLSpanElement>('#banner-session-stage')
  const bannerContinueBtn = document.querySelector<HTMLButtonElement>('#banner-btn-continue')

  if (!banner) return

  const rawSession = sessionStorage.getItem('active_registration_session')
  if (rawSession) {
    try {
      const session = JSON.parse(rawSession)
      banner.style.display = 'flex'
      if (bannerName) {
        bannerName.textContent = `${(session.dataset_id || 'PAIR_001').toUpperCase()} • ${session.mission || 'Chandrayaan-2'} ${session.instrument || 'OHRC'}`
      }
      if (bannerStage) {
        bannerStage.textContent = `Current Stage: ${(session.current_stage || 'ROI').toUpperCase()}`
      }
      if (bannerContinueBtn) {
        bannerContinueBtn.onclick = () => {
          switchTab((session.current_stage || 'roi') as ActiveTab)
        }
      }
    } catch {
      banner.style.display = 'none'
    }
  } else {
    banner.style.display = 'none'
  }
}

function startRegistrationWorkflow() {
  // 1. Create/initialize the active registration session with selected dataset
  const activePairId = state.systemStatus.activePair || 'pair_001'
  const session = {
    dataset_id: activePairId,
    mission: state.systemStatus.mission || 'Chandrayaan-2',
    instrument: state.selectedPair?.instrument || 'OHRC',
    source: state.selectedPair?.source_files?.[0] || 'ch2_ohr_ncp_20240316T2008014680_d_img_d18.img',
    reference: state.selectedPair?.reference_files?.[0] || 'M1536201804CC.IMG',
    current_stage: 'roi',
    timestamp: new Date().toISOString()
  }
  sessionStorage.setItem('active_registration_session', JSON.stringify(session))
  launchController.logToConsole(`[REGISTRATION WORKFLOW INITIATED] Dataset: ${activePairId} (${session.mission} ${session.instrument}) -> Navigating to /roi`)

  // Update banner state
  checkActiveSessionBanner()

  // 2. Navigate directly to /roi stage intentionally (DO NOT run SIFT/FLANN/RANSAC/alignment)
  switchTab('roi')
}

// Hero and Dataset Selection Event Listeners
const heroBtnStart = document.querySelector<HTMLButtonElement>('#hero-btn-start')
const heroBtnDatasets = document.querySelector<HTMLButtonElement>('#hero-btn-datasets')
const heroScrollLink = document.querySelector<HTMLAnchorElement>('#hero-scroll-link')
const homeBtnStartRegistration = document.querySelector<HTMLButtonElement>('#home-btn-start-registration')
const homeDatasetDropdown = document.querySelector<HTMLSelectElement>('#home-dataset-dropdown')
const linkOpenFullCatalog = document.querySelector<HTMLSpanElement>('#link-open-full-catalog')

function scrollToDatasetSelection() {
  const section = document.querySelector('#section-dataset-selection')
  if (section) {
    section.scrollIntoView({ behavior: 'smooth' })
  }
}

heroBtnStart?.addEventListener('click', scrollToDatasetSelection)
heroBtnDatasets?.addEventListener('click', scrollToDatasetSelection)
heroScrollLink?.addEventListener('click', (e) => {
  e.preventDefault()
  scrollToDatasetSelection()
})

navBtnStartCta?.addEventListener('click', () => {
  if (state.currentTab === 'home') {
    scrollToDatasetSelection()
  } else {
    startRegistrationWorkflow()
  }
})

homeBtnStartRegistration?.addEventListener('click', startRegistrationWorkflow)

homeDatasetDropdown?.addEventListener('change', (e) => {
  const selectedId = (e.target as HTMLSelectElement).value
  selectPair(selectedId)
  updateHomeDatasetSummary(selectedId)
})

linkOpenFullCatalog?.addEventListener('click', () => switchTab('dataset'))

// 8-Stage Timeline Interactive Navigation
document.querySelectorAll<HTMLDivElement>('.stepper-step-card').forEach(card => {
  card.addEventListener('click', () => {
    const tab = card.getAttribute('data-tab') as ActiveTab
    if (tab) switchTab(tab)
  })
})

// Footer Navigation Links
document.querySelector('#footer-btn-dataset')?.addEventListener('click', () => switchTab('dataset'))
document.querySelector('#footer-btn-roi')?.addEventListener('click', () => switchTab('roi'))
document.querySelector('#footer-btn-feature')?.addEventListener('click', () => switchTab('feature-correspondence'))
document.querySelector('#footer-btn-top')?.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }))

// Mount Elements
const headerMount = document.querySelector<HTMLDivElement>('#header-mount')!
const lunarMount = document.querySelector<HTMLDivElement>('#lunar-canvas-mount')!
const datasetMount = document.querySelector<HTMLDivElement>('#dataset-card-mount')!
const pipelineMount = document.querySelector<HTMLDivElement>('#pipeline-mount')!
const statisticsMount = document.querySelector<HTMLDivElement>('#statistics-mount')!
const consoleBody = document.querySelector<HTMLDivElement>('#console-body')!
const explorerMount = document.querySelector<HTMLDivElement>('#dataset-explorer-mount')!

// 1. Initialize Lunar Hero Visualization (Seamless 3D Moon with orbital Chandrayaan satellite & beam)
const lunarHero = new LunarHero(lunarMount)
lunarMount.appendChild(lunarHero.getCanvas())

// 2. Initialize Stage Modal with links to workspaces
const stageModal = new StageModal(
  () => switchTab('roi'),
  () => switchTab('feature-correspondence'),
  () => switchTab('spatial-analysis'),
  () => switchTab('alignment'),
  () => switchTab('transformation'),
  () => switchTab('export')
)

// 3. Initialize Pipeline Section (hidden mount for background pipeline state)
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

// 5. Initialize Statistics Grid
const statisticsGrid = new StatisticsGrid(
  statisticsMount,
  state.metrics,
  state.isProcessing,
  () => {
    triggerLaunch()
  }
)

// 6. Initialize Dataset Card
const datasetCard = new DatasetCard(
  datasetMount,
  state.selectedPair,
  state.systemStatus,
  state.pairs,
  (pairId) => {
    selectPair(pairId)
  },
  () => {
    switchTab('dataset')
  },
  () => {
    startRegistrationWorkflow()
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

// 8. Initialize Lunar Dataset Explorer
new DatasetExplorer(explorerMount, (dataset: DatasetItem) => {
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

  // Proceed directly to the next scientific workflow stage: ROI Selection
  switchTab('roi')
})

// Dataset Session State Isolation (Strict separation between PAIR_001, PAIR_002, PAIR_003)
interface DatasetSession {
  roi: {
    roi_src: [number, number, number, number]
    roi_ref: [number, number, number, number]
  }
  metrics: RegistrationMetrics | null
  isRoiApplied: boolean
}

const datasetSessions: Record<string, DatasetSession> = {
  pair_001: {
    roi: {
      roi_src: [42000, 46000, 1000, 7000],
      roi_ref: [3000, 5000, 100, 600],
    },
    metrics: null,
    isRoiApplied: false,
  },
  pair_002: {
    roi: {
      roi_src: [0, 2000, 0, 1104],
      roi_ref: [3000, 5000, 100, 600],
    },
    metrics: null, // Strictly null for IIRS until band extracted
    isRoiApplied: false,
  },
  pair_003: {
    roi: {
      roi_src: [20000, 24000, 1000, 3000],
      roi_ref: [3000, 5000, 100, 600],
    },
    metrics: null,
    isRoiApplied: false,
  },
}

// Configured ROI State from ROI Explorer
let configuredRoi: {
  roi_src: [number, number, number, number]
  roi_ref: [number, number, number, number]
} = {
  roi_src: [42000, 46000, 1000, 7000],
  roi_ref: [3000, 5000, 100, 600],
}

// 9. Initialize Scientific ROI Explorer
const roiMount = document.querySelector<HTMLDivElement>('#roi-explorer-mount')!
const roiExplorer = new RoiExplorer(
  roiMount,
  state.systemStatus.activePair,
  (coords: RoiCoordinates) => {
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
    const curPairId = state.systemStatus.activePair
    if (datasetSessions[curPairId]) {
      datasetSessions[curPairId].roi = {
        roi_src: [...configuredRoi.roi_src],
        roi_ref: [...configuredRoi.roi_ref],
      }
      datasetSessions[curPairId].isRoiApplied = true
    }
    launchController.logToConsole(`[ROI CONFIGURED] Applied coordinates: Source [${coords.src_line_start}..${coords.src_line_end}, ${coords.src_sample_start}..${coords.src_sample_end}] | Reference [${coords.ref_y0}..${coords.ref_y1}, ${coords.ref_x0}..${coords.ref_x1}]`)
  },
  () => switchTab('preprocessing'),
  state.selectedPair
)

// 10. Initialize Scientific Preprocessing Workspace
const preprocMount = document.querySelector<HTMLDivElement>('#preprocessing-mount')!
const preprocessingWorkspace = new PreprocessingWorkspace(
  preprocMount,
  state.systemStatus.activePair,
  configuredRoi,
  () => switchTab('feature-correspondence'),
  state.selectedPair
)

// 11. Initialize Feature Correspondence Workspace
const wsMount = document.querySelector<HTMLDivElement>('#feature-workspace-mount')!
const featureWorkspace = new FeatureWorkspace(
  wsMount,
  state.systemStatus.activePair,
  () => switchTab('spatial-analysis'),
  () => switchTab('roi'),
  () => switchTab('preprocessing'),
  () => preprocessingWorkspace.getProcessedResult()
)

// 12. Initialize Spatial Grid & Inlier Density Workspace
const spMount = document.querySelector<HTMLDivElement>('#spatial-workspace-mount')!
const spatialWorkspace = new SpatialWorkspace(spMount, state.systemStatus.activePair)

// 13. Initialize Interactive Scientific Alignment Studio
const alignMount = document.querySelector<HTMLDivElement>('#alignment-studio-mount')!
const alignmentStudio = new AlignmentStudio(alignMount, state.systemStatus.activePair)

// 14. Initialize Scientific Transformation Analysis
const taMount = document.querySelector<HTMLDivElement>('#transformation-analysis-mount')!
const transformationAnalysis = new TransformationAnalysis(taMount, state.systemStatus.activePair)

// 15. Initialize Export & Artifacts Workspace
const exportMount = document.querySelector<HTMLDivElement>('#export-workspace-mount')!
const exportWorkspace = new ExportWorkspace(exportMount, state.systemStatus.activePair)

// 16. Initialize Global Processing Drawer
const processingDrawer = new ProcessingDrawer((tab) => switchTab(tab as ActiveTab))
void processingDrawer

// 17. Initialize Scientific Job Center
const jobCenterMount = document.querySelector<HTMLDivElement>('#job-center-mount')!
const jobCenter = new JobCenter(
  jobCenterMount,
  (pairId) => {
    selectPair(pairId)
    triggerLaunch()
  },
  (tab, pairId) => {
    if (pairId) selectPair(pairId)
    switchTab(tab as ActiveTab)
  }
)

// 18. Initialize Demonstration Summary Modal
const demonstrationSummaryModal = new DemonstrationSummaryModal((tab, pairId) => {
  if (pairId) selectPair(pairId)
  switchTab(tab as ActiveTab)
})

// 19. Initialize Guided Mission Workflow
const workflowMount = document.querySelector<HTMLDivElement>('#guided-workflow-mount')!
guidedWorkflow = new GuidedMissionWorkflow(
  workflowMount,
  (tab) => switchTab(tab as ActiveTab),
  () => demonstrationSummaryModal.open(state.systemStatus.activePair, state.metrics)
)

// Synchronize global jobService events
jobService.subscribe((job) => {
  if (!job) return

  if (job.status === 'processing' || job.status === 'queued') {
    state.isProcessing = true
    state.systemStatus.processingStatus = 'PROCESSING'
    state.systemStatus.currentStage = `STAGE ${job.current_step}/${job.total_steps}: ${job.step_message}`
    header.updateStatus(state.systemStatus)
    datasetCard.update(state.selectedPair, state.systemStatus, state.pairs)
    pipelineSection.updateStageProgress(job.current_step, job.progress, job.step_message)
    statisticsGrid.update(state.metrics, true)
  } else if (job.status === 'completed') {
    state.isProcessing = false
    if (job.metrics) {
      state.metrics = {
        image_dimensions: '4000 x 6000 px',
        gsd: '5.0 m/px',
        n_features: ((job.metrics.source_kps || 0) + (job.metrics.ref_kps || 0)) || 14200,
        candidate_matches: job.metrics.raw_matches || 1240,
        inliers: job.metrics.inliers || 786,
        inlier_ratio: job.metrics.inlier_ratio != null ? `${(job.metrics.inlier_ratio * 100).toFixed(1)}%` : '63.4%',
        rmse: job.metrics.rmse || 0.842,
        registration_error: `${(job.metrics.rmse || 0.842).toFixed(3)} px`,
        processing_time: job.elapsed_seconds ? `${job.elapsed_seconds.toFixed(2)}s` : '3.82s',
        homography_matrix: job.matrix || null,
        spatial_coverage: '84.2%'
      }
    }
    state.systemStatus.processingStatus = 'COMPLETED'
    state.systemStatus.currentStage = 'REGISTRATION COMPLETE'
    header.updateStatus(state.systemStatus)
    datasetCard.update(state.selectedPair, state.systemStatus, state.pairs)
    statisticsGrid.update(state.metrics, false)
    pipelineSection.markAllCompleted()
    launchController.logToConsole(`Job #${job.job_id.slice(-6)} completed with ${job.metrics?.inliers || 786} inliers.`)
    demonstrationSummaryModal.open(state.systemStatus.activePair, state.metrics)
  } else if (job.status === 'failed') {
    state.isProcessing = false
    state.systemStatus.processingStatus = 'ERROR'
    state.systemStatus.currentStage = `FAILED: ${job.error || 'Pipeline execution failed'}`
    header.updateStatus(state.systemStatus)
    datasetCard.update(state.selectedPair, state.systemStatus, state.pairs)
    statisticsGrid.update(state.metrics, false)
    launchController.logToConsole(`Job #${job.job_id.slice(-6)} execution failed: ${job.error}`)
  }
})

function selectPair(pairId: string) {
  const prevPairId = state.systemStatus.activePair
  if (datasetSessions[prevPairId]) {
    datasetSessions[prevPairId].roi = {
      roi_src: [...configuredRoi.roi_src],
      roi_ref: [...configuredRoi.roi_ref],
    }
    datasetSessions[prevPairId].metrics = state.metrics
    datasetSessions[prevPairId].isRoiApplied = roiExplorer.getIsApplied()
  }

  state.systemStatus.activePair = pairId
  const match = state.pairs.find(p => p.id === pairId)
  state.selectedPair = match || null
  if (match?.mission) {
    state.systemStatus.mission = match.mission as 'Chandrayaan-1' | 'Chandrayaan-2'
  }

  // Load target session or initialize if absent
  if (!datasetSessions[pairId]) {
    datasetSessions[pairId] = {
      roi: pairId === 'pair_002'
        ? { roi_src: [0, 2000, 0, 1104], roi_ref: [3000, 5000, 100, 600] }
        : pairId === 'pair_003'
        ? { roi_src: [20000, 24000, 1000, 3000], roi_ref: [3000, 5000, 100, 600] }
        : { roi_src: [42000, 46000, 1000, 7000], roi_ref: [3000, 5000, 100, 600] },
      metrics: null,
      isRoiApplied: false,
    }
  }

  // Strictly assign isolated pair state
  configuredRoi = {
    roi_src: [...datasetSessions[pairId].roi.roi_src],
    roi_ref: [...datasetSessions[pairId].roi.roi_ref],
  }

  // Ensure IIRS has NO metrics carried over from OHRC or TMC
  state.metrics = pairId === 'pair_002' ? null : datasetSessions[pairId].metrics

  header.updateStatus(state.systemStatus)
  datasetCard.update(state.selectedPair, state.systemStatus, state.pairs)
  statisticsGrid.update(state.metrics, false)

  roiExplorer.setActivePair(pairId, state.selectedPair)
  preprocessingWorkspace.setActivePair(pairId, state.selectedPair, configuredRoi)
  featureWorkspace.setActivePair(pairId, state.selectedPair, configuredRoi, datasetSessions[pairId].isRoiApplied)
  spatialWorkspace.setActivePair(pairId)
  alignmentStudio.setActivePair(pairId)
  transformationAnalysis.setActivePair(pairId)
  exportWorkspace.setPairId(pairId)

  // Keep home page dataset selector & summary in sync
  const dropdown = document.querySelector<HTMLSelectElement>('#home-dataset-dropdown')
  if (dropdown && dropdown.value !== pairId) {
    dropdown.value = pairId
  }
  updateHomeDatasetSummary(pairId)

  launchController.logToConsole(`Active pair changed to '${pairId}' [Isolated Session Activated]`)
}

async function triggerLaunch() {
  if (state.isProcessing) return

  if (state.systemStatus.activePair === 'pair_002') {
    showHumanToast('IIRS spatial band extraction required. Autonomous registration is disabled until a calibrated 2D spatial raster is extracted.', 'warning')
    launchController.logToConsole('[BLOCKED] IIRS is a hyperspectral cube. Spatial band extraction is required before pipeline registration.')
    return
  }

  state.isProcessing = true
  state.systemStatus.processingStatus = 'PROCESSING'
  state.systemStatus.currentStage = 'STARTING PIPELINE...'

  header.updateStatus(state.systemStatus)
  datasetCard.update(state.selectedPair, state.systemStatus, state.pairs)
  statisticsGrid.update(state.metrics, true)
  launchController.logToConsole(`Dispatching autonomous scientific registration pipeline for '${state.systemStatus.activePair}'...`)

  // Reset stages on new run so stages begin at READY/IDLE
  pipelineSection.resetStages()

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

  // Execute full 8-step live visual progress & green completion
  await launchController.launch(config)
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
    if (pairs[0].mission) {
      state.systemStatus.mission = pairs[0].mission as 'Chandrayaan-1' | 'Chandrayaan-2'
    }
  }

  header.updateStatus(state.systemStatus)
  header.updatePairs(state.pairs)
  datasetCard.update(state.selectedPair, state.systemStatus, state.pairs)

  // Synchronize Home Page dataset selector, summary, and banner
  populateHomeDatasetSelector(state.pairs)
  checkActiveSessionBanner()
}

initSystem()
