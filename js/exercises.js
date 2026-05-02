'use strict';

// ============================================================
//  STATO
// ============================================================
const state = {
  all:        [],   // tutti gli esercizi da Firestore
  filtered:   [],   // sottoinsieme dopo ricerca/filtro
  typeFilter: '',   // '' | 'bodyweight' | 'band' | 'kettlebell'
  query:      ''
};

// ============================================================
//  UTILITY
// ============================================================
const equipIcon  = t => ({ bodyweight: '🏃', band: '↔️', kettlebell: '🏋️' }[t] || '');
const equipLabel = t => ({ bodyweight: 'Corpo libero', band: 'Banda elastica', kettlebell: 'Kettlebell' }[t] || t);

function badgeClass(g) {
  return 'badge-' + ((g === 'full body') ? 'fullbody' : (g || '').replace(/\s+/g, ''));
}

// ============================================================
//  CARICAMENTO DA FIRESTORE
// ============================================================
async function loadExercises() {
  document.getElementById('exercise-grid').innerHTML =
    '<div class="loading-state">Caricamento...</div>';
  try {
    const snap = await db.collection('exercises').orderBy('name').get();
    state.all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    applyFilters();
  } catch (e) {
    document.getElementById('exercise-grid').innerHTML =
      '<div class="no-data-state"><div class="icon">⚠️</div><p>Errore nel caricamento.<br>Controlla la connessione.</p></div>';
    console.error(e);
  }
}

// ============================================================
//  FILTRO + RENDER
// ============================================================
function applyFilters() {
  const q   = state.query.toLowerCase();
  const typ = state.typeFilter;

  state.filtered = state.all.filter(ex => {
    const matchQ   = !q   || ex.name.toLowerCase().includes(q) ||
                             (ex.muscleGroup || '').toLowerCase().includes(q);
    const matchTyp = !typ || ex.type === typ;
    return matchQ && matchTyp;
  });

  renderGrid();
}

function renderGrid() {
  const grid = document.getElementById('exercise-grid');

  if (!state.filtered.length) {
    grid.innerHTML = `
      <div class="no-data-state">
        <div class="icon">🔍</div>
        <p>${state.all.length === 0
          ? 'Nessun esercizio in libreria.<br>Aggiungine uno con il pulsante <strong>+</strong>'
          : 'Nessun risultato per la ricerca'}</p>
      </div>`;
    return;
  }

  grid.innerHTML = '';
  state.filtered.forEach(ex => grid.appendChild(buildCard(ex)));
}

function buildCard(ex) {
  const card = document.createElement('article');
  card.className = 'ex-library-card';
  card.id = `ex-${ex.id}`;

  card.innerHTML = `
    <div class="ex-library-card-header">
      <span style="font-size:20px;">${equipIcon(ex.type)}</span>
      <span class="ex-library-name">${ex.name}</span>
      <span class="badge ${badgeClass(ex.muscleGroup)}">${ex.muscleGroup || ''}</span>
      <div class="ex-library-actions">
        <button class="btn-icon btn-edit" data-id="${ex.id}" title="Modifica">✏️</button>
        <button class="btn-icon danger btn-del"  data-id="${ex.id}" title="Elimina">🗑</button>
      </div>
    </div>
    <div class="ex-library-meta">
      <span class="ex-type-label">${equipLabel(ex.type)}</span>
    </div>
    ${ex.notes ? `<div class="ex-notes-preview">${ex.notes}</div>` : ''}`;

  card.querySelector('.btn-edit').addEventListener('click', () => openModal(ex));
  card.querySelector('.btn-del').addEventListener('click',  () => deleteExercise(ex.id));

  return card;
}

// ============================================================
//  MODAL CREA / MODIFICA
// ============================================================
const modal = document.getElementById('modal-exercise');

function openModal(ex = null) {
  document.getElementById('ex-edit-id').value   = ex ? ex.id   : '';
  document.getElementById('ex-name').value       = ex ? ex.name : '';
  document.getElementById('ex-muscle').value     = ex ? (ex.muscleGroup || '') : '';
  document.getElementById('ex-notes').value      = ex ? (ex.notes || '')  : '';
  document.getElementById('modal-ex-title').textContent = ex ? 'Modifica esercizio' : 'Nuovo esercizio';

  const typeVal = ex ? ex.type : 'bodyweight';
  document.querySelectorAll('input[name="ex-type"]').forEach(r => {
    r.checked = r.value === typeVal;
  });

  modal.showModal();
  setTimeout(() => document.getElementById('ex-name').focus(), 100);
}

async function saveExercise() {
  const id     = document.getElementById('ex-edit-id').value;
  const name   = document.getElementById('ex-name').value.trim();
  const muscle = document.getElementById('ex-muscle').value;
  const type   = document.querySelector('input[name="ex-type"]:checked').value;
  const notes  = document.getElementById('ex-notes').value.trim();

  if (!name)   { alert('Inserisci il nome dell\'esercizio'); return; }
  if (!muscle) { alert('Seleziona il gruppo muscolare'); return; }

  const data = { name, muscleGroup: muscle, type, notes };
  const btn  = document.getElementById('btn-save-ex');
  btn.disabled = true;
  btn.textContent = 'Salvataggio...';

  try {
    if (id) {
      await db.collection('exercises').doc(id).update(data);
      // Aggiorna nello state locale
      const idx = state.all.findIndex(e => e.id === id);
      if (idx !== -1) state.all[idx] = { id, ...data };
    } else {
      const ref = await db.collection('exercises').add({
        ...data,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      state.all.push({ id: ref.id, ...data });
      // Riordina alfabeticamente
      state.all.sort((a, b) => a.name.localeCompare(b.name));
    }
    modal.close();
    applyFilters();
  } catch (e) {
    alert('Errore nel salvataggio. Riprova.');
    console.error(e);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Salva esercizio';
  }
}

// ============================================================
//  ELIMINA
// ============================================================
async function deleteExercise(id) {
  const ex = state.all.find(e => e.id === id);
  if (!ex) return;
  if (!confirm(`Eliminare "${ex.name}" dalla libreria?\nLe sessioni passate non verranno modificate.`)) return;

  try {
    await db.collection('exercises').doc(id).delete();
    // Elimina anche il record PR se esiste
    try { await db.collection('records').doc(id).delete(); } catch (_) {}

    state.all      = state.all.filter(e => e.id !== id);
    state.filtered = state.filtered.filter(e => e.id !== id);
    const card = document.getElementById(`ex-${id}`);
    if (card) card.remove();
    if (!state.filtered.length) renderGrid();
  } catch (e) {
    alert('Errore durante l\'eliminazione.');
    console.error(e);
  }
}

// ============================================================
//  EVENT LISTENERS
// ============================================================

// FAB nuovo esercizio
document.getElementById('btn-new-ex').addEventListener('click', () => openModal());

// Chiudi modal
document.getElementById('btn-close-ex').addEventListener('click', () => modal.close());

// Salva
document.getElementById('btn-save-ex').addEventListener('click', saveExercise);

// Salva anche con invio da tastiera
document.getElementById('ex-name').addEventListener('keydown', e => {
  if (e.key === 'Enter') saveExercise();
});

// Ricerca (debounce 200ms)
let searchTimer = null;
document.getElementById('ex-search').addEventListener('input', e => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    state.query = e.target.value.trim();
    applyFilters();
  }, 200);
});

// Filtri tipo
document.querySelectorAll('#type-filters .filter-pill').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#type-filters .filter-pill').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.typeFilter = btn.dataset.type;
    applyFilters();
  });
});

// ============================================================
//  INIT
// ============================================================
loadExercises();
