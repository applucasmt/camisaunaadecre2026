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
  } catch (e) { return { ok: false, error: 'Falha na rede' }; }
}

async function apiPost(payload) {
  try {
    const r = await fetch(API_URL, {
      method:'POST', headers:{ 'Content-Type':'text/plain;charset=utf-8' }, body: JSON.stringify(payload)
    });
    return await r.json();
  } catch (e) { return { ok: false, error: 'Falha na rede' }; }
}
window.__apiPost = apiPost;

// ============ TEXTURA PROCEDURAL ============
function createProceduralTexture(color) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024; canvas.height = 1024;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = color || '#333333';
  ctx.fillRect(0, 0, 1024, 1024);
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
      t => { 
        t.anisotropy = 8; 
        t.colorSpace = THREE.SRGBColorSpace; 
        t.flipY = false; 
        resolve(t); 
      },
      undefined, () => resolve(createProceduralTexture(fallbackColor))
    );
  });
}
window.__loadTexture = loadTexture;

// ============ CARREGAR MODELO GLB LOCAL ============
let gltfCache = null;
async function loadAvatarModel() {
  if (gltfCache) return gltfCache;
  const loader = new GLTFLoader();
  return new Promise((resolve, reject) => {
    loader.load('./camisa.glb', (gltf) => {
      gltfCache = gltf.scene;
      resolve(gltfCache);
    }, undefined, reject);
  });
}

// ============ APLICAR TEXTURA NA CAMISA ============
function applyTshirtTexture(root, texture) {
  root.traverse((child) => {
    if (child.isMesh) {
      const nome = child.name.toLowerCase();
      const partesDaCamisa = ['body_front', 'body_back', 'sleeves', 'sleeves_1', 'ribbing', 'ribbing_1'];
      const isCamisa = partesDaCamisa.some(parte => nome.includes(parte));

      if (isCamisa) {
        child.material = child.material.clone();
        child.material.map = texture;
        child.material.color.setHex(0xffffff); 
        child.material.metalness = 0.0;
        child.material.roughness = 0.8;
        child.material.needsUpdate = true;
      }
    }
  });
}

// ============ CRIAR VIEWER COM AUTO-FIT A PROVA DE BALAS ============
async function createViewer(el, cam, options = {}) {
  const w = el.clientWidth || 400;
  const h = el.clientHeight || 400;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, w/h, 0.1, 1000);
  camera.position.set(0, 1.0, 3.5); // Câmera inicial segura

  const renderer = new THREE.WebGLRenderer({ antialias:true, alpha:true });
  renderer.setSize(w, h);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  el.appendChild(renderer.domElement);

  // Iluminação
  scene.add(new THREE.AmbientLight(0xffffff, 1.0));
  const key = new THREE.DirectionalLight(0xffffff, 2.0); key.position.set(2, 5, 4); scene.add(key);
  const fill = new THREE.DirectionalLight(0xffffff, 1.0); fill.position.set(-4, 3, 2); scene.add(fill);
  const rim = new THREE.DirectionalLight(0xd4af37, 1.5); rim.position.set(0, 2, -5); scene.add(rim);

  try {
    const originalModel = await loadAvatarModel();
    
    // === O SEGREDO ESTÁ AQUI ===
    // Em vez de clonar direto, nós criamos um novo Group e jogamos o modelo dentro,
    // ignorando todas as transformações esquisitas do FBX original.
    const modelWrapper = new THREE.Group();
    const model = originalModel.clone(true);
    
    // Reseta rotação e posição do modelo bruto
    model.position.set(0, 0, 0);
    model.rotation.set(0, 0, 0);
    model.scale.set(1, 1, 1);

    modelWrapper.add(model);
    
    // Força a matriz para atualizar as posições reais
    modelWrapper.updateMatrixWorld(true);

    // Agora sim, calcula o tamanho real do modelo do zero
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    // Normaliza para 2 metros de altura
    const targetHeight = 2.0;
    const scaleFactor = targetHeight / size.y;
    model.scale.setScalar(scaleFactor);

    // Centraliza no eixo X e Z, e cola no chão no eixo Y
    model.position.x = -center.x * scaleFactor;
    model.position.z = -center.z * scaleFactor;
    model.position.y = -box.min.y * scaleFactor; 

    modelWrapper.updateMatrixWorld(true);

    const tex = await loadTexture(cam.textura_principal, cam.cor_base);
    applyTshirtTexture(model, tex);

    scene.add(modelWrapper);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    
    // Foca no peito do modelo
    controls.target.set(0, 1.2, 0);
    
    // Câmera a 3.5 metros de distância
    camera.position.set(0, 1.2, 3.5);
    controls.minDistance = 1.0;
    controls.maxDistance = 8;
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
        camera.position.set(0, 1.2, 3.5);
        controls.target.set(0, 1.2, 0);
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
    console.error('Falha ao carregar o modelo 3D.', error);
    el.innerHTML = '<p style="padding:20px;color:#ff4d4d;font-size:.9rem;text-align:center;">⚠️ Erro ao carregar <b>camisa.glb</b>.</p>';
    return null;
  }
}
window.__createViewer = createViewer;

// ============ CARREGAR DADOS ============
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

// ============ RENDERIZAR PRODUTOS ============
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
      <div class="product-viewer" id="viewer-${cam.id}">
        <div class="product-viewer-hint">Arraste · Zoom · Gire</div>
      </div>
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
        state.productViewers[cam.id] = v;
      }
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

// ============ UI ============
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
