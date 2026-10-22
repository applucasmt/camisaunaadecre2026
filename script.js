import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

// ============ CARREGA O GSAP ============
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
  try { const r = await fetch(`${API_URL}?action=${action}`); return await r.json(); } 
  catch (e) { return { ok: false }; }
}
async function apiPost(payload) {
  try {
    const r = await fetch(API_URL, { 
      method: 'POST', 
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }, 
      body: JSON.stringify(payload) 
    });
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
    const canvas = document.createElement('canvas'); 
    canvas.width = 512; canvas.height = 512;
    const ctx = canvas.getContext('2d'); 
    ctx.fillStyle = fallbackColor || '#ffffff'; 
    ctx.fillRect(0, 0, 512, 512);
    const t = new THREE.CanvasTexture(canvas); 
    t.colorSpace = THREE.SRGBColorSpace; 
    t.flipY = false; 
    return t;
  }
  return new Promise(resolve => {
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin('anonymous');
    loader.load(
      finalUrl, 
      t => { 
        t.anisotropy = 16; 
        t.colorSpace = THREE.SRGBColorSpace; 
        t.flipY = false; 
        resolve(t); 
      }, 
      undefined, 
      () => resolve(loadTexture(null, fallbackColor))
    );
  });
}
window.__loadTexture = loadTexture;

// ============ CARREGAMENTO DO MODELO ============
const WHITE_PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
let gltfPromise = null;

function loadAvatarModel() {
  if (gltfPromise) return gltfPromise;
  const manager = new THREE.LoadingManager();
  manager.setURLModifier(url => 
    (/\.(png|jpe?g)$/i.test(url.split('?')[0]) && !url.startsWith('data:') && !url.startsWith('blob:')) 
      ? WHITE_PIXEL 
      : url
  );
  const loader = new GLTFLoader(manager);
  gltfPromise = new Promise((resolve, reject) => {
    loader.load('./camisa.glb', gltf => resolve(gltf.scene), undefined, reject);
  });
  return gltfPromise;
}

// ============ APLICA CORES E TEXTURAS ============
function applyTshirtTexture(root, textures, configs) {
  root.traverse(child => {
    if (!child.isMesh) return;
    const nome = child.name.toLowerCase();
    let tex = null, cfg = null, baseSize = 1.0;

    // Mapeia as partes da camisa
    if (nome.includes('body_front')) { tex = textures.frente; cfg = configs.frente; baseSize = 0.6; }
    else if (nome.includes('body_back')) { tex = textures.costas; cfg = configs.costas; baseSize = 0.6; }
    else if (nome.includes('sleeves')) { tex = textures.manga; cfg = configs.manga; baseSize = 0.2; }
    else if (nome.includes('ribbing')) { tex = textures.gola; cfg = configs.gola; baseSize = 0.15; }
    else { return; } // Ignora o corpo do boneco

    const mats = Array.isArray(child.material) ? child.material : [child.material];
    mats.forEach(mat => {
      mat.metalness = 0.0; 
      mat.roughness = 0.8; 
      mat.side = THREE.DoubleSide;
      mat.vertexColors = false; // Impede que cores originais do GLB sujem a textura
      
      if (tex) {
        tex.center.set(0.5, 0.5); 
        tex.repeat.set(baseSize * (cfg.scale || 1), baseSize * (cfg.scale || 1));
        tex.offset.set(cfg.x || 0, cfg.y || 0);
        tex.flipY = false; 
        
        mat.map = tex; 
        mat.color.setHex(0xffffff); // Mantém a cor da imagem pura
        mat.transparent = false;
      } else { 
        mat.map = null; 
        mat.color.setHex(0xffffff); 
      }
      mat.needsUpdate = true;
    });
  });
}

