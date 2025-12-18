/// Canvases
// Default canvas
const canvas = document.querySelector('.canv');
canvas.width = window.innerWidth; canvas.height = window.innerHeight;
const ctx = canvas.getContext('2d');

// Charset virtual rendering canvas
const charcanvas = document.createElement('canvas');
const charctx = charcanvas.getContext('2d', { willReadFrequently: true});

// Image virtual rendering canvas
const imgcanvas = document.createElement('canvas');
const imgctx = imgcanvas.getContext('2d', { willReadFrequently: true});

// Create virtual canvas for transparency rendering
const vcanvas = document.createElement('canvas');
const vctx = vcanvas.getContext('2d');



/// Variables
// Character height, width, and font
let h, w;
let font;

// Charset
let charstr;
let chars;

// Image
let ih, iw;
let img;
let processed;
let subsampled;

// Rendering and display settings
let lod;
let sh, sw;
let cont_charset, cont_img;
let opacity_charset, opacity_img;
let switch_text_output, switch_processed_img;

// Result
let ch, cw;
let res;



/// Logic
// Clamp
const clamp = (val, min, max) => Math.min(Math.max(min,val),max);

// Update output size
function resizei() {
	// Set new absolute width and height
	ih = ch * h; iw = cw * w;

	// Reset canvas
	function canvreset(canv, canvctx, _w, _h) {
		canv.width = _w; canv.height = _h;
		canvctx.font = h + 'px ' + font;
		canvctx.textBaseline = 'top';
		canvctx.clearRect(0, 0, _w, _h);
	}
	
	// Reset all canvases
	canvreset(canvas, ctx, iw, ih);
	canvreset(charcanvas, charctx, w, h);
	canvreset(imgcanvas, imgctx, iw, ih);
	canvreset(vcanvas, vctx, iw, ih);
}

// Set font
function setFont(_font, _size, rebuild = true) {
	h = clamp(_size, 1, 32);
	font = _font;
	charctx.font = h + 'px ' + font;
	charctx.textBaseline = 'top';
	w = Math.ceil(charctx.measureText('.').width);
	resizei();
	if (rebuild) { preprocessCharset(); preprocessImage(); process(); }
}

// Setting up charset
function setCharset(_charset, rebuild = true) {
	charstr = [...new Set(_charset)].join('');
	if (_charset == '') { chars =  Array(95).fill().map((e, i) => ({c: String.fromCharCode(32 + i) })); }
	else { chars = charstr.split('').map(e => ({c: e})); }
	if (rebuild) { preprocessCharset(); preprocessImage(); process(); }
}

// Set result width and height
function setResultSizes(_ch, _cw, rebuild = true) {
	ch = clamp(_ch, 1, 1000); cw = clamp(_cw, 1, 1000);
	res = Array.from({length: ch}, () => Array.from({length: cw}, () => 0));
	resizei();
	if (rebuild) { preprocessImage(); process(); }
}

// Setting contrast
function setContCharset(_cont) { cont_charset = clamp(_cont, -10, 10); preprocessCharset(); process(); }
function setContImg(_cont) { cont_img = clamp(_cont, -10, 10); preprocessImage(); process(); }

// Update level of details
function setLoD(_lod, rebuild = true) {
	lod = clamp(_lod, 0, 1);
	if (lod === 0) { sh = 1; sw = 1; }
	//else if (lod === 1) { sh = h; sw = w; }
	else { sh = Math.ceil(h * lod); sw = Math.ceil(w * lod); }
	if (rebuild) { buildCharsetMap(); buildImageSubsamples(); process(); }
}


// Image subsampling
function subsample(pixels) {
	const scaley = h / sh, scalex = w / sw;
	const result = Array.from({length: sh}, () => Array.from({length: sw}, () => 0));
	if (lod === 0) { result[0][0] = pixels.flat().reduce((acc, e) => e + acc, 0) / (h * w); }
	else {
		for (let i = 0; i < sh; i ++) {
			// Vertical range in source pixels
			const ys = i * scaley;
			const ye = (i + 1) * scaley;

			for (let j = 0; j < sw; j ++) {
				// Horizontal range in source pixels
				const sx = j * scalex;
				const xe = (j + 1) * scalex;

				let sum = 0;

				// Loop over overlapping source pixels
				for (let y = Math.floor(ys); y < Math.ceil(ye); y ++) {
					for (let x = Math.floor(sx); x < Math.ceil(xe); x ++) {
						if (y < 0 || y >= h || x < 0 || x >= w) { continue; }

						// Vertical overlap fraction
						const y0 = Math.max(y, ys);
						const y1 = Math.min(y + 1, ye);
						const dy = y1 - y0;

						// Horizontal overlap fraction
						const x0 = Math.max(x, sx);
						const x1 = Math.min(x + 1, xe);
						const dx = x1 - x0;

						sum += pixels[y][x] * dx * dy;
					}
				}

				result[i][j] = sum / (scaley * scalex);
			}
		}
	}
	return result;
}


