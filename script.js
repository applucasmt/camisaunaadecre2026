import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

// CARREGA O GSAP (SCROLLTELLING)
const gsapScript = document.createElement('script');
gsapScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/gsap.min.js';
gsapScript.onload = () => {
  const stScript = document.createElement('script');
  stScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/ScrollTrigger.min.js';
  stScript.onload = () => initApp();
  document.head.appendChild(stScript);
};
document.head.appendChild(gsapScript);

const API_URL = 'https://script.google.com/macros/s/AKfycbyMiP-nbR9_UYZGCA7dtAWIm4HIl2Vg4UeatogPC9f7ORdEZMSEJwU6LggDenh0eqDVug/exec';
const state = { config: {}, camisetas: [], modalViewer: null };
window.__state = state;
window.THREE = THREE;

// ============ HELPERS ============
function toast(msg, isError = false) {
  let el = document.getElementById('toast') || document.createElement('div');
  el.id = 'toast'; el.className = 'toast'; el.textContent = msg;
  el.style.background = isError ? '#ff4d4d' : 'var(--accent)';
  document.body.appendChild(el);
  setTimeout(() => el.classList.add('show'), 10);
  setTimeout(() => el.classList.remove('show'), 3000);
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

// ============ MANIPULAÇÃO DE TEXTURAS ============
function applyTshirtTexture(root, textures, configs) {
  root.traverse(child => {
    if (!child.isMesh) return;
    const nome = child.name.toLowerCase();
    let tex = null, cfg = null, baseSize = 1.0;

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
      } else { mat.map = null; mat.color.set(0xffffff); }
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
      mats.forEach(mat => { if (mat.color) mat.color.set(colorHex).convertSRGBToLinear(); mat.needsUpdate = true; });
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

// ============ VIEWER ISOLADO (ADMIN) ============
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
    controls.enablePan = false;
    controls.autoRotate = options.autoRotate !== false;
    controls.autoRotateSpeed = 1.5;

    let animId;
    function animate() {
      animId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    }
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
      setMannequinColors(colors) { Object.assign(mannequinColors, colors); applyMannequinColors(model, mannequinColors); },
      setEditingMode(part) { controls.enabled = !part; if (part) controls.autoRotate = false; },
      destroy() { cancelAnimationFrame(animId); ro.disconnect(); controls.dispose(); renderer.dispose(); el.innerHTML = ''; }
    };
  } catch (error) {
    el.innerHTML = '<p style="padding:20px;color:#ff4d4d;text-align:center;">⚠️ Erro.</p>';
    return null;
  }
}
window.__createViewer = createViewer;

