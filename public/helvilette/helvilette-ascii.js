/**
 * <helvilette-ascii>: the homepage illustration of Helvilette, redrawn as a
 * dim ASCII backdrop that fills the hero. The pointer is a lamp: wherever it
 * goes, it brings the neon up and reveals the fur, whiskers and ears that the
 * outlines alone do not show. Her eyes follow the lamp, narrow in its light,
 * and slow-blink if it stays on her face.
 *
 * Framing comes from CSS custom properties on the element, so media queries
 * decide where the cat sits:
 *   --anchor-x, --anchor-y  where her face lands, as a fraction of the box
 *   --zoom                  1 = the artwork's height fills the box
 *
 * Pipeline, once per frame:
 *   1. Sample the scene at 2x2 points per character cell, in two layers: an
 *      emissive one (the neon artwork plus the live eyes, redrawn each frame)
 *      and an albedo one (surfaces that only show when lit, built once).
 *   2. Light every cell on the CPU and choose a glyph from its 2x2 samples.
 *   3. Draw the glyph grid with one WebGL pass (Canvas 2D fallback).
 *
 * The source image is src/assets/helvilette.webp without the watermark edge:
 *   sharp('src/assets/helvilette.webp')
 *     .extract({ left: 0, top: 0, width: 2560, height: 1536 })
 *     .resize(1280).webp({ quality: 80 })
 *
 * All geometry below is in pixels of the original 2752x1536 image.
 */

const SOURCE = '/helvilette/helvilette-source.webp';
const SRC = { w: 2560, h: 1536 };
const ART_HEIGHT = 1476; // the part of the artwork that --zoom: 1 fits to the box
const CELL_W = 6; // target glyph advance in CSS px
const CELL_ASPECT = 0.6; // glyph advance / line height
const MAX_CELLS = 26000;
const SUB = 2; // samples per cell, per axis

const RAMP = ' .:-=+*#%@';
// 2x2 sample bit patterns (a=1 top-left, b=2 top-right, c=4 bottom-left,
// d=8 bottom-right) that read better as a stroke than as a shade.
const EDGE = { 9: '\\', 6: '/', 5: '|', 10: '|', 3: '-', 12: '_', 1: "'", 2: '`', 4: ',', 8: '.' };

const NEON = { cyan: '#5ff2ff', eye: '#9fe6ff' };
const LAMP = [1.0, 0.84, 0.6];
// Resting brightness of the artwork, and how much the lamp adds on top.
const AMBIENT = 0.55;
const LAMP_GAIN = 1.1;

const EYES = [
	{ x: 1317, y: 705 },
	{ x: 1455, y: 707 },
];
const EYE_RX = 35;
const EYE_RY = 31;
const FACE = { x: 1386, y: 720 };
const RING = { x: 1385, y: 712, r0: 235, r1: 320 };

// Silhouette of the sitting cat, traced from the original.
const CAT = [
	[165, 62], [240, 132], [345, 128], [418, 68], [440, 170], [448, 250], [430, 310],
	[420, 335], [440, 380], [480, 460], [520, 560], [545, 680], [545, 790], [525, 870],
	[480, 895], [170, 895], [140, 860], [130, 760], [140, 640], [160, 520], [170, 420],
	[160, 340], [145, 300], [138, 230], [145, 150],
].map(([x, y]) => [x + 1100, y + 480]);

const EARS = [
	[[1270, 560], [1280, 650], [1325, 615]],
	[[1510, 565], [1495, 650], [1455, 615]],
];

const WHISKERS = [
	[[1345, 762], [1290, 750], [1225, 742]],
	[[1345, 772], [1290, 776], [1232, 786]],
	[[1427, 762], [1482, 752], [1548, 746]],
	[[1427, 772], [1482, 778], [1542, 790]],
];

/* ------------------------------------------------------------------------ */

const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;

