/*
 * Liquid Glass JS: the Container class from https://github.com/dashersw/liquid-glass-js
 * (commit 78cb6cc, MIT licence, Copyright (c) 2025 Armagan Amcalar; see ./LICENSE).
 *
 * The WebGL refraction shader and its parameters are the library's own. FantasyLab's
 * changes, so it can run inside a React app that navigates and scrolls:
 *   1. An ES module export; no globals (`window.glassControls` becomes `Container.controls`).
 *   2. Enhances an element you pass in (`options.element`) instead of creating one; the
 *      canvas is inserted behind the element's own children.
 *   3. The page snapshot is supplied from outside (`Container.setSnapshot(canvas, cssWidth,
 *      cssHeight)`) and can be refreshed at any time; it is uploaded straight from the canvas
 *      (the original converted it to a data URL and an <img> first). Texture coordinates use the
 *      page's CSS size, so a snapshot taken at a lower scale lines up exactly.
 *   4. The three band colours of the "sampled gradient" step are averaged once per frame in
 *      JavaScript and passed as uniforms (identical result, far fewer texture reads per pixel).
 *   5. `destroy()` removes listeners and frees the WebGL context; nested glass buttons
 *      (button.js) are not used.
 *   6. The canvas renders at up to 2x device pixels for crisp rims; no console logging.
 */

