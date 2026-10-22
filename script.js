import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

// ============ CARREGA GSAP ============
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
const state = { config: {}, camisetas: [] };
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
    ctx.fillStyle = fallbackColor || '#333'; 
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
      t => { t.anisotropy = 8; t.colorSpace = THREE.SRGBColorSpace; t.flipY = false; resolve(t); }, 
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
        mat.map = tex; 
        mat.color.setHex(0xffffff);
      } else { mat.map = null; mat.color.set(0xffffff); }
      mat.needsUpdate = true;
    });
  });
}

function applyMannequinColors(root, colors) {
  root.traverse(child => {
    if (!child.isMesh) return;
    const nome = child.name.toLowerCase();
    const isShirt = nome.includes('body_front') || nome.includes('body_back') || 
                    nome.includes('sleeves') || nome.includes('ribbing');
    if (isShirt) return;

    // CORES PADRÃO SEGURAS (NÃO FICA MAIS VERMELHO)
    let colorHex = colors.corpo || '#d4d4d4';
    if (nome.includes('hair') || nome.includes('cabelo')) colorHex = colors.cabelo || '#222222';
    else if (nome.includes('jeans') || nome.includes('pants') || nome.includes('calca') || 
             nome.includes('leg') || nome.includes('shoe')) colorHex = colors.calca || '#1a1a1a';

    if (colorHex) {
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      mats.forEach(mat => { 
        if (mat.color) mat.color.set(colorHex).convertSRGBToLinear(); 
        mat.map = null; // Limpa textura vazada
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
    child.frustumCulled = false; // EVITA QUE O MODELO SUMA
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
    corpo: cam.cor_corpo || '#d4d4d4',
    cabelo: cam.cor_cabelo || '#222222',
    calca: cam.cor_calca || '#1a1a1a'
  };

  applyTshirtTexture(model, textures, configs);
  applyMannequinColors(model, mannequinColors);
  
  return { wrapper, spinner };
}

// ==========================================
// CORE: EXPERIÊNCIA SEQUENCIAL (UM POR VEZ)
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
      { id: 1, nome: 'Classic Black', descricao: 'Algodão premium penteado 30.1. Design minimalista que combina com tudo.', cor_base: '#111111' },
      { id: 2, nome: 'Urban White', descricao: 'Modelagem oversized com toque suave. Peça-chave do guarda-roupa.', cor_base: '#f5f5f5' },
      { id: 3, nome: 'Gold Edition', descricao: 'Edição limitada com acabamento exclusivo. Detalhes em dourado.', cor_base: '#d4af37' }
    ];
  }

  const container = document.getElementById('webgl-container');
  const scene = new THREE.Scene();
  
  // Câmera fixa no centro, olhando para o peito (Y=1.1)
  const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 1.2, 4.5);
  camera.lookAt(0, 1.1, 0);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  // Iluminação
  scene.add(new THREE.AmbientLight(0xffffff, 2.0));
  const key = new THREE.DirectionalLight(0xffffff, 2.5); key.position.set(3, 6, 5); scene.add(key);
  const fill = new THREE.DirectionalLight(0xffffff, 1.5); fill.position.set(-5, 3, 3); scene.add(fill);
  const rim = new THREE.DirectionalLight(0xd4af37, 2.0); rim.position.set(0, 3, -6); scene.add(rim);

  const modelsData = [];
  const totalModels = Math.min(3, state.camisetas.length);

  // Prepara os modelos posicionados no eixo Z (fundo)
  for (let i = 0; i < totalModels; i++) {
    const { wrapper, spinner } = await buildMannequin(state.camisetas[i]);
    
    // Posiciona os modelos escondidos lá atrás (Z = -15)
    wrapper.position.set(0, 0, -15);
    scene.add(wrapper);
    
    modelsData.push({ wrapper, spinner, index: i });
  }

  // ==========================================
  // ANIMAÇÃO DO SCROLL (SEQUENCIAL)
  // ==========================================
  
  // Configurações de posição
  const Z_FRENTE = 0;        // Onde o modelo aparece para o usuário
  const Z_FUNDO = -10;       // Onde o modelo se esconde
  const ROTACAO_FRENTE = Math.PI * 2; // Gira 360 graus enquanto está na frente

  // Modelo 0 (Classic Black) - Seção 2
  ScrollTrigger.create({
    trigger: "#s2",
    start: "top bottom",
    end: "top top",
    scrub: 1,
    onUpdate: self => {
      const p = self.progress;
      // Entra da esquerda para o centro
      modelsData[0].wrapper.position.x = THREE.MathUtils.lerp(-5, 0, p);
      modelsData[0].wrapper.position.z = THREE.MathUtils.lerp(Z_FUNDO, Z_FRENTE, p);
      modelsData[0].spinner.rotation.y = p * Math.PI * 1.5; // Gira ao entrar
    }
  });

  ScrollTrigger.create({
    trigger: "#s3",
    start: "top bottom",
    end: "top top",
    scrub: 1,
    onUpdate: self => {
      const p = self.progress;
      
      // Modelo 0 sai para a esquerda
      modelsData[0].wrapper.position.x = THREE.MathUtils.lerp(0, -5, p);
      modelsData[0].wrapper.position.z = THREE.MathUtils.lerp(Z_FRENTE, Z_FUNDO, p);
      
      // Modelo 1 entra da direita
      if (modelsData[1]) {
        modelsData[1].wrapper.position.x = THREE.MathUtils.lerp(5, 0, p);
        modelsData[1].wrapper.position.z = THREE.MathUtils.lerp(Z_FUNDO, Z_FRENTE, p);
        modelsData[1].spinner.rotation.y = p * Math.PI * 1.5;
      }
    }
  });

  ScrollTrigger.create({
    trigger: "#s4",
    start: "top bottom",
    end: "top top",
    scrub: 1,
    onUpdate: self => {
      const p = self.progress;
      
      // Modelo 1 sai para a esquerda
      if (modelsData[1]) {
        modelsData[1].wrapper.position.x = THREE.MathUtils.lerp(0, -5, p);
        modelsData[1].wrapper.position.z = THREE.MathUtils.lerp(Z_FRENTE, Z_FUNDO, p);
      }
      
      // Modelo 2 entra da direita
      if (modelsData[2]) {
        modelsData[2].wrapper.position.x = THREE.MathUtils.lerp(5, 0, p);
        modelsData[2].wrapper.position.z = THREE.MathUtils.lerp(Z_FUNDO, Z_FRENTE, p);
        modelsData[2].spinner.rotation.y = p * Math.PI * 1.5;
      }
    }
  });

  // Rotação contínua APENAS do modelo que está na frente
  function animate() {
    requestAnimationFrame(animate);
    const t = performance.now() * 0.001;
    
    modelsData.forEach(m => {
      // Se o modelo estiver próximo da frente (Z > -2), ele gira sozinho
      if (m.wrapper.position.z > -2) {
        m.spinner.rotation.y += 0.005;
      }
    });

    renderer.render(scene, camera);
  }
  animate();

  // Ativa os textos
  gsap.utils.toArray('.content-box').forEach(box => {
    ScrollTrigger.create({
      trigger: box,
      start: "top 80%",
      onEnter: () => box.classList.add('visible'),
      onLeaveBack: () => box.classList.remove('visible')
    });
  });

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    ScrollTrigger.refresh();
  });

  // Remove referências antigas do painel admin se existirem
  const lockBtn = document.getElementById('lockBtn');
  if (lockBtn) lockBtn.style.display = 'none'; // Desativa painel antigo por enquanto para focar no visual
}

initApp();
