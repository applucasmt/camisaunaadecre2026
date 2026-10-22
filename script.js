import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const API_URL = 'https://script.google.com/macros/s/AKfycbxnUijRFoBQZqxjPNtcjercaHiO5oIxmMViYEC4tC_DLgxApjOjTw9WCU4Fb8NSJKf7/exec';

const state = {
  config: {},
  camisetas: [],
  heroViewer: null,
  productViewers: {},
  modalViewer: null
};

const $ = (s, r=document) => r.querySelector(s);
window.__state = state;
window.THREE = THREE;

// (Mantenha as funções toast, apiGet, apiPost, createProceduralTexture iguais...)
function toast(msg, isError=false) {
  let el = $('#toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; el.className = 'toast'; document.body.appendChild(el); }
  el.textContent = msg; el.classList.toggle('error', isError); el.classList.add('show');
  clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('show'), 3000);
}
async function apiGet(action='getAll') {
  try { const r = await fetch(`${API_URL}?action=${action}`); return await r.json(); } catch (e) { return { ok: false }; }
}
async function apiPost(payload) {
  try { const r = await fetch(API_URL, { method:'POST', headers:{ 'Content-Type':'text/plain;charset=utf-8' }, body: JSON.stringify(payload) }); return await r.json(); } catch (e) { return { ok: false }; }
}
window.__apiPost = apiPost;

async function loadTexture(url, fallbackColor) {
  if (!url) {
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 512;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = fallbackColor || '#333'; ctx.fillRect(0,0,512,512);
    const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace; return tex;
  }
  return new Promise(resolve => {
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin('anonymous');
    loader.load(url, t => { t.anisotropy = 8; t.colorSpace = THREE.SRGBColorSpace; t.flipY = false; resolve(t); }, undefined, () => resolve(loadTexture(null, fallbackColor)));
  });
}
window.__loadTexture = loadTexture;

let gltfCache = null;
async function loadAvatarModel() {
  if (gltfCache) return gltfCache;
  const loader = new GLTFLoader();
  return new Promise((resolve, reject) => {
    loader.load('./camisa.glb', (gltf) => { gltfCache = gltf.scene; resolve(gltfCache); }, undefined, reject);
  });
}

// ============ APLICAR TEXTURA FRENTE E COSTAS ============
function applyTshirtTexture(root, frontTex, backTex, scale = 1.0, offsetX = 0, offsetY = 0) {
  root.traverse((child) => {
    if (child.isMesh) {
      const nome = child.name.toLowerCase();
      const isFront = nome.includes('body_front') || nome.includes('sleeves') || nome.includes('ribbing');
      const isBack = nome.includes('body_back');
      
      if (isFront || isBack) {
        child.material = child.material.clone();
        child.material.color.setHex(0xffffff);
        child.material.metalness = 0.0;
        child.material.roughness = 0.8;

        const tex = isBack && backTex ? backTex : frontTex;
        
        // Ajustes de textura (Tamanho e Posição)
        if (tex) {
          tex.center.set(0.5, 0.5);
          tex.repeat.set(scale, scale);
          tex.offset.set(offsetX, offsetY);
          child.material.map = tex;
        }
        child.material.needsUpdate = true;
      }
    }
  });
}

