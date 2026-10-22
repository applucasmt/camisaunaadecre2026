import * as THREE from 'three';

const ADMIN = { logado: false, abaAtiva: 'config', previewViewer: null };

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('lockBtn')?.addEventListener('click', () => {
    if (ADMIN.logado) {
      document.getElementById('adminPanel').classList.add('active');
      renderAdminSidebar(); openAdminTab('config');
    } else {
      document.getElementById('loginModal').classList.add('active');
      document.getElementById('senhaInput').focus();
    }
  });

  document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => document.getElementById('loginModal').classList.remove('active')));

  document.getElementById('loginBtn')?.addEventListener('click', () => {
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
  });

  document.getElementById('closeAdmin').onclick = () => {
    document.getElementById('adminPanel').classList.remove('active'); destroyPreview();
  };
});

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
  };
}

function renderCamisetasTab(container) {
  container.innerHTML = `
    <h2 style="margin-bottom:24px;">Modelos (${window.__state.camisetas.length})</h2>
    <div style="display:grid;gap:16px;">
      ${window.__state.camisetas.map(c => `
        <div style="border:1px solid var(--border);border-radius:12px;padding:20px;display:flex;gap:20px;align-items:center;">
          <div style="flex:1;"><strong>${c.nome}</strong></div>
          <button class="btn-ghost" data-tex="${c.id}">Configurar Texturas</button>
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
        <div>
          <label>Frente da Camisa</label>
          <div class="upload-zone" data-upload="principal">
            <input type="file" accept="image/*" data-file="principal">
            <p>📤 Upload Frente</p>
            <p class="upload-status" data-status="principal" style="color:var(--secondary);font-size:.8rem;"></p>
          </div>
        </div>
        <div>
          <label>Costas da Camisa</label>
          <div class="upload-zone" data-upload="costas">
            <input type="file" accept="image/*" data-file="costas">
            <p>📤 Upload Costas</p>
            <p class="upload-status" data-status="costas" style="color:var(--secondary);font-size:.8rem;"></p>
          </div>
        </div>
        <div>
          <label>Tamanho da Estampa (Zoom)</label>
          <input type="range" id="texScale" min="0.1" max="3" step="0.1" value="${c.textura_escala || 1}">
        </div>
        <div style="display:flex;gap:10px;">
          <div style="flex:1;"><label>Posição X</label><input type="range" id="texX" min="-1" max="1" step="0.1" value="${c.textura_offset_x || 0}"></div>
          <div style="flex:1;"><label>Posição Y</label><input type="range" id="texY" min="-1" max="1" step="0.1" value="${c.textura_offset_y || 0}"></div>
        </div>
        <button class="btn-primary" id="saveTexSettings">Salvar Ajustes</button>
        <button class="btn-ghost" id="backTexBtn">← Voltar</button>
      </div>
      <div><div class="preview-3d" id="adminPreview"></div></div>
    </div>`;
  
  document.getElementById('backTexBtn').onclick = () => { destroyPreview(); openAdminTab('camisetas'); };
  
  // Atualiza Preview ao vivo
  const updatePreview = () => {
    if (!ADMIN.previewViewer) return;
    const scale = parseFloat(document.getElementById('texScale').value);
    const offX = parseFloat(document.getElementById('texX').value);
    const offY = parseFloat(document.getElementById('texY').value);
    ADMIN.previewViewer.setTextures(ADMIN.texFront, ADMIN.texBack, scale, offX, offY);
  };

  document.getElementById('texScale').oninput = updatePreview;
  document.getElementById('texX').oninput = updatePreview;
  document.getElementById('texY').oninput = updatePreview;

  document.getElementById('saveTexSettings').onclick = async () => {
    const dados = {
      textura_escala: document.getElementById('texScale').value,
      textura_offset_x: document.getElementById('texX').value,
      textura_offset_y: document.getElementById('texY').value
    };
    const r = await window.__apiPost({ action:'updateCamiseta', senha:getSenha(), id: c.id, dados });
    if(r.ok) { Object.assign(c, dados); window.__toast('Ajustes salvos!'); }
  };

  setupUpload(c, 'principal', updatePreview);
  setupUpload(c, 'costas', updatePreview);
  initAdminPreview(c).then(() => {
    window.__loadTexture(c.textura_principal, c.cor_base).then(t => { ADMIN.texFront = t; updatePreview(); });
    window.__loadTexture(c.textura_costas, c.cor_base).then(t => { ADMIN.texBack = t; updatePreview(); });
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
      if (tipo === 'principal') ADMIN.texFront = tex;
      else ADMIN.texBack = tex;
      cb();

      const base64 = dataUrl.split(',')[1];
      const r = await window.__apiPost({
        action:'uploadImagem', senha:getSenha(), camiseta_id: cam.id, tipo, base64,
        filename: input.files[0].name, mimeType: input.files[0].type
      });
      if (r.ok) {
        if (tipo === 'principal') cam.textura_principal = r.url;
        else cam.textura_costas = r.url;
        status.textContent = '✓ Salva!';
        window.__toast('Textura salva!');
      } else status.textContent = '✗ Erro';
    };
    reader.readAsDataURL(input.files[0]);
  };
}

async function initAdminPreview(cam) {
  const el = document.getElementById('adminPreview');
  destroyPreview();
  await new Promise(r => setTimeout(r, 60));
  ADMIN.previewViewer = await window.__createViewer(el, cam, { autoRotate: true });
}

function destroyPreview() {
  if (ADMIN.previewViewer) { ADMIN.previewViewer.destroy(); ADMIN.previewViewer = null; }
}
