import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

// URL DO SEU WEB APP DO GOOGLE APPS SCRIPT
const API_URL = 'https://script.google.com/macros/s/AKfycbyMiP-nbR9_UYZGCA7dtAWIm4HIl2Vg4UeatogPC9f7ORdEZMSEJwU6LggDenh0eqDVug/exec';

const state = { config: {}, camisetas: [], productViewers: {}, modalViewer: null };
window.__state = state;
window.THREE = THREE;

// ============ CARREGAMENTO DO GSAP ============
const gsapScript = document.createElement('script');
gsapScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/gsap.min.js';
gsapScript.onload = () => {
  const stScript = document.createElement('script');
  stScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/ScrollTrigger.min.js';
  stScript.onload = () => initApp();
  document.head.appendChild(stScript);
};
document.head.appendChild(gsapScript);

// ============ HELPERS ============
function toast(msg, isError = false) {
  let el = document.getElementById('toast') || document.createElement('div');
  el.id = 'toast'; el.className = 'toast'; el.textContent = msg;
  el.style.background = isError ? '#ff4d4d' : 'var(--secondary)';
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

// ============ MANIPULAÇÃO DE TEXTURAS E CORES ============
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

// ============ VIEWER INDIVIDUAL (PARA O MODAL E ADMIN) ============
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

    let isEditing = false;
    let currentPart = null;
    let currentTexConfig = null;
    let isDragging = false;
    let prevX = 0, prevY = 0;

    // Eventos para o Painel Admin (Arrastar estampa)
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
      setAutoRotate(v) { controls.autoRotate = v; },
      zoomIn() { controls.dollyIn(1.2); controls.update(); },
      zoomOut() { controls.dollyOut(1.2); controls.update(); },
      resetCamera() { camera.position.set(0, 1.65, 2.5); controls.target.set(0, 1.55, 0); controls.update(); },
      destroy() { cancelAnimationFrame(animId); ro.disconnect(); controls.dispose(); renderer.dispose(); el.innerHTML = ''; }
    };

  } catch (error) {
    console.error(error);
    el.innerHTML = '<p style="padding:20px;color:#ff4d4d;text-align:center;">⚠️ Erro ao carregar modelo.</p>';
    return null;
  }
}
window.__createViewer = createViewer;

// ============ INICIALIZAÇÃO PRINCIPAL E SCROLLTELLING ============
async function initApp() {
  gsap.registerPlugin(ScrollTrigger);
  
  // 1. CARREGA DADOS DA API
  const data = await apiGet('getAll');
  if (data.ok) {
    state.config = Object.fromEntries(data.config.map(c => [c.CHAVE, c.VALOR]));
    state.camisetas = data.camisetas;
    if (state.config.titulo_site) document.getElementById('heroTitle').textContent = state.config.titulo_site;
    if (state.config.subtitulo_site) document.getElementById('heroSub').textContent = state.config.subtitulo_site;
    if (state.config.cta_texto) document.getElementById('cta-btn').textContent = state.config.cta_texto;
  } else {
    state.camisetas = [
      { id: 1, nome: 'Classic Black', descricao: 'Algodão premium', cor_base: '#111111' },
      { id: 2, nome: 'Urban White', descricao: 'Modelagem oversized', cor_base: '#f5f5f5' },
      { id: 3, nome: 'Gold Edition', descricao: 'Edição limitada', cor_base: '#d4af37' }
    ];
  }

  // 2. CONFIGURA O THREE.JS NO FUNDO
  const container = document.getElementById('webgl-container');
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
  
  // Câmera inicial (Visão da frente, enquadrando da cintura pra cima)
  camera.position.set(0, 1.8, 4.0);
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

  // 3. CARREGA OS MANEQUINS LADO A LADO
  const group = new THREE.Group();
  scene.add(group);
  
  const totalModels = Math.min(3, state.camisetas.length);
  const spacing = 3.0; // Espaçamento para não colidirem

  for (let i = 0; i < totalModels; i++) {
    const { wrapper } = await buildMannequin(state.camisetas[i]);
    wrapper.position.x = (i - 1) * spacing; 
    wrapper.position.y = -0.3;
    group.add(wrapper);
  }

  // 4. ANIMAÇÃO CONTÍNUA DE ROTAÇÃO
  function animate() {
    requestAnimationFrame(animate);
    const t = performance.now() * 0.001;
    
    // Gira todos no próprio eixo suavemente
    group.children.forEach(child => {
      child.rotation.y = t * 0.6;
    });

    renderer.render(scene, camera);
  }
  animate();

  // 5. SCROLLTELLING (GSAP - EFEITO APPLE)
  // Textos aparecendo
  gsap.utils.toArray('.content-box').forEach(box => {
    ScrollTrigger.create({
      trigger: box,
      start: "top 85%",
      onEnter: () => box.classList.add('visible'),
      onLeaveBack: () => box.classList.remove('visible')
    });
  });

  // Movimento da câmera baseado na seção
  // Seção 1 (Intro) -> Seção 2 (Giro/Lateral)
  gsap.to(camera.position, {
    scrollTrigger: { trigger: "#section-2", start: "top bottom", end: "top top", scrub: 1 },
    x: -3.5, y: 2.0, z: 5.0
  });

  // Seção 2 -> Seção 3 (Foco no Tecido / Close-up)
  gsap.to(camera.position, {
    scrollTrigger: { trigger: "#section-3", start: "top bottom", end: "top top", scrub: 1 },
    x: 2.5, y: 1.5, z: 2.2
  });

  // Seção 3 -> Seção 4 (Volta ao Centro para o Call to Action)
  gsap.to(camera.position, {
    scrollTrigger: { trigger: "#section-4", start: "top bottom", end: "top top", scrub: 1 },
    x: 0, y: 1.8, z: 4.5
  });

  // Resize
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    ScrollTrigger.refresh();
  });

  // 6. MODAL E ADMIN
  initAdmin();
  initModal();
}

