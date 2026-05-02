'use strict';

// ============================================================
//  STATO
// ============================================================
const state = {
  periodDays: 30,   // 0 = tutto
  sessions:   [],
  charts:     {}    // { volume, progress, rpe } — istanze Chart.js
};

// ============================================================
//  UTILITY
// ============================================================
const MONTHS_SHORT = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];

function calcVolume(exercises) {
  if (!Array.isArray(exercises)) return 0;
  return exercises.reduce((t, ex) =>
    t + (ex.sets || []).reduce((s, set) => s + (set.reps || 0) * (set.weight || 0), 0), 0);
}

function fmtDateShort(ts) {
  const d = ts.toDate();
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}

function getStartDate(days) {
  if (days === 0) return null;
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - days);
  return d;
}

function destroyChart(key) {
  if (state.charts[key]) {
    state.charts[key].destroy();
    state.charts[key] = null;
  }
}

// Colori Chart.js coerenti con il CSS
const C = {
  primary:  '#4f8ef7',
  success:  '#4fc97a',
  accent:   '#f7974f',
  danger:   '#f74f4f',
  muted:    '#7a7f9a',
  surface2: '#252840',
  gridLine: '#2e3248'
};

const baseChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: false }, tooltip: { enabled: true } },
  scales: {
    x: {
      ticks: { color: C.muted, font: { size: 11 }, maxRotation: 0 },
      grid:  { color: C.gridLine }
    },
    y: {
      ticks: { color: C.muted, font: { size: 11 } },
      grid:  { color: C.gridLine },
      beginAtZero: true
    }
  }
};

// ============================================================
//  CARICAMENTO DATI
// ============================================================
async function loadData() {
  setKPI('—', '—', '—', '—');

  let q = db.collection('sessions').orderBy('date', 'asc');
  const start = getStartDate(state.periodDays);
  if (start) q = q.where('date', '>=', firebase.firestore.Timestamp.fromDate(start));

  try {
    const snap = await q.get();
    state.sessions = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderAll();
  } catch (e) {
    console.error('Errore caricamento stats:', e);
  }
}

async function loadExercisesForSelect() {
  try {
    const snap = await db.collection('exercises').orderBy('name').get();
    const sel = document.getElementById('progress-select');
    snap.docs.forEach(d => {
      const opt = document.createElement('option');
      opt.value = d.id;
      opt.textContent = d.data().name;
      sel.appendChild(opt);
    });
  } catch (_) {}
}

async function loadPersonalRecords() {
  const container = document.getElementById('pr-list');
  try {
    const [recSnap, exSnap] = await Promise.all([
      db.collection('records').get(),
      db.collection('exercises').get()
    ]);

    const exMap = {};
    exSnap.docs.forEach(d => { exMap[d.id] = d.data().name; });

    if (recSnap.empty) {
      container.innerHTML = '<p class="text-muted" style="font-size:13px;padding:8px 0;">Nessun personal record ancora. Completa qualche sessione!</p>';
      return;
    }

    const rows = recSnap.docs
      .filter(d => exMap[d.id])
      .sort((a, b) => (exMap[a.id] || '').localeCompare(exMap[b.id] || ''))
      .map(d => {
        const r = d.data();
        const subs = [];
        if (r.maxReps)    subs.push(`${r.maxReps} rip`);
        if (r.bestVolume && r.bestVolume > 0) subs.push(`vol ${r.bestVolume.toFixed(0)} kg`);
        return `
          <div class="pr-row">
            <span class="pr-ex-name">${exMap[d.id]}</span>
            <div class="pr-values">
              <span class="pr-main">${r.maxWeight > 0 ? r.maxWeight + ' kg' : r.maxReps + ' rip'}</span>
              <span class="pr-sub">${subs.join(' · ')}</span>
            </div>
          </div>`;
      }).join('');

    container.innerHTML = rows || '<p class="text-muted" style="font-size:13px;">Nessun record trovato</p>';
  } catch (e) {
    container.innerHTML = '<p class="text-muted" style="font-size:13px;">Errore caricamento record</p>';
    console.error(e);
  }
}

