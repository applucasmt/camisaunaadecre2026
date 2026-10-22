import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

const API_URL = 'https://script.google.com/macros/s/AKfycbyMiP-nbR9_UYZGCA7dtAWIm4HIl2Vg4UeatogPC9f7ORdEZMSEJwU6LggDenh0eqDVug/exec';

const state = { config: {}, camisetas: [], heroViewer: null, productViewers: {}, modalViewer: null };
const $ = (s, r = document) => r.querySelector(s);
window.__state = state;
window.THREE = THREE;

function toast(msg, isError = false) {
  let el = $('#toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; el.className = 'toast'; document.body.appendChild(el); }
  el.textContent = msg; 
  el.classList.toggle('error', isError); 
  el.classList.add('show');
  clearTimeout(el._t); 
  el._t = setTimeout(() => el.classList.remove('show'), 3000);
}
window.__toast = toast;

async function apiGet(action = 'getAll') {
  try { const r = await fetch(`${API_URL}?action=${action}`); return await r.json(); } catch (e) { return { ok: false }; }
}
async function apiPost(payload) {
  try {
    const r = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload) });
    return await r.json();
  } catch (e) { return { ok: false }; }
}
window.__apiPost = apiPost;

function fixDriveUrl(url) {
  if (!url) return url;
  if (url.includes('drive.google.com')) {
    const match = url.match(/id=([a-zA-Z0-9_-]+)/) || url.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (match && match[1]) return `https://lh3.googleusercontent.com/d/${match[1]}`;
  }
  return url;
}

async function loadTexture(url, fallbackColor) {
  const finalUrl = fixDriveUrl(url);
  if (!finalUrl) {
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 512;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = fallbackColor || '#333'; ctx.fillRect(0, 0, 512, 512);
    const t = new THREE.CanvasTexture(canvas); t.colorSpace = THREE.SRGBColorSpace; t.flipY = false; return t;
  }
  return new Promise(resolve => {
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin('anonymous');
    loader.load(finalUrl, t => { t.anisotropy = 8; t.colorSpace = THREE.SRGBColorSpace; t.flipY = false; resolve(t); }, undefined, () => resolve(loadTexture(null, fallbackColor)));
  });
}
window.__loadTexture = loadTexture;

const WHITE_PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

let gltfPromise = null;
function loadAvatarModel() {
  if (gltfPromise) return gltfPromise;
  const manager = new THREE.LoadingManager();
  manager.setURLModifier(url => (/\.(png|jpe?g)$/i.test(url.split('?')[0]) && !url.startsWith('data:') && !url.startsWith('blob:')) ? WHITE_PIXEL : url);
  const loader = new GLTFLoader(manager);
  gltfPromise = new Promise((resolve, reject) => {
    loader.load('./camisa.glb', gltf => resolve(gltf.scene), undefined, reject);
  });
  return gltfPromise;
}

function applyTshirtTexture(root, textures, configs) {
  root.traverse(child => {
    if (!child.isMesh) return;
    const nome = child.name.toLowerCase();
    
    let tex = null, cfg = null;
    let baseSize = 1.0;

    if (nome.includes('body_front')) { tex = textures.frente; cfg = configs.frente; baseSize = 0.6; }
    else if (nome.includes('body_back')) { tex = textures.costas; cfg = configs.costas; baseSize = 0.6; }
    else if (nome.includes('sleeves')) { tex = textures.manga; cfg = configs.manga; baseSize = 0.2; }
    else if (nome.includes('ribbing')) { tex = textures.gola; cfg = configs.gola; baseSize = 0.15; }
    else { return; }

    const mats = Array.isArray(child.material) ? child.material : [child.material];
    mats.forEach(mat => {
      mat.metalness = 0.0; mat.roughness = 0.8; mat.side = THREE.DoubleSide;
      if (tex) {
        tex.center.set(0.5, 0.5); 
        tex.repeat.set(baseSize * (cfg.scale || 1), baseSize * (cfg.scale || 1));
        tex.offset.set(cfg.x || 0, cfg.y || 0);
        tex.flipY = false; 
        mat.map = tex; mat.color.setHex(0xffffff);
      } else {
        mat.map = null; mat.color.set(0xffffff);
      }
      mat.needsUpdate = true;
    });
  });
}

