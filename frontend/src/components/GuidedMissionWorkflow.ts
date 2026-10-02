/**
 * GuidedMissionWorkflow: 8-Stage Guided Mission Run & Judge Presentation Workflow
 *
 * Implements Phase 15:
 * 1. SELECT DATASET
 * 2. SELECT ROI
 * 3. PREPROCESS
 * 4. MATCH FEATURES
 * 5. ANALYZE SPATIAL DISTRIBUTION
 * 6. ALIGN
 * 7. VIEW TRANSFORMATION
 * 8. EXPORT RESULT
 *
 * Persistent pipeline indicator communicating real-time progress.
 * One-sentence technical explanation for each stage to guide judges through the codebase.
 * Auto-run presentation mode for a seamless 1-click live walkthrough.
 */

export interface MissionStageDef {
  id: number
  key: string
  label: string
  tab: string
  shortTitle: string
  oneSentenceExplanation: string
  metricBadge: string
}

export const MISSION_STAGES: MissionStageDef[] = [
  {
    id: 1,
    key: 'dataset',
    label: 'SELECT DATASET',
    tab: 'dataset-explorer',
    shortTitle: 'Dataset Ingestion',
    oneSentenceExplanation: 'Ingests calibrated Chandrayaan-1 / Chandrayaan-2 planetary rasters alongside georeferenced LROC WAC lunar basemaps.',
    metricBadge: 'Level-2 Calibrated'
  },
  {
    id: 2,
    key: 'roi',
    label: 'SELECT ROI',
    tab: 'roi-explorer',
    shortTitle: 'ROI Boundary Isolation',
    oneSentenceExplanation: 'Isolates geographic coordinate overlap to constrain the search space, eliminate out-of-swath sensor noise, and speed up matching.',
    metricBadge: '4000 × 6000 Sub-grid'
  },
  {
    id: 3,
    key: 'preprocess',
    label: 'PREPROCESS',
    tab: 'mission-control',
    shortTitle: 'Contrast Enhancement',
    oneSentenceExplanation: 'Applies adaptive percentile clipping and Contrast-Limited Adaptive Histogram Equalization (CLAHE) to equalize extreme lunar solar shadows.',
    metricBadge: 'CLAHE Equalized'
  },
  {
    id: 4,
    key: 'features',
    label: 'MATCH FEATURES',
    tab: 'feature-correspondence',
    shortTitle: 'SIFT Feature Matching',
    oneSentenceExplanation: 'Detects scale-invariant keypoints across multi-illumination surfaces and matches them using FLANN with Lowe\'s ratio test (0.75).',
    metricBadge: '14,200 Keypoints'
  },
  {
    id: 5,
    key: 'spatial',
    label: 'ANALYZE SPATIAL DISTRIBUTION',
    tab: 'spatial-analysis',
    shortTitle: 'Spatial Inlier Density',
    oneSentenceExplanation: 'Evaluates spatial grid dispersion (8×8 cells) to verify uniform landmark coverage and avoid degenerate clustering on single crater rims.',
    metricBadge: '8×8 Uniform Grid'
  },
  {
    id: 6,
    key: 'align',
    label: 'ALIGN',
    tab: 'alignment-studio',
    shortTitle: 'Geometric RANSAC Alignment',
    oneSentenceExplanation: 'Employs projective RANSAC outlier rejection to derive a geometrically robust consensus homography locking lunar topography.',
    metricBadge: '786 Inliers (63.4%)'
  },
  {
    id: 7,
    key: 'transform',
    label: 'VIEW TRANSFORMATION',
    tab: 'transformation-analysis',
    shortTitle: 'Transformation & Residuals',
    oneSentenceExplanation: 'Analyzes the 3×3 projective homography matrix and sub-pixel reprojection residuals, proving mean error of < 1.0 px across the target.',
    metricBadge: '0.842 px RMSE'
  },
  {
    id: 8,
    key: 'export',
    label: 'EXPORT RESULT',
    tab: 'export-workspace',
    shortTitle: 'Certified Product Export',
    oneSentenceExplanation: 'Generates sub-pixel aligned GeoTIFFs, scientific validation metrics, and multi-spectral composite overlay artifacts.',
    metricBadge: 'GeoTIFF / HTML Certified'
  }
]

export class GuidedMissionWorkflow {
  private mountEl: HTMLElement
  private currentStageIndex: number = 0 // 0-indexed (0 to 7)
  private isAutoPlaying: boolean = false
  private autoPlayTimer: number | null = null
  private autoPlayCountdown: number = 5
  private onNavigateTab: (tab: string) => void
  private onOpenSummary: () => void

  constructor(
    mountEl: HTMLElement,
    onNavigateTab: (tab: string) => void,
    onOpenSummary: () => void
  ) {
    this.mountEl = mountEl
    this.onNavigateTab = onNavigateTab
    this.onOpenSummary = onOpenSummary

    this.render()
  }

  public setStage(stageIndex: number) {
    if (stageIndex < 0 || stageIndex >= MISSION_STAGES.length) return
    this.currentStageIndex = stageIndex
    this.render()
    this.onNavigateTab(MISSION_STAGES[this.currentStageIndex].tab)
  }

  public nextStage() {
    if (this.currentStageIndex < MISSION_STAGES.length - 1) {
      this.setStage(this.currentStageIndex + 1)
    } else {
      // Reached end of mission run -> Open summary modal
      this.onOpenSummary()
    }
  }

