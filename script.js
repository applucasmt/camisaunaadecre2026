// ============ CONFIG ============
// ⚠️ COLE AQUI A URL DO SEU WEB APP DO APPS SCRIPT
const API_URL = 'https://script.google.com/macros/s/SEU_ID_AQUI/exec';

// ============ ESTADO GLOBAL ============
const state = {
  config: {},
  camisetas: [],
  scenes: {},
  renderers: {}
};

// ============ HELPERS ============
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

function toast(msg, isError = false) {
  let el = $('#toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.toggle('error', isError);
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 3000);
}

// ============ API ============
async function apiGet(action = 'getAll') {
  const r = await fetch(`${API_URL}?action=${action}`);
  return r.json();
}

async function apiPost(payload) {
  const r = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload)
  });
  return r.json();
}

// ============ CARREGAR DADOS ============
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
  if (c.whatsapp) {
    $('#whatsBtn').href = `https://wa.me/${c.whatsapp}?text=Olá! Quero comprar uma camiseta.`;
  }
  if (c.instagram || c.email) {
    $('#socials').innerHTML = [c.instagram, c.email].filter(Boolean).join(' · ');
  }
  if (c.cor_secundaria) {
    document.documentElement.style.setProperty('--secondary', c.cor_secundaria);
  }
}

// ============ RENDER PRODUTOS ============
function renderProducts() {
  const grid = $('#productsGrid');
  grid.innerHTML = '';
  state.camisetas.forEach((cam, idx) => {
    const card = document.createElement('div');
    card.className = 'product-card';
    card.innerHTML = `
      <div class="product-canvas" id="canvas-${cam.id}"></div>
      <div class="product-info">
        <h3>${cam.nome}</h3>
        <p>${cam.descricao || ''}</p>
        <div class="product-price">R$ ${Number(cam.preco).toFixed(2).replace('.', ',')}</div>
        <button class="btn-primary" data-buy="${cam.id}">Comprar</button>
      </div>
    `;
    grid.appendChild(card);

    setTimeout(() => initProduct3D(cam), 100 * idx);

    card.querySelector('[data-buy]').onclick = () => {
      const num = state.config.whatsapp;
      if (num) window.open(`https://wa.me/${num}?text=Quero comprar: ${cam.nome}`, '_blank');
      else toast('WhatsApp não configurado');
    };
  });
}

