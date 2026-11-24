import { supabase, supabaseConfigured } from '../lib/supabase.js';

const categoryEmoji = {
  'Eletrônicos': '🎧',
  'Acessórios': '🔑',
  'Material escolar': '🎒',
  'Outros': '📦'
};

const pageSize = 12;
const achadoFields = 'id,codigo,nome,descricao,categoria,local,complemento,encontrado_em,status,foto_url,criado_em,atualizado_em';

function formatDate(value) {
  if (!value) return '';
  return new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short'
  });
}

function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = value ?? '';
  return div.innerHTML;
}

function renderGridState(container, message, { isError = false, onRetry } = {}) {
  container.replaceChildren();
  const state = document.createElement('p');
  state.className = `grid-state${isError ? ' is-error' : ''}`;
  state.setAttribute('role', isError ? 'alert' : 'status');
  state.textContent = message;
  container.append(state);

  if (onRetry) {
    const retry = document.createElement('button');
    retry.className = 'button button-outline';
    retry.type = 'button';
    retry.textContent = 'Tentar novamente';
    retry.addEventListener('click', onRetry, { once: true });
    container.append(retry);
  }
}

function renderTableState(container, message, { isError = false, onRetry } = {}) {
  container.replaceChildren();
  const row = document.createElement('tr');
  const cell = document.createElement('td');
  cell.colSpan = 6;
  cell.className = isError ? 'table-state is-error' : 'table-state';
  cell.setAttribute('role', isError ? 'alert' : 'status');
  cell.textContent = message;
  if (onRetry) {
    const retry = document.createElement('button');
    retry.className = 'row-action';
    retry.type = 'button';
    retry.textContent = 'Tentar novamente';
    retry.addEventListener('click', onRetry, { once: true });
    cell.append(' ', retry);
  }
  row.append(cell);
  container.append(row);
}

function showMessage(message, isError = false) {
  const alert = document.createElement('div');
  alert.setAttribute('role', isError ? 'alert' : 'status');
  alert.textContent = message;
  alert.style.cssText = `position:fixed;z-index:50;right:20px;bottom:20px;max-width:360px;padding:13px 16px;border-radius:8px;color:white;background:${isError ? '#b96850' : '#18745c'};box-shadow:0 8px 30px #172a2630;font-size:12px`;
  document.body.appendChild(alert);
  setTimeout(() => alert.remove(), 5000);
}

function showAuthError(message) {
  const error = document.querySelector('#auth-error');
  if (!error) {
    showMessage(message, true);
    return;
  }
  error.textContent = message;
  error.hidden = false;
}

function setStaffHeader(profile) {
  const name = document.querySelector('#staff-name');
  const avatar = document.querySelector('#staff-avatar');
  const role = document.querySelector('#staff-role');
  const logout = document.querySelector('#logout');
  if (name) name.textContent = profile.nome;
  if (avatar) avatar.textContent = profile.nome.slice(0, 1).toUpperCase();
  if (role) role.textContent = profile.papel === 'administrador' ? 'Administrador' : 'Equipe administrativa';
  if (logout) logout.hidden = false;
  logout?.addEventListener('click', async () => {
    const { error } = await supabase.auth.signOut();
    if (error) showMessage(`Não foi possível sair: ${error.message}`, true);
    else location.href = 'gerenciar.html';
  }, { once: true });
}

async function getStaffProfile() {
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  if (!session) return { session: null, profile: null };

  const { data: profile, error } = await supabase
    .from('perfis')
    .select('id,nome,papel')
    .eq('id', session.user.id)
    .maybeSingle();
  if (error) throw error;
  return { session, profile };
}

