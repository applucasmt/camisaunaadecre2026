import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

const API_URL = 'https://script.google.com/macros/s/AKfycbyMiP-nbR9_UYZGCA7dtAWIm4HIl2Vg4UeatogPC9f7ORdEZMSEJwU6LggDenh0eqDVug/exec';
const state = { config: {}, camisetas: [], modalViewer: null, isAdminLogado: false, adminViewer: null, isLoaded: false };
window.__state = state;
window.THREE = THREE;

// ==========================================
// TELA DE CARREGAMENTO (ORBE NEURAL 3D)
// ==========================================
function initLoadingScreen() {
  const container = document.getElementById('orb-container');
  const barFill = document.getElementById('loadingBarFill');
  const percentText = document.getElementById('loadingPercent');
  const screen = document.getElementById('loadingScreen');

  const w = container.clientWidth || 300;
  const h = container.clientHeight || 300;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 100);
  camera.position.z = 4;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(w, h);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);

  const particleCount = 300;
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(particleCount * 3);
  
  for (let i = 0; i < particleCount * 3; i++) {
    positions[i] = (Math.random() - 0.5) * 3;
  }
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const material = new THREE.PointsMaterial({
    color: 0xd4af37,
    size: 0.05,
    transparent: true,
    opacity: 0.6,
    blending: THREE.AdditiveBlending
  });

  const particles = new THREE.Points(geometry, material);
  scene.add(particles);

  const coreGeo = new THREE.IcosahedronGeometry(1, 3);
  const coreMat = new THREE.MeshBasicMaterial({ 
    color: 0xd4af37, 
    wireframe: true, 
    transparent: true, 
    opacity: 0.3 
  });
  const core = new THREE.Mesh(coreGeo, coreMat);
  scene.add(core);

  let currentProgress = 0;
  let targetProgress = 0;

  function animateOrb() {
    requestAnimationFrame(animateOrb);
    
    particles.rotation.x -= 0.002;
    particles.rotation.y += 0.003;
    core.rotation.x += 0.005;
    core.rotation.y -= 0.005;

    currentProgress += (targetProgress - currentProgress) * 0.05;
    const pulse = 1 + Math.sin(Date.now() * 0.005) * 0.05 + (currentProgress * 0.5);
    core.scale.set(pulse, pulse, pulse);

    const p = Math.min(100, Math.floor(currentProgress * 100));
    if (barFill) barFill.style.width = `${p}%`;
    if (percentText) percentText.textContent = `${p}%`;

    renderer.render(scene, camera);
  }
  animateOrb();

  return {
    setProgress: (val) => { targetProgress = Math.max(0, Math.min(1, val)); },
    finish: () => {
      targetProgress = 1;
      setTimeout(() => {
        if (screen) screen.classList.add('hidden');
        setTimeout(() => { if(screen) screen.remove(); }, 800);
      }, 500);
    }
  };
}

// ==========================================
// HELPERS E ENVIO DE DADOS
// ==========================================
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
    const formData = new URLSearchParams();
    formData.append('payload', JSON.stringify(payload));
    const r = await fetch(API_URL, {
      method: 'POST',
      body: formData.toString(),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' }
    });
    return await r.json();
  } catch (e) {
    return { ok: false, error: 'Sem resposta do servidor (' + (e && e.message ? e.message : e) + ')' };
  }
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
    loader.load(finalUrl, 
      t => { t.anisotropy = 16; t.colorSpace = THREE.SRGBColorSpace; t.flipY = false; resolve(t); }, 
      undefined, 
      () => resolve(loadTexture(null, fallbackColor))
    );
  });
}
window.__loadTexture = loadTexture;

// ==========================================
// APLICAÇÃO DE TEXTURAS E CORES
// ==========================================
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