// ==========================================
// CORE: SCROLLTELLING APPLE (CÂMERA FIXA E GIRO NO ALVO)
// ==========================================
async function initApp() {
  gsap.registerPlugin(ScrollTrigger);
  
  // 1. Carrega API
  const data = await apiGet('getAll');
  if (data.ok) {
    state.config = Object.fromEntries(data.config.map(c => [c.CHAVE, c.VALOR]));
    state.camisetas = data.camisetas;
    if(state.camisetas[0]) { document.getElementById('nome-1').textContent = state.camisetas[0].nome; document.getElementById('desc-1').textContent = state.camisetas[0].descricao; }
    if(state.camisetas[1]) { document.getElementById('nome-2').textContent = state.camisetas[1].nome; document.getElementById('desc-2').textContent = state.camisetas[1].descricao; }
    if(state.camisetas[2]) { document.getElementById('nome-3').textContent = state.camisetas[2].nome; document.getElementById('desc-3').textContent = state.camisetas[2].descricao; }
  } else {
    state.camisetas = [
      { id: 1, nome: 'Classic Black', descricao: 'Algodão premium', cor_base: '#111111' },
      { id: 2, nome: 'Urban White', descricao: 'Modelagem oversized', cor_base: '#f5f5f5' },
      { id: 3, nome: 'Gold Edition', descricao: 'Edição limitada', cor_base: '#d4af37' }
    ];
  }

  // 2. Configura Three.js Base
  const container = document.getElementById('webgl-container');
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
  
  // Câmera começa no centro, bem longe e alta
  camera.position.set(0, 2.5, 7.0); 
  camera.lookAt(0, 1.5, 0);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  container.appendChild(renderer.domElement);

  // Luzes
  scene.add(new THREE.AmbientLight(0xffffff, 1.5));
  const key = new THREE.DirectionalLight(0xffffff, 2.0); key.position.set(2, 5, 4); scene.add(key);
  const fill = new THREE.DirectionalLight(0xffffff, 1.0); fill.position.set(-4, 3, 2); scene.add(fill);
  const rim = new THREE.DirectionalLight(0xd4af37, 1.5); rim.position.set(0, 2, -5); scene.add(rim);

  // 3. CARREGA OS 3 MANEQUINS NAS EXTREMIDADES
  const group = new THREE.Group();
  scene.add(group);
  
  const totalModels = Math.min(3, state.camisetas.length);
  // POSICIONAMENTO LATERAL: Esquerda (-4), Centro (0), Direita (4)
  const spacing = 4.5; 

  for (let i = 0; i < totalModels; i++) {
    const { wrapper } = await buildMannequin(state.camisetas[i]);
    
    if (i === 0) wrapper.position.set(0, -0.3, 0); // Centro
    if (i === 1) wrapper.position.set(spacing, -0.3, 0); // Direita
    if (i === 2) wrapper.position.set(-spacing, -0.3, 0); // Esquerda
    
    group.add(wrapper);
  }

  // 4. Rotação Contínua dos manequins no próprio eixo
  function animate() {
    requestAnimationFrame(animate);
    const t = performance.now() * 0.001;
    
    group.children.forEach(child => {
      child.rotation.y = t * 0.5; // Gira em torno do eixo Y
    });

    renderer.render(scene, camera);
  }
  animate();

  // ==========================================
  // 5. SCROLLTELLING (CÂMERA FIXA, APENAS OLHAR PARA OS LADOS)
  // ==========================================
  gsap.utils.toArray('.content-box').forEach(box => {
    ScrollTrigger.create({
      trigger: box,
      start: "top 80%",
      onEnter: () => box.classList.add('visible'),
      onLeaveBack: () => box.classList.remove('visible')
    });
  });

  // Variáveis para suavizar o olhar (LookAt)
  const lookAtTarget = { x: 0, y: 1.6, z: 0 };

  const tl = gsap.timeline({
    scrollTrigger: {
      trigger: ".scroll-container",
      start: "top top",
      end: "bottom bottom",
      scrub: 1,
    }
  });

  // Seção 1 (Intro) -> Seção 2 (Foco no Centro)
  tl.to(camera.position, { z: 3.5, y: 2.0, scrollTrigger: { trigger: "#s2", start: "top bottom", end: "top top", scrub: 1 } })
    .to(lookAtTarget, { x: 0, y: 1.8, z: 0, onUpdate: () => camera.lookAt(lookAtTarget.x, lookAtTarget.y, lookAtTarget.z), scrollTrigger: { trigger: "#s2", start: "top bottom", end: "top top", scrub: 1 } }, "<");

  // Seção 2 -> Seção 3 (Olha para a Direita)
  tl.to(lookAtTarget, { x: spacing, y: 1.8, z: 0, onUpdate: () => camera.lookAt(lookAtTarget.x, lookAtTarget.y, lookAtTarget.z), scrollTrigger: { trigger: "#s3", start: "top bottom", end: "top top", scrub: 1 } });

  // Seção 3 -> Seção 4 (Olha para a Esquerda)
  tl.to(lookAtTarget, { x: -spacing, y: 1.8, z: 0, onUpdate: () => camera.lookAt(lookAtTarget.x, lookAtTarget.y, lookAtTarget.z), scrollTrigger: { trigger: "#s4", start: "top bottom", end: "top top", scrub: 1 } });

  // Resize
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    ScrollTrigger.refresh();
  });

  initAdmin();
}