const FRAGMENT_SHADER = `
    precision mediump float;
    uniform sampler2D u_image;
    uniform vec2 u_resolution;
      uniform vec2 u_textureSize;
      uniform float u_scrollY;
      uniform float u_pageHeight;
      uniform float u_viewportHeight;
      uniform float u_blurRadius;
      uniform float u_borderRadius;
      uniform vec2 u_containerPosition;
      uniform float u_warp;
      uniform float u_edgeIntensity;
      uniform float u_rimIntensity;
      uniform float u_baseIntensity;
      uniform float u_edgeDistance;
      uniform float u_rimDistance;
      uniform float u_baseDistance;
      uniform float u_cornerBoost;
      uniform float u_rippleEffect;
      uniform float u_tintOpacity;
      uniform vec3 u_topColor;
      uniform vec3 u_midColor;
      uniform vec3 u_bottomColor;
    varying vec2 v_texcoord;

      // Function to calculate distance from rounded rectangle edge
      float roundedRectDistance(vec2 coord, vec2 size, float radius) {
        vec2 center = size * 0.5;
        vec2 pixelCoord = coord * size;
        vec2 toCorner = abs(pixelCoord - center) - (center - radius);
        float outsideCorner = length(max(toCorner, 0.0));
        float insideCorner = min(max(toCorner.x, toCorner.y), 0.0);
        return (outsideCorner + insideCorner - radius);
      }
      
      // Function to calculate distance from circle edge (negative inside, positive outside)
      float circleDistance(vec2 coord, vec2 size, float radius) {
        vec2 center = vec2(0.5, 0.5);
        vec2 pixelCoord = coord * size;
        vec2 centerPixel = center * size;
        float distFromCenter = length(pixelCoord - centerPixel);
        return distFromCenter - radius;
      }
      
      // Check if this is a pill (border radius is approximately 50% of height AND width > height)
      bool isPill(vec2 size, float radius) {
        float heightRatioDiff = abs(radius - size.y * 0.5);
        bool radiusMatchesHeight = heightRatioDiff < 2.0;
        bool isWiderThanTall = size.x > size.y + 4.0; // Must be significantly wider
        return radiusMatchesHeight && isWiderThanTall;
      }
      
      // Check if this is a circle (border radius is approximately 50% of smaller dimension AND roughly square)
      bool isCircle(vec2 size, float radius) {
        float minDim = min(size.x, size.y);
        bool radiusMatchesMinDim = abs(radius - minDim * 0.5) < 1.0;
        bool isRoughlySquare = abs(size.x - size.y) < 4.0; // Width and height are similar
        return radiusMatchesMinDim && isRoughlySquare;
      }
      
      // Function to calculate distance from pill edge (capsule shape)
      float pillDistance(vec2 coord, vec2 size, float radius) {
        vec2 center = size * 0.5;
        vec2 pixelCoord = coord * size;
        
        // Proper capsule: line segment with radius
        // The capsule axis runs horizontally from (radius, center.y) to (size.x - radius, center.y)
        vec2 capsuleStart = vec2(radius, center.y);
        vec2 capsuleEnd = vec2(size.x - radius, center.y);
        
        // Project point onto the capsule axis (line segment)
        vec2 capsuleAxis = capsuleEnd - capsuleStart;
        float capsuleLength = length(capsuleAxis);
        
        if (capsuleLength > 0.0) {
          vec2 toPoint = pixelCoord - capsuleStart;
          float t = clamp(dot(toPoint, capsuleAxis) / dot(capsuleAxis, capsuleAxis), 0.0, 1.0);
          vec2 closestPointOnAxis = capsuleStart + t * capsuleAxis;
          return length(pixelCoord - closestPointOnAxis) - radius;
        } else {
          // Degenerate case: just a circle
          return length(pixelCoord - center) - radius;
        }
      }

    void main() {
        vec2 coord = v_texcoord;
        
        // Calculate which area of the page should be visible through the container
        float scrollY = u_scrollY;
        vec2 containerSize = u_resolution;
        vec2 textureSize = u_textureSize;
        
        // Container position in viewport coordinates
        vec2 containerCenter = u_containerPosition + vec2(0.0, scrollY);
        
        // Convert container coordinates to page coordinates
        vec2 containerOffset = (coord - 0.5) * containerSize;
        vec2 pagePixel = containerCenter + containerOffset;
        
        // Convert to texture coordinate (0 to 1)
        vec2 textureCoord = pagePixel / textureSize;
        
        // Glass refraction effects
        float distFromEdgeShape;
        vec2 shapeNormal; // Normal vector pointing away from shape surface
        
        if (isPill(u_resolution, u_borderRadius)) {
          distFromEdgeShape = -pillDistance(coord, u_resolution, u_borderRadius);
          
          // Calculate normal for pill shape
          vec2 center = vec2(0.5, 0.5);
          vec2 pixelCoord = coord * u_resolution;
          vec2 capsuleStart = vec2(u_borderRadius, center.y * u_resolution.y);
          vec2 capsuleEnd = vec2(u_resolution.x - u_borderRadius, center.y * u_resolution.y);
          vec2 capsuleAxis = capsuleEnd - capsuleStart;
          float capsuleLength = length(capsuleAxis);
          
          if (capsuleLength > 0.0) {
            vec2 toPoint = pixelCoord - capsuleStart;
            float t = clamp(dot(toPoint, capsuleAxis) / dot(capsuleAxis, capsuleAxis), 0.0, 1.0);
            vec2 closestPointOnAxis = capsuleStart + t * capsuleAxis;
            vec2 normalDir = pixelCoord - closestPointOnAxis;
            shapeNormal = length(normalDir) > 0.0 ? normalize(normalDir) : vec2(0.0, 1.0);
          } else {
            shapeNormal = normalize(coord - center);
          }
        } else if (isCircle(u_resolution, u_borderRadius)) {
          distFromEdgeShape = -circleDistance(coord, u_resolution, u_borderRadius);
          vec2 center = vec2(0.5, 0.5);
          shapeNormal = normalize(coord - center);
        } else {
          distFromEdgeShape = -roundedRectDistance(coord, u_resolution, u_borderRadius);
      vec2 center = vec2(0.5, 0.5);
          shapeNormal = normalize(coord - center);
        }
        distFromEdgeShape = max(distFromEdgeShape, 0.0);
        
        float distFromLeft = coord.x;
        float distFromRight = 1.0 - coord.x;
        float distFromTop = coord.y;
        float distFromBottom = 1.0 - coord.y;
        float distFromEdge = distFromEdgeShape / min(u_resolution.x, u_resolution.y);
        
        // Smooth glass refraction using shape-aware normal
        float normalizedDistance = distFromEdge * min(u_resolution.x, u_resolution.y);
        float baseIntensity = 1.0 - exp(-normalizedDistance * u_baseDistance);
        float edgeIntensity = exp(-normalizedDistance * u_edgeDistance);
        float rimIntensity = exp(-normalizedDistance * u_rimDistance);
        
        // Apply center warping only if warp is enabled, keep edge and rim effects always
        float baseComponent = u_warp > 0.5 ? baseIntensity * u_baseIntensity : 0.0;
        float totalIntensity = baseComponent + edgeIntensity * u_edgeIntensity + rimIntensity * u_rimIntensity;
        
        vec2 baseRefraction = shapeNormal * totalIntensity;
        
        float cornerProximityX = min(distFromLeft, distFromRight);
        float cornerProximityY = min(distFromTop, distFromBottom);
        float cornerDistance = max(cornerProximityX, cornerProximityY);
        float cornerNormalized = cornerDistance * min(u_resolution.x, u_resolution.y);
        
        float cornerBoost = exp(-cornerNormalized * 0.3) * u_cornerBoost;
        vec2 cornerRefraction = shapeNormal * cornerBoost;
        
        vec2 perpendicular = vec2(-shapeNormal.y, shapeNormal.x);
        float rippleEffect = sin(distFromEdge * 25.0) * u_rippleEffect * rimIntensity;
        vec2 textureRefraction = perpendicular * rippleEffect;
        
        vec2 totalRefraction = baseRefraction + cornerRefraction + textureRefraction;
        textureCoord += totalRefraction;
        
        // Gaussian blur
        vec4 color = vec4(0.0);
        vec2 texelSize = 1.0 / u_textureSize;
        float sigma = u_blurRadius / 2.0;
        vec2 blurStep = texelSize * sigma;
        
        float totalWeight = 0.0;
        
        for(float i = -6.0; i <= 6.0; i += 1.0) {
          for(float j = -6.0; j <= 6.0; j += 1.0) {
            float distance = length(vec2(i, j));
            if(distance > 6.0) continue;
            
            float weight = exp(-(distance * distance) / (2.0 * sigma * sigma));
            
            vec2 offset = vec2(i, j) * blurStep;
            color += texture2D(u_image, textureCoord + offset) * weight;
            totalWeight += weight;
          }
        }
        
        color /= totalWeight;
        
        // Simple vertical gradient
        float gradientPosition = coord.y;
        vec3 topTint = vec3(1.0, 1.0, 1.0);
        vec3 bottomTint = vec3(0.7, 0.7, 0.7);
        vec3 gradientTint = mix(topTint, bottomTint, gradientPosition);
        vec3 tintedColor = mix(color.rgb, gradientTint, u_tintOpacity);
        color = vec4(tintedColor, color.a);
        
        // Sampled gradient (FantasyLab: the three band colours are averaged once per frame on the CPU
        // and passed in as uniforms; they were identical for every pixel, so this keeps the look and
        // removes ~660 texture reads per pixel)
        vec3 topColor = u_topColor;
        vec3 midColor = u_midColor;
        vec3 bottomColor = u_bottomColor;
        
        vec3 sampledGradient;
        if (gradientPosition < 0.1) {
          sampledGradient = topColor;
        } else if (gradientPosition > 0.9) {
          sampledGradient = bottomColor;
        } else {
          float transitionPos = (gradientPosition - 0.1) / 0.8;
          if (transitionPos < 0.5) {
            float t = transitionPos * 2.0;
            sampledGradient = mix(topColor, midColor, t);
          } else {
            float t = (transitionPos - 0.5) * 2.0;
            sampledGradient = mix(midColor, bottomColor, t);
          }
        }
        
        vec3 finalTinted = mix(color.rgb, sampledGradient, u_tintOpacity * 0.3);
        color = vec4(finalTinted, color.a);
        
        // Shape mask (rounded rectangle, circle, or pill)
        float maskDistance;
        if (isPill(u_resolution, u_borderRadius)) {
          maskDistance = pillDistance(coord, u_resolution, u_borderRadius);
        } else if (isCircle(u_resolution, u_borderRadius)) {
          maskDistance = circleDistance(coord, u_resolution, u_borderRadius);
        } else {
          maskDistance = roundedRectDistance(coord, u_resolution, u_borderRadius);
        }
        float mask = 1.0 - smoothstep(-1.0, 1.0, maskDistance);
        
        gl_FragColor = vec4(color.rgb, mask);
      }
    `