function applyMannequinColors(root, colors) {
  root.traverse(child => {
    if (!child.isMesh) return;
    const nome = child.name.toLowerCase();
    const isShirt = nome.includes('body_front') || nome.includes('body_back') || nome.includes('sleeves') || nome.includes('ribbing');
    if (isShirt) return;

    let colorHex = null;
    if (nome.includes('hair') || nome.includes('cabelo')) colorHex = colors.cabelo;
    else if (nome.includes('jeans') || nome.includes('pants') || nome.includes('calca') || nome.includes('leg') || nome.includes('shoe')) colorHex = colors.calca;
    else colorHex = colors.corpo;

    if (colorHex) {
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      mats.forEach(mat => {
        if (mat.color) mat.color.set(colorHex).convertSRGBToLinear(); 
        mat.needsUpdate = true;
      });
    }
  });
}

async function buildMannequin(cam) {
  const originalModel = await loadAvatarModel();
  const model = cloneSkinned(originalModel);

  model.traverse(child => {
    if (!child.isMesh) return;
    child.frustumCulled = false;
    child.material = Array.isArray(child.material) ? child.material.map(m => m.clone()) : child.material.clone();
  });
  model.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const targetHeight = 2.0;
  const scaleFactor = size.y > 0.0001 ? targetHeight / size.y : 1;

  const wrapper = new THREE.Group();
  wrapper.add(model);
  wrapper.scale.setScalar(scaleFactor);
  wrapper.position.set(-center.x * scaleFactor, -box.min.y * scaleFactor, -center.z * scaleFactor);

  const textures = {
    frente: await loadTexture(cam.textura_principal, cam.cor_base),
    costas: await loadTexture(cam.textura_costas, cam.cor_base),
    manga: await loadTexture(cam.textura_manga, cam.cor_base),
    gola: await loadTexture(cam.textura_gola, cam.cor_base)
  };
  
  const configs = {
    frente: { scale: parseFloat(cam.scale_frente)||1, x: parseFloat(cam.x_frente)||0, y: parseFloat(cam.y_frente)||0 },
    costas: { scale: parseFloat(cam.scale_costas)||1, x: parseFloat(cam.x_costas)||0, y: parseFloat(cam.y_costas)||0 },
    manga: { scale: parseFloat(cam.scale_manga)||1, x: parseFloat(cam.x_manga)||0, y: parseFloat(cam.y_manga)||0 },
    gola: { scale: parseFloat(cam.scale_gola)||1, x: 0, y: 0 }
  };

  const mannequinColors = {
    corpo: cam.cor_corpo || '#e0e0e0',
    cabelo: cam.cor_cabelo || '#333333',
    calca: cam.cor_calca || '#ffffff'
  };

  applyTshirtTexture(model, textures, configs);
  applyMannequinColors(model, mannequinColors);
  
  return { wrapper, model, textures, configs, mannequinColors };
}

