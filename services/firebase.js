const { initializeApp } = require("firebase/app");
const { getAuth } = require("firebase/auth");

const firebaseConfig = {
    apiKey: "AIzaSyBfC_rgf2zBdUImT8lAdapuDCPPNGuTpQ0",
    authDomain: "contestapp1204.firebaseapp.com",
    projectId: "contestapp1204",
    storageBucket: "contestapp1204.firebasestorage.app",
    messagingSenderId: "207824794969",
    appId: "1:207824794969:web:5abab97755ffc985a58848",
    measurementId: "G-9DKWLM5SGP"
};

const firebaseApp = initializeApp(firebaseConfig);
const firebaseAuth = getAuth(firebaseApp);

module.exports = { firebaseApp, firebaseAuth };