// ============================================================
//  RENDER TUTTO
// ============================================================
function renderAll() {
  const sessions = state.sessions;
  renderKPI(sessions);
  renderVolume(sessions);
  renderMuscles(sessions);
  renderRpe(sessions);
}

// ============================================================
//  KPI
// ============================================================
function setKPI(s, v, f, sets) {
  document.getElementById('kpi-sessions').textContent = s;
  document.getElementById('kpi-volume').textContent   = v;
  document.getElementById('kpi-freq').textContent     = f;
  document.getElementById('kpi-sets').textContent     = sets;
}

function renderKPI(sessions) {
  if (!sessions.length) { setKPI('0','0','0','0'); return; }

  const totalVol  = sessions.reduce((t, s) => t + calcVolume(s.exercises), 0);
  const totalSets = sessions.reduce((t, s) =>
    t + (s.exercises||[]).reduce((e, ex) => e + (ex.sets||[]).length, 0), 0);

  // Settimane nel periodo
  const firstDate = sessions[0].date?.toDate() || new Date();
  const lastDate  = sessions[sessions.length-1].date?.toDate() || new Date();
  const weeks     = Math.max(1, Math.ceil((lastDate - firstDate) / (7*24*3600*1000)));
  const freq      = (sessions.length / weeks).toFixed(1);

  const volFmt = totalVol >= 1000
    ? (totalVol / 1000).toFixed(1) + 'k'
    : totalVol.toFixed(0);

  setKPI(sessions.length, volFmt, freq, totalSets);
}

// ============================================================
//  GRAFICO VOLUME
// ============================================================
function renderVolume(sessions) {
  destroyChart('volume');
  const ctx = document.getElementById('chart-volume');

  if (!sessions.length) {
    ctx.getContext('2d').clearRect(0, 0, ctx.width, ctx.height);
    return;
  }

  const labels = sessions.map(s => s.date ? fmtDateShort(s.date) : '');
  const data   = sessions.map(s => +calcVolume(s.exercises).toFixed(0));

  state.charts.volume = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: C.primary + '99',
        borderColor:     C.primary,
        borderWidth:     1,
        borderRadius:    4
      }]
    },
    options: {
      ...baseChartOptions,
      plugins: {
        ...baseChartOptions.plugins,
        tooltip: {
          callbacks: {
            label: ctx => `${ctx.parsed.y} kg`
          }
        }
      }
    }
  });
}

// ============================================================
//  GRUPPI MUSCOLARI (barre orizzontali)
// ============================================================
function renderMuscles(sessions) {
  const container = document.getElementById('muscle-bars');
  const freq = {};

  sessions.forEach(s => {
    (s.exercises || []).forEach(ex => {
      const g = ex.muscleGroup || 'altro';
      freq[g] = (freq[g] || 0) + 1;
    });
  });

  if (!Object.keys(freq).length) {
    container.innerHTML = '<p class="text-muted" style="font-size:13px;">Nessun dato disponibile</p>';
    return;
  }

  const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]);
  const max    = sorted[0][1];

  container.innerHTML = sorted.map(([g, count]) => `
    <div class="muscle-bar-row">
      <span class="muscle-bar-label">${g}</span>
      <div class="muscle-bar-track">
        <div class="muscle-bar-fill" style="width:${(count/max*100).toFixed(0)}%"></div>
      </div>
      <span class="muscle-bar-count">${count}</span>
    </div>`).join('');
}