function applyMannequinColors(root, colors) {
  root.traverse(child => {
    if (!child.isMesh) return;
    const nome = child.name.toLowerCase();
    
    // Identifica o que é camisa para NÃO pintar
    const isShirt = nome.includes('body_front') || nome.includes('body_back') || 
                    nome.includes('sleeves') || nome.includes('ribbing');
    if (isShirt) return;

    let colorHex = colors.corpo || '#e0e0e0';
    if (nome.includes('hair') || nome.includes('cabelo')) colorHex = colors.cabelo || '#222222';
    else if (nome.includes('jeans') || nome.includes('pants') || nome.includes('calca') || 
             nome.includes('leg') || nome.includes('shoe')) colorHex = colors.calca || '#1a1a1a';

    if (colorHex) {
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      mats.forEach(mat => { 
        if (mat.color) mat.color.set(colorHex).convertSRGBToLinear(); 
        mat.map = null; // LIMPA QUALQUER TEXTURA VAZADA DA CAMISA
        mat.vertexColors = false;
        mat.metalness = 0.1; 
        mat.roughness = 0.7;
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
    child.material = Array.isArray(child.material) 
      ? child.material.map(m => m.clone()) 
      : child.material.clone();
  });
  model.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  
  const targetHeight = 2.0;
  const scaleFactor = size.y > 0.0001 ? targetHeight / size.y : 1;

  const wrapper = new THREE.Group();
  const spinner = new THREE.Group();
  spinner.add(model);
  
  spinner.scale.setScalar(scaleFactor);
  spinner.position.set(-center.x * scaleFactor, -box.min.y * scaleFactor, -center.z * scaleFactor);

  wrapper.add(spinner);

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
  
  return { wrapper, spinner, model, textures, configs, mannequinColors };
}

// ============ VIEWER ISOLADO (ADMIN) ============
async function createViewer(el, cam, options = {}) {
  const w = el.clientWidth || 400;
  const h = el.clientHeight || 400;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, w / h, 0.1, 1000);
  camera.position.set(0, 1.5, 3.5);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(w, h);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  el.appendChild(renderer.domElement);

  scene.add(new THREE.AmbientLight(0xffffff, 1.5));
  const key = new THREE.DirectionalLight(0xffffff, 2.5); key.position.set(2, 5, 4); scene.add(key);
  const fill = new THREE.DirectionalLight(0xffffff, 1.2); fill.position.set(-4, 3, 2); scene.add(fill);
  const rim = new THREE.DirectionalLight(0xd4af37, 1.8); rim.position.set(0, 2, -5); scene.add(rim);

  try {
    const { wrapper, model, textures, configs, mannequinColors } = await buildMannequin(cam);
    scene.add(wrapper);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.target.set(0, 1.2, 0); 
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
      camera.aspect = w2 / h2; 
      camera.updateProjectionMatrix(); 
      renderer.setSize(w2, h2);
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
      destroy() { 
        cancelAnimationFrame(animId); 
        ro.disconnect(); 
        controls.dispose(); 
        renderer.dispose(); 
        el.innerHTML = ''; 
      }
    };
  } catch (error) {
    el.innerHTML = '<p style="padding:20px;color:#ff4d4d;text-align:center;">⚠️ Erro ao carregar modelo.</p>';
    return null;
  }
}
window.__createViewer = createViewer;

// ==========================================
// CORE: CÂMERA CINEMATOGRÁFICA E SCROLL
// ==========================================
async function initApp() {
  gsap.registerPlugin(ScrollTrigger);
  
  const data = await apiGet('getAll');
  if (data.ok) {
    state.config = Object.fromEntries(data.config.map(c => [c.CHAVE, c.VALOR]));
    state.camisetas = data.camisetas;
    if(state.camisetas[0]) { document.getElementById('nome-1').textContent = state.camisetas[0].nome; document.getElementById('desc-1').textContent = state.camisetas[0].descricao; }
    if(state.camisetas[1]) { document.getElementById('nome-2').textContent = state.camisetas[1].nome; document.getElementById('desc-2').textContent = state.camisetas[1].descricao; }
    if(state.camisetas[2]) { document.getElementById('nome-3').textContent = state.camisetas[2].nome; document.getElementById('desc-3').textContent = state.camisetas[2].descricao; }
  } else {
    state.camisetas = [
      { id: 1, nome: 'Classic Black', descricao: 'Algodão premium penteado 30.1. Design minimalista que combina com tudo.', cor_base: '#111111', cor_corpo: '#e0e0e0', cor_calca: '#1a1a1a' },
      { id: 2, nome: 'Urban White', descricao: 'Modelagem oversized com toque suave. Peça-chave do guarda-roupa.', cor_base: '#f5f5f5', cor_corpo: '#d4d4d4', cor_calca: '#2a2a2a' },
      { id: 3, nome: 'Gold Edition', descricao: 'Edição limitada com acabamento exclusivo. Detalhes em dourado.', cor_base: '#d4af37', cor_corpo: '#c0c0c0', cor_calca: '#000000' }
    ];
  }

  const container = document.getElementById('webgl-container');
  const scene = new THREE.Scene();
  
  const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 1.3, 3.8); 
  camera.lookAt(0, 1.0, 0);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  // Iluminação
  scene.add(new THREE.AmbientLight(0xffffff, 1.5));
  const key = new THREE.DirectionalLight(0xffffff, 2.5); key.position.set(3, 6, 5); scene.add(key);
  const fill = new THREE.DirectionalLight(0xffffff, 1.2); fill.position.set(-5, 3, 3); scene.add(fill);
  const rim = new THREE.DirectionalLight(0xd4af37, 2.0); rim.position.set(0, 3, -6); scene.add(rim);
  const bottom = new THREE.DirectionalLight(0xffffff, 0.5); bottom.position.set(0, -3, 2); scene.add(bottom);

  const modelsData = [];
  const totalModels = Math.min(3, state.camisetas.length);
  const spacing = 3.5;

  for (let i = 0; i < totalModels; i++) {
    const { wrapper, spinner } = await buildMannequin(state.camisetas[i]);
    
    if (i === 0) wrapper.position.set(0, 0, 0); 
    if (i === 1) wrapper.position.set(spacing, 0, 0); 
    if (i === 2) wrapper.position.set(-spacing, 0, 0); 
    
    scene.add(wrapper);
    modelsData.push({ wrapper, spinner, index: i });
  }

  const camState = { y: 1.3, z: 3.8 };
  const lookState = { y: 1.0 };

  function updateCamera() {
    camera.position.y = THREE.MathUtils.lerp(camera.position.y, camState.y, 0.1);
    camera.position.z = THREE.MathUtils.lerp(camera.position.z, camState.z, 0.1);
    camera.lookAt(0, lookState.y, 0);
    requestAnimationFrame(updateCamera);
  }
  updateCamera();

  // Animações do Scroll
  ScrollTrigger.create({ trigger: "#s2", start: "top bottom", end: "top top", scrub: 1, onUpdate: self => {
    const p = self.progress;
    camState.z = THREE.MathUtils.lerp(3.8, 2.0, p); 
    camState.y = THREE.MathUtils.lerp(1.3, 1.4, p); 
    lookState.y = THREE.MathUtils.lerp(1.0, 1.3, p); 
  }});

  ScrollTrigger.create({ trigger: "#s3", start: "top bottom", end: "top top", scrub: 1, onUpdate: self => {
    modelsData[0].spinner.rotation.y = THREE.MathUtils.lerp(0, Math.PI, self.progress);
  }});

  ScrollTrigger.create({ trigger: "#s4", start: "top bottom", end: "top top", scrub: 1, onUpdate: self => {
    const p = self.progress;
    modelsData[0].wrapper.position.x = THREE.MathUtils.lerp(0, spacing, p);
    if(modelsData[1]) modelsData[1].wrapper.position.x = THREE.MathUtils.lerp(spacing, 0, p);
    modelsData[0].spinner.rotation.y = THREE.MathUtils.lerp(Math.PI, 0, p);
  }});

  ScrollTrigger.create({ trigger: "#s5", start: "top bottom", end: "top top", scrub: 1, onUpdate: self => {
    if(modelsData[1]) modelsData[1].spinner.rotation.y = THREE.MathUtils.lerp(0, Math.PI, self.progress);
  }});

  ScrollTrigger.create({ trigger: "#s6", start: "top bottom", end: "top top", scrub: 1, onUpdate: self => {
    const p = self.progress;
    if(modelsData[1]) modelsData[1].wrapper.position.x = THREE.MathUtils.lerp(0, spacing, p);
    if(modelsData[2]) modelsData[2].wrapper.position.x = THREE.MathUtils.lerp(-spacing, 0, p);
    if(modelsData[1]) modelsData[1].spinner.rotation.y = THREE.MathUtils.lerp(Math.PI, 0, p);
  }});

  ScrollTrigger.create({ trigger: "#s7", start: "top bottom", end: "top top", scrub: 1, onUpdate: self => {
    if(modelsData[2]) modelsData[2].spinner.rotation.y = THREE.MathUtils.lerp(0, Math.PI, self.progress);
  }});

  gsap.utils.toArray('.content-box').forEach(box => {
    ScrollTrigger.create({
      trigger: box, start: "top 80%",
      onEnter: () => box.classList.add('visible'),
      onLeaveBack: () => box.classList.remove('visible')
    });
  });

  const popup = document.getElementById('scrollPopup');
  if (popup) {
    window.addEventListener('scroll', () => {
      if (window.scrollY > 50) popup.classList.add('hidden');
      else popup.classList.remove('hidden');
    });
  }

  function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
  }
  animate();

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    ScrollTrigger.refresh();
  });

  // INICIALIZA O PAINEL ADMINISTRATIVO (CORRIGIDO)
  initAdmin();
}

