'use strict';

// ============================================================
//  UTILITY
// ============================================================
const MONTHS_IT  = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno',
                    'Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
const MONTHS_S   = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];
const WEEKDAYS_IT = ['Domenica','Lunedì','Martedì','Mercoledì','Giovedì','Venerdì','Sabato'];

function greeting() {
  const h = new Date().getHours();
  if (h >= 5  && h < 12) return 'Buongiorno';
  if (h >= 12 && h < 18) return 'Buon pomeriggio';
  return 'Buonasera';
}

function todayStr() {
  const d = new Date();
  return `${WEEKDAYS_IT[d.getDay()]}, ${d.getDate()} ${MONTHS_IT[d.getMonth()]} ${d.getFullYear()}`;
}

function isSameDay(date, ref) {
  return date.getFullYear() === ref.getFullYear() &&
         date.getMonth()    === ref.getMonth()    &&
         date.getDate()     === ref.getDate();
}

function calcVolume(exercises) {
  if (!Array.isArray(exercises)) return 0;
  return exercises.reduce((t, ex) =>
    t + (ex.sets || []).reduce((s, set) => s + (set.reps || 0) * (set.weight || 0), 0), 0);
}

function fmtDuration(secs) {
  if (!secs) return '—';
  const m = Math.floor(secs / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m/60)}h ${m%60}min`;
}

function badgeClass(g) {
  return 'badge-' + ((g === 'full body') ? 'fullbody' : (g || '').replace(/\s+/g, ''));
}

// ============================================================
//  SALUTO
// ============================================================
document.getElementById('greeting').textContent    = `${greeting()}, Flavio 👋`;
document.getElementById('greeting-sub').textContent = todayStr();

// ============================================================
//  CARICAMENTO DATI
// ============================================================
async function loadDashboard() {
  try {
    // Prendi le ultime 30 sessioni (più che sufficienti per streak + oggi)
    const snap = await db.collection('sessions')
      .orderBy('date', 'desc')
      .limit(30)
      .get();

    const sessions = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderToday(sessions);
    renderCTA(sessions);
    renderStreak(sessions);
    renderLastSession(sessions);
    renderRecentMuscles(sessions);
  } catch (e) {
    console.error('Errore dashboard:', e);
  }

  loadRecentPR();
}

// ============================================================
//  SESSIONI DI OGGI
// ============================================================
function renderToday(sessions) {
  const today   = new Date();
  const todaySessions = sessions.filter(s => s.date && isSameDay(s.date.toDate(), today));
  if (!todaySessions.length) return;

  const totalVol = todaySessions.reduce((t, s) => t + calcVolume(s.exercises), 0);
  const totalMin = Math.floor(todaySessions.reduce((t, s) => t + (s.duration || 0), 0) / 60);

  document.getElementById('td-sessions').textContent = todaySessions.length;
  document.getElementById('td-volume').textContent   = totalVol > 0 ? totalVol.toFixed(0) : '0';
  document.getElementById('td-duration').textContent = totalMin;
  document.getElementById('today-row').style.display = 'flex';
}

// ============================================================
//  CTA PRINCIPALE
// ============================================================
function renderCTA(sessions) {
  const today = new Date();
  const todaySessions = sessions.filter(s => s.date && isSameDay(s.date.toDate(), today));
  const cLabel = document.getElementById('cta-label');
  const cSub   = document.getElementById('cta-sub');

  if (todaySessions.length === 0) {
    cLabel.textContent = 'Prima sessione del giorno';
    cSub.textContent   = '▶ Inizia ora';
  } else {
    cLabel.textContent = `Sessione ${todaySessions.length + 1} di oggi`;
    cSub.textContent   = '▶ Torna ad allenarti';
  }
}

// ============================================================
//  STREAK
// ============================================================
function renderStreak(sessions) {
  if (!sessions.length) {
    document.getElementById('streak-count').textContent = '0';
    document.getElementById('streak-last').textContent  = 'Nessuna sessione';
    return;
  }

  // Raggruppa per giorno (set di date YYYY-MM-DD)
  const daySet = new Set(
    sessions
      .filter(s => s.date)
      .map(s => {
        const d = s.date.toDate();
        return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      })
  );

  // Conta streak a ritroso da oggi
  let streak = 0;
  const check = new Date();
  check.setHours(0, 0, 0, 0);

  // Se oggi non ha sessioni, inizia da ieri
  const todayKey = `${check.getFullYear()}-${check.getMonth()}-${check.getDate()}`;
  if (!daySet.has(todayKey)) check.setDate(check.getDate() - 1);

  while (true) {
    const key = `${check.getFullYear()}-${check.getMonth()}-${check.getDate()}`;
    if (!daySet.has(key)) break;
    streak++;
    check.setDate(check.getDate() - 1);
  }

  document.getElementById('streak-count').textContent = streak;

  // Ultima sessione
  const last = sessions[0];
  if (last?.date) {
    const d  = last.date.toDate();
    const gg = isSameDay(d, new Date()) ? 'oggi' :
               isSameDay(d, new Date(Date.now() - 86400000)) ? 'ieri' :
               `${d.getDate()} ${MONTHS_S[d.getMonth()]}`;
    document.getElementById('streak-last').textContent = `Ultima: ${gg}`;
  }
}

// ============================================================
//  ULTIMA SESSIONE
// ============================================================
function renderLastSession(sessions) {
  const last = sessions[0];
  const container = document.getElementById('last-session-content');
  if (!last) return;

  const d  = last.date?.toDate();
  const dateStr = d
    ? `${WEEKDAYS_IT[d.getDay()]} ${d.getDate()} ${MONTHS_S[d.getMonth()]} · ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
    : '—';
  const vol   = calcVolume(last.exercises);
  const exes  = last.exercises || [];
  const nSets = exes.reduce((t, ex) => t + (ex.sets || []).length, 0);

  const badges = [...new Set(exes.map(e => e.muscleGroup).filter(Boolean))]
    .map(g => `<span class="badge ${badgeClass(g)}">${g}</span>`)
    .join(' ');

  container.innerHTML = `
    <div class="last-session-row" style="margin-bottom:10px;">
      <span class="last-session-date">${dateStr}</span>
      <span class="last-session-meta">${fmtDuration(last.duration)}</span>
    </div>
    <div style="font-size:13px; color:var(--muted); margin-bottom:8px;">
      ${exes.length} esercizi · ${nSets} serie${vol > 0 ? ' · ' + vol.toFixed(0) + ' kg' : ''}
    </div>
    <div class="quick-muscles">${badges}</div>`;
}