// ==========================================
// PAINEL ADMINISTRATIVO (MANTIDO)
// ==========================================
function initAdmin() {
  const ADMIN = { logado: false, abaAtiva: 'config', previewViewer: null };
  document.getElementById('lockBtn').onclick = () => {
    if (ADMIN.logado) { document.getElementById('adminPanel').classList.add('active'); renderAdminSidebar(); openAdminTab('config'); } 
    else { document.getElementById('loginModal').classList.add('active'); document.getElementById('senhaInput').focus(); }
  };
  document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => document.getElementById('loginModal').classList.remove('active')));
  document.getElementById('loginBtn').onclick = () => {
    if (document.getElementById('senhaInput').value.trim() === String(window.__state.config.admin_senha || '20266')) {
      ADMIN.logado = true; document.getElementById('loginModal').classList.remove('active'); document.getElementById('adminPanel').classList.add('active');
      renderAdminSidebar(); openAdminTab('config'); window.__toast('Bem-vindo!');
    } else { document.getElementById('loginError').textContent = 'Senha incorreta'; setTimeout(() => document.getElementById('loginError').textContent = '', 2500); }
  };
  document.getElementById('closeAdmin').onclick = () => { document.getElementById('adminPanel').classList.remove('active'); destroyPreview(); };
  function getSenha() { return window.__state.config.admin_senha || '20266'; }
  function renderAdminSidebar() {
    const sidebar = document.getElementById('adminSidebar'); sidebar.innerHTML = '';
    [{ id:'config', label:'⚙️ Textos' }, { id:'camisetas', label:'👕 Modelos' }].forEach(t => {
      const btn = document.createElement('button'); btn.textContent = t.label; btn.dataset.tab = t.id;
      btn.onclick = () => openAdminTab(t.id); sidebar.appendChild(btn);
    });
  }
  function openAdminTab(tabId) {
    ADMIN.abaAtiva = tabId; document.querySelectorAll('#adminSidebar button').forEach(b => b.classList.toggle('active', b.dataset.tab === tabId));
    const content = document.getElementById('adminContent'); content.innerHTML = ''; destroyPreview();
    if (tabId === 'config') renderConfigTab(content);
    if (tabId === 'camisetas') renderCamisetasTab(content);
  }
  function renderConfigTab(container) {
    const c = window.__state.config;
    container.innerHTML = `<h2 style="margin-bottom:24px;">Textos</h2><div class="admin-form" id="configForm"><div><label>Título</label><input name="titulo_site" value="${c.titulo_site || ''}"></div><button class="btn-primary" id="saveConfigBtn">Salvar</button></div>`;
    document.getElementById('saveConfigBtn').onclick = async () => {
      const dados = {}; document.querySelectorAll('#configForm input').forEach(i => dados[i.name] = i.value);
      const r = await window.__apiPost({ action:'updateConfig', senha:getSenha(), dados });
      if (r.ok) { Object.assign(window.__state.config, dados); window.__toast('Salvo!'); }
    };
  }
  function renderCamisetasTab(container) {
    container.innerHTML = `<h2 style="margin-bottom:24px;">Modelos</h2><div style="display:grid;gap:16px;">${window.__state.camisetas.map(c => `<div style="border:1px solid var(--border);border-radius:12px;padding:20px;display:flex;gap:20px;align-items:center;"><div style="flex:1;"><strong>${c.nome}</strong></div><button class="btn-ghost" data-tex="${c.id}">Configurar 3D</button></div>`).join('')}</div>`;
    container.querySelectorAll('[data-tex]').forEach(b => b.onclick = () => editCamisetaTexturas(parseInt(b.dataset.tex)));
  }
  function editCamisetaTexturas(id) {
    const c = window.__state.camisetas.find(x => String(x.id) === String(id));
    const content = document.getElementById('adminContent');
    content.innerHTML = `<h2>Texturas: ${c.nome}</h2><div style="display:grid;grid-template-columns:1fr 1fr;gap:32px;"><div class="admin-form"><div><label>Frente</label><input type="file" data-file="frente"></div><div><label>Costas</label><input type="file" data-file="costas"></div><button class="btn-primary">Salvar</button><button class="btn-ghost" id="backTexBtn">← Voltar</button></div><div><div class="preview-3d" id="adminPreview" style="height: 400px; background: #000;"></div></div></div>`;
    document.getElementById('backTexBtn').onclick = () => { destroyPreview(); openAdminTab('camisetas'); };
    initAdminPreview(c).then(() => { window.__loadTexture(c.textura_principal, c.cor_base).then(t => { ADMIN.previewViewer.setTextures(t, null, null, null, ADMIN.previewViewer.configs); }); });
  }
  async function initAdminPreview(cam) {
    const el = document.getElementById('adminPreview'); destroyPreview(); await new Promise(r => setTimeout(r, 60));
    ADMIN.previewViewer = await window.__createViewer(el, cam, { autoRotate: true });
  }
  function destroyPreview() { if (ADMIN.previewViewer) { ADMIN.previewViewer.destroy(); ADMIN.previewViewer = null; } }
}

initApp();
