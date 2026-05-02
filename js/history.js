'use strict';

// ============================================================
//  STATO
// ============================================================
const PAGE_SIZE = 20;

const state = {
  filter:       'all',    // '7d' | '30d' | 'all'
  sessions:     [],
  lastDoc:      null,
  hasMore:      false,
  calMonth:     new Date() // mese visualizzato nel calendario
};

// ============================================================
//  UTILITY
// ============================================================
const BAND_COLORS = { giallo:'#FFD700', verde:'#3DBE29', rosso:'#E53935', blu:'#1E88E5', viola:'#8E24AA', nero:'#2A2A2A' };

const MONTHS_IT  = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno',
                    'Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
const WEEKDAYS_IT = ['Domenica','Lunedì','Martedì','Mercoledì','Giovedì','Venerdì','Sabato'];

function fmtDateTime(ts) {
  if (!ts) return { weekday: '', dateStr: '—', time: '' };
  const d = ts.toDate();
  return {
    weekday: WEEKDAYS_IT[d.getDay()],
    dateStr: `${d.getDate()} ${MONTHS_IT[d.getMonth()].slice(0,3)}`,
    time:    `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
  };
}

function fmtDuration(secs) {
  if (!secs || secs < 60) return secs ? `${secs}s` : '—';
  const m = Math.floor(secs / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), rm = m % 60;
  return rm > 0 ? `${h}h ${rm}min` : `${h}h`;
}

function calcVolume(exercises) {
  if (!Array.isArray(exercises)) return 0;
  return exercises.reduce((t, ex) =>
    t + (ex.sets || []).reduce((s, set) => s + (set.reps || 0) * (set.weight || 0), 0), 0);
}

function badgeClass(g) {
  return 'badge-' + ((g === 'full body') ? 'fullbody' : (g || '').replace(/\s+/g, ''));
}

function getFilterStartDate(filter) {
  if (filter === 'all') return null;
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - (filter === '7d' ? 7 : 30));
  return d;
}

// ============================================================
//  CARICAMENTO DA FIRESTORE
// ============================================================
async function loadSessions(reset = false) {
  const list = document.getElementById('session-list');
  const btnMore = document.getElementById('btn-load-more');

  if (reset) {
    state.sessions = [];
    state.lastDoc  = null;
    state.hasMore  = false;
    list.innerHTML = '<div class="loading-state">Caricamento...</div>';
    btnMore.classList.add('hidden');
  }

  let q = db.collection('sessions')
    .orderBy('date', 'desc')
    .limit(PAGE_SIZE);

  const startDate = getFilterStartDate(state.filter);
  if (startDate) {
    q = q.where('date', '>=', firebase.firestore.Timestamp.fromDate(startDate));
  }
  if (state.lastDoc) q = q.startAfter(state.lastDoc);

  try {
    const snap = await q.get();

    if (snap.empty && reset) {
      renderEmpty();
      renderCalendar();
      return;
    }

    const fresh = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    state.sessions  = reset ? fresh : [...state.sessions, ...fresh];
    state.lastDoc   = snap.docs[snap.docs.length - 1] || state.lastDoc;
    state.hasMore   = snap.docs.length === PAGE_SIZE;

    renderCalendar();
    renderList(reset, fresh);

    btnMore.classList.toggle('hidden', !state.hasMore);
  } catch (e) {
    console.error(e);
    list.innerHTML = `
      <div class="no-data-state">
        <div class="icon">⚠️</div>
        <p>Errore nel caricamento.<br>Controlla la connessione.</p>
      </div>`;
  }
}

// ============================================================
//  RENDER LISTA
// ============================================================
function renderList(reset, fresh) {
  const list = document.getElementById('session-list');
  if (reset) list.innerHTML = '';
  fresh.forEach(s => {
    if (!document.getElementById(`s-${s.id}`)) {
      list.appendChild(buildCard(s));
    }
  });
}

function renderEmpty() {
  document.getElementById('session-list').innerHTML = `
    <div class="no-data-state">
      <div class="icon">📭</div>
      <p>Nessuna sessione trovata<br>per il periodo selezionato</p>
    </div>`;
}

function buildCard(session) {
  const card = document.createElement('article');
  card.className = 'session-card';
  card.id = `s-${session.id}`;

  const dt        = fmtDateTime(session.date);
  const duration  = fmtDuration(session.duration);
  const exercises = session.exercises || [];
  const volume    = calcVolume(exercises);
  const totalSets = exercises.reduce((t, ex) => t + (ex.sets || []).length, 0);

  // Riepilogo esercizi espandibile
  const exRows = exercises.map(ex => {
    const sets      = ex.sets || [];
    const nSets     = sets.length;
    const maxReps   = sets.length ? Math.max(...sets.map(s => s.reps   || 0)) : 0;
    const maxWeight = sets.length ? Math.max(...sets.map(s => s.weight || 0)) : 0;
    const exVol     = sets.reduce((t, s) => t + (s.reps||0)*(s.weight||0), 0);

    const setsLabel = maxWeight > 0
      ? `${nSets}×${maxReps} · ${maxWeight}kg`
      : `${nSets}×${maxReps}`;

    const lastSet   = sets[sets.length - 1];
    const rpeEmoji  = lastSet?.rpe
      ? (typeof lastSet.rpe === 'string'
         ? { facile:'🟢', medio:'🟡', duro:'🔴' }[lastSet.rpe] || ''
         : ['','🟢','🟢','🟡','🔴','🔴'][lastSet.rpe] || '')
      : '';
    const bandDot = lastSet?.bandColor
      ? `<span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${BAND_COLORS[lastSet.bandColor]||'#888'};margin-left:3px;vertical-align:middle;" title="${lastSet.bandColor}"></span>`
      : '';

    return `
      <div class="session-exercise-row">
        <span class="badge ${badgeClass(ex.muscleGroup)}">${ex.muscleGroup || '—'}</span>
        <span class="session-ex-name">${ex.name}${bandDot}</span>
        <span class="session-ex-sets">${setsLabel}${exVol > 0 ? ' · <strong>' + exVol.toFixed(0) + 'kg</strong>' : ''}${rpeEmoji ? ' ' + rpeEmoji : ''}</span>
      </div>`;
  }).join('');

  const notesHtml = session.notes
    ? `<div class="session-notes-text">"${session.notes}"</div>`
    : '';

  const voiceNoteHtml = session.voiceNoteUrl
    ? `<div class="session-voice-note">
         <span class="voice-note-icon">🎤</span>
         <audio controls src="${session.voiceNoteUrl}" preload="none" style="flex:1;min-width:0;height:36px;"></audio>
       </div>`
    : session.voiceNote
    ? `<div class="session-voice-note"><span class="voice-note-icon">🎤</span>${session.voiceNote}</div>`
    : '';

  const volStr = volume > 0 ? ` · ${volume.toFixed(0)} kg` : '';

  card.innerHTML = `
    <div class="session-card-header">
      <div class="session-date-block">
        <span class="session-day">${dt.weekday}</span>
        <span class="session-datetime">${dt.dateStr} · ${dt.time}</span>
      </div>
      <div class="session-meta">
        <span class="session-duration">${duration}</span>
        <span class="session-vol-info">${exercises.length} eserc · ${totalSets} serie${volStr}</span>
      </div>
      <span class="session-chevron">›</span>
    </div>
    <div class="session-card-body hidden">
      ${exRows || '<p class="text-muted" style="font-size:13px;padding:8px 0;">Nessun esercizio registrato</p>'}
      ${notesHtml}
      ${voiceNoteHtml}
      <div class="session-card-footer">
        <button class="btn btn-danger btn-sm btn-del" data-id="${session.id}">Elimina sessione</button>
      </div>
    </div>`;

  // Espandi / comprimi
  card.querySelector('.session-card-header').addEventListener('click', () => {
    card.classList.toggle('expanded');
    card.querySelector('.session-card-body').classList.toggle('hidden');
  });

  // Elimina
  card.querySelector('.btn-del').addEventListener('click', e => {
    e.stopPropagation();
    confirmDelete(session.id, card);
  });

  return card;
}