// ============================================================
//  MUSCOLI ULTIMI 7 GIORNI
// ============================================================
function renderRecentMuscles(sessions) {
  const cutoff = new Date(Date.now() - 7 * 24 * 3600 * 1000);
  const freq   = {};

  sessions.forEach(s => {
    if (!s.date || s.date.toDate() < cutoff) return;
    (s.exercises || []).forEach(ex => {
      const g = ex.muscleGroup;
      if (g) freq[g] = (freq[g] || 0) + 1;
    });
  });

  const container = document.getElementById('recent-muscles');
  if (!Object.keys(freq).length) {
    container.innerHTML = '<span class="text-muted" style="font-size:13px;">Nessuna sessione negli ultimi 7 giorni</span>';
    return;
  }

  const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]);
  container.innerHTML = sorted
    .map(([g, n]) => `<span class="badge ${badgeClass(g)}">${g} ×${n}</span>`)
    .join('');
}

// ============================================================
//  ULTIMI PERSONAL RECORD
// ============================================================
async function loadRecentPR() {
  const container = document.getElementById('recent-pr-list');
  try {
    const [recSnap, exSnap] = await Promise.all([
      db.collection('records').orderBy('updatedAt', 'desc').limit(5).get(),
      db.collection('exercises').get()
    ]);

    const exMap = {};
    exSnap.docs.forEach(d => { exMap[d.id] = d.data().name; });

    if (recSnap.empty) {
      container.innerHTML = '<p class="text-muted" style="font-size:13px;">Completa qualche sessione per vedere i tuoi PR</p>';
      return;
    }

    container.innerHTML = recSnap.docs
      .filter(d => exMap[d.id])
      .map(d => {
        const r    = d.data();
        const main = r.maxWeight > 0 ? `${r.maxWeight} kg` : `${r.maxReps} rip`;
        return `
          <div class="pr-row">
            <span class="pr-ex-name">${exMap[d.id]}</span>
            <div class="pr-values">
              <span class="pr-main">${main}</span>
              ${r.maxReps ? `<span class="pr-sub">${r.maxReps} rip max</span>` : ''}
            </div>
          </div>`;
      }).join('');
  } catch (e) {
    console.error('Errore PR:', e);
  }
}

// ============================================================
//  INIT
// ============================================================
loadDashboard();
