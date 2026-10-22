import * as THREE from 'three';

const ADMIN = {
  logado: false,
  abaAtiva: 'config',
  previewViewer: null
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

  loginBtn?.addEventListener('click', () => {
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

  closeAdmin?.addEventListener('click', () => {
    adminPanel.classList.remove('active');
    destroyPreview();
  });
});

function getSenha() { return window.__state.config.admin_senha || '20266'; }

function renderAdminSidebar() {
  const sidebar = document.getElementById('adminSidebar');
  const tabs = [
    { id:'config', label:'⚙️ Textos do Site' },
    { id:'camisetas', label:'👕 Modelos (3D)' },
    { id:'texturas', label:'🎨 Texturas' }
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
  destroyPreview();
  if (tabId === 'config') renderConfigTab(content);
  if (tabId === 'camisetas') renderCamisetasTab(content);
  if (tabId === 'texturas') renderTexturasTab(content);
}

function renderConfigTab(container) {
  const c = window.__state.config;
  container.innerHTML = `
    <h2 style="margin-bottom:24px;">Textos do Site</h2>
    <div class="admin-form" id="configForm">
      <div><label>Título do site</label><input name="titulo_site" value="${c.titulo_site || ''}"></div>
      <div><label>Subtítulo</label><input name="subtitulo_site" value="${c.subtitulo_site || ''}"></div>
      <div><label>Senha Admin</label><input name="admin_senha" value="${c.admin_senha || '20266'}"></div>
      <button class="btn-primary" id="saveConfigBtn">Salvar</button>
    </div>
  `;
  document.getElementById('saveConfigBtn').onclick = async () => {
    const form = document.getElementById('configForm');
    const dados = {};
    form.querySelectorAll('input').forEach(i => dados[i.name] = i.value);
    const r = await window.__apiPost({ action:'updateConfig', senha:getSenha(), dados });
    if (r.ok) {
      Object.assign(window.__state.config, dados);
      window.__toast('Textos salvos!');
    } else window.__toast(r.error || 'Erro', true);
  };
}

function renderCamisetasTab(container) {
  const list = window.__state.camisetas;
  container.innerHTML = `
    <h2 style="margin-bottom:24px;">Modelos (${list.length})</h2>
    <div style="display:grid;gap:16px;">
      ${list.map(c => `
        <div style="border:1px solid var(--border);border-radius:12px;padding:20px;display:flex;gap:20px;align-items:center;flex-wrap:wrap;">
          <div style="flex:1;min-width:200px;">
            <strong>${c.nome}</strong><br>
          </div>
          <button class="btn-ghost" data-tex="${c.id}">Trocar Textura</button>
        </div>
      `).join('')}
    </div>
  `;
  container.querySelectorAll('[data-tex]').forEach(b => {
    b.onclick = () => editCamisetaTexturas(parseInt(b.dataset.tex));
  });
}

function renderTexturasTab(container) {
  container.innerHTML = `
    <h2 style="margin-bottom:24px;">🎨 Texturas por Modelo</h2>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:16px;">
      ${window.__state.camisetas.map(c => `
        <div style="border:1px solid var(--border);border-radius:12px;padding:20px;cursor:pointer;" data-t="${c.id}">
          <strong>${c.nome}</strong>
        </div>
      `).join('')}
    </div>
  `;
  container.querySelectorAll('[data-t]').forEach(el => {
    el.onclick = () => editCamisetaTexturas(parseInt(el.dataset.t));
  });
}

function editCamisetaTexturas(id) {
  const c = window.__state.camisetas.find(x => String(x.id) === String(id));
  if (!c) return;
  const content = document.getElementById('adminContent');
  content.innerHTML = `
    <h2 style="margin-bottom:16px;">Textura: ${c.nome}</h2>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:32px;">
      <div class="admin-form">
        <div>
          <label>Textura Principal (PNG/JPG)</label>
          <div class="upload-zone" data-upload="principal">
            <input type="file" accept="image/*" data-file="principal">
            <p>📤 Clique para enviar a nova estampa</p>
            <p class="upload-status" data-status="principal" style="color:var(--secondary);font-size:.8rem;margin-top:8px;"></p>
          </div>
        </div>
        <button class="btn-ghost" id="backTexBtn">← Voltar</button>
      </div>
      <div>
        <div class="preview-3d" id="adminPreview"></div>
      </div>
    </div>
  `;
  
  document.getElementById('backTexBtn').onclick = () => {
    destroyPreview();
    openAdminTab('texturas');
  };
  
  setupUpload(c);
  initAdminPreview(c);
}

function setupUpload(cam) {
  const zone = document.querySelector(`[data-upload="principal"]`);
  const input = document.querySelector(`[data-file="principal"]`);
  const status = document.querySelector(`[data-status="principal"]`);
  if (!zone) return;

  zone.onclick = () => input.click();

  input.onchange = async () => {
    const file = input.files[0];
    if (!file) return;
    status.textContent = 'Enviando para o Google Drive...';

    const reader = new FileReader();
    reader.onload = async (ev) => {
      const dataUrl = ev.target.result;
      
      if (ADMIN.previewViewer) {
        const tex = new THREE.TextureLoader().load(dataUrl);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.flipY = false;
        ADMIN.previewViewer.setTexture(tex);
      }

      const base64 = dataUrl.split(',')[1];
      try {
        const r = await window.__apiPost({
          action:'uploadImagem', senha:getSenha(),
          camiseta_id: cam.id, tipo: 'principal', base64,
          filename: file.name, mimeType: file.type
        });
        if (r.ok) {
          cam.textura_principal = r.url;
          status.textContent = '✓ Salva na planilha!';
          window.__toast('Textura salva!');
          
          if (window.__state.productViewers[cam.id]) {
            const tex = new THREE.TextureLoader().load(r.url);
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.flipY = false;
            window.__state.productViewers[cam.id].setTexture(tex);
          }
        } else {
          status.textContent = '✗ ' + (r.error || 'Erro');
        }
      } catch (e) { status.textContent = '✗ Falha na conexão'; }
    };
    reader.readAsDataURL(file);
  };
}

async function initAdminPreview(cam) {
  const el = document.getElementById('adminPreview');
  if (!el) return;
  destroyPreview();
  await new Promise(r => setTimeout(r, 60));
  if (window.__createViewer) {
    ADMIN.previewViewer = await window.__createViewer(el, cam, { autoRotate: true });
  }
}

function destroyPreview() {
  if (ADMIN.previewViewer) {
    ADMIN.previewViewer.destroy();
    ADMIN.previewViewer = null;
  }
}