// ============================================================
//  ELIMINA SESSIONE
// ============================================================
async function confirmDelete(id, cardEl) {
  if (!confirm('Eliminare questa sessione? L\'azione è irreversibile.')) return;
  try {
    await db.collection('sessions').doc(id).delete();
    cardEl.remove();
    state.sessions = state.sessions.filter(s => s.id !== id);
    renderCalendar(); // aggiorna i punti nel calendario
  } catch (e) {
    alert('Errore durante l\'eliminazione.');
    console.error(e);
  }
}

// ============================================================
//  CALENDARIO MENSILE
// ============================================================
function renderCalendar() {
  const container = document.getElementById('calendar-container');
  if (!container) return;

  const year  = state.calMonth.getFullYear();
  const month = state.calMonth.getMonth();

  // Calcola volume per giorno nel mese visualizzato
  const dayVol = {};
  state.sessions.forEach(s => {
    if (!s.date) return;
    const d = s.date.toDate();
    if (d.getFullYear() === year && d.getMonth() === month) {
      const k = d.getDate();
      dayVol[k] = (dayVol[k] || 0) + calcVolume(s.exercises);
    }
  });

  const maxVol      = Math.max(1, ...Object.values(dayVol));
  const today       = new Date();
  const todayStr    = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;
  const firstDayOfWeek = (new Date(year, month, 1).getDay() + 6) % 7; // lunedì=0
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const WDAYS = ['L','M','M','G','V','S','D'];

  let cells = WDAYS.map(w => `<div class="cal-weekday">${w}</div>`).join('');
  cells    += Array(firstDayOfWeek).fill('<div class="cal-day"></div>').join('');

  for (let d = 1; d <= daysInMonth; d++) {
    const vol    = dayVol[d] || 0;
    const isToday = `${year}-${month}-${d}` === todayStr;
    let cls = 'cal-day';
    if (isToday) cls += ' today';
    if (vol > 0) {
      const ratio = vol / maxVol;
      cls += ' has-session ' + (ratio > 0.65 ? 'vol-high' : ratio > 0.3 ? 'vol-med' : 'vol-low');
    }
    cells += `<div class="${cls}" data-day="${d}">${d}</div>`;
  }

  container.innerHTML = `
    <div class="calendar-month-header">
      <button class="cal-nav-btn" id="cal-prev">‹</button>
      <span class="calendar-month-title">${MONTHS_IT[month]} ${year}</span>
      <button class="cal-nav-btn" id="cal-next">›</button>
    </div>
    <div class="calendar-grid">${cells}</div>`;

  // Navigazione mese
  container.querySelector('#cal-prev').addEventListener('click', () => {
    state.calMonth = new Date(year, month - 1, 1);
    renderCalendar();
  });
  container.querySelector('#cal-next').addEventListener('click', () => {
    state.calMonth = new Date(year, month + 1, 1);
    renderCalendar();
  });

  // Tap su giorno → scroll alla sessione
  container.querySelectorAll('.cal-day.has-session').forEach(el => {
    el.addEventListener('click', () => {
      const d = +el.dataset.day;
      const target = state.sessions.find(s => {
        if (!s.date) return false;
        const sd = s.date.toDate();
        return sd.getFullYear() === year && sd.getMonth() === month && sd.getDate() === d;
      });
      if (target) {
        const card = document.getElementById(`s-${target.id}`);
        if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });
}

// ============================================================
//  EVENT LISTENERS
// ============================================================

// Filtri periodo
document.querySelectorAll('.filter-pill').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-pill').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.filter = btn.dataset.filter;
    loadSessions(true);
  });
});

// Load more
document.getElementById('btn-load-more').addEventListener('click', () => loadSessions(false));

// ============================================================
//  INIT
// ============================================================
loadSessions(true);