function mulberry32(seed) {
	return () => {
		seed |= 0;
		seed = (seed + 0x6d2b79f5) | 0;
		let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function canvas(w, h, readBack = false) {
	const c = document.createElement('canvas');
	c.width = w;
	c.height = h;
	c.ctx = c.getContext('2d', readBack ? { willReadFrequently: true } : undefined);
	return c;
}

function polygon(ctx, pts) {
	ctx.beginPath();
	ctx.moveTo(...pts[0]);
	for (let i = 1; i < pts.length; i++) ctx.lineTo(...pts[i]);
	ctx.closePath();
}

/* -- WebGL presenter: one quad, one fragment shader ------------------------ */

const VERT = `
attribute vec2 p;
varying vec2 uv;
void main() {
	uv = vec2(p.x * 0.5 + 0.5, 0.5 - p.y * 0.5);
	gl_Position = vec4(p, 0.0, 1.0);
}`;

// Output is premultiplied, over a transparent canvas, so the page shows through.
const FRAG = `
precision mediump float;
uniform sampler2D cellTex;   // rgb: ink, a: intensity
uniform sampler2D glyphTex;  // r: glyph index
uniform sampler2D bloomTex;  // rgb: glow, linear filtered
uniform sampler2D atlasTex;  // glyph coverage in alpha
uniform vec2 grid;
uniform float chars;
varying vec2 uv;
void main() {
	vec2 g = uv * grid;
	vec2 cell = floor(g);
	vec2 f = g - cell;
	vec2 cuv = (cell + 0.5) / grid;
	vec4 ink = texture2D(cellTex, cuv);
	float idx = floor(texture2D(glyphTex, cuv).r * 255.0 + 0.5);
	float a = 0.0;
	if (idx > 0.5) a = texture2D(atlasTex, vec2((idx - 1.0 + f.x) / chars, f.y)).a * ink.a;
	vec2 px = 1.0 / grid;
	vec3 bloom = (texture2D(bloomTex, uv).rgb * 0.4
		+ (texture2D(bloomTex, uv + vec2(px.x * 1.5, 0.0)).rgb
		+ texture2D(bloomTex, uv - vec2(px.x * 1.5, 0.0)).rgb
		+ texture2D(bloomTex, uv + vec2(0.0, px.y * 1.5)).rgb
		+ texture2D(bloomTex, uv - vec2(0.0, px.y * 1.5)).rgb) * 0.15) * 0.55;
	float ba = clamp(max(bloom.r, max(bloom.g, bloom.b)), 0.0, 1.0);
	gl_FragColor = vec4(ink.rgb * a + bloom * (1.0 - a), a + ba * (1.0 - a));
}`;

class GLPresenter {
	static create(cnv) {
		const gl = cnv.getContext('webgl', { alpha: true, antialias: false, depth: false, premultipliedAlpha: true });
		if (!gl) return null;
		try {
			return new GLPresenter(gl);
		} catch {
			return null;
		}
	}

	constructor(gl) {
		this.gl = gl;
		const shader = (type, src) => {
			const s = gl.createShader(type);
			gl.shaderSource(s, src);
			gl.compileShader(s);
			if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
			return s;
		};
		const prog = gl.createProgram();
		gl.attachShader(prog, shader(gl.VERTEX_SHADER, VERT));
		gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FRAG));
		gl.linkProgram(prog);
		if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
		gl.useProgram(prog);
		this.prog = prog;

		gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
		const loc = gl.getAttribLocation(prog, 'p');
		gl.enableVertexAttribArray(loc);
		gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
		gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);

		this.tex = {};
		['cellTex', 'glyphTex', 'bloomTex', 'atlasTex'].forEach((name, unit) => {
			gl.activeTexture(gl.TEXTURE0 + unit);
			gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
			const filter = name === 'bloomTex' || name === 'atlasTex' ? gl.LINEAR : gl.NEAREST;
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
			gl.uniform1i(gl.getUniformLocation(prog, name), unit);
			this.tex[name] = unit;
		});
	}

	upload(name, ...args) {
		const gl = this.gl;
		gl.activeTexture(gl.TEXTURE0 + this.tex[name]);
		gl.texImage2D(gl.TEXTURE_2D, 0, ...args);
	}

	resize(view) {
		const gl = this.gl;
		gl.viewport(0, 0, view.canvas.width, view.canvas.height);
		gl.uniform2f(gl.getUniformLocation(this.prog, 'grid'), view.cols, view.rows);
		gl.uniform1f(gl.getUniformLocation(this.prog, 'chars'), view.charList.length - 1);
		this.upload('atlasTex', gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, view.atlas.canvas);
	}

	draw(view) {
		const gl = this.gl;
		const { cols, rows } = view;
		this.upload('cellTex', gl.RGBA, cols, rows, 0, gl.RGBA, gl.UNSIGNED_BYTE, view.tint);
		this.upload('glyphTex', gl.LUMINANCE, cols, rows, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, view.shown);
		this.upload('bloomTex', gl.RGBA, cols, rows, 0, gl.RGBA, gl.UNSIGNED_BYTE, view.glow);
		gl.clearColor(0, 0, 0, 0);
		gl.clear(gl.COLOR_BUFFER_BIT);
		gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
	}
}