// Build charset maps
function buildCharsetMap () {
	for (let ci = 0; ci < chars.length; ci ++) {
		const c = chars[ci];
		c.map = subsample(
			Array.from({ length: h }, (_, y) =>
				Array.from({ length: w }, (_, x) => {
					return 255 - c.data.data[(y * w + x) * 4 + 3];
				})
			)
		);
	}
}


// Build the image subsamples
function buildImageSubsamples() {
	subsampled = Array.from({length: ch}, () => Array.from({length: cw}, () => null));
	for (let i = 0; i < ch; i ++) {
		for (let j = 0; j < cw; j ++) {
			subsampled[i][j] = subsample(
				Array.from({ length: h }, (_, bi) =>
					Array.from({ length: w }, (_, bj) => {
						return processed.data[((i * h + bi) * iw + (j * w + bj)) * 4];
					})
				)
			);
		}
	}
}


// Draw each character bitmap
function preprocessCharset() {
	// For each character in charset
	for (let ci = 0; ci < chars.length; ci ++) {
		const c = chars[ci];
		
		// Draw character
		charctx.fillText(c.c, 0, 0);
		c.data = charctx.getImageData(0, 0, w, h);
		charctx.clearRect(0, 0, w, h);
		
		// Process character
		for (let i = 0; i < h; i ++) {
			for (let j = 0; j < w; j ++) {
				const pxpos = (i*w + j) * 4;
				let intensity = c.data.data[pxpos + 3];
				intensity = cont_charset === 0 ? (intensity < 127.5 ? 0 : 255) : ((intensity - 127.5) / cont_charset + 127.5);
				intensity = parseInt(clamp(intensity, 0, 255));
				c.data.data[pxpos + 3] = intensity;
			}
		}
	}
	
	buildCharsetMap();
}


// Preprocess an image
function preprocessImage() {
	// Render the image with actual width and height on a virtual canvas
	imgctx.drawImage(img, 0, 0, iw, ih);
	processed = imgctx.getImageData(0, 0, iw, ih);
	imgctx.clearRect(0, 0, iw, ih);
	
	// Convert each (resized) image character to greyscale
	for (let i = 0; i < ih; i ++) {
		for (let j = 0; j < iw; j ++) {
			const pxpos = (i*iw + j)*4;
			let grey = processed.data[pxpos] * 0.2126 + processed.data[pxpos + 1] * 0.7152 + processed.data[pxpos + 2] * 0.0722;
			grey = cont_img === 0 ? (grey < 127.5 ? 0 : 255) : ((grey - 127.5) / cont_img + 127.5);
			grey = parseInt(clamp(grey, 0, 255));
			processed.data[pxpos] = processed.data[pxpos + 1] = processed.data[pxpos + 2] = grey;
		}
	}
	
	buildImageSubsamples();
}


// Process the image
function process() {
	for (let i = 0; i < ch; i ++) {
		for (let j = 0; j < cw; j ++) {
			const scores = chars.map(c => 0);
			
			// Compute differences for each subsample
			for (let bi = 0; bi < sh; bi ++) {
				for (let bj = 0; bj < sw; bj ++) {
					const sub = subsampled[i][j][bi][bj];
					chars.forEach((c, ci) => {
						scores[ci] += Math.abs(c.map[bi][bj] - sub);
					});
				}
			}
			
			// Find the closest match
			//res[i][j] = scores.indexOf(Math.max(...scores));
			res[i][j] = scores.indexOf(Math.min(...scores));
		}
	}
	
	// Draw the result
	draw();
}


