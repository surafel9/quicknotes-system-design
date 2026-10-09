// QuickNotes System Design - REST API Client
const API_URL = 'https://jsonplaceholder.typicode.com/posts';

// DOM Elements
const loadBtn = document.getElementById('load-btn');
const statusP = document.getElementById('status');
const noteForm = document.getElementById('note-form');
const titleInput = document.getElementById('title-input');
const bodyInput = document.getElementById('body-input');
const submitBtn = document.getElementById('submit-btn');
const notesList = document.getElementById('notes-list');

/**
 * Reusable async function that calls fetch, checks response.ok, and throws on errors.
 * Returns parsed JSON data with HTTP status code attached.
 *
 * @param {string} endpoint - Path or query string appended to API_URL
 * @param {RequestInit} [options={}] - Fetch configuration options
 * @returns {Promise<any>}
 */
async function request(endpoint = '', options = {}) {
  const url = endpoint.startsWith('http') ? endpoint : `${API_URL}${endpoint}`;
  
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  const response = await fetch(url, { ...options, headers });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status} (${response.statusText || 'Request Failed'})`);
  }

  // Handle empty responses gracefully (e.g. 204 No Content)
  if (response.status === 204) {
    const emptyResult = {};
    emptyResult.status = response.status;
    return emptyResult;
  }

  const data = await response.json();
  if (data && typeof data === 'object') {
    data.status = response.status;
  }
  return data;
}

/**
 * Update UI status banner with message and visual style.
 * Uses textContent to prevent XSS injection.
 *
 * @param {string} message - Message to display
 * @param {'loading' | 'success' | 'error' | ''} type - Status type
 */
function setStatus(message, type = '') {
  statusP.textContent = message;
  statusP.className = type ? `status-${type}` : '';
  statusP.style.display = message ? 'block' : 'none';
}

/**
 * Render list of notes into the notesList element.
 * Uses textContent exclusively for user text to prevent XSS.
 *
 * @param {Array<Object>} notes
 */
function renderNotes(notes) {
  notesList.innerHTML = '';

  if (!notes || notes.length === 0) {
    const emptyLi = document.createElement('li');
    emptyLi.className = 'empty-state';
    emptyLi.textContent = 'No notes found. Create a note above or click "Load notes".';
    notesList.appendChild(emptyLi);
    return;
  }

  notes.forEach((note) => {
    const li = createNoteElement(note);
    notesList.appendChild(li);
  });
}

/**
 * Create a single note DOM list item.
 *
 * @param {Object} note
 * @returns {HTMLLIElement}
 */
function createNoteElement(note) {
  const li = document.createElement('li');
  li.className = 'note-item';
  li.dataset.id = note.id;

  const headerDiv = document.createElement('div');
  headerDiv.className = 'note-header-row';

  const titleEl = document.createElement('h3');
  titleEl.className = 'note-title';
  titleEl.textContent = note.title;

  const badgeEl = document.createElement('span');
  badgeEl.className = 'note-id-badge';
  badgeEl.textContent = `ID: ${note.id}`;

  headerDiv.appendChild(titleEl);
  headerDiv.appendChild(badgeEl);
  li.appendChild(headerDiv);

  if (note.body) {
    const bodyEl = document.createElement('p');
    bodyEl.className = 'note-body';
    bodyEl.textContent = note.body;
    li.appendChild(bodyEl);
  }

  return li;
}

/**
 * Load 10 notes from server (GET /posts?_limit=10)
 */
async function loadNotes() {
  loadBtn.disabled = true;
  setStatus('Loading notes...', 'loading');
  notesList.innerHTML = '';

  try {
    const notes = await request('?_limit=10');

    if (!notes || notes.length === 0) {
      renderNotes([]);
      setStatus('No notes available from the server.', 'success');
      return;
    }

    renderNotes(notes);
    setStatus('Loaded 10 notes from the server.', 'success');
  } catch (error) {
    setStatus(`Failed to load notes: ${error.message}. Please try again.`, 'error');
  } finally {
    loadBtn.disabled = false;
  }
}

// Event Listeners
loadBtn.addEventListener('click', loadNotes);
