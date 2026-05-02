'use strict';

// ============================================================
//  STATO
// ============================================================
const state = {
  session: {
    id:        null,
    startTime: null,
    isActive:  false,
    exercises: []
  },
  timer: {
    intervalId:     null,
    elapsedSeconds: 0
  },
  rest: {
    intervalId:       null,
    remainingSeconds: 0,
    isActive:         false
  },
  addExercise: {
    selected: null,
    rpe:      3
  },
  addSet: {
    exerciseIndex: null,
    rpe:           3
  },
  exerciseCache: null,
  recordsCache:  {}    // { exerciseId: { maxWeight, maxReps, bestVolume } }
};

// Voice note state (separato per chiarezza)
const voice = {
  recognition: null,
  isListening:  false,
  supported:    !!(window.SpeechRecognition || window.webkitSpeechRecognition)
};

// ============================================================
//  DOM REFS
// ============================================================
const elTimer        = document.getElementById('timer-display');
const elStatus       = document.getElementById('session-status');
const elBtnStart     = document.getElementById('btn-start');
const elBtnStop      = document.getElementById('btn-stop');
const elBtnFAB       = document.getElementById('btn-add-exercise');
const elExList       = document.getElementById('exercise-list');
const elEmpty        = document.getElementById('exercise-list-empty');
const elStatsBar     = document.getElementById('session-stats-bar');
const elStatEx       = document.getElementById('stat-exercises');
const elStatSets     = document.getElementById('stat-sets');
const elStatVol      = document.getElementById('stat-volume');
const elNotesSection = document.getElementById('session-notes-section');
const elNotes        = document.getElementById('notes-input');
const elRestPanel    = document.getElementById('rest-timer-panel');
const elRestDisplay  = document.getElementById('rest-display');
const elBtnMic       = document.getElementById('btn-mic');
const elInterim      = document.getElementById('voice-interim');
const elVoiceNote    = document.getElementById('voice-note-input');

const modalAdd  = document.getElementById('modal-add-exercise');
const modalSet  = document.getElementById('modal-add-set');
const modalStop = document.getElementById('modal-stop');

// ============================================================
//  UTILITY
// ============================================================
const pad2 = n => String(n).padStart(2, '0');

function fmtHMS(secs) {
  return `${pad2(Math.floor(secs / 3600))}:${pad2(Math.floor((secs % 3600) / 60))}:${pad2(secs % 60)}`;
}
function fmtMS(secs) {
  return `${pad2(Math.floor(secs / 60))}:${pad2(secs % 60)}`;
}

const equipIcon = t => ({ bodyweight: '🏃', band: '↔️', kettlebell: '🏋️' }[t] || '');

function weightLabel(type) {
  if (type === 'bodyweight') return 'Peso extra (kg)';
  if (type === 'band')       return 'Resistenza banda';
  return 'Peso (kg)';
}

function badgeClass(g) {
  return 'badge-' + (g === 'full body' ? 'fullbody' : (g || '').replace(/\s+/g, ''));
}

function calcVolume() {
  return state.session.exercises.reduce(
    (tot, ex) => tot + ex.sets.reduce((s, set) => s + set.reps * set.weight, 0), 0
  );
}
function totalSets() {
  return state.session.exercises.reduce((t, ex) => t + ex.sets.length, 0);
}

// ============================================================
//  BEEP + VIBRAZIONE
// ============================================================
function playBeep() {
  try {
    const ctx  = new (window.AudioContext || window.webkitAudioContext)();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.6);
  } catch (_) {}
  if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
}