function applyTshirtTexture(root, textures, configs, corBase) {
  root.traverse(child => {
    if (!child.isMesh) return;
    const nome = child.name.toLowerCase();
    let tex = null, cfg = null, baseSize = 1.0;

    if (nome.includes('body_front')) { tex = textures.frente; cfg = configs.frente; baseSize = 0.6; }
    else if (nome.includes('body_back')) { tex = textures.costas; cfg = configs.costas; baseSize = 0.6; }
    else if (nome.includes('sleeves')) { tex = textures.manga; cfg = configs.manga; baseSize = 0.2; }
    else if (nome.includes('ribbing') || nome.includes('gola')) { tex = textures.gola; cfg = configs.gola; baseSize = 0.15; }
    else { return; }

    const mats = Array.isArray(child.material) ? child.material : [child.material];
    mats.forEach(mat => {
      mat.metalness = 0.0; 
      mat.roughness = 0.8; 
      mat.side = THREE.DoubleSide;
      mat.vertexColors = false; 
      
      if (tex) {
        tex.center.set(0.5, 0.5); 
        tex.repeat.set(baseSize * (cfg.scale || 1), baseSize * (cfg.scale || 1));
        tex.offset.set(cfg.x || 0, cfg.y || 0);
        tex.flipY = false; 
        mat.map = tex; 
        mat.color.setHex(0xffffff);
      } else { 
        mat.map = null; 
        mat.color.set(corBase || '#ffffff'); 
      }
      mat.needsUpdate = true;
    });
  });
}

const COR_PADRAO = {
  corpo: '#e0e0e0', cabelo: '#333333', calca: '#1a1a1a', sapato: '#ffffff', olhos: '#ffffff'
};

function isShirtMesh(nome) {
  return nome.includes('body_front') || nome.includes('body_back') ||
         nome.includes('sleeves') || nome.includes('ribbing') || nome.includes('gola');
}

function classifyPart(meshName, matName) {
  if (isShirtMesh(meshName)) return 'camiseta';
  if (meshName.includes('stitch')) return 'costura';
  if (matName.includes('eyelash') || meshName.includes('eyelash')) return 'cilios';
  if (matName === 'eye' || meshName.startsWith('eye')) return 'olhos';
  if (matName.includes('tooth') || meshName.includes('tooth')) return 'dentes';
  if (meshName.includes('shoe') || matName.includes('sneaker') || matName.includes('shoe')) return 'sapato';
  if (meshName.includes('hair') || meshName.includes('cabelo') || matName === 'defaultmat1') return 'cabelo';
  if (matName.includes('denim') || matName === 'material744700' ||
      meshName.startsWith('hp1') || meshName.startsWith('pattern2d') || meshName.startsWith('matshape') ||
      meshName.includes('jeans') || meshName.includes('pants') || meshName.includes('calca')) return 'calca';
  if (['face', 'body2', 'arm', 'leg'].includes(matName) || meshName.startsWith('body')) return 'corpo';
  return null;
}

