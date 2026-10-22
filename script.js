import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

// CARREGA O GSAP
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

// ============ HELPERS (API, Texturas, Toast) ============
function toast(msg, isError = false) { /* ... mantido igual ... */ }
async function apiGet(action = 'getAll') { /* ... mantido igual ... */ }
async function apiPost(payload) { /* ... mantido igual ... */ }
function fixDriveUrl(url) { /* ... mantido igual ... */ }
async function loadTexture(url, fallbackColor) { /* ... mantido igual ... */ }

const WHITE_PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
let gltfPromise = null;
function loadAvatarModel() { /* ... mantido igual ... */ }

function applyTshirtTexture(root, textures, configs) { /* ... mantido igual ... */ }
function applyMannequinColors(root, colors) {
  root.traverse(child => {
    if (!child.isMesh) return;
    const nome = child.name.toLowerCase();
    const isShirt = nome.includes('body_front') || nome.includes('body_back') || nome.includes('sleeves') || nome.includes('ribbing');
    if (isShirt) return;
    let colorHex = colors.corpo || '#d4d4d4';
    if (nome.includes('hair') || nome.includes('cabelo')) colorHex = colors.cabelo || '#222222';
    else if (nome.includes('jeans') || nome.includes('pants') || nome.includes('calca') || nome.includes('leg') || nome.includes('shoe')) colorHex = colors.calca || '#1a1a1a';
    if (colorHex) {
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      mats.forEach(mat => { 
        if (mat.color) mat.color.set(colorHex).convertSRGBToLinear(); 
        mat.map = null; mat.needsUpdate = true; 
      });
    }
  });
}

