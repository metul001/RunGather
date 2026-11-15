import React, { useEffect, useState } from "react";
import {
  Text,
  View,
  Pressable,
  TextInput,
  ScrollView,
  Image,
  ActivityIndicator,
  Animated,
  AccessibilityInfo,
  StyleSheet,
  TextInputProps,
} from "react-native";
import { useTheme } from "../theme";
import { db } from "../supabase";
import { useI18n } from "../i18n";
export function Txt({
  children,
  muted = false,
  size = 15,
  bold = false,
  translate = false,
}: {
  children: React.ReactNode;
  muted?: boolean;
  size?: number;
  bold?: boolean;
  translate?: boolean;
}) {
  const { colors } = useTheme();
  const { t } = useI18n();
  return (
    <Text
      style={{
        color: muted ? colors.muted : colors.text,
        fontSize: size,
        fontWeight: bold ? "700" : "400",
        lineHeight: size * 1.45,
      }}
    >
      {translate && typeof children === "string" ? t(children) : children}
    </Text>
  );
}
export function Panel({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  const { t } = useI18n();
  return (
    <View
      style={{
        padding: 18,
        backgroundColor: colors.card,
        borderColor: colors.line,
        borderWidth: 1,
        borderRadius: 18,
        gap: 10,
        marginVertical: 7,
      }}
    >
      {children}
    </View>
  );
}
export function Button({
  title,
  onPress,
  secondary = false,
  disabled = false,
  busy = false,
}: {
  title: string;
  onPress: () => void;
  secondary?: boolean;
  disabled?: boolean;
  busy?: boolean;
}) {
  const { colors } = useTheme();
  const { t } = useI18n();
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || busy}
      accessibilityState={{ disabled: disabled || busy, busy }}
      onPress={onPress}
      style={{
        borderRadius: 12,
        padding: 13,
        minHeight: 46,
        alignItems: "center",
        backgroundColor: secondary ? colors.card : colors.lime,
        borderWidth: secondary ? 1 : 0,
        borderColor: colors.line,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <Text
        style={{
          color: secondary ? colors.text : "#173a2b",
          fontWeight: "700",
          textAlign: "center",
        }}
      >
        {t(busy ? "Working…" : title)}
      </Text>
      {busy && (
        <ActivityIndicator accessibilityLabel="Working" color={colors.accent} />
      )}
    </Pressable>
  );
}
export function Field({ label, ...props }: TextInputProps & { label: string }) {
  const { colors } = useTheme();
  const { t } = useI18n();
  return (
    <View style={{ gap: 5, marginVertical: 5 }}>
      <Txt size={13} bold translate>
        {label}
      </Txt>
      <TextInput
        accessibilityLabel={t(label)}
        placeholderTextColor={colors.muted}
        {...props}
        placeholder={props.placeholder ? t(props.placeholder) : undefined}
        style={[
          {
            backgroundColor: colors.card,
            color: colors.text,
            borderWidth: 1,
            borderColor: colors.line,
            borderRadius: 12,
            padding: 12,
            minHeight: 46,
            textAlignVertical: props.multiline ? "top" : "center",
          },
          props.style,
        ]}
      />
    </View>
  );
}
export function Chips<T extends string | number>({
  items,
  value,
  onChange,
}: {
  items: { id: T; name: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const { colors } = useTheme();
  const { t } = useI18n();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ flexGrow: 0, marginVertical: 7 }}
      contentContainerStyle={{ gap: 7 }}
    >
      {items.map((x) => (
        <Pressable
          key={String(x.id)}
          accessibilityRole="button"
          accessibilityState={{ selected: value === x.id }}
          onPress={() => onChange(x.id)}
          style={{
            borderRadius: 22,
            paddingVertical: 10,
            paddingHorizontal: 14,
            backgroundColor: value === x.id ? colors.lime : colors.card,
            borderWidth: 1,
            borderColor: colors.line,
          }}
        >
          <Text
            style={{
              color: value === x.id ? "#173a2b" : colors.text,
              fontSize: 12,
              fontWeight: "600",
            }}
          >
            {t(x.name)}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}
export function Empty({ text }: { text: string }) {
  return (
    <Panel>
      <Txt muted translate>
        {text}
      </Txt>
    </Panel>
  );
}
export function Loading() {
  const [motion, setMotion] = useState(false);
  const progress = React.useRef(new Animated.Value(0)).current;
  const { colors } = useTheme();
  const { t } = useI18n();
  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (live) setMotion(!reduced);
    });
    const listener = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      (reduced) => setMotion(!reduced),
    );
    return () => {
      live = false;
      listener.remove();
    };
  }, []);
  useEffect(() => {
    if (!motion) {
      progress.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(progress, {
          toValue: 1,
          duration: 950,
          useNativeDriver: true,
        }),
        Animated.timing(progress, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [motion, progress]);
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel="Loading, getting you to the starting line"
      style={{ padding: 20, alignItems: "center", gap: 8 }}
    >
      <View
        importantForAccessibility="no-hide-descendants"
        style={{ width: 150, borderBottomWidth: 2, borderColor: colors.line }}
      >
        <Animated.Text
          style={{
            fontSize: 30,
            transform: [
              {
                translateX: progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 110],
                }),
              },
            ],
          }}
        >
          🏃
        </Animated.Text>
      </View>
      <Txt muted translate>
        Getting you to the starting line…
      </Txt>
    </View>
  );
}
export function ErrorText({ text }: { text: string }) {
  const { colors } = useTheme();
  const { t } = useI18n();
  return text ? (
    <Text
      accessibilityRole="alert"
      style={{ color: colors.error, marginVertical: 8 }}
    >
      {text}
    </Text>
  ) : null;
}
const imageURLs = new Map<
  string,
  { expires: number; request: Promise<string | null> }
>();
function signedImage(path: string) {
  const hit = imageURLs.get(path);
  if (hit && hit.expires > Date.now()) return hit.request;
  if (imageURLs.size >= 200) imageURLs.delete(imageURLs.keys().next().value!);
  const request = db.storage
    .from("event-images")
    .createSignedUrl(path, 3600)
    .then(({ data, error }) => {
      if (error) {
        imageURLs.delete(path);
        return null;
      }
      return data?.signedUrl ?? null;
    })
    .catch(() => {
      imageURLs.delete(path);
      return null;
    });
  imageURLs.set(path, { expires: Date.now() + 50 * 60000, request });
  return request;
}
export function AssetImage({
  path,
  height = 165,
}: {
  path: string | null | undefined;
  height?: number;
}) {
  const [url, setURL] = useState<string | null>(null);
  const { colors } = useTheme();
  const { t } = useI18n();
  useEffect(() => {
    let live = true;
    setURL(null);
    if (path)
      signedImage(path).then((signed) => {
        if (live) setURL(signed);
      });
    return () => {
      live = false;
    };
  }, [path]);
  return url ? (
    <Image
      source={{ uri: url }}
      style={{ height, width: "100%", borderRadius: 16 }}
      resizeMode="cover"
    />
  ) : (
    <View
      style={{
        height,
        borderRadius: 16,
        backgroundColor: "#dce9cc",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ fontSize: 48, color: "#52764d" }}>↗</Text>
      <Text style={{ color: "#365339", fontSize: 13 }}>
        Find your next starting line
      </Text>
    </View>
  );
}