// ============================================================
//  VOICE NOTE — Web Speech API
// ============================================================
function initVoice() {
  if (!voice.supported) {
    elBtnMic.classList.add('hidden');
    document.getElementById('voice-not-supported').classList.remove('hidden');
    return;
  }

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  voice.recognition = new SR();
  voice.recognition.continuous     = true;
  voice.recognition.interimResults  = true;
  voice.recognition.lang            = 'it-IT';
  voice.recognition.maxAlternatives = 1;

  voice.recognition.onresult = (event) => {
    let interimText = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        // Appende alla textarea nota vocale
        const cur = elVoiceNote.value.trim();
        elVoiceNote.value = cur ? cur + ' ' + transcript.trim() : transcript.trim();
        elInterim.textContent = '';
      } else {
        interimText += transcript;
      }
    }
    if (interimText) elInterim.textContent = interimText;
  };

  voice.recognition.onerror = (event) => {
    // 'no-speech' è normale (pausa) — lascia gestire a onend
    if (event.error === 'no-speech') return;
    if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
      alert('Permesso microfono negato.\nAbilita il microfono nelle impostazioni di Chrome.');
      stopVoice();
      return;
    }
    if (event.error === 'network') {
      alert('Il riconoscimento vocale richiede connessione internet.');
      stopVoice();
      return;
    }
    console.warn('Speech error:', event.error);
  };

  // Su Chrome/Android recognition si ferma dopo qualche secondo di silenzio.
  // Se siamo ancora in "listening mode" la riavviamo.
  voice.recognition.onend = () => {
    if (voice.isListening) {
      setTimeout(() => {
        if (voice.isListening) {
          try { voice.recognition.start(); }
          catch (_) { stopVoice(); }
        }
      }, 120);
    }
  };
}

function toggleVoice() {
  if (voice.isListening) stopVoice();
  else startVoice();
}

function startVoice() {
  voice.isListening = true;
  elBtnMic.classList.add('listening');
  elBtnMic.textContent = '⏹';
  elBtnMic.setAttribute('aria-label', 'Ferma registrazione');
  elInterim.textContent = 'In ascolto…';
  elInterim.classList.remove('hidden');
  try {
    voice.recognition.start();
  } catch (e) {
    console.error('Errore avvio riconoscimento:', e);
    stopVoice();
  }
}

function stopVoice() {
  voice.isListening = false;
  elBtnMic.classList.remove('listening');
  elBtnMic.textContent = '🎤';
  elBtnMic.setAttribute('aria-label', 'Avvia registrazione');
  elInterim.textContent = '';
  elInterim.classList.add('hidden');
  try { voice.recognition.stop(); } catch (_) {}
}

// ============================================================
//  PR CELEBRATION
// ============================================================
let prConfettiPieces = [];

function showPRCelebration(exerciseName, valueNum, valueUnit) {
  const overlay  = document.getElementById('pr-overlay');
  document.getElementById('pr-ex-name').textContent    = exerciseName;
  document.getElementById('pr-value-num').textContent  = valueNum;
  document.getElementById('pr-value-unit').textContent = valueUnit;

  overlay.classList.remove('hidden', 'fade-out');

  // Vibrazione celebrativa
  if (navigator.vibrate) navigator.vibrate([50, 40, 100, 40, 200, 40, 300]);

  // Confetti
  prConfettiPieces.forEach(p => p.remove());
  prConfettiPieces = createConfetti();

  // Auto-dismiss dopo 2.8 secondi
  const dismiss = () => dismissPR(overlay);
  const autoTimer = setTimeout(dismiss, 2800);

  // Tap per chiudere in anticipo
  overlay.onclick = () => { clearTimeout(autoTimer); dismiss(); };
}

function dismissPR(overlay) {
  overlay.onclick = null;
  overlay.classList.add('fade-out');
  setTimeout(() => {
    overlay.classList.add('hidden');
    overlay.classList.remove('fade-out');
    prConfettiPieces.forEach(p => p.remove());
    prConfettiPieces = [];
  }, 380);
}

function createConfetti() {
  const colors  = ['#4f8ef7', '#4fc97a', '#f7974f', '#f74f4f', '#f7d14f', '#a84ff7', '#4ff7d1'];
  const pieces  = [];
  const count   = 50;

  for (let i = 0; i < count; i++) {
    const el    = document.createElement('div');
    el.className = 'confetti-piece';
    const size  = 6 + Math.random() * 9;
    const left  = Math.random() * 100;
    const dur   = 1.6 + Math.random() * 1.4;    // 1.6–3.0s
    const delay = Math.random() * 0.7;
    const tx    = `translateX(${(Math.random() - 0.5) * 120}px)`;
    const rot   = `${Math.floor(Math.random() * 3) * 360 + 360}deg`;
    const color = colors[Math.floor(Math.random() * colors.length)];

    el.style.cssText = `
      width:${size}px; height:${size}px;
      left:${left}%;
      background:${color};
      border-radius:${Math.random() > 0.4 ? '50%' : '2px'};
      animation-duration:${dur}s;
      animation-delay:${delay}s;
      --tx:${tx};
      --rot:${rot};
    `;
    document.body.appendChild(el);
    pieces.push(el);
  }
  return pieces;
}

