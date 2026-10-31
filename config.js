// Impostazioni di Firebase. Si compilano una volta sola, al PC, copiandole dalla console di Firebase
// (Impostazioni progetto > Le tue app > App web). Non sono segrete: la protezione vera sono le regole del database.
// Finché restano vuote, l'app parte in "modalità prova" con dati di esempio salvati solo sul telefono.
self.CONFIG = {
  firebase: {
    apiKey: "AIzaSyCae7HbP7hDjahAV9KthM5xfd73cxVh2gw",
    authDomain: "noi-quattro.firebaseapp.com",
    projectId: "noi-quattro",
    storageBucket: "noi-quattro.firebasestorage.app",
    messagingSenderId: "501473696556",
    appId: "1:501473696556:web:527d55262a09fb2e49aa89"
  },
  // Cloud Messaging > Certificati push web > coppia di chiavi (la parte pubblica).
  vapidKey: ""
};
