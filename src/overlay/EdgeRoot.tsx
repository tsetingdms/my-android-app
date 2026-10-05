import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, BackHandler, Easing, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import * as Launcher from '../../modules/launcher';
import { EdgePanel } from '../components/EdgePanel';
import type { App } from '../store';
import { SharedStoreProvider, useActions, useLook } from '../store';

/**
 * Root of the "edge" surface hosted by EdgeActivity: the edge panel on top of another app, opened
 * from the floating edge bar. It uses the home screen's live store (same JS runtime).
 */
export function EdgeRoot() {
  return (
    <SafeAreaProvider style={styles.transparent}>
      <SharedStoreProvider>
        <OverlayPanel />
      </SharedStoreProvider>
    </SafeAreaProvider>
  );
}

const noop = () => {};

function OverlayPanel() {
  const { ready } = useLook();
  const { launch } = useActions();
  const progress = useRef(new Animated.Value(0)).current;
  const [animating, setAnimating] = useState(true);
  const closing = useRef(false);

  const settle = useCallback(() => {
    setAnimating(true);
    Animated.spring(progress, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 3 }).start(() =>
      setAnimating(false)
    );
  }, [progress]);

  const close = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    setAnimating(true);
    Animated.timing(progress, {
      toValue: 0,
      duration: 200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(() => Launcher.closeEdgeOverlay());
  }, [progress]);

  // Slide in as soon as the store is there.
  useEffect(() => {
    if (ready) settle();
  }, [ready, settle]);

  // Back closes the panel (registered after the home screen's handler, so it runs first).
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      close();
      return true;
    });
    return () => sub.remove();
  }, [close]);

  const dragStart = useCallback(() => setAnimating(true), []);
  // The opened app covers this screen, which then finishes by itself.
  const onLaunch = useCallback((app: App) => launch(app), [launch]);
  // "Controls" over an app: the phone's own quick settings.
  const openControls = useCallback(() => {
    Launcher.expandNotifications();
    close();
  }, [close]);
  // "More": back to the home screen with the app drawer open.
  const openDrawer = useCallback(() => {
    Launcher.openHome('drawer');
  }, []);

  if (!ready) return null;
  return (
    <>
      <StatusBar style="light" />
      <EdgePanel
        progress={progress}
        open
        animating={animating}
        onDragStart={dragStart}
        onClose={close}
        onSettle={settle}
        onLaunch={onLaunch}
        onLongPressApp={noop}
        onOpenControls={openControls}
        onOpenDrawer={openDrawer}
      />
    </>
  );
}

const styles = StyleSheet.create({
  transparent: {
    flex: 1,
    backgroundColor: 'transparent',
  },
});