async function createViewer(el, cam, options = {}) {
  const w = el.clientWidth || 400;
  const h = el.clientHeight || 400;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 1000);
  
  camera.position.set(0, 1.65, 2.5);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(w, h);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  el.appendChild(renderer.domElement);

  scene.add(new THREE.AmbientLight(0xffffff, 1.5));
  const key = new THREE.DirectionalLight(0xffffff, 2.0); key.position.set(2, 5, 4); scene.add(key);
  const fill = new THREE.DirectionalLight(0xffffff, 1.0); fill.position.set(-4, 3, 2); scene.add(fill);
  const rim = new THREE.DirectionalLight(0xd4af37, 1.5); rim.position.set(0, 2, -5); scene.add(rim);

  try {
    const { wrapper, model, textures, configs, mannequinColors } = await buildMannequin(cam);
    scene.add(wrapper);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    
    controls.target.set(0, 1.55, 0); 
    controls.minDistance = 0.1;
    controls.maxDistance = Infinity;
    controls.enablePan = false;
    controls.autoRotate = options.autoRotate !== false;
    controls.autoRotateSpeed = 1.5;

    let isEditing = false;
    let currentPart = null;
    let currentTexConfig = null;
    let isDragging = false;
    let prevX = 0, prevY = 0;

    renderer.domElement.addEventListener('pointerdown', (e) => {
      if (isEditing && e.button === 0) {
        isDragging = true; prevX = e.clientX; prevY = e.clientY;
        controls.enabled = false;
      }
    });

    window.addEventListener('pointermove', (e) => {
      if (isDragging && isEditing) {
        const dx = (e.clientX - prevX) * 0.005;
        const dy = (e.clientY - prevY) * 0.005;
        prevX = e.clientX; prevY = e.clientY;
        currentTexConfig.x -= dx; currentTexConfig.y += dy;
        applyTshirtTexture(model, textures, configs);
      }
    });

    window.addEventListener('pointerup', () => {
      isDragging = false; controls.enabled = true;
    });

    renderer.domElement.addEventListener('wheel', (e) => {
      if (isEditing) {
        e.preventDefault(); e.stopPropagation();
        const factor = e.deltaY > 0 ? -0.05 : 0.05;
        currentTexConfig.scale += factor;
        currentTexConfig.scale = Math.max(0.1, Math.min(5, currentTexConfig.scale));
        applyTshirtTexture(model, textures, configs);
      }
    }, { passive: false, capture: true });

    let animId;
    function animate() {
      animId = requestAnimationFrame(animate);
      if (!isEditing) controls.autoRotate = (performance.now() > pauseUntil) && (options.autoRotate !== false);
      else controls.autoRotate = false;
      controls.update();
      renderer.render(scene, camera);
    }
    
    let pauseUntil = 0;
    const onInteract = () => { pauseUntil = performance.now() + 2500; };
    renderer.domElement.addEventListener('pointerdown', onInteract);
    animate();

    const ro = new ResizeObserver(() => {
      const w2 = el.clientWidth, h2 = el.clientHeight;
      if (!w2 || !h2) return;
      camera.aspect = w2 / h2; camera.updateProjectionMatrix(); renderer.setSize(w2, h2);
    });
    ro.observe(el);

    return {
      scene, camera, renderer, wrapper, controls, model, textures, configs, mannequinColors,
      setTextures(f, c, m, g, cfgs) {
        textures.frente = f || textures.frente;
        textures.costas = c || textures.costas;
        textures.manga = m || textures.manga;
        textures.gola = g || textures.gola;
        Object.assign(configs, cfgs);
        applyTshirtTexture(model, textures, configs);
      },
      setMannequinColors(colors) {
        Object.assign(mannequinColors, colors);
        applyMannequinColors(model, mannequinColors);
      },
      setEditingMode(part) {
        isEditing = !!part; currentPart = part;
        currentTexConfig = part ? configs[part] : null;
        controls.enabled = !isEditing; 
        if (isEditing) controls.autoRotate = false;
      },
      setAutoRotate(v) { controls.autoRotate = v; if (!v) pauseUntil = Infinity; else pauseUntil = 0; },
      zoomIn() { controls.dollyIn(1.2); controls.update(); },
      zoomOut() { controls.dollyOut(1.2); controls.update(); },
      resetCamera() { camera.position.set(0, 1.65, 2.5); controls.target.set(0, 1.55, 0); controls.update(); },
      destroy() { cancelAnimationFrame(animId); ro.disconnect(); controls.dispose(); renderer.dispose(); el.innerHTML = ''; }
    };

  } catch (error) {
    console.error(error);
    el.innerHTML = '<p style="padding:20px;color:#ff4d4d;text-align:center;">⚠️ Erro ao carregar modelo.</p>';
    return null;
  }
}
window.__createViewer = createViewer;