/* -- Canvas 2D presenter, for browsers without WebGL ---------------------- */

class CanvasPresenter {
	constructor(cnv) {
		this.ctx = cnv.getContext('2d');
	}

	resize(view) {
		this.tint = canvas(view.cols, view.rows);
		this.glow = canvas(view.cols, view.rows);
		this.glyphs = canvas(view.canvas.width, view.canvas.height);
	}

	draw(view) {
		const { cols, rows, cw, ch, dpr } = view;
		this.tint.ctx.putImageData(new ImageData(new Uint8ClampedArray(view.tint.buffer), cols, rows), 0, 0);
		this.glow.ctx.putImageData(new ImageData(new Uint8ClampedArray(view.glow.buffer), cols, rows), 0, 0);

		const g = this.glyphs.ctx;
		const { canvas: atlas, gw, gh } = view.atlas;
		g.globalCompositeOperation = 'source-over';
		g.clearRect(0, 0, this.glyphs.width, this.glyphs.height);
		for (let r = 0; r < rows; r++) {
			const dy = Math.round(r * ch * dpr);
			for (let c = 0; c < cols; c++) {
				const i = r * cols + c;
				const glyph = view.shown[i];
				if (!glyph) continue;
				g.globalAlpha = view.tint[i * 4 + 3] / 255;
				g.drawImage(atlas, (glyph - 1) * gw, 0, gw, gh, Math.round(c * cw * dpr), dy, gw, gh);
			}
		}
		g.globalAlpha = 1;
		g.globalCompositeOperation = 'source-in';
		g.imageSmoothingEnabled = false;
		g.drawImage(this.tint, 0, 0, this.glyphs.width, this.glyphs.height);

		const ctx = this.ctx;
		const { width, height } = ctx.canvas;
		ctx.clearRect(0, 0, width, height);
		if (!view.light.theme) {
			ctx.globalAlpha = 0.55;
			ctx.globalCompositeOperation = 'lighter';
			ctx.drawImage(this.glow, 0, 0, width, height);
			ctx.globalAlpha = 1;
			ctx.globalCompositeOperation = 'source-over';
		}
		ctx.drawImage(this.glyphs, 0, 0);
	}
}

/* ------------------------------------------------------------------------ */

class HelviletteAscii extends HTMLElement {
	connectedCallback() {
		if (this.canvas) return;
		this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

		this.canvas = document.createElement('canvas');
		this.canvas.setAttribute('aria-hidden', 'true');

		this.img = new Image();
		this.img.src = this.getAttribute('src') || SOURCE;
		this.img
			.decode()
			.then(() => this.isConnected && this.start())
			.catch(() => {
				/* Keep the static fallback image. */
			});
	}

	disconnectedCallback() {
		cancelAnimationFrame(this.raf);
		this.raf = 0;
		this.resizeObserver?.disconnect();
		this.visibility?.disconnect();
		this.themeObserver?.disconnect();
		window.removeEventListener('pointermove', this.onPointer);
		window.removeEventListener('pointerdown', this.onPointer);
		document.removeEventListener('mouseout', this.onLeave);
	}

