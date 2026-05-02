// ============================================================
//  HISTORY.JS — Storico sessioni
// ============================================================

// ---- Caricamento sessioni da Firestore ----------------------
// TODO: funzione loadSessions(filters)
//   → query sulla collezione sessions/ ordinata per date DESC
//   → applica filtri attivi (periodo, gruppo muscolare)
//   → chiama renderSessionList(sessions)

// ---- Filtri -------------------------------------------------
// TODO: stato filtri attivi: { period: 'month', muscleGroup: null }
// TODO: funzione applyFilter(type, value) → aggiorna stato e ricarica

// ---- Rendering lista sessioni -------------------------------
// TODO: funzione renderSessionList(sessions)
//   → svuota il contenitore #session-list
//   → per ogni sessione crea una card con createSessionCard(session)
//   → appende le card al DOM

// TODO: funzione createSessionCard(session)
//   → restituisce un elemento <article> con:
//     - data formattata (es. "Lunedì 28 apr · 07:15")
//     - durata in formato leggibile (es. "42 min")
//     - lista esercizi collassabile
//     - volume totale calcolato
//     - pulsante elimina

// ---- Calcolo volume sessione --------------------------------
// TODO: funzione calcSessionVolume(exercises)
//   → somma reps × peso per tutte le serie di tutti gli esercizi

// ---- Calendario / heatmap -----------------------------------
// TODO: funzione renderCalendar(sessions)
//   → genera griglia del mese corrente
//   → marca i giorni che hanno almeno una sessione
//   → intensità colore proporzionale al volume giornaliero

// ---- Eliminazione sessione ----------------------------------
// TODO: funzione deleteSession(sessionId)
//   → chiede conferma con dialog nativo
//   → cancella documento in Firestore sessions/{sessionId}
//   → rimuove la card dal DOM

// ---- Paginazione / infinite scroll --------------------------
// TODO: lastVisibleDoc = null  (cursore Firestore per paginazione)
// TODO: funzione loadMoreSessions() → carica i prossimi N documenti
// TODO: IntersectionObserver su un sentinel element in fondo alla lista