// ============================================================
//  PERSONAL RECORDS — pre-caricamento + controllo real-time
// ============================================================
async function preloadRecord(exerciseId) {
  if (!exerciseId || exerciseId.startsWith('local_')) return;
  if (state.recordsCache[exerciseId] !== undefined) return; // già in cache

  try {
    const doc = await db.collection('records').doc(exerciseId).get();
    state.recordsCache[exerciseId] = doc.exists
      ? doc.data()
      : { maxWeight: 0, maxReps: 0, bestVolume: 0 };
  } catch (_) {
    state.recordsCache[exerciseId] = { maxWeight: 0, maxReps: 0, bestVolume: 0 };
  }
}

async function checkPRAndCelebrate(exerciseId, exerciseName, weight, reps) {
  if (!exerciseId || exerciseId.startsWith('local_')) return;

  // Carica record se non è ancora in cache
  if (state.recordsCache[exerciseId] === undefined) {
    await preloadRecord(exerciseId);
  }
  const rec = state.recordsCache[exerciseId] || {};

  if (weight > 0 && weight > (rec.maxWeight || 0)) {
    // ✨ Nuovo record di peso
    state.recordsCache[exerciseId] = { ...rec, maxWeight: weight };
    showPRCelebration(exerciseName, weight, 'kg');
    saveRecordField(exerciseId, { maxWeight: weight });

  } else if (weight === 0 && reps > (rec.maxReps || 0)) {
    // ✨ Nuovo record di ripetizioni (esercizi a corpo libero senza peso)
    state.recordsCache[exerciseId] = { ...rec, maxReps: reps };
    showPRCelebration(exerciseName, reps, 'rip');
    saveRecordField(exerciseId, { maxReps: reps });
  }
}

async function saveRecordField(exerciseId, updates) {
  try {
    const ref = db.collection('records').doc(exerciseId);
    const doc = await ref.get();
    updates.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
    if (doc.exists) await ref.update(updates);
    else            await ref.set({ maxWeight: 0, maxReps: 0, bestVolume: 0, ...updates });
  } catch (e) { console.warn('Errore salvataggio record:', e); }
}

