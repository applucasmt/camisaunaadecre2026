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
      window.__toast('Bem-vindo!', false);
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
    else window.__toast('Erro', true);
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

function editCamisetaTexturas(id) {
  const c = window.__state.camisetas.find(x => String(x.id) === String(id));
  const content = document.getElementById('adminContent');
  
  const cBase = c.cor_base || '#ffffff';
  const cCorpo = c.cor_corpo || '#e0e0e0';
  const cCabelo = c.cor_cabelo || '#333333';
  const cCalca = c.cor_calca || '#1a1a1a';
  const cSapato = c.cor_sapato || '#ffffff';

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
          <h3 style="margin-bottom: 12px; font-size: 1rem; color: var(--accent);">Frente</h3>
          <div><label>URL / Base64</label><input type="text" id="urlFrente" value="${c.textura_principal || ''}"></div>
          <div style="margin-top:8px;"><label>Upload Local</label><input type="file" id="fileFrente" accept="image/*"></div>
        </div>

        <div style="background: #111; padding: 16px; border-radius: 12px; border: 1px solid var(--border);">
          <h3 style="margin-bottom: 12px; font-size: 1rem; color: var(--accent);">Costas</h3>
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

        <div style="background: #111; padding: 16px; border-radius: 12px; border: 1px solid var(--border);">
          <h3 style="margin-bottom: 12px; font-size: 1rem; color: var(--accent);">Cores do Manequim</h3>
          <div style="display:flex; gap:8px; margin-bottom:8px;">
            <div style="flex:1"><label>Corpo</label><input type="color" id="corCorpo" value="${cCorpo}" style="height:40px; padding:4px; cursor:pointer; width:100%"></div>
            <div style="flex:1"><label>Cabelo</label><input type="color" id="corCabelo" value="${cCabelo}" style="height:40px; padding:4px; cursor:pointer; width:100%"></div>
            <div style="flex:1"><label>Calça</label><input type="color" id="corCalca" value="${cCalca}" style="height:40px; padding:4px; cursor:pointer; width:100%"></div>
            <div style="flex:1"><label>Sapato</label><input type="color" id="corSapato" value="${cSapato}" style="height:40px; padding:4px; cursor:pointer; width:100%"></div>
          </div>
          <div><label>Cor Base (Fundo)</label><input type="color" id="corBase" value="${cBase}" style="height:40px; padding:4px; cursor:pointer; width:100%"></div>
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
      ADMIN.previewViewer.setTextures(null, null, null, null, ADMIN.previewViewer.getConfigs(), document.getElementById('corBase').value);
    };

    const handleUpload = async (e, inputId, textureKey) => {
      const file = e.target.files[0];
      if (file) {
        const base64 = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.readAsDataURL(file);
          reader.onload = () => resolve(reader.result);
        });
        document.getElementById(inputId).value = base64; 
        
        window.__loadTexture(base64, c.cor_base).then(t => {
          const args = { frente: [t, null, null, null], costas: [null, t, null, null], manga: [null, null, t, null], gola: [null, null, null, t] }[textureKey];
          ADMIN.previewViewer.setTextures(...args, ADMIN.previewViewer.getConfigs(), document.getElementById('corBase').value);
        });
      }
    };

    document.getElementById('fileFrente').onchange = (e) => handleUpload(e, 'urlFrente', 'frente');
    document.getElementById('fileCostas').onchange = (e) => handleUpload(e, 'urlCostas', 'costas');
    document.getElementById('fileManga').onchange = (e) => handleUpload(e, 'urlManga', 'manga');
    document.getElementById('fileGola').onchange = (e) => handleUpload(e, 'urlGola', 'gola');

    const handleUrl = (e, textureKey) => {
      window.__loadTexture(e.target.value, c.cor_base).then(t => {
        const args = { frente: [t, null, null, null], costas: [null, t, null, null], manga: [null, null, t, null], gola: [null, null, null, t] }[textureKey];
        ADMIN.previewViewer.setTextures(...args, ADMIN.previewViewer.getConfigs(), document.getElementById('corBase').value);
      });
    };
    document.getElementById('urlFrente').onchange = (e) => handleUrl(e, 'frente');
    document.getElementById('urlCostas').onchange = (e) => handleUrl(e, 'costas');
    document.getElementById('urlManga').onchange = (e) => handleUrl(e, 'manga');
    document.getElementById('urlGola').onchange = (e) => handleUrl(e, 'gola');

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
        x_frente: cfgFrente.x, y_frente: cfgFrente.y, scale_frente: cfgFrente.scale,
        x_costas: cfgCostas.x, y_costas: cfgCostas.y, scale_costas: cfgCostas.scale,
        x_manga: cfgManga.x, y_manga: cfgManga.y, scale_manga: cfgManga.scale,
        x_gola: cfgGola.x, y_gola: cfgGola.y, scale_gola: cfgGola.scale,
        cor_corpo: document.getElementById('corCorpo').value,
        cor_cabelo: document.getElementById('corCabelo').value,
        cor_calca: document.getElementById('corCalca').value,
        cor_sapato: document.getElementById('corSapato').value,
        cor_base: document.getElementById('corBase').value
      };
      const r = await window.__apiPost({ action:'updateCamiseta', senha:getSenha(), id: c.id, dados });
      if (r.ok) {
        Object.assign(c, dados);
        window.__toast('Modelo salvo com sucesso!', false);
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
