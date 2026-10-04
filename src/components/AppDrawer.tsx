import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type GestureResponderHandlers,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { App } from '../store';
import { useStore } from '../store';
import { CATEGORIES } from '../theme';
import { AppIcon, type IconLook } from './AppIcon';
import { Glass, GlassButton } from './Glass';

type Props = {
  y: Animated.Value;
  open: boolean;
  focusSearch: boolean;
  look: IconLook;
  headerPanHandlers: GestureResponderHandlers;
  onLaunch: (app: App) => void;
  onLongPressApp: (app: App) => void;
  onOpenSettings: () => void;
};

const H_PADDING = 12;

function initials(label: string): string {
  return label
    .split(/[\s\-_.]+/)
    .map((w) => w.charAt(0))
    .join('')
    .toLowerCase();
}

export function AppDrawer({ y, open, focusSearch, look, headerPanHandlers, onLaunch, onLongPressApp, onOpenSettings }: Props) {
  const { apps, layout, settings, palette, appsLoading } = useStore();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const inputRef = useRef<TextInput>(null);
  // Build the (big) app grid shortly after startup instead of during the first frame.
  const [listReady, setListReady] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setListReady(true), 1200);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (open && focusSearch) {
      const t = setTimeout(() => inputRef.current?.focus(), 220);
      return () => clearTimeout(t);
    }
    if (!open) {
      inputRef.current?.blur();
      setQuery('');
      setCategory('all');
    }
  }, [open, focusSearch]);

  const visible = useMemo(() => {
    const hidden = new Set(layout.hidden);
    return apps.filter((a) => !hidden.has(a.key));
  }, [apps, layout.hidden]);

  const categories = useMemo(
    () => CATEGORIES.filter((c) => visible.some((a) => c.match(a.category))),
    [visible]
  );

  const q = query.trim().toLowerCase();
  const results = useMemo(() => {
    if (q) {
      const starts: App[] = [];
      const contains: App[] = [];
      for (const app of visible) {
        const l = app.label.toLowerCase();
        if (l.startsWith(q) || initials(app.label).startsWith(q)) starts.push(app);
        else if (l.includes(q) || app.packageName.toLowerCase().includes(q)) contains.push(app);
      }
      return [...starts, ...contains];
    }
    const cat = CATEGORIES.find((c) => c.key === category);
    return cat ? visible.filter((a) => cat.match(a.category)) : visible;
  }, [visible, q, category]);

  const frequent = useMemo(() => {
    if (!settings.showFrequent) return [];
    return visible
      .filter((a) => (layout.launches[a.key] ?? 0) > 0)
      .sort((a, b) => (layout.launches[b.key] ?? 0) - (layout.launches[a.key] ?? 0))
      .slice(0, settings.columns);
  }, [visible, layout.launches, settings.showFrequent, settings.columns]);

  const cellWidth = Math.floor((width - H_PADDING * 2) / settings.columns);
  const iconSize = Math.min(settings.iconSize, cellWidth - 14);

  const renderItem = useCallback(
    ({ item }: { item: App }) => (
      <AppIcon
        app={item}
        size={iconSize}
        width={cellWidth}
        look={look}
        showLabel={settings.showLabels}
        labelColor={palette.text}
        onPress={onLaunch}
        onLongPress={onLongPressApp}
      />
    ),
    [iconSize, cellWidth, look, settings.showLabels, palette.text, onLaunch, onLongPressApp]
  );

  const tint = palette.dark
    ? { liquid: 'rgba(10,10,16,0.80)', frosted: 'rgba(16,16,22,0.92)', clear: 'rgba(8,8,12,0.62)', solid: '#0E0E12' }
    : { liquid: 'rgba(246,246,250,0.84)', frosted: 'rgba(248,248,252,0.93)', clear: 'rgba(250,250,252,0.66)', solid: '#F4F4F8' };

  const showHeader = !q && category === 'all' && frequent.length > 0;

  return (
    <Animated.View
      pointerEvents={open ? 'auto' : 'none'}
      style={[StyleSheet.absoluteFill, { transform: [{ translateY: y }] }]}
    >
      <View style={[StyleSheet.absoluteFill, styles.sheet, { backgroundColor: tint[settings.glass] }]}>
        {settings.glass !== 'solid' && (
          <LinearGradient
            pointerEvents="none"
            colors={['rgba(255,255,255,0.16)', 'rgba(255,255,255,0.02)', 'rgba(255,255,255,0)']}
            locations={[0, 0.25, 1]}
            style={StyleSheet.absoluteFill}
          />
        )}
      </View>

      <View {...headerPanHandlers} style={{ paddingTop: insets.top + 6 }}>
        <View style={[styles.handle, { backgroundColor: palette.subtext }]} />
        <View style={styles.searchRow}>
          <Glass radius={24} style={styles.search}>
            <View style={styles.searchInner}>
              <Ionicons name="search" size={18} color={palette.subtext} />
              <TextInput
                ref={inputRef}
                value={query}
                onChangeText={setQuery}
                placeholder={`Search ${visible.length} apps`}
                placeholderTextColor={palette.subtext}
                style={[styles.input, { color: palette.text }]}
                returnKeyType="go"
                autoCorrect={false}
                autoCapitalize="none"
                onSubmitEditing={() => results[0] && onLaunch(results[0])}
              />
              {query.length > 0 && (
                <Pressable hitSlop={10} onPress={() => setQuery('')}>
                  <Ionicons name="close-circle" size={18} color={palette.subtext} />
                </Pressable>
              )}
            </View>
          </Glass>
          <GlassButton radius={24} style={styles.gear} onPress={onOpenSettings}>
            <View style={styles.gearInner}>
              <Ionicons name="settings-outline" size={20} color={palette.text} />
            </View>
          </GlassButton>
        </View>

        {settings.drawerCategories && !q && categories.length > 1 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chips}
            keyboardShouldPersistTaps="handled"
          >
            {[{ key: 'all', name: 'All' }, ...categories].map((c) => {
              const active = c.key === category;
              return (
                <Pressable
                  key={c.key}
                  onPress={() => setCategory(c.key)}
                  style={[styles.chip, { backgroundColor: active ? palette.accent : palette.chipBg }]}
                >
                  <Text style={[styles.chipText, { color: active ? '#fff' : palette.text }]}>{c.name}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}
      </View>

      <FlatList
        key={`grid-${settings.columns}`}
        data={listReady || open ? results : []}
        keyExtractor={(a) => a.key}
        renderItem={renderItem}
        numColumns={settings.columns}
        contentContainerStyle={{ paddingHorizontal: H_PADDING, paddingBottom: insets.bottom + 32 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        initialNumToRender={settings.columns * 6}
        maxToRenderPerBatch={settings.columns * 4}
        windowSize={9}
        removeClippedSubviews
        ListHeaderComponent={
          showHeader ? (
            <View>
              <Text style={[styles.section, { color: palette.subtext }]}>Frequently used</Text>
              <Glass radius={24} style={styles.frequent}>
                <View style={styles.frequentRow}>
                  {frequent.map((app) => (
                    <AppIcon
                      key={app.key}
                      app={app}
                      size={iconSize}
                      width={cellWidth - 2}
                      look={look}
                      showLabel={settings.showLabels}
                      labelColor={palette.text}
                      onPress={onLaunch}
                      onLongPress={onLongPressApp}
                    />
                  ))}
                </View>
              </Glass>
              <Text style={[styles.section, { color: palette.subtext }]}>All apps</Text>
            </View>
          ) : null
        }
        ListEmptyComponent={
          <Text style={[styles.empty, { color: palette.subtext }]}>
            {appsLoading ? 'Loading your apps…' : q ? `No apps match “${query.trim()}”` : 'No apps here'}
          </Text>
        }
        ListFooterComponent={
          q ? (
            <View style={styles.footer}>
              <WebAction
                icon="globe-outline"
                label={`Search the web for “${query.trim()}”`}
                onPress={() => Linking.openURL(`https://www.google.com/search?q=${encodeURIComponent(query.trim())}`)}
              />
              <WebAction
                icon="storefront-outline"
                label="Search Play Store"
                onPress={() =>
                  Linking.openURL(`market://search?q=${encodeURIComponent(query.trim())}`).catch(() =>
                    Linking.openURL(`https://play.google.com/store/search?q=${encodeURIComponent(query.trim())}&c=apps`)
                  )
                }
              />
            </View>
          ) : null
        }
      />
    </Animated.View>
  );
}

function WebAction({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  const { palette } = useStore();
  return (
    <GlassButton radius={18} onPress={onPress}>
      <View style={styles.webAction}>
        <Ionicons name={icon} size={18} color={palette.accent} />
        <Text numberOfLines={1} style={[styles.webText, { color: palette.text }]}>
          {label}
        </Text>
      </View>
    </GlassButton>
  );
}

const styles = StyleSheet.create({
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    opacity: 0.5,
    marginBottom: 10,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
  },
  search: {
    flex: 1,
  },
  searchInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    height: 48,
    gap: 10,
  },
  input: {
    flex: 1,
    fontSize: 16,
    padding: 0,
  },
  gear: {
    width: 48,
    height: 48,
  },
  gearInner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: 46,
  },
  chips: {
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
  },
  chipText: {
    fontSize: 13,
    fontFamily: 'sans-serif-medium',
  },
  section: {
    fontSize: 13,
    fontFamily: 'sans-serif-medium',
    marginTop: 14,
    marginBottom: 6,
    marginLeft: 8,
    letterSpacing: 0.3,
  },
  frequent: {
    paddingVertical: 2,
  },
  frequentRow: {
    flexDirection: 'row',
  },
  empty: {
    textAlign: 'center',
    marginTop: 48,
    fontSize: 15,
  },
  footer: {
    gap: 10,
    marginTop: 16,
    paddingHorizontal: 4,
  },
  webAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  webText: {
    flex: 1,
    fontSize: 15,
  },
});