// ============================================================
//  GRAFICO RPE
// ============================================================
function renderRpe(sessions) {
  destroyChart('rpe');
  const ctx = document.getElementById('chart-rpe');

  const withRpe = sessions.filter(s => {
    const sets = (s.exercises||[]).flatMap(ex => ex.sets||[]);
    return sets.some(set => set.rpe);
  });

  if (!withRpe.length) {
    ctx.getContext('2d').clearRect(0, 0, ctx.width, ctx.height);
    return;
  }

  const labels = withRpe.map(s => s.date ? fmtDateShort(s.date) : '');
  const data   = withRpe.map(s => {
    const sets = (s.exercises||[]).flatMap(ex => ex.sets||[]).filter(set => set.rpe);
    const avg  = sets.reduce((t, set) => t + set.rpe, 0) / sets.length;
    return +avg.toFixed(1);
  });

  state.charts.rpe = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data,
        borderColor:     C.accent,
        backgroundColor: C.accent + '22',
        fill:            true,
        tension:         0.3,
        pointRadius:     3,
        pointBackgroundColor: C.accent
      }]
    },
    options: {
      ...baseChartOptions,
      scales: {
        ...baseChartOptions.scales,
        y: {
          ...baseChartOptions.scales.y,
          min: 1, max: 5,
          ticks: {
            color: C.muted,
            font:  { size: 11 },
            stepSize: 1,
            callback: v => ['','Facile','','Media','','Massima'][v] || v
          }
        }
      }
    }
  });
}

// ============================================================
//  PROGRESSIONE ESERCIZIO
// ============================================================
async function renderProgress(exerciseId) {
  destroyChart('progress');
  const ctx   = document.getElementById('chart-progress');
  const empty = document.getElementById('progress-empty');

  if (!exerciseId) {
    empty.classList.remove('hidden');
    ctx.getContext('2d').clearRect(0, 0, ctx.width, ctx.height);
    return;
  }

  // Cerca nelle sessioni già caricate (tutto il periodo)
  const points = [];
  try {
    const snap = await db.collection('sessions').orderBy('date','asc').get();
    snap.docs.forEach(d => {
      const s  = d.data();
      const ex = (s.exercises||[]).find(e => e.exerciseId === exerciseId);
      if (!ex || !s.date) return;
      const sets   = ex.sets || [];
      const maxW   = Math.max(0, ...sets.map(s => s.weight || 0));
      const maxRep = Math.max(0, ...sets.map(s => s.reps   || 0));
      points.push({ date: fmtDateShort(s.date), maxW, maxRep });
    });
  } catch (e) { console.error(e); return; }

  if (!points.length) {
    empty.textContent = 'Nessuna sessione trovata per questo esercizio';
    empty.classList.remove('hidden');
    return;
  }

  empty.classList.add('hidden');

  state.charts.progress = new Chart(ctx, {
    type: 'line',
    data: {
      labels: points.map(p => p.date),
      datasets: [
        {
          label:           'Peso max (kg)',
          data:            points.map(p => p.maxW),
          borderColor:     C.primary,
          backgroundColor: C.primary + '22',
          fill:            false,
          tension:         0.3,
          pointRadius:     4,
          pointBackgroundColor: C.primary,
          yAxisID:         'y'
        },
        {
          label:           'Rip max',
          data:            points.map(p => p.maxRep),
          borderColor:     C.success,
          backgroundColor: C.success + '22',
          fill:            false,
          tension:         0.3,
          pointRadius:     4,
          pointBackgroundColor: C.success,
          yAxisID:         'y2'
        }
      ]
    },
    options: {
      ...baseChartOptions,
      plugins: {
        legend: {
          display: true,
          labels:  { color: C.muted, font: { size: 11 }, boxWidth: 12 }
        }
      },
      scales: {
        x:  { ...baseChartOptions.scales.x },
        y:  { ...baseChartOptions.scales.y, position: 'left' },
        y2: {
          ...baseChartOptions.scales.y,
          position: 'right',
          grid:     { drawOnChartArea: false }
        }
      }
    }
  });
}

// ============================================================
//  EVENT LISTENERS
// ============================================================
document.querySelectorAll('.filter-pill').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-pill').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.periodDays = +btn.dataset.period;
    loadData();
  });
});

document.getElementById('progress-select').addEventListener('change', e => {
  renderProgress(e.target.value);
});

// ============================================================
//  INIT
// ============================================================
loadData();
loadPersonalRecords();
loadExercisesForSelect();
