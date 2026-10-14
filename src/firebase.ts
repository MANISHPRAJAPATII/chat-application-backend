import admin from "firebase-admin";
import dotenv from "dotenv";
dotenv.config()

admin.initializeApp({credential: admin.credential.applicaionDefault()})

export const firestore = admin.firestore()
export const FieldValue = admin.firestore.FieldValue;
export const Timestamp = admin.firestore.Timestamp;