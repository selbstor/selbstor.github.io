const URL_GRAVAR_PRODUTOS = ACHADINHOS.registrar_cliques;
let produtos = [];
let produtoEditando = null;

// ============ CARREGAR ============
async function carregarProdutos() {
  mostrarMensagem('Carregando produtos...');
  try {
    const resp = await fetch(ACHADINHOS.planilha_catalogo + '&t=' + Date.now(), {
      method: 'GET',
      mode: 'cors',
      cache: 'no-cache'
    });
    if (!resp.ok) {
      mostrarMensagem(`Erro HTTP ${resp.status} ao carregar planilha.`);
      return;
    }
    let texto = await resp.text();
    if (texto.charCodeAt(0) === 0xFEFF) texto = texto.slice(1); // Remove BOM
    produtos = parseCSV(texto);
    atualizarFiltroCategorias();
    renderizarTabela();
  } catch (e) {
    console.error('Erro:', e);
    mostrarMensagem(`Erro de conexão: ${e.message}`);
  }
}

// ============ PARSER CSV ROBUSTO ============
function parseCSV(texto) {
  const linhas = texto.split(/\r?\n/);
  if (linhas.length < 2) return [];
  let indiceCabecalho = -1;
  for (let i = 0; i < linhas.length; i++) {
    const l = linhas[i].toLowerCase();
    if (l.includes('ativo') && l.includes('nome')) {
      indiceCabecalho = i;
      break;
    }
  }
  if (indiceCabecalho === -1) indiceCabecalho = 0;
  
  const cabecalhos = parseLinhaCSV(linhas[indiceCabecalho]);
  return linhas.slice(indiceCabecalho + 1)
    .filter(l => l.trim().length > 0)
    .map((l, i) => {
      const cols = parseLinhaCSV(l);
      const obj = { _linha: indiceCabecalho + 1 + i + 1 };
      cabecalhos.forEach((h, idx) => {
        obj[h.trim()] = cols[idx] !== undefined ? cols[idx] : '';
      });
      return obj;
    });
}

function parseLinhaCSV(linha) {
  const res = [];
  let atual = '';
  let aspas = false;
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    const proximo = linha[i + 1];
    if (aspas) {
      if (c === '"' && proximo === '"') { atual += '"'; i++; } 
      else if (c === '"') { aspas = false; } 
      else { atual += c; }
    } else {
      if (c === '"') { aspas = true; } 
      else if (c === ',') { res.push(atual.trim()); atual = ''; } 
      else { atual += c; }
    }
  }
  res.push(atual.trim());
  return res;
}

// ============ BUSCA SEGURA (Normaliza acentos) ============
function get(p, ...nomes) {
  for (const nome of nomes) {
    for (const chave of Object.keys(p)) {
      if (chave.startsWith('_')) continue;
      const normChave = chave.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
      const normNome = nome.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
      if (normChave === normNome) return p[chave];
    }
  }
  return '';
}

