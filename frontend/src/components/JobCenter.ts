/**
 * JobCenter: Historical & Live Scientific Processing Job Inspector
 *
 * Implements Phase 13:
 * - Inspect all past and current registration jobs
 * - Display telemetry, inliers, RMSE, elapsed time, and stages
 * - Direct navigation to Alignment Studio, Transformation Analysis, or re-running jobs
 */

import { jobService } from '../services/jobService'
import { renderEmptyDatasetState, showHumanToast } from '../services/errorHandler'

export interface HistoricalJobItem {
  job_id: string
  pair_id: string
  status: 'queued' | 'processing' | 'completed' | 'failed'
  progress: number
  current_step: number
  total_steps: number
  step_message: string
  error_message?: string | null
  started_at?: string
  completed_at?: string
  elapsed_seconds?: number
  metrics?: Record<string, any>
  artifacts_count?: number
}

export class JobCenter {
  private mountEl: HTMLElement
  private jobs: HistoricalJobItem[] = []
  private isLoading: boolean = false
  private filterStatus: string = 'all'
  private filterPair: string = 'all'
  private onRunJob: (pairId: string) => void
  private onNavigateTab: (tab: string, pairId?: string) => void

  constructor(
    mountEl: HTMLElement,
    onRunJob: (pairId: string) => void,
    onNavigateTab: (tab: string, pairId?: string) => void
  ) {
    this.mountEl = mountEl
    this.onRunJob = onRunJob
    this.onNavigateTab = onNavigateTab

    this.mountEl.innerHTML = `<div class="job-center-container" id="job-center-root"></div>`

    // Subscribe to live job updates to auto-refresh historical list when a job completes or starts
    jobService.subscribe((activeJob) => {
      if (activeJob) {
        this.render()
        if (activeJob.status === 'completed' || activeJob.status === 'failed') {
          this.loadJobs()
        }
      }
    })

    this.loadJobs()
  }

  public async loadJobs() {
    this.isLoading = true
    this.render()
    try {
      const data = await jobService.fetchHistoricalJobs()
      if (Array.isArray(data)) {
        this.jobs = data
      }
    } catch (e) {
      console.warn('Failed to load historical jobs:', e)
      showHumanToast(e, 'error')
    } finally {
      this.isLoading = false
      this.render()
    }
  }

  private formatDuration(sec?: number): string {
    if (!sec && sec !== 0) return '—'
    if (sec < 60) return `${sec.toFixed(2)}s`
    const mins = Math.floor(sec / 60)
    const rem = (sec % 60).toFixed(1)
    return `${mins}m ${rem}s`
  }

  private formatDate(iso?: string): string {
    if (!iso) return '—'
    try {
      const d = new Date(iso)
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' ' + d.toLocaleDateString([], { month: 'short', day: 'numeric' })
    } catch {
      return iso
    }
  }

