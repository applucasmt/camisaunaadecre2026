// ⚠️ COLE AQUI a URL do seu Web App
const API_URL = 'https://script.google.com/macros/s/AKfycbxnUijRFoBQZqxjPNtcjercaHiO5oIxmMViYEC4tC_DLgxApjOjTw9WCU4Fb8NSJKf7/exec';

// ============ MODELO 3D (GLB) ============
// X Bot do Mixamo — CC, hosted by Three.js (oficial)
// Mesh da camiseta: "Beta_TShirt" (mesh separado, ótimo pra trocar textura)
const AVATAR_URL = 'https://threejs.org/examples/models/gltf/Xbot.glb';
const TSHIRT_MESH_NAME = 'Beta_TShirt';

// Alternativas (descomente para trocar):
// const AVATAR_URL = 'https://threejs.org/examples/models/gltf/Soldier.glb';
// const AVATAR_URL = 'https://threejs.org/examples/models/gltf/RobotExpressive/RobotExpressive.glb';

const state = {
  config: {},
  camisetas: [],
  heroViewer: null,
  productViewers: {},
  modalViewer: null,
  avatarReady: false
};

const $ = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => [...r.querySelectorAll(s)];

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
  const r = await fetch(`${API_URL}?action=${action}`);
  return r.json();
}
async function apiPost(payload) {
  const r = await fetch(API_URL, {
    method:'POST',
    headers:{ 'Content-Type':'text/plain;charset=utf-8' },
    body: JSON.stringify(payload)
  });
  return r.json();
}

// ============ CARREGAR SITE ============
async function loadSite() {
  try {
    const data = await apiGet('getAll');
    if (!data.ok) throw new Error(data.error);
    state.config = Object.fromEntries(data.config.map(c => [c.CHAVE, c.VALOR]));
    state.camisetas = data.camisetas;
    applyConfig();
    renderProducts();
  } catch (e) {
    console.error(e);
    toast('Erro ao carregar dados. Verifique a API.', true);
  }
}

function applyConfig() {
  const c = state.config;
  if (c.titulo_site) {
    $('#heroTitle').textContent = c.titulo_site;
    $('#siteLogo').innerHTML = c.titulo_site.replace(' ', '<span>·</span>');
  }
  if (c.subtitulo_site) $('#heroSub').textContent = c.subtitulo_site;
  if (c.cta_texto) $('#heroCta').textContent = c.cta_texto;
  if (c.rodape) $('#footerText').textContent = c.rodape;
  if (c.instagram || c.email) {
    $('#socials').innerHTML = [c.instagram, c.email].filter(Boolean).join(' · ');
  }
  if (c.cor_secundaria) {
    document.documentElement.style.setProperty('--secondary', c.cor_secundaria);
  }
}

// ============ TEXTURA PROCEDURAL (fallback) ============
function createProceduralTexture(color) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024; canvas.height = 1024;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 1024, 1024);
  for (let i = 0; i < 3000; i++) {
    ctx.fillStyle = `rgba(255,255,255,${Math.random()*0.03})`;
    ctx.fillRect(Math.random()*1024, Math.random()*1024, 1, 1);
  }
  ctx.strokeStyle = 'rgba(0,0,0,0.15)';
  ctx.lineWidth = 3;
  ctx.strokeRect(30, 30, 964, 964);
  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 8;
  return tex;
}

async function loadTexture(url, fallbackColor) {
  if (!url) return createProceduralTexture(fallbackColor || '#333');
  return new Promise(resolve => {
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin('anonymous');
    loader.load(url,
      t => { t.anisotropy = 8; t.colorSpace = THREE.SRGBColorSpace; resolve(t); },
      undefined,
      () => resolve(createProceduralTexture(fallbackColor || '#333'))
    );
  });
}

// ============ CARREGAR AVATAR GLB (cache global) ============
let gltfCachePromise = null;
function loadAvatarGLTF() {
  if (gltfCachePromise) return gltfCachePromise;
  gltfCachePromise = new Promise((resolve, reject) => {
    const loader = new THREE.GLTFLoader();
    loader.load(AVATAR_URL, resolve, undefined, reject);
  });
  return gltfCachePromise;
}

// Clona o avatar e retorna { root, tshirtMeshes: [] }
function cloneAvatar(gltfScene) {
  const clone = gltfScene.clone(true);
  const tshirtMeshes = [];
  clone.traverse(obj => {
    if (obj.isMesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
      // material duplicado para não afetar as outras instâncias
      obj.material = obj.material.clone();
      // procura a mesh da camiseta
      if (obj.name && obj.name.toLowerCase().includes('tshirt')) {
        tshirtMeshes.push(obj);
      }
      // também aceita variações comuns
      const name = (obj.name || '').toLowerCase();
      if (name.includes('shirt') || name.includes('body')) {
        // algumas versões do Xbot chamam "Beta_Body" / "Alpha_Body" e a camisa é "Beta_TShirt"
        if (!tshirtMeshes.includes(obj) && name.includes('shirt')) tshirtMeshes.push(obj);
      }
    }
  });
  return { root: clone, tshirtMeshes };
}

// Aplica textura em todas as meshes da camiseta do clone
function applyTshirtTexture(tshirtMeshes, texture) {
  tshirtMeshes.forEach(mesh => {
    if (!mesh.material) return;
    // Pode ser material único ou array
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    mats.forEach(mat => {
      mat.map = texture;
      mat.color = new THREE.Color(0xffffff);
      mat.needsUpdate = true;
    });
  });
}