	start() {
		this.presenter = GLPresenter.create(this.canvas) || new CanvasPresenter(this.canvas);
		this.light = { x: 0, y: 0, tx: 0, ty: 0, pointer: false, ready: false, theme: 0 };
		this.state = {
			t: 0,
			attn: 0,
			attnHold: 0,
			faceLight: 0,
			gaze: [FACE.x, FACE.y],
			blink: { at: 2.5, len: 0.18, start: -10 },
			slowBlinkReady: true,
			glitches: [],
			nextGlitch: 2,
		};
		this.append(this.canvas);
		this.classList.add('is-live');

		// The backdrop sits under the hero text, so it cannot take pointer
		// events itself; track the pointer over its whole box instead.
		this.onPointer = (e) => {
			const r = this.getBoundingClientRect();
			const x = e.clientX - r.left;
			const y = e.clientY - r.top;
			const inside = x >= 0 && y >= 0 && x <= r.width && y <= r.height;
			if (inside) {
				this.light.tx = x;
				this.light.ty = y;
				this.light.ready = true;
			}
			const changed = inside !== this.light.pointer;
			this.light.pointer = inside;
			if (this.reduced && (inside || changed)) this.kick();
		};
		this.onLeave = (e) => {
			if (!e.relatedTarget) this.light.pointer = false;
		};
		window.addEventListener('pointermove', this.onPointer, { passive: true });
		window.addEventListener('pointerdown', this.onPointer, { passive: true });
		document.addEventListener('mouseout', this.onLeave);

		// Neon on the dark theme, deeper ink and no glow on the light one.
		const readTheme = () => {
			this.light.theme = document.documentElement.dataset.theme === 'light' ? 1 : 0;
			if (this.cols) this.render();
		};
		this.themeObserver = new MutationObserver(readTheme);
		this.themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
		readTheme();

		this.resizeObserver = new ResizeObserver(() => this.layout());
		this.resizeObserver.observe(this);

		this.visible = true;
		this.visibility = new IntersectionObserver(([entry]) => {
			this.visible = entry.isIntersecting;
			if (this.visible) this.kick();
		});
		this.visibility.observe(this);
		document.addEventListener('visibilitychange', () => this.kick());

		this.layout();
	}

	kick() {
		if (this.raf || !this.cols) return;
		this.last = performance.now();
		this.raf = requestAnimationFrame((now) => this.frame(now));
	}

	/* -- layout: everything that depends on size is rebuilt here ---------- */

	layout() {
		const W = Math.round(this.clientWidth);
		const H = Math.round(this.clientHeight);
		if (!W || !H || (W === this.W && H === this.H)) return;
		const style = getComputedStyle(this);
		const num = (name, fallback) => {
			const v = parseFloat(style.getPropertyValue(name));
			return Number.isFinite(v) ? v : fallback;
		};

		const dpr = Math.min(window.devicePixelRatio || 1, 2);
		let cols = Math.max(20, Math.round(W / CELL_W));
		let rows = Math.ceil(H / (W / cols / CELL_ASPECT));
		if (cols * rows > MAX_CELLS) {
			const f = Math.sqrt(MAX_CELLS / (cols * rows));
			cols = Math.floor(cols * f);
			rows = Math.ceil(H / (W / cols / CELL_ASPECT));
		}
		const cw = W / cols;
		const ch = cw / CELL_ASPECT;
		const Hc = rows * ch;
		Object.assign(this, { W, H, Hc, dpr, cols, rows, cw, ch });

		// Image px -> screen px: scale k, with her face at the anchor point.
		const k = num('--zoom', 1) * Math.max(H / ART_HEIGHT, W / SRC.w);
		this.k = k;
		this.bx = num('--anchor-x', 0.5) * W - FACE.x * k;
		this.by = num('--anchor-y', 0.5) * H - FACE.y * k;

		this.canvas.width = Math.round(W * dpr);
		this.canvas.height = Math.round(Hc * dpr);
		this.canvas.style.width = `${W}px`;
		this.canvas.style.height = `${Hc}px`;

		this.SW = cols * SUB;
		this.SH = rows * SUB;
		this.T = this.sampleTransform(1);

		this.base = this.buildBase();
		this.albedoData = this.buildAlbedo().ctx.getImageData(0, 0, this.SW, this.SH).data;
		this.scene = canvas(this.SW, this.SH, true);
		this.buildAtlas();

		const n = cols * rows;
		this.cells = new Uint8Array(n);
		this.shown = new Uint8Array(n);
		this.tint = new Uint8Array(n * 4);
		this.glow = new Uint8Array(n * 4);

		// Per-cell constants: rune ring membership and angle, twinkle phase,
		// and a focus falloff that keeps the cat brighter than the edges.
		this.ringAngle = new Float32Array(n);
		this.ringMask = new Uint8Array(n);
		this.phase = new Float32Array(n);
		this.focus = new Float32Array(n);
		const rnd = mulberry32(7);
		for (let r = 0; r < rows; r++) {
			for (let c = 0; c < cols; c++) {
				const i = r * cols + c;
				const [ox, oy] = this.toImage((c + 0.5) * cw, (r + 0.5) * ch);
				const dx = ox - RING.x;
				const dy = oy - RING.y;
				const d = Math.hypot(dx, dy);
				this.ringMask[i] = d > RING.r0 && d < RING.r1 ? 1 : 0;
				this.ringAngle[i] = Math.atan2(dy, dx);
				this.phase[i] = rnd() * Math.PI * 2;
				const fy = oy - 860;
				this.focus[i] = 0.55 + 0.45 * Math.exp(-(dx * dx + fy * fy * 0.8) / 600 ** 2);
			}
		}

		if (!this.light.ready) {
			const f = this.toScreen(FACE.x, FACE.y + 120);
			this.light.x = this.light.tx = f[0];
			this.light.y = this.light.ty = f[1];
		}
		this.presenter.resize(this);
		this.update(0, 0);
		this.render();
		this.kick();
	}