// ============ CRIAR VIEWER ============
async function createViewer(el, cam, options = {}) {
  const w = el.clientWidth || 400;
  const h = el.clientHeight || 400;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, w/h, 0.1, 1000);
  camera.position.set(0, 1.0, 3);

  const renderer = new THREE.WebGLRenderer({ antialias:true, alpha:true });
  renderer.setSize(w, h);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  el.appendChild(renderer.domElement);

  scene.add(new THREE.AmbientLight(0xffffff, 1.5));
  const key = new THREE.DirectionalLight(0xffffff, 2.0); key.position.set(2, 5, 4); scene.add(key);
  const fill = new THREE.DirectionalLight(0xffffff, 1.0); fill.position.set(-4, 3, 2); scene.add(fill);
  const rim = new THREE.DirectionalLight(0xd4af37, 1.5); rim.position.set(0, 2, -5); scene.add(rim);

  try {
    const originalModel = await loadAvatarModel();
    const model = originalModel.clone(true);
    
    // TRUQUE DE MESTRE: Força a matriz do modelo a resetar do zero
    model.matrixAutoUpdate = false;
    model.matrix.identity();
    model.position.set(0, 0, 0);
    model.scale.set(1, 1, 1);
    model.rotation.set(0, 0, 0);

    // Cria uma caixa em volta do modelo
    const box = new THREE.Box3().setFromObject(model);
    
    // Se o modelo for gigante (como costuma vir do FBX), nós forçamos ele a ter 2 metros de altura
    const sizeY = box.max.y - box.min.y;
    const targetHeight = 2.0;
    const scaleFactor = targetHeight / sizeY;
    
    // Aplica a escala matemática exata
    const wrapper = new THREE.Group();
    wrapper.add(model);
    wrapper.scale.setScalar(scaleFactor);
    
    // Posiciona os pés no chão (Y=0) e centraliza
    wrapper.position.y = -(box.min.y * scaleFactor);
    wrapper.position.x = -(box.getCenter(new THREE.Vector3()).x * scaleFactor);
    wrapper.position.z = -(box.getCenter(new THREE.Vector3()).z * scaleFactor);

    const frontTex = await loadTexture(cam.textura_principal, cam.cor_base);
    const backTex = await loadTexture(cam.textura_costas, cam.cor_base);
    applyTshirtTexture(model, frontTex, backTex, cam.textura_escala || 1, cam.textura_offset_x || 0, cam.textura_offset_y || 0);

    scene.add(wrapper);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.target.set(0, 1.0, 0);
    
    // ZOOM SEM LIMITES
    controls.minDistance = 0.1;
    controls.maxDistance = Infinity; 
    controls.enablePan = false;
    
    controls.autoRotate = options.autoRotate !== false;
    controls.autoRotateSpeed = 1.5;

    let pauseUntil = 0;
    const onInteract = () => { pauseUntil = performance.now() + 2500; };
    renderer.domElement.addEventListener('pointerdown', onInteract);

    let animId;
    function animate() {
      animId = requestAnimationFrame(animate);
      controls.autoRotate = (performance.now() > pauseUntil) && (options.autoRotate !== false);
      controls.update();
      renderer.render(scene, camera);
    }
    animate();

    const ro = new ResizeObserver(() => {
      const w2 = el.clientWidth, h2 = el.clientHeight;
      if (!w2 || !h2) return;
      camera.aspect = w2/h2; camera.updateProjectionMatrix(); renderer.setSize(w2, h2);
    });
    ro.observe(el);

    return {
      scene, camera, renderer, wrapper, controls, model,
      setTextures(front, back, scale, offX, offY) { applyTshirtTexture(model, front, back, scale, offX, offY); },
      setAutoRotate(v) { controls.autoRotate = v; if (!v) pauseUntil = Infinity; else pauseUntil = 0; },
      zoomIn() { controls.dollyIn(1.2); controls.update(); },
      zoomOut() { controls.dollyOut(1.2); controls.update(); },
      resetCamera() {
        camera.position.set(0, 1.0, 3);
        controls.target.set(0, 1.0, 0);
        controls.update();
      },
      destroy() { cancelAnimationFrame(animId); ro.disconnect(); renderer.dispose(); el.innerHTML = ''; }
    };

  } catch (error) {
    el.innerHTML = '<p style="padding:20px;color:#ff4d4d;text-align:center;">⚠️ Erro ao carregar modelo.</p>';
    return null;
  }
}
window.__createViewer = createViewer;

// (Restante do código: loadSite, renderProducts, initUI, ... igual ao anterior)
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
  if (state.camisetas.length > 0) {
    const el = document.getElementById('heroViewer');
    if (el) state.heroViewer = await createViewer(el, state.camisetas[0], { autoRotate: true });
  }
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
      const modal = document.getElementById('viewerModal');
      document.getElementById('viewerTitle').textContent = cam.nome;
      document.getElementById('viewerDesc').textContent = cam.descricao || '';
      modal.classList.add('active');
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