const VERTEX_SHADER = `
    attribute vec2 a_position;
    attribute vec2 a_texcoord;
    varying vec2 v_texcoord;

    void main() {
      gl_Position = vec4(a_position, 0, 1);
      v_texcoord = a_texcoord;
    }
  `

/** Library defaults (from the original `window.glassControls ||` fallbacks). */
const DEFAULT_CONTROLS = {
  blurRadius: 5.0,
  edgeIntensity: 0.01,
  rimIntensity: 0.05,
  baseIntensity: 0.01,
  edgeDistance: 0.15,
  rimDistance: 0.8,
  baseDistance: 0.1,
  cornerBoost: 0.02,
  rippleEffect: 0.1
}

export class Container {
  static instances = []
  /** { canvas, cssWidth, cssHeight, bands } once a snapshot exists. */
  static snapshot = null
  static controls = { ...DEFAULT_CONTROLS }

  /**
   * Give every glass element a new picture of the page. `canvas` is the rendered page at any
   * scale; cssWidth/cssHeight are the page's size in CSS pixels.
   */
  static setSnapshot(canvas, cssWidth, cssHeight) {
    Container.snapshot = { canvas, cssWidth, cssHeight, bands: Container.measureBands(canvas) }
    Container.instances.forEach(instance => {
      if (instance.webglInitialized) instance.uploadSnapshot()
      else instance.initWebGL()
    })
  }

