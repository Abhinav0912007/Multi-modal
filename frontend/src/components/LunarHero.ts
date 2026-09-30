/**
 * LunarHero: High-precision scientific Canvas 3D Moon & Chandrayaan-1 Orbital Visualization
 * Renders realistic illuminated lunar sphere with maria basins, crater rays,
 * vector coordinate grid (orthographic projection), and Chandrayaan orbital path.
 */

interface Star {
  x: number
  y: number
  size: number
  alpha: number
  baseAlpha: number
  twinkleSpeed: number
}

interface Crater {
  lon: number // in radians
  lat: number // in radians
  radius: number // in radians
  depth: number
  hasRays?: boolean
}

interface Maria {
  lon: number
  lat: number
  rx: number
  ry: number
  rot: number
  name: string
}

export class LunarHero {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private container: HTMLElement
  private animationFrameId: number | null = null

  // Rotation and interaction
  private rotY = -0.45 // Longitude rotation
  private rotX = 0.12  // Latitude tilt (sub-earth latitude ~ 6.8 deg)
  private autoRotate = true
  private isDragging = false
  private lastMouseX = 0
  private lastMouseY = 0

  // Display toggles
  private showGrid = true
  private showOrbit = true
  private showFootprint = true

  // Orbital simulation state
  private orbitAngle = 0 // angle along orbital path
  private readonly ORBIT_SPEED = 0.007 // radians per tick
  private readonly MOON_ROT_SPEED = 0.0006

  // Stars background
  private stars: Star[] = []

  // Prominent Lunar Features (scientifically located on lunar sphere)
  private craters: Crater[] = [
    { lon: -0.195, lat: -0.756, radius: 0.065, depth: 0.9, hasRays: true }, // Tycho (-11.2 deg, -43.3 deg)
    { lon: -0.349, lat: 0.169, radius: 0.07, depth: 0.85, hasRays: true },  // Copernicus (-20.0 deg, 9.7 deg)
    { lon: -0.663, lat: 0.141, radius: 0.04, depth: 0.7, hasRays: true },   // Kepler (-38.0 deg, 8.1 deg)
    { lon: -0.827, lat: 0.414, radius: 0.045, depth: 0.95 },                // Aristarchus (-47.4 deg, 23.7 deg)
    { lon: 0.035, lat: 0.170, radius: 0.045, depth: 0.6 },                  // Manilius (2.0 deg, 9.7 deg)
    { lon: 0.015, lat: -0.052, radius: 0.05, depth: 0.65 },                 // Ptolemaeus
    { lon: -0.035, lat: -0.276, radius: 0.05, depth: 0.7 },                 // Arzachel
    { lon: 0.401, lat: 0.140, radius: 0.04, depth: 0.6 },                   // Taruntius
    { lon: 0.698, lat: 0.105, radius: 0.045, depth: 0.7 },                  // Langrenus
    { lon: 0.297, lat: 0.354, radius: 0.05, depth: 0.65 },                  // Plinius
  ]

  private maria: Maria[] = [
    { lon: -0.314, lat: 0.558, rx: 0.36, ry: 0.28, rot: 0.1, name: 'Mare Imbrium' },
    { lon: -0.785, lat: 0.349, rx: 0.52, ry: 0.55, rot: -0.2, name: 'Oceanus Procellarum' },
    { lon: 0.314, lat: 0.488, rx: 0.24, ry: 0.20, rot: -0.1, name: 'Mare Serenitatis' },
    { lon: 0.541, lat: 0.148, rx: 0.26, ry: 0.22, rot: 0.15, name: 'Mare Tranquillitatis' },
    { lon: 1.030, lat: 0.297, rx: 0.18, ry: 0.16, rot: 0.05, name: 'Mare Crisium' },
    { lon: 0.890, lat: -0.052, rx: 0.22, ry: 0.20, rot: 0.3, name: 'Mare Fecunditatis' },
    { lon: 0.611, lat: -0.262, rx: 0.16, ry: 0.14, rot: -0.2, name: 'Mare Nectaris' },
    { lon: -0.279, lat: -0.349, rx: 0.25, ry: 0.18, rot: 0.1, name: 'Mare Nubium' },
    { lon: -0.384, lat: -0.488, rx: 0.20, ry: 0.15, rot: -0.1, name: 'Mare Humorum' },
  ]

