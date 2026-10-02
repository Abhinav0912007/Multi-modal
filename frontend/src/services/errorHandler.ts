/**
 * Error Handling & Accessibility Diagnostics Utility
 * ISRO Chandrayaan TMC Lunar Image Registration System
 * 
 * Provides:
 * 1. Human-readable translation of technical errors (e.g. 500 -> "Unable to process the selected raster...")
 * 2. Expandable technical diagnostics for scientific auditability
 * 3. Standardized loading, success, error, and empty state builders
 * 4. High-contrast, screen-reader friendly notification dispatcher
 */

export interface FormattedError {
  title: string
  message: string
  actionAdvice: string
  technicalDetails: string
  status?: number
}

/**
 * Transforms any technical error (Error, HTTP status, string) into a polite,
 * human-readable scientific message while keeping full diagnostics accessible.
 */
export function formatHumanReadableError(err: any): FormattedError {
  let rawMsg = ''
  let status: number | undefined

  if (err instanceof Error) {
    rawMsg = err.message
  } else if (typeof err === 'string') {
    rawMsg = err
  } else if (err && typeof err === 'object') {
    rawMsg = err.message || err.detail || err.error || JSON.stringify(err)
    if (typeof err.status === 'number') status = err.status
  }

  // Detect HTTP status code in message if not explicitly provided
  if (!status) {
    const statusMatch = rawMsg.match(/\b(400|401|403|404|408|409|422|500|502|503|504)\b/)
    if (statusMatch) {
      status = parseInt(statusMatch[1], 10)
    }
  }

  const stack = err instanceof Error && err.stack ? err.stack : undefined
  const timestamp = new Date().toISOString()
  const technicalDetails = `[Timestamp]: ${timestamp}\n[Raw Message]: ${rawMsg || 'Unknown exception'}${status ? `\n[HTTP Code]: ${status}` : ''}${stack ? `\n[Stack Trace]:\n${stack}` : ''}`

  // Categorize into user-friendly messages
  if (status === 500 || rawMsg.toLowerCase().includes('500') || rawMsg.toLowerCase().includes('internal server error')) {
    return {
      title: 'Raster Processing Notice',
      message: 'Unable to process the selected raster. Check the dataset and try again.',
      actionAdvice: 'Verify that the raster files exist on disk, or select another data product from the catalog.',
      technicalDetails,
      status: 500,
    }
  }

  if (status === 404 || rawMsg.toLowerCase().includes('404') || rawMsg.toLowerCase().includes('not found')) {
    return {
      title: 'Dataset Product Not Found',
      message: 'The requested lunar raster product or artifact could not be located in the archive.',
      actionAdvice: 'Select an available pair from the Mission Control dropdown or rebuild the product catalog.',
      technicalDetails,
      status: 404,
    }
  }

  if (status === 422 || rawMsg.toLowerCase().includes('unprocessable') || rawMsg.toLowerCase().includes('validation error')) {
    return {
      title: 'Parameter Validation Notice',
      message: 'The submitted coordinates or algorithm parameters are outside calibrated sensor limits.',
      actionAdvice: 'Verify ROI sample/line boundary extents and RANSAC threshold settings, then retry.',
      technicalDetails,
      status: 422,
    }
  }

  if (
    rawMsg.toLowerCase().includes('fetch') ||
    rawMsg.toLowerCase().includes('network') ||
    rawMsg.toLowerCase().includes('connection') ||
    status === 502 ||
    status === 503 ||
    status === 504
  ) {
    return {
      title: 'Telemetry Connection Notice',
      message: 'Unable to establish communication with the lunar telemetry server. Using high-fidelity local simulation.',
      actionAdvice: 'The system has fallen back to autonomous client mode with full analytical capabilities.',
      technicalDetails,
      status: status || 503,
    }
  }

  if (rawMsg.toLowerCase().includes('homography') || rawMsg.toLowerCase().includes('singular') || rawMsg.toLowerCase().includes('converge')) {
    return {
      title: 'Geometric Convergence Notice',
      message: 'RANSAC was unable to converge on a valid 3×3 projective homography for this region.',
      actionAdvice: 'Adjust the ROI boundaries to include higher contrast craters or increase feature count in Feature Correspondence.',
      technicalDetails,
      status,
    }
  }

  if (rawMsg.toLowerCase().includes('match') || rawMsg.toLowerCase().includes('insufficient')) {
    return {
      title: 'Correspondence Density Notice',
      message: 'Insufficient landmark matches detected between source and reference imagery.',
      actionAdvice: 'Expand the target ROI window or apply CLAHE radiometric contrast equalization.',
      technicalDetails,
      status,
    }
  }

  if (rawMsg.toLowerCase().includes('crop') || rawMsg.toLowerCase().includes('sub-scene') || rawMsg.toLowerCase().includes('bounds')) {
    return {
      title: 'Sub-Scene Extraction Notice',
      message: 'Unable to extract sub-scene raster crop at the specified pixel coordinates.',
      actionAdvice: 'Reset coordinates to the nominal calibrated footprint or click Auto-Detect Terrain.',
      technicalDetails,
      status,
    }
  }

  // Fallback default message
  return {
    title: 'Scientific Execution Notice',
    message: rawMsg ? `Unable to complete the operation: ${sanitizeShortError(rawMsg)}` : 'Unable to complete the selected raster processing step.',
    actionAdvice: 'Check the dataset parameters and try again, or consult technical diagnostics below.',
    technicalDetails,
    status,
  }
}

