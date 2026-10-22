// ============ ADMIN PANEL ============
const ADMIN = {
  logado: false,
  abaAtiva: 'config',
  camisetaEditando: null,
  previewScene: null,
  previewRenderer: null,
  previewTshirtMat: null
};

document.addEventListener('DOMContentLoaded', () => {
  const lockBtn = document.getElementById('lockBtn');
  const loginModal = document.getElementById('loginModal');
  const loginBtn = document.getElementById('loginBtn');
  const senhaInput = document.getElementById('senhaInput');
  const loginError = document.getElementById('loginError');
  const closeAdmin = document.getElementById('closeAdmin');
  const adminPanel = document.getElementById('adminPanel');

  lockBtn?.addEventListener('click', () => {
    if (ADMIN.logado) {
      adminPanel.classList.add('active');
      renderAdminSidebar();
      openAdminTab('config');
    } else {
      loginModal.classList.add('active');
      senhaInput.focus();
    }
  });

  document.querySelectorAll('[data-close]').forEach(b => {
    b.addEventListener('click', () => loginModal.classList.remove('active'));
  });

  loginBtn?.addEventListener('click', async () => {
    const senha = senhaInput.value.trim();
    const esperada = window.__state.config.admin_senha || '20266';
    if (senha === String(esperada)) {
      ADMIN.logado = true;
      loginModal.classList.remove('active');
      adminPanel.classList.add('active');
      renderAdminSidebar();
      openAdminTab('config');
      window.__toast('Bem-vindo, admin!');
    } else {
      loginError.textContent = 'Senha incorreta';
      setTimeout(() => loginError.textContent = '', 2500);
    }
  });

  senhaInput?.addEventListener('keydown', e => {
    if (e.key === 'Enter') loginBtn.click();
  });

  closeAdmin?.addEventListener('click', () => {
    adminPanel.classList.remove('active');
    if (ADMIN.previewRenderer) {
      ADMIN.previewRenderer.dispose?.();
      ADMIN.previewRenderer = null;
    }
  });
});

// ============ SIDEBAR ============
function renderAdminSidebar() {
  const sidebar = document.getElementById('adminSidebar');
  const tabs = [
    { id:'config', label:'⚙️ Configurações do Site' },
    { id:'camisetas', label:'👕 Camisetas (3D)' },
    { id:'texturas', label:'🎨 Texturas / Uploads' }
  ];
  sidebar.innerHTML = '';
  tabs.forEach(t => {
    const btn = document.createElement('button');
    btn.textContent = t.label;
    btn.dataset.tab = t.id;
    if (ADMIN.abaAtiva === t.id) btn.classList.add('active');
    btn.onclick = () => openAdminTab(t.id);
    sidebar.appendChild(btn);
  });
}

function openAdminTab(tabId) {
  ADMIN.abaAtiva = tabId;
  document.querySelectorAll('#adminSidebar button').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === tabId);
  });
  const content = document.getElementById('adminContent');
  content.innerHTML = '';
  if (tabId === 'config') renderConfigTab(content);
  if (tabId === 'camisetas') renderCamisetasTab(content);
  if (tabId === 'texturas') renderTexturasTab(content);
}

// ============ TAB CONFIG ============
function renderConfigTab(container) {
  const c = window.__state.config;
  container.innerHTML = `
    <h2 style="margin-bottom:24px;">Configurações do Site</h2>
    <div class="admin-form" id="configForm">
      <div><label>Título do site</label><input name="titulo_site" value="${c.titulo_site || ''}"></div>
      <div><label>Subtítulo</label><input name="subtitulo_site" value="${c.subtitulo_site || ''}"></div>
      <div><label>Texto do CTA</label><input name="cta_texto" value="${c.cta_texto || ''}"></div>
      <div><label>Cor secundária (hex)</label><input name="cor_secundaria" value="${c.cor_secundaria || '#d4af37'}"></div>
      <div><label>WhatsApp (só números, com DDI)</label><input name="whatsapp" value="${c.whatsapp || ''}"></div>
      <div><label>Instagram</label><input name="instagram" value="${c.instagram || ''}"></div>
      <div><label>E-mail</label><input name="email" value="${c.email || ''}"></div>
      <div><label>Rodapé</label><input name="rodape" value="${c.rodape || ''}"></div>
      <div><label>Senha Admin</label><input name="admin_senha" value="${c.admin_senha || '20266'}"></div>
      <button class="btn-primary" id="saveConfigBtn">Salvar Configurações</button>
    </div>
  `;
  document.getElementById('saveConfigBtn').onclick = async () => {
    const form = document.getElementById('configForm');
    const dados = {};
    form.querySelectorAll('input').forEach(i => dados[i.name] = i.value);
    try {
      const r = await window.__apiPost({
        action:'updateConfig', senha: getSenha(), dados
      });
      if (r.ok) {
        Object.assign(window.__state.config, dados);
        // reaplica no site
        if (window.applyConfig) window.applyConfig();
        window.__toast('Configurações salvas!');
        // reaplica visualmente título etc.
        applyConfigDOM();
      } else window.__toast(r.error || 'Erro', true);
    } catch (e) { window.__toast('Falha na conexão', true); }
  };
}

