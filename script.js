// ⚠️ COLE AQUI a URL do seu Web App
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

function toast(msg, isError=false) {
  let el = $('#toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast'; el.className = 'toast';
    document.body.appendChild(el);
  }
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

// ============ CARREGAR ============
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
  // tecido sutil
  for (let i = 0; i < 3000; i++) {
    ctx.fillStyle = `rgba(255,255,255,${Math.random()*0.03})`;
    ctx.fillRect(Math.random()*1024, Math.random()*1024, 1, 1);
  }
  // costura
  ctx.strokeStyle = 'rgba(0,0,0,0.15)';
  ctx.lineWidth = 3;
  ctx.strokeRect(30, 30, 964, 964);
  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 8;
  return tex;
}

async function loadTexture(url, fallbackColor) {
  if (!url) return createProceduralTexture(fallbackColor);
  return new Promise(resolve => {
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin('anonymous');
    loader.load(url, t => { t.anisotropy = 8; resolve(t); },
      undefined, () => resolve(createProceduralTexture(fallbackColor)));
  });
}

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
    depth: 0.22, bevelEnabled: true,
    bevelSegments: 3, bevelSize: 0.07, bevelThickness: 0.07, curveSegments: 24
  });
  geo.center();
  return geo;
}

// ============ CRIAR MANEQUIM + CAMISETA ============
// Retorna { group, tshirtMat, tshirtGeo, tshirtMesh }
async function buildMannequin(cam) {
  const group = new THREE.Group();

  // Material do manequim (corpo neutro)
  const skinMat = new THREE.MeshStandardMaterial({
    color: 0x2a2a2a,
    roughness: 0.65,
    metalness: 0.15
  });

  // ===== CORPO (tronco) =====
  const torso = new THREE.Mesh(
    new THREE.CylinderGeometry(0.85, 0.75, 2.4, 48, 1, false),
    skinMat
  );
  torso.position.y = 0.2;
  group.add(torso);

  // Ombros arredondados
  const shoulders = new THREE.Mesh(
    new THREE.SphereGeometry(0.9, 32, 24, 0, Math.PI*2, 0, Math.PI/2),
    skinMat
  );
  shoulders.position.y = 1.4;
  group.add(shoulders);

  // ===== PESCOÇO =====
  const neck = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28, 0.32, 0.55, 32),
    skinMat
  );
  neck.position.y = 1.85;
  group.add(neck);

  // ===== CABEÇA =====
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.48, 32, 32),
    skinMat
  );
  head.position.y = 2.55;
  head.scale.set(0.9, 1.05, 0.95);
  group.add(head);

  // ===== BRAÇOS =====
  function makeArm(side) {
    const armGroup = new THREE.Group();
    // Braço superior
    const upper = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.18, 0.85, 8, 16),
      skinMat
    );
    upper.position.y = -0.5;
    armGroup.add(upper);
    // Antebraço
    const fore = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.15, 0.8, 8, 16),
      skinMat
    );
    fore.position.y = -1.35;
    armGroup.add(fore);
    // Mão
    const hand = new THREE.Mesh(
      new THREE.SphereGeometry(0.17, 16, 16),
      skinMat
    );
    hand.position.y = -1.9;
    hand.scale.set(1, 1.3, 0.6);
    armGroup.add(hand);

    armGroup.position.set(side * 1.15, 1.15, 0);
    armGroup.rotation.z = side * 0.12;
    return armGroup;
  }
  group.add(makeArm(-1));
  group.add(makeArm(1));

  // ===== PERNAS =====
  function makeLeg(side) {
    const legGroup = new THREE.Group();
    const thigh = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.22, 1.0, 8, 16),
      skinMat
    );
    thigh.position.y = -0.6;
    legGroup.add(thigh);
    const shin = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.17, 0.95, 8, 16),
      skinMat
    );
    shin.position.y = -1.7;
    legGroup.add(shin);
    const foot = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.15, 0.5),
      skinMat
    );
    foot.position.set(0, -2.35, 0.12);
    legGroup.add(foot);

    legGroup.position.set(side * 0.42, -1.2, 0);
    return legGroup;
  }
  group.add(makeLeg(-1));
  group.add(makeLeg(1));

  // ===== SUPORTE (base do manequim) =====
  const baseMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.4, metalness: 0.6 });
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.06, 1.0, 16),
    baseMat
  );
  pole.position.y = -4.9;
  group.add(pole);

  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.55, 0.65, 0.12, 48),
    baseMat
  );
  base.position.y = -5.45;
  group.add(base);

  // ===== CAMISETA =====
  const tex = await loadTexture(cam.textura_principal, cam.cor_base || '#222');
  const tshirtGeo = createTshirtGeometry();
  const tshirtMat = new THREE.MeshStandardMaterial({
    map: tex,
    color: 0xffffff,
    roughness: 0.85,
    metalness: 0.05,
    side: THREE.DoubleSide
  });
  const tshirt = new THREE.Mesh(tshirtGeo, tshirtMat);
  tshirt.scale.set(1.05, 1.05, 1.05);
  tshirt.position.y = 0.35;
  group.add(tshirt);

  // Mangas adicionais (se textura separada)
  if (cam.textura_manga) {
    const mangaTex = await loadTexture(cam.textura_manga, '#111');
    const mangaMat = new THREE.MeshStandardMaterial({ map: mangaTex, roughness: 0.9 });
    const mgGeo = new THREE.CapsuleGeometry(0.24, 0.5, 8, 16);
    const mL = new THREE.Mesh(mgGeo, mangaMat); mL.position.set(-1.15, 1.0, 0); mL.rotation.z = 0.15; group.add(mL);
    const mR = new THREE.Mesh(mgGeo, mangaMat); mR.position.set(1.15, 1.0, 0); mR.rotation.z = -0.15; group.add(mR);
  }

  return { group, tshirtMat, tshirtGeo, tshirt };
}