  /**
   * A small copy of the snapshot's row colours, used to average the three horizontal bands
   * the shader's "sampled gradient" needs (the original sampled them per pixel).
   */
  static measureBands(canvas) {
    const rows = Math.max(1, Math.min(canvas.height, 512))
    const small = document.createElement('canvas')
    small.width = 20
    small.height = rows
    const ctx = small.getContext('2d', { willReadFrequently: true })
    if (!ctx) return null
    ctx.drawImage(canvas, 0, 0, 20, rows)
    const data = ctx.getImageData(0, 0, 20, rows).data
    const rowColors = new Float32Array(rows * 3)
    for (let y = 0; y < rows; y++) {
      let r = 0
      let g = 0
      let b = 0
      for (let x = 0; x < 20; x++) {
        const i = (y * 20 + x) * 4
        r += data[i]
        g += data[i + 1]
        b += data[i + 2]
      }
      rowColors[y * 3] = r / 20 / 255
      rowColors[y * 3 + 1] = g / 20 / 255
      rowColors[y * 3 + 2] = b / 20 / 255
    }
    return { rows, rowColors }
  }

  constructor(options = {}) {
    this.width = 0
    this.height = 0
    this.borderRadius = options.borderRadius || 48
    this.type = options.type || 'rounded' // "rounded", "circle", or "pill"
    this.tintOpacity = options.tintOpacity !== undefined ? options.tintOpacity : 0.2
    this.warp = Boolean(options.warp)
    this.onReady = options.onReady || null

    this.canvas = null
    this.element = options.element || null
    this.gl = null
    this.gl_refs = {}
    this.webglInitialized = false
    this.destroyed = false
    this.handleScroll = () => this.render && this.render()

    Container.instances.push(this)
    this.init()
  }

  init() {
    this.createElement()
    this.setupCanvas()
    this.updateSizeFromDOM()
    if (Container.snapshot) this.initWebGL()
  }

  createElement() {
    if (!this.element) this.element = document.createElement('div')
    this.element.classList.add('glass-container')
    if (this.type === 'circle') this.element.classList.add('glass-container-circle')
    else if (this.type === 'pill') this.element.classList.add('glass-container-pill')

    this.canvas = document.createElement('canvas')
    this.canvas.setAttribute('aria-hidden', 'true')
    this.canvas.style.borderRadius = this.borderRadius + 'px'
    this.canvas.style.position = 'absolute'
    this.canvas.style.top = '0'
    this.canvas.style.left = '0'
    this.canvas.style.width = '100%'
    this.canvas.style.height = '100%'
    this.canvas.style.zIndex = '-1' // Canvas behind children
    this.canvas.style.pointerEvents = 'none'
    this.element.insertBefore(this.canvas, this.element.firstChild)
  }

  setupCanvas() {
    this.gl = this.canvas.getContext('webgl', { preserveDrawingBuffer: true, premultipliedAlpha: false })
  }

  get pixelRatio() {
    return Math.min(window.devicePixelRatio || 1, 2)
  }

