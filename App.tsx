import * as Notifications from "expo-notifications";
import React, { useState, useEffect, useRef } from "react";
import {
  View,
  ScrollView,
  Pressable,
  Text,
  BackHandler,
  RefreshControl,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { DataProvider, useData } from "./src/context";
import { ThemeProvider, useTheme } from "./src/theme";
import { LanguageProvider, useI18n } from "./src/i18n";
import { appStartedAt, recordMetric } from "./src/performance";
import { configured } from "./src/supabase";
import { Txt, Button, ErrorText, Loading, Panel } from "./src/components/UI";
import { CatalogueDetails } from "./src/components/CatalogueDetails";
import { Explore } from "./src/screens/Explore";
import { CalendarScreen } from "./src/screens/Calendar";
import { ProfileScreen } from "./src/screens/Profile";
import {
  EventDetails,
  OrganizerDetails,
  ReviewEditor,
} from "./src/screens/Details";
import { OrganizerDashboard } from "./src/screens/Organizer";
import { AdminDashboard } from "./src/screens/Admin";
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});
type Page = {
  kind: "event" | "organizer" | "dashboard" | "admin" | "review";
  id?: string;
};
export default function App() {
  return (
    <SafeAreaProvider>
      <LanguageProvider>
        <ThemeProvider>
          <DataProvider>
            <Root />
          </DataProvider>
        </ThemeProvider>
      </LanguageProvider>
    </SafeAreaProvider>
  );
}
function Root() {
  const { colors, dark } = useTheme();
  const { t, language, setLanguage } = useI18n();
  const measuredReady = useRef(false);
  const { loading, error, refresh, recovery, session } = useData();
  const [tab, setTab] = useState("Home"),
    [stack, setStack] = useState<Page[]>([]);
  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const current = stack.at(-1);
  useEffect(() => {
    if (!loading && !measuredReady.current) {
      measuredReady.current = true;
      recordMetric("app.ready", Date.now() - appStartedAt);
    }
  }, [loading]);
  useEffect(() => {
    const subscription = Notifications.addNotificationReceivedListener(() => {
      refresh();
    });
    return () => subscription.remove();
  }, [refresh]);
  const open = (page: Page) => {
    setStack((s) => [...s, page]);
    scroll.current?.scrollTo({ y: 0, animated: false });
  };
  const back = () => setStack((s) => s.slice(0, -1));
  useEffect(() => {
    const listener = BackHandler.addEventListener("hardwareBackPress", () => {
      if (stack.length) {
        back();
        return true;
      }
      if (tab !== "Home") {
        setTab("Home");
        return true;
      }
      return false;
    });
    return () => listener.remove();
  }, [stack, tab]);
  useEffect(() => {
    if (recovery) {
      setTab("Profile");
      setStack([]);
    }
  }, [recovery]);
  useEffect(() => {
    setStack([]);
  }, [session?.user.id]);
  const openEvent = (id: string) => open({ kind: "event", id }),
    openOrganizer = (id: string) => open({ kind: "organizer", id });
  if (!configured)
    return (
      <SafeAreaView
        style={{
          flex: 1,
          backgroundColor: colors.bg,
          padding: 24,
          justifyContent: "center",
        }}
      >
        <Panel>
          <Txt bold size={28}>
            RunGather is ready to connect.
          </Txt>
          <Txt>
            Copy .env.example to .env and enter your Supabase project URL and
            public key. Apply the migrations using the README, then restart
            Expo.
          </Txt>
          <Txt muted>
            No fake events, login or ratings are shown while the backend is
            unconfigured.
          </Txt>
        </Panel>
      </SafeAreaView>
    );
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar barStyle={dark ? "light-content" : "dark-content"} />
      <View
        style={{
          paddingHorizontal: 20,
          paddingVertical: 13,
          borderBottomWidth: 1,
          borderColor: colors.line,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Txt bold size={23}>
          ↗ RunGather.
        </Txt>
        <Button
          secondary
          title={language === "en" ? "বাংলা" : "English"}
          onPress={() => setLanguage(language === "en" ? "bn" : "en")}
        />
      </View>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          ref={scroll}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            padding: 18,
            paddingBottom: 36,
            gap: 12,
            maxWidth: 800,
            width: "100%",
            alignSelf: "center",
          }}
          refreshControl={
            <RefreshControl refreshing={loading} onRefresh={refresh} />
          }
        >
          {!!current && <Button secondary title="‹ Back" onPress={back} />}
          <ErrorText text={error} />
          {!!error && (
            <Button secondary title="Retry loading" onPress={refresh} />
          )}{" "}
          {loading && !current && <Loading />}
          {current?.kind === "event" ? (
            <CatalogueDetails
              kind="event"
              openEvent={openEvent}
              key={current.id}
              id={current.id!}
              openOrganizer={openOrganizer}
            />
          ) : current?.kind === "organizer" ? (
            <CatalogueDetails
              kind="organizer"
              key={current.id}
              id={current.id!}
              openEvent={openEvent}
              openOrganizer={openOrganizer}
            />
          ) : current?.kind === "dashboard" ? (
            <OrganizerDashboard />
          ) : current?.kind === "admin" ? (
            <AdminDashboard />
          ) : current?.kind === "review" ? (
            <ReviewEditor
              key={current.id}
              eventId={current.id!}
              onDone={back}
            />
          ) : tab === "Calendar" ? (
            <CalendarScreen
              openEvent={openEvent}
              openOrganizer={openOrganizer}
            />
          ) : tab === "Profile" ? (
            <ProfileScreen
              openOrganizerDashboard={() => open({ kind: "dashboard" })}
              openAdmin={() => open({ kind: "admin" })}
              openEvent={openEvent}
              reviewEvent={(id) => open({ kind: "review", id })}
            />
          ) : (
            <Explore
              key={tab}
              discover={tab === "Discover"}
              savedOnly={tab === "Saved"}
              openEvent={openEvent}
              openOrganizer={openOrganizer}
            />
          )}
        </ScrollView>
      </KeyboardAvoidingView>
      <View
        style={{
          flexDirection: "row",
          borderTopWidth: 1,
          borderColor: colors.line,
          backgroundColor: colors.card,
          paddingVertical: 9,
        }}
      >
        {["Home", "Calendar", "Discover", "Saved", "Profile"].map((name, i) => (
          <Pressable
            key={name}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === name && !current }}
            onPress={() => {
              setTab(name);
              setStack([]);
              scroll.current?.scrollTo({ y: 0, animated: false });
            }}
            style={{
              flex: 1,
              alignItems: "center",
              paddingVertical: 7,
              gap: 3,
            }}
          >
            <Text
              style={{
                fontSize: 21,
                color: tab === name ? colors.accent : colors.muted,
              }}
            >
              {["⌂", "▦", "⌕", "♡", "○"][i]}
            </Text>
            <Txt size={10} bold={tab === name}>
              {t(name)}
            </Txt>
          </Pressable>
        ))}
      </View>
    </SafeAreaView>
  );
}