// ============ HERO VIEWER (SLIDER LATERAL COM ZOOM MÁXIMO) ============
async function initHeroViewer() {
  const el = document.getElementById('heroViewer');
  if (!el || state.camisetas.length === 0) return;
  
  const w = el.clientWidth || 800;
  const h = el.clientHeight || 600;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, w / h, 0.1, 1000);
  
  // ZOOM AUMENTADO 2X: Câmera super próxima (Z = 1.2) e focada no peito (Y = 1.6)
  camera.position.set(0, 1.6, 1.2); 

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(w, h);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.domElement.style.pointerEvents = 'none'; 
  
  el.appendChild(renderer.domElement);

  scene.add(new THREE.AmbientLight(0xffffff, 1.5));
  const key = new THREE.DirectionalLight(0xffffff, 2.0); key.position.set(2, 5, 4); scene.add(key);
  const fill = new THREE.DirectionalLight(0xffffff, 1.0); fill.position.set(-4, 3, 2); scene.add(fill);
  const rim = new THREE.DirectionalLight(0xd4af37, 1.5); rim.position.set(0, 2, -5); scene.add(rim);

  const wrappers = [];
  const totalModels = Math.min(3, state.camisetas.length);
  // Aumentando o espaçamento para eles não se sobreporem com o zoom alto
  const spacing = 2.8; 

  for (let i = 0; i < totalModels; i++) {
    const { wrapper } = await buildMannequin(state.camisetas[i]);
    wrapper.position.x = (i - 1) * spacing; 
    wrapper.position.y = -0.3; 
    scene.add(wrapper);
    wrappers.push(wrapper);
  }

  let currentIndex = 0;
  let statePhase = 'turning_back'; 
  let phaseTimer = 0;
  
  let currentCameraX = 0;
  let targetCameraX = 0;
  let extraSpinAngle = 0; 

  const clock = new THREE.Clock();

  function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();
    phaseTimer += delta;

    if (statePhase === 'turning_back') {
      extraSpinAngle = Math.min(Math.PI, extraSpinAngle + delta * 2.5); 
      if (extraSpinAngle >= Math.PI) { statePhase = 'pausing_back'; phaseTimer = 0; }
    } 
    else if (statePhase === 'pausing_back') {
      if (phaseTimer > 2.0) { statePhase = 'turning_front'; }
    }
    else if (statePhase === 'turning_front') {
      extraSpinAngle = Math.max(0, extraSpinAngle - delta * 2.5);
      if (extraSpinAngle <= 0) { statePhase = 'pausing_front'; phaseTimer = 0; }
    }
    else if (statePhase === 'pausing_front') {
      if (phaseTimer > 1.0) { 
        statePhase = 'sliding';
        const nextIndex = (currentIndex + 1) % totalModels;
        if (nextIndex === 0) {
           wrappers.forEach((w, i) => { w.position.x = (i - 1) * spacing; });
           currentCameraX = (totalModels - 1) * spacing;
           targetCameraX = 0;
        } else {
           targetCameraX = (nextIndex - 1) * spacing;
        }
      }
    }
    else if (statePhase === 'sliding') {
      const smoothFactor = 1 - Math.exp(-3.0 * delta); 
      currentCameraX += (targetCameraX - currentCameraX) * smoothFactor;
      
      if (Math.abs(targetCameraX - currentCameraX) < 0.01) {
        currentCameraX = targetCameraX;
        currentIndex = (currentIndex + 1) % totalModels;
        statePhase = 'turning_back';
        phaseTimer = 0;
        extraSpinAngle = 0;
      }
    }

    camera.position.x = currentCameraX;
    camera.position.y = 1.6; // Foco na altura do peito
    camera.lookAt(currentCameraX, 1.4, 0); 
    
    wrappers.forEach((w, i) => {
      if (i === currentIndex) {
        w.rotation.y = extraSpinAngle;
      } else {
        w.rotation.y = 0;
      }
    });

    renderer.render(scene, camera);
  }
  animate();

  const ro = new ResizeObserver(() => {
    const w2 = el.clientWidth, h2 = el.clientHeight;
    if (!w2 || !h2) return;
    camera.aspect = w2 / h2; camera.updateProjectionMatrix(); renderer.setSize(w2, h2);
  });
  ro.observe(el);
}

