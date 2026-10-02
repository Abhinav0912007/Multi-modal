import type { SystemStatus, PairItem } from '../types'

export class Header {
  private container: HTMLElement
  private status: SystemStatus
  private pairs: PairItem[]
  private onSelectPair: (pairId: string) => void

  constructor(
    container: HTMLElement,
    status: SystemStatus,
    pairs: PairItem[],
    onSelectPair: (pairId: string) => void
  ) {
    this.container = container
    this.status = status
    this.pairs = pairs
    this.onSelectPair = onSelectPair
    this.render()
  }

  public updateStatus(status: Partial<SystemStatus>) {
    this.status = { ...this.status, ...status }
    this.render()
  }

  public updatePairs(pairs: PairItem[]) {
    this.pairs = pairs
    this.render()
  }

  public render() {
    const isOnline = this.status.backendOnline
    const procStatus = this.status.processingStatus

    let procClass = 'idle'
    if (procStatus === 'PROCESSING') procClass = 'processing'
    else if (procStatus === 'COMPLETED') procClass = 'completed'

    this.container.innerHTML = `
      <header class="mission-header glass-panel corner-reticle" role="banner">
        <div class="header-top-row">
          <!-- Title & Subtitle -->
          <div class="header-brand">
            <div class="isro-emblem" title="ISRO Chandrayaan Lunar Program" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 2v20M2 12h20" stroke-dasharray="2 2" opacity="0.6"/>
                <ellipse cx="12" cy="12" rx="11" ry="5" transform="rotate(-30 12 12)" stroke="var(--isro-gold)"/>
                <circle cx="18" cy="7" r="2" fill="var(--cyan-bright)"/>
              </svg>
            </div>
            <div class="brand-text">
              <div class="brand-eyebrow">
                <span class="agency-tag">ISRO • SAC &amp; ISSDC GROUND SYSTEM</span>
                <span class="eyebrow-divider">/</span>
                <span class="program-tag">CHANDRAYAAN LUNAR PROGRAM</span>
              </div>
              <h1 class="scientific-main-heading">
                CHANDRAYAAN <span class="highlight-cyan">LUNAR IMAGING</span> &bull; <span class="highlight-gold">SCIENTIFIC REGISTRATION</span>
              </h1>
              <p>Autonomous Sub-Pixel Multi-Modal Homography &amp; Cartographic Ortho-Rectification Engine &bull; TMC-1 / TMC-2 / OHRC &times; LROC Basemap</p>
            </div>
          </div>

          <!-- Telemetry Indicators & Status Strip -->
          <div class="header-telemetry-strip">
            <!-- Mission Indicator -->
            <div class="badge-mission" title="ISRO Lunar Exploration Program">
              <span class="pulse-dot" style="background-color: var(--isro-gold);"></span>
              <span>ISRO • ${this.status.mission} TMC</span>
            </div>

            <!-- System Status -->
            <div class="badge-status ${isOnline ? '' : 'idle'}" title="Backend API Health Check">
              <span class="pulse-dot" style="background-color: ${isOnline ? 'var(--emerald-status)' : 'var(--cyan-bright)'};"></span>
              <span>${isOnline ? 'SYSTEM NOMINAL' : 'STANDALONE READY'}</span>
            </div>

            <!-- Selected Dataset Selector Pill -->
            <div class="telemetry-pill" title="Currently active data pair">
              <span class="label">DATASET:</span>
              <select id="header-pair-selector" class="val" aria-label="Select Active Lunar Observation Pair" style="background:transparent; border:1px solid transparent; border-radius:4px; color:var(--cyan-bright); font-family:var(--font-mono); font-weight:600; cursor:pointer;">
                ${this.pairs.map(p => `
                  <option value="${p.id}" ${p.id === this.status.activePair ? 'selected' : ''} style="background:#091226; color:#fff;">
                    ${p.id.toUpperCase()} ${p.instrument ? `• ${p.instrument}` : ''}
                  </option>
                `).join('')}
              </select>
            </div>

            <!-- Processing Status -->
            <div class="badge-status ${procClass}" title="Pipeline processing status">
              <span class="pulse-dot"></span>
              <span>${this.status.processingStatus}</span>
            </div>

            <!-- Current Pipeline Stage -->
            <div class="telemetry-pill" title="Active pipeline step">
              <span class="label">STAGE:</span>
              <span class="val" style="color: ${procStatus === 'PROCESSING' ? 'var(--isro-gold)' : 'var(--text-primary)'};">
                ${this.status.currentStage}
              </span>
            </div>
          </div>
        </div>
      </header>
    `

    // Hook up pair selector
    const selector = this.container.querySelector<HTMLSelectElement>('#header-pair-selector')
    if (selector) {
      selector.addEventListener('change', (e) => {
        const val = (e.target as HTMLSelectElement).value
        this.status.activePair = val
        this.onSelectPair(val)
      })
    }
  }
}
