/**
 * LunarHero: Realistic Three.js 3D Moon & Chandrayaan-1 Orbital Visualization
 * Incorporates the high-fidelity 3D normal-mapped Moon model from Tomislav Jezidžić (CodePen)
 * combined with synchronized ISRO coordinate grid, polar orbit, moving spacecraft, and axis reticles.
 */

import * as THREE from 'three'

interface Star {
  x: number
  y: number
  size: number
  alpha: number
  baseAlpha: number
  twinkleSpeed: number
}

export class LunarHero {
  private wrapper: HTMLDivElement
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private container: HTMLElement
  private animationFrameId: number | null = null

  // Three.js 3D Scene components
  private scene!: THREE.Scene
  private camera!: THREE.PerspectiveCamera
  private renderer!: THREE.WebGLRenderer
  private moonMesh!: THREE.Mesh
  private pointLight!: THREE.PointLight
  private readonly moonRadius3D = 8.5
  private readonly cameraDist = 25.0

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

  // TMC Imaging Footprint (approx latitude & longitude for active pair scene)
  private swathLat = 0.18 // ~10 deg N
  private swathLon = 0.48 // ~27.5 deg E (near Mare Tranquillitatis)

  // Sub-spacecraft telemetry indicators
  private scLatText = '00°00\'00" N'
  private scLonText = '00°00\'00" E'
  private scAltText = '100.2 km'

  constructor(container: HTMLElement) {
    this.container = container

    this.wrapper = document.createElement('div')
    this.wrapper.className = 'lunar-hero-wrapper'
    this.wrapper.style.position = 'relative'
    this.wrapper.style.width = '100%'
    this.wrapper.style.height = '100%'
    this.wrapper.style.overflow = 'hidden'
    this.wrapper.style.cursor = 'grab'
    this.wrapper.style.userSelect = 'none'

    this.initThree()

    this.canvas = document.createElement('canvas')
    this.canvas.className = 'lunar-canvas-overlay'
    this.canvas.style.position = 'absolute'
    this.canvas.style.top = '0'
    this.canvas.style.left = '0'
    this.canvas.style.pointerEvents = 'none'
    this.ctx = this.canvas.getContext('2d')!

    this.wrapper.appendChild(this.renderer.domElement)
    this.wrapper.appendChild(this.canvas)

    this.initCanvas()
    this.initStars()
    this.setupEvents()
    this.render()
  }

  private initThree() {
    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000)
    this.camera.position.z = this.cameraDist

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    this.renderer.setClearColor(0x020612, 1)
    this.renderer.setPixelRatio(window.devicePixelRatio || 1)
    this.renderer.domElement.style.position = 'absolute'
    this.renderer.domElement.style.top = '0'
    this.renderer.domElement.style.left = '0'
    this.renderer.domElement.style.width = '100%'
    this.renderer.domElement.style.height = '100%'

    // 1. Primary Directional Sunlight (Crisp solar rays from deep space, creating realistic terminator relief)
    const sunLight = new THREE.DirectionalLight(0xffffff, 2.4)
    sunLight.position.set(-50, 20, 30)
    this.scene.add(sunLight)

    // 2. Interactive Cursor Light (Subtle local rim relief highlight)
    this.pointLight = new THREE.PointLight(0xffffff, 0.7, 0, 0)
    this.pointLight.position.set(-20, 15, 25)
    this.scene.add(this.pointLight)

    // 3. Ambient Cosmic Illumination (Realistic deep space Earthshine; preserves terminator contrast)
    const ambientLight = new THREE.AmbientLight(0x1e293b, 0.38)
    this.scene.add(ambientLight)

    // 4. Directional Lunar Limb Accent
    const rimLight = new THREE.DirectionalLight(0x38bdf8, 0.35)
    rimLight.position.set(50, -30, -25)
    this.scene.add(rimLight)

    // High definition 3D Moon sphere geometry
    const geometry = new THREE.SphereGeometry(this.moonRadius3D, 64, 64)

    // Normal-mapped lunar regolith material: matte retro-reflection, subtle specular
    const material = new THREE.MeshPhongMaterial({
      color: 0xffffff,
      shininess: 2,
      specular: 0x181818
    })

    const texLoader = new THREE.TextureLoader()