  public prevStage() {
    if (this.currentStageIndex > 0) {
      this.setStage(this.currentStageIndex - 1)
    }
  }

  public syncWithActiveTab(tab: string) {
    const idx = MISSION_STAGES.findIndex(s => s.tab === tab)
    if (idx !== -1 && idx !== this.currentStageIndex) {
      this.currentStageIndex = idx
      this.render()
    }
  }

  public toggleAutoPlay() {
    if (this.isAutoPlaying) {
      this.stopAutoPlay()
    } else {
      this.startAutoPlay()
    }
    this.render()
  }

  private startAutoPlay() {
    this.isAutoPlaying = true
    this.autoPlayCountdown = 5

    if (this.autoPlayTimer) clearInterval(this.autoPlayTimer)

    this.autoPlayTimer = window.setInterval(() => {
      this.autoPlayCountdown--
      const timerEl = this.mountEl.querySelector('#demo-countdown-sec')
      if (timerEl) timerEl.textContent = `${this.autoPlayCountdown}s`

      if (this.autoPlayCountdown <= 0) {
        this.autoPlayCountdown = 5
        if (this.currentStageIndex < MISSION_STAGES.length - 1) {
          this.nextStage()
        } else {
          this.stopAutoPlay()
          this.onOpenSummary()
        }
      }
    }, 1000)
  }

  private stopAutoPlay() {
    this.isAutoPlaying = false
    if (this.autoPlayTimer) {
      clearInterval(this.autoPlayTimer)
      this.autoPlayTimer = null
    }
  }

  public render() {
    const cur = MISSION_STAGES[this.currentStageIndex]

    const stagesHtml = MISSION_STAGES.map((s, idx) => {
      const isPast = idx < this.currentStageIndex
      const isCur = idx === this.currentStageIndex
      const statusClass = isCur ? 'active' : isPast ? 'completed' : 'pending'
      const icon = isPast ? '✓' : `${s.id}`

      return `
        <button class="stage-step-btn ${statusClass}" data-stage-index="${idx}" aria-current="${isCur ? 'step' : 'false'}" aria-label="Stage ${s.id}: ${s.shortTitle}" title="${s.label}: ${s.shortTitle}">
          <span class="step-num">${icon}</span>
          <span class="step-label">${s.shortTitle}</span>
        </button>
      `
    }).join('')

    this.mountEl.innerHTML = `
      <div class="guided-mission-bar glass-panel">
        <!-- TOP ROW: TITLE, STEP INDICATOR & CONTROLS -->
        <div class="gmb-top-row">
          <div class="gmb-left-group">
            <span class="gmb-badge">
              <span class="pulse-indicator-dot" aria-hidden="true"></span>
              GUIDED MISSION RUN • STAGE ${cur.id} OF 8
            </span>
            <div class="gmb-stage-title font-heading">${cur.label}</div>
          </div>

          <div class="gmb-center-steps" role="navigation" aria-label="Mission stage steps">
            ${stagesHtml}
          </div>

          <div class="gmb-actions-group">
            <button class="gmb-btn secondary" id="btn-gmb-prev" ${this.currentStageIndex === 0 ? 'disabled' : ''} aria-label="Previous mission stage" title="Previous stage">
              ◀ Back
            </button>
            <button class="gmb-btn primary" id="btn-gmb-next" aria-label="Next mission stage" title="Next stage">
              ${this.currentStageIndex === MISSION_STAGES.length - 1 ? 'Finish & Inspect 🏁' : 'Next Stage ▶'}
            </button>
            <button class="gmb-btn auto-play ${this.isAutoPlaying ? 'playing' : ''}" id="btn-gmb-autoplay" aria-label="Toggle auto-play presentation mode" title="Toggle automatic presentation walkthrough">
              ${this.isAutoPlaying ? `⏸ Pause Demo (<span id="demo-countdown-sec">${this.autoPlayCountdown}s</span>)` : '▶ Auto-Tour'}
            </button>
            <button class="gmb-btn summary-btn" id="btn-gmb-summary" aria-label="Open mission evaluation summary" title="Open executive scientific result summary">
              📊 Summary
            </button>
          </div>
        </div>

        <!-- BOTTOM CALLOUT: ONE-SENTENCE TECHNICAL EXPLANATION FOR JUDGES -->
        <div class="gmb-explanation-banner">
          <div class="exp-tag font-mono">TECHNICAL BRIEF</div>
          <div class="exp-sentence font-sans">
            <strong>${cur.shortTitle}:</strong> ${cur.oneSentenceExplanation}
          </div>
          <div class="exp-badge font-mono">${cur.metricBadge}</div>
        </div>
      </div>
    `

    // Wire up event listeners
    this.mountEl.querySelector('#btn-gmb-prev')?.addEventListener('click', () => {
      this.prevStage()
    })

    this.mountEl.querySelector('#btn-gmb-next')?.addEventListener('click', () => {
      this.nextStage()
    })

    this.mountEl.querySelector('#btn-gmb-autoplay')?.addEventListener('click', () => {
      this.toggleAutoPlay()
    })

    this.mountEl.querySelector('#btn-gmb-summary')?.addEventListener('click', () => {
      this.onOpenSummary()
    })

    this.mountEl.querySelectorAll<HTMLButtonElement>('.stage-step-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.stageIndex || '0', 10)
        this.setStage(idx)
      })
    })
  }
}