// Draw the result
function draw() {
	ctx.clearRect(0, 0, iw, ih);
	
	// Draw image
	vctx.clearRect(0, 0, iw, ih);
	ctx.globalAlpha = opacity_img;
	if (switch_processed_img) {
		vctx.putImageData(processed, 0, 0);
		ctx.drawImage(vcanvas, 0, 0);
	}
	else { ctx.drawImage(img, 0, 0, iw, ih); }
	ctx.globalAlpha = 1;
	
	// Draw text
	vctx.clearRect(0, 0, iw, ih);
	for (let i = 0; i < ch; i ++) {
		for (let j = 0; j < cw; j ++) {
			if (switch_text_output) { vctx.fillText(chars[res[i][j]].c, j*w, i*h); }
			else { vctx.putImageData(chars[res[i][j]].data, j*w, i*h); }
		}
	}
	ctx.globalAlpha = opacity_charset;
	ctx.drawImage(vcanvas, 0, 0);
	ctx.globalAlpha = 1;
}



/// HTML binding
// Setup listeners once the page is loaded
document.addEventListener('DOMContentLoaded', () => {
	// Image loader
	document.getElementById('Load').addEventListener('change', (event) => {
		const file = event.target.files[0];
		const url = URL.createObjectURL(file);
		if (img && img.src.startsWith('blob:')) { URL.revokeObjectURL(img.src); }
		img = new Image();
		img.src = url;
		img.onload = () => { preprocessImage(); process(); };
	});

	// Font family
	document.getElementById('Font').addEventListener('input', (e) => { setFont(e.target.value, h); });

	// Font size
	document.getElementById('FontSize').addEventListener('input', (e) => { setFont(font || 'monospace', parseInt(e.target.value, 10)); });

	// Result sizes
	const resHeight = document.getElementById('ResultHeight');
	const resWidth = document.getElementById('ResultWidth');
	function updateResultSizes() {
		setResultSizes(parseInt(resHeight.value, 10), parseInt(resWidth.value, 10));
	}
	resHeight.addEventListener('input', updateResultSizes);
	resWidth.addEventListener('input', updateResultSizes);

	// Charset
	//document.getElementById('Charset').addEventListener('input', (e) => { setCharset(e.target.value); });
	const charsetOverlay = document.getElementById('CharsetOverlay');
	const charsetBox = document.getElementById('CharsetBox');
	document.getElementById('CharsetBtn').addEventListener('click', () => {
		charsetBox.value = charstr;
		charsetOverlay.style.display = 'block';
	});
	document.getElementById('CharsetSave').addEventListener('click', () => {
		setCharset(charsetBox.value);
		charsetOverlay.style.display = 'none';
	});
	document.getElementById('CharsetClose').addEventListener('click', () => {
		charsetOverlay.style.display = 'none';
	});
	
	// Sliders
	function bindSlider(sliderId, valId, update) {
		const slider = document.getElementById(sliderId);
		const valSpan = document.getElementById(valId);
		valSpan.textContent = slider.value;
		slider.addEventListener('input', (e) => {
			valSpan.textContent = slider.value;
			update(e.target.value);
		});
	}

	bindSlider('ContrastCharset', 'ContrastCharsetVal', setContCharset);
	bindSlider('ContrastImg', 'ContrastImgVal', setContImg);
	bindSlider('OpacityCharset', 'OpacityCharsetVal', (v) => { opacity_charset = clamp(parseFloat(v), 0, 1); draw(); });
	bindSlider('OpacityImg', 'OpacityImgVal', (v) => { opacity_img = clamp(parseFloat(v), 0, 1); draw(); });
	bindSlider('Lod', 'LodVal', setLoD);
	
	// Display Checkboxes
	document.getElementById('SwitchTextOutput').addEventListener('change', e => { switch_text_output = e.target.checked; draw(); });
	document.getElementById('SwitchProcessedImg').addEventListener('change', e => { switch_processed_img = e.target.checked; draw(); });

	// Copy result button
	document.getElementById('CopyResult').addEventListener('click', () => {
		let textOutput = '';
		for (let i = 0; i < ch; i ++) {
			for (let j = 0; j < cw; j ++) {
				textOutput += chars[res[i][j]].c;
			}
			textOutput += '\n';
		}
		navigator.clipboard.writeText(textOutput).then(() => {
			alert('Result copied to clipboard!');
		});
	});
});



/// Default config
// Default settings
setFont('monospace', 10, false);
setCharset('', false);
setResultSizes(40, 60, false);
setLoD(1, false);
cont_img = 1; cont_charset = 1;
opacity_img = 1; opacity_charset = 1;
switch_text_output = true; switch_processed_img = true;

// Default image
img = new Image();
img.crossOrigin = 'Anonymous';
img.src = 'https://i.imgur.com/g5FemBE.jpeg';
img.onload = () => { preprocessCharset(); preprocessImage(); process(); };