import type { RoiCoordinates, RoiShapeMode } from '../types'
import { RoiControls } from './RoiControls'
import { RoiCanvasViewer } from './RoiCanvasViewer'
import { RoiMetadataStats } from './RoiMetadataStats'
import { fetchAutoDetectTerrain, fetchRoiPreview } from '../api'

export class RoiExplorer {
  private container: HTMLElement
  private controls!: RoiControls
  private viewer!: RoiCanvasViewer
  private metadata!: RoiMetadataStats

  private activePairId: string = 'pair_001'
  private currentCoords: RoiCoordinates = {
    src_line_start: 0,
    src_sample_start: 0,
    src_line_end: 6000,
    src_sample_end: 4000,
    ref_x0: 60000,
    ref_y0: 35000,
    ref_x1: 64000,
    ref_y1: 41000,
  }

  private onApplyCallback: (coords: RoiCoordinates) => void

  constructor(
    parent: HTMLElement,
    initialPairId: string = 'pair_001',
    onApply: (coords: RoiCoordinates) => void
  ) {
    this.container = document.createElement('div')
    this.container.className = 'roi-explorer-workspace'
    parent.appendChild(this.container)

    this.activePairId = initialPairId
    this.onApplyCallback = onApply

    this.renderLayout()
  }

  private previewDebounceTimer: any = null

  public setActivePair(pairId: string) {
    this.activePairId = pairId
    const pairEl = this.container.querySelector('#roi-active-pair-badge')
    if (pairEl) {
      pairEl.textContent = `TARGET: ${pairId.toUpperCase()}`
    }
    if (this.viewer) {
      this.viewer.setPairId(pairId)
    }
    if (this.metadata) {
      this.metadata.setPairId(pairId)
    }
    this.handlePreviewRoi()
  }

  public onTabActive() {
    if (this.viewer) {
      setTimeout(() => {
        this.viewer.resizeCanvases()
        this.viewer.centerOnRoi()
      }, 50)
    }
    this.handlePreviewRoi()
  }

  public getCoordinates(): RoiCoordinates {
    return { ...this.currentCoords }
  }

  public setCoordinates(coords: RoiCoordinates) {
    this.currentCoords = { ...coords }
    this.controls.setCoordinates(this.currentCoords, false)
    this.viewer.setCoordinates(this.currentCoords)
    this.metadata.setCoordinates(this.currentCoords)
    this.debouncedPreviewRoi()
  }

  private debouncedPreviewRoi() {
    if (this.previewDebounceTimer) clearTimeout(this.previewDebounceTimer)
    this.previewDebounceTimer = setTimeout(() => {
      this.handlePreviewRoi()
    }, 350)
  }

  private renderLayout() {
    this.container.innerHTML = `
      <!-- TOP STATUS & BREADCRUMB BAR -->
      <div class="roi-workspace-topbar glass-panel">
        <div class="topbar-left">
          <div class="status-chip isro">
            <span class="pulse-dot"></span>
            <span>ISRO CHANDRAYAAN-1 & 2 TMC SCIENTIFIC ROI WORKSPACE</span>
          </div>
          <span class="divider">|</span>
          <span class="active-pair-badge" id="roi-active-pair-badge">TARGET: ${this.activePairId.toUpperCase()}</span>
          <span class="divider">|</span>
          <span class="projection-tag">IAU2000:30100 MOON CYLINDRICAL</span>
        </div>

        <div class="topbar-right">
          <div class="system-status-indicator">
            <span class="dot-online"></span>
            <span>SUB-PIXEL REGISTRATION READY</span>
          </div>
        </div>
      </div>

      <!-- THREE-PANEL ADVANCED WORKSPACE LAYOUT -->
      <div class="roi-workspace-panels-grid">
        <!-- LEFT: CONTROLS PANEL -->
        <div class="roi-left-panel-mount glass-panel" id="roi-controls-mount"></div>

        <!-- CENTER: LARGE LUNAR MAP / IMAGE VIEWER -->
        <div class="roi-center-panel-mount glass-panel" id="roi-viewer-mount"></div>

        <!-- RIGHT: ROI METADATA & STATISTICS + LIVE PREVIEW -->
        <div class="roi-right-panel-mount glass-panel" id="roi-metadata-mount"></div>
      </div>
    `

    const leftMount = this.container.querySelector<HTMLElement>('#roi-controls-mount')!
    const centerMount = this.container.querySelector<HTMLElement>('#roi-viewer-mount')!
    const rightMount = this.container.querySelector<HTMLElement>('#roi-metadata-mount')!

    // 1. Initialize Left Controls
    this.controls = new RoiControls(leftMount, this.currentCoords, {
      onChange: (coords: RoiCoordinates) => {
        this.currentCoords = { ...coords }
        this.viewer.setCoordinates(this.currentCoords)
        this.metadata.setCoordinates(this.currentCoords)
        this.debouncedPreviewRoi()
      },
      onAutoFindTerrain: () => {
        this.handleAutoFindTerrain()
      },
      onPreviewRoi: () => {
        this.handlePreviewRoi()
      },
      onReset: () => {
        this.handleReset()
      },
      onApplyRoi: () => {
        this.handleApplyRoi()
      },
      onShapeModeChange: (mode: RoiShapeMode) => {
        this.viewer.setShapeMode(mode)
      }
    })

    // 2. Initialize Center Canvas Viewer with Pair Image Support
    this.viewer = new RoiCanvasViewer(centerMount, this.currentCoords, {
      onRoiChange: (coords: RoiCoordinates) => {
        this.currentCoords = { ...coords }
        this.controls.setCoordinates(this.currentCoords, false)
        this.metadata.setCoordinates(this.currentCoords)
        this.debouncedPreviewRoi()
      }
    })
    this.viewer.setPairId(this.activePairId)

    // 3. Initialize Right Metadata Stats & Live Crop Preview
    this.metadata = new RoiMetadataStats(rightMount, this.currentCoords)
    this.metadata.setPairId(this.activePairId)

    // Auto-fetch authentic sub-scene preview for active pair on initial load
    setTimeout(() => {
      this.handlePreviewRoi()
    }, 200)
  }

