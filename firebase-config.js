// Firebase SDKs
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// TODO: Firebaseコンソールでプロジェクトを作成し、Webアプリを追加して、
// 以下に表示される firebaseConfig の内容を貼り付けてください。
const firebaseConfig = {
  apiKey: "AIzaSyAM6t7m-dWzbhVVCkJGXcIDoDhAdrafIzM",
  authDomain: "test01-33976.firebaseapp.com",
  projectId: "test01-33976",
  storageBucket: "test01-33976.firebasestorage.app",
  messagingSenderId: "917388668281",
  appId: "1:917388668281:web:a6ae34b6d699fb8d2e13a8",
  measurementId: "G-KJ3XG4Y8LG"
};

let app, auth, db;

// apiKeyが存在する場合のみFirebaseを初期化する
if (firebaseConfig.apiKey) {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    console.log("Firebase initialized successfully.");
} else {
    console.warn("Firebase config is missing. Running in MOCK mode (localStorage).");
}

export { auth, db };
