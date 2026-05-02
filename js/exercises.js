// ============================================================
//  EXERCISES.JS — Libreria esercizi personalizzata
// ============================================================

// ---- Caricamento esercizi da Firestore ----------------------
// TODO: funzione loadExercises()
//   → legge tutta la collezione exercises/ ordinata per name ASC
//   → chiama renderExerciseGrid(exercises)

// ---- Filtri attivi ------------------------------------------
// TODO: stato: activeFilters = { type: null, muscleGroup: null, query: '' }
// TODO: funzione applyFilters() → filtra localmente l'array caricato
//   → chiama renderExerciseGrid con i risultati filtrati

// ---- Ricerca testuale ---------------------------------------
// TODO: event listener su input ricerca (debounce 300ms)
//   → aggiorna activeFilters.query e chiama applyFilters()

// ---- Rendering griglia esercizi -----------------------------
// TODO: funzione renderExerciseGrid(exercises)
//   → svuota #exercise-grid
//   → per ogni esercizio crea una card con createExerciseCard(ex)

// TODO: funzione createExerciseCard(exercise)
//   → restituisce <article> con nome, badge gruppo, tipo,
//     ultimo PR, note progressione, pulsanti modifica/elimina

// ---- Modal creazione / modifica -----------------------------
// TODO: funzione openModal(exerciseId = null)
//   → se exerciseId è null → form vuoto (creazione)
//   → altrimenti → pre-compila i campi con i dati esistenti
//   → apre <dialog id="exercise-modal">

// TODO: funzione closeModal() → chiude il dialog, resetta il form

// ---- Salvataggio esercizio ----------------------------------
// TODO: funzione saveExercise(formData)
//   → se nuovo → db.collection('exercises').add(formData)
//   → se modifica → db.collection('exercises').doc(id).update(formData)
//   → dopo il salvataggio chiude il modal e ricarica la lista

// ---- Eliminazione esercizio ---------------------------------
// TODO: funzione deleteExercise(exerciseId)
//   → chiede conferma con dialog nativo
//   → cancella exercises/{exerciseId}
//   → nota: NON cancella le sessioni che lo contengono (solo riferimento)

// ---- Gruppi muscolari disponibili ---------------------------
// Usati per popolare i select e i filtri chip
const MUSCLE_GROUPS = [
  'petto',
  'schiena',
  'spalle',
  'bicipiti',
  'tricipiti',
  'core',
  'gambe',
  'glutei',
  'full body'
];

// ---- Tipi di attrezzatura -----------------------------------
const EQUIPMENT_TYPES = [
  { value: 'bodyweight', label: 'Corpo libero' },
  { value: 'band',       label: 'Banda elastica' },
  { value: 'kettlebell', label: 'Kettlebell' }
];
