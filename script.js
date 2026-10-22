import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

const API_URL = 'https://script.google.com/macros/s/AKfycbyMiP-nbR9_UYZGCA7dtAWIm4HIl2Vg4UeatogPC9f7ORdEZMSEJwU6LggDenh0eqDVug/exec';

const state = { config: {}, camisetas: [], productViewers: {} };
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
  
  // Enquadramento focado na camisa
  camera.position.set(0, 1.8, 2.8);

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
    
    controls.target.set(0, 1.6, 0); 
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
      resetCamera() { camera.position.set(0, 1.8, 2.8); controls.target.set(0, 1.6, 0); controls.update(); },
      destroy() { cancelAnimationFrame(animId); ro.disconnect(); controls.dispose(); renderer.dispose(); el.innerHTML = ''; }
    };

  } catch (error) {
    console.error(error);
    el.innerHTML = '<p style="padding:20px;color:#ff4d4d;text-align:center;">⚠️ Erro ao carregar modelo.</p>';
    return null;
  }
}
window.__createViewer = createViewer;

// ============ SISTEMA DE CARDS LADO A LADO ============
async function loadSite() {
  try {
    const data = await apiGet('getAll');
    if (!data.ok) throw new Error(data.error);
    state.config = Object.fromEntries(data.config.map(c => [c.CHAVE, c.VALOR]));
    state.camisetas = data.camisetas;
    
    // Atualiza textos da página
    if (state.config.titulo_site) $('#heroTitle').textContent = state.config.titulo_site;
    if (state.config.subtitulo_site) $('#heroSub').textContent = state.config.subtitulo_site;
    if (state.config.cta_texto) $('#heroCta').textContent = state.config.cta_texto;
    
    renderProducts();
  } catch (e) {
    // Fallback para caso a API falhe
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
  
  // Configura o CSS do container para permitir a animação de slider
  grid.style.display = 'flex';
  grid.style.justifyContent = 'center';
  grid.style.alignItems = 'center';
  grid.style.height = '500px'; // Altura do palco
  grid.style.gap = '0px'; // Removemos o gap, faremos o posicionamento absoluto via JS
  grid.style.position = 'relative';
  grid.style.overflow = 'hidden';

  const cardsData = [];
  const totalModels = Math.min(3, state.camisetas.length);

  for (let i = 0; i < totalModels; i++) {
    const cam = state.camisetas[i];
    const card = document.createElement('div');
    card.className = 'product-card';
    
    // Estilos base do card para o layout de Slider
    card.style.position = 'absolute';
    card.style.width = '320px';
    card.style.height = '420px';
    card.style.transition = 'all 0.8s cubic-bezier(0.25, 1, 0.5, 1)';
    card.style.boxShadow = '0 10px 30px rgba(0,0,0,0.5)';
    card.style.borderRadius = '16px';
    card.style.overflow = 'hidden';
    card.style.display = 'flex';
    card.style.flexDirection = 'column';
    card.style.background = '#1a1a1a';
    card.style.border = '1px solid #333';
    
    card.innerHTML = `
      <div class="product-viewer" id="viewer-${cam.id}" style="flex: 1; position: relative;"></div>
      <div class="product-info" style="padding: 20px; text-align: center; background: rgba(0,0,0,0.8); position: relative; z-index: 2;">
        ${cam.destaque ? `<span class="product-tag" style="color:var(--secondary); font-size:0.8rem; text-transform:uppercase; letter-spacing:1px;">${cam.destaque}</span>` : ''}
        <h3 style="margin: 5px 0; color: white;">${cam.nome}</h3>
        <button class="btn-primary" data-explore="${cam.id}" style="margin-top: 10px; padding: 10px 20px; font-size: 0.9rem;">Explorar em 3D</button>
      </div>
    `;
    grid.appendChild(card);
    cardsData.push({ el: card, id: cam.id });

    // Inicializa o Three.js DENTRO do card
    setTimeout(async () => {
      const viewerEl = document.getElementById(`viewer-${cam.id}`);
      if (viewerEl) { state.productViewers[cam.id] = await createViewer(viewerEl, cam, { autoRotate: true }); }
    }, 200 * i);

    // Ação do Botão
    card.querySelector('[data-explore]').onclick = async () => {
      const viewerModal = document.getElementById('viewerModal');
      document.getElementById('viewerTitle').textContent = cam.nome;
      document.getElementById('viewerDesc').textContent = cam.descricao || '';
      viewerModal.classList.add('active');
      
      const modalContainer = document.getElementById('fullViewer');
      if (state.modalViewer) { state.modalViewer.destroy(); state.modalViewer = null; }
      await new Promise(r => setTimeout(r, 60));
      state.modalViewer = await createViewer(modalContainer, cam, { autoRotate: true });
    };
  }

  // Lógica de posicionamento do Slider
  let activeIndex = 0; // O card do centro

  function updatePositions() {
    cardsData.forEach((item, index) => {
      // Calcula a posição relativa ao card ativo central
      let offset = index - activeIndex;
      
      // Ajuste para o slider circular (se passar de 1, vai para a esquerda)
      if (offset === 2) offset = -1;
      if (offset === -2) offset = 1;

      const el = item.el;

      if (offset === 0) {
        // CARD CENTRAL (Foco)
        el.style.transform = 'translateX(0) scale(1.1)';
        el.style.zIndex = '10';
        el.style.opacity = '1';
        el.style.filter = 'brightness(1)';
      } else if (offset === 1) {
        // CARD DA DIREITA (Fundo)
        el.style.transform = 'translateX(280px) scale(0.85)';
        el.style.zIndex = '5';
        el.style.opacity = '0.6';
        el.style.filter = 'brightness(0.4)';
      } else if (offset === -1) {
        // CARD DA ESQUERDA (Fundo)
        el.style.transform = 'translateX(-280px) scale(0.85)';
        el.style.zIndex = '5';
        el.style.opacity = '0.6';
        el.style.filter = 'brightness(0.4)';
      }
    });
  }

  // Inicia as posições
  updatePositions();

  // Roda o carrossel a cada 5 segundos
  setInterval(() => {
    activeIndex = (activeIndex + 1) % totalModels;
    updatePositions();
  }, 5000);
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
