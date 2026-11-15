import * as SecureStore from "expo-secure-store";
import { createOfflineCache } from "./offline";
export const offlineCache = createOfflineCache({
  getItem: SecureStore.getItemAsync,
  setItem: SecureStore.setItemAsync,
  removeItem: SecureStore.deleteItemAsync,
});
