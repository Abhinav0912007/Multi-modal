/**
 * LunarHero: Realistic Three.js 3D Moon & Chandrayaan Orbital Visualization
 * High-fidelity 3D normal-mapped Moon with true 3D orbital trajectory,
 * stylized Chandrayaan orbiter with nadir observation scanning, multi-modal
 * sensor modality sequencing (OHRC · TMC · IIRS), lunar reference indicator (LROC),
 * and subtle surface feature correspondence visualization.
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

// 3D Ellipse Curve for smooth, anti-aliased geometric tube rendering
class EllipseCurve3D extends THREE.Curve<THREE.Vector3> {
  a: number
  b: number
  constructor(a: number, b: number) {
    super()
    this.a = a
    this.b = b
  }
  getPoint(t: number, optionalTarget = new THREE.Vector3()) {
    const theta = t * Math.PI * 2
    return optionalTarget.set(this.a * Math.cos(theta), this.b * Math.sin(theta), 0)
  }
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

  // Moon & Orbital Scaling (Comfortable, non-clipped proportions)
  private readonly moonRadius3D = 6.2  // Reduced from 8.5 for elegant balance and zero orbit clipping
  private readonly cameraDist = 25.0

  // 3D Orbital System Hierarchy
  private orbitalSystem!: THREE.Group
  private orbitPlaneGroup!: THREE.Group
  private primaryOrbitLine!: THREE.Object3D
  private secondaryOrbitLine!: THREE.Object3D
  private spacecraftGroup!: THREE.Group
  private observationCone!: THREE.Mesh
  private surfaceFootprint!: THREE.Group
  private footprintRing!: THREE.Mesh
  private footprintCore!: THREE.Mesh

  // Surface Feature Correspondence Visualization
  private correspondenceGroup!: THREE.Group
  private correspondenceLines!: THREE.LineSegments
  private correspondencePoints!: THREE.Points

  // Orbit Geometry Parameters (calm 38-second scientific orbital period)
  private readonly orbitA = 9.2 // Semi-major axis (harmonious with radius 6.2)
  private readonly orbitB = 8.2 // Semi-minor axis
  private readonly orbitPeriodSec = 38.0
  private orbitAngle = 0.85 // initial scenic angle (in front of Moon)

  // Rotation and interaction
  private rotY = -0.45 // Longitude rotation
  private rotX = 0.12  // Latitude tilt (sub-earth latitude ~ 6.8 deg)
  private autoRotate = true
  private isDragging = false
  private lastMouseX = 0
  private lastMouseY = 0
  private readonly MOON_ROT_SPEED = 0.0005

  // Interactive Parallax
  private camTargetX = 0
  private camTargetY = 0

  // Accessibility: prefers-reduced-motion
  private prefersReducedMotion = false

  // Display toggles
  private showGrid = false
  private showOrbit = true // Primary orbit is active
  private showFootprint = true
  private showReticle = false

  // Starfield
  private stars: Star[] = []

  // Performance & lifecycle
  private isPaused: boolean = false
  private isVisible: boolean = true
  private observer: IntersectionObserver | null = null
  private lastTime = 0

  // Current Active Sensor Modality State
  private currentModality = 'OHRC'
  private currentModalityDesc = 'High-resolution optical'

  constructor(container: HTMLElement) {
    this.container = container

    this.wrapper = document.createElement('div')
    this.wrapper.className = 'lunar-hero-wrapper'
    this.wrapper.style.position = 'relative'
    this.wrapper.style.width = '100%'
    this.wrapper.style.height = '100%'
    this.wrapper.style.background = 'transparent'
    this.wrapper.style.overflow = 'hidden'
    this.wrapper.style.cursor = 'grab'
    this.wrapper.style.userSelect = 'none'

    this.checkReducedMotion()
    this.initThree()

    this.canvas = document.createElement('canvas')
    this.canvas.className = 'lunar-canvas-overlay'
    this.canvas.style.position = 'absolute'
    this.canvas.style.top = '0'
    this.canvas.style.left = '0'
    this.canvas.style.background = 'transparent'
    this.canvas.style.pointerEvents = 'none'
    this.ctx = this.canvas.getContext('2d')!

    this.wrapper.appendChild(this.renderer.domElement)
    this.wrapper.appendChild(this.canvas)

    this.initCanvas()
    this.initStars()
    this.setupEvents()
    this.setupIntersectionObserver()

    this.lastTime = performance.now()
    this.render()
  }

  private checkReducedMotion() {
    if (typeof window !== 'undefined' && window.matchMedia) {
      const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
      this.prefersReducedMotion = mediaQuery.matches
      mediaQuery.addEventListener('change', (e) => {
        this.prefersReducedMotion = e.matches
      })
    }
  }

  private setupIntersectionObserver() {
    if (typeof IntersectionObserver !== 'undefined') {
      this.observer = new IntersectionObserver((entries) => {
        const entry = entries[0]
        if (entry) {
          this.isVisible = entry.isIntersecting
          if (!this.isVisible) {
            this.pause()
          } else {
            this.resume()
          }
        }
      }, { threshold: 0.05 })
      this.observer.observe(this.container)
    }
  }

  public pause() {
    this.isPaused = true
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId)
      this.animationFrameId = null
    }
  }

  public resume() {
    if (this.isPaused && this.isVisible) {
      this.isPaused = false
      this.lastTime = performance.now()
      this.render()
    }
  }

  private initThree() {
    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000)
    this.camera.position.z = this.cameraDist

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    this.renderer.setClearColor(0x000000, 0)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    this.renderer.domElement.style.position = 'absolute'
    this.renderer.domElement.style.top = '0'
    this.renderer.domElement.style.left = '0'
    this.renderer.domElement.style.background = 'transparent'
    this.renderer.domElement.style.width = '100%'
    this.renderer.domElement.style.height = '100%'

    // 1. Primary Directional Sunlight
    const sunLight = new THREE.DirectionalLight(0xffffff, 2.5)
    sunLight.position.set(-50, 22, 35)
    this.scene.add(sunLight)

    // 2. Interactive Cursor Fill Light
    this.pointLight = new THREE.PointLight(0xffffff, 0.65, 0, 0)
    this.pointLight.position.set(-20, 15, 25)
    this.scene.add(this.pointLight)

    // 3. Ambient Cosmic Illumination (Earthshine deep navy)
    const ambientLight = new THREE.AmbientLight(0x1e293b, 0.42)
    this.scene.add(ambientLight)

    // 4. Directional Lunar Limb Accent (cool space rim light)
    const rimLight = new THREE.DirectionalLight(0x38bdf8, 0.4)
    rimLight.position.set(50, -30, -25)
    this.scene.add(rimLight)

    // 5. Build Orbital System Root Group
    this.orbitalSystem = new THREE.Group()
    this.scene.add(this.orbitalSystem)

    // 6. Realistic 3D Moon Sphere (Refined radius 6.2)
    const moonGeo = new THREE.SphereGeometry(this.moonRadius3D, 64, 64)
    const moonMat = new THREE.MeshPhongMaterial({
      color: 0xffffff,
      shininess: 2,
      specular: 0x181818
    })

    const texLoader = new THREE.TextureLoader()

    // 6a. Albedo Diffuse Map
    texLoader.load(
      '/moon_map.jpg',
      (tex) => {
        tex.wrapS = THREE.RepeatWrapping
        tex.wrapT = THREE.ClampToEdgeWrapping
        tex.colorSpace = THREE.SRGBColorSpace
        moonMat.map = tex
        moonMat.needsUpdate = true
      },
      undefined,
      () => {
        texLoader.load(
          'https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets/moon_1024.jpg',
          (tex) => {
            tex.wrapS = THREE.RepeatWrapping
            tex.wrapT = THREE.ClampToEdgeWrapping
            tex.colorSpace = THREE.SRGBColorSpace
            moonMat.map = tex
            moonMat.needsUpdate = true
          }
        )
      }
    )

    // 6b. High-Resolution Normal Bump Map
    texLoader.load(
      '/moon_normal.png',
      (tex) => {
        tex.wrapS = THREE.RepeatWrapping
        tex.wrapT = THREE.ClampToEdgeWrapping
        moonMat.normalMap = tex
        moonMat.normalScale = new THREE.Vector2(2.2, 2.2)
        moonMat.needsUpdate = true
      },
      undefined,
      () => {
        texLoader.load(
          'https://images-wixmp-ed30a86b8c4ca887773594c2.wixmp.com/i/06a094a4-7bd7-4bb9-b998-6c1e17f66c08/dbcju0k-b9b333e1-dd8d-4657-90db-7d3e7e179843.png',
          (tex) => {
            tex.wrapS = THREE.RepeatWrapping
            tex.wrapT = THREE.ClampToEdgeWrapping
            moonMat.normalMap = tex
            moonMat.normalScale = new THREE.Vector2(2.2, 2.2)
            moonMat.needsUpdate = true
          }
        )
      }
    )

    this.moonMesh = new THREE.Mesh(moonGeo, moonMat)
    this.orbitalSystem.add(this.moonMesh)

    // 7. Surface Feature Correspondence Constellation (Attached to Moon so it rotates with surface)
    this.createCorrespondenceFeatures()

    // 8. Orbital Plane Group (Spatially tilted in 3D around Moon with natural, graceful perspective)
    this.orbitPlaneGroup = new THREE.Group()
    this.orbitPlaneGroup.rotation.set(
      THREE.MathUtils.degToRad(24),
      THREE.MathUtils.degToRad(-16),
      THREE.MathUtils.degToRad(6)
    )
    this.orbitalSystem.add(this.orbitPlaneGroup)

    // 9. Primary and Secondary Orbit Geometry (Smooth 3D Tubes for razor-sharp visibility without distortion)
    this.createOrbitPaths()

    // 10. Procedural Chandrayaan Orbiter Spacecraft
    this.spacecraftGroup = this.createSpacecraftModel()
    this.orbitPlaneGroup.add(this.spacecraftGroup)

    // 11. Observation Scanning Beam & Footprint
    this.createObservationBeam()
  }

  /**
   * Builds the Primary Elliptical Orbit & Secondary Observation Reference Ring
   * Uses 3D smooth tube geometry for razor-sharp, anti-aliased, non-distorted visibility.
   */
  private createOrbitPaths() {
    // 1. Primary Orbit Path (Smooth 3D Tube with clean cyan glow, depth-tested)
    const primaryCurve = new EllipseCurve3D(this.orbitA, this.orbitB)
    const primaryGeo = new THREE.TubeGeometry(primaryCurve, 192, 0.024, 8, true)
    const primaryMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.72,
      depthTest: true
    })
    this.primaryOrbitLine = new THREE.Mesh(primaryGeo, primaryMat)
    this.orbitPlaneGroup.add(this.primaryOrbitLine)

    // Soft outer glow tube for primary orbit
    const glowGeo = new THREE.TubeGeometry(primaryCurve, 128, 0.055, 6, true)
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0x7dd3fc,
      transparent: true,
      opacity: 0.20,
      depthTest: true,
      blending: THREE.AdditiveBlending
    })
    const glowMesh = new THREE.Mesh(glowGeo, glowMat)
    this.orbitPlaneGroup.add(glowMesh)

    // 2. Secondary Subtle Observation Reference Ring (Ultra-faint reference ring)
    const secCurve = new EllipseCurve3D(this.orbitA * 1.14, this.orbitB * 1.14)
    const secGeo = new THREE.TubeGeometry(secCurve, 144, 0.012, 6, true)
    const secMat = new THREE.MeshBasicMaterial({
      color: 0x94a3b8,
      transparent: true,
      opacity: 0.22,
      depthTest: true
    })
    this.secondaryOrbitLine = new THREE.Mesh(secGeo, secMat)
    this.secondaryOrbitLine.rotation.x = THREE.MathUtils.degToRad(6)
    this.orbitPlaneGroup.add(this.secondaryOrbitLine)
  }

  /**
   * Procedural Chandrayaan Orbiter (Proportionally scaled for Moon radius 6.2)
   */
  private createSpacecraftModel(): THREE.Group {
    const sc = new THREE.Group()

    // Materials
    const busMat = new THREE.MeshStandardMaterial({
      color: 0x334155, // Metallic slate gray
      roughness: 0.35,
      metalness: 0.85
    })
    const goldMliMat = new THREE.MeshStandardMaterial({
      color: 0xd97706, // Amber gold MLI thermal foil
      roughness: 0.25,
      metalness: 0.9
    })
    const panelMat = new THREE.MeshStandardMaterial({
      color: 0x075985, // Deep solar navy
      roughness: 0.25,
      metalness: 0.7,
      emissive: 0x0369a1,
      emissiveIntensity: 0.16
    })
    const metalArmMat = new THREE.MeshStandardMaterial({
      color: 0x64748b,
      roughness: 0.4,
      metalness: 0.85
    })

    // 1. Central Bus Body (Oriented along flight axis)
    const busMesh = new THREE.Mesh(new THREE.BoxGeometry(0.40, 0.32, 0.32), busMat)
    sc.add(busMesh)

    // Gold MLI insulation plate on sun-facing deck
    const mliPlate = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.28), goldMliMat)
    mliPlate.position.set(0, 0, 0.165)
    sc.add(mliPlate)

    // Top equipment deck
    const deckMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.28, 0.08),
      new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5, metalness: 0.7 })
    )
    deckMesh.position.set(0, 0, 0.20)
    sc.add(deckMesh)

    // 2. Solar Array Wings (Extending along ±X axis)
    // Left Wing
    const leftArm = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.16, 8), metalArmMat)
    leftArm.rotation.z = Math.PI / 2
    leftArm.position.set(-0.28, 0, 0)
    sc.add(leftArm)

    const leftWing = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.28, 0.02), panelMat)
    leftWing.position.set(-0.68, 0, 0)
    sc.add(leftWing)

    const leftGrid = new THREE.Mesh(
      new THREE.BoxGeometry(0.69, 0.012, 0.025),
      new THREE.MeshBasicMaterial({ color: 0x38bdf8 })
    )
    leftGrid.position.set(-0.68, 0, 0)
    sc.add(leftGrid)

    // Right Wing
    const rightArm = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.16, 8), metalArmMat)
    rightArm.rotation.z = Math.PI / 2
    rightArm.position.set(0.28, 0, 0)
    sc.add(rightArm)

    const rightWing = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.28, 0.02), panelMat)
    rightWing.position.set(0.68, 0, 0)
    sc.add(rightWing)

    const rightGrid = new THREE.Mesh(
      new THREE.BoxGeometry(0.69, 0.012, 0.025),
      new THREE.MeshBasicMaterial({ color: 0x38bdf8 })
    )
    rightGrid.position.set(0.68, 0, 0)
    sc.add(rightGrid)

    // 3. High-Gain Parabolic Earth Antenna (Zenith face +Z)
    const dishMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      roughness: 0.3,
      metalness: 0.4,
      side: THREE.DoubleSide
    })
    const dishGeo = new THREE.SphereGeometry(0.14, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.45)
    const dishMesh = new THREE.Mesh(dishGeo, dishMat)
    dishMesh.position.set(0, 0.06, 0.28)
    dishMesh.rotation.x = -Math.PI / 5
    sc.add(dishMesh)

    const feedHorn = new THREE.Mesh(
      new THREE.CylinderGeometry(0.008, 0.008, 0.10, 8),
      metalArmMat
    )
    feedHorn.position.set(0, 0.11, 0.31)
    feedHorn.rotation.x = -Math.PI / 5
    sc.add(feedHorn)

    // 4. Optical Sensor Apertures (Nadir face -Z, points straight towards Moon surface)
    const sensorBayMat = new THREE.MeshStandardMaterial({
      color: 0x090d16,
      roughness: 0.85,
      metalness: 0.95
    })
    const cameraLeft = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.08, 10), sensorBayMat)
    cameraLeft.position.set(-0.07, 0, -0.19)
    cameraLeft.rotation.x = Math.PI / 2
    sc.add(cameraLeft)

    const cameraRight = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.08, 10), sensorBayMat)
    cameraRight.position.set(0.07, 0, -0.19)
    cameraRight.rotation.x = Math.PI / 2
    sc.add(cameraRight)

    // 5. Subtle Emissive Navigation Beacon
    const beacon = new THREE.Mesh(
      new THREE.SphereGeometry(0.025, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0x38bdf8 })
    )
    beacon.position.set(0, 0.18, 0.20)
    sc.add(beacon)

    // Small local point light on spacecraft
    const navLight = new THREE.PointLight(0x38bdf8, 0.35, 1.8)
    navLight.position.set(0, 0.18, 0.20)
    sc.add(navLight)

    return sc
  }

  /**
   * Observation Scanning Beam & Surface Footprint (Non-laser, soft translucent optical swath)
   */
  private createObservationBeam() {
    // 1. Tapered Translucent Cone
    const coneGeo = new THREE.CylinderGeometry(0.09, 0.55, 1.0, 16, 1, true)
    const coneMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.10,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false
    })
    this.observationCone = new THREE.Mesh(coneGeo, coneMat)
    this.orbitPlaneGroup.add(this.observationCone)

    // 2. Sub-satellite Surface Footprint
    this.surfaceFootprint = new THREE.Group()

    const ringGeo = new THREE.RingGeometry(0.35, 0.46, 32)
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.28,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false
    })
    this.footprintRing = new THREE.Mesh(ringGeo, ringMat)
    this.surfaceFootprint.add(this.footprintRing)

    const coreGeo = new THREE.CircleGeometry(0.34, 32)
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.08,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false
    })
    this.footprintCore = new THREE.Mesh(coreGeo, coreMat)
    this.surfaceFootprint.add(this.footprintCore)

    this.orbitPlaneGroup.add(this.surfaceFootprint)
  }

  /**
   * Feature Correspondence Constellation on Lunar Surface (Symbolic tie points in Mare Tranquillitatis)
   */
  private createCorrespondenceFeatures() {
    this.correspondenceGroup = new THREE.Group()

    // Coordinates anchored on Moon near Mare Tranquillitatis (Lat ~ 8.5°N, Lon ~ 26°E)
    const centerLat = 0.148
    const centerLon = 0.454
    const R = this.moonRadius3D * 1.002 // Slightly above sphere to prevent z-fighting

    const offsets = [
      { lon: -0.05, lat:  0.04 },
      { lon:  0.02, lat:  0.06 },
      { lon:  0.07, lat:  0.01 },
      { lon:  0.05, lat: -0.05 },
      { lon: -0.02, lat: -0.06 },
      { lon: -0.06, lat: -0.02 },
      { lon:  0.00, lat:  0.00 }
    ]

    const pts3D: THREE.Vector3[] = offsets.map(o => {
      const lat = centerLat + o.lat
      const lon = centerLon + o.lon
      const cosLat = Math.cos(lat)
      return new THREE.Vector3(
        R * cosLat * Math.sin(lon),
        R * Math.sin(lat),
        R * cosLat * Math.cos(lon)
      )
    })

    // Points
    const pGeo = new THREE.BufferGeometry().setFromPoints(pts3D)
    const pMat = new THREE.PointsMaterial({
      color: 0xc084fc,
      size: 0.14,
      transparent: true,
      opacity: 0.55,
      depthTest: true,
      blending: THREE.AdditiveBlending
    })
    this.correspondencePoints = new THREE.Points(pGeo, pMat)
    this.correspondenceGroup.add(this.correspondencePoints)

    // Constellation Tie Lines
    const linePairs = [
      [0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0],
      [6, 0], [6, 1], [6, 2], [6, 3], [6, 4], [6, 5]
    ]
    const linePts: THREE.Vector3[] = []
    for (const [a, b] of linePairs) {
      linePts.push(pts3D[a], pts3D[b])
    }
    const lGeo = new THREE.BufferGeometry().setFromPoints(linePts)
    const lMat = new THREE.LineBasicMaterial({
      color: 0xc084fc,
      transparent: true,
      opacity: 0.28,
      depthTest: true
    })
    this.correspondenceLines = new THREE.LineSegments(lGeo, lMat)
    this.correspondenceGroup.add(this.correspondenceLines)

    this.moonMesh.add(this.correspondenceGroup)
  }

  private initCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
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
    const count = 160
    const w = this.canvas.width / (window.devicePixelRatio || 1)
    const h = this.canvas.height / (window.devicePixelRatio || 1)

    for (let i = 0; i < count; i++) {
      const baseAlpha = 0.18 + Math.random() * 0.65
      this.stars.push({
        x: Math.random() * w,
        y: Math.random() * h,
        size: Math.random() < 0.85 ? 1 : Math.random() * 1.6 + 1,
        alpha: baseAlpha,
        baseAlpha: baseAlpha,
        twinkleSpeed: 0.01 + Math.random() * 0.025
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
      const rect = this.wrapper.getBoundingClientRect()
      const relX = (e.clientX - rect.left) / (rect.width || 1)
      const relY = (e.clientY - rect.top) / (rect.height || 1)

      // Interactive point light reaction
      if (this.pointLight) {
        this.pointLight.position.x = (relX * 2 - 1) * 22
        this.pointLight.position.y = (-(relY * 2 - 1)) * 16
        this.pointLight.position.z = 24
      }

      // Smooth subtle camera parallax (very small, calm: max ±0.4 units)
      this.camTargetX = (relX - 0.5) * 0.6
      this.camTargetY = -(relY - 0.5) * 0.4

      // Drag to rotate Moon
      if (!this.isDragging) return
      const dx = e.clientX - this.lastMouseX
      const dy = e.clientY - this.lastMouseY

      this.rotY += dx * 0.005
      this.rotX = Math.max(-0.55, Math.min(0.55, this.rotX + dy * 0.005))

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
    if (this.primaryOrbitLine) this.primaryOrbitLine.visible = this.showOrbit
    if (this.secondaryOrbitLine) this.secondaryOrbitLine.visible = this.showOrbit
    if (this.spacecraftGroup) this.spacecraftGroup.visible = this.showOrbit
    if (this.observationCone) this.observationCone.visible = this.showOrbit
    if (this.surfaceFootprint) this.surfaceFootprint.visible = this.showOrbit
    return this.showOrbit
  }

  public toggleFootprint() {
    this.showFootprint = !this.showFootprint
    if (this.surfaceFootprint) this.surfaceFootprint.visible = this.showFootprint
    if (this.observationCone) this.observationCone.visible = this.showFootprint
    return this.showFootprint
  }

  public resetView() {
    this.rotY = -0.45
    this.rotX = 0.12
  }

  public getTelemetry() {
    return {
      activeModality: this.currentModality,
      modalityDescription: this.currentModalityDesc,
      cameraMode: 'Multi-Modal Observation',
      scLat: 'Observation Orbit',
      scLon: `${this.currentModality} Active`,
      altitude: 'Polar Trajectory'
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
    const x3 = r * cosLat * Math.sin(l)
    const y3 = -r * Math.sin(lat)
    const z3 = r * cosLat * Math.cos(l)

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
    const now = performance.now()
    const dt = Math.min((now - this.lastTime) / 1000, 0.1)
    this.lastTime = now

    const w = this.canvas.width / (Math.min(window.devicePixelRatio || 1, 2))
    const h = this.canvas.height / (Math.min(window.devicePixelRatio || 1, 2))

    // Position Moon comfortably in right portion with ample breathing margins
    const isMobile = w < 900
    const cx = isMobile ? w * 0.50 : w * 0.52
    const cy = h * 0.50

    // Synchronize 3D camera and orbital system
    const fovHalfRad = (this.camera.fov * Math.PI) / 360
    const visibleHalfHeight = this.cameraDist * Math.tan(fovHalfRad)
    const pxPerUnit = (h / 2) / visibleHalfHeight
    const radius = this.moonRadius3D * pxPerUnit

    const moon3DX = (cx - w / 2) / pxPerUnit
    const moon3DY = -(cy - h / 2) / pxPerUnit

    if (this.orbitalSystem) {
      this.orbitalSystem.position.set(moon3DX, moon3DY, 0)
    }

    if (this.moonMesh) {
      this.moonMesh.rotation.y = this.rotY
      this.moonMesh.rotation.x = this.rotX
    }

    // Parallax camera easing
    this.camera.position.x += (this.camTargetX - this.camera.position.x) * 0.04
    this.camera.position.y += (this.camTargetY - this.camera.position.y) * 0.04
    this.camera.lookAt(0, 0, 0)

    // Smooth Moon rotation
    if (this.autoRotate && !this.isDragging && !this.prefersReducedMotion) {
      this.rotY += this.MOON_ROT_SPEED
    }

    // Smooth deterministic orbit progression (38s full orbit)
    if (!this.prefersReducedMotion) {
      this.orbitAngle = (this.orbitAngle + (Math.PI * 2 / this.orbitPeriodSec) * dt) % (Math.PI * 2)
    }

    // Update Spacecraft Position & Attitude along 3D Elliptical Orbit
    this.updateSpacecraftAndObservation()

    // Update Feature Correspondence Pulse (6.0s cycle)
    const pulseCycle = (now / 1000) * 1.15
    const pulse = 0.5 + 0.5 * Math.sin(pulseCycle)
    if (this.correspondenceLines && this.correspondencePoints) {
      (this.correspondenceLines.material as THREE.LineBasicMaterial).opacity = 0.12 + 0.28 * pulse
      ;(this.correspondencePoints.material as THREE.PointsMaterial).opacity = 0.25 + 0.45 * pulse
    }

    // 1. Render realistic Three.js 3D Moon & Spacecraft
    this.renderer.render(this.scene, this.camera)

    // 2. Clear 2D overlay canvas for technical annotations
    this.ctx.clearRect(0, 0, w, h)

    // 3. Draw Starfield (omits stars behind lunar disc)
    this.drawStarfield(cx, cy, radius)

    // 3b. Soft outer lunar atmosphere / rim depth
    const glowGrad = this.ctx.createRadialGradient(cx, cy, radius * 0.98, cx, cy, radius * 1.12)
    glowGrad.addColorStop(0, 'rgba(255, 255, 255, 0.07)')
    glowGrad.addColorStop(0.35, 'rgba(56, 189, 248, 0.035)')
    glowGrad.addColorStop(1, 'rgba(56, 189, 248, 0)')
    this.ctx.fillStyle = glowGrad
    this.ctx.beginPath()
    this.ctx.arc(cx, cy, radius * 1.12, 0, Math.PI * 2)
    this.ctx.fill()

    // 4. Draw Coordinate / Grid Overlay (if toggled)
    if (this.showGrid) {
      this.drawCoordinateGrid(cx, cy, radius)
    }

    // 5. Draw Meaningful Technical Annotations
    if (this.showOrbit) {
      this.drawScientificHudOverlays(cx, cy, radius, w, h)
    }

    // 6. Draw Reticle Overlay (if toggled)
    if (this.showReticle) {
      this.drawReticleOverlay(cx, cy, radius)
    }

    if (!this.isPaused) {
      this.animationFrameId = requestAnimationFrame(this.render)
    }
  }

  /**
   * Updates Spacecraft Position, Nadir Attitude & Observation Beam along 3D Orbit
   */
  private updateSpacecraftAndObservation() {
    if (!this.spacecraftGroup || !this.orbitPlaneGroup) return

    const a = this.orbitA
    const b = this.orbitB
    const theta = this.orbitAngle

    // 1. Spacecraft Position in Orbit Plane Local Frame
    const Px = a * Math.cos(theta)
    const Py = b * Math.sin(theta)
    this.spacecraftGroup.position.set(Px, Py, 0)

    // 2. Orthonormal Attitude Frame:
    // Nadir (camera direction pointing to Moon center): towards (0, 0, 0)
    const nadirVec = new THREE.Vector3(-Px, -Py, 0).normalize()
    const zenithVec = nadirVec.clone().negate() // +Z local axis (antenna dish)

    // Tangent (forward flight velocity):
    const tangentVec = new THREE.Vector3(-a * Math.sin(theta), b * Math.cos(theta), 0).normalize()

    // Wings axis:
    const wingsVec = new THREE.Vector3().crossVectors(tangentVec, zenithVec).normalize()
    const fwdVec = new THREE.Vector3().crossVectors(zenithVec, wingsVec).normalize()

    const rotMatrix = new THREE.Matrix4().makeBasis(wingsVec, fwdVec, zenithVec)
    this.spacecraftGroup.quaternion.setFromRotationMatrix(rotMatrix)

    // 3. Sub-satellite Surface Point on Moon
    const rMoon = this.moonRadius3D
    const dist = Math.hypot(Px, Py)
    const altitude = dist - rMoon
    const Sx = (Px / dist) * rMoon
    const Sy = (Py / dist) * rMoon

    // 4. Observation Cone connecting Spacecraft to Surface
    if (this.observationCone && this.showFootprint) {
      const midX = (Px + Sx) / 2
      const midY = (Py + Sy) / 2
      this.observationCone.position.set(midX, midY, 0)
      this.observationCone.scale.set(1, altitude, 1)

      // Orient cylinder height (local Y) along (P - S)
      const beamDir = new THREE.Vector3(Px - Sx, Py - Sy, 0).normalize()
      const beamRot = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), beamDir)
      this.observationCone.quaternion.copy(beamRot)
    }

    // 5. Sub-satellite Footprint Ring on Surface
    if (this.surfaceFootprint && this.showFootprint) {
      this.surfaceFootprint.position.set(Sx * 1.002, Sy * 1.002, 0)
      const surfNormal = new THREE.Vector3(Sx, Sy, 0).normalize()
      const fpRot = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), surfNormal)
      this.surfaceFootprint.quaternion.copy(fpRot)
    }

    // 6. Active Multi-Modal Sensor Modality Sequencing
    const normAngle = ((theta % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)
    if (normAngle < (Math.PI * 2) / 3) {
      this.currentModality = 'OHRC'
      this.currentModalityDesc = 'High-resolution optical'
    } else if (normAngle < (Math.PI * 4) / 3) {
      this.currentModality = 'TMC'
      this.currentModalityDesc = 'Stereo terrain imaging'
    } else {
      this.currentModality = 'IIRS'
      this.currentModalityDesc = 'Hyperspectral observation'
    }
  }

  /**
   * Draws Scientific HUD Overlays: Observation Path, Spacecraft Tracker, Reference & Correspondence
   */
  private drawScientificHudOverlays(cx: number, cy: number, radius: number, w: number, h: number) {
    if (!this.spacecraftGroup || !this.camera) return

    // 1. Spacecraft Position in Screen Space & 3D Occlusion Detection
    const scWorld = new THREE.Vector3()
    this.spacecraftGroup.getWorldPosition(scWorld)

    const moonWorld = new THREE.Vector3()
    this.moonMesh.getWorldPosition(moonWorld)

    // Check if spacecraft is occluded behind the solid Moon sphere
    const dx = scWorld.x - moonWorld.x
    const dy = scWorld.y - moonWorld.y
    const dz = scWorld.z - moonWorld.z
    const distXY = Math.hypot(dx, dy)
    const isEclipsedBehindMoon = dz < -0.2 && distXY < this.moonRadius3D

    const scProj = scWorld.clone().project(this.camera)
    const scScreenX = (scProj.x * 0.5 + 0.5) * w
    const scScreenY = (-(scProj.y * 0.5) + 0.5) * h

    // Draw Spacecraft Observation Tag if visible
    if (!isEclipsedBehindMoon && scProj.z < 1) {
      this.ctx.save()

      // Hairline callout leader line
      const tagX = scScreenX > w * 0.72 ? scScreenX - 160 : scScreenX + 24
      const tagY = scScreenY - 18

      this.ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)'
      this.ctx.lineWidth = 1
      this.ctx.beginPath()
      this.ctx.moveTo(scScreenX, scScreenY)
      this.ctx.lineTo(tagX - 4, tagY + 12)
      this.ctx.lineTo(tagX + 110, tagY + 12)
      this.ctx.stroke()

      // Spacecraft Identifier
      this.ctx.font = '9px "JetBrains Mono", monospace'
      this.ctx.fillStyle = '#94a3b8'
      this.ctx.fillText('CHANDRAYAAN-1 ORBITER', tagX, tagY)

      // Active Modality
      this.ctx.font = '10px "JetBrains Mono", monospace'
      this.ctx.fillStyle = '#f8fafc'
      this.ctx.fillText('MULTI-MODAL OBSERVATION', tagX, tagY + 11)

      // Dynamic Sensor Label
      this.ctx.font = '9.5px "JetBrains Mono", monospace'
      this.ctx.fillStyle = '#38bdf8'
      this.ctx.fillText(`● ${this.currentModality} • ${this.currentModalityDesc}`, tagX, tagY + 23)

      this.ctx.restore()
    }

    // 2. Fixed Orbit Path Annotation (pinned to orbital crest in space)
    const orbitTagPt = new THREE.Vector3(
      this.orbitA * Math.cos(2.25),
      this.orbitB * Math.sin(2.25),
      0
    )
    orbitTagPt.applyMatrix4(this.orbitPlaneGroup.matrixWorld)
    const orbProj = orbitTagPt.project(this.camera)

    if (orbProj.z < 1) {
      const orbX = (orbProj.x * 0.5 + 0.5) * w
      const orbY = (-(orbProj.y * 0.5) + 0.5) * h

      this.ctx.save()
      // Crosshair tick
      this.ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)'
      this.ctx.lineWidth = 1
      this.ctx.beginPath()
      this.ctx.moveTo(orbX - 4, orbY)
      this.ctx.lineTo(orbX + 4, orbY)
      this.ctx.moveTo(orbX, orbY - 4)
      this.ctx.lineTo(orbX, orbY + 4)
      this.ctx.stroke()

      // Annotation text
      this.ctx.font = '8.5px "JetBrains Mono", monospace'
      this.ctx.fillStyle = 'rgba(56, 189, 248, 0.75)'
      this.ctx.fillText('LUNAR OBSERVATION ORBIT', orbX + 8, orbY - 3)

      this.ctx.fillStyle = 'rgba(148, 163, 184, 0.6)'
      this.ctx.fillText('Polar observation trajectory', orbX + 8, orbY + 8)
      this.ctx.restore()
    }

    // 3. Feature Correspondence Surface Annotation
    const featProj = this.project3D(0.454, 0.148, radius, cx, cy)
    if (featProj.visible && featProj.depth > 0.25) {
      this.ctx.save()
      this.ctx.font = '8.5px "JetBrains Mono", monospace'
      this.ctx.fillStyle = '#c084fc'
      this.ctx.fillText('FEATURE CORRESPONDENCE', featProj.x + 8, featProj.y - 2)

      this.ctx.fillStyle = 'rgba(148, 163, 184, 0.6)'
      this.ctx.fillText('Multi-modal tie points', featProj.x + 8, featProj.y + 8)
      this.ctx.restore()
    }

    // 4. Lunar Reference Surface Annotation (LROC Reference Mosaic)
    const refProj = this.project3D(0.15, -0.18, radius, cx, cy)
    if (refProj.visible && refProj.depth > 0.3) {
      this.ctx.save()
      this.ctx.font = '8.5px "JetBrains Mono", monospace'
      this.ctx.fillStyle = '#f59e0b'
      this.ctx.fillText('LUNAR REFERENCE', refProj.x + 8, refProj.y - 2)

      this.ctx.fillStyle = 'rgba(148, 163, 184, 0.6)'
      this.ctx.fillText('LROC NAC / WAC', refProj.x + 8, refProj.y + 8)
      this.ctx.restore()
    }
  }

  private drawStarfield(cx: number, cy: number, radius: number) {
    const pad = radius + 2
    for (const star of this.stars) {
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
    this.ctx.beginPath()
    this.ctx.arc(cx, cy, radius - 0.5, 0, Math.PI * 2)
    this.ctx.clip()

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

  private drawReticleOverlay(cx: number, cy: number, radius: number) {
    this.ctx.save()
    this.ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)'
    this.ctx.lineWidth = 1

    const np = this.project3D(0, Math.PI / 2, radius, cx, cy)
    if (np.visible) {
      this.ctx.beginPath()
      this.ctx.arc(np.x, np.y, 3, 0, Math.PI * 2)
      this.ctx.fillStyle = '#38bdf8'
      this.ctx.fill()
      this.ctx.font = '9px "JetBrains Mono", monospace'
      this.ctx.fillText('NP [90°N]', np.x + 6, np.y - 4)
    }

    const sp = this.project3D(0, -Math.PI / 2, radius, cx, cy)
    if (sp.visible) {
      this.ctx.beginPath()
      this.ctx.arc(sp.x, sp.y, 3, 0, Math.PI * 2)
      this.ctx.fillStyle = '#38bdf8'
      this.ctx.fill()
      this.ctx.font = '9px "JetBrains Mono", monospace'
      this.ctx.fillText('SP [90°S]', sp.x + 6, sp.y + 10)
    }

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