    // 1. Albedo diffuse map (NASA lunar surface)
    texLoader.load(
      '/moon_map.jpg',
      (tex) => {
        tex.wrapS = THREE.RepeatWrapping
        tex.wrapT = THREE.ClampToEdgeWrapping
        tex.colorSpace = THREE.SRGBColorSpace
        material.map = tex
        material.needsUpdate = true
      },
      undefined,
      () => {
        texLoader.load(
          'https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets/moon_1024.jpg',
          (tex) => {
            tex.wrapS = THREE.RepeatWrapping
            tex.wrapT = THREE.ClampToEdgeWrapping
            tex.colorSpace = THREE.SRGBColorSpace
            material.map = tex
            material.needsUpdate = true
          }
        )
      }
    )

    // 2. High-resolution Normal bump map
    texLoader.load(
      '/moon_normal.png',
      (tex) => {
        tex.wrapS = THREE.RepeatWrapping
        tex.wrapT = THREE.ClampToEdgeWrapping
        material.normalMap = tex
        material.normalScale = new THREE.Vector2(2.2, 2.2)
        material.needsUpdate = true
      },
      undefined,
      () => {
        texLoader.load(
          'https://images-wixmp-ed30a86b8c4ca887773594c2.wixmp.com/i/06a094a4-7bd7-4bb9-b998-6c1e17f66c08/dbcju0k-b9b333e1-dd8d-4657-90db-7d3e7e179843.png',
          (tex) => {
            tex.wrapS = THREE.RepeatWrapping
            tex.wrapT = THREE.ClampToEdgeWrapping
            material.normalMap = tex
            material.normalScale = new THREE.Vector2(2.2, 2.2)
            material.needsUpdate = true
          }
        )
      }
    )

