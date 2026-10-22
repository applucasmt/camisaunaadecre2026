import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

const API_URL = 'https://script.google.com/macros/s/AKfycbyMiP-nbR9_UYZGCA7dtAWIm4HIl2Vg4UeatogPC9f7ORdEZMSEJwU6LggDenh0eqDVug/exec';
const state = { config: {}, camisetas: [], modalViewer: null };
window.__state = state;
window.THREE = THREE;

// ==========================================
// HELPERS E CORS CORRIGIDO
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
  try { 
    const r = await fetch(`${API_URL}?action=${action}`); 
    return await r.json(); 
  } catch (e) { return { ok: false }; }
}

async function apiPost(payload) {
  try {
    // SOLUÇÃO CORS: Enviar como form-urlencoded para o Google Apps Script aceitar
    const formData = new URLSearchParams();
    formData.append('payload', JSON.stringify(payload));

    const r = await fetch(API_URL, {
      method: 'POST',
      body: formData.toString(),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' }
    });
    return await r.json();
  } catch (e) { 
    console.error("Erro POST:", e);
    return { ok: false }; 
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
// MODELO 3D BASE
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

// ==========================================
// EXPORTA O CRIADOR DO PREVIEW PARA O ADMIN.JS
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
window.__createViewer = createAdminViewer; 

// ==========================================
// CARREGAMENTO SEGURO DO GSAP
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

// ==========================================
// INICIALIZAÇÃO (SCROLLTELLING APPLE)
// ==========================================
async function initApp() {
  gsap.registerPlugin(ScrollTrigger);
  
  const data = await apiGet('getAll');
  if (data.ok) {
    state.config = Object.fromEntries(data.config.map(c => [c.CHAVE, c.VALOR]));
    state.camisetas = data.camisetas;
    if(state.camisetas[0]) { 
      const el1 = document.getElementById('nome-1'); if(el1) el1.textContent = state.camisetas[0].nome; 
      const ed1 = document.getElementById('desc-1'); if(ed1) ed1.textContent = state.camisetas[0].descricao; 
    }
    if(state.camisetas[1]) { 
      const el2 = document.getElementById('nome-2'); if(el2) el2.textContent = state.camisetas[1].nome; 
      const ed2 = document.getElementById('desc-2'); if(ed2) ed2.textContent = state.camisetas[1].descricao; 
    }
    if(state.camisetas[2]) { 
      const el3 = document.getElementById('nome-3'); if(el3) el3.textContent = state.camisetas[2].nome; 
      const ed3 = document.getElementById('desc-3'); if(ed3) ed3.textContent = state.camisetas[2].descricao; 
    }
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
}

// ==========================================
// BOOT
// ==========================================
loadGSAP().then(() => {
  initApp();
}).catch(err => console.error('Erro ao carregar GSAP:', err));
