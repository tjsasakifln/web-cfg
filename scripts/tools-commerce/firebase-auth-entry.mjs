// The page owns initialization. This module has no side effects, so local
// emulator configuration cannot accidentally reach a production visitor.
export { getApps, initializeApp } from '@firebase/app';
export {
  browserLocalPersistence,
  browserPopupRedirectResolver,
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  FacebookAuthProvider,
  GithubAuthProvider,
  GoogleAuthProvider,
  getAuth,
  initializeAuth,
  onAuthStateChanged,
  OAuthProvider,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithPopup,
  signInWithEmailAndPassword,
  signOut,
  TwitterAuthProvider,
} from '@firebase/auth';
