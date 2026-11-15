import { Alert, Linking, Platform } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";
import { offlineCache } from "./offlineStore";
import { db, rpc } from "./supabase";
import { httpsUrl } from "./domain";
export function message(error: unknown) {
  return error instanceof Error
    ? error.message
    : typeof error === "object" && error && "message" in error
      ? String(error.message)
      : "Something went wrong. Please retry.";
}
export async function openURL(url: string) {
  await Linking.openURL(httpsUrl(url));
}
export async function uploadImage(): Promise<string | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted)
    throw Error("Photo-library access is required to choose an image.");
  const picked = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    quality: 0.8,
    allowsEditing: true,
  });
  if (picked.canceled) return null;
  const processed = await ImageManipulator.manipulateAsync(
    picked.assets[0].uri,
    [{ resize: { width: 1400 } }],
    { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG },
  );
  const bytes = await (await fetch(processed.uri)).arrayBuffer();
  if (bytes.byteLength > 5 * 1024 * 1024)
    throw Error("Choose a smaller image (maximum 5 MB).");
  const { data, error } = await db.functions.invoke("upload-image", {
    body: bytes,
    headers: { "Content-Type": "image/jpeg" },
  });
  if (error || !data?.path)
    throw Error(
      "Upload failed. Check that the upload-image backend is deployed and your organizer profile is active.",
    );
  return data.path;
}
export async function enablePush(userId: string) {
  const projectId =
    process.env.EXPO_PUBLIC_EAS_PROJECT_ID ||
    Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId)
    throw Error(
      "Push requires an Expo project ID and platform credentials. See the setup guide.",
    );
  if (Platform.OS === "android")
    await Notifications.setNotificationChannelAsync("default", {
      name: "Event updates",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  const permission = await Notifications.requestPermissionsAsync();
  if (permission.status !== "granted")
    throw Error("Notification permission was not granted.");
  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  await rpc("register_push", { device_token: token });
  await SecureStore.setItemAsync("rungather-push-token", token);
  return token;
}
export function confirm(
  title: string,
  body: string,
  action: () => Promise<void>,
) {
  Alert.alert(title, body, [
    { text: "Cancel", style: "cancel" },
    {
      text: "Confirm",
      onPress: () =>
        action().catch((e) => Alert.alert("Unable to complete", message(e))),
    },
  ]);
}

export async function signOutDevice() {
  const {
    data: { session },
  } = await db.auth.getSession();
  if (session) await offlineCache.clear(session.user.id);
  const token = await SecureStore.getItemAsync("rungather-push-token");
  if (token) {
    const { error } = await db.from("push_tokens").delete().eq("token", token);
    if (error)
      throw Error(
        "Could not unregister notifications. Reconnect and retry signing out.",
      );
    await SecureStore.deleteItemAsync("rungather-push-token");
  }
  const { error } = await db.auth.signOut();
  if (error) throw error;
}
