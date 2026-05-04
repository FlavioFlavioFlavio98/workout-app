'use strict';

// ============================================================
//  UTILITY
// ============================================================

/**
 * Converti ricorsivamente ogni Firestore Timestamp in un oggetto
 * marcato { _type:'timestamp', iso:'...' } per il JSON export.
 */
function convertTimestamps(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  // Firestore Timestamp
  if (typeof obj.toDate === 'function') {
    return { _type: 'timestamp', iso: obj.toDate().toISOString() };
  }
  if (Array.isArray(obj)) return obj.map(convertTimestamps);
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = convertTimestamps(v);
  }
  return out;
}

/**
 * Converti ricorsivamente ogni oggetto { _type:'timestamp', iso } in
 * un Firestore Timestamp per l'import.
 * Salta la chiave _id (usata solo come riferimento locale).
 */
function restoreTimestamps(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  if (obj._type === 'timestamp' && obj.iso) {
    return firebase.firestore.Timestamp.fromDate(new Date(obj.iso));
  }
  if (Array.isArray(obj)) return obj.map(restoreTimestamps);
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (k === '_id') continue; // campo di comodo: non va su Firestore
    out[k] = restoreTimestamps(v);
  }
  return out;
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

// ============================================================
//  TOAST
// ============================================================
function showToast(msg, duration = 3500) {
  const toast = document.getElementById('settings-toast');
  toast.textContent = msg;
  toast.classList.add('visible');
  setTimeout(() => toast.classList.remove('visible'), duration);
}

