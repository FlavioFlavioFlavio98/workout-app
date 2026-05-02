// Firebase SDK caricato via CDN nei file HTML
const firebaseConfig = {
  apiKey:            "AIzaSyCITvxhzetJo1bRQdVB9afRpx9zhl4ra3U",
  authDomain:        "workout-app-422f5.firebaseapp.com",
  projectId:         "workout-app-422f5",
  storageBucket:     "workout-app-422f5.firebasestorage.app",
  messagingSenderId: "779148463947",
  appId:             "1:779148463947:web:9aa2eb572936cc467ce2ce"
};

firebase.initializeApp(firebaseConfig);
const db      = firebase.firestore();
const storage = firebase.storage();