// Fine-sessione: aggiorna anche bestVolume e maxReps globali
async function checkRecord(ex) {
  if (!ex.exerciseId || ex.exerciseId.startsWith('local_')) return;

  const maxWeight  = Math.max(...ex.sets.map(s => s.weight));
  const maxReps    = Math.max(...ex.sets.map(s => s.reps));
  const bestVolume = ex.sets.reduce((t, s) => t + s.reps * s.weight, 0);

  try {
    const ref = db.collection('records').doc(ex.exerciseId);
    const doc = await ref.get();
    if (!doc.exists) {
      await ref.set({ maxWeight, maxReps, bestVolume, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
    } else {
      const cur     = doc.data();
      const updates = {};
      if (maxWeight  > (cur.maxWeight  || 0)) updates.maxWeight  = maxWeight;
      if (maxReps    > (cur.maxReps    || 0)) updates.maxReps    = maxReps;
      if (bestVolume > (cur.bestVolume || 0)) updates.bestVolume = bestVolume;
      if (Object.keys(updates).length) {
        updates.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
        await ref.update(updates);
      }
    }
  } catch (e) { console.warn('Errore aggiornamento record:', e); }
}

// ============================================================
//  SESSION TIMER
// ============================================================
function startSessionTimer() {
  state.timer.intervalId = setInterval(() => {
    state.timer.elapsedSeconds++;
    elTimer.textContent = fmtHMS(state.timer.elapsedSeconds);
  }, 1000);
}

async function startSession() {
  state.session.startTime = new Date();
  state.session.isActive  = true;

  try {
    const ref = await db.collection('sessions').add({
      date:      firebase.firestore.Timestamp.fromDate(state.session.startTime),
      exercises: [],
      notes:     '',
      voiceNote: ''
    });
    state.session.id = ref.id;
  } catch (e) {
    console.warn('Firestore non raggiungibile, sessione solo locale:', e);
  }

  elBtnStart.classList.add('hidden');
  elBtnStop.classList.remove('hidden');
  elBtnFAB.classList.remove('hidden');
  elStatsBar.classList.remove('hidden');
  elNotesSection.classList.remove('hidden');
  elEmpty.classList.remove('hidden');
  elTimer.classList.add('running');
  elStatus.textContent = 'Sessione in corso…';

  startSessionTimer();
}

function requestStop() {
  if (!state.session.isActive) return;
  // Ferma la registrazione vocale se attiva
  if (voice.isListening) stopVoice();

  const vol = calcVolume();
  document.getElementById('stop-summary').innerHTML = `
    <div style="display:flex;gap:12px;justify-content:center;padding:14px 0;">
      <div style="text-align:center;">
        <div style="font-size:26px;font-weight:700;color:var(--primary)">${state.session.exercises.length}</div>
        <div style="font-size:11px;color:var(--muted);text-transform:uppercase;">Esercizi</div>
      </div>
      <div style="text-align:center;">
        <div style="font-size:26px;font-weight:700;color:var(--primary)">${totalSets()}</div>
        <div style="font-size:11px;color:var(--muted);text-transform:uppercase;">Serie</div>
      </div>
      <div style="text-align:center;">
        <div style="font-size:26px;font-weight:700;color:var(--primary)">${vol.toFixed(0)}</div>
        <div style="font-size:11px;color:var(--muted);text-transform:uppercase;">Volume kg</div>
      </div>
      <div style="text-align:center;">
        <div style="font-size:26px;font-weight:700;color:var(--primary)">${fmtHMS(state.timer.elapsedSeconds)}</div>
        <div style="font-size:11px;color:var(--muted);text-transform:uppercase;">Durata</div>
      </div>
    </div>`;
  modalStop.showModal();
}

async function confirmStop() {
  modalStop.close();
  clearInterval(state.timer.intervalId);
  stopRest();

  const endTime  = new Date();
  const payload  = {
    endTime:   firebase.firestore.Timestamp.fromDate(endTime),
    duration:  state.timer.elapsedSeconds,
    exercises: state.session.exercises,
    notes:     elNotes.value.trim(),
    voiceNote: elVoiceNote.value.trim()   // ← nota vocale salvata separatamente
  };

  try {
    if (state.session.id) {
      await db.collection('sessions').doc(state.session.id).update(payload);
    } else {
      const ref = await db.collection('sessions').add({
        date: firebase.firestore.Timestamp.fromDate(state.session.startTime || endTime),
        ...payload
      });
      state.session.id = ref.id;
    }
    // Aggiorna record completi a fine sessione (include bestVolume)
    for (const ex of state.session.exercises) {
      if (ex.exerciseId) await checkRecord(ex);
    }
  } catch (e) {
    alert('Errore nel salvataggio su Firestore. Controlla la connessione.');
    console.error(e);
    return;
  }

  state.session.isActive = false;
  elTimer.classList.remove('running');
  elBtnStop.classList.add('hidden');
  elBtnFAB.classList.add('hidden');
  elStatus.textContent = `Sessione salvata ✓ (${fmtHMS(state.timer.elapsedSeconds)})`;
}

// ============================================================
//  REST TIMER
// ============================================================
function startRest(seconds) {
  stopRest();
  state.rest.remainingSeconds = seconds;
  state.rest.isActive = true;
  elRestPanel.classList.remove('hidden');
  updateRestDisplay();
  state.rest.intervalId = setInterval(() => {
    state.rest.remainingSeconds--;
    updateRestDisplay();
    if (state.rest.remainingSeconds <= 0) { stopRest(); playBeep(); }
  }, 1000);
}

function stopRest() {
  clearInterval(state.rest.intervalId);
  state.rest.isActive = false;
  state.rest.remainingSeconds = 0;
  elRestPanel.classList.add('hidden');
}

function updateRestDisplay() {
  const s = Math.max(0, state.rest.remainingSeconds);
  elRestDisplay.textContent = fmtMS(s);
  elRestDisplay.style.color = s <= 5 ? 'var(--danger)' : 'var(--primary)';
}

// ============================================================
//  RENDER ESERCIZI
// ============================================================
function renderExercises() {
  elExList.querySelectorAll('.exercise-card').forEach(c => c.remove());

  if (state.session.exercises.length === 0) {
    elEmpty.classList.remove('hidden');
  } else {
    elEmpty.classList.add('hidden');
    state.session.exercises.forEach((ex, i) => elExList.appendChild(buildCard(ex, i)));
  }
  updateStats();
}

function buildCard(ex, idx) {
  const card = document.createElement('article');
  card.className = 'exercise-card';

  const rows = ex.sets.map((s, si) => `
    <tr>
      <td class="set-num">${si + 1}</td>
      <td>${s.reps} rip</td>
      <td>${s.weight > 0 ? s.weight + ' kg' : '—'}</td>
      <td><span class="rpe-dot rpe-${s.rpe}" title="RPE ${s.rpe}"></span></td>
      <td><button class="btn-delete-set" data-ex="${idx}" data-set="${si}">×</button></td>
    </tr>`).join('');

  card.innerHTML = `
    <div class="exercise-card-header">
      <span class="ex-type-icon">${equipIcon(ex.type)}</span>
      <span class="ex-name">${ex.name}</span>
      <span class="badge ${badgeClass(ex.muscleGroup)}">${ex.muscleGroup}</span>
      <button class="btn-delete-exercise" data-idx="${idx}" title="Rimuovi">🗑</button>
    </div>
    <div class="exercise-card-body">
      ${ex.sets.length ? `
        <table class="sets-table">
          <thead><tr><th>#</th><th>Rip</th><th>Peso</th><th>RPE</th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table>` :
        '<p class="text-muted" style="font-size:13px;margin-bottom:10px;">Nessuna serie aggiunta</p>'
      }
      <div class="card-actions">
        <button class="btn btn-ghost btn-sm btn-add-set"    data-idx="${idx}">+ Aggiungi serie</button>
        <button class="btn btn-ghost btn-sm btn-start-rest" data-idx="${idx}">⏱ Riposo 60s</button>
      </div>
    </div>`;
  return card;
}

function updateStats() {
  elStatEx.textContent   = state.session.exercises.length;
  elStatSets.textContent = totalSets();
  const v = calcVolume();
  elStatVol.textContent  = v > 0 ? v.toFixed(0) : '0';
}

// ============================================================
//  MODAL: AGGIUNGI ESERCIZIO
// ============================================================
async function loadExerciseCache() {
  if (state.exerciseCache) return state.exerciseCache;
  try {
    const snap = await db.collection('exercises').orderBy('name').get();
    state.exerciseCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (_) {
    state.exerciseCache = [];
  }
  return state.exerciseCache;
}

function openAddModal() {
  state.addExercise.selected = null;
  state.addExercise.rpe = 3;

  document.getElementById('exercise-search').value = '';
  document.getElementById('search-results').innerHTML = '';
  document.getElementById('search-results').classList.remove('visible');
  document.getElementById('new-ex-name').value    = '';
  document.getElementById('new-ex-muscle').value  = '';
  document.getElementById('new-ex-notes').value   = '';
  document.querySelector('input[name="new-ex-type"][value="bodyweight"]').checked = true;
  document.getElementById('set-reps').value   = '';
  document.getElementById('set-weight').value = '';

  showStep('step-search');
  setRPE('rpe-selector', 3);
  modalAdd.showModal();
  loadExerciseCache();
}

function showStep(id) {
  ['step-search', 'step-new-exercise', 'step-add-set'].forEach(s => {
    document.getElementById(s).classList.toggle('hidden', s !== id);
  });
  document.getElementById('modal-add-title').textContent =
    id === 'step-search'       ? 'Aggiungi esercizio' :
    id === 'step-new-exercise' ? 'Nuovo esercizio'    : 'Prima serie';
}

function filterExercises(q) {
  const results = document.getElementById('search-results');
  if (!q) { results.innerHTML = ''; results.classList.remove('visible'); return; }

  const lower   = q.toLowerCase();
  const matches = (state.exerciseCache || []).filter(ex =>
    ex.name.toLowerCase().includes(lower)
  ).slice(0, 8);

  results.innerHTML = matches.length === 0
    ? `<li class="no-results">Nessun risultato per "${q}"</li>`
    : matches.map(ex => `
        <li class="search-result-item"
            data-id="${ex.id}" data-name="${ex.name}"
            data-muscle="${ex.muscleGroup}" data-type="${ex.type}">
          <span class="ex-type-icon">${equipIcon(ex.type)}</span>
          <span class="ex-name">${ex.name}</span>
          <span class="badge ${badgeClass(ex.muscleGroup)}">${ex.muscleGroup}</span>
        </li>`).join('');

  results.classList.add('visible');
}

function selectExercise(id, name, muscleGroup, type) {
  state.addExercise.selected = { id, name, muscleGroup, type };

  document.getElementById('selected-ex-info').innerHTML = `
    <span class="ex-type-icon">${equipIcon(type)}</span>
    <span class="ex-name">${name}</span>
    <span class="badge ${badgeClass(muscleGroup)}">${muscleGroup}</span>`;

  document.getElementById('set-weight-label').textContent = weightLabel(type);
  document.getElementById('set-weight').placeholder = { bodyweight: '0', band: '3', kettlebell: '16' }[type] || '0';

  showStep('step-add-set');

  // Pre-carica il record in background così è pronto per il check PR
  preloadRecord(id);
}

function showNewExerciseForm() {
  const q = document.getElementById('exercise-search').value.trim();
  document.getElementById('new-ex-name').value = q;
  showStep('step-new-exercise');
}

async function proceedNewExercise() {
  const name   = document.getElementById('new-ex-name').value.trim();
  const muscle = document.getElementById('new-ex-muscle').value;
  const type   = document.querySelector('input[name="new-ex-type"]:checked').value;
  const notes  = document.getElementById('new-ex-notes').value.trim();

  if (!name)   { alert('Inserisci il nome dell\'esercizio'); return; }
  if (!muscle) { alert('Seleziona il gruppo muscolare'); return; }

  let id = 'local_' + Date.now();
  try {
    const ref = await db.collection('exercises').add({
      name, muscleGroup: muscle, type, notes,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    id = ref.id;
    state.exerciseCache = null;
  } catch (e) {
    console.warn('Salvataggio esercizio fallito, uso ID locale:', e);
  }

  selectExercise(id, name, muscle, type);
}

async function confirmAddExercise() {
  const reps   = parseInt(document.getElementById('set-reps').value);
  const weight = parseFloat(document.getElementById('set-weight').value) || 0;
  const ex     = state.addExercise.selected;
  const rpe    = state.addExercise.rpe;

  if (!ex)               { alert('Seleziona un esercizio'); return; }
  if (!reps || reps < 1) { alert('Inserisci le ripetizioni'); return; }

  state.session.exercises.push({
    exerciseId:  ex.id,
    name:        ex.name,
    muscleGroup: ex.muscleGroup,
    type:        ex.type,
    sets:        [{ reps, weight, rpe }]
  });

  modalAdd.close();
  renderExercises();
  startRest(60);

  // Controlla PR in background (non blocca UI)
  checkPRAndCelebrate(ex.id, ex.name, weight, reps);
}

// ============================================================
//  MODAL: AGGIUNGI SERIE A ESERCIZIO ESISTENTE
// ============================================================
function openAddSetModal(idx) {
  state.addSet.exerciseIndex = idx;
  state.addSet.rpe = 3;

  const ex = state.session.exercises[idx];
  document.getElementById('modal-set-title').textContent      = ex.name;
  document.getElementById('addset-reps').value                = '';
  document.getElementById('addset-weight').value              = '';
  document.getElementById('addset-weight-label').textContent  = weightLabel(ex.type);
  setRPE('addset-rpe-selector', 3);
  modalSet.showModal();
}

async function confirmAddSet() {
  const idx    = state.addSet.exerciseIndex;
  const reps   = parseInt(document.getElementById('addset-reps').value);
  const weight = parseFloat(document.getElementById('addset-weight').value) || 0;
  const rpe    = state.addSet.rpe;

  if (!reps || reps < 1) { alert('Inserisci le ripetizioni'); return; }

  state.session.exercises[idx].sets.push({ reps, weight, rpe });
  modalSet.close();
  renderExercises();
  startRest(60);

  // Controlla PR in background
  const ex = state.session.exercises[idx];
  checkPRAndCelebrate(ex.exerciseId, ex.name, weight, reps);
}

// ============================================================
//  RPE HELPER
// ============================================================
function setRPE(selectorId, value) {
  document.querySelectorAll(`#${selectorId} .rpe-btn`).forEach(btn => {
    btn.classList.toggle('active', +btn.dataset.rpe === value);
  });
}

