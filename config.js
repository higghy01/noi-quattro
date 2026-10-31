// Impostazioni di Firebase. Si compilano una volta sola, al PC, copiandole dalla console di Firebase
// (Impostazioni progetto > Le tue app > App web). Non sono segrete: la protezione vera sono le regole del database.
// Finché restano vuote, l'app parte in "modalità prova" con dati di esempio salvati solo sul telefono.
self.CONFIG = {
  firebase: {
    apiKey: "",
    authDomain: "",
    projectId: "",
    storageBucket: "",
    messagingSenderId: "",
    appId: ""
  },
  // Cloud Messaging > Certificati push web > coppia di chiavi (la parte pubblica).
  vapidKey: ""
};