async function getAchados({ category = '', status = '', date = '' } = {}) {
  let query = supabase.from('achados').select(achadoFields).order('criado_em', { ascending: false });
  if (category) query = query.eq('categoria', category);
  if (status) query = query.eq('status', status);
  if (date) query = query.eq('encontrado_em', date);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

function renderPhoto(item, className = 'object-photo') {
  const image = item.foto_url
    ? `<img class="${className}-image" src="${escapeHtml(item.foto_url)}" alt="Foto: ${escapeHtml(item.nome)}">`
    : `<span class="object-emoji" aria-hidden="true">${categoryEmoji[item.categoria] ?? '📦'}</span>`;
  return image;
}

async function initIndex() {
  const grid = document.querySelector('.object-grid');
  if (!grid) return;

  const params = new URLSearchParams(location.search);
  const search = params.get('q') ?? '';
  const category = params.get('categoria') ?? '';
  const date = params.get('data') ?? '';
  const input = document.querySelector('input[name="q"]');
  const select = document.querySelector('select[name="categoria"]');
  const dateInput = document.querySelector('input[name="data"]');
  const count = document.querySelector('.result-count');
  const heading = document.querySelector('#achados-titulo');
  if (input) input.value = search;
  if (select) select.value = category;
  if (dateInput) dateInput.value = date;
  if (heading && date) {
    const formattedDate = new Date(`${date}T12:00:00`).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'long'
    });
    heading.firstChild.textContent = `Achados de ${formattedDate} `;
  }
  if (!supabaseConfigured) {
    renderGridState(grid, 'Configure o Supabase para consultar os achados.', { isError: true });
    grid.setAttribute('aria-busy', 'false');
    return;
  }

  const loadMore = document.querySelector('.load-more');
  const loadButton = document.querySelector('#carregar-mais');
  let achados = [];
  let visibleCount = pageSize;

  function renderCards() {
    const visible = achados.slice(0, visibleCount);
    grid.innerHTML = visible.map((item) => `
      <a class="object-card" href="detalhe.html?id=${encodeURIComponent(item.id)}">
        <div class="object-photo photo-backpack">
          <span class="photo-badge"><span class="status-dot"></span>Disponível</span>
          ${renderPhoto(item)}
          <span class="photo-label">${escapeHtml(item.categoria.toUpperCase())}</span>
        </div>
        <div class="object-info">
          <div class="object-title-row"><h3>${escapeHtml(item.nome)}</h3><span class="card-arrow">↗</span></div>
          <p>Encontrado em ${escapeHtml(item.local)}</p>
          <div class="object-meta"><span>◷ &nbsp;${formatDate(item.encontrado_em)}</span><span class="meta-category">${escapeHtml(item.categoria)}</span></div>
        </div>
      </a>`).join('');
    if (loadMore) loadMore.hidden = achados.length <= visibleCount;
  }

  if (loadButton) {
    loadButton.onclick = () => {
      visibleCount += pageSize;
      renderCards();
    };
  }

  async function loadResults() {
    grid.setAttribute('aria-busy', 'true');
    renderGridState(grid, 'Carregando achados...');
    if (count) count.textContent = '0';
    try {
      const allAchados = await getAchados({ category, status: 'disponivel', date });
      const normalizedSearch = search.trim().toLocaleLowerCase('pt-BR');
      achados = allAchados.filter((item) => !normalizedSearch
        || `${item.nome} ${item.descricao}`.toLocaleLowerCase('pt-BR').includes(normalizedSearch));
      visibleCount = pageSize;
      if (count) count.textContent = String(achados.length);

      document.querySelectorAll('.category-chip').forEach((chip) => {
        const chipCategory = new URL(chip.href).searchParams.get('categoria') ?? '';
        const chipUrl = new URL(chip.href);
        if (search) chipUrl.searchParams.set('q', search);
        else chipUrl.searchParams.delete('q');
        if (date) chipUrl.searchParams.set('data', date);
        else chipUrl.searchParams.delete('data');
        if (chipCategory) chipUrl.searchParams.set('categoria', chipCategory);
        else chipUrl.searchParams.delete('categoria');
        chip.href = `${chipUrl.pathname.split('/').pop()}${chipUrl.search}`;
        chip.classList.toggle('selected', chipCategory === category);
        if (chipCategory === '') chip.innerHTML = `Tudo <span>${achados.length}</span>`;
      });

      if (!achados.length) {
        renderGridState(grid, 'Nenhum achado disponível corresponde a estes filtros.');
        if (loadMore) loadMore.hidden = true;
        return;
      }
      renderCards();
    } catch (error) {
      renderGridState(grid, `Não foi possível carregar os achados: ${error.message}`, {
        isError: true,
        onRetry: loadResults
      });
      if (loadMore) loadMore.hidden = true;
    } finally {
      grid.setAttribute('aria-busy', 'false');
    }
  }

  await loadResults();
}

