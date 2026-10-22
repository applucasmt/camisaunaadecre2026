import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

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
    console.error('Erro na API:', e);
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
    console.error('Erro na API:', e);
    return { ok: false, error: 'Falha na rede' };
  }
}

window.__apiPost = apiPost;

// ============ TEXTURA PROCEDURAL ============
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
      t => { 
        t.anisotropy = 8; 
        t.colorSpace = THREE.SRGBColorSpace; 
        resolve(t); 
      },
      undefined,
      () => resolve(createProceduralTexture(fallbackColor))
    );
  });
}

window.__loadTexture = loadTexture;

// ============ GEOMETRIA DA CAMISETA ============
function createTshirtGeometry() {
  const shape = new THREE.Shape();
  const w = 2.0, h = 3.0, neck = 0.5;

  shape.moveTo(-w, h/2 - 0.6);
  shape.lineTo(-w - 0.55, h/2);
  shape.lineTo(-w - 0.75, h/2 - 0.55);
  shape.lineTo(-w - 0.1, 0.35);
  shape.lineTo(-w + 0.15, 0.35);
  shape.lineTo(-w + 0.3, -h/2 + 0.35);
  shape.lineTo(w - 0.3, -h/2 + 0.35);
  shape.lineTo(w - 0.15, 0.35);
  shape.lineTo(w + 0.1, 0.35);
  shape.lineTo(w + 0.75, h/2 - 0.55);
  shape.lineTo(w + 0.55, h/2);
  shape.lineTo(w, h/2 - 0.6);
  shape.quadraticCurveTo(neck, h/2 - 0.3, 0, h/2 - 0.8);
  shape.quadraticCurveTo(-neck, h/2 - 0.3, -w, h/2 - 0.6);

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.25, bevelEnabled: true,
    bevelSegments: 3, bevelSize: 0.08, bevelThickness: 0.08, curveSegments: 24
  });
  geo.center();
  return geo;
}

// ============ MANEQUIM PROCEDURAL 3D ============
async function buildMannequin(cam) {
  const group = new THREE.Group();
  const skinMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.65, metalness: 0.15 });

  // Tronco
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.75, 2.4, 48), skinMat);
  torso.position.y = 0.2;
  group.add(torso);

  // Ombros
  const shoulders = new THREE.Mesh(new THREE.SphereGeometry(0.9, 32, 24, 0, Math.PI*2, 0, Math.PI/2), skinMat);
  shoulders.position.y = 1.4;
  group.add(shoulders);

  // Pescoço
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 0.55, 32), skinMat);
  neck.position.y = 1.85;
  group.add(neck);

  // Cabeça
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.48, 32, 32), skinMat);
  head.position.y = 2.55;
  head.scale.set(0.9, 1.05, 0.95);
  group.add(head);

  // Braços
  function makeArm(side) {
    const armGroup = new THREE.Group();
    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 0.85, 8, 16), skinMat);
    upper.position.y = -0.5;
    armGroup.add(upper);
    const fore = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.8, 8, 16), skinMat);
    fore.position.y = -1.35;
    armGroup.add(fore);
    armGroup.position.set(side * 1.15, 1.15, 0);
    armGroup.rotation.z = side * 0.12;
    return armGroup;
  }
  group.add(makeArm(-1));
  group.add(makeArm(1));

  // Pernas
  function makeLeg(side) {
    const legGroup = new THREE.Group();
    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 1.0, 8, 16), skinMat);
    thigh.position.y = -0.6;
    legGroup.add(thigh);
    legGroup.position.set(side * 0.42, -1.2, 0);
    return legGroup;
  }
  group.add(makeLeg(-1));
  group.add(makeLeg(1));

  // ===== CAMISETA =====
  const tex = await loadTexture(cam.textura_principal, cam.cor_base || '#222');
  const tshirtGeo = createTshirtGeometry();
  const tshirtMat = new THREE.MeshStandardMaterial({
    map: tex, color: 0xffffff, roughness: 0.85, metalness: 0.05, side: THREE.DoubleSide
  });
  const tshirt = new THREE.Mesh(tshirtGeo, tshirtMat);
  tshirt.scale.set(1.05, 1.05, 1.05);
  tshirt.position.y = 0.35;
  group.add(tshirt);

  return { group, tshirtMat };
}

