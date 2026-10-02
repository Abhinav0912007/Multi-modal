import type { RegistrationMetrics } from '../types'

export class StatisticsGrid {
  private container: HTMLElement
  private metrics: RegistrationMetrics | null
  private onLaunch: () => void
  private isProcessing: boolean

  constructor(
    container: HTMLElement,
    metrics: RegistrationMetrics | null,
    isProcessing: boolean,
    onLaunch: () => void
  ) {
    this.container = container
    this.metrics = metrics
    this.isProcessing = isProcessing
    this.onLaunch = onLaunch
    this.render()
  }

  public update(metrics: RegistrationMetrics | null, isProcessing: boolean) {
    this.metrics = metrics
    this.isProcessing = isProcessing
    this.render()
  }

  public render() {
    const m = this.metrics

    // Scientific values formatted strictly: "—" when data does not exist
    const imageDimensions = m?.image_dimensions || '—'
    const gsd = m?.gsd || '—'
    const numFeatures = m?.n_features !== undefined && m?.n_features !== null ? `${m.n_features.toLocaleString()}` : '—'
    const candidateMatches = m?.candidate_matches !== undefined && m?.candidate_matches !== null ? `${m.candidate_matches.toLocaleString()}` : '—'
    const inliers = m?.inliers !== undefined && m?.inliers !== null ? `${m.inliers.toLocaleString()}${m.inlier_ratio ? ` (${m.inlier_ratio})` : ''}` : '—'
    const regError = m?.registration_error || (m?.rmse !== undefined && m?.rmse !== null ? `${m.rmse.toFixed(3)} px` : '—')
    const procTime = m?.processing_time || '—'

    this.container.innerHTML = `
      <section class="stats-section glass-panel corner-reticle" aria-label="Scientific Registration Metrics">
        <div class="stats-header">
          <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
            <h2>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--cyan-bright)" stroke-width="2" aria-hidden="true">
                <path d="M3 3v18h18" />
                <path d="m19 9-5 5-4-4-3 3" />
              </svg>
              Scientific Registration Telemetry &amp; Metrics
            </h2>
            ${m && (m.inliers || m.registration_error) ? `
              <span class="badge-status" style="font-size:10px; padding:3px 8px;">
                <span class="pulse-dot" style="background:var(--emerald-status);"></span>
                HOMOGRAPHY LOCK: ${regError}
              </span>
            ` : ''}
          </div>

          <!-- Primary Action Button: Launch Registration -->
          <button id="btn-launch-registration" class="btn-launch" ${this.isProcessing ? 'disabled aria-busy="true"' : ''} aria-label="Execute Autonomous Multi-Modal Registration">
            ${this.isProcessing ? `
              <svg class="spin-loader" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true" style="animation: spin 1s linear infinite;">
                <circle cx="12" cy="12" r="10" stroke-opacity="0.25"/>
                <path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round"/>
              </svg>
              Processing Telemetry Run...
            ` : `
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
              Launch Scientific Registration
            `}
          </button>
        </div>

        <!-- 7 Scientifically Meaningful Metrics -->
        <div class="stats-grid">
          <!-- 1. Image Dimensions -->
          <div class="stat-cell-card">
            <div class="stat-label-row">
              <span class="stat-title">Image Dimensions</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <path d="M3 9h18M9 21V9"/>
              </svg>
            </div>
            <div class="stat-value ${imageDimensions === '—' ? 'empty' : 'active'}">${imageDimensions}</div>
            <div class="stat-unit">Source (W × H px)</div>
          </div>

          <!-- 2. Ground Sampling Distance -->
          <div class="stat-cell-card">
            <div class="stat-label-row">
              <span class="stat-title">Ground Sampling Dist.</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <line x1="2" y1="12" x2="22" y2="12"/>
              </svg>
            </div>
            <div class="stat-value ${gsd === '—' ? 'empty' : 'active'}">${gsd}</div>
            <div class="stat-unit">Spatial Resolution (GSD)</div>
          </div>

          <!-- 3. Number of Features -->
          <div class="stat-cell-card">
            <div class="stat-label-row">
              <span class="stat-title">Number of Features</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2">
                <circle cx="12" cy="12" r="3"/>
                <path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>
              </svg>
            </div>
            <div class="stat-value ${numFeatures === '—' ? 'empty' : 'active'}">${numFeatures}</div>
            <div class="stat-unit">SIFT Keypoints Extracted</div>
          </div>

          <!-- 4. Candidate Matches -->
          <div class="stat-cell-card">
            <div class="stat-label-row">
              <span class="stat-title">Candidate Matches</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2">
                <path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/>
              </svg>
            </div>
            <div class="stat-value ${candidateMatches === '—' ? 'empty' : 'active'}">${candidateMatches}</div>
            <div class="stat-unit">FLANN Ratio Pairs</div>
          </div>

          <!-- 5. Inliers -->
          <div class="stat-cell-card">
            <div class="stat-label-row">
              <span class="stat-title">Geometric Inliers</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                <polyline points="22 4 12 14.01 9 11.01"/>
              </svg>
            </div>
            <div class="stat-value ${inliers === '—' ? 'empty' : 'active'}">${inliers}</div>
            <div class="stat-unit">RANSAC Validated Points</div>
          </div>

          <!-- 6. Registration Error -->
          <div class="stat-cell-card">
            <div class="stat-label-row">
              <span class="stat-title">Registration Error</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
            </div>
            <div class="stat-value ${regError === '—' ? 'empty' : 'active'}">${regError}</div>
            <div class="stat-unit">Reprojection Root Mean Square</div>
          </div>

          <!-- 7. Processing Time -->
          <div class="stat-cell-card">
            <div class="stat-label-row">
              <span class="stat-title">Processing Time</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <polyline points="12 6 12 12 16 14"/>
              </svg>
            </div>
            <div class="stat-value ${procTime === '—' ? 'empty' : 'active'}">${procTime}</div>
            <div class="stat-unit">Wall-clock Pipeline Runtime</div>
          </div>
        </div>
      </section>
    `

    const launchBtn = this.container.querySelector<HTMLButtonElement>('#btn-launch-registration')
    if (launchBtn) {
      launchBtn.addEventListener('click', () => {
        if (!this.isProcessing) {
          this.onLaunch()
        }
      })
    }
  }
}
