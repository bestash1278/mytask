/* 서버나 외부 라이브러리 없이 실행되는 개인용 할 일 앱입니다. */
(() => {
  'use strict';
  const STORAGE_KEY = 'mytasks.data.v1';
  const SETTINGS_KEY = 'mytasks.settings.v1';
  const categories = { work: { label: '업무', color: 'var(--work)' }, personal: { label: '개인', color: 'var(--personal)' }, study: { label: '공부', color: 'var(--study)' } };
  const sorts = ['newest', 'oldest', 'category', 'status', 'manual'];
  const $ = (selector) => document.querySelector(selector);
  let tasks = [];
  let settings = { theme: 'light', sort: 'newest' };
  let category = 'all';
  let status = 'all';
  let search = '';
  let editingId = null;
  let dragId = null;
  let storageBlocked = false;
  let toastTimer;
  let undoAction;
  let lastDay = new Date().toDateString();

  function uid() { return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`; }
  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function toast(message, undo) {
    clearTimeout(toastTimer);
    const box = $('#toast');
    box.replaceChildren(document.createTextNode(message));
    undoAction = undo;
    if (undo) {
      const button = element('button', '', '되돌리기');
      button.addEventListener('click', () => { const action = undoAction; undoAction = null; if (action) action(); box.hidden = true; });
      box.append(button);
    }
    box.hidden = false;
    toastTimer = setTimeout(() => { box.hidden = true; undoAction = null; }, undo ? 10000 : 5000);
  }
  function validateTasks(data) {
    const list = Array.isArray(data) ? data : data?.tasks;
    if (!Array.isArray(list) || list.length > 10000) throw new Error('할 일 목록이 있는 JSON 파일을 선택해 주세요. 최대 10,000개까지 가져올 수 있어요.');
    const seen = new Set();
    return list.map((item, index) => {
      if (!item || typeof item !== 'object' || typeof item.text !== 'string' || !item.text.trim() || item.text.trim().length > 300 || !Object.hasOwn(categories, item.category) || typeof item.completed !== 'boolean' || !['string', 'number'].includes(typeof item.createdAt) || !Number.isFinite(new Date(item.createdAt).getTime())) {
        throw new Error(`${index + 1}번째 할 일의 형식이 올바르지 않아요. 내용, 카테고리, 완료 여부, 생성일을 확인해 주세요.`);
      }
      let id = typeof item.id === 'string' && item.id ? item.id : uid();
      if (seen.has(id)) id = uid();
      seen.add(id);
      return { id, text: item.text.trim(), category: item.category, completed: item.completed, createdAt: new Date(item.createdAt).toISOString() };
    });
  }
  function readData() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) tasks = validateTasks(JSON.parse(raw));
    } catch {
      storageBlocked = true;
      $('#storage-status').textContent = '기존 데이터를 읽을 수 없어요';
      toast('저장 데이터를 읽지 못했어요. 기존 데이터는 덮어쓰지 않습니다. JSON 백업을 가져와 복원해 주세요.');
    }
    try {
      const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
      if (['light', 'dark'].includes(saved?.theme)) settings.theme = saved.theme;
      else if (matchMedia('(prefers-color-scheme: dark)').matches) settings.theme = 'dark';
      if (sorts.includes(saved?.sort)) settings.sort = saved.sort;
    } catch { /* 설정이 손상되면 기본 설정을 사용합니다. */ }
  }
  function persist() {
    if (storageBlocked) { toast('자동 저장이 중지되어 있어요. 내보내기로 현재 목록을 보관해 주세요.'); return; }
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, tasks })); $('#storage-status').textContent = '이 브라우저에 자동 저장돼요'; }
    catch { $('#storage-status').textContent = '저장 실패 · JSON 백업이 필요해요'; toast('브라우저에 저장하지 못했어요. 내보내기로 목록을 백업해 주세요.'); }
  }
  function saveSettings() { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { toast('환경 설정을 저장하지 못했어요.'); } }
  function applyTheme() {
    document.documentElement.dataset.theme = settings.theme;
    const dark = settings.theme === 'dark';
    $('#theme-toggle').textContent = dark ? '☀' : '☾';
    $('#theme-toggle').setAttribute('aria-label', dark ? '라이트 모드 켜기' : '다크 모드 켜기');
    $('meta[name="theme-color"]').content = dark ? '#1a1a1a' : '#f6f7fb';
  }
  function isToday(value) { return new Date(value).toDateString() === new Date().toDateString(); }
  function relativeTime(value) {
    const minutes = Math.floor((Date.now() - new Date(value).getTime()) / 60000);
    if (minutes < 1) return '방금 추가';
    if (minutes < 60) return `${minutes}분 전`;
    if (minutes < 1440) return `${Math.floor(minutes / 60)}시간 전`;
    if (minutes < 10080) return `${Math.floor(minutes / 1440)}일 전`;
    return new Date(value).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
  }
  function updateDate() { $('#today-label').textContent = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }); }
  function renderDashboard() {
    const done = tasks.filter(t => t.completed).length;
    const percent = tasks.length ? Math.round(done / tasks.length * 100) : 0;
    $('#percent').textContent = percent;
    $('#progress-summary').textContent = `${tasks.length}개 중 ${done}개 완료`;
    $('#total-progress').setAttribute('aria-valuenow', percent);
    $('#total-progress span').style.width = `${percent}%`;
    $('#progress-ring').style.setProperty('--progress', `${percent}%`);
    $('#remaining').replaceChildren(document.createTextNode(tasks.length - done), element('span', '', '개'));
    $('#today-count').replaceChildren(document.createTextNode(tasks.filter(t => isToday(t.createdAt)).length), element('span', '', '개'));
    $('#count-all').textContent = tasks.length;
    const fragment = document.createDocumentFragment();
    Object.entries(categories).forEach(([key, config]) => {
      const subset = tasks.filter(t => t.category === key);
      const complete = subset.filter(t => t.completed).length;
      $(`#count-${key}`).textContent = subset.length;
      const block = element('div', 'mini-progress');
      const heading = element('div', 'mini-heading');
      heading.append(element('span', `category-dot ${key}`), document.createTextNode(config.label), element('span', '', `${complete} / ${subset.length} 완료`));
      const track = element('div', 'mini-track');
      track.setAttribute('role', 'progressbar');
      track.setAttribute('aria-label', `${config.label} 완료율`);
      track.setAttribute('aria-valuemin', '0'); track.setAttribute('aria-valuemax', '100');
      const value = subset.length ? Math.round(complete / subset.length * 100) : 0;
      track.setAttribute('aria-valuenow', value);
      const bar = element('span'); bar.style.width = `${value}%`; bar.style.background = config.color;
      track.append(bar); block.append(heading, track); fragment.append(block);
    });
    $('#category-progress').replaceChildren(fragment);
    $('#clear-completed').disabled = done === 0;
    $('#clear-completed').textContent = done ? `완료 항목 삭제 (${done})` : '완료 항목 삭제';
  }
  function visibleTasks() {
    const list = tasks.filter(t => (category === 'all' || t.category === category) && (status === 'all' || (status === 'completed' ? t.completed : !t.completed)) && t.text.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
    if (settings.sort === 'newest') list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    if (settings.sort === 'oldest') list.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    if (settings.sort === 'category') list.sort((a, b) => Object.keys(categories).indexOf(a.category) - Object.keys(categories).indexOf(b.category));
    if (settings.sort === 'status') list.sort((a, b) => Number(a.completed) - Number(b.completed));
    return list;
  }
  function actionButton(symbol, label, action) {
    const button = element('button', 'row-button', symbol);
    button.type = 'button'; button.title = label; button.setAttribute('aria-label', label); button.dataset.action = action;
    return button;
  }
  function createEditForm(task) {
    const form = element('form', 'edit-form');
    const input = element('input'); input.value = task.text; input.name = 'text'; input.maxLength = 300; input.required = true; input.setAttribute('aria-label', '할 일 내용 수정');
    const select = element('select'); select.name = 'category'; select.setAttribute('aria-label', '카테고리 수정');
    for (const [key, config] of Object.entries(categories)) { const option = element('option', '', config.label); option.value = key; select.append(option); }
    select.value = task.category;
    const save = element('button', 'primary-button', '저장'); save.type = 'submit';
    const cancel = element('button', 'secondary-button', '취소'); cancel.type = 'button'; cancel.dataset.action = 'cancel-edit';
    form.append(input, select, save, cancel); return form;
  }
  function createRow(task, index, total) {
    const row = element('li', `task-row${task.completed ? ' completed' : ''}`); row.dataset.id = task.id;
    if (editingId === task.id) { row.append(createEditForm(task)); return row; }
    if (settings.sort === 'manual') {
      const handle = element('span', 'drag-handle', '⠿'); handle.draggable = true; handle.title = '끌어서 순서 변경'; handle.setAttribute('aria-hidden', 'true'); row.append(handle);
    }
    const check = element('input', 'task-check'); check.type = 'checkbox'; check.checked = task.completed; check.dataset.action = 'toggle'; check.setAttribute('aria-label', `${task.text} 완료`);
    const copy = element('div', 'task-copy');
    const title = element('div', 'task-title', task.text); title.title = '더블클릭하여 수정';
    const meta = element('div', 'task-meta');
    const tag = element('span', 'tag'); tag.style.setProperty('--tag-color', categories[task.category].color); tag.append(element('span', 'category-dot'), document.createTextNode(categories[task.category].label));
    const time = element('time', '', relativeTime(task.createdAt)); time.dateTime = task.createdAt; time.title = new Date(task.createdAt).toLocaleString('ko-KR');
    meta.append(tag, time); copy.append(title, meta);
    const actions = element('div', 'row-actions');
    if (settings.sort === 'manual') {
      const up = actionButton('↑', `${task.text} 위로 이동`, 'up'); up.disabled = index === 0;
      const down = actionButton('↓', `${task.text} 아래로 이동`, 'down'); down.disabled = index === total - 1;
      actions.append(up, down);
    }
    actions.append(actionButton('✎', `${task.text} 수정`, 'edit'), actionButton('×', `${task.text} 삭제`, 'delete'));
    row.append(check, copy, actions); return row;
  }
  function renderList() {
    const list = visibleTasks();
    const fragment = document.createDocumentFragment();
    list.forEach((task, index) => fragment.append(createRow(task, index, list.length)));
    $('#task-list').replaceChildren(fragment);
    $('#list-heading').textContent = category === 'all' ? '전체 할 일' : `${categories[category].label} 할 일`;
    $('#list-count').textContent = list.length;
    $('#empty-state').hidden = list.length !== 0;
    const filtered = tasks.length > 0 || category !== 'all' || status !== 'all' || search;
    $('#empty-state h3').textContent = filtered ? '표시할 할 일이 없어요' : '가벼운 하루의 시작';
    $('#empty-state p').textContent = filtered ? '검색어나 필터를 바꾸거나 새로운 할 일을 추가해 보세요.' : '아직 할 일이 없어요. 작은 계획 하나를 추가해 보세요.';
    $('#list-hint').textContent = settings.sort === 'manual' ? '손잡이를 끌거나 화살표로 순서를 바꿔 보세요' : '더블클릭으로 수정할 수 있어요';
  }
  function render() { renderDashboard(); renderList(); }
  function commit() { persist(); render(); }
  function selectCategory(value) {
    category = value; editingId = null;
    document.querySelectorAll('[data-category]').forEach(button => { const selected = button.dataset.category === category; button.classList.toggle('active', selected); button.setAttribute('aria-pressed', selected); });
    if (category !== 'all') $('#task-category').value = category;
    renderList();
  }
  function startEditing(id) {
    editingId = id; renderList();
    const input = $('#task-list .edit-form input'); if (input) { input.focus(); input.select(); }
  }
  function restoreRows(removed) {
    const ids = new Set(tasks.map(t => t.id));
    removed.forEach(({ task, index }) => { if (!ids.has(task.id)) { tasks.splice(Math.min(index, tasks.length), 0, task); ids.add(task.id); } });
    commit();
  }
  function removeTasks(predicate) {
    const removed = tasks.map((task, index) => ({ task, index })).filter(({ task }) => predicate(task));
    tasks = tasks.filter(t => !predicate(t)); commit();
    toast(`${removed.length}개의 할 일을 삭제했어요.`, () => restoreRows(removed));
  }
  function ask(title, message, importing = false) {
    return new Promise(resolve => {
      const dialog = $('#confirm-dialog'); $('#confirm-title').textContent = title; $('#confirm-message').textContent = message;
      $('#backup-option').hidden = !importing; $('#backup-first').checked = true; dialog.returnValue = '';
      dialog.addEventListener('close', () => resolve(dialog.returnValue === 'confirm'), { once: true }); dialog.showModal();
    });
  }
  function downloadBackup() {
    const blob = new Blob([JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), tasks }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const link = element('a'); link.href = url;
    const date = new Date(); const stamp = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    link.download = `my-tasks-${stamp}.json`; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function reorder(sourceId, targetId, after = false) {
    if (sourceId === targetId) return;
    const source = tasks.findIndex(t => t.id === sourceId); if (source < 0 || !tasks.some(t => t.id === targetId)) return;
    const [moved] = tasks.splice(source, 1); const target = tasks.findIndex(t => t.id === targetId);
    tasks.splice(target + Number(after), 0, moved); commit();
  }

  $('#add-form').addEventListener('submit', event => {
    event.preventDefault(); const input = $('#task-input'); const text = input.value.trim();
    if (!text) { input.setCustomValidity('할 일 내용을 입력해 주세요.'); input.reportValidity(); return; }
    tasks.unshift({ id: uid(), text, category: $('#task-category').value, completed: false, createdAt: new Date().toISOString() });
    input.value = ''; editingId = null;
    // 방금 추가한 항목을 필터 때문에 놓치지 않도록 목록을 보여 줍니다.
    if (category !== 'all' && category !== $('#task-category').value) selectCategory('all');
    status = 'all'; search = ''; $('#search-input').value = '';
    document.querySelectorAll('[data-status]').forEach(button => { const selected = button.dataset.status === status; button.classList.toggle('selected', selected); button.setAttribute('aria-pressed', selected); });
    commit(); input.focus();
  });
  $('#task-input').addEventListener('input', () => $('#task-input').setCustomValidity(''));
  $('#category-nav').addEventListener('click', event => { const button = event.target.closest('[data-category]'); if (button) selectCategory(button.dataset.category); });
  $('.status-tabs').addEventListener('click', event => {
    const button = event.target.closest('[data-status]'); if (!button) return; status = button.dataset.status; editingId = null;
    document.querySelectorAll('[data-status]').forEach(node => { const selected = node === button; node.classList.toggle('selected', selected); node.setAttribute('aria-pressed', selected); }); renderList();
  });
  $('#search-input').addEventListener('input', event => { search = event.target.value.trim(); editingId = null; renderList(); });
  $('#sort-select').addEventListener('change', event => { settings.sort = event.target.value; editingId = null; saveSettings(); renderList(); });
  $('#theme-toggle').addEventListener('click', () => { settings.theme = settings.theme === 'dark' ? 'light' : 'dark'; applyTheme(); saveSettings(); });
  $('#empty-add').addEventListener('click', () => $('#task-input').focus());
  $('#help-button').addEventListener('click', () => $('#help-dialog').showModal());
  $('#task-list').addEventListener('change', event => {
    if (event.target.dataset.action !== 'toggle') return;
    const task = tasks.find(t => t.id === event.target.closest('[data-id]').dataset.id); if (!task) return;
    task.completed = event.target.checked; commit();
    const row = [...$('#task-list').children].find(node => node.dataset.id === task.id); row?.querySelector('.task-check')?.focus();
  });
  $('#task-list').addEventListener('click', event => {
    const button = event.target.closest('button[data-action]'); if (!button) return;
    const id = button.closest('[data-id]').dataset.id;
    switch (button.dataset.action) {
      case 'edit': startEditing(id); break;
      case 'cancel-edit': editingId = null; renderList(); break;
      case 'delete': removeTasks(t => t.id === id); break;
      case 'up': case 'down': {
        const list = visibleTasks(); const index = list.findIndex(t => t.id === id); const down = button.dataset.action === 'down';
        const target = list[index + (down ? 1 : -1)];
        if (target) { reorder(id, target.id, down); const row = [...$('#task-list').children].find(node => node.dataset.id === id); row?.querySelector(`[data-action="${button.dataset.action}"]:not(:disabled)`)?.focus(); }
        break;
      }
    }
  });
  $('#task-list').addEventListener('dblclick', event => { const title = event.target.closest('.task-title'); if (title) startEditing(title.closest('[data-id]').dataset.id); });
  $('#task-list').addEventListener('submit', event => {
    const form = event.target.closest('.edit-form'); if (!form) return; event.preventDefault();
    const text = form.elements.text.value.trim();
    if (!text) { toast('할 일 내용을 입력해 주세요.'); form.elements.text.focus(); return; }
    const task = tasks.find(t => t.id === editingId); if (!task) return;
    task.text = text; task.category = form.elements.category.value; editingId = null; commit();
  });
  $('#task-list').addEventListener('keydown', event => { if (event.key === 'Escape' && editingId) { editingId = null; renderList(); } });
  $('#task-list').addEventListener('dragstart', event => {
    if (!event.target.matches('.drag-handle')) return;
    const row = event.target.closest('[data-id]'); dragId = row.dataset.id; event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', dragId); row.classList.add('dragging');
  });
  $('#task-list').addEventListener('dragover', event => { const row = event.target.closest('[data-id]'); if (!dragId || !row) return; event.preventDefault(); document.querySelectorAll('.drop-target').forEach(node => node.classList.remove('drop-target')); row.classList.add('drop-target'); });
  $('#task-list').addEventListener('drop', event => {
    const row = event.target.closest('[data-id]'); if (!dragId || !row) return; event.preventDefault();
    const bounds = row.getBoundingClientRect(); reorder(dragId, row.dataset.id, event.clientY > bounds.top + bounds.height / 2); dragId = null;
  });
  $('#task-list').addEventListener('dragend', () => { dragId = null; document.querySelectorAll('.dragging,.drop-target').forEach(node => node.classList.remove('dragging', 'drop-target')); });
  $('#clear-completed').addEventListener('click', async () => {
    const count = tasks.filter(t => t.completed).length;
    if (count && await ask('완료한 할 일을 정리할까요?', `모든 카테고리의 완료된 할 일 ${count}개를 삭제합니다. 삭제 직후에는 되돌릴 수 있어요.`)) removeTasks(t => t.completed);
  });
  $('#export-button').addEventListener('click', () => { downloadBackup(); toast('전체 목록을 JSON 파일로 내보냈어요.'); });
  $('#import-button').addEventListener('click', () => $('#import-file').click());
  $('#import-file').addEventListener('change', async event => {
    const file = event.target.files[0]; if (!file) return;
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error('10MB 이하의 JSON 파일을 선택해 주세요.');
      let parsed;
      try { parsed = JSON.parse((await file.text()).replace(/^\uFEFF/, '')); } catch { throw new Error('JSON 파일을 읽을 수 없어요. 파일 내용을 확인해 주세요.'); }
      const incoming = validateTasks(parsed);
      if (!await ask('백업에서 목록을 복원할까요?', `현재 ${tasks.length}개의 할 일을 파일의 ${incoming.length}개로 교체합니다. 필요한 경우 아래 옵션으로 현재 목록을 먼저 백업하세요.`, true)) return;
      if ($('#backup-first').checked) downloadBackup();
      const previous = tasks; tasks = incoming; storageBlocked = false; editingId = null; search = ''; $('#search-input').value = ''; status = 'all';
      document.querySelectorAll('[data-status]').forEach(button => { const selected = button.dataset.status === 'all'; button.classList.toggle('selected', selected); button.setAttribute('aria-pressed', selected); });
      selectCategory('all'); commit(); toast(`${tasks.length}개의 할 일을 복원했어요.`, () => { tasks = previous; commit(); });
    } catch (error) { toast(error.message || '가져오기에 실패했어요. 기존 목록은 유지됩니다.'); }
    finally { event.target.value = ''; }
  });
  document.addEventListener('keydown', event => {
    if (event.isComposing || document.querySelector('dialog[open]')) return;
    if (event.altKey && event.code === 'KeyN') { event.preventDefault(); $('#task-input').focus(); }
    if (event.altKey && /^Digit[1-4]$/.test(event.code)) { event.preventDefault(); selectCategory(['all', 'work', 'personal', 'study'][Number(event.code.slice(-1)) - 1]); }
    if (event.key === '?' && !event.target.closest('input,select,textarea')) $('#help-dialog').showModal();
  });
  window.addEventListener('storage', event => {
    if (event.key === STORAGE_KEY) {
      try { const incoming = event.newValue ? validateTasks(JSON.parse(event.newValue)) : []; tasks = incoming; editingId = null; render(); }
      catch { toast('다른 창의 저장 데이터를 읽지 못했어요.'); }
    }
    if (event.key === SETTINGS_KEY) {
      try { const incoming = JSON.parse(event.newValue || '{}'); if (['light', 'dark'].includes(incoming.theme)) settings.theme = incoming.theme; if (sorts.includes(incoming.sort)) settings.sort = incoming.sort; applyTheme(); $('#sort-select').value = settings.sort; renderList(); } catch { /* 잘못된 설정은 무시합니다. */ }
    }
  });
  readData(); applyTheme(); updateDate(); $('#sort-select').value = settings.sort;
  const quotes = ['작은 일 하나를 끝내는 것에서, 좋은 하루가 시작돼요.', '완벽한 계획보다 오늘의 작은 실천이 더 소중해요.', '당신의 속도로 나아가도 괜찮아요. 한 걸음이면 충분해요.', '오늘 해낸 작은 일들이 내일의 나를 만들어 가요.', '잠깐 쉬어 가는 시간도 오늘의 소중한 계획이에요.'];
  $('#quote-text').textContent = quotes[Math.floor(Math.random() * quotes.length)]; render();
  setInterval(() => {
    const day = new Date().toDateString(); if (day !== lastDay) { lastDay = day; updateDate(); renderDashboard(); }
    document.querySelectorAll('.task-meta time').forEach(time => { time.textContent = relativeTime(time.dateTime); });
  }, 60000);
})();