  private async handleAutoFindTerrain() {
    this.controls.setAutoFinding(true)
    this.showToast('Scanning reference basemap for high-contrast lunar terrain...', 'info')

    try {
      const terrain = await fetchAutoDetectTerrain(this.activePairId)
      if (terrain && terrain.x0 !== undefined) {
        this.currentCoords.ref_x0 = terrain.x0
        this.currentCoords.ref_x1 = terrain.x1
        this.currentCoords.ref_y0 = terrain.y0
        this.currentCoords.ref_y1 = terrain.y1

        // Sync with source coordinates keeping proportional scale
        const w = terrain.x1 - terrain.x0
        const h = terrain.y1 - terrain.y0
        this.currentCoords.src_sample_start = 0
        this.currentCoords.src_sample_end = Math.min(4000, w)
        this.currentCoords.src_line_start = 0
        this.currentCoords.src_line_end = Math.min(50000, h)

        this.setCoordinates(this.currentCoords)
        this.viewer.fitToScreen()
        this.showToast(`Auto-terrain locked: X[${terrain.x0}..${terrain.x1}], Y[${terrain.y0}..${terrain.y1}]`, 'success')
      }
    } catch (err) {
      console.warn('Auto find terrain error:', err)
      this.showToast('Using nominal reference terrain window', 'info')
    } finally {
      this.controls.setAutoFinding(false)
    }
  }

  private async handlePreviewRoi() {
    this.controls.setPreviewing(true)
    this.showToast('Extracting high-resolution sub-scene crops from backend...', 'info')

    try {
      const roiSrc: [number, number, number, number] = [
        this.currentCoords.src_line_start,
        this.currentCoords.src_line_end,
        this.currentCoords.src_sample_start,
        this.currentCoords.src_sample_end,
      ]
      const roiRef: [number, number, number, number] = [
        this.currentCoords.ref_y0,
        this.currentCoords.ref_y1,
        this.currentCoords.ref_x0,
        this.currentCoords.ref_x1,
      ]

      const previewData = await fetchRoiPreview(this.activePairId, roiSrc, roiRef)
      if (previewData) {
        this.metadata.setPreviewData(previewData)
        this.viewer.setPreviewData(previewData)
        this.showToast('Sub-scene preview refreshed with radiometric equalization', 'success')
      } else {
        // Fallback already generated in metadata client patch
        this.showToast('Sub-scene preview generated locally', 'success')
      }
    } catch (err) {
      console.warn('Preview ROI request failed:', err)
      this.showToast('Local high-fidelity preview generated', 'info')
    } finally {
      this.controls.setPreviewing(false)
    }
  }

  private handleReset() {
    this.currentCoords = {
      src_line_start: 0,
      src_sample_start: 0,
      src_line_end: 6000,
      src_sample_end: 4000,
      ref_x0: 60000,
      ref_y0: 35000,
      ref_x1: 64000,
      ref_y1: 41000,
    }
    this.setCoordinates(this.currentCoords)
    this.viewer.fitToScreen()
    this.showToast('Reset to nominal calibrated Apollo 11 coordinates', 'info')
  }

  private handleApplyRoi() {
    this.onApplyCallback(this.currentCoords)
    this.showToast(
      `ROI Applied to Pipeline: Source [L: ${this.currentCoords.src_line_start}..${this.currentCoords.src_line_end}, S: ${this.currentCoords.src_sample_start}..${this.currentCoords.src_sample_end}] | Reference [X: ${this.currentCoords.ref_x0}..${this.currentCoords.ref_x1}, Y: ${this.currentCoords.ref_y0}..${this.currentCoords.ref_y1}]`,
      'success',
      true
    )
  }

  private showToast(message: string, type: 'info' | 'success' | 'warning' = 'info', showActionBtn: boolean = false) {
    const existing = document.querySelector('.roi-toast-notification')
    if (existing) existing.remove()

    const toast = document.createElement('div')
    toast.className = `roi-toast-notification toast-${type}`
    toast.innerHTML = `
      <div style="display:flex; align-items:center; gap:8px;">
        <span class="toast-icon">${type === 'success' ? '✔' : 'ℹ'}</span>
        <span class="toast-msg">${message}</span>
      </div>
      ${showActionBtn ? `
        <button id="toast-jump-mission" class="btn-toast-action">
          Proceed to Mission Control & Run Pipeline &rarr;
        </button>
      ` : ''}
    `
    document.body.appendChild(toast)

    if (showActionBtn) {
      toast.querySelector('#toast-jump-mission')?.addEventListener('click', () => {
        toast.remove()
        const navMission = document.querySelector<HTMLButtonElement>('#nav-btn-mission')
        if (navMission) navMission.click()
      })
    }

    setTimeout(() => {
      toast.classList.add('fade-out')
      setTimeout(() => toast.remove(), 400)
    }, showActionBtn ? 7000 : 4000)
  }
}