async function loadSite() {
  try {
    const data = await apiGet('getAll');
    if (!data.ok) throw new Error(data.error);
    state.config = Object.fromEntries(data.config.map(c => [c.CHAVE, c.VALOR]));
    state.camisetas = data.camisetas;
    if (state.config.titulo_site) $('#heroTitle').textContent = state.config.titulo_site;
    if (state.config.subtitulo_site) $('#heroSub').textContent = state.config.subtitulo_site;
    if (state.config.cta_texto) $('#heroCta').textContent = state.config.cta_texto;
    renderProducts();
  } catch (e) {
    state.camisetas = [
      { id: 1, nome: 'Classic Black', descricao: 'Algodão premium', cor_base: '#111111', destaque: 'Silhueta atemporal' },
      { id: 2, nome: 'Urban White', descricao: 'Modelagem oversized', cor_base: '#f5f5f5', destaque: 'Minimalismo urbano' },
      { id: 3, nome: 'Gold Edition', descricao: 'Edição limitada', cor_base: '#d4af37', destaque: 'Edição limitada' }
    ];
    renderProducts();
  }
}

async function renderProducts() {
  const grid = $('#productsGrid');
  grid.innerHTML = '';
  
  await initHeroViewer();

  state.camisetas.forEach((cam, idx) => {
    const card = document.createElement('div');
    card.className = 'product-card';
    card.innerHTML = `
      <div class="product-viewer" id="viewer-${cam.id}"><div class="product-viewer-hint">Arraste · Zoom · Gire</div></div>
      <div class="product-info">
        ${cam.destaque ? `<span class="product-tag">${cam.destaque}</span>` : ''}
        <h3>${cam.nome}</h3><p>${cam.descricao || ''}</p>
        <button class="btn-primary" data-explore="${cam.id}">Explorar em 3D</button>
      </div>`;
    grid.appendChild(card);
    setTimeout(async () => {
      const viewerEl = document.getElementById(`viewer-${cam.id}`);
      if (viewerEl) { state.productViewers[cam.id] = await createViewer(viewerEl, cam, { autoRotate: true }); }
    }, 200 * idx);
    card.querySelector('[data-explore]').onclick = async () => {
      const viewerModal = document.getElementById('viewerModal');
      document.getElementById('viewerTitle').textContent = cam.nome;
      document.getElementById('viewerDesc').textContent = cam.descricao || '';
      viewerModal.classList.add('active');
      if (state.modalViewer) { state.modalViewer.destroy(); state.modalViewer = null; }
      const el = document.getElementById('fullViewer');
      await new Promise(r => setTimeout(r, 60));
      state.modalViewer = await createViewer(el, cam, { autoRotate: true });
    };
  });
}

function initUI() {
  $('#menuToggle')?.addEventListener('click', () => $('#mainNav').classList.toggle('open'));
  document.getElementById('closeViewer').onclick = () => {
    document.getElementById('viewerModal').classList.remove('active');
    if (state.modalViewer) { state.modalViewer.destroy(); state.modalViewer = null; }
  };
  document.getElementById('resetView').onclick = () => state.modalViewer?.resetCamera();
  document.getElementById('toggleAuto').onclick = (e) => {
    if (!state.modalViewer) return;
    const paused = e.target.dataset.paused === '1';
    state.modalViewer.setAutoRotate(paused);
    e.target.dataset.paused = paused ? '0' : '1';
    e.target.textContent = paused ? 'Pausar rotação' : 'Retomar rotação';
  };
  document.getElementById('zoomIn')?.addEventListener('click', () => state.modalViewer?.zoomIn());
  document.getElementById('zoomOut')?.addEventListener('click', () => state.modalViewer?.zoomOut());
}

initUI();
loadSite();
