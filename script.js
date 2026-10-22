import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ⚠️ COLE AQUI A URL DO SEU WEB APP DO GOOGLE APPS SCRIPT
const API_URL = 'https://script.google.com/macros/s/SEU_ID_AQUI/exec';

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
      t => { t.anisotropy = 8; t.colorSpace = THREE.SRGBColorSpace; resolve(t); },
      undefined,
      () => resolve(createProceduralTexture(fallbackColor))
    );
  });
}
window.__loadTexture = loadTexture;

// ============ MANEQUIM DE VITRINE 3D ============
async function buildMannequin(cam) {
  const group = new THREE.Group();

  // Material do manequim (branco brilhante estilo fibra de vidro)
  const skinMat = new THREE.MeshStandardMaterial({
    color: 0xe0e0e0, // Cinza claro / Branco
    roughness: 0.2,  // Bem liso
    metalness: 0.1
  });

  // Corpo (tronco com cintura)
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.65, 2.2, 32), skinMat);
  torso.position.y = 0.3;
  group.add(torso);

  // Ombros arredondados
  const shoulders = new THREE.Mesh(new THREE.SphereGeometry(0.78, 32, 16, 0, Math.PI*2, 0, Math.PI/2), skinMat);
  shoulders.position.y = 1.4;
  shoulders.scale.set(1.1, 0.7, 0.8);
  group.add(shoulders);

  // Pescoço
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.25, 0.6, 32), skinMat);
  neck.position.y = 1.8;
  group.add(neck);

  // Cabeça (formato oval de manequim, sem rosto)
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 32, 32), skinMat);
  head.position.y = 2.4;
  head.scale.set(0.85, 1.15, 0.9);
  group.add(head);

  // Braços (posicionados para baixo, colados ao corpo)
  function makeArm(side) {
    const armGroup = new THREE.Group();
    // Braço superior
    const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.14, 1.0, 24), skinMat);
    upper.position.y = -0.5;
    armGroup.add(upper);
    // Antebraço
    const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.10, 0.9, 24), skinMat);
    fore.position.y = -1.4;
    armGroup.add(fore);
    // Mão
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 16), skinMat);
    hand.position.y = -1.9;
    hand.scale.set(0.8, 1.4, 0.5);
    armGroup.add(hand);

    // Posiciona o braço na lateral do ombro e inclina levemente para fora
    armGroup.position.set(side * 0.85, 1.3, 0);
    armGroup.rotation.z = side * 0.08;
    return armGroup;
  }
  group.add(makeArm(-1));
  group.add(makeArm(1));

  // Pernas
  function makeLeg(side) {
    const legGroup = new THREE.Group();
    // Coxa
    const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.20, 1.2, 24), skinMat);
    thigh.position.y = -0.6;
    legGroup.add(thigh);
    // Panturrilha
    const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.13, 1.1, 24), skinMat);
    shin.position.y = -1.7;
    legGroup.add(shin);
    // Pé (formato de sapato básico)
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.5), skinMat);
    foot.position.set(0, -2.3, 0.1);
    legGroup.add(foot);

    legGroup.position.set(side * 0.35, -0.9, 0);
    return legGroup;
  }
  group.add(makeLeg(-1));
  group.add(makeLeg(1));

  // Base do manequim
  const baseMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.3, metalness: 0.8 });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.2, 16), baseMat);
  pole.position.y = -4.5;
  group.add(pole);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.7, 0.1, 32), baseMat);
  base.position.y = -5.1;
  group.add(base);

  // ===== CAMISETA (Formato de tecido vestindo o corpo) =====
  const tex = await loadTexture(cam.textura_principal, cam.cor_base || '#fff');
  
  // Geometria da camiseta mais ajustada ao corpo (estilo oversized)
  const tshirtGeo = new THREE.CylinderGeometry(0.81, 0.78, 1.8, 32, 1, true);
  // Fecha o topo e a base
  const tshirtMat = new THREE.MeshStandardMaterial({
    map: tex,
    color: 0xffffff,
    roughness: 0.9,
    metalness: 0.0,
    side: THREE.DoubleSide
  });
  const tshirt = new THREE.Mesh(tshirtGeo, tshirtMat);
  tshirt.position.y = 0.5;
  group.add(tshirt);

  // Mangas da camiseta
  const sleeveGeo = new THREE.CylinderGeometry(0.2, 0.22, 0.6, 16, 1, true);
  const sleeveMat = new THREE.MeshStandardMaterial({
    map: tex,
    color: 0xffffff,
    roughness: 0.9,
    side: THREE.DoubleSide
  });
  
  const sleeveL = new THREE.Mesh(sleeveGeo, sleeveMat);
  sleeveL.position.set(-0.85, 1.1, 0);
  sleeveL.rotation.z = 0.15;
  group.add(sleeveL);
  
  const sleeveR = new THREE.Mesh(sleeveGeo, sleeveMat);
  sleeveR.position.set(0.85, 1.1, 0);
  sleeveR.rotation.z = -0.15;
  group.add(sleeveR);

  // Gola da camiseta
  const collarGeo = new THREE.TorusGeometry(0.24, 0.04, 16, 32);
  const collar = new THREE.Mesh(collarGeo, tshirtMat);
  collar.position.y = 1.4;
  collar.rotation.x = Math.PI / 2;
  group.add(collar);

  return { group, tshirtMat };
}

// ============ CRIAR VIEWER ============
async function createViewer(el, cam, options = {}) {
  const w = el.clientWidth || 400;
  const h = el.clientHeight || 400;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, w/h, 0.1, 200);
  camera.position.set(0, 0.5, 9);

  const renderer = new THREE.WebGLRenderer({ antialias:true, alpha:true });
  renderer.setSize(w, h);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  el.appendChild(renderer.domElement);

  // Luzes de Estúdio de Vitrine
  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  
  const key = new THREE.DirectionalLight(0xffffff, 2.0); 
  key.position.set(3, 5, 5); 
  scene.add(key);
  
  const fill = new THREE.DirectionalLight(0xffffff, 1.0); 
  fill.position.set(-4, 2, 3); 
  scene.add(fill);
  
  const rim = new THREE.DirectionalLight(0xd4af37, 1.5); 
  rim.position.set(0, -2, -4); 
  scene.add(rim);

  const { group, tshirtMat } = await buildMannequin(cam);
  group.position.y = 0.8; // Centraliza na tela
  scene.add(group);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.target.set(0, 0.8, 0);
  controls.enablePan = false; // Foca no manequim
  controls.minDistance = 3;
  controls.maxDistance = 12;
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
    controls.autoRotate = (performance.now() > pauseUntil) && (options.autoRotate !== false);
    controls.update();
    // Leve respiração
    group.position.y = 0.8 + Math.sin(clock.getElapsedTime() * 0.8) * 0.02;
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
      camera.position.set(0, 0.5, 9);
      controls.target.set(0, 0.8, 0);
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
    
    if (state.config.titulo_site) $('#heroTitle').textContent = state.config.titulo_site;
    if (state.config.subtitulo_site) $('#heroSub').textContent = state.config.subtitulo_site;
    if (state.config.cta_texto) $('#heroCta').textContent = state.config.cta_texto;
    
    renderProducts();
  } catch (e) {
    console.error(e);
    toast('Erro ao carregar dados.', true);
    // Fallback (Para ver o design funcionando caso a API caia)
    state.camisetas = [
      { id: 1, nome: 'Classic Black', descricao: 'Algodão premium penteado', cor_base: '#111111', destaque: 'Silhueta atemporal' },
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