function applyConfigDOM() {
  const c = window.__state.config;
  if (c.titulo_site) document.getElementById('heroTitle').textContent = c.titulo_site;
  if (c.subtitulo_site) document.getElementById('heroSub').textContent = c.subtitulo_site;
  if (c.cta_texto) document.getElementById('heroCta').textContent = c.cta_texto;
  if (c.rodape) document.getElementById('footerText').textContent = c.rodape;
  if (c.cor_secundaria) document.documentElement.style.setProperty('--secondary', c.cor_secundaria);
}

// ============ TAB CAMISETAS ============
function renderCamisetasTab(container) {
  const list = window.__state.camisetas;
  container.innerHTML = `
    <h2 style="margin-bottom:24px;">Camisetas (${list.length})</h2>
    <div style="display:grid;gap:16px;">
      ${list.map(c => `
        <div style="border:1px solid var(--border);border-radius:12px;padding:20px;display:flex;gap:20px;align-items:center;flex-wrap:wrap;">
          <div style="flex:1;min-width:200px;">
            <strong>${c.nome}</strong><br>
            <span style="color:var(--text-dim);font-size:.85rem;">R$ ${Number(c.preco).toFixed(2)}</span>
          </div>
          <div style="display:flex;gap:8px;">
            <button class="btn-primary" data-edit="${c.id}">Editar</button>
            <button class="btn-ghost" data-tex="${c.id}">Texturas</button>
          </div>
        </div>
      `).join('')}
    </div>
  `;
  container.querySelectorAll('[data-edit]').forEach(b => {
    b.onclick = () => editCamisetaInfo(parseInt(b.dataset.edit));
  });
  container.querySelectorAll('[data-tex]').forEach(b => {
    b.onclick = () => editCamisetaTexturas(parseInt(b.dataset.tex));
  });
}

function editCamisetaInfo(id) {
  const c = window.__state.camisetas.find(x => String(x.id) === String(id));
  if (!c) return;
  const content = document.getElementById('adminContent');
  content.innerHTML = `
    <h2 style="margin-bottom:24px;">Editar: ${c.nome}</h2>
    <div class="admin-form" id="editForm">
      <div><label>Nome</label><input name="nome" value="${c.nome}"></div>
      <div><label>Descrição</label><textarea name="descricao">${c.descricao || ''}</textarea></div>
      <div><label>Preço (R$)</label><input name="preco" type="number" step="0.01" value="${c.preco}"></div>
      <div><label>Cor base (hex)</label><input name="cor_base" value="${c.cor_base || '#111111'}"></div>
      <div style="display:flex;gap:12px;">
        <button class="btn-primary" id="saveCamBtn">Salvar</button>
        <button class="btn-ghost" id="backBtn">Voltar</button>
      </div>
    </div>
  `;
  document.getElementById('backBtn').onclick = () => openAdminTab('camisetas');
  document.getElementById('saveCamBtn').onclick = async () => {
    const form = document.getElementById('editForm');
    const dados = {};
    form.querySelectorAll('input, textarea').forEach(i => {
      dados[i.name] = i.name === 'preco' ? parseFloat(i.value) : i.value;
    });
    const r = await window.__apiPost({ action:'updateCamiseta', senha:getSenha(), id, dados });
    if (r.ok) {
      Object.assign(c, dados);
      window.__toast('Camiseta atualizada!');
      openAdminTab('camisetas');
    } else window.__toast(r.error || 'Erro', true);
  };
}