	/** Image px -> sample canvas px, at `m` samples per sample px. */
	sampleTransform(m) {
		const sx = (this.SW * m) / this.W;
		const sy = (this.SH * m) / this.Hc;
		return [this.k * sx, 0, 0, this.k * sy, this.bx * sx, this.by * sy];
	}

	toScreen(x, y) {
		return [x * this.k + this.bx, y * this.k + this.by];
	}

	toImage(x, y) {
		return [(x - this.bx) / this.k, (y - this.by) / this.k];
	}

	/** The neon artwork, with a black point so the navy haze reads as empty
	 *  space, and with the original eyes removed (live ones are drawn later). */
	buildBase() {
		const { SW, SH } = this;
		// Sample at twice the resolution, then keep the brightest of each 2x2
		// block, so thin neon strokes survive the reduction.
		const big = canvas(SW * 2, SH * 2, true);
		const bctx = big.ctx;
		bctx.imageSmoothingQuality = 'high';
		bctx.setTransform(...this.sampleTransform(2));
		bctx.drawImage(this.img, 0, 0, SRC.w, SRC.h);
		bctx.fillStyle = '#000';
		for (const e of EYES) {
			bctx.beginPath();
			bctx.ellipse(e.x, e.y, EYE_RX + 10, EYE_RY + 10, 0, 0, Math.PI * 2);
			bctx.fill();
		}
		const src = bctx.getImageData(0, 0, SW * 2, SH * 2).data;

		const b = canvas(SW, SH, true);
		const img = b.ctx.createImageData(SW, SH);
		const d = img.data;
		const BW = SW * 2;
		for (let y = 0; y < SH; y++) {
			for (let x = 0; x < SW; x++) {
				let best = 0;
				let bl = -1;
				for (let k = 0; k < 4; k++) {
					const p = ((y * 2 + (k >> 1)) * BW + x * 2 + (k & 1)) * 4;
					const l = Math.max(src[p], src[p + 1], src[p + 2]);
					if (l > bl) {
						bl = l;
						best = p;
					}
				}
				const l = bl / 255;
				const f = l > 0 ? Math.pow(clamp((l - 0.18) / 0.82), 1.05) / l : 0;
				const q = (y * SW + x) * 4;
				d[q] = src[best] * f;
				d[q + 1] = src[best + 1] * f;
				d[q + 2] = src[best + 2] * f;
				d[q + 3] = 255;
			}
		}
		b.ctx.putImageData(img, 0, 0);
		return b;
	}

	/** Surfaces that only show under the lamp: dust, fur, ears, whiskers. */
	buildAlbedo() {
		const { SW, SH } = this;
		const a = canvas(SW, SH, true);
		const ctx = a.ctx;
		const rnd = mulberry32(42);

		const dust = ctx.createImageData(SW, SH);
		for (let i = 0; i < dust.data.length; i += 4) {
			const v = rnd() < 0.2 ? rnd() * 24 : 0;
			dust.data[i] = v;
			dust.data[i + 1] = v;
			dust.data[i + 2] = v * 1.1;
			dust.data[i + 3] = 255;
		}
		ctx.putImageData(dust, 0, 0);

		const fur = canvas(SW, SH, true);
		const furData = fur.ctx.createImageData(SW, SH);
		for (let i = 0; i < furData.data.length; i += 4) {
			const v = 40 + rnd() * 55;
			furData.data[i] = v * 0.62;
			furData.data[i + 1] = v * 0.66;
			furData.data[i + 2] = v * 0.95;
			furData.data[i + 3] = 255;
		}
		fur.ctx.putImageData(furData, 0, 0);

		ctx.save();
		ctx.setTransform(...this.T);
		polygon(ctx, CAT);
		ctx.clip();
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.drawImage(fur, 0, 0);
		ctx.restore();

		ctx.setTransform(...this.T);
		ctx.fillStyle = 'rgba(170,170,195,0.5)';
		ctx.beginPath();
		ctx.ellipse(1386, 768, 72, 40, 0, 0, Math.PI * 2);
		ctx.fill();
		ctx.fillStyle = 'rgb(200,110,160)';
		for (const ear of EARS) {
			polygon(ctx, ear);
			ctx.fill();
		}
		ctx.strokeStyle = 'rgb(240,240,250)';
		ctx.lineWidth = 8;
		ctx.lineCap = 'round';
		for (const w of WHISKERS) {
			ctx.beginPath();
			ctx.moveTo(...w[0]);
			ctx.quadraticCurveTo(...w[1], ...w[2]);
			ctx.stroke();
		}
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		return a;
	}