function applyMannequinColors(root, colors) {
  const c = Object.assign({}, COR_PADRAO, colors);
  const parts = {
    corpo:  { cor: c.corpo,  rough: 0.7,  metal: 0.1 },
    cabelo: { cor: c.cabelo, rough: 0.7,  metal: 0.1 },
    calca:  { cor: c.calca,  rough: 0.9,  metal: 0.0 },
    sapato: { cor: c.sapato, rough: 0.7,  metal: 0.1 },
    olhos:  { cor: c.olhos,  rough: 0.15, metal: 0.0 },
    cilios: { cor: c.cabelo, rough: 0.8,  metal: 0.0 },
    dentes: { cor: '#ffffff', rough: 0.5, metal: 0.0 }
  };

  const colorMgmt = !!(THREE.ColorManagement && THREE.ColorManagement.enabled);

  root.traverse(child => {
    if (!child.isMesh) return;
    const meshName = child.name.toLowerCase();
    const mats = Array.isArray(child.material) ? child.material : [child.material];

    mats.forEach(mat => {
      const matName = (mat.name || '').toLowerCase();
      const parte = classifyPart(meshName, matName);
      const cfg = parte && parts[parte];
      if (!cfg) return;

      if (mat.color) {
        mat.color.set(cfg.cor);
        if (!colorMgmt) mat.color.convertSRGBToLinear();
      }
      mat.map = null;
      mat.vertexColors = false;
      mat.metalness = cfg.metal;
      mat.roughness = cfg.rough;
      mat.needsUpdate = true;
    });
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
    gola: { scale: parseFloat(cam.scale_gola)||1, x: parseFloat(cam.x_gola)||0, y: parseFloat(cam.y_gola)||0 }
  };

  const mannequinColors = {
    corpo: cam.cor_corpo || '#e0e0e0',
    cabelo: cam.cor_cabelo || '#333333',
    calca: cam.cor_calca || '#1a1a1a',
    sapato: cam.cor_sapato || '#ffffff',
    olhos: cam.cor_olho || '#ffffff'
  };

  applyTshirtTexture(model, textures, configs, cam.cor_base);
  applyMannequinColors(model, mannequinColors);
  
  return { wrapper, spinner, model, textures, configs, mannequinColors };
}

// ==========================================
// INICIALIZAÇÃO DO SITE
// ==========================================
async function initApp(loader) {
  const data = await apiGet('getAll');
  loader.setProgress(0.3);

  if (data.ok) {
    state.config = Object.fromEntries(data.config.map(c => [c.CHAVE, c.VALOR]));
    state.camisetas = data.camisetas;
    
    // Lógica para atualizar textos e exibir artes no site
    for (let i = 0; i < 3; i++) {
      if(state.camisetas[i]) { 
        const el = document.getElementById(`nome-${i+1}`); if(el) el.textContent = state.camisetas[i].nome; 
        const ed = document.getElementById(`desc-${i+1}`); if(ed) ed.textContent = state.camisetas[i].descricao; 
        
        // CORREÇÃO: Busca a imagem correta que está no HTML
        const imgArteF = document.getElementById(`arteFrenteSite-${i+1}`);
        const imgArteV = document.getElementById(`arteVersoSite-${i+1}`);
        
        if(imgArteF && state.camisetas[i].arte_frente) {
          imgArteF.src = state.camisetas[i].arte_frente;
          imgArteF.style.display = 'block';
        }
        if(imgArteV && state.camisetas[i].arte_verso) {
          imgArteV.src = state.camisetas[i].arte_verso;
          imgArteV.style.display = 'block';
        }
      }
    }
  } else {
    state.camisetas = [
      { id: 1, nome: 'Classic Black', descricao: 'Algodão premium penteado 30.1.', cor_base: '#111111', cor_corpo: '#e0e0e0', cor_calca: '#1a1a1a' },
      { id: 2, nome: 'Urban White', descricao: 'Modelagem oversized com toque suave.', cor_base: '#f5f5f5', cor_corpo: '#d4d4d4', cor_calca: '#2a2a2a' },
      { id: 3, nome: 'Gold Edition', descricao: 'Edição limitada com detalhes em dourado.', cor_base: '#d4af37', cor_corpo: '#c0c0c0', cor_calca: '#000000' }
    ];
  }
  
  loader.setProgress(0.5);

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
    
    loader.setProgress(0.5 + ((i + 1) / totalModels) * 0.4);
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

  if (window.gsap && window.ScrollTrigger) {
    gsap.registerPlugin(ScrollTrigger);

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
  }

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
    if (window.ScrollTrigger) ScrollTrigger.refresh();
  });

  loader.setProgress(0.95);
  initAdminPanel();
  loader.finish();
}