    this.moonMesh = new THREE.Mesh(geometry, material)
    this.scene.add(this.moonMesh)
  }

  private initCanvas() {
    const dpr = window.devicePixelRatio || 1
    const rect = this.container.getBoundingClientRect()
    const width = Math.floor(rect.width) || 800
    const height = Math.floor(rect.height) || 480

    this.renderer.setSize(width, height)
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()

    this.canvas.width = width * dpr
    this.canvas.height = height * dpr
    this.canvas.style.width = `${width}px`
    this.canvas.style.height = `${height}px`

    this.ctx.setTransform(1, 0, 0, 1, 0, 0)
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

    this.wrapper.addEventListener('mousedown', (e) => {
      this.isDragging = true
      this.lastMouseX = e.clientX
      this.lastMouseY = e.clientY
      this.wrapper.style.cursor = 'grabbing'
    })

    window.addEventListener('mousemove', (e) => {
      // Dynamic lighting reaction (CodePen)
      const rect = this.wrapper.getBoundingClientRect()
      const relX = (e.clientX - rect.left) / (rect.width || 1)
      const relY = (e.clientY - rect.top) / (rect.height || 1)
      if (this.pointLight) {
        this.pointLight.position.x = (relX * 2 - 1) * 25
        this.pointLight.position.y = (-(relY * 2 - 1)) * 18
        this.pointLight.position.z = 22
      }

      // Drag to rotate
      if (!this.isDragging) return
      const dx = e.clientX - this.lastMouseX
      const dy = e.clientY - this.lastMouseY

      this.rotY += dx * 0.005
      this.rotX = Math.max(-0.6, Math.min(0.6, this.rotX + dy * 0.005))

      this.lastMouseX = e.clientX
      this.lastMouseY = e.clientY
    })

    window.addEventListener('mouseup', () => {
      if (this.isDragging) {
        this.isDragging = false
        this.wrapper.style.cursor = 'grab'
      }
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
    if (this.renderer) {
      this.renderer.dispose()
    }
  }

  // 3D Spherical Projection for vector overlays
  private project3D(lon: number, lat: number, r: number, cx: number, cy: number): { x: number; y: number; visible: boolean; depth: number } {
    const l = lon + this.rotY
    const cosLat = Math.cos(lat)
    let x3 = r * cosLat * Math.sin(l)
    let y3 = -r * Math.sin(lat)
    let z3 = r * cosLat * Math.cos(l)

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
    const cy = h * 0.50

    // Synchronize 3D camera and mesh so Three.js 3D Moon sphere exactly aligns with (cx, cy)
    const fovHalfRad = (this.camera.fov * Math.PI) / 360
    const visibleHalfHeight = this.cameraDist * Math.tan(fovHalfRad)
    const pxPerUnit = (h / 2) / visibleHalfHeight
    const radius = this.moonRadius3D * pxPerUnit

    const moon3DX = (cx - w / 2) / pxPerUnit
    const moon3DY = -(cy - h / 2) / pxPerUnit
    if (this.moonMesh) {
      this.moonMesh.position.set(moon3DX, moon3DY, 0)
      this.moonMesh.rotation.y = this.rotY
      this.moonMesh.rotation.x = this.rotX
    }

    this.camera.position.set(0, 0, this.cameraDist)
    this.camera.lookAt(0, 0, 0)

    // Update rotation
    if (this.autoRotate && !this.isDragging) {
      this.rotY += this.MOON_ROT_SPEED
    }
    this.orbitAngle = (this.orbitAngle + this.ORBIT_SPEED) % (Math.PI * 2)

    // 1. Render realistic Three.js 3D Moon
    this.renderer.render(this.scene, this.camera)

    // 2. Clear 2D overlay canvas for overlays
    this.ctx.clearRect(0, 0, w, h)

    // 3. Draw Starfield (omits stars behind the lunar sphere)
    this.drawStarfield(cx, cy, radius)

    // 3b. Soft outer lunar atmosphere / corona glow
    const glowGrad = this.ctx.createRadialGradient(cx, cy, radius * 0.96, cx, cy, radius * 1.08)
    glowGrad.addColorStop(0, 'rgba(56, 189, 248, 0.20)')
    glowGrad.addColorStop(0.5, 'rgba(56, 189, 248, 0.07)')
    glowGrad.addColorStop(1, 'rgba(56, 189, 248, 0)')
    this.ctx.fillStyle = glowGrad
    this.ctx.beginPath()
    this.ctx.arc(cx, cy, radius * 1.08, 0, Math.PI * 2)
    this.ctx.fill()

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

  private drawStarfield(cx: number, cy: number, radius: number) {
    const pad = radius + 2
    for (const star of this.stars) {
      // Do not draw stars directly behind or on top of the moon disc
      const dist = Math.hypot(star.x - cx, star.y - cy)
      if (dist < pad) continue

      star.alpha += (Math.random() - 0.5) * star.twinkleSpeed
      if (star.alpha > star.baseAlpha + 0.3) star.alpha = star.baseAlpha + 0.3
      if (star.alpha < star.baseAlpha - 0.2) star.alpha = star.baseAlpha - 0.2

      this.ctx.fillStyle = `rgba(224, 242, 254, ${Math.max(0.05, star.alpha)})`
      this.ctx.beginPath()
      this.ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2)
      this.ctx.fill()
    }
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

      this.ctx.fillStyle = 'rgba(245, 158, 11, 0.22)'
      this.ctx.fill()

      this.ctx.strokeStyle = '#f59e0b'
      this.ctx.lineWidth = 1.5
      this.ctx.shadowColor = '#f59e0b'
      this.ctx.shadowBlur = 8
      this.ctx.stroke()

      this.ctx.shadowBlur = 0
      this.ctx.font = '9px "JetBrains Mono", monospace'
      this.ctx.fillStyle = '#fef08a'
      this.ctx.fillText('TMC PAIR_001', p2.x + 8, p2.y)

      this.ctx.restore()
    }
  }

  private drawOrbitAndSpacecraft(cx: number, cy: number, radius: number) {
    const orbitR = radius * 1.18

    // 1. Draw glowing Polar Orbit Ellipse
    this.ctx.save()
    this.ctx.beginPath()

    const steps = 90
    for (let i = 0; i <= steps; i++) {
      const theta = (i / steps) * Math.PI * 2
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

    // Solar panels
    this.ctx.fillStyle = '#0284c7'
    this.ctx.strokeStyle = '#38bdf8'
    this.ctx.lineWidth = 1

    this.ctx.fillRect(-12, -2, 8, 4)
    this.ctx.strokeRect(-12, -2, 8, 4)
    this.ctx.fillRect(4, -2, 8, 4)
    this.ctx.strokeRect(4, -2, 8, 4)

    // Satellite bus body
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

  public getCanvas(): HTMLElement {
    return this.wrapper
  }
}