  updateSizeFromDOM() {
    requestAnimationFrame(() => {
      if (this.destroyed) return
      const rect = this.element.getBoundingClientRect()
      let newWidth = Math.ceil(rect.width)
      let newHeight = Math.ceil(rect.height)

      if (this.type === 'circle') {
        const size = Math.max(newWidth, newHeight)
        newWidth = size
        newHeight = size
        this.borderRadius = size / 2
      } else if (this.type === 'pill') {
        this.borderRadius = newHeight / 2
      }

      if (newWidth !== this.width || newHeight !== this.height) {
        this.width = newWidth
        this.height = newHeight
        const ratio = this.pixelRatio
        this.canvas.width = Math.max(1, Math.round(newWidth * ratio))
        this.canvas.height = Math.max(1, Math.round(newHeight * ratio))
        this.canvas.style.borderRadius = this.borderRadius + 'px'

        if (this.gl_refs.gl) {
          const gl = this.gl_refs.gl
          gl.viewport(0, 0, this.canvas.width, this.canvas.height)
          gl.uniform2f(this.gl_refs.resolutionLoc, newWidth, newHeight)
          gl.uniform1f(this.gl_refs.borderRadiusLoc, this.borderRadius)
          this.render()
        }
      }
    })
  }

  getPosition() {
    const rect = this.canvas.getBoundingClientRect()
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
  }

  initWebGL() {
    if (!Container.snapshot || !this.gl || this.webglInitialized || this.destroyed) return
    this.setupShader()
    this.webglInitialized = Boolean(this.gl_refs.gl)
    if (this.webglInitialized && this.onReady) this.onReady()
  }