// ============ 3D: TEXTURA PADRONIZADA (fallback procedural) ============
function createProceduralTexture(color, text = '') {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');

  // fundo
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 1024, 1024);

  // textura sutil
  for (let i = 0; i < 3000; i++) {
    const x = Math.random() * 1024;
    const y = Math.random() * 1024;
    ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.03})`;
    ctx.fillRect(x, y, 1, 1);
  }

  // detalhe costura
  ctx.strokeStyle = 'rgba(0,0,0,0.15)';
  ctx.lineWidth = 2;
  ctx.strokeRect(40, 40, 944, 944);

  if (text) {
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.font = 'bold 60px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(text, 512, 512);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 8;
  return tex;
}

async function loadTexture(url, fallbackColor) {
  if (!url) return createProceduralTexture(fallbackColor);
  return new Promise(resolve => {
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin('anonymous');
    loader.load(url, t => {
      t.anisotropy = 8;
      resolve(t);
    }, undefined, () => resolve(createProceduralTexture(fallbackColor)));
  });
}

// ============ GEOMETRIA CAMISETA (custom) ============
function createTshirtGeometry() {
  // Formato simplificado de camiseta via ExtrudeGeometry
  const shape = new THREE.Shape();
  const w = 2.2, h = 3.2, neck = 0.5;
  // corpo + mangas
  shape.moveTo(-w, h/2 - 0.6);
  shape.lineTo(-w - 0.6, h/2);      // ombro esquerdo
  shape.lineTo(-w - 0.8, h/2 - 0.6); // manga esq out
  shape.lineTo(-w - 0.1, 0.4);       // manga esq in
  shape.lineTo(-w + 0.2, 0.4);
  shape.lineTo(-w + 0.3, -h/2 + 0.4); // cintura esq
  shape.lineTo(w - 0.3, -h/2 + 0.4);  // cintura dir
  shape.lineTo(w - 0.2, 0.4);
  shape.lineTo(w + 0.1, 0.4);
  shape.lineTo(w + 0.8, h/2 - 0.6);
  shape.lineTo(w + 0.6, h/2);
  shape.lineTo(w, h/2 - 0.6);
  // gola
  shape.quadraticCurveTo(neck, h/2 - 0.3, 0, h/2 - 0.8);
  shape.quadraticCurveTo(-neck, h/2 - 0.3, -w, h/2 - 0.6);

  const extrude = { depth: 0.25, bevelEnabled: true, bevelSegments: 4, bevelSize: 0.08, bevelThickness: 0.08, curveSegments: 24 };
  const geo = new THREE.ExtrudeGeometry(shape, extrude);
  geo.center();
  return geo;
}

// ============ INIT 3D POR PRODUTO ============
async function initProduct3D(cam) {
  const el = document.getElementById(`canvas-${cam.id}`);
  if (!el) return;

  const scene = new THREE.Scene();
  const w = el.clientWidth;
  const h = el.clientHeight;
  const camera = new THREE.PerspectiveCamera(35, w / h, 0.1, 100);
  camera.position.set(0, 0.4, 7.5);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(w, h);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  el.appendChild(renderer.domElement);

  // Luzes
  const key = new THREE.DirectionalLight(0xffffff, 1.2); key.position.set(3, 4, 5); scene.add(key);
  const fill = new THREE.DirectionalLight(0xffffff, 0.5); fill.position.set(-4, 2, 3); scene.add(fill);
  const rim = new THREE.DirectionalLight(0xd4af37, 0.6); rim.position.set(0, -3, -4); scene.add(rim);
  scene.add(new THREE.AmbientLight(0xffffff, 0.35));

  // Textura principal
  const tex = await loadTexture(cam.textura_principal, cam.cor_base || '#222');
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;

  // Cria camiseta como "manequim" — corpo + camiseta
  const group = new THREE.Group();

  // Manequim (invisível ou corpo base) — esfera/cilindro suave
  const manequimMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.7, metalness: 0.1 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 3.2, 48), manequimMat);
  body.position.y = 0;
  group.add(body);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.8, 32), manequimMat);
  neck.position.y = 2.0;
  group.add(neck);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.5, 32, 32), manequimMat);
  head.position.y = 2.65;
  group.add(head);

  // Camiseta
  const tshirtGeo = createTshirtGeometry();
  const tshirtMat = new THREE.MeshStandardMaterial({
    map: tex,
    color: 0xffffff,
    roughness: 0.85,
    metalness: 0.05,
    side: THREE.DoubleSide
  });
  const tshirt = new THREE.Mesh(tshirtGeo, tshirtMat);
  tshirt.scale.set(1.15, 1.15, 1.15);
  tshirt.position.y = 0.15;
  group.add(tshirt);

  // Manga textura (override)
  if (cam.textura_manga) {
    const mangaTex = await loadTexture(cam.textura_manga, '#111');
    // cria mangas separadas para demonstrar segunda textura
    const mangaGeo = new THREE.BoxGeometry(0.7, 0.6, 0.3);
    const mangaMat = new THREE.MeshStandardMaterial({ map: mangaTex, roughness: 0.9 });
    const mL = new THREE.Mesh(mangaGeo, mangaMat); mL.position.set(-1.5, 0.9, 0); mL.rotation.z = 0.3; group.add(mL);
    const mR = new THREE.Mesh(mangaGeo, mangaMat); mR.position.set(1.5, 0.9, 0); mR.rotation.z = -0.3; group.add(mR);
  }

  scene.add(group);

  // Loop de animação
  const clock = new THREE.Clock();
  const store = { scene, camera, renderer, group, tshirt, tshirtMat, tshirtGeo, destroyed: false };
  state.scenes[cam.id] = store;

  function animate() {
    if (store.destroyed) return;
    requestAnimationFrame(animate);
    const t = clock.getElapsedTime();

    // Rotação contínua + balanço
    group.rotation.y = t * 0.35;
    group.position.y = Math.sin(t * 1.2) * 0.08;

    // Leve ondulação da camiseta
    if (tshirt.geometry.attributes.position) {
      const pos = tshirt.geometry.attributes.position;
      // não deformamos vertices por performance; só rotação/respiração
    }
    tshirt.rotation.z = Math.sin(t * 0.6) * 0.02;

    renderer.render(scene, camera);
  }
  animate();

  // Resize
  const ro = new ResizeObserver(() => {
    const w2 = el.clientWidth, h2 = el.clientHeight;
    if (!w2 || !h2) return;
    camera.aspect = w2 / h2;
    camera.updateProjectionMatrix();
    renderer.setSize(w2, h2);
  });
  ro.observe(el);
}

// ============ HERO 3D (versão grande rotativa) ============
async function initHero() {
  const el = $('#heroCanvas');
  if (!el) return;
  const w = el.clientWidth, h = el.clientHeight;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, w/h, 0.1, 100);
  camera.position.set(0, 0.3, 8);

  const renderer = new THREE.WebGLRenderer({ antialias:true, alpha:true });
  renderer.setSize(w, h);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  el.appendChild(renderer.domElement);

  scene.add(new THREE.AmbientLight(0xffffff, 0.4));
  const k = new THREE.DirectionalLight(0xffffff, 1.2); k.position.set(4,5,6); scene.add(k);
  const r = new THREE.DirectionalLight(0xd4af37, 0.8); r.position.set(-5,2,-3); scene.add(r);

  const group = new THREE.Group();

  // Manequim
  const mat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.6, metalness: 0.2 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 3.4, 48), mat); group.add(body);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.8, 32), mat); neck.position.y = 2.1; group.add(neck);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.55, 32, 32), mat); head.position.y = 2.75; group.add(head);

  // Camiseta inicial
  const tex = createProceduralTexture('#d4af37', 'ELEGANCE');
  const tshirtGeo = createTshirtGeometry();
  const tshirtMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, side: THREE.DoubleSide });
  const tshirt = new THREE.Mesh(tshirtGeo, tshirtMat);
  tshirt.scale.set(1.2, 1.2, 1.2);
  tshirt.position.y = 0.15;
  group.add(tshirt);

  scene.add(group);

  const clock = new THREE.Clock();
  function animate() {
    requestAnimationFrame(animate);
    const t = clock.getElapsedTime();
    group.rotation.y = t * 0.4;
    group.position.y = Math.sin(t * 1.3) * 0.1;
    tshirt.rotation.z = Math.sin(t * 0.7) * 0.03;
    renderer.render(scene, camera);
  }
  animate();

  new ResizeObserver(() => {
    const w2 = el.clientWidth, h2 = el.clientHeight;
    if (!w2 || !h2) return;
    camera.aspect = w2/h2; camera.updateProjectionMatrix(); renderer.setSize(w2, h2);
  }).observe(el);
}

// ============ HEADER / MENU ============
function initUI() {
  window.addEventListener('scroll', () => {
    $('#header').classList.toggle('scrolled', window.scrollY > 50);
  });
  const menuBtn = $('#menuToggle');
  const nav = $('#mainNav');
  menuBtn?.addEventListener('click', () => nav.classList.toggle('open'));
  $$('.nav a').forEach(a => a.addEventListener('click', () => nav.classList.remove('open')));
}

// ============ BOOT ============
document.addEventListener('DOMContentLoaded', async () => {
  initUI();
  initHero();
  await loadSite();
});

// Expõe para admin.js
window.__state = state;
window.__apiPost = apiPost;
window.__apiGet = apiGet;
window.__toast = toast;
window.__loadTexture = loadTexture;
window.__createTshirtGeometry = createTshirtGeometry;
window.__createProceduralTexture = createProceduralTexture;
