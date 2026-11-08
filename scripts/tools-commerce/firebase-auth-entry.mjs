// The page owns initialization. This module has no side effects, so local
// emulator configuration cannot accidentally reach a production visitor.
export { getApps, initializeApp } from 'firebase/app';
export {
  browserLocalPersistence,
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  getAuth,
  initializeAuth,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