// ============================================================
//  AVVISO USCITA CON SESSIONE ATTIVA
// ============================================================
window.addEventListener('beforeunload', e => {
  if (state.session.isActive) {
    e.preventDefault();
    e.returnValue = '';
  }
});

// ============================================================
//  EVENT LISTENERS
// ============================================================

// Sessione
elBtnStart.addEventListener('click', startSession);
elBtnStop.addEventListener('click',  requestStop);

// FAB
elBtnFAB.addEventListener('click', openAddModal);

// Microfono nota vocale
elBtnMic.addEventListener('click', toggleVoice);

// Delegazione lista esercizi
elExList.addEventListener('click', e => {
  const addSetBtn = e.target.closest('.btn-add-set');
  if (addSetBtn) { openAddSetModal(+addSetBtn.dataset.idx); return; }

  const restBtn = e.target.closest('.btn-start-rest');
  if (restBtn) { startRest(60); return; }

  const delExBtn = e.target.closest('.btn-delete-exercise');
  if (delExBtn && confirm('Rimuovere questo esercizio dalla sessione?')) {
    state.session.exercises.splice(+delExBtn.dataset.idx, 1);
    renderExercises();
    return;
  }

  const delSetBtn = e.target.closest('.btn-delete-set');
  if (delSetBtn) {
    state.session.exercises[+delSetBtn.dataset.ex].sets.splice(+delSetBtn.dataset.set, 1);
    renderExercises();
  }
});

