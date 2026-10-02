/**
 * ProcessingDrawer: Global Asynchronous Processing Drawer & Floating Telemetry Panel
 *
 * Implements Phase 13 requirements:
 * - Floating/Docked drawer showing REGISTRATION JOB #id
 * - Stage checklist with status icons (✓, ●, ○)
 * - Live stopwatch (T+mm:ss), progress bar, collapsible logs terminal, and warnings
 * - Non-blocking: user can minimize to floating status pill and navigate other views without losing state
 */

import { jobService, type JobState } from '../services/jobService'

export class ProcessingDrawer {
  private container: HTMLElement
  private isMinimized: boolean = false
  private isExpandedLogs: boolean = false
  private timerInterval: number | null = null
  private secondsElapsed: number = 0
  private currentJob: JobState | null = null
  private onNavigateTab: (tab: string) => void

  constructor(onNavigateTab: (tab: string) => void) {
    this.onNavigateTab = onNavigateTab
    this.container = document.createElement('div')
    this.container.id = 'global-processing-drawer'
    this.container.className = 'processing-drawer-container'
    document.body.appendChild(this.container)

    jobService.subscribe((job) => this.handleJobUpdate(job))
  }

  private handleJobUpdate(job: JobState | null) {
    if (!job) {
      this.currentJob = null
      this.stopTimer()
      this.container.style.display = 'none'
      return
    }

    const isNew = !this.currentJob || this.currentJob.job_id !== job.job_id
    this.currentJob = job
    this.container.style.display = 'block'

    if (isNew) {
      this.isMinimized = false
      this.secondsElapsed = 0
      this.startTimer()
    }

    if (job.status === 'completed' || job.status === 'failed') {
      this.stopTimer()
    }

    this.render()
  }

  private startTimer() {
    this.stopTimer()
    this.timerInterval = window.setInterval(() => {
      this.secondsElapsed++
      const timerEl = this.container.querySelector('#drawer-timer-val')
      if (timerEl) {
        timerEl.textContent = this.formatTime(this.secondsElapsed)
      }
    }, 1000)
  }