function sanitizeShortError(msg: string): string {
  // Strip out raw URLs or JSON strings from main user-facing message
  if (msg.includes('http')) {
    return 'The remote telemetry service returned an unexpected response.'
  }
  if (msg.length > 120) {
    return msg.substring(0, 117) + '...'
  }
  return msg
}

/**
 * Generates an accessible, human-readable error card with an expandable
 * technical diagnostic section and optional retry/action buttons.
 */
export function renderErrorBannerHtml(
  err: any,
  options: {
    retryBtnId?: string
    retryBtnText?: string
    secondaryBtnHtml?: string
    compact?: boolean
  } = {}
): string {
  const formatted = formatHumanReadableError(err)
  const retryBtn = options.retryBtnId
    ? `<button id="${options.retryBtnId}" class="hud-btn hud-btn-primary" aria-label="Retry failed operation">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="1 4 1 10 7 10"/><polyline points="23 20 23 14 17 14"/><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/>
        </svg>
        ${options.retryBtnText || 'Retry Operation'}
       </button>`
    : ''

  const secondary = options.secondaryBtnHtml || ''

  return `
    <div class="glass-panel error-diagnostic-card ${options.compact ? 'compact' : ''}" role="alert" aria-live="assertive">
      <div class="error-card-header">
        <div class="error-icon-box" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
        </div>
        <div class="error-header-text">
          <h3 class="error-title">${escapeHtml(formatted.title)}</h3>
          <p class="error-message">${escapeHtml(formatted.message)}</p>
          <p class="error-advice"><strong>Recommended Action:</strong> ${escapeHtml(formatted.actionAdvice)}</p>
        </div>
      </div>

      ${(retryBtn || secondary) ? `
        <div class="error-actions-row">
          ${retryBtn}
          ${secondary}
        </div>
      ` : ''}

      <!-- Expandable Technical Diagnostic Details Section -->
      <details class="error-diagnostic-details">
        <summary class="error-diagnostic-summary" aria-label="Toggle technical diagnostics">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="chevron-icon">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
          Technical Diagnostics &amp; Telemetry Trace
          <span class="diagnostic-badge">${formatted.status ? `HTTP ${formatted.status}` : 'DIAGNOSTIC LOG'}</span>
        </summary>
        <div class="error-diagnostic-content">
          <div class="diagnostic-toolbar">
            <span>Raw System Exception Log</span>
            <button class="diagnostic-copy-btn" onclick="navigator.clipboard.writeText(this.closest('.error-diagnostic-content').querySelector('pre').textContent); this.textContent='Copied!'; setTimeout(()=>this.textContent='Copy Trace', 2000)">
              Copy Trace
            </button>
          </div>
          <pre class="error-diagnostic-pre" tabindex="0" role="region" aria-label="Technical error trace">${escapeHtml(formatted.technicalDetails)}</pre>
        </div>
      </details>
    </div>
  `
}

/**
 * Displays a global accessible notification toast with human-readable messaging
 * and expandable diagnostics if an error is present.
 */