  public render() {
    const root = this.mountEl.querySelector('#job-center-root')
    if (!root) return

    const activeJob = jobService.getActiveJob()

    // Calculate summary statistics
    const totalJobs = this.jobs.length
    const completedJobs = this.jobs.filter(j => j.status === 'completed').length
    const failedJobs = this.jobs.filter(j => j.status === 'failed').length
    const runningJobs = this.jobs.filter(j => j.status === 'processing' || j.status === 'queued').length
    const successRate = totalJobs > 0 ? ((completedJobs / totalJobs) * 100).toFixed(1) : '100'

    const totalInliers = this.jobs.reduce((acc, j) => acc + (j.metrics?.inliers || 0), 0)
    const avgRuntime = completedJobs > 0
      ? (this.jobs.filter(j => j.status === 'completed').reduce((acc, j) => acc + (j.elapsed_seconds || 0), 0) / completedJobs).toFixed(2)
      : '0.00'

    // Filter jobs
    const filteredJobs = this.jobs.filter(j => {
      if (this.filterStatus !== 'all' && j.status !== this.filterStatus) return false
      if (this.filterPair !== 'all' && j.pair_id !== this.filterPair) return false
      return true
    })

    root.innerHTML = `
      <!-- TOP BANNER & METRICS -->
      <div class="job-center-header glass-panel corner-reticle">
        <div class="jc-title-area">
          <div class="jc-badge">ISRO TELEMETRY DISPATCH</div>
          <h2 class="jc-title">Scientific Processing Job Center</h2>
          <p class="jc-subtitle">Real-time asynchronous job registry, stage telemetry, historical registration runs, and transformation metrics.</p>
        </div>

        <div class="jc-stats-strip">
          <div class="jc-stat-card">
            <span class="jc-stat-label">TOTAL RUNS</span>
            <span class="jc-stat-val text-cyan">${totalJobs}</span>
            <span class="jc-stat-sub">${runningJobs} active now</span>
          </div>
          <div class="jc-stat-card">
            <span class="jc-stat-label">SUCCESS RATE</span>
            <span class="jc-stat-val text-emerald">${successRate}%</span>
            <span class="jc-stat-sub">${failedJobs} failed</span>
          </div>
          <div class="jc-stat-card">
            <span class="jc-stat-label">AVG RUNTIME</span>
            <span class="jc-stat-val text-gold">${avgRuntime}s</span>
            <span class="jc-stat-sub">sub-second pipeline</span>
          </div>
          <div class="jc-stat-card">
            <span class="jc-stat-label">CUMULATIVE INLIERS</span>
            <span class="jc-stat-val text-purple">${totalInliers.toLocaleString()}</span>
            <span class="jc-stat-sub">geometrically verified</span>
          </div>
        </div>
      </div>

      <!-- ACTIVE JOB HERO BANNER (IF ACTIVE) -->
      ${activeJob ? `
        <div class="jc-active-banner glass-panel">
          <div class="jc-active-left">
            <div class="pulse-indicator active">
              <span class="pulse-dot"></span>
            </div>
            <div>
              <div class="jc-active-title">
                ACTIVE JOB: REGISTRATION #${activeJob.job_id.slice(-6).toUpperCase()}
                <span class="jc-pair-pill">${activeJob.pair_id.toUpperCase()}</span>
                <span class="jc-status-pill ${activeJob.status}">${activeJob.status.toUpperCase()}</span>
              </div>
              <div class="jc-active-stage">
                Stage ${activeJob.current_step}/${activeJob.total_steps}: <strong>${activeJob.step_message}</strong>
              </div>
            </div>
          </div>

          <div class="jc-active-right">
            <div class="jc-active-prog-wrap">
              <div class="jc-active-prog-bar" style="width: ${activeJob.progress}%;"></div>
            </div>
            <span class="jc-active-pct">${activeJob.progress}%</span>
            <button class="jc-btn jc-btn-inspect" id="btn-jc-inspect-active">
              Open Telemetry Drawer
            </button>
          </div>
        </div>
      ` : ''}

      <!-- FILTER TOOLBAR -->
      <div class="jc-toolbar glass-panel">
        <div class="jc-filters-group">
          <label class="jc-filter-label">Status Filter:</label>
          <div class="jc-pill-filter">
            <button class="jc-filter-btn ${this.filterStatus === 'all' ? 'active' : ''}" data-status="all">All (${totalJobs})</button>
            <button class="jc-filter-btn ${this.filterStatus === 'completed' ? 'active' : ''}" data-status="completed">Completed (${completedJobs})</button>
            <button class="jc-filter-btn ${this.filterStatus === 'processing' ? 'active' : ''}" data-status="processing">Processing (${runningJobs})</button>
            <button class="jc-filter-btn ${this.filterStatus === 'failed' ? 'active' : ''}" data-status="failed">Failed (${failedJobs})</button>
          </div>

          <label class="jc-filter-label" style="margin-left: 12px;">Image Pair:</label>
          <select id="jc-select-pair" class="jc-select">
            <option value="all" ${this.filterPair === 'all' ? 'selected' : ''}>All Pairs</option>
            <option value="pair_001" ${this.filterPair === 'pair_001' ? 'selected' : ''}>PAIR_001 (Apollo 11)</option>
            <option value="pair_002" ${this.filterPair === 'pair_002' ? 'selected' : ''}>PAIR_002 (Tycho Crater)</option>
          </select>
        </div>

        <div class="jc-actions-group">
          <button class="jc-btn jc-btn-refresh ${this.isLoading ? 'loading' : ''}" id="btn-jc-refresh">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
            Refresh Registry
          </button>
          <button class="jc-btn jc-btn-primary" id="btn-jc-new-run">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            Launch Scientific Job
          </button>
        </div>
      </div>

      <!-- JOBS LIST / GRID -->
      <div class="jc-jobs-list">
        ${filteredJobs.length === 0 ? renderEmptyDatasetState({
          title: 'No Telemetry Jobs Recorded',
          message: 'No background registration jobs matched your current filter criteria in the telemetry registry.',
          actionNext: 'Click "Launch Scientific Job" below or return to Mission Control to initiate automated feature matching and surface alignment.',
          actionBtnText: 'Launch Scientific Job',
          actionBtnId: 'btn-jc-empty-launch',
        }) : filteredJobs.map(job => {
          const isComp = job.status === 'completed'
          const inliers = job.metrics?.inliers ?? '—'
          const ratio = job.metrics?.inlier_ratio != null ? `${(job.metrics.inlier_ratio * 100).toFixed(1)}%` : '—'
          const rmse = job.metrics?.rmse != null ? `${job.metrics.rmse.toFixed(3)} px` : '—'
          const transform = job.metrics?.transform_type || 'Homography (3x3)'
          const rawMatches = job.metrics?.raw_matches ?? '—'

          return `
            <div class="jc-job-card glass-panel" data-job-id="${job.job_id}">
              <div class="jc-card-header">
                <div class="jc-card-title-group">
                  <span class="jc-status-dot ${job.status}"></span>
                  <div>
                    <div class="jc-job-code">
                      REGISTRATION JOB #${job.job_id.slice(-6).toUpperCase()}
                      <span class="jc-pair-pill">${job.pair_id.toUpperCase()}</span>
                    </div>
                    <div class="jc-job-time">
                      <span>Submitted: ${this.formatDate(job.started_at)}</span>
                      <span>•</span>
                      <span>Runtime: <strong>${this.formatDuration(job.elapsed_seconds)}</strong></span>
                    </div>
                  </div>
                </div>

                <div class="jc-card-status-badge ${job.status}">
                  ${job.status.toUpperCase()}
                </div>
              </div>

              <div class="jc-card-body">
                <div class="jc-stage-status">
                  <span class="jc-stage-label">Current / Final Stage:</span>
                  <span class="jc-stage-text">${job.step_message || 'Processing completed'}</span>
                </div>

                ${isComp ? `
                  <div class="jc-metrics-grid">
                    <div class="jc-metric-item">
                      <span class="label">Inliers / Matches</span>
                      <span class="value text-cyan">${inliers} <span class="dim">/ ${rawMatches}</span></span>
                    </div>
                    <div class="jc-metric-item">
                      <span class="label">Inlier Ratio</span>
                      <span class="value text-emerald">${ratio}</span>
                    </div>
                    <div class="jc-metric-item">
                      <span class="label">Reprojection RMSE</span>
                      <span class="value text-gold">${rmse}</span>
                    </div>
                    <div class="jc-metric-item">
                      <span class="label">Transform Model</span>
                      <span class="value text-purple">${transform}</span>
                    </div>
                  </div>
                ` : job.error_message ? `
                  <div class="jc-error-banner">
                    ⚠️ Error: ${job.error_message}
                  </div>
                ` : `
                  <div class="jc-in-progress-bar">
                    <div class="jc-in-progress-fill" style="width: ${job.progress}%;"></div>
                  </div>
                `}
              </div>

              <div class="jc-card-footer">
                <div class="jc-footer-left">
                  <button class="jc-action-link" data-action="inspect" data-job-id="${job.job_id}">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    Telemetry &amp; Stages
                  </button>
                  ${isComp ? `
                    <button class="jc-action-link" data-action="alignment" data-pair-id="${job.pair_id}">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
                      Alignment Studio
                    </button>
                    <button class="jc-action-link" data-action="transform" data-pair-id="${job.pair_id}">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>
                      Matrix &amp; RMSE
                    </button>
                  ` : ''}
                </div>

                <div class="jc-footer-right">
                  <button class="jc-btn jc-btn-rerun" data-action="rerun" data-pair-id="${job.pair_id}">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
                    Re-run Job
                  </button>
                </div>
              </div>
            </div>
          `
        }).join('')}
      </div>
    `

    // Wire up events
    root.querySelector('#btn-jc-refresh')?.addEventListener('click', () => {
      this.loadJobs()
    })

    root.querySelector('#btn-jc-new-run')?.addEventListener('click', () => {
      this.onRunJob(this.filterPair !== 'all' ? this.filterPair : 'pair_001')
    })

    root.querySelector('#btn-jc-inspect-active')?.addEventListener('click', () => {
      // Re-trigger drawer update so drawer appears unminimized
      const cur = jobService.getActiveJob()
      if (cur) {
        jobService.listenToJob(cur.job_id)
      }
    })

    // Filter status buttons
    root.querySelectorAll<HTMLButtonElement>('.jc-filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.filterStatus = btn.dataset.status || 'all'
        this.render()
      })
    })

    // Filter pair select
    const pairSelect = root.querySelector<HTMLSelectElement>('#jc-select-pair')
    pairSelect?.addEventListener('change', () => {
      this.filterPair = pairSelect.value
      this.render()
    })

    // Card action buttons
    root.querySelectorAll<HTMLElement>('[data-action]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation()
        const action = el.dataset.action
        const pairId = el.dataset.pairId || 'pair_001'
        const jobId = el.dataset.jobId

        if (action === 'inspect' && jobId) {
          jobService.listenToJob(jobId)
        } else if (action === 'alignment') {
          this.onNavigateTab('alignment-studio', pairId)
        } else if (action === 'transform') {
          this.onNavigateTab('transformation-analysis', pairId)
        } else if (action === 'rerun') {
          this.onRunJob(pairId)
        }
      })
    })

    root.querySelector('#btn-jc-empty-launch')?.addEventListener('click', () => {
      this.onRunJob(this.filterPair !== 'all' ? this.filterPair : 'pair_001')
    })
  }
}
