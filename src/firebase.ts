import {initializeApp, applicationDefault} from "firebase-admin/app";
import {getFirestore, FieldValue, Timestamp} from "firebase-admin/firestore";
import * as dotenv from "dotenv";
dotenv.config()
initializeApp({credential: applicationDefault()})

export const firestore = getFirestore();
export {FieldValue, Timestamp}