  // TMC Imaging Footprint (approx latitude & longitude for active pair scene)
  private swathLat = 0.18 // ~10 deg N
  private swathLon = 0.48 // ~27.5 deg E (near Mare Tranquillitatis)

  // Sub-spacecraft telemetry indicators
  private scLatText = '00°00\'00" N'
  private scLonText = '00°00\'00" E'
  private scAltText = '100.2 km'

  constructor(container: HTMLElement) {
    this.container = container
    this.canvas = document.createElement('canvas')
    this.canvas.className = 'lunar-canvas'
    this.ctx = this.canvas.getContext('2d')!

    this.initCanvas()
    this.initStars()
    this.setupEvents()
    this.render()
  }

  private initCanvas() {
    const dpr = window.devicePixelRatio || 1
    const rect = this.container.getBoundingClientRect()
    const width = rect.width || 800
    const height = rect.height || 480

    this.canvas.width = width * dpr
    this.canvas.height = height * dpr
    this.canvas.style.width = `${width}px`
    this.canvas.style.height = `${height}px`

    this.ctx.scale(dpr, dpr)
  }

  private initStars() {
    this.stars = []
    const count = 180
    const w = this.canvas.width / (window.devicePixelRatio || 1)
    const h = this.canvas.height / (window.devicePixelRatio || 1)

    for (let i = 0; i < count; i++) {
      const baseAlpha = 0.2 + Math.random() * 0.7
      this.stars.push({
        x: Math.random() * w,
        y: Math.random() * h,
        size: Math.random() < 0.8 ? 1 : Math.random() * 1.8 + 1,
        alpha: baseAlpha,
        baseAlpha: baseAlpha,
        twinkleSpeed: 0.01 + Math.random() * 0.03
      })
    }
  }

  private setupEvents() {
    window.addEventListener('resize', () => {
      this.initCanvas()
      this.initStars()
    })

    this.canvas.addEventListener('mousedown', (e) => {
      this.isDragging = true
      this.lastMouseX = e.clientX
      this.lastMouseY = e.clientY
    })

    window.addEventListener('mousemove', (e) => {
      if (!this.isDragging) return
      const dx = e.clientX - this.lastMouseX
      const dy = e.clientY - this.lastMouseY

      this.rotY += dx * 0.005
      this.rotX = Math.max(-0.6, Math.min(0.6, this.rotX + dy * 0.005))

      this.lastMouseX = e.clientX
      this.lastMouseY = e.clientY
    })

    window.addEventListener('mouseup', () => {
      this.isDragging = false
    })
  }

  public toggleAutoRotate() {
    this.autoRotate = !this.autoRotate
    return this.autoRotate
  }

  public toggleGrid() {
    this.showGrid = !this.showGrid
    return this.showGrid
  }

  public toggleOrbit() {
    this.showOrbit = !this.showOrbit
    return this.showOrbit
  }

  public toggleFootprint() {
    this.showFootprint = !this.showFootprint
    return this.showFootprint
  }

  public resetView() {
    this.rotY = -0.45
    this.rotX = 0.12
  }

  public getTelemetry() {
    return {
      scLat: this.scLatText,
      scLon: this.scLonText,
      altitude: this.scAltText,
      velocity: '1.633 km/s',
      subSolar: '01°12\' S, 44°30\' W',
      sunAngle: '42.8° Incidence',
      cameraMode: 'TMC-Stereo (Fore/Nadir/Aft)'
    }
  }