	buildAtlas() {
		const chars = [...new Set(RAMP.slice(1) + Object.values(EDGE).join(''))];
		const gw = Math.ceil(this.cw * this.dpr);
		const gh = Math.ceil(this.ch * this.dpr);
		const atlas = canvas(gw * chars.length, gh);
		const ctx = atlas.ctx;
		ctx.fillStyle = '#fff';
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.font = `${Math.round(this.ch * 0.9 * this.dpr)}px ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace`;
		const index = new Map();
		chars.forEach((ch, i) => {
			ctx.fillText(ch, i * gw + gw / 2, gh / 2 + gh * 0.04);
			index.set(ch, i + 1);
		});
		this.atlas = { canvas: atlas, gw, gh };
		this.charList = [' ', ...chars];
		this.edgeIndex = new Uint8Array(16);
		for (const [bits, ch] of Object.entries(EDGE)) this.edgeIndex[bits] = index.get(ch);
		this.rampIndex = [...RAMP].map((ch, i) => (i ? index.get(ch) : 0));
	}

	/* -- animation -------------------------------------------------------- */

	frame(now) {
		this.raf = 0;
		if (!this.visible || document.hidden || !this.isConnected) return;
		const dt = Math.min((now - this.last) / 1000, 0.1);
		if (dt >= 1 / 32 || this.reduced) {
			this.last = now;
			this.update(this.reduced ? 0 : dt, dt);
			this.render();
		}
		if (!this.reduced) this.raf = requestAnimationFrame((t) => this.frame(t));
	}

	update(dt, realDt) {
		const s = this.state;
		const L = this.light;
		s.t += dt;

		// The lamp follows the pointer, or drifts around her on its own.
		if (!L.pointer) {
			const p = this.toScreen(1390 + 360 * Math.sin(s.t * 0.23), 840 + 300 * Math.sin(s.t * 0.31 + 1));
			L.tx = p[0];
			L.ty = p[1];
		}
		const k = this.reduced ? 1 : 1 - Math.exp(-(realDt || 0.016) * (L.pointer ? 14 : 2.2));
		L.x = lerp(L.x, L.tx, k);
		L.y = lerp(L.y, L.ty, k);

		// How strongly the lamp falls on her face.
		const face = this.toScreen(FACE.x, FACE.y);
		const R = this.lampRadius();
		s.faceLight = Math.exp(-((L.x - face[0]) ** 2 + (L.y - face[1]) ** 2) / (R * R));
		// She watches the lamp whenever the pointer is over the hero.
		const wants = L.pointer ? 1 : 0;
		s.attn = this.reduced ? wants : lerp(s.attn, wants, clamp(realDt * (wants ? 5 : 1.6)));

		// A slow blink after the light has stayed on her face for a while.
		s.attnHold = s.attn > 0.85 && s.faceLight > 0.5 ? s.attnHold + realDt : 0;
		if (s.attnHold > 2.2 && s.slowBlinkReady) {
			s.blink = { start: s.t, len: 1.1, at: s.t + 4 };
			s.slowBlinkReady = false;
		}
		if (s.attnHold === 0) s.slowBlinkReady = true;
		if (s.t > s.blink.at) s.blink = { start: s.t, len: 0.18, at: s.t + 3.5 + Math.random() * 4 };

		// Straight ahead, as in the original, unless she is watching the lamp.
		const lamp = this.toImage(L.x, L.y);
		const target = [lerp(FACE.x, lamp[0], s.attn), lerp(FACE.y, lamp[1], s.attn)];
		const g = this.reduced ? 1 : clamp(realDt * 12);
		s.gaze = [lerp(s.gaze[0], target[0], g), lerp(s.gaze[1], target[1], g)];

		// Occasional horizontal tearing, in keeping with the original's glitches.
		if (!this.reduced) {
			if (s.t > s.nextGlitch) {
				const bands = 1 + Math.floor(Math.random() * 3);
				for (let i = 0; i < bands; i++) {
					const r0 = Math.floor(Math.random() * this.rows);
					s.glitches.push({
						r0,
						r1: r0 + 1 + Math.floor(Math.random() * 3),
						off: Math.round((Math.random() - 0.5) * 10) || 2,
						until: s.t + 0.08 + Math.random() * 0.18,
					});
				}
				s.nextGlitch = s.t + 2 + Math.random() * 4;
			}
			s.glitches = s.glitches.filter((gl) => gl.until > s.t);
		}
	}