// ============ ESCAPE HTML ============
function escapeHtml(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

// ============ FILTRO DE CATEGORIAS ============
function atualizarFiltroCategorias() {
  const sel = document.getElementById('filtroCategoria');
  const atual = sel.value;
  const cats = [...new Set(produtos.map(p => (get(p, 'Categoria') || '').trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'pt-BR'));
  sel.innerHTML = '<option value="">Todas as categorias</option>' +
    cats.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
  sel.value = cats.includes(atual) ? atual : '';
}

// ============ MENSAGEM (tabela + cards) ============
function mostrarMensagem(msg) {
  document.getElementById('corpoTabela').innerHTML = `<tr><td colspan="6" class="vazio">${escapeHtml(msg)}</td></tr>`;
  document.getElementById('listaCards').innerHTML = `<div class="vazio">${escapeHtml(msg)}</div>`;
}

// ============ RENDERIZAR (tabela no desktop, cards no celular) ============
function renderizarTabela() {
  const busca = (document.getElementById('busca').value || '').toLowerCase();
  const filtro = document.getElementById('filtroStatus').value;
  const filtroCat = document.getElementById('filtroCategoria').value;
  const corpo = document.getElementById('corpoTabela');
  const cards = document.getElementById('listaCards');

  const filtrados = produtos.filter(p => {
    const nome = (get(p, 'Nome') || '').toLowerCase();
    const cat = (get(p, 'Categoria') || '').toLowerCase();
    const ativo = get(p, 'Ativo');
    const matchBusca = !busca || nome.includes(busca) || cat.includes(busca);
    const matchStatus = !filtro || ativo === filtro;
    const matchCat = !filtroCat || (get(p, 'Categoria') || '').trim() === filtroCat;
    return matchBusca && matchStatus && matchCat;
  });

  if (filtrados.length === 0) {
    mostrarMensagem('Nenhum produto encontrado');
    return;
  }

  const dados = filtrados.map(p => ({
    linha: p._linha,
    nome: get(p, 'Nome') || '(sem nome)',
    img: (get(p, 'Imagem 1', 'Imagem') || '').trim(),
    cat: get(p, 'Categoria') || '-',
    destaque: get(p, 'Destaque') || 'Não',
    ativo: get(p, 'Ativo') || 'Sim'
  }));

  const botaoMenu = linha =>
    `<button type="button" class="btn-menu" title="Ações" aria-label="Ações" onclick="abrirMenu(event, ${linha})">⋮</button>`;

  // Tabela (desktop)
  corpo.innerHTML = dados.map(d => {
    const imgHtml = d.img
      ? `<img src="${escapeHtml(d.img)}" alt="" style="width:40px;height:40px;object-fit:cover;border-radius:4px;" onerror="this.style.display='none'">`
      : '—';
    return `
      <tr>
        <td>${imgHtml}</td>
        <td><strong>${escapeHtml(d.nome)}</strong></td>
        <td>${escapeHtml(d.cat)}</td>
        <td><span class="badge badge-${d.destaque === 'Sim' ? 'destaque' : 'nao'}">${escapeHtml(d.destaque)}</span></td>
        <td><span class="badge badge-${d.ativo === 'Sim' ? 'sim' : 'nao'}">${escapeHtml(d.ativo)}</span></td>
        <td class="acoes">${botaoMenu(d.linha)}</td>
      </tr>
    `;
  }).join('');

  // Cards (celular)
  cards.innerHTML = dados.map(d => {
    const imgHtml = d.img
      ? `<img src="${escapeHtml(d.img)}" alt="" onerror="this.style.display='none'">`
      : '🛍️';
    return `
      <div class="card-produto">
        <div class="card-img">${imgHtml}</div>
        <div class="card-info">
          <div class="card-nome">${escapeHtml(d.nome)}</div>
          <div class="card-cat">${escapeHtml(d.cat)}</div>
          <div class="card-badges">
            <span class="badge badge-${d.destaque === 'Sim' ? 'destaque' : 'nao'}">${d.destaque === 'Sim' ? '★ Destaque' : 'Sem destaque'}</span>
            <span class="badge badge-${d.ativo === 'Sim' ? 'sim' : 'nao'}">${d.ativo === 'Sim' ? 'Ativo' : 'Inativo'}</span>
          </div>
        </div>
        ${botaoMenu(d.linha)}
      </div>
    `;
  }).join('');
}

// ============ MENU DE AÇÕES (três pontinhos) ============
let menuLinha = null;

function abrirMenu(ev, linha) {
  ev.stopPropagation();
  const menu = document.getElementById('menuAcoes');
  if (!menu.classList.contains('oculto') && menuLinha === linha) { fecharMenu(); return; }
  menuLinha = linha;
  menu.classList.remove('oculto');
  const r = ev.currentTarget.getBoundingClientRect();
  const w = menu.offsetWidth, h = menu.offsetHeight;
  const left = Math.min(Math.max(8, r.right - w), window.innerWidth - w - 8);
  let top = r.bottom + 4;
  if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 4);
  menu.style.left = left + 'px';
  menu.style.top = top + 'px';
}

function fecharMenu() {
  document.getElementById('menuAcoes').classList.add('oculto');
  menuLinha = null;
}

function acaoMenu(tipo) {
  const linha = menuLinha;
  fecharMenu();
  if (linha === null) return;
  if (tipo === 'editar') editar(linha);
  else if (tipo === 'excluir') excluir(linha);
}

document.addEventListener('click', e => { if (!e.target.closest('#menuAcoes')) fecharMenu(); });
window.addEventListener('scroll', fecharMenu, true);
window.addEventListener('resize', fecharMenu);

// ============ MODAL ============
function abrirModal() { document.getElementById('modal').classList.remove('oculto'); }
function fecharModal() {
  document.getElementById('modal').classList.add('oculto');
  document.getElementById('formProduto').reset();
  produtoEditando = null;
}
function novoProduto() {
  produtoEditando = null;
  document.getElementById('modalTitulo').textContent = 'Novo Produto';
  document.getElementById('formProduto').reset();
  document.getElementById('campoLinha').value = '';
  abrirModal();
}

// ✅ CORRIGIDO: Agora preenche TODOS os campos da planilha
function editar(linha) {
  const p = produtos.find(x => x._linha === linha);
  if (!p) { alert('Produto não encontrado'); return; }
  
  produtoEditando = p;
  document.getElementById('modalTitulo').textContent = 'Editar Produto';
  document.getElementById('campoLinha').value = linha;
  
  document.getElementById('ativo').value = get(p, 'Ativo') || 'Sim';
  document.getElementById('tipo').value = get(p, 'Tipo') || 'FISICO';
  document.getElementById('plataforma').value = get(p, 'Plataforma') || '';
  document.getElementById('categoria').value = get(p, 'Categoria') || '';
  document.getElementById('subcategoria').value = get(p, 'Subcategoria') || '';
  
  document.getElementById('nome').value = get(p, 'Nome') || '';
  document.getElementById('descricao').value = get(p, 'Descrição') || '';
  document.getElementById('preco').value = get(p, 'Preço') || '';
  document.getElementById('precoPromocional').value = get(p, 'Preço Promocional') || '';
  document.getElementById('cupom').value = get(p, 'Cupom') || '';
  
  document.getElementById('validade').value = get(p, 'Validade da oferta') || '';
  document.getElementById('link').value = get(p, 'Link de Afiliado', 'Link') || '';
  document.getElementById('textoBotao').value = get(p, 'Texto do Botão') || '';
  document.getElementById('video').value = get(p, 'Vídeo (URL YouTube)', 'Vídeo') || '';
  
  document.getElementById('imagem1').value = get(p, 'Imagem 1', 'Imagem') || '';
  document.getElementById('imagem2').value = get(p, 'Imagem 2') || '';
  document.getElementById('imagem3').value = get(p, 'Imagem 3') || '';
  document.getElementById('imagem4').value = get(p, 'Imagem 4') || '';  
  
  document.getElementById('ordem').value = get(p, 'Ordem') || '0';
  document.getElementById('destaque').value = get(p, 'Destaque') || 'Não';
  
  abrirModal();
}

// ============ SALVAR ============
document.getElementById('formProduto').addEventListener('submit', async (e) => {
  e.preventDefault();
  const linha = document.getElementById('campoLinha').value;
  
  // ✅ CORRIGIDO: Objeto com TODAS as 20 colunas exatas da planilha
  const produto = {
    'Ativo': document.getElementById('ativo').value,
    'Tipo': document.getElementById('tipo').value.trim(),
    'Plataforma': document.getElementById('plataforma').value.trim(),
    'Categoria': document.getElementById('categoria').value.trim(),
    'Subcategoria': document.getElementById('subcategoria').value.trim(),
    'Nome': document.getElementById('nome').value.trim(),
    'Descrição': document.getElementById('descricao').value.trim(),
    'Preço': document.getElementById('preco').value.trim(),
    'Preço Promocional': document.getElementById('precoPromocional').value.trim(),
    'Cupom': document.getElementById('cupom').value.trim(),
    'Validade da oferta': document.getElementById('validade').value.trim(),
    'Link de Afiliado': document.getElementById('link').value.trim(),
    'Texto do Botão': document.getElementById('textoBotao').value.trim(),
    'Vídeo (URL YouTube)': document.getElementById('video').value.trim(),
    'Imagem 1': document.getElementById('imagem1').value.trim(),
    'Imagem 2': document.getElementById('imagem2').value.trim(),
    'Imagem 3': document.getElementById('imagem3').value.trim(),
    'Imagem 4': document.getElementById('imagem4').value.trim(),
    'Ordem': document.getElementById('ordem').value.trim(),
    'Destaque': document.getElementById('destaque').value,
  };
  
  const dados = {
    acao: linha ? 'editar' : 'novo',
    linha: linha ? parseInt(linha) : null,
    produto: produto
  };
  
  try {
    toast('💾 Salvando...', '');
    const urlEnvio = `${URL_GRAVAR_PRODUTOS}?data=${encodeURIComponent(JSON.stringify(dados))}`;
    const resp = await fetch(urlEnvio, { method: 'GET' });
    const texto = await resp.text();
    
    let resJson;
    try { resJson = JSON.parse(texto); } 
    catch (parseErr) {
      console.error('Resposta inválida:', texto);
      toast('❌ Servidor retornou resposta inválida.', 'erro');
      return;
    }

    if (resJson.ok) {
      toast('✅ ' + (resJson.msg || 'Salvo com sucesso!'), 'sucesso');
      fecharModal();
      setTimeout(carregarProdutos, 1500);
    } else {
      toast('❌ Erro: ' + (resJson.msg || 'Desconhecido'), 'erro');
    }
  } catch (err) {
    console.error(err);
    toast('❌ Erro de rede: ' + err.message, 'erro');
  }
});

// ============ EXCLUIR ============
async function excluir(linha) {
  const p = produtos.find(x => x._linha === linha);
  const nomeProduto = p ? (get(p, 'Nome') || 'este produto') : 'este produto';
  if (!confirm(`Deseja realmente excluir:\n\n"${nomeProduto}"?`)) return;
  
  try {
    toast('🗑️ Excluindo...', '');
    const dados = { acao: 'excluir', linha: linha };
    const urlEnvio = `${URL_GRAVAR_PRODUTOS}?data=${encodeURIComponent(JSON.stringify(dados))}`;
    const resp = await fetch(urlEnvio, { method: 'GET' });
    const texto = await resp.text();
    
    let resJson;
    try { resJson = JSON.parse(texto); } 
    catch (err) {
      toast('❌ Resposta inválida do servidor', 'erro');
      return;
    }

    if (resJson.ok) {
      toast('✅ Excluído com sucesso!', 'sucesso');
      setTimeout(carregarProdutos, 1500);
    } else {
      toast('❌ Erro: ' + (resJson.msg || 'Desconhecido'), 'erro');
    }
  } catch (err) {
    toast('❌ Erro de rede: ' + err.message, 'erro');
  }
}

function toast(msg, tipo) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.className = 'toast ' + (tipo || '');
  t.classList.remove('oculto');
  setTimeout(() => t.classList.add('oculto'), 3500);
}

// ============ EVENTOS ============
document.getElementById('btnNovo').onclick = novoProduto;
document.getElementById('btnRecarregar').onclick = carregarProdutos;
document.getElementById('busca').oninput = renderizarTabela;
document.getElementById('filtroStatus').onchange = renderizarTabela;
document.getElementById('filtroCategoria').onchange = renderizarTabela;

// Inicializa
carregarProdutos();
