import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// ⚠️ COLE AQUI A URL DO SEU WEB APP DO GOOGLE APPS SCRIPT
const API_URL = 'https://script.google.com/macros/s/AKfycbxnUijRFoBQZqxjPNtcjercaHiO5oIxmMViYEC4tC_DLgxApjOjTw9WCU4Fb8NSJKf7/exec';

const state = {
  config: {},
  camisetas: [],
  heroViewer: null,
  productViewers: {},
  modalViewer: null
};

const $ = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => [...r.querySelectorAll(s)];

window.__state = state;
window.__API_URL = API_URL;
window.THREE = THREE;

function toast(msg, isError=false) {
  let el = $('#toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; el.className = 'toast'; document.body.appendChild(el); }
  el.textContent = msg;
  el.classList.toggle('error', isError);
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 3000);
}

async function apiGet(action='getAll') {
  try {
    const r = await fetch(`${API_URL}?action=${action}`);
    return await r.json();
  } catch (e) {
    return { ok: false, error: 'Falha na rede' };
  }
}

async function apiPost(payload) {
  try {
    const r = await fetch(API_URL, {
      method:'POST',
      headers:{ 'Content-Type':'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    });
    return await r.json();
  } catch (e) {
    return { ok: false, error: 'Falha na rede' };
  }
}
window.__apiPost = apiPost;

// ============ TEXTURA ============
function createProceduralTexture(color) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024; canvas.height = 1024;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = color || '#333333';
  ctx.fillRect(0, 0, 1024, 1024);
  for (let i = 0; i < 3000; i++) {
    ctx.fillStyle = `rgba(255,255,255,${Math.random()*0.03})`;
    ctx.fillRect(Math.random()*1024, Math.random()*1024, 1, 1);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

async function loadTexture(url, fallbackColor) {
  if (!url) return createProceduralTexture(fallbackColor);
  return new Promise(resolve => {
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin('anonymous');
    loader.load(url,
      t => { t.anisotropy = 8; t.colorSpace = THREE.SRGBColorSpace; resolve(t); },
      undefined,
      () => resolve(createProceduralTexture(fallbackColor))
    );
  });
}
window.__loadTexture = loadTexture;

// ============ CARREGAR O MODELO LOCAL ============
let gltfCache = null;
async function loadAvatarModel() {
  if (gltfCache) return gltfCache;
  const loader = new GLTFLoader();
  return new Promise((resolve, reject) => {
    // Carrega o Xbot.glb que está na raiz do seu projeto
    loader.load('./Xbot.glb', (gltf) => {
      gltfCache = gltf.scene;
      resolve(gltfCache);
    }, undefined, reject);
  });
}

function applyTshirtTexture(root, texture) {
  root.traverse((child) => {
    if (child.isMesh) {
      // O Xbot tem uma mesh específica chamada Beta_TShirt
      if (child.name.includes('Shirt') || child.name.includes('shirt')) {
        child.material = child.material.clone();
        child.material.map = texture;
        child.material.color.setHex(0xffffff); // Cor branca para mostrar a textura real
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
  const camera = new THREE.PerspectiveCamera(35, w/h, 0.1, 200);
  camera.position.set(0, 1.2, 4.5);

  const renderer = new THREE.WebGLRenderer({ antialias:true, alpha:true });
  renderer.setSize(w, h);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  el.appendChild(renderer.domElement);

  // Luzes para iluminar o boneco
  scene.add(new THREE.AmbientLight(0xffffff, 0.8));
  const key = new THREE.DirectionalLight(0xffffff, 1.5); key.position.set(2, 5, 4); scene.add(key);
  const fill = new THREE.DirectionalLight(0xffffff, 0.5); fill.position.set(-4, 2, 3); scene.add(fill);

  try {
    const originalModel = await loadAvatarModel();
    const model = originalModel.clone(true);
    
    // Enquadramento do Xbot (Ele vem com tamanho natural)
    model.position.y = -1.6; 
    
    // Aplica a textura (se houver)
    const tex = await loadTexture(cam.textura_principal, cam.cor_base);
    applyTshirtTexture(model, tex);

    scene.add(model);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(0, 0.5, 0);
    controls.enablePan = true;
    controls.minDistance = 2;
    controls.maxDistance = 8;
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
      camera.aspect = w2/h2;
      camera.updateProjectionMatrix();
      renderer.setSize(w2, h2);
    });
    ro.observe(el);

    return {
      scene, camera, renderer, model, controls,
      setTexture(texture) { applyTshirtTexture(model, texture); },
      setAutoRotate(v) { controls.autoRotate = v; if (!v) pauseUntil = Infinity; else pauseUntil = 0; },
      resetCamera() {
        camera.position.set(0, 1.2, 4.5);
        controls.target.set(0, 0.5, 0);
        controls.update();
      },
      destroy() {
        cancelAnimationFrame(animId);
        ro.disconnect();
        renderer.dispose();
        el.innerHTML = '';
      }
    };

  } catch (error) {
    console.error('Falha ao carregar o Xbot.glb. Verifique se ele está na raiz do projeto.', error);
    el.innerHTML = '<p style="padding:20px;color:#ff4d4d;font-size:.9rem;text-align:center;">⚠️ Erro ao carregar modelo 3D.<br>Certifique-se de que o arquivo <b>Xbot.glb</b> está na raiz do projeto.</p>';
    return null;
  }
}
window.__createViewer = createViewer;

// ============ LOAD & RENDER ============
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
    console.error(e);
    toast('Erro ao carregar dados.', true);
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
      <div class="product-viewer" id="viewer-${cam.id}"></div>
      <div class="product-info">
        ${cam.destaque ? `<span class="product-tag">${cam.destaque}</span>` : ''}
        <h3>${cam.nome}</h3>
        <p>${cam.descricao || ''}</p>
        <button class="btn-primary" data-explore="${cam.id}">Explorar em 3D</button>
      </div>
    `;
    grid.appendChild(card);

    setTimeout(async () => {
      const viewerEl = document.getElementById(`viewer-${cam.id}`);
      if (viewerEl) {
        const v = await createViewer(viewerEl, cam, { autoRotate: true });
        if (v) state.productViewers[cam.id] = v;
      }
    }, 150 * idx);

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
  const menuBtn = $('#menuToggle');
  const nav = $('#mainNav');
  menuBtn?.addEventListener('click', () => nav.classList.toggle('open'));
  
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
}

initUI();
loadSite();