// Modal aggiungi esercizio
document.getElementById('btn-close-add').addEventListener('click',   () => modalAdd.close());
document.getElementById('btn-new-exercise').addEventListener('click', showNewExerciseForm);
document.getElementById('btn-back-search').addEventListener('click',  () => showStep('step-search'));
document.getElementById('btn-proceed-new').addEventListener('click',  proceedNewExercise);
document.getElementById('btn-confirm-add').addEventListener('click',  confirmAddExercise);

let searchTimer = null;
document.getElementById('exercise-search').addEventListener('input', e => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => filterExercises(e.target.value.trim()), 250);
});

document.getElementById('search-results').addEventListener('click', e => {
  const item = e.target.closest('.search-result-item');
  if (item) selectExercise(item.dataset.id, item.dataset.name, item.dataset.muscle, item.dataset.type);
});

document.getElementById('rpe-selector').addEventListener('click', e => {
  const btn = e.target.closest('.rpe-btn');
  if (btn) { state.addExercise.rpe = +btn.dataset.rpe; setRPE('rpe-selector', state.addExercise.rpe); }
});

// Modal aggiungi serie
document.getElementById('btn-close-set').addEventListener('click',  () => modalSet.close());
document.getElementById('btn-confirm-set').addEventListener('click', confirmAddSet);

