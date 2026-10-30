(() => {
  'use strict';

  const THREE = window.THREE;
  if (!THREE) {
    document.getElementById('status').textContent = 'Three.js 加载失败';
    return;
  }

  /* ------------------------------------------------------------------ *
   *  A very small expression parser: x, y, z, numbers, + - * / ^,
   *  parentheses and a set of common Math functions.
   * ------------------------------------------------------------------ */

  const FUNCTIONS = {
    sin: 'Math.sin', cos: 'Math.cos', tan: 'Math.tan',
    asin: 'Math.asin', acos: 'Math.acos', atan: 'Math.atan', atan2: 'Math.atan2',
    sinh: 'Math.sinh', cosh: 'Math.cosh', tanh: 'Math.tanh',
    sqrt: 'Math.sqrt', abs: 'Math.abs', exp: 'Math.exp',
    ln: 'Math.log', log: 'Math.log', log10: 'Math.log10',
    floor: 'Math.floor', ceil: 'Math.ceil', round: 'Math.round',
    sign: 'Math.sign', pow: 'Math.pow', min: 'Math.min', max: 'Math.max'
  };
  const CONSTANTS = { pi: 'Math.PI', e: 'Math.E' };

  const FULLWIDTH = /[０-９＋－＝×÷（）ｘｙｚ，]/;
  const SUPER = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9' };

  function normalizeExpression(src) {
    return String(src || '')
      .replace(/[０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
      .replace(/[＋]/g, '+')
      .replace(/[－]/g, '-')
      .replace(/[＝]/g, '=')
      .replace(/[×＊]/g, '*')
      .replace(/[÷／]/g, '/')
      .replace(/[（]/g, '(')
      .replace(/[）]/g, ')')
      .replace(/[，]/g, ',')
      .replace(/[ｘ]/gi, 'x')
      .replace(/[ｙ]/gi, 'y')
      .replace(/[ｚ]/gi, 'z')
      .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g, s => '^' + s.split('').map(c => SUPER[c]).join(''))
      .replace(/[−–—]/g, '-')
      .replace(/[×·]/g, '*')
      .replace(/÷/g, '/')
      .replace(/²/g, '^2')
      .replace(/³/g, '^3')
      .replace(/π/g, 'pi')
      .replace(/√/g, 'sqrt')
      .replace(/\s+/g, '');
  }

  function tokenize(src) {
    const s = normalizeExpression(src);
    const tokens = [];
    let i = 0;
    while (i < s.length) {
      const ch = s[i];
      if (/[0-9.]/.test(ch)) {
        const m = s.slice(i).match(/^(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?/);
        if (!m) throw new Error('数字格式不正确');
        tokens.push({ type: 'number', value: Number(m[0]) });
        i += m[0].length;
        continue;
      }
      if (/[a-zA-Z_]/.test(ch)) {
        const m = s.slice(i).match(/^[a-zA-Z_][a-zA-Z0-9_]*/);
        tokens.push({ type: 'ident', value: m[0].toLowerCase() });
        i += m[0].length;
        continue;
      }
      if ('+-*/^(),'.includes(ch)) {
        tokens.push({ type: ch });
        i++;
        continue;
      }
      throw new Error(`无法识别字符“${ch}”`);
    }
    return tokens;
  }

  class Parser {
    constructor(src) {
      this.tokens = tokenize(src);
      this.pos = 0;
    }
    peek() { return this.tokens[this.pos]; }
    next() { return this.tokens[this.pos++]; }
    expect(type) {
      const t = this.next();
      if (!t || t.type !== type) throw new Error('括号不匹配');
      return t;
    }
    startsPrimary(t) {
      return !!t && (t.type === 'number' || t.type === 'ident' || t.type === '(');
    }
    parse() {
      const node = this.parseExpr();
      if (this.pos < this.tokens.length) throw new Error('表达式有多余内容');
      return node;
    }
    parseExpr() {
      let node = this.parseTerm();
      while (this.peek() && (this.peek().type === '+' || this.peek().type === '-')) {
        const op = this.next().type;
        node = { type: 'binary', op, left: node, right: this.parseTerm() };
      }
      return node;
    }
    parseTerm() {
      let node = this.parseUnary();
      while (true) {
        const t = this.peek();
        if (t && (t.type === '*' || t.type === '/')) {
          const op = this.next().type;
          node = { type: 'binary', op, left: node, right: this.parseUnary() };
        } else if (this.startsPrimary(t)) {
          // implicit multiplication: 2x, 2(x+1), x y, sin(x)cos(y)
          node = { type: 'binary', op: '*', left: node, right: this.parseUnary() };
        } else {
          break;
        }
      }
      return node;
    }
    parseUnary() {
      const t = this.peek();
      if (t && (t.type === '+' || t.type === '-')) {
        this.next();
        const node = this.parseUnary();
        return { type: 'unary', op: t.type, value: node };
      }
      return this.parsePower();
    }
    parsePower() {
      const base = this.parsePrimary();
      if (this.peek() && this.peek().type === '^') {
        this.next();
        return { type: 'binary', op: '^', left: base, right: this.parseUnary() };
      }
      return base;
    }
    parsePrimary() {
      const t = this.next();
      if (!t) throw new Error('表达式不完整');
      if (t.type === 'number') return { type: 'number', value: t.value };
      if (t.type === '(') {
        const node = this.parseExpr();
        this.expect(')');
        return node;
      }
      if (t.type === 'ident') {
        const name = t.value;
        if (FUNCTIONS[name]) {
          if (!this.peek() || this.peek().type !== '(') throw new Error(`函数 ${name} 后需要括号`);
          this.next();
          const args = [];
          if (this.peek() && this.peek().type !== ')') {
            args.push(this.parseExpr());
            while (this.peek() && this.peek().type === ',') {
              this.next();
              args.push(this.parseExpr());
            }
          }
          this.expect(')');
          if (!args.length) throw new Error(`函数 ${name} 缺少参数`);
          return { type: 'call', name, args };
        }
        if (CONSTANTS[name]) return { type: 'const', name };
        if (name === 'x' || name === 'y' || name === 'z') return { type: 'var', name };
        if (/^[xyz]+$/.test(name)) {
          // xy, xyz etc.
          let node = { type: 'var', name: name[0] };
          for (let i = 1; i < name.length; i++) {
            node = { type: 'binary', op: '*', left: node, right: { type: 'var', name: name[i] } };
          }
          return node;
        }
        throw new Error(`未知变量或函数“${name}”`);
      }
      throw new Error('表达式不完整');
    }
  }

  function containsVar(node, name) {
    if (!node) return false;
    if (node.type === 'var') return node.name === name;
    if (node.type === 'unary') return containsVar(node.value, name);
    if (node.type === 'binary') return containsVar(node.left, name) || containsVar(node.right, name);
    if (node.type === 'call') return node.args.some(a => containsVar(a, name));
    return false;
  }

  function compileNode(node) {
    switch (node.type) {
      case 'number': return `(${node.value})`;
      case 'const': return `(${CONSTANTS[node.name]})`;
      case 'var': return `(${node.name})`;
      case 'unary': return `(${node.op}${compileNode(node.value)})`;
      case 'binary':
        if (node.op === '^') return `Math.pow(${compileNode(node.left)},${compileNode(node.right)})`;
        return `(${compileNode(node.left)}${node.op}${compileNode(node.right)})`;
      case 'call': return `${FUNCTIONS[node.name]}(${node.args.map(compileNode).join(',')})`;
      default: throw new Error('内部表达式错误');
    }
  }

  function compileFunction(node, args = ['x', 'y', 'z']) {
    const code = `"use strict";return ${compileNode(node)};`;
    return new Function(...args, code);
  }

  function parseEquation(raw) {
    const original = String(raw || '').trim();
    if (!original) throw new Error('请输入方程');
    const text = normalizeExpression(original);
    const parts = text.split('=');
    if (parts.length !== 2) throw new Error('请使用“左边 = 右边”的形式');
    const leftText = parts[0].trim();
    const rightText = parts[1].trim();
    if (!leftText || !rightText) throw new Error('等号两边都不能为空');
    const left = new Parser(leftText).parse();
    const right = new Parser(rightText).parse();
    const implicit = compileFunction({ type: 'binary', op: '-', left, right });
    const explicitZ = leftText.toLowerCase() === 'z' && !containsVar(right, 'z');
    const surface = explicitZ ? compileFunction(right, ['x', 'y']) : null;
    return { raw: original, implicit, surface, explicitZ };
  }

  /* ------------------------------------------------------------------ *
   *  Three.js scene
   * ------------------------------------------------------------------ */

  const COLORS = ['#60a5fa', '#f472b6', '#34d399'];
  const DEFAULTS = ['', '', ''];
  const state = {
    range: 5,
    quality: 36,
    showGrid: true,
    showAxes: true,
    showIntersections: true,
    autoRotate: false,
    equations: DEFAULTS.slice()
  };

  const viewport = document.getElementById('viewport');
  const loading = document.getElementById('loading');
  const statusEl = document.getElementById('status');
  const legend = document.getElementById('legend');
  const renderBtn = document.getElementById('render-btn');
  const gridToggle = document.getElementById('show-grid');
  const axesToggle = document.getElementById('show-axes');
  const intersectionsToggle = document.getElementById('show-intersections');
  const autoRotateToggle = document.getElementById('auto-rotate');
  const eqRows = Array.from(document.querySelectorAll('.eq-row'));
  const eqInputs = eqRows.map(r => r.querySelector('.eq-input'));

  let renderer, scene, camera, controls, world;
  let axesGroup = null, gridGroup = null, intersectionsGroup = null;

  function initThree() {
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(viewport.clientWidth || 800, viewport.clientHeight || 600, false);
    if ('outputEncoding' in renderer) renderer.outputEncoding = THREE.sRGBEncoding;
    viewport.appendChild(renderer.domElement);

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x070b14);
    scene.fog = new THREE.FogExp2(0x070b14, 0.012);

    camera = new THREE.PerspectiveCamera(42, 1, 0.1, 300);
    camera.up.set(0, 0, 1);
    camera.position.set(9.5, -12, 9);

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.rotateSpeed = 0.85;
    controls.zoomSpeed = 0.9;
    controls.minDistance = 3;
    controls.maxDistance = 80;
    controls.screenSpacePanning = true;

    scene.add(new THREE.AmbientLight(0xffffff, 0.9));
    const key = new THREE.DirectionalLight(0xffffff, 0.8);
    key.position.set(10, -12, 16);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x38bdf8, 0.35);
    rim.position.set(-12, 10, 8);
    scene.add(rim);

    world = new THREE.Group();
    scene.add(world);

    resize();
    window.addEventListener('resize', resize);
    if (window.ResizeObserver) new ResizeObserver(resize).observe(viewport);
    animate();
  }

  function resize() {
    if (!renderer || !camera) return;
    const w = viewport.clientWidth || 1;
    const h = viewport.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function animate() {
    requestAnimationFrame(animate);
    if (!renderer) return;
    controls.autoRotate = state.autoRotate;
    controls.autoRotateSpeed = 0.8;
    controls.update();
    renderer.render(scene, camera);
  }

  function disposeObject(obj) {
    obj.traverse(child => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach(m => {
          if (m.map) m.map.dispose();
          m.dispose();
        });
      }
    });
  }

  function clearWorld() {
    while (world.children.length) {
      const child = world.children.pop();
      disposeObject(child);
    }
    axesGroup = gridGroup = intersectionsGroup = null;
  }

  function makeLabel(text, color) {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.font = '700 46px -apple-system, "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 12;
    ctx.fillText(text, 64, 34);
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: texture, transparent: true, depthTest: false, depthWrite: false
    }));
    sprite.scale.set(1.1, 0.55, 1);
    sprite.renderOrder = 10;
    return sprite;
  }

  function buildAxes(R) {
    const group = new THREE.Group();
    const axes = [
      { color: 0xf87171, end: [R, 0, 0], label: 'x' },
      { color: 0x4ade80, end: [0, R, 0], label: 'y' },
      { color: 0x60a5fa, end: [0, 0, R], label: 'z' }
    ];
    axes.forEach(axis => {
      const geometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-axis.end[0], -axis.end[1], -axis.end[2]),
        new THREE.Vector3(axis.end[0], axis.end[1], axis.end[2])
      ]);
      group.add(new THREE.Line(geometry, new THREE.LineBasicMaterial({
        color: axis.color, transparent: true, opacity: 0.9
      })));
      const label = makeLabel(axis.label, '#' + axis.color.toString(16).padStart(6, '0'));
      label.position.set(axis.end[0] * 1.07, axis.end[1] * 1.07, axis.end[2] * 1.07 + (axis.label === 'z' ? 0.25 : 0));
      group.add(label);
    });
    const origin = new THREE.Mesh(
      new THREE.SphereGeometry(0.055, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0xe2e8f0 })
    );
    group.add(origin);
    return group;
  }

  function buildGrid(R) {
    const grid = new THREE.GridHelper(2 * R, 20, 0x2a4a70, 0x152b45);
    grid.rotation.x = Math.PI / 2;
    grid.material.transparent = true;
    grid.material.opacity = 0.52;
    grid.material.depthWrite = false;
    return grid;
  }

  function buildSurface(eq, color) {
    const R = state.range;
    const seg = 72;
    const step = (2 * R) / seg;
    const positions = [];
    const indices = [];
    const indexMap = new Int32Array((seg + 1) * (seg + 1)).fill(-1);

    for (let j = 0; j <= seg; j++) {
      const y = -R + j * step;
      for (let i = 0; i <= seg; i++) {
        const x = -R + i * step;
        const z = eq.surface(x, y);
        if (!Number.isFinite(z) || Math.abs(z) > R * 3.2) continue;
        indexMap[j * (seg + 1) + i] = positions.length / 3;
        positions.push(x, y, z);
      }
    }

    for (let j = 0; j < seg; j++) {
      for (let i = 0; i < seg; i++) {
        const a = indexMap[j * (seg + 1) + i];
        const b = indexMap[j * (seg + 1) + i + 1];
        const c = indexMap[(j + 1) * (seg + 1) + i];
        const d = indexMap[(j + 1) * (seg + 1) + i + 1];
        if (a < 0 || b < 0 || c < 0 || d < 0) continue;
        indices.push(a, b, c, b, d, c);
      }
    }

    if (!positions.length) return null;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const material = new THREE.MeshPhongMaterial({
      color,
      transparent: true,
      opacity: 0.14,
      side: THREE.DoubleSide,
      depthWrite: false,
      shininess: 55,
      specular: 0x1e3a5f
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = 1;
    return mesh;
  }

  function buildImplicit(eq, color) {
    const R = state.range;
    const N = state.quality;
    const step = (2 * R) / N;
    const size = N + 1;
    const values = new Float32Array(size * size * size);

    let vIndex = 0;
    for (let k = 0; k <= N; k++) {
      const z = -R + k * step;
      for (let j = 0; j <= N; j++) {
        const y = -R + j * step;
        for (let i = 0; i <= N; i++) {
          const x = -R + i * step;
          const v = eq.implicit(x, y, z);
          values[vIndex++] = Number.isFinite(v) ? v : NaN;
        }
      }
    }

    const corners = [
      [0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0],
      [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]
    ];
    const edges = [
      [0, 1], [2, 3], [4, 5], [6, 7],
      [0, 2], [1, 3], [4, 6], [5, 7],
      [0, 4], [1, 5], [2, 6], [3, 7]
    ];
    const points = [];
    const seen = new Set();
    const idx = (i, j, k) => i + size * (j + size * k);

    function addPoint(px, py, pz) {
      const key = `${px.toFixed(3)},${py.toFixed(3)},${pz.toFixed(3)}`;
      if (seen.has(key)) return;
      seen.add(key);
      points.push(px, py, pz);
    }

    for (let k = 0; k < N; k++) {
      const z0 = -R + k * step;
      for (let j = 0; j < N; j++) {
        const y0 = -R + j * step;
        for (let i = 0; i < N; i++) {
          const x0 = -R + i * step;
          const vals = [
            values[idx(i, j, k)], values[idx(i + 1, j, k)],
            values[idx(i, j + 1, k)], values[idx(i + 1, j + 1, k)],
            values[idx(i, j, k + 1)], values[idx(i + 1, j, k + 1)],
            values[idx(i, j + 1, k + 1)], values[idx(i + 1, j + 1, k + 1)]
          ];
          let hasNaN = false;
          let min = Infinity, max = -Infinity;
          for (const v of vals) {
            if (Number.isNaN(v)) { hasNaN = true; break; }
            if (v < min) min = v;
            if (v > max) max = v;
          }
          if (hasNaN || min > 0 || max < 0) continue;
          for (const [a, b] of edges) {
            const va = vals[a], vb = vals[b];
            if (!((va <= 0 && vb >= 0) || (va >= 0 && vb <= 0))) continue;
            if (va === 0 && vb === 0) {
              const c = corners[a];
              addPoint(x0 + c[0] * step, y0 + c[1] * step, z0 + c[2] * step);
              continue;
            }
            const t = va / (va - vb);
            const ca = corners[a], cb = corners[b];
            addPoint(
              x0 + (ca[0] + (cb[0] - ca[0]) * t) * step,
              y0 + (ca[1] + (cb[1] - ca[1]) * t) * step,
              z0 + (ca[2] + (cb[2] - ca[2]) * t) * step
            );
          }
        }
      }
    }

    if (!points.length) return null;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    const material = new THREE.PointsMaterial({
      color,
      size: Math.max(0.05, R * 0.013),
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.95,
      depthWrite: false
    });
    const cloud = new THREE.Points(geometry, material);
    cloud.renderOrder = 2;
    return cloud;
  }

  function buildIntersections(eqs) {
    if (!state.showIntersections || eqs.length < 2) return null;
    const R = state.range;
    const N = Math.min(state.quality, 44);
    const step = (2 * R) / N;
    const tol = Math.max(0.035, R * 0.013);
    const points = [];
    const seen = new Set();

    function addPoint(x, y, z) {
      const key = `${x.toFixed(2)},${y.toFixed(2)},${z.toFixed(2)}`;
      if (seen.has(key)) return;
      seen.add(key);
      points.push(x, y, z);
    }

    for (let p = 0; p < eqs.length; p++) {
      for (let q = p + 1; q < eqs.length; q++) {
        const f = eqs[p].implicit;
        const g = eqs[q].implicit;
        for (let k = 0; k <= N; k++) {
          const z = -R + k * step;
          for (let j = 0; j <= N; j++) {
            const y = -R + j * step;
            for (let i = 0; i <= N; i++) {
              const x = -R + i * step;
              if (Math.abs(f(x, y, z)) < tol && Math.abs(g(x, y, z)) < tol) addPoint(x, y, z);
            }
          }
        }
      }
    }

    if (points.length < 3) return null;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    const material = new THREE.PointsMaterial({
      color: 0xfbbf24,
      size: Math.max(0.09, R * 0.018),
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.96,
      depthWrite: false
    });
    const cloud = new THREE.Points(geometry, material);
    cloud.renderOrder = 5;
    return cloud;
  }

  function updateLegend(valid) {
    const items = valid.map((eq, i) => `<div class="legend-item"><span class="legend-dot" style="background:${COLORS[i]}"></span><code>${escapeHtml(eq.raw)}</code></div>`);
    if (state.showIntersections && valid.length > 1) {
      items.push('<div class="legend-item"><span class="legend-dot" style="background:#fbbf24"></span><code>曲面交线</code></div>');
    }
    legend.innerHTML = items.join('') || '<div class="legend-item" style="color:#6f89a8">等待输入方程</div>';
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function readEquations() {
    const parsed = [];
    eqRows.forEach((row, i) => {
      const raw = eqInputs[i].value;
      const errorEl = row.querySelector('.eq-error');
      row.classList.remove('invalid');
      errorEl.textContent = '';
      try {
        if (!raw.trim()) return; // 空输入表示这一行不画，不报错
        parsed.push(parseEquation(raw));
      } catch (e) {
        row.classList.add('invalid');
        errorEl.textContent = e.message;
      }
    });
    return parsed;
  }

  function showEmptyScene() {
    if (!renderer) return;
    clearWorld();
    const R = state.range;
    gridGroup = buildGrid(R);
    axesGroup = buildAxes(R);
    gridGroup.visible = state.showGrid;
    axesGroup.visible = state.showAxes;
    world.add(gridGroup);
    world.add(axesGroup);
    updateLegend([]);
    statusEl.textContent = '请输入方程后点击绘制';
    loading.hidden = true;
  }

  function draw() {
    if (!renderer) return;
    loading.hidden = false;
    renderBtn.disabled = true;
    statusEl.textContent = '正在计算曲面…';
    const start = performance.now();

    setTimeout(() => {
      let valid = [];
      try {
        valid = readEquations();
        clearWorld();
        const R = state.range;
        gridGroup = buildGrid(R);
        axesGroup = buildAxes(R);
        gridGroup.visible = state.showGrid;
        axesGroup.visible = state.showAxes;
        world.add(gridGroup);
        world.add(axesGroup);

        valid.forEach((eq, i) => {
          const color = new THREE.Color(COLORS[i]);
          const object = eq.explicitZ ? buildSurface(eq, color) : buildImplicit(eq, color);
          if (object) world.add(object);
        });

        intersectionsGroup = buildIntersections(valid);
        if (intersectionsGroup) world.add(intersectionsGroup);

        updateLegend(valid);
        const ms = Math.round(performance.now() - start);
        const hasInput = eqInputs.some(input => input.value.trim());
        const msg = valid.length ? `已绘制 ${valid.length} 个方程 · 36³ 标准采样 · ${ms} ms` : (hasInput ? '没有可绘制的有效方程' : '请输入方程后点击绘制');
        statusEl.textContent = msg;
      } catch (e) {
        console.error(e);
        statusEl.textContent = '绘制失败：' + e.message;
      } finally {
        loading.hidden = true;
        renderBtn.disabled = false;
      }
    }, 30);
  }

  function syncUI() {
    gridToggle.checked = state.showGrid;
    axesToggle.checked = state.showAxes;
    intersectionsToggle.checked = state.showIntersections;
    autoRotateToggle.checked = state.autoRotate;
    eqInputs.forEach((input, i) => { input.value = state.equations[i] || ''; });
  }

  function resetAll() {
    state.range = 5;
    state.quality = 36;
    state.showGrid = true;
    state.showAxes = true;
    state.showIntersections = true;
    state.autoRotate = false;
    state.equations = DEFAULTS.slice();
    syncUI();
    showEmptyScene();
  }

  // events
  renderBtn.addEventListener('click', draw);
  document.getElementById('reset-btn').addEventListener('click', resetAll);
  gridToggle.addEventListener('change', () => {
    state.showGrid = gridToggle.checked;
    if (gridGroup) gridGroup.visible = state.showGrid;
  });
  axesToggle.addEventListener('change', () => {
    state.showAxes = axesToggle.checked;
    if (axesGroup) axesGroup.visible = state.showAxes;
  });
  intersectionsToggle.addEventListener('change', () => {
    state.showIntersections = intersectionsToggle.checked;
    draw();
  });
  autoRotateToggle.addEventListener('change', () => {
    state.autoRotate = autoRotateToggle.checked;
  });
  eqInputs.forEach((input, i) => {
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); state.equations[i] = input.value; draw(); }
    });
    input.addEventListener('change', () => { state.equations[i] = input.value; });
  });
  eqRows.forEach((row, i) => {
    row.querySelector('.eq-clear').addEventListener('click', e => {
      e.preventDefault();
      eqInputs[i].value = '';
      state.equations[i] = '';
      eqInputs[i].focus();
    });
  });

  function cleanLegacyExamples() {
    eqInputs.forEach((input, i) => {
      if (/例如/.test(input.placeholder)) input.placeholder = `输入第 ${i + 1} 个方程`;
      if (input.value === 'x^2 + y^2 = 4' || input.value === 'z = 0' || input.value === 'z = 4') input.value = '';
    });
  }

  // boot
  try {
    initThree();
    cleanLegacyExamples();
    syncUI();
    showEmptyScene();
  } catch (e) {
    console.error(e);
    document.getElementById('status').textContent = '当前浏览器不支持 WebGL';
  }
})();