// ============ VIEWER REUTILIZÁVEL ============
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
  renderer.toneMappingExposure = 1.1;
  el.appendChild(renderer.domElement);

  // Luzes cinematográficas
  scene.add(new THREE.AmbientLight(0xffffff, 0.4));
  const key = new THREE.DirectionalLight(0xffffff, 1.5); key.position.set(4, 6, 5); scene.add(key);
  const fill = new THREE.DirectionalLight(0xffffff, 0.6); fill.position.set(-5, 3, 2); scene.add(fill);
  const rim = new THREE.DirectionalLight(0xd4af37, 0.9); rim.position.set(0, -2, -5); scene.add(rim);
  const top = new THREE.PointLight(0xd4af37, 0.5, 20); top.position.set(0, 6, 0); scene.add(top);

  const { group, tshirtMat } = await buildMannequin(cam);
  group.position.y = 1.0; // centraliza na altura da camiseta
  scene.add(group);

  // OrbitControls (rotação, zoom, pan)
  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.rotateSpeed = 0.8;
  controls.zoomSpeed = 1.2;
  controls.panSpeed = 0.6;
  controls.minDistance = 4;
  controls.maxDistance = 20;
  controls.target.set(0, 1.0, 0);
  controls.enablePan = true;
  controls.enableZoom = true;

  // Auto rotação (pausa ao interagir)
  let autoRotate = options.autoRotate !== false;
  let lastInteract = 0;

  const clock = new THREE.Clock();
  let animId;
  function animate() {
    animId = requestAnimationFrame(animate);
    const t = clock.getElapsedTime();
    controls.update();

    if (autoRotate && Date.now() - lastInteract > 2500) {
      group.rotation.y += 0.005;
    }
    // leve flutuação
    group.position.y = 1.0 + Math.sin(t * 0.8) * 0.03;

    renderer.render(scene, camera);
  }
  animate();

  const onInteract = () => { lastInteract = Date.now(); };
  renderer.domElement.addEventListener('pointerdown', onInteract);
  renderer.domElement.addEventListener('wheel', onInteract, { passive: true });
  renderer.domElement.addEventListener('touchstart', onInteract, { passive: true });

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
    scene, camera, renderer, group, controls, tshirtMat,
    setAutoRotate(v) { autoRotate = v; },
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

// ============ RENDER PRODUTOS ============
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

    // Inicializa viewer da grade
    setTimeout(async () => {
      const viewerEl = document.getElementById(`viewer-${cam.id}`);
      if (!viewerEl) return;
      const v = await createViewer(viewerEl, cam, { autoRotate: true });
      state.productViewers[cam.id] = v;
    }, 200 * idx);

    card.querySelector('[data-explore]').onclick = () => openFullViewer(cam);
  });
}

// ============ HERO VIEWER ============
async function initHeroViewer() {
  const el = document.getElementById('heroViewer');
  if (!el) return;
  // usa a primeira camiseta como destaque
  const cam = state.camisetas[0];
  if (!cam) return;
  state.heroViewer = await createViewer(el, cam, { autoRotate: true });
}

// ============ FULLSCREEN VIEWER ============
async function openFullViewer(cam) {
  const modal = document.getElementById('viewerModal');
  document.getElementById('viewerTitle').textContent = cam.nome;
  document.getElementById('viewerDesc').textContent = cam.descricao || '';
  modal.classList.add('active');

  if (state.modalViewer) {
    state.modalViewer.destroy();
    state.modalViewer = null;
  }

  const el = document.getElementById('fullViewer');
  // aguarda um frame para o elemento ter tamanho
  await new Promise(r => setTimeout(r, 50));
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

  // Fechar modal
  document.getElementById('closeViewer').onclick = () => {
    document.getElementById('viewerModal').classList.remove('active');
    if (state.modalViewer) {
      state.modalViewer.destroy();
      state.modalViewer = null;
    }
  };
  document.getElementById('resetView').onclick = () => {
    state.modalViewer?.resetCamera();
  };
  document.getElementById('toggleAuto').onclick = (e) => {
    if (!state.modalViewer) return;
    const current = e.target.dataset.paused === '1';
    state.modalViewer.setAutoRotate(current);
    e.target.dataset.paused = current ? '0' : '1';
    e.target.textContent = current ? 'Pausar rotação' : 'Retomar rotação';
  };
}

// ============ BOOT ============
document.addEventListener('DOMContentLoaded', async () => {
  initUI();
  await loadSite();
  await initHeroViewer();
});

// expõe para admin
window.__state = state;
window.__apiPost = apiPost;
window.__apiGet = apiGet;
window.__toast = toast;
window.__loadTexture = loadTexture;
window.__createTshirtGeometry = createTshirtGeometry;
window.__createProceduralTexture = createProceduralTexture;
window.__buildMannequin = buildMannequin;
window.__createViewer = createViewer;