document.getElementById('addset-rpe-selector').addEventListener('click', e => {
  const btn = e.target.closest('.rpe-btn');
  if (btn) { state.addSet.rpe = +btn.dataset.rpe; setRPE('addset-rpe-selector', state.addSet.rpe); }
});

// Modal stop sessione
document.getElementById('btn-cancel-stop').addEventListener('click',   () => modalStop.close());
document.getElementById('btn-cancel-stop-2').addEventListener('click', () => modalStop.close());
document.getElementById('btn-confirm-stop').addEventListener('click',  confirmStop);

// Rest timer
document.querySelectorAll('#rest-timer-panel [data-seconds]').forEach(btn => {
  btn.addEventListener('click', () => startRest(+btn.dataset.seconds));
});
document.getElementById('btn-rest-minus').addEventListener('click', () => {
  if (!state.rest.isActive) return;
  state.rest.remainingSeconds = Math.max(5, state.rest.remainingSeconds - 15);
  updateRestDisplay();
});
document.getElementById('btn-rest-plus').addEventListener('click', () => {
  if (!state.rest.isActive) return;
  state.rest.remainingSeconds += 15;
  updateRestDisplay();
});
document.getElementById('btn-rest-skip').addEventListener('click', stopRest);

// ============================================================
//  INIT
// ============================================================
initVoice();
