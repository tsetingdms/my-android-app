import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import type { App } from '../store';
import { useStore } from '../store';
import { AppIcon, type IconLook } from './AppIcon';
import { Glass, GlassButton } from './Glass';

type AppHandlers = {
  look: IconLook;
  onPress: (app: App) => void;
  onLongPress: (app: App) => void;
};

export const DOCK_LIMIT = 5;

/** Pinned apps on the home screen, laid out in rows. */
export function HomeGrid({ look, onPress, onLongPress }: AppHandlers) {
  const { layout, appsByKey, settings, palette } = useStore();
  const { width } = useWindowDimensions();
  const apps = layout.home.map((k) => appsByKey.get(k)).filter((a): a is App => !!a);
  const cellWidth = Math.floor((width - 24) / settings.columns);
  const size = Math.min(settings.iconSize, cellWidth - 14);

  if (apps.length === 0) {
    return (
      <Glass radius={20} style={styles.hint}>
        <Text style={[styles.hintText, { color: palette.subtext }]}>
          Swipe up for all apps. Long-press any app to add it here or to the dock.
        </Text>
      </Glass>
    );
  }

  return (
    <View style={styles.grid}>
      {apps.map((app) => (
        <AppIcon
          key={app.key}
          app={app}
          size={size}
          width={cellWidth}
          look={look}
          showLabel={settings.showLabels}
          labelColor={palette.onWallpaper}
          labelShadow={palette.dark}
          onPress={onPress}
          onLongPress={onLongPress}
        />
      ))}
    </View>
  );
}

/** Glass dock with favourite apps (no labels). */
export function Dock({ look, onPress, onLongPress }: AppHandlers) {
  const { layout, appsByKey, settings, palette } = useStore();
  const { width } = useWindowDimensions();
  const apps = layout.dock
    .map((k) => appsByKey.get(k))
    .filter((a): a is App => !!a)
    .slice(0, DOCK_LIMIT);
  const slots = Math.max(4, apps.length);
  const cellWidth = Math.floor((width - 32 - 16) / slots);
  const size = Math.min(settings.iconSize, cellWidth - 10);

  return (
    <Glass radius={30} style={styles.dock}>
      {apps.length === 0 ? (
        <Text style={[styles.dockEmpty, { color: palette.subtext }]}>Long-press an app → Add to dock</Text>
      ) : (
        <View style={styles.dockRow}>
          {apps.map((app) => (
            <AppIcon
              key={app.key}
              app={app}
              size={size}
              width={cellWidth}
              look={look}
              showLabel={false}
              labelColor={palette.text}
              onPress={onPress}
              onLongPress={onLongPress}
            />
          ))}
        </View>
      )}
    </Glass>
  );
}

export function SearchPill({ onPress, onOpenDrawer }: { onPress: () => void; onOpenDrawer: () => void }) {
  const { palette } = useStore();
  return (
    <View style={styles.searchRow}>
      <GlassButton radius={24} style={styles.searchPill} onPress={onPress}>
        <View style={styles.searchInner}>
          <Ionicons name="search" size={18} color={palette.subtext} />
          <Text style={[styles.searchText, { color: palette.subtext }]}>Search apps</Text>
        </View>
      </GlassButton>
      <GlassButton radius={24} style={styles.appsButton} onPress={onOpenDrawer}>
        <View style={styles.appsInner}>
          <Ionicons name="apps" size={18} color={palette.text} />
        </View>
      </GlassButton>
    </View>
  );
}

export function PageDots({ page, count }: { page: number; count: number }) {
  const { palette } = useStore();
  return (
    <View style={styles.dots}>
      {Array.from({ length: count }, (_, i) => (
        <View
          key={i}
          style={[
            styles.dot,
            { backgroundColor: palette.onWallpaper, opacity: i === page ? 0.95 : 0.35 },
            i === page && styles.dotActive,
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 12,
  },
  hint: {
    marginHorizontal: 24,
    padding: 16,
  },
  hintText: {
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 20,
  },
  dock: {
    marginHorizontal: 16,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  dockRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  dockEmpty: {
    textAlign: 'center',
    paddingVertical: 26,
    fontSize: 14,
  },
  searchRow: {
    flexDirection: 'row',
    gap: 10,
    marginHorizontal: 16,
    marginBottom: 12,
  },
  searchPill: {
    flex: 1,
  },
  searchInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 18,
    height: 46,
  },
  searchText: {
    fontSize: 15,
  },
  appsButton: {
    width: 48,
  },
  appsInner: {
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 10,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  dotActive: {
    width: 16,
  },
});