// ==========================================
// PAINEL ADMINISTRATIVO (RECUPERADO)
// ==========================================
function initAdmin() {
  const ADMIN = { logado: false, abaAtiva: 'config', previewViewer: null };
  
  document.getElementById('lockBtn').onclick = () => {
    if (ADMIN.logado) { 
      document.getElementById('adminPanel').classList.add('active'); 
      renderAdminSidebar(); 
      openAdminTab('config'); 
    } else { 
      document.getElementById('loginModal').classList.add('active'); 
      document.getElementById('senhaInput').focus(); 
    }
  };
  
  document.querySelectorAll('[data-close]').forEach(b => 
    b.addEventListener('click', () => document.getElementById('loginModal').classList.remove('active'))
  );
  
  document.getElementById('loginBtn').onclick = () => {
    if (document.getElementById('senhaInput').value.trim() === String(window.__state.config.admin_senha || '20266')) {
      ADMIN.logado = true; 
      document.getElementById('loginModal').classList.remove('active'); 
      document.getElementById('adminPanel').classList.add('active');
      renderAdminSidebar(); 
      openAdminTab('config'); 
      window.__toast('Bem-vindo!');
    } else { 
      document.getElementById('loginError').textContent = 'Senha incorreta'; 
      setTimeout(() => document.getElementById('loginError').textContent = '', 2500); 
    }
  };
  
  document.getElementById('closeAdmin').onclick = () => { 
    document.getElementById('adminPanel').classList.remove('active'); 
    destroyPreview(); 
  };
  
  function getSenha() { return window.__state.config.admin_senha || '20266'; }
  
  function renderAdminSidebar() {
    const sidebar = document.getElementById('adminSidebar'); 
    sidebar.innerHTML = '';
    [{ id:'config', label:'⚙️ Textos' }, { id:'camisetas', label:'👕 Modelos' }].forEach(t => {
      const btn = document.createElement('button'); 
      btn.textContent = t.label; 
      btn.dataset.tab = t.id;
      btn.onclick = () => openAdminTab(t.id); 
      sidebar.appendChild(btn);
    });
  }
  
  function openAdminTab(tabId) {
    ADMIN.abaAtiva = tabId; 
    document.querySelectorAll('#adminSidebar button').forEach(b => 
      b.classList.toggle('active', b.dataset.tab === tabId)
    );
    const content = document.getElementById('adminContent'); 
    content.innerHTML = ''; 
    destroyPreview();
    if (tabId === 'config') renderConfigTab(content);
    if (tabId === 'camisetas') renderCamisetasTab(content);
  }
  
  function renderConfigTab(container) {
    const c = window.__state.config;
    container.innerHTML = `
      <h2 style="margin-bottom:24px;">Textos</h2>
      <div class="admin-form" id="configForm">
        <div><label>Título</label><input name="titulo_site" value="${c.titulo_site || ''}"></div>
        <button class="btn-primary" id="saveConfigBtn">Salvar</button>
      </div>
    `;
    document.getElementById('saveConfigBtn').onclick = async () => {
      const dados = {}; 
      document.querySelectorAll('#configForm input').forEach(i => dados[i.name] = i.value);
      const r = await window.__apiPost({ action:'updateConfig', senha:getSenha(), dados });
      if (r.ok) { Object.assign(window.__state.config, dados); window.__toast('Salvo!'); }
    };
  }
  
  function renderCamisetasTab(container) {
    container.innerHTML = `
      <h2 style="margin-bottom:24px;">Modelos</h2>
      <div style="display:grid;gap:16px;">
        ${window.__state.camisetas.map(c => `
          <div style="border:1px solid var(--border);border-radius:12px;padding:20px;display:flex;gap:20px;align-items:center;">
            <div style="flex:1;"><strong>${c.nome}</strong></div>
            <button class="btn-ghost" data-tex="${c.id}">Configurar 3D</button>
          </div>
        `).join('')}
      </div>
    `;
    container.querySelectorAll('[data-tex]').forEach(b => 
      b.onclick = () => editCamisetaTexturas(parseInt(b.dataset.tex))
    );
  }
  
  function editCamisetaTexturas(id) {
    const c = window.__state.camisetas.find(x => String(x.id) === String(id));
    const content = document.getElementById('adminContent');
    content.innerHTML = `
      <h2>Texturas: ${c.nome}</h2>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:32px;">
        <div class="admin-form">
          <div><label>Frente</label><input type="file" data-file="frente"></div>
          <div><label>Costas</label><input type="file" data-file="costas"></div>
          <button class="btn-primary">Salvar</button>
          <button class="btn-ghost" id="backTexBtn">← Voltar</button>
        </div>
        <div>
          <div class="preview-3d" id="adminPreview" style="height: 500px; background: #000; border-radius:12px;"></div>
        </div>
      </div>
    `;
    document.getElementById('backTexBtn').onclick = () => { 
      destroyPreview(); 
      openAdminTab('camisetas'); 
    };
    initAdminPreview(c).then(() => { 
      window.__loadTexture(c.textura_principal, c.cor_base).then(t => { 
        if (ADMIN.previewViewer) ADMIN.previewViewer.setTextures(t, null, null, null, ADMIN.previewViewer.configs); 
      }); 
    });
  }
  
  async function initAdminPreview(cam) {
    const el = document.getElementById('adminPreview'); 
    destroyPreview(); 
    await new Promise(r => setTimeout(r, 60));
    ADMIN.previewViewer = await window.__createViewer(el, cam, { autoRotate: true });
  }
  
  function destroyPreview() { 
    if (ADMIN.previewViewer) { 
      ADMIN.previewViewer.destroy(); 
      ADMIN.previewViewer = null; 
    } 
  }
}

initApp();