// ============ CRIAR VIEWER REUTILIZÁVEL ============
async function createViewer(el, cam, options = {}) {
  const w = el.clientWidth || 400;
  const h = el.clientHeight || 400;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, w/h, 0.1, 200);
  camera.position.set(0, 1.5, 4.5);

  const renderer = new THREE.WebGLRenderer({ antialias:true, alpha:true });
  renderer.setSize(w, h);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  el.appendChild(renderer.domElement);

  // Iluminação
  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const key = new THREE.DirectionalLight(0xffffff, 2.0);
  key.position.set(3, 6, 4);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xffffff, 0.8);
  fill.position.set(-4, 3, 2);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0xd4af37, 1.0);
  rim.position.set(0, 2, -5);
  scene.add(rim);

  // Chão sutil
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(4, 48),
    new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 1, metalness: 0 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0;
  floor.receiveShadow = true;
  scene.add(floor);

  // Carrega o avatar
  const gltf = await loadAvatarGLTF();
  const { root, tshirtMeshes } = cloneAvatar(gltf.scene);

  // Enquadra o avatar
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  // Xbot tem ~1.8 unidades. Normaliza para ~1.8 no eixo Y
  const targetHeight = 1.8;
  const scale = targetHeight / size.y;
  root.scale.setScalar(scale);
  root.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);

  scene.add(root);

  // Posiciona câmera
  controlsTarget = new THREE.Vector3(0, 1.0, 0);

  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.rotateSpeed = 0.8;
  controls.zoomSpeed = 1.2;
  controls.minDistance = 2.0;
  controls.maxDistance = 10;
  controls.target.copy(controlsTarget);
  controls.enablePan = true;
  controls.maxPolarAngle = Math.PI * 0.9;
  controls.minPolarAngle = Math.PI * 0.1;
  controls.autoRotate = options.autoRotate !== false;
  controls.autoRotateSpeed = 1.5;
  // pausa rotação automática ao interagir
  let pauseUntil = 0;
  const onInteract = () => { pauseUntil = performance.now() + 2500; };
  renderer.domElement.addEventListener('pointerdown', onInteract);
  renderer.domElement.addEventListener('wheel', onInteract, { passive: true });
  renderer.domElement.addEventListener('touchstart', onInteract, { passive: true });

  // Aplica textura inicial
  const tex = await loadTexture(cam.textura_principal, cam.cor_base);
  applyTshirtTexture(tshirtMeshes, tex);

  // Loop
  const clock = new THREE.Clock();
  let animId;
  function animate() {
    animId = requestAnimationFrame(animate);
    const t = clock.getElapsedTime();
    controls.autoRotate = (performance.now() > pauseUntil) && (options.autoRotate !== false);
    controls.update();
    // respiração sutil
    root.position.y = Math.sin(t * 0.9) * 0.01;
    renderer.render(scene, camera);
  }
  animate();

  // Resize
  const ro = new ResizeObserver(() => {
    const w2 = el.clientWidth, h2 = el.clientHeight;
    if (!w2 || !h2) return;
    camera.aspect = w2/h2;
    camera.updateProjectionMatrix();
    renderer.setSize(w2, h2);
  });
  ro.observe(el);

  return {
    scene, camera, renderer, controls, root, tshirtMeshes,
    setAutoRotate(v) { controls.autoRotate = v; if (!v) pauseUntil = Infinity; else pauseUntil = 0; },
    setTexture(texture) { applyTshirtTexture(tshirtMeshes, texture); },
    resetCamera() {
      camera.position.set(0, 1.5, 4.5);
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

// ============ HERO ============
async function initHeroViewer() {
  const el = document.getElementById('heroViewer');
  if (!el) return;
  const cam = state.camisetas[0];
  if (!cam) return;
  state.heroViewer = await createViewer(el, cam, { autoRotate: true });
}

// ============ PRODUTOS ============
function renderProducts() {
  const grid = $('#productsGrid');
  grid.innerHTML = '';

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
        console.error('Falha ao carregar avatar:', e);
        viewerEl.innerHTML = '<p style="color:#a0a0a0;padding:20px;font-size:.85rem;">Modelo 3D indisponível</p>';
      }
    }, 150 * idx);

    card.querySelector('[data-explore]').onclick = () => openFullViewer(cam);
  });
}

// ============ MODAL FULLSCREEN ============
async function openFullViewer(cam) {
  const modal = document.getElementById('viewerModal');
  document.getElementById('viewerTitle').textContent = cam.nome;
  document.getElementById('viewerDesc').textContent = cam.descricao || '';
  modal.classList.add('active');

  if (state.modalViewer) { state.modalViewer.destroy(); state.modalViewer = null; }

  const el = document.getElementById('fullViewer');
  await new Promise(r => setTimeout(r, 60));
  state.modalViewer = await createViewer(el, cam, { autoRotate: true });
}

// ============ UI ============
function initUI() {
  window.addEventListener('scroll', () => {
    $('#header').classList.toggle('scrolled', window.scrollY > 50);
  });
  const menuBtn = $('#menuToggle');
  const nav = $('#mainNav');
  menuBtn?.addEventListener('click', () => nav.classList.toggle('open'));
  $$('.nav a').forEach(a => a.addEventListener('click', () => nav.classList.remove('open')));

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

// ============ BOOT ============
document.addEventListener('DOMContentLoaded', async () => {
  initUI();
  await loadSite();
  await initHeroViewer();
});

// expõe para admin.js
window.__state = state;
window.__apiPost = apiPost;
window.__apiGet = apiGet;
window.__toast = toast;
window.__loadTexture = loadTexture;
window.__createProceduralTexture = createProceduralTexture;
window.__loadAvatarGLTF = loadAvatarGLTF;
window.__cloneAvatar = cloneAvatar;
window.__applyTshirtTexture = applyTshirtTexture;
window.__createViewer = createViewer;
window.__AVATAR_URL = AVATAR_URL;