async function uploadPhoto(file, userId) {
  if (!file) return null;
  if (!['image/jpeg', 'image/png'].includes(file.type)) throw new Error('A foto deve estar em JPG ou PNG.');
  if (file.size > 5 * 1024 * 1024) throw new Error('A foto deve ter no máximo 5 MB.');

  const extension = file.type === 'image/png' ? 'png' : 'jpg';
  const path = `${userId}/${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from('achados-fotos').upload(path, file, {
    contentType: file.type,
    upsert: false
  });
  if (error) throw error;
  const { data } = supabase.storage.from('achados-fotos').getPublicUrl(path);
  return { path, url: data.publicUrl };
}

async function initCadastro() {
  const form = document.querySelector('#cadastro-achado');
  if (!form) return;
  const feedback = document.querySelector('#form-feedback');
  const setFeedback = (message, isError = false) => {
    if (!feedback) {
      showMessage(message, isError);
      return;
    }
    feedback.textContent = message;
    feedback.classList.toggle('is-error', isError);
    feedback.hidden = !message;
  };
  const disableSubmit = () => {
    const button = form.querySelector('button[type="submit"]');
    if (button) button.disabled = true;
  };
  if (!supabaseConfigured) {
    setFeedback('Configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no arquivo .env.', true);
    disableSubmit();
    return;
  }

  let staff;
  try {
    staff = await getStaffProfile();
  } catch (error) {
    setFeedback(`Não foi possível validar o acesso: ${error.message}`, true);
    disableSubmit();
    return;
  }
  if (!staff.session || !staff.profile) {
    setFeedback('Entre com uma conta autorizada da equipe para cadastrar achados.', true);
    location.href = 'gerenciar.html';
    return;
  }
  setStaffHeader(staff.profile);

  const dateInput = form.elements.data;
  const today = new Date();
  const defaultDate = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0')
  ].join('-');
  dateInput.value = defaultDate;

  const editId = new URLSearchParams(location.search).get('editar');
  if (editId) {
    const { data, error } = await supabase.from('achados').select(achadoFields).eq('id', editId).single();
    if (error) {
      setFeedback(`Não foi possível carregar este achado: ${error.message}`, true);
      disableSubmit();
      return;
    }
    form.elements.nome.value = data.nome;
    form.elements.categoria.value = data.categoria;
    form.elements.data.value = data.encontrado_em;
    form.elements.descricao.value = data.descricao;
    form.elements.local.value = data.local;
    form.elements.complemento.value = data.complemento ?? '';
    form.querySelector('button[type="submit"]').firstChild.textContent = 'Salvar alterações ';
  }

  const photoInput = form.elements.foto;
  const photoName = document.querySelector('#foto-nome');
  photoInput?.addEventListener('change', () => {
    const file = photoInput.files[0];
    if (photoName) photoName.textContent = file?.name ?? 'JPG ou PNG · até 5 MB';
  });

  const nameInput = form.elements.nome;
  const descriptionInput = form.elements.descricao;
  const locationInput = form.elements.local;
  [nameInput, descriptionInput, locationInput].forEach((input) => {
    input.addEventListener('input', () => input.setCustomValidity(''));
    input.addEventListener('change', () => input.setCustomValidity(''));
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = form.querySelector('button[type="submit"]');
    nameInput.setCustomValidity(nameInput.value.trim().length < 3
      ? 'Informe um nome com pelo menos 3 caracteres.'
      : '');
    descriptionInput.setCustomValidity(descriptionInput.value.trim().length < 10
      ? 'Informe uma descrição com pelo menos 10 caracteres.'
      : '');
    locationInput.setCustomValidity(locationInput.value.trim().length < 2
      ? 'Informe o local onde o objeto foi encontrado.'
      : '');
    if (!form.reportValidity()) return;

    button.disabled = true;
    button.textContent = 'Salvando...';
    form.setAttribute('aria-busy', 'true');
    let uploadedPhoto = null;
    try {
      const values = Object.fromEntries(new FormData(form));
      const file = photoInput?.files[0];
      uploadedPhoto = await uploadPhoto(file, staff.session.user.id);
      const achado = {
        nome: values.nome.trim(),
        categoria: values.categoria,
        encontrado_em: values.data,
        descricao: values.descricao.trim(),
        local: values.local,
        complemento: values.complemento.trim() || null
      };
      if (uploadedPhoto) achado.foto_url = uploadedPhoto.url;

      const operation = editId
        ? supabase.from('achados').update(achado).eq('id', editId)
        : supabase.from('achados').insert({
          ...achado,
          criado_por: staff.session.user.id,
          status: 'disponivel'
        });
      const { error } = await operation;
      if (error) throw error;
      setFeedback(editId ? 'Achado atualizado com sucesso.' : 'Achado cadastrado com sucesso.');
      if (!editId) {
        form.reset();
        dateInput.value = defaultDate;
        if (photoName) photoName.textContent = 'JPG ou PNG · até 5 MB';
        [nameInput, descriptionInput, locationInput].forEach((input) => input.setCustomValidity(''));
      }
    } catch (error) {
      let message = `Não foi possível salvar o achado: ${error.message}`;
      if (uploadedPhoto) {
        try {
          const { error: cleanupError } = await supabase.storage.from('achados-fotos').remove([uploadedPhoto.path]);
          if (cleanupError) message += ` Também não foi possível remover a foto enviada: ${cleanupError.message}`;
        } catch (cleanupError) {
          message += ` Também não foi possível remover a foto enviada: ${cleanupError.message}`;
        }
      }
      setFeedback(message, true);
    } finally {
      button.disabled = false;
      button.innerHTML = editId
        ? 'Salvar alterações <span aria-hidden="true">→</span>'
        : 'Publicar achado <span aria-hidden="true">→</span>';
      form.setAttribute('aria-busy', 'false');
    }
  });
}

async function initGerenciar() {
  const tbody = document.querySelector('#achados-gerenciar');
  if (!tbody) return;
  const loginPanel = document.querySelector('#login-panel');
  const content = document.querySelector('#manage-content');
  if (!supabaseConfigured) {
    showAuthError('Configure as credenciais do Supabase no arquivo .env.');
    return;
  }

  let staff;
  try {
    staff = await getStaffProfile();
  } catch (error) {
    showAuthError(`Não foi possível validar o acesso: ${error.message}`);
    return;
  }
  if (!staff.session) {
    loginPanel.hidden = false;
    document.querySelector('#login-equipe')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const button = form.querySelector('button[type="submit"]');
      button.disabled = true;
      const data = Object.fromEntries(new FormData(form));
      const { error } = await supabase.auth.signInWithPassword(data);
      if (error) {
        showAuthError(`Falha no login: ${error.message}`);
        button.disabled = false;
      } else {
        location.reload();
      }
    });
    return;
  }
  if (!staff.profile) {
    showAuthError('Esta conta ainda não está autorizada para a equipe. Peça ao administrador para cadastrar seu perfil no Supabase.');
    return;
  }

  setStaffHeader(staff.profile);
  content.hidden = false;
  const searchInput = document.querySelector('.table-search input');
  const filterButtons = [...document.querySelectorAll('[data-status]')];
  let activeStatus = '';
  let timer;

  for (const button of filterButtons) {
    button.addEventListener('click', () => {
      activeStatus = button.dataset.status;
      filterButtons.forEach((item) => item.classList.toggle('active', item === button));
      loadTable();
    });
  }
  searchInput?.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(loadTable, 250);
  });

  await loadTable();

  async function loadTable() {
    tbody.setAttribute('aria-busy', 'true');
    renderTableState(tbody, 'Carregando achados...');
    let data;
    let error;
    try {
      ({ data, error } = await supabase
        .from('achados')
        .select(achadoFields)
        .order('criado_em', { ascending: false }));
    } catch (requestError) {
      error = requestError;
    }
    if (error) {
      renderTableState(tbody, `Erro ao carregar registros: ${error.message}`, {
        isError: true,
        onRetry: loadTable
      });
      tbody.setAttribute('aria-busy', 'false');
      return;
    }
    const rows = data ?? [];
    const available = rows.filter((item) => item.status === 'disponivel').length;
    const returned = rows.length - available;
    const today = new Date().toISOString().slice(0, 10);
    document.querySelector('#stat-disponiveis').textContent = available;
    document.querySelector('#stat-devolvidos').textContent = returned;
    document.querySelector('#stat-hoje').textContent = rows.filter((item) => item.criado_em.slice(0, 10) === today).length;
    document.querySelector('#count-todos').textContent = rows.length;
    document.querySelector('#count-disponiveis').textContent = available;
    document.querySelector('#count-devolvidos').textContent = returned;
    document.querySelector('.table-count').textContent = rows.length;

    const term = searchInput?.value.trim().toLocaleLowerCase('pt-BR') ?? '';
    const filtered = rows.filter((item) => {
      const statusMatches = !activeStatus || item.status === activeStatus;
      const termMatches = !term || `${item.nome} ${item.descricao} ${item.categoria} ${item.local}`.toLocaleLowerCase('pt-BR').includes(term);
      return statusMatches && termMatches;
    });
    document.querySelector('#table-footer-count').textContent = `Mostrando ${filtered.length} de ${rows.length} registros`;
    if (!filtered.length) {
      renderTableState(tbody, rows.length
        ? 'Nenhum registro corresponde à pesquisa.'
        : 'Ainda não há achados cadastrados.');
      tbody.setAttribute('aria-busy', 'false');
      return;
    }

    tbody.innerHTML = filtered.map((item) => `
      <tr data-id="${escapeHtml(item.id)}">
        <td><span class="table-object-emoji">${categoryEmoji[item.categoria] ?? '📦'}</span><span class="table-object-name">${escapeHtml(item.nome)}<small>#${escapeHtml(item.codigo)}</small></span></td>
        <td>${escapeHtml(item.categoria)}</td>
        <td>${escapeHtml(item.local)}</td>
        <td>${formatDate(item.encontrado_em)}</td>
        <td><button class="table-status js-status" type="button" title="Atualizar status"><i></i> ${item.status === 'devolvido' ? 'Devolvido' : 'Disponível'}</button></td>
        <td><div class="row-actions"><a class="row-action" href="cadastro.html?editar=${encodeURIComponent(item.id)}">Editar</a>${staff.profile.papel === 'administrador' ? '<button class="row-action row-delete js-delete" type="button">Excluir</button>' : ''}</div></td>
      </tr>`).join('');

    tbody.querySelectorAll('.js-status').forEach((button) => {
      button.addEventListener('click', async () => {
        const row = button.closest('tr');
        const current = button.textContent.includes('Devolvido') ? 'devolvido' : 'disponivel';
        const { error } = await supabase.from('achados').update({
          status: current === 'devolvido' ? 'disponivel' : 'devolvido'
        }).eq('id', row.dataset.id);
        if (error) showMessage(`Erro ao atualizar: ${error.message}`, true);
        else await loadTable();
      });
    });

    tbody.querySelectorAll('.js-delete').forEach((button) => {
      button.addEventListener('click', async () => {
        if (!confirm('Excluir este achado? Esta ação não pode ser desfeita.')) return;
        const row = button.closest('tr');
        const { error } = await supabase.from('achados').delete().eq('id', row.dataset.id);
        if (error) showMessage(`Erro ao excluir: ${error.message}`, true);
        else {
          showMessage('Achado excluído.');
          await loadTable();
        }
      });
    });
    tbody.setAttribute('aria-busy', 'false');
  }
}

async function initDetalhe() {
  if (!location.pathname.endsWith('detalhe.html')) return;
  const state = document.querySelector('#detalhe-state');
  const layout = document.querySelector('.detail-layout');
  if (!state || !layout) return;

  function showDetailState(message, isError = false) {
    state.textContent = message;
    state.className = `detail-state${isError ? ' is-error' : ''}`;
    state.setAttribute('role', isError ? 'alert' : 'status');
    state.hidden = false;
    layout.hidden = true;
  }

  showDetailState('Carregando os detalhes do achado...');
  if (!supabaseConfigured) {
    showDetailState('Configure o Supabase para consultar este achado.', true);
    return;
  }

  const id = new URLSearchParams(location.search).get('id');
  if (!id) {
    showDetailState('Não foi informado qual achado deve ser exibido.', true);
    return;
  }

  let data;
  try {
    const result = await supabase.from('achados').select(achadoFields).eq('id', id).single();
    if (result.error) throw result.error;
    data = result.data;
  } catch (error) {
    showDetailState(`Não foi possível abrir este achado: ${error.message}`, true);
    return;
  }

  state.hidden = true;
  layout.hidden = false;
  document.title = `${data.nome} — Achei!`;
  document.querySelector('#detalhe-nome').textContent = data.nome;
  document.querySelector('.detail-description').textContent = data.descricao;
  document.querySelector('.detail-lead').textContent = data.status === 'devolvido'
    ? 'Este objeto já foi devolvido.'
    : 'Um objeto que pode estar esperando por você.';
  document.querySelector('.detail-id').textContent = `· #${data.codigo}`;
  const facts = document.querySelectorAll('.fact strong');
  if (facts[0]) facts[0].textContent = data.local;
  if (facts[1]) facts[1].textContent = formatDate(data.encontrado_em);
  if (facts[2]) facts[2].textContent = data.categoria;
  const imageCaption = document.querySelector('.image-caption');
  const emoji = document.querySelector('.detail-emoji');
  if (data.foto_url) {
    const image = document.createElement('img');
    image.className = 'detail-image';
    image.src = data.foto_url;
    image.alt = `Foto de ${data.nome}`;
    emoji?.replaceWith(image);
    if (imageCaption) imageCaption.textContent = 'Foto do objeto';
  } else if (emoji) {
    emoji.textContent = categoryEmoji[data.categoria] ?? '📦';
  }
  if (data.status === 'devolvido') {
    const badge = document.querySelector('.detail-photo .photo-badge');
    if (badge) {
      badge.classList.add('is-returned');
      badge.innerHTML = '<span class="status-dot"></span>Devolvido';
    }
    document.querySelector('.claim-card')?.remove();
    document.querySelector('.button-wide')?.remove();
  } else {
    const badge = document.querySelector('.detail-photo .photo-badge');
    if (badge) badge.innerHTML = '<span class="status-dot"></span>Disponível para retirada';
  }
}

initIndex();
initCadastro();
initGerenciar();
initDetalhe();