// ============================================================
//  EXPORT
// ============================================================
async function exportData() {
  const btn = document.getElementById('btn-export');
  btn.disabled  = true;
  btn.textContent = 'Esportazione…';

  try {
    const [sessionsSnap, exercisesSnap, recordsSnap] = await Promise.all([
      db.collection('sessions').orderBy('date', 'desc').get(),
      db.collection('exercises').orderBy('name').get(),
      db.collection('records').get()
    ]);

    const toObj = doc => ({ _id: doc.id, ...convertTimestamps(doc.data()) });

    const backup = {
      version:    1,
      exportedAt: new Date().toISOString(),
      sessions:   sessionsSnap.docs.map(toObj),
      exercises:  exercisesSnap.docs.map(toObj),
      records:    recordsSnap.docs.map(toObj)
    };

    const json = JSON.stringify(backup, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href     = url;
    a.download = `workout-backup-${todayStr()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast(
      `✓ Esportati: ${backup.sessions.length} sessioni · ${backup.exercises.length} esercizi · ${backup.records.length} record`
    );
  } catch (e) {
    console.error('Export error:', e);
    alert('Errore durante l\'esportazione: ' + e.message);
  } finally {
    btn.disabled    = false;
    btn.textContent = '⬇ Esporta';
  }
}

// ============================================================
//  IMPORT
// ============================================================
function triggerImport() {
  document.getElementById('file-import').click();
}

async function handleImport(event) {
  const file = event.target.files[0];
  event.target.value = ''; // reset per permettere ri-selezione dello stesso file
  if (!file) return;

  // 1. Leggi e parsa il JSON
  let backup;
  try {
    const text = await file.text();
    backup = JSON.parse(text);
  } catch (_) {
    alert('File non valido: non è un JSON leggibile.');
    return;
  }

  // 2. Valida struttura
  if (
    backup.version !== 1 ||
    !Array.isArray(backup.sessions) ||
    !Array.isArray(backup.exercises) ||
    !Array.isArray(backup.records)
  ) {
    alert('Il file non è un backup valido di questa app.\nAssicurati di usare un file esportato da "Esporta dati".');
    return;
  }

  const total = backup.sessions.length + backup.exercises.length + backup.records.length;
  if (total === 0) {
    showToast('Il backup è vuoto — nessun dato da importare.');
    return;
  }

  // 3. Mostra progress modal (non chiudibile con ESC)
  const modal       = document.getElementById('modal-import-progress');
  const progressBar = document.getElementById('import-progress-bar');
  const progressTxt = document.getElementById('import-progress-text');

  progressBar.max   = total;
  progressBar.value = 0;
  progressTxt.textContent = `0 / ${total}`;
  modal.showModal();

  let done = 0;

  async function importCollection(items, collName) {
    const BATCH_SIZE = 499; // Firestore: max 500 ops per batch
    for (let i = 0; i < items.length; i += BATCH_SIZE) {
      const chunk = items.slice(i, i + BATCH_SIZE);
      const batch = db.batch();
      for (const item of chunk) {
        const ref = item._id
          ? db.collection(collName).doc(item._id)
          : db.collection(collName).doc();
        batch.set(ref, restoreTimestamps(item));
      }
      await batch.commit();
      done += chunk.length;
      progressBar.value       = done;
      progressTxt.textContent = `${done} / ${total}`;
    }
  }

  try {
    await importCollection(backup.sessions,  'sessions');
    await importCollection(backup.exercises, 'exercises');
    await importCollection(backup.records,   'records');

    modal.close();
    showToast(
      `✓ Importati: ${backup.sessions.length} sessioni · ${backup.exercises.length} esercizi · ${backup.records.length} record`,
      4000
    );
    refreshStorageInfo();
  } catch (e) {
    console.error('Import error:', e);
    modal.close();
    alert('Errore durante l\'importazione: ' + e.message);
  }
}

// ============================================================
//  RESET
// ============================================================
function openResetModal() {
  document.getElementById('modal-reset').showModal();
}

async function confirmReset() {
  document.getElementById('modal-reset').close();

  const btn = document.getElementById('btn-reset');
  btn.disabled    = true;
  btn.textContent = 'Eliminazione…';

  try {
    await Promise.all([
      deleteCollection('sessions'),
      deleteCollection('exercises'),
      deleteCollection('records')
    ]);
    showToast('App reimpostata — tutti i dati eliminati.');
    refreshStorageInfo();
  } catch (e) {
    console.error('Reset error:', e);
    alert('Errore durante il reset: ' + e.message);
  } finally {
    btn.disabled    = false;
    btn.textContent = '🗑 Reimposta';
  }
}

/**
 * Cancella un'intera collection Firestore in loop da client.
 * Usa batch da 499 delete fino a quando non restano documenti.
 */
async function deleteCollection(collName) {
  const BATCH_SIZE = 499;
  while (true) {
    const snap = await db.collection(collName).limit(BATCH_SIZE).get();
    if (snap.empty) break;
    const batch = db.batch();
    snap.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
  }
}

// ============================================================
//  INFO STORAGE (conteggio documenti)
// ============================================================
async function refreshStorageInfo() {
  const el = document.getElementById('storage-info');
  try {
    const [s, e, r] = await Promise.all([
      db.collection('sessions').get(),
      db.collection('exercises').get(),
      db.collection('records').get()
    ]);
    el.textContent = `${s.size} sessioni · ${e.size} esercizi · ${r.size} record`;
  } catch (_) {
    el.textContent = 'non disponibile';
  }
}

// ============================================================
//  EVENT LISTENERS
// ============================================================

// Reset
document.getElementById('btn-reset').addEventListener('click', openResetModal);
document.getElementById('btn-close-reset').addEventListener('click',  () => document.getElementById('modal-reset').close());
document.getElementById('btn-cancel-reset').addEventListener('click', () => document.getElementById('modal-reset').close());
document.getElementById('btn-confirm-reset').addEventListener('click', confirmReset);

// Export
document.getElementById('btn-export').addEventListener('click', exportData);

// Import
document.getElementById('btn-import').addEventListener('click', triggerImport);
document.getElementById('file-import').addEventListener('change', handleImport);

// Impedisci la chiusura del modal di progresso con ESC
document.getElementById('modal-import-progress').addEventListener('cancel', e => e.preventDefault());

// ============================================================
//  INIT
// ============================================================
refreshStorageInfo();