// ==========================================
// PAINEL ADMINISTRATIVO
// ==========================================
function initAdminPanel() {
  const lockBtn = document.getElementById('lockBtn');
  const loginModal = document.getElementById('loginModal');
  const adminPanel = document.getElementById('adminPanel');

  if (lockBtn) {
    lockBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      if (state.isAdminLogado) {
        adminPanel.classList.add('active');
        renderAdminSidebar(); 
        openAdminTab('config');
      } else {
        loginModal.classList.add('active');
        const input = document.getElementById('senhaInput');
        if (input) input.focus();
      }
    });
  }

  document.querySelectorAll('[data-close]').forEach(b => {
    b.addEventListener('click', () => loginModal.classList.remove('active'));
  });

  const loginBtn = document.getElementById('loginBtn');
  if (loginBtn) {
    loginBtn.addEventListener('click', () => {
      const senha = document.getElementById('senhaInput').value.trim();
      const senhaCorreta = String(state.config.admin_senha || '20266');
      
      if (senha === senhaCorreta) {
        state.isAdminLogado = true;
        loginModal.classList.remove('active');
        adminPanel.classList.add('active');
        renderAdminSidebar(); 
        openAdminTab('config');
        toast('Bem-vindo, Admin!', false);
      } else {
        const err = document.getElementById('loginError');
        if (err) {
          err.textContent = 'Senha incorreta';
          setTimeout(() => err.textContent = '', 2500);
        }
      }
    });
  }

  const closeAdmin = document.getElementById('closeAdmin');
  if (closeAdmin) {
    closeAdmin.addEventListener('click', () => {
      adminPanel.classList.remove('active');
      destroyAdminPreview();
    });
  }

  function renderAdminSidebar() {
    const sidebar = document.getElementById('adminSidebar');
    sidebar.innerHTML = '';
    [{ id:'config', label:'⚙️ Textos' }, { id:'camisetas', label:'👕 Modelos' }].forEach(t => {
      const btn = document.createElement('button');
      btn.textContent = t.label; btn.dataset.tab = t.id;
      btn.onclick = () => openAdminTab(t.id); 
      sidebar.appendChild(btn);
    });
  }

  function openAdminTab(tabId) {
    document.querySelectorAll('#adminSidebar button').forEach(b => b.classList.toggle('active', b.dataset.tab === tabId));
    const content = document.getElementById('adminContent');
    content.innerHTML = ''; 
    destroyAdminPreview();
    
    if (tabId === 'config') renderConfigTab(content);
    if (tabId === 'camisetas') renderCamisetasTab(content);
  }

  function renderConfigTab(container) {
    const c = state.config;
    container.innerHTML = `
      <h2 style="margin-bottom:24px;">Textos</h2>
      <div class="admin-form" id="configForm">
        <div><label>Título do Site</label><input name="titulo_site" value="${c.titulo_site || ''}"></div>
        <div><label>Senha do Admin</label><input name="admin_senha" value="${c.admin_senha || ''}"></div>
        <button class="btn-primary" id="saveConfigBtn">Salvar Configurações</button>
      </div>
    `;
    document.getElementById('saveConfigBtn').onclick = async () => {
      const dados = {}; 
      document.querySelectorAll('#configForm input').forEach(i => dados[i.name] = i.value);
      const r = await apiPost({ action:'updateConfig', senha: c.admin_senha || '20266', dados });
      if (r.ok) { Object.assign(state.config, dados); toast('Salvo!', false); }
      else toast('Erro', true);
    };
  }

  function renderCamisetasTab(container) {
    container.innerHTML = `
      <h2 style="margin-bottom:24px;">Modelos Cadastrados</h2>
      <div style="display:grid;gap:16px;">
        ${state.camisetas.map(c => `
          <div style="border:1px solid var(--border);border-radius:12px;padding:20px;display:flex;gap:20px;align-items:center;">
            <div style="flex:1;">
              <strong style="display:block; font-size:1.1rem;">${c.nome}</strong>
              <span style="font-size:0.85rem; color:var(--text-dim);">${c.descricao || 'Sem descrição'}</span>
            </div>
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
    const c = state.camisetas.find(x => String(x.id) === String(id));
    const content = document.getElementById('adminContent');
    
    const cBase = c.cor_base || '#ffffff';
    const cCorpo = c.cor_corpo || '#e0e0e0';
    const cCabelo = c.cor_cabelo || '#333333';
    const cCalca = c.cor_calca || '#1a1a1a';
    const cSapato = c.cor_sapato || '#ffffff';
    const cOlhos = c.cor_olho || '#ffffff';

    content.innerHTML = `
      <h2>Configurar: ${c.nome}</h2>
      
      <div style="background: #1a1a1a; border: 1px solid var(--accent); padding: 16px; border-radius: 12px; margin-bottom: 24px; display:flex; gap:20px; align-items:center;">
        <div style="font-size: 24px;">🖱️</div>
        <div style="flex:1; font-size:0.9rem; line-height:1.4;">
          <strong style="color:var(--accent);">Controles Interativos:</strong><br>
          <b>Botão Esquerdo (Arrastar):</b> Move a textura.<br>
          <b>Scroll do Mouse:</b> Zoom na textura.<br>
          <b>Botão Direito:</b> Gira o manequim.
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:32px;">
        
        <div class="admin-form">
          
          <div style="background: #111; padding: 16px; border-radius: 12px; border: 1px solid var(--border);">
            <h3 style="margin-bottom: 12px; font-size: 1rem; color: var(--accent);">Frente da Camisa</h3>
            <div><label>URL / Base64</label><input type="text" id="urlFrente" value="${c.textura_principal || ''}"></div>
            <div style="margin-top:8px;"><label>Upload Local</label><input type="file" id="fileFrente" accept="image/*"></div>
          </div>

          <div style="background: #111; padding: 16px; border-radius: 12px; border: 1px solid var(--border);">
            <h3 style="margin-bottom: 12px; font-size: 1rem; color: var(--accent);">Costas da Camisa</h3>
            <div><label>URL / Base64</label><input type="text" id="urlCostas" value="${c.textura_costas || ''}"></div>
            <div style="margin-top:8px;"><label>Upload Local</label><input type="file" id="fileCostas" accept="image/*"></div>
          </div>

          <div style="background: #111; padding: 16px; border-radius: 12px; border: 1px solid var(--border);">
            <h3 style="margin-bottom: 12px; font-size: 1rem; color: var(--accent);">Mangas</h3>
            <div><label>URL / Base64</label><input type="text" id="urlManga" value="${c.textura_manga || ''}"></div>
            <div style="margin-top:8px;"><label>Upload Local</label><input type="file" id="fileManga" accept="image/*"></div>
          </div>

          <div style="background: #111; padding: 16px; border-radius: 12px; border: 1px solid var(--border);">
            <h3 style="margin-bottom: 12px; font-size: 1rem; color: var(--accent);">Gola</h3>
            <div><label>URL / Base64</label><input type="text" id="urlGola" value="${c.textura_gola || ''}"></div>
            <div style="margin-top:8px;"><label>Upload Local</label><input type="file" id="fileGola" accept="image/*"></div>
          </div>

          <!-- NOVA FUNÇÃO: ARTE FRENTE E VERSO PARA EXIBIÇÃO -->
          <div style="background: #111; padding: 16px; border-radius: 12px; border: 1px solid var(--accent);">
            <h3 style="margin-bottom: 12px; font-size: 1rem; color: var(--accent);">Arte de Exibição (Frente e Verso)</h3>
            <p style="font-size:0.8rem; color:var(--text-dim); margin-bottom:12px;">Essas imagens aparecem ao lado do manequim no site.</p>
            
            <div style="display:flex; gap:16px;">
              <div style="flex:1">
                <label>Arte Frente</label>
                <input type="text" id="urlArteFrente" value="${c.arte_frente || ''}">
                <input type="file" id="fileArteFrente" accept="image/*" style="margin-top:8px;">
              </div>
              <div style="flex:1">
                <label>Arte Verso</label>
                <input type="text" id="urlArteVerso" value="${c.arte_verso || ''}">
                <input type="file" id="fileArteVerso" accept="image/*" style="margin-top:8px;">
              </div>
            </div>
          </div>

          <div style="background: #111; padding: 16px; border-radius: 12px; border: 1px solid var(--border);">
            <h3 style="margin-bottom: 12px; font-size: 1rem; color: var(--accent);">Cores do Manequim</h3>
            <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:8px; margin-bottom:8px;">
              <div style="flex:1"><label>Corpo</label><input type="color" id="corCorpo" value="${cCorpo}" style="height:40px; padding:4px; cursor:pointer; width:100%"></div>
              <div style="flex:1"><label>Cabelo</label><input type="color" id="corCabelo" value="${cCabelo}" style="height:40px; padding:4px; cursor:pointer; width:100%"></div>
              <div style="flex:1"><label>Calça</label><input type="color" id="corCalca" value="${cCalca}" style="height:40px; padding:4px; cursor:pointer; width:100%"></div>
              <div style="flex:1"><label>Sapato</label><input type="color" id="corSapato" value="${cSapato}" style="height:40px; padding:4px; cursor:pointer; width:100%"></div>
              <div style="flex:1"><label>Olhos</label><input type="color" id="corOlhos" value="${cOlhos}" style="height:40px; padding:4px; cursor:pointer; width:100%"></div>
            </div>
            <div><label>Cor Base (Fundo)</label><input type="color" id="corBase" value="${cBase}" style="height:40px; padding:4px; cursor:pointer; width:100%"></div>
          </div>

          <button class="btn-primary" id="saveCamisetaBtn" style="margin-top:10px;">Salvar Alterações</button>
          <button class="btn-ghost" id="backTexBtn">← Voltar</button>
        </div>

        <div>
          <div class="preview-3d" id="adminPreview" style="height: 100%; min-height: 500px; background: #000; border-radius:12px; overflow:hidden; position:relative;">
            <!-- CONTAINER DA ARTE LATERAL NO ADMIN -->
            <div id="arteLateralContainer" style="position:absolute; left:20px; top:50%; transform:translateY(-50%); display:flex; flex-direction:column; gap:10px; z-index:10; pointer-events:none;">
              <img id="displayArteFrente" src="" style="max-width:120px; border-radius:8px; border:1px solid var(--border); display:none;">
              <img id="displayArteVerso" src="" style="max-width:120px; border-radius:8px; border:1px solid var(--border); display:none;">
            </div>
          </div>
        </div>
      </div>
    `;

    document.getElementById('backTexBtn').onclick = () => { 
      destroyAdminPreview(); 
      openAdminTab('camisetas'); 
    };

    initAdminPreview(c).then(() => {
      if(!state.adminViewer) return;

      // Atualiza as artes visuais laterais
      const updateArteVisual = () => {
        const urlF = document.getElementById('urlArteFrente').value;
        const urlV = document.getElementById('urlArteVerso').value;
        
        const imgF = document.getElementById('displayArteFrente');
        const imgV = document.getElementById('displayArteVerso');
        
        if (urlF) { imgF.src = urlF; imgF.style.display = 'block'; } else { imgF.style.display = 'none'; }
        if (urlV) { imgV.src = urlV; imgV.style.display = 'block'; } else { imgV.style.display = 'none'; }
      };

      updateArteVisual();
      document.getElementById('urlArteFrente').oninput = updateArteVisual;
      document.getElementById('urlArteVerso').oninput = updateArteVisual;

      ['corCorpo', 'corCabelo', 'corCalca', 'corSapato', 'corOlhos'].forEach(id => {
        document.getElementById(id).oninput = () => {
          state.adminViewer.setColors({
            corpo: document.getElementById('corCorpo').value,
            cabelo: document.getElementById('corCabelo').value,
            calca: document.getElementById('corCalca').value,
            sapato: document.getElementById('corSapato').value,
            olhos: document.getElementById('corOlhos').value
          });
        };
      });

      document.getElementById('corBase').oninput = () => {
        state.adminViewer.setTextures(null, null, null, null, state.adminViewer.getConfigs(), document.getElementById('corBase').value);
      };

      const handleUpload = async (e, inputId, textureKey) => {
        const file = e.target.files[0];
        if (file) {
          const base64 = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(reader.result);
          });

          loadTexture(base64, c.cor_base).then(t => {
            const args = { frente: [t, null, null, null], costas: [null, t, null, null], manga: [null, null, t, null], gola: [null, null, null, t] }[textureKey];
            if(args) state.adminViewer.setTextures(...args, state.adminViewer.getConfigs(), document.getElementById('corBase').value);
          });

          toast('Enviando imagem...', false);
          const r = await apiPost({
            action: 'uploadImagem',
            senha: state.config.admin_senha || '20266',
            camiseta_id: c.id,
            tipo: textureKey,
            base64: base64,
            filename: file.name,
            mimeType: file.type
          });

          if (r.ok) {
            document.getElementById(inputId).value = r.url;
            if (textureKey === 'arte_frente' || textureKey === 'arte_verso') {
              updateArteVisual();
            }
            toast('Imagem salva no Drive!', false);
          } else {
            toast('Erro ao salvar imagem: ' + (r.error || 'Desconhecido'), true);
          }
        }
      };

      document.getElementById('fileFrente').onchange = (e) => handleUpload(e, 'urlFrente', 'frente');
      document.getElementById('fileCostas').onchange = (e) => handleUpload(e, 'urlCostas', 'costas');
      document.getElementById('fileManga').onchange = (e) => handleUpload(e, 'urlManga', 'manga');
      document.getElementById('fileGola').onchange = (e) => handleUpload(e, 'urlGola', 'gola');
      document.getElementById('fileArteFrente').onchange = (e) => handleUpload(e, 'urlArteFrente', 'arte_frente');
      document.getElementById('fileArteVerso').onchange = (e) => handleUpload(e, 'urlArteVerso', 'arte_verso');

      const handleUrl = (e, textureKey) => {
        loadTexture(e.target.value, c.cor_base).then(t => {
          const args = { frente: [t, null, null, null], costas: [null, t, null, null], manga: [null, null, t, null], gola: [null, null, null, t] }[textureKey];
          if(args) state.adminViewer.setTextures(...args, state.adminViewer.getConfigs(), document.getElementById('corBase').value);
        });
      };
      document.getElementById('urlFrente').onchange = (e) => handleUrl(e, 'frente');
      document.getElementById('urlCostas').onchange = (e) => handleUrl(e, 'costas');
      document.getElementById('urlManga').onchange = (e) => handleUrl(e, 'manga');
      document.getElementById('urlGola').onchange = (e) => handleUrl(e, 'gola');

      document.getElementById('saveCamisetaBtn').onclick = async () => {
        const cfgFrente = state.adminViewer.getConfigs().frente;
        const cfgCostas = state.adminViewer.getConfigs().costas;
        const cfgManga = state.adminViewer.getConfigs().manga;
        const cfgGola = state.adminViewer.getConfigs().gola;

        const dados = {
          textura_principal: document.getElementById('urlFrente').value,
          textura_costas: document.getElementById('urlCostas').value,
          textura_manga: document.getElementById('urlManga').value,
          textura_gola: document.getElementById('urlGola').value,
          arte_frente: document.getElementById('urlArteFrente').value,
          arte_verso: document.getElementById('urlArteVerso').value,
          x_frente: cfgFrente.x, y_frente: cfgFrente.y, scale_frente: cfgFrente.scale,
          x_costas: cfgCostas.x, y_costas: cfgCostas.y, scale_costas: cfgCostas.scale,
          x_manga: cfgManga.x, y_manga: cfgManga.y, scale_manga: cfgManga.scale,
          x_gola: cfgGola.x, y_gola: cfgGola.y, scale_gola: cfgGola.scale,
          cor_corpo: document.getElementById('corCorpo').value,
          cor_cabelo: document.getElementById('corCabelo').value,
          cor_calca: document.getElementById('corCalca').value,
          cor_sapato: document.getElementById('corSapato').value,
          cor_olho: document.getElementById('corOlhos').value,
          cor_base: document.getElementById('corBase').value
        };

        ['textura_principal', 'textura_costas', 'textura_manga', 'textura_gola', 'arte_frente', 'arte_verso'].forEach(k => {
          if (String(dados[k] || '').startsWith('data:')) delete dados[k];
        });

        toast('Salvando...', false);
        const r = await apiPost({ action:'updateCamiseta', senha: state.config.admin_senha || '20266', id: c.id, dados });
        if (r.ok) {
          Object.assign(c, dados);
          toast('Modelo salvo com sucesso!', false);
        } else {
          toast('Erro ao salvar: ' + (r.error || 'sem detalhes'), true);
        }
      };
    });
  }

  async function initAdminPreview(cam) {
    const el = document.getElementById('adminPreview'); 
    destroyAdminPreview(); 
    await new Promise(r => setTimeout(r, 60));
    state.adminViewer = await createAdminViewer(el, cam);
  }

  function destroyAdminPreview() { 
    if (state.adminViewer) { 
      state.adminViewer.destroy(); 
      state.adminViewer = null; 
    } 
  }
}