// ============ CONTROLE DO MODAL DE EXPLORAR 3D ============
function initModal() {
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
  document.getElementById('zoomIn').onclick = () => state.modalViewer?.zoomIn();
  document.getElementById('zoomOut').onclick = () => state.modalViewer?.zoomOut();
}

// ============ SISTEMA DE ADMINISTRAÇÃO ============
function initAdmin() {
  const ADMIN = { logado: false, abaAtiva: 'config', previewViewer: null };

  document.getElementById('lockBtn').onclick = () => {
    if (ADMIN.logado) {
      document.getElementById('adminPanel').classList.add('active');
      renderAdminSidebar(); openAdminTab('config');
    } else {
      document.getElementById('loginModal').classList.add('active');
      document.getElementById('senhaInput').focus();
    }
  };

  document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => document.getElementById('loginModal').classList.remove('active')));

  document.getElementById('loginBtn').onclick = () => {
    if (document.getElementById('senhaInput').value.trim() === String(window.__state.config.admin_senha || '20266')) {
      ADMIN.logado = true;
      document.getElementById('loginModal').classList.remove('active');
      document.getElementById('adminPanel').classList.add('active');
      renderAdminSidebar(); openAdminTab('config');
      window.__toast('Bem-vindo!');
    } else {
      document.getElementById('loginError').textContent = 'Senha incorreta';
      setTimeout(() => document.getElementById('loginError').textContent = '', 2500);
    }
  };

  document.getElementById('closeAdmin').onclick = () => {
    document.getElementById('adminPanel').classList.remove('active'); destroyPreview();
  };

  function getSenha() { return window.__state.config.admin_senha || '20266'; }

  function renderAdminSidebar() {
    const sidebar = document.getElementById('adminSidebar');
    sidebar.innerHTML = '';
    [{ id:'config', label:'⚙️ Textos' }, { id:'camisetas', label:'👕 Modelos' }].forEach(t => {
      const btn = document.createElement('button');
      btn.textContent = t.label; btn.dataset.tab = t.id;
      btn.onclick = () => openAdminTab(t.id); sidebar.appendChild(btn);
    });
  }

  function openAdminTab(tabId) {
    ADMIN.abaAtiva = tabId;
    document.querySelectorAll('#adminSidebar button').forEach(b => b.classList.toggle('active', b.dataset.tab === tabId));
    const content = document.getElementById('adminContent');
    content.innerHTML = ''; destroyPreview();
    if (tabId === 'config') renderConfigTab(content);
    if (tabId === 'camisetas') renderCamisetasTab(content);
  }

  function renderConfigTab(container) {
    const c = window.__state.config;
    container.innerHTML = `
      <h2 style="margin-bottom:24px;">Textos do Site</h2>
      <div class="admin-form" id="configForm">
        <div><label>Título</label><input name="titulo_site" value="${c.titulo_site || ''}"></div>
        <div><label>Subtítulo</label><input name="subtitulo_site" value="${c.subtitulo_site || ''}"></div>
        <button class="btn-primary" id="saveConfigBtn">Salvar</button>
      </div>`;
    document.getElementById('saveConfigBtn').onclick = async () => {
      const dados = {}; document.querySelectorAll('#configForm input').forEach(i => dados[i.name] = i.value);
      const r = await window.__apiPost({ action:'updateConfig', senha:getSenha(), dados });
      if (r.ok) { Object.assign(window.__state.config, dados); window.__toast('Salvo!'); }
      else window.__toast('Erro', true);
    };
  }

  function renderCamisetasTab(container) {
    container.innerHTML = `
      <h2 style="margin-bottom:24px;">Modelos (${window.__state.camisetas.length})</h2>
      <div style="display:grid;gap:16px;">
        ${window.__state.camisetas.map(c => `
          <div style="border:1px solid var(--border);border-radius:12px;padding:20px;display:flex;gap:20px;align-items:center;">
            <div style="flex:1;"><strong>${c.nome}</strong></div>
            <button class="btn-ghost" data-tex="${c.id}">Configurar 3D</button>
          </div>
        `).join('')}
      </div>`;
    container.querySelectorAll('[data-tex]').forEach(b => b.onclick = () => editCamisetaTexturas(parseInt(b.dataset.tex)));
  }

  function editCamisetaTexturas(id) {
    const c = window.__state.camisetas.find(x => String(x.id) === String(id));
    const content = document.getElementById('adminContent');
    
    content.innerHTML = `
      <h2 style="margin-bottom:16px;">Texturas: ${c.nome}</h2>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:32px;">
        <div class="admin-form">
          
          <div style="display:flex; gap:10px; margin-bottom:20px; border-bottom:1px solid var(--border); padding-bottom:10px;">
            <button class="btn-ghost tab-main active" id="tabEstampas" style="flex:1;">🎨 Estampas</button>
            <button class="btn-ghost tab-main" id="tabCores" style="flex:1;">👤 Cores do Manequim</button>
          </div>
  
          <div id="contentEstampas">
            <div style="display:flex; gap:10px; margin-bottom:20px; padding:15px; background:rgba(255,255,255,0.05); border-radius:8px;">
              <button class="btn-ghost mode-btn" id="modeRotate" style="flex:1;">🔄 Girar</button>
              <button class="btn-ghost mode-btn active" id="modeEdit" style="flex:1; border-color:var(--secondary); color:var(--secondary);">✏️ Mover Estampa</button>
            </div>
  
            <div style="display:flex; gap:5px; margin-bottom:20px; flex-wrap:wrap;" id="part-buttons">
              <button class="btn-ghost part-btn active" data-part="frente">Frente</button>
              <button class="btn-ghost part-btn" data-part="costas">Costas</button>
              <button class="btn-ghost part-btn" data-part="manga">Mangas</button>
              <button class="btn-ghost part-btn" data-part="gola">Gola</button>
            </div>
  
            <div id="part-inputs">
              ${['frente', 'costas', 'manga', 'gola'].map(part => `
                <div class="upload-zone" data-upload="${part}" style="display:${part==='frente'?'block':'none'};">
                  <input type="file" accept="image/*" data-file="${part}">
                  <p>📤 Upload de Imagem (${part})</p>
                  <p class="upload-status" data-status="${part}" style="color:var(--secondary);font-size:.8rem;"></p>
                </div>
              `).join('')}
            </div>
  
            <div id="edit-instructions" style="margin-top:20px; padding:15px; border:1px dashed var(--secondary); border-radius:8px; text-align:center; background:rgba(212,175,55,0.05);">
              <p style="font-size:0.85rem; color:var(--text-dim); margin-bottom:8px;">Modo Ajuste Ativo</p>
              <strong style="color:var(--secondary); font-size:1.1rem;" id="editLabel">Ajustando: Frente</strong><br>
              <span style="font-size:0.8rem; display:block; margin-top:8px; line-height:1.4;">
                <b>Arraste</b> com o botão esquerdo para mover.<br>
                Role o <b>Scroll</b> para aumentar/diminuir.
              </span>
            </div>
  
            <button class="btn-primary" id="saveTexSettings" style="margin-top:20px;">Salvar Ajustes de Estampa</button>
          </div>
  
          <div id="contentCores" style="display:none;">
            <p style="color:var(--text-dim); font-size:.9rem; margin-bottom:20px;">Altere a cor do corpo, cabelo e calça do manequim.</p>
            
            <div style="display:flex; flex-direction:column; gap:15px;">
              <div style="display:flex; justify-content:space-between; align-items:center; background:var(--bg-alt); padding:15px; border-radius:8px;">
                <label>Cor do Corpo</label>
                <input type="color" id="colorCorpo" value="${c.cor_corpo || '#e0e0e0'}" style="width:50px; height:40px; border:none; border-radius:5px; cursor:pointer;">
              </div>
              <div style="display:flex; justify-content:space-between; align-items:center; background:var(--bg-alt); padding:15px; border-radius:8px;">
                <label>Cor do Cabelo</label>
                <input type="color" id="colorCabelo" value="${c.cor_cabelo || '#333333'}" style="width:50px; height:40px; border:none; border-radius:5px; cursor:pointer;">
              </div>
              <div style="display:flex; justify-content:space-between; align-items:center; background:var(--bg-alt); padding:15px; border-radius:8px;">
                <label>Cor da Calça</label>
                <input type="color" id="colorCalca" value="${c.cor_calca || '#ffffff'}" style="width:50px; height:40px; border:none; border-radius:5px; cursor:pointer;">
              </div>
            </div>
  
            <button class="btn-primary" id="saveColorSettings" style="margin-top:20px;">Salvar Cores</button>
          </div>
  
          <button class="btn-ghost" id="backTexBtn" style="margin-top:20px;">← Voltar</button>
        </div>
        <div><div class="preview-3d" id="adminPreview" style="height: 500px; background: #000; border-radius: 12px; overflow: hidden;"></div></div>
      </div>`;
  
    document.getElementById('backTexBtn').onclick = () => { destroyPreview(); openAdminTab('camisetas'); };
  
    const tabEstampas = document.getElementById('tabEstampas');
    const tabCores = document.getElementById('tabCores');
    const contentEstampas = document.getElementById('contentEstampas');
    const contentCores = document.getElementById('contentCores');
  
    tabEstampas.onclick = () => {
      tabEstampas.classList.add('active'); tabCores.classList.remove('active');
      contentEstampas.style.display = 'block'; contentCores.style.display = 'none';
    };
    tabCores.onclick = () => {
      tabCores.classList.add('active'); tabEstampas.classList.remove('active');
      contentCores.style.display = 'block'; contentEstampas.style.display = 'none';
    };
  
    const updateColors = () => {
      if (!ADMIN.previewViewer) return;
      ADMIN.previewViewer.setMannequinColors({
        corpo: document.getElementById('colorCorpo').value,
        cabelo: document.getElementById('colorCabelo').value,
        calca: document.getElementById('colorCalca').value
      });
    };
    document.getElementById('colorCorpo').oninput = updateColors;
    document.getElementById('colorCabelo').oninput = updateColors;
    document.getElementById('colorCalca').oninput = updateColors;
  
    document.getElementById('saveColorSettings').onclick = async () => {
      const dados = {
        cor_corpo: document.getElementById('colorCorpo').value,
        cor_cabelo: document.getElementById('colorCabelo').value,
        cor_calca: document.getElementById('colorCalca').value
      };
      const r = await window.__apiPost({ action:'updateCamiseta', senha:getSenha(), id: c.id, dados });
      if(r.ok) { Object.assign(c, dados); window.__toast('Cores salvas com sucesso!'); }
      else window.__toast('Erro ao salvar.', true);
    };
  
    let currentPart = 'frente';
    let isEditMode = true;
  
    const btnRotate = document.getElementById('modeRotate');
    const btnEdit = document.getElementById('modeEdit');
    const instructions = document.getElementById('edit-instructions');
  
    const setMode = (edit) => {
      isEditMode = edit;
      btnRotate.classList.toggle('active', !edit);
      btnEdit.classList.toggle('active', edit);
      instructions.style.opacity = edit ? '1' : '0.3';
      instructions.style.display = edit ? 'block' : 'none';
      
      if (ADMIN.previewViewer) {
        if (!edit) ADMIN.previewViewer.setEditingMode(null); 
        else ADMIN.previewViewer.setEditingMode(currentPart); 
      }
    };
  
    btnRotate.onclick = () => setMode(false);
    btnEdit.onclick = () => setMode(true);
  
    const partBtns = document.querySelectorAll('.part-btn');
    partBtns.forEach(btn => {
      btn.onclick = () => {
        partBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentPart = btn.dataset.part;
        
        document.querySelectorAll('.upload-zone').forEach(z => z.style.display = 'none');
        document.querySelector(`[data-upload="${currentPart}"]`).style.display = 'block';
        document.getElementById('editLabel').textContent = `Ajustando: ${currentPart.charAt(0).toUpperCase() + currentPart.slice(1)}`;
        
        if (ADMIN.previewViewer && isEditMode) {
          ADMIN.previewViewer.setEditingMode(currentPart);
        }
      };
    });
  
    ['frente', 'costas', 'manga', 'gola'].forEach(part => {
      setupUpload(c, part, () => {});
    });
  
    document.getElementById('saveTexSettings').onclick = async () => {
      if (!ADMIN.previewViewer) return;
      const cfg = ADMIN.previewViewer.configs;
      const dados = {
        scale_frente: cfg.frente.scale, x_frente: cfg.frente.x, y_frente: cfg.frente.y,
        scale_costas: cfg.costas.scale, x_costas: cfg.costas.x, y_costas: cfg.costas.y,
        scale_manga: cfg.manga.scale, x_manga: cfg.manga.x, y_manga: cfg.manga.y,
        scale_gola: cfg.gola.scale
      };
      const r = await window.__apiPost({ action:'updateCamiseta', senha:getSenha(), id: c.id, dados });
      if(r.ok) { Object.assign(c, dados); window.__toast('Ajustes de estampa salvos!'); }
      else window.__toast('Erro', true);
    };
  
    initAdminPreview(c).then(() => {
      Promise.all([
        window.__loadTexture(c.textura_principal, c.cor_base),
        window.__loadTexture(c.textura_costas, c.cor_base),
        window.__loadTexture(c.textura_manga, c.cor_base),
        window.__loadTexture(c.textura_gola, c.cor_base)
      ]).then(([f, cB, m, g]) => {
        ADMIN.previewViewer.setTextures(f, cB, m, g, ADMIN.previewViewer.configs);
        setMode(true);
      });
    });
  }

  function setupUpload(cam, tipo, cb) {
    const zone = document.querySelector(`[data-upload="${tipo}"]`);
    const input = document.querySelector(`[data-file="${tipo}"]`);
    const status = document.querySelector(`[data-status="${tipo}"]`);
    
    zone.onclick = () => input.click();
    input.onchange = async () => {
      if (!input.files[0]) return;
      status.textContent = 'Enviando...';
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const dataUrl = ev.target.result;
        const tex = new THREE.TextureLoader().load(dataUrl);
        tex.colorSpace = THREE.SRGBColorSpace; tex.flipY = false;
        
        if (ADMIN.previewViewer) {
          const currentTextures = ADMIN.previewViewer.textures;
          currentTextures[tipo] = tex;
          ADMIN.previewViewer.setTextures(currentTextures.frente, currentTextures.costas, currentTextures.manga, currentTextures.gola, ADMIN.previewViewer.configs);
        }
  
        const base64 = dataUrl.split(',')[1];
        const r = await window.__apiPost({
          action:'uploadImagem', senha:getSenha(), camiseta_id: cam.id, tipo, base64,
          filename: input.files[0].name, mimeType: input.files[0].type
        });
        
        if (r.ok) {
          const campo = tipo === 'frente' ? 'textura_principal' : tipo === 'costas' ? 'textura_costas' : `textura_${tipo}`;
          cam[campo] = r.url;
          status.textContent = '✓ Salva!';
          window.__toast('Imagem enviada!');
        } else status.textContent = '✗ Erro';
      };
      reader.readAsDataURL(input.files[0]);
    };
  }

  async function initAdminPreview(cam) {
    const el = document.getElementById('adminPreview');
    destroyPreview();
    await new Promise(r => setTimeout(r, 60));
    ADMIN.previewViewer = await window.__createViewer(el, cam, { autoRotate: false });
  }

  function destroyPreview() {
    if (ADMIN.previewViewer) { ADMIN.previewViewer.destroy(); ADMIN.previewViewer = null; }
  }
}