	lampRadius() {
		return clamp(Math.min(this.W, this.H) * 0.24, 80, 170);
	}

	/* -- scene ------------------------------------------------------------ */

	drawScene() {
		const ctx = this.scene.ctx;
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.drawImage(this.base, 0, 0);
		ctx.setTransform(...this.T);
		ctx.lineCap = 'round';
		this.drawEyes(ctx, this.state);
	}

	drawEyes(ctx, s) {
		const bt = (s.t - s.blink.start) / s.blink.len;
		const lid = bt >= 0 && bt <= 1 ? Math.sin(Math.PI * bt) : 0;
		// Pupils narrow to slits in bright light and glow back at it.
		const pw = lerp(13, 3.5, clamp(s.faceLight * 1.3));
		const shine = clamp(s.faceLight * 1.2);

		for (const e of EYES) {
			const ox = clamp((s.gaze[0] - FACE.x) / 260, -1, 1) * (EYE_RX - pw - 4);
			const oy = clamp((s.gaze[1] - FACE.y) / 260, -1, 1) * (EYE_RY - 12);

			ctx.save();
			ctx.beginPath();
			ctx.ellipse(e.x, e.y, EYE_RX, EYE_RY, 0, 0, Math.PI * 2);
			ctx.clip();
			ctx.fillStyle = NEON.eye;
			ctx.fillRect(e.x - EYE_RX, e.y - EYE_RY, EYE_RX * 2, EYE_RY * 2);
			ctx.fillStyle = `rgb(${lerp(5, 120, shine) | 0},${lerp(10, 255, shine) | 0},${lerp(25, 150, shine) | 0})`;
			ctx.beginPath();
			ctx.ellipse(e.x + ox, e.y + oy, pw, 22, 0, 0, Math.PI * 2);
			ctx.fill();
			ctx.fillStyle = '#fff';
			ctx.beginPath();
			ctx.arc(e.x - 12 + ox * 0.3, e.y - 12, 6, 0, Math.PI * 2);
			ctx.fill();
			const yl = e.y - EYE_RY + 2 * EYE_RY * lid;
			ctx.fillStyle = '#000';
			ctx.fillRect(e.x - EYE_RX - 2, e.y - EYE_RY - 2, EYE_RX * 2 + 4, yl - (e.y - EYE_RY) + 2);
			ctx.restore();

			// Eyelid edge, or a closed-eye curve mid-blink.
			ctx.strokeStyle = NEON.cyan;
			ctx.beginPath();
			if (lid > 0.95) {
				ctx.lineWidth = 9;
				ctx.moveTo(e.x - EYE_RX, e.y);
				ctx.quadraticCurveTo(e.x, e.y + 16, e.x + EYE_RX, e.y);
			} else if (lid > 0.02) {
				const kk = clamp((yl - e.y) / EYE_RY, -0.98, 0.98);
				const hw = EYE_RX * Math.sqrt(1 - kk * kk);
				ctx.lineWidth = 6;
				ctx.moveTo(e.x - hw, yl);
				ctx.quadraticCurveTo(e.x, yl + 6, e.x + hw, yl);
			}
			ctx.stroke();
		}
	}

	/* -- shading: light each cell and pick its glyph ----------------------- */