  public destroy() {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId)
    }
  }

  // 3D Spherical Projection helpers
  private project3D(lon: number, lat: number, r: number, cx: number, cy: number): { x: number; y: number; visible: boolean; depth: number } {
    // Apply Y-axis rotation (longitude)
    const l = lon + this.rotY
    // 3D Cartesian coordinates on sphere
    const cosLat = Math.cos(lat)
    let x3 = r * cosLat * Math.sin(l)
    let y3 = -r * Math.sin(lat)
    let z3 = r * cosLat * Math.cos(l)

    // Apply X-axis rotation (latitude tilt)
    const cosTilt = Math.cos(this.rotX)
    const sinTilt = Math.sin(this.rotX)
    const y3_t = y3 * cosTilt - z3 * sinTilt
    const z3_t = y3 * sinTilt + z3 * cosTilt
    const x3_t = x3

    return {
      x: cx + x3_t,
      y: cy + y3_t,
      visible: z3_t > -r * 0.05,
      depth: z3_t / r
    }
  }

  private render = () => {
    const w = this.canvas.width / (window.devicePixelRatio || 1)
    const h = this.canvas.height / (window.devicePixelRatio || 1)
    const cx = w * 0.48
    const cy = h * 0.52
    const radius = Math.min(w, h) * 0.38

    // Clear frame
    this.ctx.fillStyle = '#020612'
    this.ctx.fillRect(0, 0, w, h)

    // Update animations
    if (this.autoRotate && !this.isDragging) {
      this.rotY += this.MOON_ROT_SPEED
    }
    this.orbitAngle = (this.orbitAngle + this.ORBIT_SPEED) % (Math.PI * 2)

    // 1. Draw Starfield
    this.drawStarfield()

    // 2. Draw Subtle Deep-Space Cosmic Dust
    const nebulaGrad = this.ctx.createRadialGradient(cx + 80, cy - 60, radius * 0.3, cx, cy, radius * 2.5)
    nebulaGrad.addColorStop(0, 'rgba(56, 189, 248, 0.04)')
    nebulaGrad.addColorStop(0.5, 'rgba(30, 58, 138, 0.03)')
    nebulaGrad.addColorStop(1, 'transparent')
    this.ctx.fillStyle = nebulaGrad
    this.ctx.fillRect(0, 0, w, h)

    // 3. Draw Lunar Sphere Base (with realistic illumination & terminator)
    this.drawLunarSphere(cx, cy, radius)

    // 4. Draw Coordinate / Grid Overlay
    if (this.showGrid) {
      this.drawCoordinateGrid(cx, cy, radius)
    }

    // 5. Draw TMC Swath / Scene Footprint on surface
    if (this.showFootprint) {
      this.drawTmcFootprint(cx, cy, radius)
    }

    // 6. Draw Chandrayaan-1 Polar Orbit & Spacecraft
    if (this.showOrbit) {
      this.drawOrbitAndSpacecraft(cx, cy, radius)
    }

    // 7. Draw Precision Optical Reticle & Scientific Axis Overlays
    this.drawReticleOverlay(cx, cy, radius)

    this.animationFrameId = requestAnimationFrame(this.render)
  }

  private drawStarfield() {
    for (const star of this.stars) {
      star.alpha += (Math.random() - 0.5) * star.twinkleSpeed
      if (star.alpha > star.baseAlpha + 0.3) star.alpha = star.baseAlpha + 0.3
      if (star.alpha < star.baseAlpha - 0.2) star.alpha = star.baseAlpha - 0.2

      this.ctx.fillStyle = `rgba(224, 242, 254, ${Math.max(0.05, star.alpha)})`
      this.ctx.beginPath()
      this.ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2)
      this.ctx.fill()
    }
  }

  private drawLunarSphere(cx: number, cy: number, radius: number) {
    this.ctx.save()

    // Create clipping circle for the Moon disk
    this.ctx.beginPath()
    this.ctx.arc(cx, cy, radius, 0, Math.PI * 2)
    this.ctx.clip()

    // Base lunar highland albedo
    this.ctx.fillStyle = '#1e2430'
    this.ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2)

    // Draw Maria Basins (dark basaltic plains)
    for (const m of this.maria) {
      const proj = this.project3D(m.lon, m.lat, radius, cx, cy)
      if (proj.visible && proj.depth > 0) {
        this.ctx.save()
        this.ctx.translate(proj.x, proj.y)
        this.ctx.rotate(m.rot + this.rotX * 0.5)
        
        // Scale with perspective depth
        const depthScale = Math.max(0.2, proj.depth)
        this.ctx.scale(depthScale, 1.0)

        const mareGrad = this.ctx.createRadialGradient(0, 0, 5, 0, 0, m.rx * radius)
        mareGrad.addColorStop(0, 'rgba(12, 16, 24, 0.85)')
        mareGrad.addColorStop(0.7, 'rgba(18, 24, 34, 0.7)')
        mareGrad.addColorStop(1, 'rgba(28, 36, 48, 0)')

        this.ctx.fillStyle = mareGrad
        this.ctx.beginPath()
        this.ctx.ellipse(0, 0, m.rx * radius, m.ry * radius, 0, 0, Math.PI * 2)
        this.ctx.fill()
        this.ctx.restore()
      }
    }

    // Draw Major Crater Ray Systems & Impacts
    for (const c of this.craters) {
      const proj = this.project3D(c.lon, c.lat, radius, cx, cy)
      if (proj.visible && proj.depth > 0.05) {
        const craterR = c.radius * radius * proj.depth

        // If crater has bright ray system (Tycho, Copernicus)
        if (c.hasRays) {
          this.ctx.strokeStyle = `rgba(203, 213, 225, ${0.18 * proj.depth})`
          this.ctx.lineWidth = 1
          const numRays = 14
          for (let i = 0; i < numRays; i++) {
            const rayAngle = (i / numRays) * Math.PI * 2
            const rayLength = radius * (0.35 + (i % 3) * 0.25) * proj.depth
            this.ctx.beginPath()
            this.ctx.moveTo(proj.x, proj.y)
            this.ctx.lineTo(
              proj.x + Math.cos(rayAngle) * rayLength,
              proj.y + Math.sin(rayAngle) * rayLength
            )
            this.ctx.stroke()
          }
        }

        // Crater rim & central peak
        const rimGrad = this.ctx.createRadialGradient(proj.x, proj.y, 1, proj.x, proj.y, craterR)
        rimGrad.addColorStop(0, `rgba(15, 23, 42, ${c.depth})`)
        rimGrad.addColorStop(0.7, `rgba(30, 41, 59, ${c.depth * 0.8})`)
        rimGrad.addColorStop(1, `rgba(203, 213, 225, ${0.4 * proj.depth})`)

        this.ctx.fillStyle = rimGrad
        this.ctx.beginPath()
        this.ctx.arc(proj.x, proj.y, Math.max(2, craterR), 0, Math.PI * 2)
        this.ctx.fill()
      }
    }

    // Sun Illumination & Terminator (Light coming from upper-left sun vector)
    const lightAngle = -Math.PI / 4 // 45 deg from top-left
    const lightX = cx + Math.cos(lightAngle) * radius * 0.8
    const lightY = cy + Math.sin(lightAngle) * radius * 0.8

    // Sunlit surface overlay
    const sunGrad = this.ctx.createRadialGradient(
      lightX, lightY, radius * 0.1,
      cx, cy, radius * 1.05
    )
    sunGrad.addColorStop(0, 'rgba(255, 255, 255, 0.45)')
    sunGrad.addColorStop(0.4, 'rgba(203, 213, 225, 0.2)')
    sunGrad.addColorStop(0.75, 'rgba(15, 23, 42, 0.4)')
    sunGrad.addColorStop(0.92, 'rgba(2, 6, 18, 0.92)')
    sunGrad.addColorStop(1, 'rgba(2, 6, 18, 0.99)')

    this.ctx.fillStyle = sunGrad
    this.ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2)

    // Terminator Shadow Boundary (Soft cosine day-to-night shading)
    const termGrad = this.ctx.createLinearGradient(
      cx - radius * 0.7, cy - radius * 0.7,
      cx + radius * 0.85, cy + radius * 0.85
    )
    termGrad.addColorStop(0, 'rgba(255, 255, 255, 0.1)')
    termGrad.addColorStop(0.5, 'rgba(0, 0, 0, 0.1)')
    termGrad.addColorStop(0.7, 'rgba(2, 6, 18, 0.85)')
    termGrad.addColorStop(1, 'rgba(1, 4, 12, 0.98)')

    this.ctx.fillStyle = termGrad
    this.ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2)

    this.ctx.restore()

    // Realistic Lunar Limb Glow / Space contrast
    const limbGrad = this.ctx.createRadialGradient(cx, cy, radius * 0.96, cx, cy, radius * 1.05)
    limbGrad.addColorStop(0, 'rgba(56, 189, 248, 0.25)')
    limbGrad.addColorStop(0.5, 'rgba(56, 189, 248, 0.08)')
    limbGrad.addColorStop(1, 'transparent')

    this.ctx.fillStyle = limbGrad
    this.ctx.beginPath()
    this.ctx.arc(cx, cy, radius * 1.05, 0, Math.PI * 2)
    this.ctx.fill()
  }

  private drawCoordinateGrid(cx: number, cy: number, radius: number) {
    this.ctx.save()

    // Clip to lunar sphere
    this.ctx.beginPath()
    this.ctx.arc(cx, cy, radius - 0.5, 0, Math.PI * 2)
    this.ctx.clip()

    // 1. Latitude Parallels (-60°, -30°, 0° Equator, +30°, +60°)
    const latitudes = [-60, -45, -30, -15, 0, 15, 30, 45, 60]
    for (const latDeg of latitudes) {
      const latRad = (latDeg * Math.PI) / 180
      const isEquator = latDeg === 0

      this.ctx.strokeStyle = isEquator
        ? 'rgba(56, 189, 248, 0.45)'
        : 'rgba(56, 189, 248, 0.16)'
      this.ctx.lineWidth = isEquator ? 1.5 : 1

      this.ctx.beginPath()
      let started = false

      for (let lonDeg = -180; lonDeg <= 180; lonDeg += 3) {
        const lonRad = (lonDeg * Math.PI) / 180
        const proj = this.project3D(lonRad, latRad, radius, cx, cy)

        if (proj.visible && proj.depth > 0) {
          if (!started) {
            this.ctx.moveTo(proj.x, proj.y)
            started = true
          } else {
            this.ctx.lineTo(proj.x, proj.y)
          }
        } else {
          started = false
        }
      }
      this.ctx.stroke()
    }

    // 2. Longitude Meridians (every 30 deg)
    for (let lonDeg = -180; lonDeg < 180; lonDeg += 30) {
      const lonRad = (lonDeg * Math.PI) / 180
      const isPrime = lonDeg === 0

      this.ctx.strokeStyle = isPrime
        ? 'rgba(245, 158, 11, 0.45)'
        : 'rgba(56, 189, 248, 0.16)'
      this.ctx.lineWidth = isPrime ? 1.5 : 1

      this.ctx.beginPath()
      let started = false

      for (let latDeg = -85; latDeg <= 85; latDeg += 3) {
        const latRad = (latDeg * Math.PI) / 180
        const proj = this.project3D(lonRad, latRad, radius, cx, cy)

        if (proj.visible && proj.depth > 0) {
          if (!started) {
            this.ctx.moveTo(proj.x, proj.y)
            started = true
          } else {
            this.ctx.lineTo(proj.x, proj.y)
          }
        } else {
          started = false
        }
      }
      this.ctx.stroke()
    }

    this.ctx.restore()
  }

  private drawTmcFootprint(cx: number, cy: number, radius: number) {
    // Project TMC imaging swath rectangle onto rotating lunar surface
    const p1 = this.project3D(this.swathLon - 0.04, this.swathLat + 0.12, radius, cx, cy)
    const p2 = this.project3D(this.swathLon + 0.04, this.swathLat + 0.12, radius, cx, cy)
    const p3 = this.project3D(this.swathLon + 0.04, this.swathLat - 0.12, radius, cx, cy)
    const p4 = this.project3D(this.swathLon - 0.04, this.swathLat - 0.12, radius, cx, cy)

    if (p1.visible && p2.visible && p3.visible && p4.visible && p1.depth > 0.1) {
      this.ctx.save()
      this.ctx.beginPath()
      this.ctx.moveTo(p1.x, p1.y)
      this.ctx.lineTo(p2.x, p2.y)
      this.ctx.lineTo(p3.x, p3.y)
      this.ctx.lineTo(p4.x, p4.y)
      this.ctx.closePath()

      // Glowing golden swatch fill
      this.ctx.fillStyle = 'rgba(245, 158, 11, 0.22)'
      this.ctx.fill()

      this.ctx.strokeStyle = '#f59e0b'
      this.ctx.lineWidth = 1.5
      this.ctx.shadowColor = '#f59e0b'
      this.ctx.shadowBlur = 8
      this.ctx.stroke()

      // Swath Label Tag
      this.ctx.shadowBlur = 0
      this.ctx.font = '9px "JetBrains Mono", monospace'
      this.ctx.fillStyle = '#fef08a'
      this.ctx.fillText('TMC PAIR_001', p2.x + 8, p2.y)

      this.ctx.restore()
    }
  }

  private drawOrbitAndSpacecraft(cx: number, cy: number, radius: number) {
    // Chandrayaan-1 was in a 100 km polar orbit (~89.9 deg inclination)
    // Orbit radius in canvas coordinates
    const orbitR = radius * 1.18

    // 1. Draw glowing Polar Orbit Ellipse
    this.ctx.save()
    this.ctx.beginPath()

    const steps = 90
    for (let i = 0; i <= steps; i++) {
      const theta = (i / steps) * Math.PI * 2
      // Polar orbit inclined slightly to viewer
      const ox = cx + Math.sin(theta) * orbitR * 0.35
      const oy = cy - Math.cos(theta) * orbitR

      if (i === 0) this.ctx.moveTo(ox, oy)
      else this.ctx.lineTo(ox, oy)
    }

    this.ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)'
    this.ctx.lineWidth = 1.2
    this.ctx.setLineDash([4, 4])
    this.ctx.stroke()
    this.ctx.setLineDash([])
    this.ctx.restore()

    // 2. Spacecraft Position on Orbit
    const scX = cx + Math.sin(this.orbitAngle) * orbitR * 0.35
    const scY = cy - Math.cos(this.orbitAngle) * orbitR

    // Calculate sub-spacecraft lat/lon for HUD
    const normY = (cy - scY) / orbitR
    const scLatDeg = Math.asin(Math.max(-1, Math.min(1, normY))) * (180 / Math.PI)
    const scLonDeg = (((this.orbitAngle * 180) / Math.PI - (this.rotY * 180) / Math.PI) % 360 + 360) % 360 - 180

    const latHemi = scLatDeg >= 0 ? 'N' : 'S'
    const lonHemi = scLonDeg >= 0 ? 'E' : 'W'
    this.scLatText = `${Math.abs(scLatDeg).toFixed(2)}° ${latHemi}`
    this.scLonText = `${Math.abs(scLonDeg).toFixed(2)}° ${lonHemi}`

    // 3. Draw Optical Nadir Sensor Ray projection to Moon surface
    this.ctx.save()
    const targetSurfaceY = cy - Math.cos(this.orbitAngle) * radius
    const targetSurfaceX = cx + Math.sin(this.orbitAngle) * radius * 0.35

    const rayGrad = this.ctx.createLinearGradient(scX, scY, targetSurfaceX, targetSurfaceY)
    rayGrad.addColorStop(0, 'rgba(56, 189, 248, 0.8)')
    rayGrad.addColorStop(1, 'rgba(56, 189, 248, 0.05)')

    this.ctx.beginPath()
    this.ctx.moveTo(scX, scY)
    this.ctx.lineTo(targetSurfaceX - 10, targetSurfaceY)
    this.ctx.lineTo(targetSurfaceX + 10, targetSurfaceY)
    this.ctx.closePath()
    this.ctx.fillStyle = rayGrad
    this.ctx.fill()

    // 4. Draw Spacecraft Icon & Solar Array
    this.ctx.translate(scX, scY)
    this.ctx.shadowColor = '#38bdf8'
    this.ctx.shadowBlur = 10

    // Solar panels (blue rectangles)
    this.ctx.fillStyle = '#0284c7'
    this.ctx.strokeStyle = '#38bdf8'
    this.ctx.lineWidth = 1

    // Left panel
    this.ctx.fillRect(-12, -2, 8, 4)
    this.ctx.strokeRect(-12, -2, 8, 4)
    // Right panel
    this.ctx.fillRect(4, -2, 8, 4)
    this.ctx.strokeRect(4, -2, 8, 4)

    // Satellite bus body (gold foil cube)
    this.ctx.fillStyle = '#f59e0b'
    this.ctx.fillRect(-3, -3, 6, 6)
    this.ctx.strokeStyle = '#fef08a'
    this.ctx.strokeRect(-3, -3, 6, 6)

    // Satellite Tag
    this.ctx.shadowBlur = 0
    this.ctx.font = '10px "JetBrains Mono", monospace'
    this.ctx.fillStyle = '#38bdf8'
    this.ctx.fillText('CH-1 TMC', 14, 3)

    this.ctx.restore()
  }

  private drawReticleOverlay(cx: number, cy: number, radius: number) {
    this.ctx.save()

    // Polar axis ticks
    this.ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)'
    this.ctx.lineWidth = 1

    // North Pole indicator
    const np = this.project3D(0, Math.PI / 2, radius, cx, cy)
    if (np.visible) {
      this.ctx.beginPath()
      this.ctx.arc(np.x, np.y, 3, 0, Math.PI * 2)
      this.ctx.fillStyle = '#38bdf8'
      this.ctx.fill()
      this.ctx.font = '9px "JetBrains Mono", monospace'
      this.ctx.fillText('NP [90°N]', np.x + 6, np.y - 4)
    }

    // South Pole indicator
    const sp = this.project3D(0, -Math.PI / 2, radius, cx, cy)
    if (sp.visible) {
      this.ctx.beginPath()
      this.ctx.arc(sp.x, sp.y, 3, 0, Math.PI * 2)
      this.ctx.fillStyle = '#38bdf8'
      this.ctx.fill()
      this.ctx.font = '9px "JetBrains Mono", monospace'
      this.ctx.fillText('SP [90°S]', sp.x + 6, sp.y + 10)
    }

    // Crosshairs on quadrant edges
    const chLength = 12
    const edges = [
      { x: cx - radius - 15, y: cy, dx: chLength, dy: 0 },
      { x: cx + radius + 15, y: cy, dx: -chLength, dy: 0 },
      { x: cx, y: cy - radius - 15, dx: 0, dy: chLength },
      { x: cx, y: cy + radius + 15, dx: 0, dy: -chLength }
    ]

    for (const e of edges) {
      this.ctx.beginPath()
      this.ctx.moveTo(e.x, e.y)
      this.ctx.lineTo(e.x + e.dx, e.y + e.dy)
      this.ctx.stroke()
    }

    this.ctx.restore()
  }

  public getCanvas(): HTMLCanvasElement {
    return this.canvas
  }
}