export function showHumanToast(
  msgOrErr: any,
  type: 'info' | 'success' | 'warning' | 'error' = 'info',
  options: {
    duration?: number
    actionBtnText?: string
    onAction?: () => void
  } = {}
) {
  const existing = document.querySelector('.mission-accessible-toast')
  existing?.remove()

  const toast = document.createElement('div')
  toast.className = `mission-accessible-toast toast-${type}`
  toast.setAttribute('role', type === 'error' || type === 'warning' ? 'alert' : 'status')
  toast.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite')

  let title = ''
  let message = ''
  let diagnostics = ''

  if (type === 'error' || type === 'warning') {
    const formatted = formatHumanReadableError(msgOrErr)
    title = formatted.title
    message = formatted.message
    diagnostics = formatted.technicalDetails
  } else {
    message = typeof msgOrErr === 'string' ? msgOrErr : JSON.stringify(msgOrErr)
  }

  const iconSvg = type === 'success'
    ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--emerald-status)" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>`
    : type === 'error'
    ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--rose-alert)" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`
    : type === 'warning'
    ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--isro-gold)" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`
    : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--cyan-bright)" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`

  toast.innerHTML = `
    <div class="toast-main-content">
      <div class="toast-icon-wrap" aria-hidden="true">${iconSvg}</div>
      <div class="toast-text-wrap">
        ${title ? `<div class="toast-title">${escapeHtml(title)}</div>` : ''}
        <div class="toast-msg">${escapeHtml(message)}</div>
      </div>
      <button class="toast-close-btn" aria-label="Dismiss notification">&times;</button>
    </div>

    ${options.actionBtnText ? `
      <div class="toast-action-row">
        <button id="toast-action-btn" class="toast-action-btn">${escapeHtml(options.actionBtnText)}</button>
      </div>
    ` : ''}

    ${diagnostics ? `
      <details class="toast-diagnostics-dropdown">
        <summary class="toast-diagnostics-summary">Expand Diagnostics</summary>
        <pre class="toast-diagnostics-pre">${escapeHtml(diagnostics)}</pre>
      </details>
    ` : ''}
  `

  document.body.appendChild(toast)

  // Handlers
  toast.querySelector('.toast-close-btn')?.addEventListener('click', () => {
    toast.remove()
  })

  if (options.actionBtnText && options.onAction) {
    toast.querySelector('#toast-action-btn')?.addEventListener('click', () => {
      toast.remove()
      options.onAction!()
    })
  }

  const duration = options.duration || (type === 'error' ? 8000 : 4500)
  setTimeout(() => {
    if (document.body.contains(toast)) {
      toast.style.opacity = '0'
      toast.style.transform = 'translateY(12px)'
      setTimeout(() => toast.remove(), 350)
    }
  }, duration)
}

/**
 * Builds an accessible empty-state card with a mandatory actionable explanation of what the user should do next.
 */
export function renderEmptyDatasetState(options: {
  title?: string
  message: string
  actionNext: string
  actionBtnText?: string
  actionBtnId?: string
  secondaryBtnHtml?: string
  iconSvg?: string
}): string {
  const icon = options.iconSvg || `
    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
      <circle cx="12" cy="12" r="10"/>
      <line x1="8" y1="12" x2="16" y2="12"/>
      <ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(-30 12 12)"/>
    </svg>
  `

  return `
    <div class="glass-panel empty-state-actionable-card" role="region" aria-label="${escapeHtml(options.title || 'Empty State')}">
      <div class="empty-icon-wrap" aria-hidden="true">${icon}</div>
      <h3 class="empty-title">${escapeHtml(options.title || 'No Records Found')}</h3>
      <p class="empty-description">${escapeHtml(options.message)}</p>

      <div class="empty-next-steps-panel">
        <div class="next-step-badge">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 14 14"/></svg>
          What to do next:
        </div>
        <p class="next-step-text">${escapeHtml(options.actionNext)}</p>
      </div>

      ${(options.actionBtnText && options.actionBtnId) || options.secondaryBtnHtml ? `
        <div class="empty-actions-row">
          ${options.actionBtnText && options.actionBtnId ? `
            <button id="${options.actionBtnId}" class="hud-btn hud-btn-primary" aria-label="${escapeHtml(options.actionBtnText)}">
              ${escapeHtml(options.actionBtnText)}
            </button>
          ` : ''}
          ${options.secondaryBtnHtml || ''}
        </div>
      ` : ''}
    </div>
  `
}

function escapeHtml(str: string): string {
  if (!str) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