	render() {
		this.drawScene();
		const { cols, rows, SW, W, cw, ch } = this;
		const s = this.state;
		const E = this.scene.ctx.getImageData(0, 0, SW, this.SH).data;
		const A = this.albedoData;
		const { tint, glow, cells, edgeIndex, rampIndex } = this;
		const lightTheme = this.light.theme === 1;
		// On a light page the neon would wash out: darken the ink instead.
		const ink = lightTheme ? 0.5 : 1;
		const glowGain = lightTheme ? 0 : 90;

		const lx = this.light.x;
		const ly = this.light.y;
		const R2 = this.lampRadius() ** 2;
		const Rw2 = (W * 0.5) ** 2;
		const TAU = Math.PI * 2;
		const ringAt = (s.t * 0.7) % TAU;
		const sub = [0, 0, 0, 0];
		const RL = RAMP.length - 1;

		for (let r = 0; r < rows; r++) {
			const y = (r + 0.5) * ch;
			for (let c = 0; c < cols; c++) {
				const i = r * cols + c;
				const x = (c + 0.5) * cw;
				const d2 = (x - lx) ** 2 + (y - ly) ** 2;
				const Lt = Math.exp(-d2 / R2);
				const Lw = Math.exp(-d2 / Rw2);

				let ring = 1;
				if (this.ringMask[i]) {
					let da = this.ringAngle[i] - ringAt + Math.PI;
					da = (((da % TAU) + TAU) % TAU) - Math.PI;
					ring = 1 + 1.4 * Math.exp(-(da * da) / 0.12);
				}
				const twinkle = 0.88 + 0.12 * Math.sin(s.t * 2.3 + this.phase[i]);
				const eK =
					((AMBIENT + LAMP_GAIN * Lt) * ring * twinkle * (0.8 + 0.2 * Lw) * Math.max(this.focus[i], Lt)) / 255;
				const lr = (LAMP[0] * 1.2 * Lt) / 255;
				const lg = (LAMP[1] * 1.2 * Lt) / 255;
				const lb = (LAMP[2] * 1.2 * Lt) / 255;

				let sr = 0;
				let sg = 0;
				let sb = 0;
				let mx = 0;
				let mn = 9;
				let sum = 0;
				for (let k = 0; k < 4; k++) {
					const p = ((r * SUB + (k >> 1)) * SW + c * SUB + (k & 1)) * 4;
					const or = E[p] * eK + A[p] * lr;
					const og = E[p + 1] * eK + A[p + 1] * lg;
					const ob = E[p + 2] * eK + A[p + 2] * lb;
					const l = Math.min(1, or > og ? (or > ob ? or : ob) : og > ob ? og : ob);
					sub[k] = l;
					sr += or;
					sg += og;
					sb += ob;
					sum += l;
					if (l > mx) mx = l;
					if (l < mn) mn = l;
				}
				const b = sum / 4;
				let glyph = 0;
				let level = b;
				if (mx > 0.12 && mx - mn > 0.2) {
					const mid = (mx + mn) / 2;
					glyph = edgeIndex[(sub[0] > mid ? 1 : 0) | (sub[1] > mid ? 2 : 0) | (sub[2] > mid ? 4 : 0) | (sub[3] > mid ? 8 : 0)];
					if (glyph) level = mx * 0.8;
				}
				if (!glyph && b > 0.04) glyph = rampIndex[Math.max(1, Math.round(Math.pow(Math.min(b, 1), 0.8) * RL))];
				cells[i] = glyph;

				const m = Math.max(sr, sg, sb, 1e-4);
				const q = i * 4;
				tint[q] = (sr / m) * 255 * ink;
				tint[q + 1] = (sg / m) * 255 * ink;
				tint[q + 2] = (sb / m) * 255 * ink;
				tint[q + 3] = Math.min(1, 0.22 + level * 1.15) * 255;
				// Bloom only from what is genuinely bright.
				const hot = (Math.max(0, b - 0.35) / Math.max(b, 1e-4)) * glowGain;
				glow[q] = Math.min(255, sr * hot);
				glow[q + 1] = Math.min(255, sg * hot);
				glow[q + 2] = Math.min(255, sb * hot);
				glow[q + 3] = 255;
			}
		}

		// Glitch bands shift the glyphs but not their colours.
		this.shown.set(cells);
		for (const gl of s.glitches) {
			for (let r = gl.r0; r < gl.r1 && r < rows; r++) {
				const row = r * cols;
				for (let c = 0; c < cols; c++) {
					const from = c - gl.off;
					this.shown[row + c] = from >= 0 && from < cols ? cells[row + from] : 0;
				}
			}
		}

		this.presenter.draw(this);
	}
}

if (!customElements.get('helvilette-ascii')) customElements.define('helvilette-ascii', HelviletteAscii);