  private stopTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval)
      this.timerInterval = null
    }
  }

  private formatTime(totalSec: number): string {
    const mins = Math.floor(totalSec / 60)
    const secs = totalSec % 60
    return `T+${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}s`
  }

  public render() {
    if (!this.currentJob) {
      this.container.innerHTML = ''
      return
    }

    const job = this.currentJob
    const isRunning = job.status === 'processing' || job.status === 'queued'
    const isSuccess = job.status === 'completed'

    // Minimized Pill view
    if (this.isMinimized) {
      this.container.innerHTML = `
        <div class="drawer-pill" id="btn-maximize-drawer" title="Click to expand Processing Panel">
          <div class="pill-indicator ${job.status}">
            <span class="pulse-dot"></span>
          </div>
          <div class="pill-text">
            <span class="pill-title">JOB #${job.job_id.slice(-6).toUpperCase()}</span>
            <span class="pill-progress">${job.progress}% • ${this.formatTime(this.secondsElapsed)}</span>
          </div>
          <button class="pill-expand-btn">▲</button>
        </div>
      `
      this.container.querySelector('#btn-maximize-drawer')?.addEventListener('click', () => {
        this.isMinimized = false
        this.render()
      })
      return
    }

    // 8 Core Stages required by user specification:
    // ✓ Dataset loaded, ✓ ROI extracted, ✓ Preprocessing, ● Feature extraction, ○ Feature matching, ○ Geometric verification, ○ Transformation estimation, ○ Export
    const stagesDef = [
      { name: 'Dataset loaded', stepNum: 2 },
      { name: 'ROI extracted', stepNum: 3 },
      { name: 'Preprocessing & Enhancement', stepNum: 4 },
      { name: 'Feature extraction', stepNum: 5 },
      { name: 'Feature matching', stepNum: 6 },
      { name: 'Geometric verification', stepNum: 7 },
      { name: 'Transformation estimation', stepNum: 8 },
      { name: 'Export & Alignment', stepNum: 10 }
    ]

    const stagesHtml = stagesDef.map((st) => {
      let icon = '○'
      let statusClass = 'pending'

      if (isSuccess || job.current_step > st.stepNum) {
        icon = '✓'
        statusClass = 'done'
      } else if (job.current_step === st.stepNum || (job.current_step === st.stepNum - 1 && isRunning)) {
        icon = '●'
        statusClass = 'active'
      }

      return `
        <div class="drawer-stage-item ${statusClass}">
          <span class="stage-icon">${icon}</span>
          <span class="stage-name">${st.name}</span>
        </div>
      `
    }).join('')

    this.container.innerHTML = `
      <div class="drawer-panel glass-panel">
        <!-- Panel Header -->
        <div class="drawer-header">
          <div class="drawer-title-group">
            <div class="status-indicator-dot ${job.status}"></div>
            <div>
              <div class="drawer-job-title">REGISTRATION JOB #${job.job_id.slice(-6).toUpperCase()}</div>
              <div class="drawer-job-sub">${job.pair_id.toUpperCase()} • ${job.status.toUpperCase()}</div>
            </div>
          </div>

          <div class="drawer-header-actions">
            <div id="drawer-timer-val" class="drawer-timer-badge" aria-label="Elapsed pipeline time">
              ${this.formatTime(this.secondsElapsed)}
            </div>
            <button id="btn-minimize-drawer" class="drawer-ctrl-btn" aria-label="Minimize processing drawer" title="Minimize to background pill">_</button>
            <button id="btn-close-drawer" class="drawer-ctrl-btn" aria-label="Close processing drawer" title="Dismiss panel">✕</button>
          </div>
        </div>

        <!-- Progress Bar -->
        <div class="drawer-progress-container">
          <div class="drawer-progress-track" role="progressbar" aria-valuenow="${job.progress}" aria-valuemin="0" aria-valuemax="100" aria-label="Registration pipeline progress">
            <div class="drawer-progress-fill ${job.status}" style="width: ${job.progress}%;"></div>
          </div>
          <div class="drawer-progress-labels">
            <span>${job.step_message || 'Processing...'}</span>
            <span>${job.progress}%</span>
          </div>
        </div>

        <!-- Stages Checklist -->
        <div class="drawer-stages-grid" role="list">
          ${stagesHtml}
        </div>

        <!-- Logs Toggle & Terminal -->
        <div class="drawer-logs-section">
          <button id="btn-toggle-logs" class="drawer-logs-toggle" aria-expanded="${this.isExpandedLogs}" aria-label="Toggle terminal logs">
            <span>Terminal Telemetry (${job.logs ? job.logs.length : 0} lines)</span>
            <span aria-hidden="true">${this.isExpandedLogs ? '▼' : '▶'}</span>
          </button>
          ${this.isExpandedLogs ? `
            <div class="drawer-terminal-log">
              ${(job.logs || []).map(l => `<div class="log-row">${l}</div>`).join('')}
              ${job.error ? `<div class="log-row error">ERROR: ${job.error}</div>` : ''}
            </div>
          ` : ''}
        </div>

        <!-- Completed Actions -->
        ${isSuccess ? `
          <div class="drawer-actions-strip">
            <button id="drawer-btn-align" class="drawer-action-btn primary">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
              View in Alignment Studio
            </button>
            <button id="drawer-btn-export" class="drawer-action-btn secondary">
              Download Artifacts
            </button>
          </div>
        ` : ''}
      </div>
    `

    // Event listeners
    this.container.querySelector('#btn-minimize-drawer')?.addEventListener('click', () => {
      this.isMinimized = true
      this.render()
    })

    this.container.querySelector('#btn-close-drawer')?.addEventListener('click', () => {
      jobService.clearActiveJob()
    })

    this.container.querySelector('#btn-toggle-logs')?.addEventListener('click', () => {
      this.isExpandedLogs = !this.isExpandedLogs
      this.render()
    })

    this.container.querySelector('#drawer-btn-align')?.addEventListener('click', () => {
      this.onNavigateTab('alignment-studio')
    })

    this.container.querySelector('#drawer-btn-export')?.addEventListener('click', () => {
      this.onNavigateTab('export-workspace')
    })
  }
}
