import type { PipelineConfig, RegistrationMetrics } from '../types'
import { launchRegistrationApi, subscribeToPipelineEvents } from '../api'

export class LaunchController {
  private isRunning = false
  private consoleEl: HTMLElement | null = null
  private onProgressCallback: (step: number, progress: number, msg: string) => void
  private onCompleteCallback: (metrics: RegistrationMetrics, artifacts: Record<string, string>) => void
  private onErrorCallback: (err: string) => void
  private cleanupSub: (() => void) | null = null

  constructor(callbacks: {
    onProgress: (step: number, progress: number, msg: string) => void
    onComplete: (metrics: RegistrationMetrics, artifacts: Record<string, string>) => void
    onError: (err: string) => void
  }) {
    this.onProgressCallback = callbacks.onProgress
    this.onCompleteCallback = callbacks.onComplete
    this.onErrorCallback = callbacks.onError
  }

  public setConsoleElement(el: HTMLElement) {
    this.consoleEl = el
  }

  public logToConsole(msg: string) {
    if (!this.consoleEl) return
    const now = new Date().toISOString().substring(11, 19)
    const entry = document.createElement('div')
    entry.className = 'console-entry'
    entry.innerHTML = `<span class="ts">[${now}]</span> <span>${msg}</span>`
    this.consoleEl.appendChild(entry)
    this.consoleEl.scrollTop = this.consoleEl.scrollHeight
  }

  public async launch(config: PipelineConfig) {
    if (this.isRunning) return
    this.isRunning = true

    this.logToConsole(`MISSION TELEMETRY: Initiating registration run for dataset '${config.pair_id}'...`)
    this.logToConsole(`Config: Transform=${config.transform_type.toUpperCase()}, NFeatures=${config.nfeatures}, Grid=${config.grid_size}x${config.grid_size}, Subpixel=${config.do_subpixel}`)

    try {
      const { job_id, isReal } = await launchRegistrationApi(config)
      this.logToConsole(`Job registered [${job_id}] — Mode: ${isReal ? 'BACKEND WORKER' : 'MISSION SIMULATION'}`)

      this.cleanupSub = subscribeToPipelineEvents(job_id, isReal, {
        onProgress: (step, prog, msg) => {
          this.logToConsole(`[STEP ${step}/8] (${prog}%) ${msg}`)
          this.onProgressCallback(step, prog, msg)
        },
        onComplete: (metrics, artifacts) => {
          this.isRunning = false
          this.logToConsole(`SUCCESS: Registration completed with RMSE: ${metrics.registration_error || (metrics.rmse ? `${metrics.rmse.toFixed(3)} px` : 'nominal')}`)
          this.onCompleteCallback(metrics, artifacts)
        },
        onError: (err) => {
          this.isRunning = false
          this.logToConsole(`ERROR: ${err}`)
          this.onErrorCallback(err)
        }
      })
    } catch (err) {
      this.isRunning = false
      const errorMsg = err instanceof Error ? err.message : String(err)
      this.logToConsole(`EXECUTION EXCEPTION: ${errorMsg}`)
      this.onErrorCallback(errorMsg)
    }
  }

  public cancel() {
    if (this.cleanupSub) {
      this.cleanupSub()
      this.cleanupSub = null
    }
    this.isRunning = false
    this.logToConsole(`User requested pipeline abortion.`)
  }

  public getIsRunning() {
    return this.isRunning
  }
}