function editCamisetaTexturas(id) {
  const c = window.__state.camisetas.find(x => String(x.id) === String(id));
  if (!c) return;
  ADMIN.camisetaEditando = c;
  const content = document.getElementById('adminContent');
  content.innerHTML = `
    <h2 style="margin-bottom:16px;">Texturas: ${c.nome}</h2>
    <p style="color:var(--text-dim);margin-bottom:24px;">Faça upload das imagens (PNG/JPG). Previsualize ao lado em tempo real.</p>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:32px;">
      <div class="admin-form">
        ${renderUploadZone('principal', 'Textura Principal', c.textura_principal)}
        ${renderUploadZone('secundaria', 'Textura Secundária', c.textura_secundaria)}
        ${renderUploadZone('manga', 'Textura das Mangas', c.textura_manga)}
      </div>
      <div>
        <div class="preview-3d" id="adminPreview"></div>
        <div style="display:flex;gap:12px;">
          <button class="btn-ghost" id="backTexBtn">Voltar</button>
        </div>
      </div>
    </div>
  `;
  document.getElementById('backTexBtn').onclick = () => {
    destroyPreview();
    openAdminTab('camisetas');
  };

  // Setup upload handlers
  ['principal','secundaria','manga'].forEach(tipo => {
    setupUpload(tipo, c);
  });

  initAdminPreview(c);
}

function renderUploadZone(tipo, label, urlAtual) {
  return `
    <div>
      <label>${label}</label>
      <div class="upload-zone" data-upload="${tipo}">
        <input type="file" accept="image/*" data-file="${tipo}">
        <p>📤 Clique para enviar (PNG/JPG)</p>
        ${urlAtual ? `<img src="${urlAtual}" class="preview-thumb" crossorigin="anonymous">` : ''}
        <p class="upload-status" data-status="${tipo}" style="color:var(--secondary);font-size:.8rem;margin-top:8px;"></p>
      </div>
    </div>
  `;
}

function setupUpload(tipo, cam) {
  const zone = document.querySelector(`[data-upload="${tipo}"]`);
  const input = document.querySelector(`[data-file="${tipo}"]`);
  const status = document.querySelector(`[data-status="${tipo}"]`);
  if (!zone) return;

  zone.onclick = () => input.click();

  input.onchange = async () => {
    const file = input.files[0];
    if (!file) return;
    status.textContent = 'Enviando...';

    // Preview local imediato
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const dataUrl = ev.target.result;
      // Atualiza preview 3D local
      updatePreviewTexture(tipo, dataUrl);

      // Envia base64 para o backend
      const base64 = dataUrl.split(',')[1];
      try {
        const r = await window.__apiPost({
          action: 'uploadImagem',
          senha: getSenha(),
          camiseta_id: cam.id,
          tipo,
          base64,
          filename: file.name,
          mimeType: file.type
        });
        if (r.ok) {
          const campo = tipo === 'principal' ? 'textura_principal' :
                        tipo === 'secundaria' ? 'textura_secundaria' : 'textura_manga';
          cam[campo] = r.url;
          status.textContent = '✓ Enviada!';
          window.__toast('Textura enviada!');
          // Recarrega a page principal (produtos 3D)
          setTimeout(() => window.location.reload(), 1200);
        } else {
          status.textContent = '✗ Erro: ' + (r.error || '');
        }
      } catch (e) {
        status.textContent = '✗ Falha na conexão';
      }
    };
    reader.readAsDataURL(file);
  };
}