// ============ CRIAR VIEWER ============
async function createViewer(el, cam, options = {}) {
  const w = el.clientWidth || 400;
  const h = el.clientHeight || 400;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, w/h, 0.1, 200);
  camera.position.set(0, 0.5, 10);

  const renderer = new THREE.WebGLRenderer({ antialias:true, alpha:true });
  renderer.setSize(w, h);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  el.appendChild(renderer.domElement);

  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const key = new THREE.DirectionalLight(0xffffff, 1.8); key.position.set(4, 6, 5); scene.add(key);
  const fill = new THREE.DirectionalLight(0xffffff, 0.8); fill.position.set(-5, 3, 2); scene.add(fill);
  const rim = new THREE.DirectionalLight(0xd4af37, 1.2); rim.position.set(0, -2, -5); scene.add(rim);

  const { group, tshirtMat } = await buildMannequin(cam);
  group.position.y = 1.0;
  scene.add(group);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.target.set(0, 1.0, 0);
  controls.enablePan = true;
  controls.autoRotate = options.autoRotate !== false;
  controls.autoRotateSpeed = 1.5;

  let pauseUntil = 0;
  const onInteract = () => { pauseUntil = performance.now() + 2500; };
  renderer.domElement.addEventListener('pointerdown', onInteract);
  renderer.domElement.addEventListener('touchstart', onInteract, { passive: true });

  const clock = new THREE.Clock();
  let animId;
  function animate() {
    animId = requestAnimationFrame(animate);
    const t = clock.getElapsedTime();
    controls.autoRotate = (performance.now() > pauseUntil) && (options.autoRotate !== false);
    controls.update();
    group.position.y = 1.0 + Math.sin(t * 0.8) * 0.03;
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
    scene, camera, renderer, group, controls, tshirtMat,
    setAutoRotate(v) { controls.autoRotate = v; if (!v) pauseUntil = Infinity; else pauseUntil = 0; },
    setTexture(texture) { 
      tshirtMat.map = texture; 
      tshirtMat.needsUpdate = true; 
    },
    resetCamera() {
      camera.position.set(0, 0.5, 10);
      controls.target.set(0, 1.0, 0);
      controls.update();
    },
    destroy() {
      cancelAnimationFrame(animId);
      ro.disconnect();
      renderer.dispose();
      el.innerHTML = '';
    }
  };
}

window.__createViewer = createViewer;

// ============ CARREGAR DADOS ============
async function loadSite() {
  try {
    const data = await apiGet('getAll');
    if (!data.ok) throw new Error(data.error);
    
    state.config = Object.fromEntries(data.config.map(c => [c.CHAVE, c.VALOR]));
    state.camisetas = data.camisetas;
    
    // Aplica configurações
    if (state.config.titulo_site) $('#heroTitle').textContent = state.config.titulo_site;
    if (state.config.subtitulo_site) $('#heroSub').textContent = state.config.subtitulo_site;
    if (state.config.cta_texto) $('#heroCta').textContent = state.config.cta_texto;
    
    renderProducts();
  } catch (e) {
    console.error(e);
    toast('Erro ao carregar dados do Google Sheets.', true);
    // Fallback de segurança se a API falhar
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

  // Hero (usa a primeira camiseta)
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
      if (!viewerEl) return;
      try {
        const v = await createViewer(viewerEl, cam, { autoRotate: true });
        state.productViewers[cam.id] = v;
      } catch (e) {
        console.error('Falha ao carregar manequim:', e);
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

// ============ UI GERAL ============
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

// INICIA TUDO
initUI();
loadSite();