// ==========================================
// PREVIEW 3D EXCLUSIVO DO ADMIN
// ==========================================
async function createAdminViewer(el, cam) {
  const w = el.clientWidth || 400;
  const h = el.clientHeight || 400;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, w / h, 0.1, 1000);
  camera.position.set(0, 1.4, 3.0);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(w, h);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  el.appendChild(renderer.domElement);

  scene.add(new THREE.AmbientLight(0xffffff, 1.5));
  const key = new THREE.DirectionalLight(0xffffff, 2.5); key.position.set(2, 5, 4); scene.add(key);
  const fill = new THREE.DirectionalLight(0xffffff, 1.2); fill.position.set(-4, 3, 2); scene.add(fill);
  const rim = new THREE.DirectionalLight(0xd4af37, 1.8); rim.position.set(0, 2, -5); scene.add(rim);

  try {
    const { wrapper, spinner, model, textures, configs, mannequinColors } = await buildMannequin(cam);
    scene.add(wrapper);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;
    controls.target.set(0, 1.2, 0); 
    controls.enablePan = false;
    controls.enableZoom = false; 
    
    controls.mouseButtons = {
      LEFT: null, 
      MIDDLE: null,
      RIGHT: THREE.MOUSE.ROTATE
    };

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    let isDraggingTexture = false;
    let previousMousePosition = { x: 0, y: 0 };
    
    let meshFrente = null, meshCostas = null, meshManga = null, meshGola = null;
    
    model.traverse(child => {
      if (child.isMesh) {
        const nome = child.name.toLowerCase();
        if (nome.includes('body_front')) meshFrente = child;
        if (nome.includes('body_back')) meshCostas = child;
        if (nome.includes('sleeves')) meshManga = child;
        if (nome.includes('ribbing') || nome.includes('gola')) meshGola = child;
      }
    });

    const domElement = renderer.domElement;
    
    function getTargetFace(event) {
      const rect = domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      
      const intersects = raycaster.intersectObjects([meshFrente, meshCostas, meshManga, meshGola].filter(Boolean), true);
      if (intersects.length > 0) {
        const hit = intersects[0].object;
        const nome = hit.name.toLowerCase();
        if (nome.includes('body_front')) return { type: 'frente' };
        if (nome.includes('body_back')) return { type: 'costas' };
        if (nome.includes('sleeves')) return { type: 'manga' };
        if (nome.includes('ribbing') || nome.includes('gola')) return { type: 'gola' };
      }
      return null;
    }

    domElement.addEventListener('mousedown', (e) => {
      if (e.button === 0) { 
        const target = getTargetFace(e);
        if (target) {
          isDraggingTexture = true;
          previousMousePosition = { x: e.clientX, y: e.clientY };
          domElement.style.cursor = 'grabbing';
        }
      }
    });

    domElement.addEventListener('mousemove', (e) => {
      if (isDraggingTexture) {
        const target = getTargetFace(e);
        if (target) {
          const type = target.type;
          const tex = textures[type];
          const cfg = configs[type];

          if (tex) {
            const deltaX = (e.clientX - previousMousePosition.x) / w;
            const deltaY = (e.clientY - previousMousePosition.y) / h;
            
            cfg.x -= deltaX * 1.5; 
            cfg.y += deltaY * 1.5;
            
            tex.offset.set(cfg.x, cfg.y);
            previousMousePosition = { x: e.clientX, y: e.clientY };
          }
        }
      }
    });

    domElement.addEventListener('mouseup', () => {
      isDraggingTexture = false;
      domElement.style.cursor = 'default';
    });

    domElement.addEventListener('wheel', (e) => {
      const target = getTargetFace(e);
      if (target) {
        e.preventDefault(); 
        const type = target.type;
        const tex = textures[type];
        const cfg = configs[type];

        if (tex) {
          const zoomFactor = 0.05;
          if (e.deltaY < 0) cfg.scale += zoomFactor;
          else cfg.scale -= zoomFactor;
          
          cfg.scale = Math.max(0.1, Math.min(5, cfg.scale));
          
          let bSize = 0.6;
          if(type === 'manga') bSize = 0.2;
          if(type === 'gola') bSize = 0.15;

          tex.repeat.set(bSize * cfg.scale, bSize * cfg.scale);
        }
      }
    });

    domElement.addEventListener('contextmenu', e => e.preventDefault());

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
      setTextures(f, c, m, g, cfgs, corBase) {
        if(f) { textures.frente = f; configs.frente.x = 0; configs.frente.y = 0; configs.frente.scale = 1; }
        if(c) { textures.costas = c; configs.costas.x = 0; configs.costas.y = 0; configs.costas.scale = 1; }
        if(m) { textures.manga = m; configs.manga.x = 0; configs.manga.y = 0; configs.manga.scale = 1; }
        if(g) { textures.gola = g; configs.gola.x = 0; configs.gola.y = 0; configs.gola.scale = 1; }
        
        Object.assign(configs, cfgs);
        applyTshirtTexture(model, textures, configs, corBase);
      },
      setColors(colors) {
        Object.assign(mannequinColors, colors);
        applyMannequinColors(model, mannequinColors);
      },
      getConfigs() {
        return configs;
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
    el.innerHTML = '<p style="padding:20px;color:#ff4d4d;text-align:center;">⚠️ Erro.</p>';
    return null;
  }
}

// ==========================================
// GSAP E BOOT
// ==========================================
function loadGSAP() {
  return new Promise((resolve, reject) => {
    if (window.gsap && window.ScrollTrigger) return resolve();
    
    const scriptGsap = document.createElement('script');
    scriptGsap.src = 'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/gsap.min.js';
    scriptGsap.onload = () => {
      const scriptST = document.createElement('script');
      scriptST.src = 'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/ScrollTrigger.min.js';
      scriptST.onload = resolve;
      scriptST.onerror = reject;
      document.head.appendChild(scriptST);
    };
    scriptGsap.onerror = reject;
    document.head.appendChild(scriptGsap);
  });
}

// INICIA O LOADING SCREEN E DEPOIS O APP
document.addEventListener('DOMContentLoaded', () => {
  const loader = initLoadingScreen();
  loader.setProgress(0.1);

  loadGSAP().then(() => {
    loader.setProgress(0.25);
    initApp(loader);
  }).catch(err => {
    console.error('Erro ao carregar GSAP:', err);
    initApp(loader);
  });
});
