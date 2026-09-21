const TOKEN_KEY = 'token';

const $ = (id) => document.getElementById(id);
const loginView = $('login-view');
const appView = $('app-view');
const logoutBtn = $('logout');
const message = $('message');

function showMessage(text, isError = true) {
  message.textContent = text || '';
  message.classList.toggle('success', !isError);
  message.hidden = !text;
}

function showView(loggedIn) {
  loginView.hidden = loggedIn;
  appView.hidden = !loggedIn;
  logoutBtn.hidden = !loggedIn;
}

function logout() {
  sessionStorage.removeItem(TOKEN_KEY);
  showView(false);
}

async function api(method, path, body) {
  const headers = {};
  const token = sessionStorage.getItem(TOKEN_KEY);
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';

  const res = await fetch(path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (res.status === 401 && path !== '/api/login') {
    logout();
    throw new Error('Session expired, please log in again');
  }
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw new Error((data && data.error) || `Request failed (${res.status})`);
  return data;
}

// All user-supplied text is inserted via textContent, never innerHTML.
function cell(text, className) {
  const td = document.createElement('td');
  td.textContent = text;
  if (className) td.className = className;
  return td;
}

function renderThreats(threats) {
  const tbody = document.querySelector('#threats tbody');
  tbody.replaceChildren();
  for (const t of threats) {
    const tr = document.createElement('tr');
    tr.append(
      cell(t.title),
      cell(t.stride_category),
      cell(t.severity, `severity-${t.severity}`),
      cell(t.description, 'description'),
      cell(new Date(t.created_at).toLocaleString())
    );
    const actions = document.createElement('td');
    const del = document.createElement('button');
    del.type = 'button';
    del.textContent = 'Delete';
    del.addEventListener('click', () => deleteThreat(t.id));
    actions.append(del);
    tr.append(actions);
    tbody.append(tr);
  }
  $('threats').hidden = threats.length === 0;
  $('empty').hidden = threats.length !== 0;
}

async function loadThreats() {
  try {
    renderThreats(await api('GET', '/api/threats'));
    showMessage('');
  } catch (err) {
    showMessage(err.message);
  }
}

async function deleteThreat(id) {
  try {
    await api('DELETE', `/api/threats/${id}`);
    await loadThreats();
  } catch (err) {
    showMessage(err.message);
  }
}

$('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  try {
    const { token } = await api('POST', '/api/login', Object.fromEntries(new FormData(form)));
    sessionStorage.setItem(TOKEN_KEY, token);
    form.reset();
    showView(true);
    await loadThreats();
  } catch (err) {
    showMessage(err.message);
  }
});

$('threat-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  try {
    await api('POST', '/api/threats', Object.fromEntries(new FormData(form)));
    form.reset();
    await loadThreats();
  } catch (err) {
    showMessage(err.message);
  }
});

$('user-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  try {
    const user = await api('POST', '/api/users', Object.fromEntries(new FormData(form)));
    form.reset();
    showMessage(`User "${user.username}" created`, false);
  } catch (err) {
    showMessage(err.message);
  }
});

logoutBtn.addEventListener('click', () => {
  logout();
  showMessage('');
});

if (sessionStorage.getItem(TOKEN_KEY)) {
  showView(true);
  loadThreats();
} else {
  showView(false);
}
