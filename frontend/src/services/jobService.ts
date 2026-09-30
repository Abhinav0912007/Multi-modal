/**
 * JobService: Asynchronous Job Management & Real-time Telemetry Service
 * Connects to /api/v1/registration/jobs and Server-Sent Events (SSE).
 */

export interface JobState {
  job_id: string
  pair_id: string
  status: 'queued' | 'processing' | 'completed' | 'failed'
  progress: number
  current_step: number
  total_steps: number
  step_message: string
  error?: string | null
  started_at?: string
  completed_at?: string
  elapsed_seconds?: number
  metrics?: Record<string, any>
  matrix?: number[][] | null
  artifacts?: string[] | Record<string, string>
  logs?: string[]
}

export type JobListener = (job: JobState) => void

class JobService {
  private activeJob: JobState | null = null
  private listeners: Set<JobListener> = new Set()
  private eventSource: EventSource | null = null
  private pollInterval: number | null = null

  constructor() {
    // Restore any active job from sessionStorage
    const saved = sessionStorage.getItem('chandracrawl_active_job')
    if (saved) {
      try {
        this.activeJob = JSON.parse(saved)
        if (this.activeJob && (this.activeJob.status === 'processing' || this.activeJob.status === 'queued')) {
          this.listenToJob(this.activeJob.job_id)
        }
      } catch (e) {
        sessionStorage.removeItem('chandracrawl_active_job')
      }
    }
  }

  public subscribe(listener: JobListener): () => void {
    this.listeners.add(listener)
    if (this.activeJob) {
      listener(this.activeJob)
    }
    return () => this.listeners.delete(listener)
  }

  private notify() {
    if (!this.activeJob) return
    sessionStorage.setItem('chandracrawl_active_job', JSON.stringify(this.activeJob))
    for (const listener of this.listeners) {
      try {
        listener(this.activeJob)
      } catch (err) {
        console.error('Error in job listener:', err)
      }
    }
  }

  public getActiveJob(): JobState | null {
    return this.activeJob
  }

  public async startRegistrationJob(pairId: string, transformType: string = 'homography'): Promise<JobState> {
    const payload = {
      pair_id: pairId,
      transform_type: transformType,
      nfeatures: 15000,
      ratio_thresh: 0.75,
      grid_size: 8,
      ransac_thresh: 3.0,
      do_subpixel: true
    }

    const res = await fetch('/api/v1/registration/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })

    if (!res.ok) {
      throw new Error(`Failed to submit job: ${res.statusText}`)
    }

    const data = await res.json()
    this.activeJob = {
      job_id: data.job_id,
      pair_id: pairId,
      status: data.status || 'queued',
      progress: 0,
      current_step: 0,
      total_steps: 10,
      step_message: 'Queued in scientific processing pool',
      logs: [`[${new Date().toLocaleTimeString()}] Registration job submitted: ${data.job_id}`]
    }
    this.notify()
    this.listenToJob(data.job_id)
    return this.activeJob
  }

  public listenToJob(jobId: string) {
    if (this.eventSource) {
      this.eventSource.close()
      this.eventSource = null
    }
    if (this.pollInterval) {
      clearInterval(this.pollInterval)
      this.pollInterval = null
    }

    // 1. Try Server-Sent Events (SSE)
    try {
      this.eventSource = new EventSource(`/api/v1/jobs/${jobId}/events`)
      this.eventSource.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data)
          this.handleEventPayload(payload)
        } catch (e) {
          // heartbeat
        }
      }
      this.eventSource.onerror = () => {
        // Fallback to polling if SSE encounters network disconnect
        if (this.eventSource) {
          this.eventSource.close()
          this.eventSource = null
        }
        this.startPolling(jobId)
      }
    } catch (e) {
      this.startPolling(jobId)
    }
  }

  private startPolling(jobId: string) {
    if (this.pollInterval) return
    this.pollInterval = window.setInterval(async () => {
      try {
        const res = await fetch(`/api/v1/jobs/${jobId}`)
        if (res.ok) {
          const data = await res.json()
          this.handleEventPayload(data)
          if (data.status === 'completed' || data.status === 'failed') {
            if (this.pollInterval) {
              clearInterval(this.pollInterval)
              this.pollInterval = null
            }
          }
        }
      } catch (err) {
        console.warn('Job polling error:', err)
      }
    }, 800)
  }

  private handleEventPayload(data: any) {
    if (!this.activeJob) {
      this.activeJob = {
        job_id: data.job_id,
        pair_id: data.pair_id || 'pair_001',
        status: data.status || 'processing',
        progress: data.progress || 0,
        current_step: data.step || data.current_step || 0,
        total_steps: data.total_steps || 10,
        step_message: data.message || data.step_message || '',
        logs: []
      }
    }

    this.activeJob.status = data.status || this.activeJob.status
    this.activeJob.progress = typeof data.progress === 'number' ? data.progress : this.activeJob.progress
    this.activeJob.current_step = data.step || data.current_step || this.activeJob.current_step
    this.activeJob.step_message = data.message || data.step_message || this.activeJob.step_message

    if (data.metrics) this.activeJob.metrics = data.metrics
    if (data.matrix) this.activeJob.matrix = data.matrix
    if (data.artifacts) this.activeJob.artifacts = data.artifacts
    if (data.error) this.activeJob.error = data.error

    if (!this.activeJob.logs) this.activeJob.logs = []
    if (this.activeJob.step_message) {
      const logLine = `[Step ${this.activeJob.current_step}/10] ${this.activeJob.step_message}`
      if (!this.activeJob.logs.includes(logLine)) {
        this.activeJob.logs.push(logLine)
      }
    }

    if (this.activeJob.status === 'completed' || this.activeJob.status === 'failed') {
      if (this.eventSource) {
        this.eventSource.close()
        this.eventSource = null
      }
      if (this.pollInterval) {
        clearInterval(this.pollInterval)
        this.pollInterval = null
      }
    }

    this.notify()
  }

  public async fetchHistoricalJobs(): Promise<any[]> {
    try {
      const res = await fetch('/api/v1/jobs')
      if (res.ok) {
        return await res.json()
      }
    } catch (e) {
      console.warn('Failed to fetch historical jobs:', e)
    }
    return []
  }

  public clearActiveJob() {
    this.activeJob = null
    sessionStorage.removeItem('chandracrawl_active_job')
    if (this.eventSource) {
      this.eventSource.close()
      this.eventSource = null
    }
    if (this.pollInterval) {
      clearInterval(this.pollInterval)
      this.pollInterval = null
    }
    for (const listener of this.listeners) {
      listener(null as any)
    }
  }
}

export const jobService = new JobService()
