// ============================================================
//  STATS.JS — Statistiche e grafici
// ============================================================

// ---- Periodo selezionato ------------------------------------
// TODO: stato: activePeriod = '30d'  // '7d' | '30d' | '90d' | 'all'
// TODO: funzione setPeriod(period) → aggiorna stato e ricarica tutti i grafici

// ---- Caricamento dati da Firestore --------------------------
// TODO: funzione fetchSessionsInPeriod(period)
//   → query sessions/ con filtro su date >= startDate
//   → restituisce array di sessioni

// ---- Metriche globali ---------------------------------------
// TODO: funzione renderGlobalMetrics(sessions)
//   → calcola e mostra: sessioni totali, volume totale,
//     media sessioni/settimana, numero esercizi unici

// ---- Grafico: Volume nel tempo (volumeChart) ----------------
// TODO: funzione buildVolumeChart(sessions)
//   → dataset: { x: date, y: volumeTotale } per ogni sessione
//   → tipo Chart.js: 'bar' o 'line'

// ---- Grafico: Frequenza per gruppo muscolare (muscleChart) --
// TODO: funzione buildMuscleChart(sessions)
//   → conta quante sessioni per ogni muscleGroup
//   → tipo Chart.js: 'doughnut'
//   → colori distinti per ogni gruppo

// ---- Grafico: Progressione esercizio (progressChart) --------
// TODO: funzione buildProgressChart(exerciseId)
//   → filtra sessioni che contengono exerciseId
//   → dataset peso massimo per sessione + volume per sessione
//   → tipo Chart.js: 'line' con due assi Y

// ---- Select esercizio per progressione ----------------------
// TODO: funzione populateExerciseSelect()
//   → carica tutti gli esercizi dalla collezione exercises/
//   → popola il <select> nella sezione #chart-exercise-progress
// TODO: event listener su change → chiama buildProgressChart(id)

// ---- Grafico: RPE medio (rpeChart) --------------------------
// TODO: funzione buildRpeChart(sessions)
//   → calcola RPE medio per sessione
//   → tipo Chart.js: 'line' con area colorata per zona fatica

// ---- Personal Record ----------------------------------------
// TODO: funzione renderPersonalRecords()
//   → legge tutta la collezione records/
//   → per ogni record recupera il nome esercizio da exercises/
//   → genera tabella ordinabile

// ---- Utility grafici ----------------------------------------
// TODO: funzione destroyChart(chartInstance)
//   → distrugge l'istanza Chart.js prima di ricrearla
//   → evita il warning "Canvas already in use"

// TODO: palette colori coerente con il CSS (usa CSS vars o costanti JS)
