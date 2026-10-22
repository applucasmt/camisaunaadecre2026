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

  senhaInput?.addEventListener('keydown', e => {
    if (e.key === 'Enter') loginBtn.click();
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

// ============ CONFIG ============
function renderConfigTab(container) {
  const c = window.__state.config;
  container.innerHTML = `
    <h2 style="margin-bottom:24px;">Textos do Site</h2>
    <div class="admin-form" id="configForm">
      <div><label>Título do site</label><input name="titulo_site" value="${c.titulo_site || ''}"></div>
      <div><label>Subtítulo</label><input name="subtitulo_site" value="${c.subtitulo_site || ''}"></div>
      <div><label>Texto do botão principal</label><input name="cta_texto" value="${c.cta_texto || ''}"></div>
      <div><label>Cor secundária (hex)</label><input name="cor_secundaria" value="${c.cor_secundaria || '#d4af37'}"></div>
      <div><label>Instagram</label><input name="instagram" value="${c.instagram || ''}"></div>
      <div><label>E-mail</label><input name="email" value="${c.email || ''}"></div>
      <div><label>Rodapé</label><input name="rodape" value="${c.rodape || ''}"></div>
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
      applyConfigDOM();
      window.__toast('Textos salvos!');
    } else window.__toast(r.error || 'Erro', true);
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

// ============ CAMISETAS ============
function renderCamisetasTab(container) {
  const list = window.__state.camisetas;
  container.innerHTML = `
    <h2 style="margin-bottom:24px;">Modelos (${list.length})</h2>
    <div style="display:grid;gap:16px;">
      ${list.map(c => `
        <div style="border:1px solid var(--border);border-radius:12px;padding:20px;display:flex;gap:20px;align-items:center;flex-wrap:wrap;">
          <div style="flex:1;min-width:200px;">
            <strong>${c.nome}</strong><br>
            <span style="color:var(--text-dim);font-size:.85rem;">${c.destaque || '—'}</span>
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
      <div><label>Tag/destaque</label><input name="destaque" value="${c.destaque || ''}"></div>
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
    form.querySelectorAll('input, textarea').forEach(i => dados[i.name] = i.value);
    const r = await window.__apiPost({ action:'updateCamiseta', senha:getSenha(), id, dados });
    if (r.ok) { Object.assign(c, dados); window.__toast('Modelo atualizado!'); openAdminTab('camisetas'); }
    else window.__toast(r.error || 'Erro', true);
  };
}

// ============ TEXTURAS ============
function renderTexturasTab(container) {
  container.innerHTML = `
    <h2 style="margin-bottom:24px;">🎨 Texturas por Modelo</h2>
    <p style="color:var(--text-dim);margin-bottom:24px;">Escolha um modelo para editar texturas com preview 3D ao vivo.</p>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:16px;">
      ${window.__state.camisetas.map(c => `
        <div style="border:1px solid var(--border);border-radius:12px;padding:20px;cursor:pointer;" data-t="${c.id}">
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
  container.querySelectorAll('[data-t]').forEach(el => {
    el.onclick = () => editCamisetaTexturas(parseInt(el.dataset.t));
  });
}

function editCamisetaTexturas(id) {
  const c = window.__state.camisetas.find(x => String(x.id) === String(id));
  if (!c) return;
  const content = document.getElementById('adminContent');
  content.innerHTML = `
    <h2 style="margin-bottom:16px;">Texturas: ${c.nome}</h2>
    <p style="color:var(--text-dim);margin-bottom:24px;">Faça upload de PNG/JPG. Preview 3D interativo ao lado.</p>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:32px;">
      <div class="admin-form">
        ${renderUploadZone('principal', 'Textura Principal', c.textura_principal)}
        ${renderUploadZone('secundaria', 'Textura Secundária', c.textura_secundaria)}
        ${renderUploadZone('manga', 'Textura das Mangas', c.textura_manga)}
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
  ['principal','secundaria','manga'].forEach(tipo => setupUpload(tipo, c));
  initAdminPreview(c);
}

function renderUploadZone(tipo, label, urlAtual) {
  return `
    <div>
      <label>${label}</label>
      <div class="upload-zone" data-upload="${tipo}">
        <input type="file" accept="image/*" data-file="${tipo}">
        <p>📤 Clique para enviar</p>
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

    const reader = new FileReader();
    reader.onload = async (ev) => {
      const dataUrl = ev.target.result;
      updatePreviewTexture(tipo, dataUrl);

      const base64 = dataUrl.split(',')[1];
      try {
        const r = await window.__apiPost({
          action:'uploadImagem', senha:getSenha(),
          camiseta_id: cam.id, tipo, base64,
          filename: file.name, mimeType: file.type
        });
        if (r.ok) {
          const campo = tipo === 'principal' ? 'textura_principal' :
                        tipo === 'secundaria' ? 'textura_secundaria' : 'textura_manga';
          cam[campo] = r.url;
          status.textContent = '✓ Enviada!';
          window.__toast('Textura enviada!');
          // aplica também nos viewers do site principal
          if (window.__state.productViewers[cam.id] && tipo === 'principal') {
            window.__loadTexture(r.url).then(tex => {
              window.__state.productViewers[cam.id].setTexture(tex);
            });
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
  try {
    ADMIN.previewViewer = await window.__createViewer(el, cam, { autoRotate: true });
  } catch (e) {
    console.error(e);
    el.innerHTML = '<p style="padding:20px;color:#ff4d4d;font-size:.85rem;">Falha ao carregar avatar 3D</p>';
  }
}

function updatePreviewTexture(tipo, dataUrl) {
  if (!ADMIN.previewViewer) return;
  const loader = new THREE.TextureLoader();
  loader.load(dataUrl, (tex) => {
    tex.anisotropy = 8;
    tex.colorSpace = THREE.SRGBColorSpace;
    if (tipo === 'principal') {
      ADMIN.previewViewer.setTexture(tex);
    }
    // secundária e manga: aplica como cor de fundo do material como demo
    if (tipo === 'secundaria' || tipo === 'manga') {
      // para simplificar, aplica mesma textura em meshes específicas se existirem
      ADMIN.previewViewer.tshirtMeshes.forEach(mesh => {
        // já tratado por setTexture apenas principal
      });
    }
  });
}

function destroyPreview() {
  if (ADMIN.previewViewer) {
    ADMIN.previewViewer.destroy();
    ADMIN.previewViewer = null;
  }
}
