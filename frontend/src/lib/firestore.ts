import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "./firebase";
import type { DatasetProfile, PipelinePlan, SavedPipeline } from "../types";

const pipelinesCol = (uid: string) =>
  collection(db, "users", uid, "pipelines");

export async function savePipeline(
  uid: string,
  name: string,
  plan: PipelinePlan,
  profile?: DatasetProfile | null,
): Promise<string> {
  const ref = await addDoc(pipelinesCol(uid), {
    name,
    plan,
    profile: profile ?? null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function getUserPipelines(uid: string): Promise<SavedPipeline[]> {
  const q = query(pipelinesCol(uid), orderBy("updatedAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as SavedPipeline);
}

export async function updatePipelineDoc(
  uid: string,
  pipelineId: string,
  plan: PipelinePlan,
  name?: string,
): Promise<void> {
  await updateDoc(doc(db, "users", uid, "pipelines", pipelineId), {
    ...(name ? { name } : {}),
    plan,
    updatedAt: serverTimestamp(),
  });
}

export async function deletePipeline(
  uid: string,
  pipelineId: string,
): Promise<void> {
  await deleteDoc(doc(db, "users", uid, "pipelines", pipelineId));
}