// ============ TAB TEXTURAS (visão geral) ============
function renderTexturasTab(container) {
  container.innerHTML = `
    <h2 style="margin-bottom:24px;">🎨 Biblioteca de Texturas</h2>
    <p style="color:var(--text-dim);margin-bottom:24px;">Selecione uma camiseta para editar suas texturas.</p>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:16px;">
      ${window.__state.camisetas.map(c => `
        <div style="border:1px solid var(--border);border-radius:12px;padding:20px;cursor:pointer;" onclick="window.__adminOpenTex(${c.id})">
          <strong>${c.nome}</strong>
          <div style="margin-top:12px;display:grid;gap:6px;font-size:.8rem;color:var(--text-dim);">
            <span>${c.textura_principal ? '✅' : '⬜'} Principal</span>
            <span>${c.textura_secundaria ? '✅' : '⬜'} Secundária</span>
            <span>${c.textura_manga ? '✅' : '⬜'} Mangas</span>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}
window.__adminOpenTex = (id) => editCamisetaTexturas(id);

// ============ PREVIEW 3D NO PAINEL ============
function destroyPreview() {
  if (ADMIN.previewRenderer) {
    ADMIN.previewRenderer.dispose?.();
    ADMIN.previewRenderer = null;
  }
  ADMIN.previewScene = null;
}

async function initAdminPreview(cam) {
  const el = document.getElementById('adminPreview');
  if (!el) return;
  destroyPreview();

  const w = el.clientWidth, h = el.clientHeight;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, w/h, 0.1, 100);
  camera.position.set(0, 0.3, 7.5);

  const renderer = new THREE.WebGLRenderer({ antialias:true, alpha:true });
  renderer.setSize(w, h);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  el.appendChild(renderer.domElement);

  scene.add(new THREE.AmbientLight(0xffffff, 0.4));
  const k = new THREE.DirectionalLight(0xffffff, 1.2); k.position.set(3,4,5); scene.add(k);
  const r = new THREE.DirectionalLight(0xd4af37, 0.7); r.position.set(-4,2,-3); scene.add(r);

  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.7 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 3.2, 48), mat); group.add(body);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.8, 32), mat); neck.position.y = 2.0; group.add(neck);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.5, 32, 32), mat); head.position.y = 2.65; group.add(head);

  const tex = cam.textura_principal
    ? await window.__loadTexture(cam.textura_principal, cam.cor_base)
    : window.__createProceduralTexture(cam.cor_base || '#222');

  const tshirtGeo = window.__createTshirtGeometry();
  const tshirtMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, side: THREE.DoubleSide });
  const tshirt = new THREE.Mesh(tshirtGeo, tshirtMat);
  tshirt.scale.set(1.15, 1.15, 1.15);
  group.add(tshirt);

  scene.add(group);

  const clock = new THREE.Clock();
  function animate() {
    if (!ADMIN.previewRenderer) return;
    requestAnimationFrame(animate);
    const t = clock.getElapsedTime();
    group.rotation.y = t * 0.4;
    group.position.y = Math.sin(t * 1.3) * 0.08;
    renderer.render(scene, camera);
  }
  animate();

  ADMIN.previewRenderer = renderer;
  ADMIN.previewScene = { scene, camera, renderer, tshirtMat, group };

  new ResizeObserver(() => {
    const w2 = el.clientWidth, h2 = el.clientHeight;
    if (!w2 || !h2) return;
    camera.aspect = w2/h2; camera.updateProjectionMatrix(); renderer.setSize(w2, h2);
  }).observe(el);
}

function updatePreviewTexture(tipo, dataUrl) {
  if (!ADMIN.previewScene) return;
  const loader = new THREE.TextureLoader();
  loader.load(dataUrl, (tex) => {
    tex.anisotropy = 8;
    if (tipo === 'principal') {
      ADMIN.previewScene.tshirtMat.map = tex;
      ADMIN.previewScene.tshirtMat.needsUpdate = true;
    }
    // secundária/manga: representação simplificada no preview
    if (tipo === 'manga') {
      // cria mangas visuais
      const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 });
      const geo = new THREE.BoxGeometry(0.7, 0.6, 0.3);
      const mL = new THREE.Mesh(geo, mat); mL.position.set(-1.5, 0.9, 0); mL.rotation.z = 0.3;
      const mR = new THREE.Mesh(geo, mat); mR.position.set(1.5, 0.9, 0); mR.rotation.z = -0.3;
      ADMIN.previewScene.group.add(mL, mR);
    }
  });
}

// ============ HELPERS ============
function getSenha() {
  return window.__state.config.admin_senha || '20266';
}
