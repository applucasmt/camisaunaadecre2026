import * as THREE from 'three';

const ADMIN = { logado: false, abaAtiva: 'config', previewViewer: null, currentPart: null };

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
        
        <!-- CONTROLE DE MODO -->
        <div style="display:flex; gap:10px; margin-bottom:20px; padding:15px; background:rgba(255,255,255,0.05); border-radius:8px; border:1px solid var(--border);">
          <button class="btn-ghost mode-btn" id="modeRotate" style="flex:1;">🔄 Rotacionar Modelo</button>
          <button class="btn-ghost mode-btn active" id="modeEdit" style="flex:1; border-color:var(--secondary); color:var(--secondary);">✏️ Ajustar Estampa</button>
        </div>

        <div style="display:flex; gap:5px; margin-bottom:20px; flex-wrap:wrap;" id="part-buttons">
          <button class="btn-ghost part-btn active" data-part="frente">Frente</button>
          <button class="btn-ghost part-btn" data-part="costas">Costas</button>
          <button class="btn-ghost part-btn" data-part="manga">Mangas</button>
          <button class="btn-ghost part-btn" data-part="gola">Gola</button>
        </div>

        <div id="part-inputs">
          ${['frente', 'costas', 'manga', 'gola'].map(part => `
            <div class="upload-zone" data-upload="${part}" style="display:${part==='frente'?'block':'none'};">
              <input type="file" accept="image/*" data-file="${part}">
              <p>📤 Upload de Imagem (${part})</p>
              <p class="upload-status" data-status="${part}" style="color:var(--secondary);font-size:.8rem;"></p>
            </div>
          `).join('')}
        </div>

        <div id="edit-instructions" style="margin-top:20px; padding:15px; border:1px dashed var(--secondary); border-radius:8px; text-align:center;">
          <p style="font-size:0.85rem; color:var(--text-dim);">Modo Ajuste Ativo</p>
          <strong style="color:var(--secondary); font-size:1.1rem;" id="editLabel">Ajustando: Frente</strong><br>
          <span style="font-size:0.8rem;">Arraste com o <b>Botão Esquerdo</b> para mover.<br>Role o <b>Scroll</b> para aumentar/diminuir.<br><br><i>*Para rotacionar, clique em "Rotacionar Modelo" ou use o <b>Botão Direito</b> do mouse.</i></span>
        </div>

        <button class="btn-primary" id="saveTexSettings" style="margin-top:20px;">Salvar Todos os Ajustes</button>
        <button class="btn-ghost" id="backTexBtn">← Voltar</button>
      </div>
      <div><div class="preview-3d" id="adminPreview"></div></div>
    </div>`;

  document.getElementById('backTexBtn').onclick = () => { destroyPreview(); openAdminTab('camisetas'); };

  let currentPart = 'frente';
  let isEditMode = true;

  // Lógica de troca de modo (Rotação x Ajuste)
  const btnRotate = document.getElementById('modeRotate');
  const btnEdit = document.getElementById('modeEdit');
  const instructions = document.getElementById('edit-instructions');

  const setMode = (edit) => {
    isEditMode = edit;
    btnRotate.classList.toggle('active', !edit);
    btnEdit.classList.toggle('active', edit);
    instructions.style.opacity = edit ? '1' : '0.3';
    
    if (ADMIN.previewViewer) {
      if (!edit) {
        ADMIN.previewViewer.setEditingMode(null); // Desativa edição (libera rotação)
      } else {
        ADMIN.previewViewer.setEditingMode(currentPart); // Ativa edição
      }
    }
  };

  btnRotate.onclick = () => setMode(false);
  btnEdit.onclick = () => setMode(true);

  // Controle de Abas de partes da camisa
  const partBtns = document.querySelectorAll('.part-btn');
  partBtns.forEach(btn => {
    btn.onclick = () => {
      partBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentPart = btn.dataset.part;
      
      document.querySelectorAll('.upload-zone').forEach(z => z.style.display = 'none');
      document.querySelector(`[data-upload="${currentPart}"]`).style.display = 'block';
      document.getElementById('editLabel').textContent = `Ajustando: ${currentPart.charAt(0).toUpperCase() + currentPart.slice(1)}`;
      
      if (ADMIN.previewViewer && isEditMode) {
        ADMIN.previewViewer.setEditingMode(currentPart);
      }
    };
  });

  ['frente', 'costas', 'manga', 'gola'].forEach(part => {
    setupUpload(c, part, () => {});
  });

  document.getElementById('saveTexSettings').onclick = async () => {
    if (!ADMIN.previewViewer) return;
    const cfg = ADMIN.previewViewer.configs;
    const dados = {
      scale_frente: cfg.frente.scale, x_frente: cfg.frente.x, y_frente: cfg.frente.y,
      scale_costas: cfg.costas.scale, x_costas: cfg.costas.x, y_costas: cfg.costas.y,
      scale_manga: cfg.manga.scale, x_manga: cfg.manga.x, y_manga: cfg.manga.y,
      scale_gola: cfg.gola.scale
    };
    const r = await window.__apiPost({ action:'updateCamiseta', senha:getSenha(), id: c.id, dados });
    if(r.ok) { Object.assign(c, dados); window.__toast('Ajustes de textura salvos!'); }
  };

  initAdminPreview(c).then(() => {
    Promise.all([
      window.__loadTexture(c.textura_principal, c.cor_base),
      window.__loadTexture(c.textura_costas, c.cor_base),
      window.__loadTexture(c.textura_manga, c.cor_base),
      window.__loadTexture(c.textura_gola, c.cor_base)
    ]).then(([f, cB, m, g]) => {
      ADMIN.previewViewer.setTextures(f, cB, m, g, ADMIN.previewViewer.configs);
      setMode(true); // Inicia no modo edição por padrão
    });
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
      
      if (ADMIN.previewViewer) {
        const currentTextures = ADMIN.previewViewer.textures;
        currentTextures[tipo] = tex;
        ADMIN.previewViewer.setTextures(currentTextures.frente, currentTextures.costas, currentTextures.manga, currentTextures.gola, ADMIN.previewViewer.configs);
      }

      const base64 = dataUrl.split(',')[1];
      const r = await window.__apiPost({
        action:'uploadImagem', senha:getSenha(), camiseta_id: cam.id, tipo, base64,
        filename: input.files[0].name, mimeType: input.files[0].type
      });
      
      if (r.ok) {
        const campo = tipo === 'frente' ? 'textura_principal' : tipo === 'costas' ? 'textura_costas' : `textura_${tipo}`;
        cam[campo] = r.url;
        status.textContent = '✓ Salva!';
        window.__toast('Imagem enviada!');
      } else status.textContent = '✗ Erro';
    };
    reader.readAsDataURL(input.files[0]);
  };
}

async function initAdminPreview(cam) {
  const el = document.getElementById('adminPreview');
  destroyPreview();
  await new Promise(r => setTimeout(r, 60));
  ADMIN.previewViewer = await window.__createViewer(el, cam, { autoRotate: false });
}

function destroyPreview() {
  if (ADMIN.previewViewer) { ADMIN.previewViewer.destroy(); ADMIN.previewViewer = null; }
}