async function buildMannequin(cam) {
  const originalModel = await loadAvatarModel();
  const model = cloneSkinned(originalModel);
  model.traverse(child => {
    if (!child.isMesh) return;
    child.frustumCulled = false; // Impede que suma
    child.material = Array.isArray(child.material) ? child.material.map(m => m.clone()) : child.material.clone();
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

  const textures = { /* ... texturas ... */ };
  const configs = { /* ... configs ... */ };
  const mannequinColors = { corpo: cam.cor_corpo || '#d4d4d4', cabelo: cam.cor_cabelo || '#222222', calca: cam.cor_calca || '#1a1a1a' };

  applyTshirtTexture(model, textures, configs);
  applyMannequinColors(model, mannequinColors);
  
  return { wrapper, spinner };
}

// ==========================================
// CORE: CÂMERA CINEMATOGRÁFICA
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
  
  // CÂMERA: Começa um pouco longe e alta
  const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 1.2, 5.5); // Visão Geral (Hero)
  
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  // Luzes
  scene.add(new THREE.AmbientLight(0xffffff, 2.0));
  const key = new THREE.DirectionalLight(0xffffff, 2.5); key.position.set(3, 6, 5); scene.add(key);
  const fill = new THREE.DirectionalLight(0xffffff, 1.5); fill.position.set(-5, 3, 3); scene.add(fill);
  const rim = new THREE.DirectionalLight(0xd4af37, 2.0); rim.position.set(0, 3, -6); scene.add(rim);

  const modelsData = [];
  const totalModels = Math.min(3, state.camisetas.length);
  const spacing = 3.5; // Distância entre eles no início

  // Cria os 3 modelos posicionados lado a lado
  for (let i = 0; i < totalModels; i++) {
    const { wrapper, spinner } = await buildMannequin(state.camisetas[i]);
    
    // Posicionamento inicial: Centro, Direita, Esquerda
    if (i === 0) wrapper.position.set(0, 0, 0); 
    if (i === 1) wrapper.position.set(spacing, 0, 0); 
    if (i === 2) wrapper.position.set(-spacing, 0, 0); 
    
    scene.add(wrapper);
    modelsData.push({ wrapper, spinner, index: i });
  }

  // ==========================================
  // ANIMAÇÃO (SCROLLTRIGGER)
  // ==========================================
  
  // Variável de controle do enquadramento
  const camState = { y: 1.2, z: 5.5 };
  const lookState = { y: 1.0 };

  // Helper para atualizar a câmera suavemente
  function updateCamera() {
    camera.position.y = THREE.MathUtils.lerp(camera.position.y, camState.y, 0.1);
    camera.position.z = THREE.MathUtils.lerp(camera.position.z, camState.z, 0.1);
    camera.lookAt(0, lookState.y, 0);
    requestAnimationFrame(updateCamera);
  }
  updateCamera();

  // --- S1 -> S2: Zoom no Modelo 1 e sobe foco para a cintura ---
  ScrollTrigger.create({
    trigger: "#s2", start: "top bottom", end: "top top", scrub: 1,
    onUpdate: self => {
      const p = self.progress;
      // Move a câmera para Z=3.2 (perto) e Y=1.4 (cintura/peito)
      camState.z = THREE.MathUtils.lerp(5.5, 3.2, p);
      camState.y = THREE.MathUtils.lerp(1.2, 1.4, p);
      lookState.y = THREE.MathUtils.lerp(1.0, 1.3, p);
    }
  });

  // --- S2 -> S3: Modelo 1 gira 180 graus ---
  ScrollTrigger.create({
    trigger: "#s3", start: "top bottom", end: "top top", scrub: 1,
    onUpdate: self => {
      const p = self.progress;
      // Rotação de 0 a PI (180 graus)
      modelsData[0].spinner.rotation.y = THREE.MathUtils.lerp(0, Math.PI, p);
    }
  });

  // --- S3 -> S4: Move o cenário (Zoom out e desliza para o modelo 2) ---
  ScrollTrigger.create({
    trigger: "#s4", start: "top bottom", end: "top top", scrub: 1,
    onUpdate: self => {
      const p = self.progress;
      // Câmera dá zoom out temporário
      camState.z = THREE.MathUtils.lerp(3.2, 3.2, p);
      
      // Move o modelo 1 para a esquerda e o modelo 2 para o centro
      modelsData[0].wrapper.position.x = THREE.MathUtils.lerp(0, -spacing, p);
      if(modelsData[1]) modelsData[1].wrapper.position.x = THREE.MathUtils.lerp(spacing, 0, p);
      
      // Desfaz a rotação do modelo 1 para não ficar de costas quando sair
      modelsData[0].spinner.rotation.y = THREE.MathUtils.lerp(Math.PI, 0, p);
    }
  });

  // --- S4 -> S5: Modelo 2 gira 180 graus ---
  ScrollTrigger.create({
    trigger: "#s5", start: "top bottom", end: "top top", scrub: 1,
    onUpdate: self => {
      const p = self.progress;
      if(modelsData[1]) modelsData[1].spinner.rotation.y = THREE.MathUtils.lerp(0, Math.PI, p);
    }
  });

  // --- S5 -> S6: Move o cenário para o modelo 3 ---
  ScrollTrigger.create({
    trigger: "#s6", start: "top bottom", end: "top top", scrub: 1,
    onUpdate: self => {
      const p = self.progress;
      
      // Move modelo 2 para esquerda e modelo 3 para centro
      if(modelsData[1]) modelsData[1].wrapper.position.x = THREE.MathUtils.lerp(0, -spacing, p);
      if(modelsData[2]) modelsData[2].wrapper.position.x = THREE.MathUtils.lerp(-spacing, 0, p);
      
      if(modelsData[1]) modelsData[1].spinner.rotation.y = THREE.MathUtils.lerp(Math.PI, 0, p);
    }
  });

  // --- S6 -> S7: Modelo 3 gira 180 graus e finaliza ---
  ScrollTrigger.create({
    trigger: "#s7", start: "top bottom", end: "top top", scrub: 1,
    onUpdate: self => {
      const p = self.progress;
      if(modelsData[2]) modelsData[2].spinner.rotation.y = THREE.MathUtils.lerp(0, Math.PI, p);
    }
  });

  // Botões de navegação
  gsap.utils.toArray('.content-box').forEach(box => {
    ScrollTrigger.create({
      trigger: box,
      start: "top 80%",
      onEnter: () => box.classList.add('visible'),
      onLeaveBack: () => box.classList.remove('visible')
    });
  });

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

  // Desativa painel admin antigo para não bugar
  const lockBtn = document.getElementById('lockBtn');
  if (lockBtn) lockBtn.style.display = 'none'; 
}

initApp();