  uploadSnapshot() {
    const { gl, texture, textureSizeLoc, pageHeightLoc } = this.gl_refs
    const snap = Container.snapshot
    if (!gl || !snap) return
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, snap.canvas)
    gl.uniform2f(textureSizeLoc, snap.cssWidth, snap.cssHeight)
    gl.uniform1f(pageHeightLoc, snap.cssHeight)
    this.render()
  }

  setupShader() {
    const gl = this.gl
    const program = this.createProgram(gl, VERTEX_SHADER, FRAGMENT_SHADER)
    if (!program) return
    gl.useProgram(program)

    const positionBuffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW)

    const texcoordBuffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, texcoordBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 0]), gl.STATIC_DRAW)

    const loc = name => gl.getUniformLocation(program, name)
    const refs = {
      gl,
      program,
      positionLoc: gl.getAttribLocation(program, 'a_position'),
      texcoordLoc: gl.getAttribLocation(program, 'a_texcoord'),
      resolutionLoc: loc('u_resolution'),
      textureSizeLoc: loc('u_textureSize'),
      scrollYLoc: loc('u_scrollY'),
      pageHeightLoc: loc('u_pageHeight'),
      viewportHeightLoc: loc('u_viewportHeight'),
      blurRadiusLoc: loc('u_blurRadius'),
      borderRadiusLoc: loc('u_borderRadius'),
      containerPositionLoc: loc('u_containerPosition'),
      warpLoc: loc('u_warp'),
      edgeIntensityLoc: loc('u_edgeIntensity'),
      rimIntensityLoc: loc('u_rimIntensity'),
      baseIntensityLoc: loc('u_baseIntensity'),
      edgeDistanceLoc: loc('u_edgeDistance'),
      rimDistanceLoc: loc('u_rimDistance'),
      baseDistanceLoc: loc('u_baseDistance'),
      cornerBoostLoc: loc('u_cornerBoost'),
      rippleEffectLoc: loc('u_rippleEffect'),
      tintOpacityLoc: loc('u_tintOpacity'),
      topColorLoc: loc('u_topColor'),
      midColorLoc: loc('u_midColor'),
      bottomColorLoc: loc('u_bottomColor'),
      imageLoc: loc('u_image'),
      positionBuffer,
      texcoordBuffer,
      texture: gl.createTexture()
    }
    this.gl_refs = refs

    gl.bindTexture(gl.TEXTURE_2D, refs.texture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)

    gl.viewport(0, 0, this.canvas.width, this.canvas.height)
    gl.clearColor(0, 0, 0, 0)

    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer)
    gl.enableVertexAttribArray(refs.positionLoc)
    gl.vertexAttribPointer(refs.positionLoc, 2, gl.FLOAT, false, 0, 0)
    gl.bindBuffer(gl.ARRAY_BUFFER, texcoordBuffer)
    gl.enableVertexAttribArray(refs.texcoordLoc)
    gl.vertexAttribPointer(refs.texcoordLoc, 2, gl.FLOAT, false, 0, 0)

    const c = Container.controls
    gl.uniform2f(refs.resolutionLoc, this.width, this.height)
    gl.uniform1f(refs.blurRadiusLoc, c.blurRadius)
    gl.uniform1f(refs.borderRadiusLoc, this.borderRadius)
    gl.uniform1f(refs.warpLoc, this.warp ? 1.0 : 0.0)
    gl.uniform1f(refs.edgeIntensityLoc, c.edgeIntensity)
    gl.uniform1f(refs.rimIntensityLoc, c.rimIntensity)
    gl.uniform1f(refs.baseIntensityLoc, c.baseIntensity)
    gl.uniform1f(refs.edgeDistanceLoc, c.edgeDistance)
    gl.uniform1f(refs.rimDistanceLoc, c.rimDistance)
    gl.uniform1f(refs.baseDistanceLoc, c.baseDistance)
    gl.uniform1f(refs.cornerBoostLoc, c.cornerBoost)
    gl.uniform1f(refs.rippleEffectLoc, c.rippleEffect)
    gl.uniform1f(refs.tintOpacityLoc, this.tintOpacity)
    gl.uniform1f(refs.viewportHeightLoc, window.innerHeight)

    gl.activeTexture(gl.TEXTURE0)
    gl.uniform1i(refs.imageLoc, 0)

    this.startRenderLoop()
    this.uploadSnapshot()
  }

  /** Average the snapshot rows around the glass (top, middle and bottom bands), as the shader did. */
  bandColors(centerY) {
    const snap = Container.snapshot
    const bands = snap && snap.bands
    if (!bands) return [[0, 0, 0], [0, 0, 0], [0, 0, 0]]
    const average = cssY => {
      const out = [0, 0, 0]
      let n = 0
      for (let offset = -5; offset <= 5; offset++) {
        const row = Math.round(((cssY + offset) / snap.cssHeight) * bands.rows)
        const r = Math.min(bands.rows - 1, Math.max(0, row))
        out[0] += bands.rowColors[r * 3]
        out[1] += bands.rowColors[r * 3 + 1]
        out[2] += bands.rowColors[r * 3 + 2]
        n++
      }
      return out.map(v => v / n)
    }
    const h = this.height
    return [average(centerY - h * 0.4), average(centerY), average(centerY + h * 0.4)]
  }

  startRenderLoop() {
    const render = () => {
      const refs = this.gl_refs
      if (!refs.gl || this.destroyed) return
      const gl = refs.gl
      gl.clear(gl.COLOR_BUFFER_BIT)

      const scrollY = window.pageYOffset || document.documentElement.scrollTop
      gl.uniform1f(refs.scrollYLoc, scrollY)

      const position = this.getPosition()
      gl.uniform2f(refs.containerPositionLoc, position.x, position.y)

      const [top, mid, bottom] = this.bandColors(position.y + scrollY)
      gl.uniform3f(refs.topColorLoc, top[0], top[1], top[2])
      gl.uniform3f(refs.midColorLoc, mid[0], mid[1], mid[2])
      gl.uniform3f(refs.bottomColorLoc, bottom[0], bottom[1], bottom[2])

      gl.drawArrays(gl.TRIANGLES, 0, 6)
    }
    this.render = render
    window.addEventListener('scroll', this.handleScroll, { passive: true })
    render()
  }

  destroy() {
    this.destroyed = true
    window.removeEventListener('scroll', this.handleScroll)
    const index = Container.instances.indexOf(this)
    if (index > -1) Container.instances.splice(index, 1)
    const lose = this.gl && this.gl.getExtension('WEBGL_lose_context')
    if (lose) lose.loseContext()
    if (this.canvas && this.canvas.parentNode) this.canvas.parentNode.removeChild(this.canvas)
    if (this.element) this.element.classList.remove('glass-container', 'glass-container-circle', 'glass-container-pill')
    this.gl_refs = {}
  }

  createProgram(gl, vsSource, fsSource) {
    const vs = this.compileShader(gl, gl.VERTEX_SHADER, vsSource)
    const fs = this.compileShader(gl, gl.FRAGMENT_SHADER, fsSource)
    if (!vs || !fs) return null
    const program = gl.createProgram()
    gl.attachShader(program, vs)
    gl.attachShader(program, fs)
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null
    return program
  }

  compileShader(gl, type, source) {
    const shader = gl.createShader(type)
    gl.shaderSource(shader, source)
    gl.compileShader(shader)
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return null
    return shader
  }
}
