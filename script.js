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

function applyMannequinColors(root, colors) {
  root.traverse(child => {
    if (!child.isMesh) return;
    const nome = child.name.toLowerCase();
    
    const isShirt = nome.includes('body_front') || nome.includes('body_back') || 
                    nome.includes('sleeves') || nome.includes('ribbing') || nome.includes('gola');
    if (isShirt) return;

    let colorHex = colors.corpo || '#e0e0e0';
    if (nome.includes('hair') || nome.includes('cabelo')) colorHex = colors.cabelo || '#222222';
    else if (nome.includes('jeans') || nome.includes('pants') || nome.includes('calca') || 
             nome.includes('leg')) colorHex = colors.calca || '#1a1a1a';
    else if (nome.includes('shoe') || nome.includes('tenis') || nome.includes('sapato')) colorHex = colors.sapato || '#ffffff';

    if (colorHex) {
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      mats.forEach(mat => { 
        if (mat.color) mat.color.set(colorHex).convertSRGBToLinear(); 
        mat.map = null; 
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
    gola: { scale: parseFloat(cam.scale_gola)||1, x: parseFloat(cam.x_gola)||0, y: parseFloat(cam.y_gola)||0 }
  };

  const mannequinColors = {
    corpo: cam.cor_corpo || '#e0e0e0',
    cabelo: cam.cor_cabelo || '#333333',
    calca: cam.cor_calca || '#1a1a1a',
    sapato: cam.cor_sapato || '#ffffff'
  };

  applyTshirtTexture(model, textures, configs, cam.cor_base);
  applyMannequinColors(model, mannequinColors);
  
  return { wrapper, spinner, model, textures, configs, mannequinColors };
}

// ============ VIEWER ISOLADO (ADMIN COM EDIÇÃO INTERATIVA) ============
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
      
      const intersects = raycaster.intersectObjects([meshFrente, meshCostas, meshManga, meshGola], true);
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
          if (e.deltaY < 0) {
            cfg.scale += zoomFactor;
          } else {
            cfg.scale -= zoomFactor;
          }
          cfg.scale = Math.max(0.1, Math.min(5, cfg.scale));
          
          // Calcula o baseSize correto dependendo da parte
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
    el.innerHTML = '<p style="padding:20px;color:#ff4d4d;text-align:center;">⚠️ Erro ao carregar modelo.</p>';
    return null;
  }
}
window.__createViewer = createAdminViewer; 

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
      { id: 1, nome: 'Classic Black', descricao: 'Algodão premium penteado 30.1.', cor_base: '#111111', cor_corpo: '#e0e0e0', cor_calca: '#1a1a1a' },
      { id: 2, nome: 'Urban White', descricao: 'Modelagem oversized com toque suave.', cor_base: '#f5f5f5', cor_corpo: '#d4d4d4', cor_calca: '#2a2a2a' },
      { id: 3, nome: 'Gold Edition', descricao: 'Edição limitada com detalhes em dourado.', cor_base: '#d4af37', cor_corpo: '#c0c0c0', cor_calca: '#000000' }
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

  initAdmin();
}

// ==========================================
// PAINEL ADMINISTRATIVO (COM CONTROLES INTERATIVOS E BASE64)
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
        <div><label>Título do Site</label><input name="titulo_site" value="${c.titulo_site || ''}"></div>
        <div><label>Senha do Admin</label><input name="admin_senha" value="${c.admin_senha || ''}"></div>
        <button class="btn-primary" id="saveConfigBtn">Salvar Configurações</button>
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
      <h2 style="margin-bottom:24px;">Modelos Cadastrados</h2>
      <div style="display:grid;gap:16px;">
        ${window.__state.camisetas.map(c => `
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
  
  // ==========================================
  // EDIÇÃO INTERATIVA (MOUSE) E CONVERSÃO BASE64
  // ==========================================
  
  // Função para converter imagem para Base64
  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result);
      reader.onerror = error => reject(error);
    });
  }

  function editCamisetaTexturas(id) {
    const c = window.__state.camisetas.find(x => String(x.id) === String(id));
    const content = document.getElementById('adminContent');
    
    content.innerHTML = `
      <h2>Configurar: ${c.nome}</h2>
      
      <div style="background: #1a1a1a; border: 1px solid var(--accent); padding: 16px; border-radius: 12px; margin-bottom: 24px; display:flex; gap:20px; align-items:center;">
        <div style="font-size: 24px;">🖱️</div>
        <div style="flex:1; font-size:0.9rem; line-height:1.4;">
          <strong style="color:var(--accent);">Controles Interativos:</strong><br>
          <b>Botão Esquerdo (Arrastar):</b> Move a textura da parte clicada.<br>
          <b>Scroll do Mouse (na peça):</b> Aumenta/Diminui o zoom.<br>
          <b>Botão Direito (Arrastar):</b> Gira o manequim.
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:32px;">
        
        <div class="admin-form">
          
          <!-- TEXTURA FRENTE -->
          <div style="background: #111; padding: 16px; border-radius: 12px; border: 1px solid var(--border);">
            <h3 style="margin-bottom: 12px; font-size: 1rem; color: var(--accent);">Textura Frente</h3>
            <div><label>URL da Imagem (ou Base64)</label><input type="text" id="urlFrente" value="${c.textura_principal || ''}" placeholder="https://..."></div>
            <div style="margin-top:8px;"><label>Upload Local</label><input type="file" id="fileFrente" accept="image/*"></div>
          </div>

          <!-- TEXTURA COSTAS -->
          <div style="background: #111; padding: 16px; border-radius: 12px; border: 1px solid var(--border);">
            <h3 style="margin-bottom: 12px; font-size: 1rem; color: var(--accent);">Textura Costas</h3>
            <div><label>URL da Imagem (ou Base64)</label><input type="text" id="urlCostas" value="${c.textura_costas || ''}" placeholder="https://..."></div>
            <div style="margin-top:8px;"><label>Upload Local</label><input type="file" id="fileCostas" accept="image/*"></div>
          </div>

          <!-- TEXTURA MANGA -->
          <div style="background: #111; padding: 16px; border-radius: 12px; border: 1px solid var(--border);">
            <h3 style="margin-bottom: 12px; font-size: 1rem; color: var(--accent);">Textura Mangas</h3>
            <div><label>URL da Imagem (ou Base64)</label><input type="text" id="urlManga" value="${c.textura_manga || ''}" placeholder="https://..."></div>
            <div style="margin-top:8px;"><label>Upload Local</label><input type="file" id="fileManga" accept="image/*"></div>
          </div>

          <!-- TEXTURA GOLA -->
          <div style="background: #111; padding: 16px; border-radius: 12px; border: 1px solid var(--border);">
            <h3 style="margin-bottom: 12px; font-size: 1rem; color: var(--accent);">Textura Gola</h3>
            <div><label>URL da Imagem (ou Base64)</label><input type="text" id="urlGola" value="${c.textura_gola || ''}" placeholder="https://..."></div>
            <div style="margin-top:8px;"><label>Upload Local</label><input type="file" id="fileGola" accept="image/*"></div>
          </div>

          <!-- CORES DO MANEQUIM -->
          <div style="background: #111; padding: 16px; border-radius: 12px; border: 1px solid var(--border);">
            <h3 style="margin-bottom: 12px; font-size: 1rem; color: var(--accent);">Cores do Manequim</h3>
            <div style="display:flex; gap:8px; margin-bottom:8px;">
              <div style="flex:1"><label>Corpo</label><input type="color" id="corCorpo" value="${c.cor_corpo || '#e0e0e0'}" style="height:40px; padding:4px; cursor:pointer;"></div>
              <div style="flex:1"><label>Cabelo</label><input type="color" id="corCabelo" value="${c.cor_cabelo || '#333333'}" style="height:40px; padding:4px; cursor:pointer;"></div>
              <div style="flex:1"><label>Calça</label><input type="color" id="corCalca" value="${c.cor_calca || '#1a1a1a'}" style="height:40px; padding:4px; cursor:pointer;"></div>
              <div style="flex:1"><label>Sapato</label><input type="color" id="corSapato" value="${c.cor_sapato || '#ffffff'}" style="height:40px; padding:4px; cursor:pointer;"></div>
            </div>
            <div><label>Cor Base (Fundo se não tiver textura)</label><input type="color" id="corBase" value="${c.cor_base || '#ffffff'}" style="height:40px; padding:4px; cursor:pointer; width:100%"></div>
          </div>

          <button class="btn-primary" id="saveCamisetaBtn" style="margin-top:10px;">Salvar Alterações</button>
          <button class="btn-ghost" id="backTexBtn">← Voltar</button>
        </div>

        <div>
          <div class="preview-3d" id="adminPreview" style="height: 100%; min-height: 500px; background: #000; border-radius:12px; overflow:hidden;"></div>
        </div>
      </div>
    `;

    document.getElementById('backTexBtn').onclick = () => { 
      destroyPreview(); 
      openAdminTab('camisetas'); 
    };

    initAdminPreview(c).then(() => {
      if(!ADMIN.previewViewer) return;

      // Cores em tempo real
      ['corCorpo', 'corCabelo', 'corCalca', 'corSapato'].forEach(id => {
        document.getElementById(id).oninput = () => {
          ADMIN.previewViewer.setColors({
            corpo: document.getElementById('corCorpo').value,
            cabelo: document.getElementById('corCabelo').value,
            calca: document.getElementById('corCalca').value,
            sapato: document.getElementById('corSapato').value
          });
        };
      });

      document.getElementById('corBase').oninput = () => {
        ADMIN.previewViewer.setTextures(null, null, null, null, ADMIN.previewViewer.configs, document.getElementById('corBase').value);
      };

      // Uploads com Base64 (Resolve o problema do blob)
      const handleUpload = async (e, inputId, textureKey) => {
        const file = e.target.files[0];
        if (file) {
          const base64 = await fileToBase64(file);
          document.getElementById(inputId).value = base64; // Salva o Base64 no input
          
          window.__loadTexture(base64, c.cor_base).then(t => {
            const args = { frente: [t, null, null, null], costas: [null, t, null, null], manga: [null, null, t, null], gola: [null, null, null, t] }[textureKey];
            ADMIN.previewViewer.setTextures(...args, ADMIN.previewViewer.configs, document.getElementById('corBase').value);
          });
        }
      };

      document.getElementById('fileFrente').onchange = (e) => handleUpload(e, 'urlFrente', 'frente');
      document.getElementById('fileCostas').onchange = (e) => handleUpload(e, 'urlCostas', 'costas');
      document.getElementById('fileManga').onchange = (e) => handleUpload(e, 'urlManga', 'manga');
      document.getElementById('fileGola').onchange = (e) => handleUpload(e, 'urlGola', 'gola');

      // URLs
      const handleUrl = (e, textureKey) => {
        window.__loadTexture(e.target.value, c.cor_base).then(t => {
          const args = { frente: [t, null, null, null], costas: [null, t, null, null], manga: [null, null, t, null], gola: [null, null, null, t] }[textureKey];
          ADMIN.previewViewer.setTextures(...args, ADMIN.previewViewer.configs, document.getElementById('corBase').value);
        });
      };
      document.getElementById('urlFrente').onchange = (e) => handleUrl(e, 'frente');
      document.getElementById('urlCostas').onchange = (e) => handleUrl(e, 'costas');
      document.getElementById('urlManga').onchange = (e) => handleUrl(e, 'manga');
      document.getElementById('urlGola').onchange = (e) => handleUrl(e, 'gola');

      // Salvar
      document.getElementById('saveCamisetaBtn').onclick = async () => {
        const cfgFrente = ADMIN.previewViewer.getConfigs().frente;
        const cfgCostas = ADMIN.previewViewer.getConfigs().costas;
        const cfgManga = ADMIN.previewViewer.getConfigs().manga;
        const cfgGola = ADMIN.previewViewer.getConfigs().gola;
        
        const dados = {
          textura_principal: document.getElementById('urlFrente').value,
          textura_costas: document.getElementById('urlCostas').value,
          textura_manga: document.getElementById('urlManga').value,
          textura_gola: document.getElementById('urlGola').value,
          x_frente: cfgFrente.x,
          y_frente: cfgFrente.y,
          scale_frente: cfgFrente.scale,
          x_costas: cfgCostas.x,
          y_costas: cfgCostas.y,
          scale_costas: cfgCostas.scale,
          x_manga: cfgManga.x,
          y_manga: cfgManga.y,
          scale_manga: cfgManga.scale,
          x_gola: cfgGola.x,
          y_gola: cfgGola.y,
          scale_gola: cfgGola.scale,
          cor_corpo: document.getElementById('corCorpo').value,
          cor_cabelo: document.getElementById('corCabelo').value,
          cor_calca: document.getElementById('corCalca').value,
          cor_sapato: document.getElementById('corSapato').value,
          cor_base: document.getElementById('corBase').value
        };
        const r = await window.__apiPost({ action:'updateCamiseta', senha:getSenha(), id: c.id, dados });
        if (r.ok) {
          Object.assign(c, dados);
          window.__toast('Modelo salvo com sucesso!');
        } else {
          window.__toast('Erro ao salvar.', true);
        }
      };
    });
  }
  
  async function initAdminPreview(cam) {
    const el = document.getElementById('adminPreview'); 
    destroyPreview(); 
    await new Promise(r => setTimeout(r, 60));
    ADMIN.previewViewer = await window.__createViewer(el, cam);
  }
  
  function destroyPreview() { 
    if (ADMIN.previewViewer) { 
      ADMIN.previewViewer.destroy(); 
      ADMIN.previewViewer = null; 
    } 
  }
}

initApp();
