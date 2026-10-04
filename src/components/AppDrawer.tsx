import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  Image,
  Keyboard,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { App } from '../store';
import { useLook, useStore } from '../store';
import { CATEGORIES, type DrawerStyle } from '../theme';
import { AppIcon, type IconLook } from './AppIcon';
import { Glass, GlassButton } from './Glass';
import { PanelBackdrop } from './Wallpaper';

type Props = {
  y: Animated.Value;
  open: boolean;
  focusSearch: boolean;
  look: IconLook;
  onLaunch: (app: App) => void;
  onLongPressApp: (app: App) => void;
  onOpenSettings: () => void;
  /** Animate the drawer closed. */
  onRequestClose: () => void;
  /** Spring the drawer back to fully open after an abandoned drag. */
  onSettle: () => void;
};

const H_PADDING = 12;
const LIST_ROW = 62;
const AZ_WIDTH = 26;

function initials(label: string): string {
  return label
    .split(/[\s\-_.]+/)
    .map((w) => w.charAt(0))
    .join('')
    .toLowerCase();
}

function letterOf(label: string): string {
  const c = label.charAt(0).toUpperCase();
  return c >= 'A' && c <= 'Z' ? c : '#';
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export const AppDrawer = memo(function AppDrawer({
  y,
  open,
  focusSearch,
  look,
  onLaunch,
  onLongPressApp,
  onOpenSettings,
  onRequestClose,
  onSettle,
}: Props) {
  const { apps, layout, settings, palette, appsLoading } = useStore();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [page, setPage] = useState(0);
  const [pagerHeight, setPagerHeight] = useState(0);
  const [headerHeight, setHeaderHeight] = useState(0);
  const [azLetter, setAzLetter] = useState<string | null>(null);
  const inputRef = useRef<TextInput>(null);
  const listRef = useRef<FlatList<unknown>>(null);
  const scrollY = useRef(0);
  // Build the (big) app list shortly after startup instead of during the first frame.
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
      setPage(0);
      scrollY.current = 0;
      listRef.current?.scrollToOffset({ offset: 0, animated: false });
    }
  }, [open, focusSearch]);

  const visible = useMemo(() => {
    const hidden = new Set(layout.hidden);
    return apps.filter((a) => !hidden.has(a.key));
  }, [apps, layout.hidden]);

  const categories = useMemo(() => CATEGORIES.filter((c) => visible.some((a) => c.match(a.category))), [visible]);

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

  // Searching always shows a scrolling list; paging through search results would be awkward.
  const mode: DrawerStyle = q ? (settings.drawerStyle === 'list' ? 'list' : 'grid') : settings.drawerStyle;
  const showAz = settings.azScroller && !q && category === 'all' && mode !== 'pages' && results.length > 20;
  const gridWidth = width - H_PADDING * 2 - (showAz ? AZ_WIDTH : 0);
  const cellWidth = Math.floor(gridWidth / settings.columns);
  const iconSize = Math.min(settings.iconSize, cellWidth - 14);
  const rowHeight = iconSize + (settings.showLabels ? 44 : 22);
  const showFrequentRow = !q && category === 'all' && frequent.length > 0;

  // ---------- A–Z quick scroll ----------
  const letters = useMemo(() => {
    const seen: string[] = [];
    for (const app of results) {
      const l = letterOf(app.label);
      if (!seen.includes(l)) seen.push(l);
    }
    return seen.sort((a, b) => (a === '#' ? -1 : b === '#' ? 1 : a.localeCompare(b)));
  }, [results]);
  const azHeight = useRef(1);
  const lastLetter = useRef<string | null>(null);

  const jumpTo = (yPos: number) => {
    if (!letters.length) return;
    const idx = Math.min(letters.length - 1, Math.max(0, Math.floor((yPos / azHeight.current) * letters.length)));
    const letter = letters[idx];
    if (letter === lastLetter.current) return;
    lastLetter.current = letter;
    setAzLetter(letter);
    const first = results.findIndex((a) => letterOf(a.label) === letter);
    if (first >= 0) {
      const offset = headerHeight + (mode === 'list' ? first * LIST_ROW : Math.floor(first / settings.columns) * rowHeight);
      listRef.current?.scrollToOffset({ offset, animated: false });
      scrollY.current = offset;
    }
  };

  // Gesture objects stay stable; they call the latest closures through refs.
  const latest = useRef({ jumpTo, onRequestClose, onSettle });
  latest.current = { jumpTo, onRequestClose, onSettle };

  // ---------- Gestures: drag down from anywhere (once the list is at the top) to close ----------
  const dragging = useRef(false);
  const dragStart = useRef(0);
  const nativeList = useMemo(() => Gesture.Native(), []);
  const azGesture = useMemo(
    () =>
      Gesture.Pan()
        .minDistance(0)
        .runOnJS(true)
        .onBegin((e) => latest.current.jumpTo(e.y))
        .onUpdate((e) => latest.current.jumpTo(e.y))
        .onFinalize(() => {
          lastLetter.current = null;
          setAzLetter(null);
        }),
    []
  );
  const closeGesture = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .activeOffsetY(12)
        .failOffsetY(-12)
        .failOffsetX([-24, 24])
        .simultaneousWithExternalGesture(nativeList)
        .requireExternalGestureToFail(azGesture)
        .onUpdate((e) => {
          if (!dragging.current) {
            if (scrollY.current > 2) return; // the list is scrolled: let it scroll back up first
            dragging.current = true;
            dragStart.current = e.translationY;
            Keyboard.dismiss();
          }
          y.setValue(Math.max(0, e.translationY - dragStart.current));
        })
        .onEnd((e, success) => {
          if (!dragging.current) return;
          const dy = e.translationY - dragStart.current;
          if (success && (dy > 110 || e.velocityY > 900)) latest.current.onRequestClose();
          else latest.current.onSettle();
        })
        .onFinalize(() => {
          dragging.current = false;
        }),
    [nativeList, azGesture, y]
  );

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollY.current = e.nativeEvent.contentOffset.y;
  }, []);

  // ---------- Rendering ----------
  const renderIcon = useCallback(
    (app: App, w: number) => (
      <AppIcon
        key={app.key}
        app={app}
        size={iconSize}
        width={w}
        look={look}
        showLabel={settings.showLabels}
        labelColor={palette.text}
        onPress={onLaunch}
        onLongPress={onLongPressApp}
      />
    ),
    [iconSize, look, settings.showLabels, palette.text, onLaunch, onLongPressApp]
  );

  const renderRow = useCallback(
    ({ item }: { item: App[] }) => (
      <View style={[styles.row, { height: rowHeight }]}>{item.map((app) => renderIcon(app, cellWidth))}</View>
    ),
    [rowHeight, renderIcon, cellWidth]
  );

  const renderListItem = useCallback(
    ({ item }: { item: App }) => (
      <Pressable
        onPress={() => onLaunch(item)}
        onLongPress={() => onLongPressApp(item)}
        delayLongPress={350}
        style={({ pressed }) => [styles.listRow, pressed && { backgroundColor: palette.chipBg }]}
      >
        {item.icon ? <Image source={{ uri: item.icon }} style={styles.listIcon} fadeDuration={0} /> : null}
        <Text numberOfLines={1} style={[styles.listLabel, { color: palette.text }]}>
          {item.label}
        </Text>
      </Pressable>
    ),
    [onLaunch, onLongPressApp, palette.chipBg, palette.text]
  );

  const header = (
    <View onLayout={(e: LayoutChangeEvent) => setHeaderHeight(e.nativeEvent.layout.height)}>
      {showFrequentRow && mode !== 'pages' ? (
        <View>
          <Text style={[styles.section, { color: palette.subtext }]}>Frequently used</Text>
          <Glass radius={24} style={styles.frequent}>
            <View style={styles.frequentRow}>{frequent.map((app) => renderIcon(app, Math.floor(gridWidth / settings.columns) - 2))}</View>
          </Glass>
          <Text style={[styles.section, { color: palette.subtext }]}>All apps</Text>
        </View>
      ) : null}
    </View>
  );

  const empty = (
    <Text style={[styles.empty, { color: palette.subtext }]}>
      {appsLoading ? 'Loading your apps…' : q ? `No apps match “${query.trim()}”` : 'No apps here'}
    </Text>
  );

  const footer = q ? (
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
  ) : null;

  const data = listReady || open ? results : [];
  const rows = useMemo(() => chunk(data, settings.columns), [data, settings.columns]);
  const rowsPerPage = Math.max(1, Math.floor((pagerHeight - 8) / rowHeight));
  const pages = useMemo(() => chunk(data, settings.columns * rowsPerPage), [data, settings.columns, rowsPerPage]);

  const solidTint = palette.dark
    ? { liquid: 'rgba(10,10,16,0.80)', frosted: 'rgba(16,16,22,0.92)', clear: 'rgba(8,8,12,0.62)', solid: '#0E0E12' }
    : { liquid: 'rgba(246,246,250,0.84)', frosted: 'rgba(248,248,252,0.93)', clear: 'rgba(250,250,252,0.66)', solid: '#F4F4F8' };

  return (
    <Animated.View
      pointerEvents={open ? 'auto' : 'none'}
      style={[StyleSheet.absoluteFill, { transform: [{ translateY: y }] }]}
    >
      <GestureDetector gesture={closeGesture}>
        <View style={styles.fill}>
          <View style={[StyleSheet.absoluteFill, styles.sheet]}>
            <PanelBackdrop
              blurTint={palette.dark ? 'rgba(12,12,18,0.5)' : 'rgba(250,250,252,0.55)'}
              solidTint={solidTint[settings.glass]}
            />
            {settings.glass !== 'solid' && (
              <LinearGradient
                pointerEvents="none"
                colors={['rgba(255,255,255,0.16)', 'rgba(255,255,255,0.02)', 'rgba(255,255,255,0)']}
                locations={[0, 0.25, 1]}
                style={StyleSheet.absoluteFill}
              />
            )}
          </View>

          <View style={{ paddingTop: insets.top + 6 }}>
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
              <GlassButton radius={24} style={styles.gear} onPress={onOpenSettings} highlight={false}>
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
                      onPress={() => {
                        setCategory(c.key);
                        setPage(0);
                      }}
                      style={[styles.chip, { backgroundColor: active ? palette.accent : palette.chipBg }]}
                    >
                      <Text style={[styles.chipText, { color: active ? '#fff' : palette.text }]}>{c.name}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}
          </View>

          {mode === 'pages' ? (
            <View style={styles.fill}>
              {showFrequentRow ? (
                <Glass radius={24} style={styles.frequentPaged}>
                  <View style={styles.frequentRow}>{frequent.map((app) => renderIcon(app, Math.floor(gridWidth / settings.columns) - 2))}</View>
                </Glass>
              ) : null}
              <View style={styles.fill} onLayout={(e) => setPagerHeight(e.nativeEvent.layout.height)}>
                {pagerHeight > 0 && (
                  <GestureDetector gesture={nativeList}>
                    <FlatList
                      ref={listRef as never}
                      key={`pages-${settings.columns}-${rowsPerPage}`}
                      data={pages}
                      horizontal
                      pagingEnabled
                      showsHorizontalScrollIndicator={false}
                      keyExtractor={(_, i) => `p${i}`}
                      onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}
                      renderItem={({ item }) => (
                        <View style={{ width, height: pagerHeight, paddingHorizontal: H_PADDING }}>
                          {chunk(item, settings.columns).map((row, i) => (
                            <View key={i} style={[styles.row, { height: rowHeight }]}>
                              {row.map((app) => renderIcon(app, cellWidth))}
                            </View>
                          ))}
                        </View>
                      )}
                      ListEmptyComponent={<View style={{ width }}>{empty}</View>}
                      windowSize={3}
                      initialNumToRender={1}
                    />
                  </GestureDetector>
                )}
              </View>
              {pages.length > 1 && (
                <View style={[styles.dots, { paddingBottom: insets.bottom + 14 }]}>
                  {pages.map((_, i) => (
                    <View
                      key={i}
                      style={[styles.dot, { backgroundColor: palette.text, opacity: i === page ? 0.9 : 0.25 }, i === page && styles.dotActive]}
                    />
                  ))}
                </View>
              )}
            </View>
          ) : (
            <View style={styles.fill}>
              <GestureDetector gesture={nativeList}>
                {mode === 'list' ? (
                  <FlatList
                    ref={listRef as never}
                    key="list"
                    data={data}
                    keyExtractor={(a) => a.key}
                    renderItem={renderListItem}
                    contentContainerStyle={{ paddingLeft: H_PADDING, paddingRight: H_PADDING + (showAz ? AZ_WIDTH : 0), paddingBottom: insets.bottom + 32 }}
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode="on-drag"
                    onScroll={onScroll}
                    scrollEventThrottle={16}
                    initialNumToRender={14}
                    maxToRenderPerBatch={12}
                    windowSize={9}
                    removeClippedSubviews
                    ListHeaderComponent={header}
                    ListEmptyComponent={empty}
                    ListFooterComponent={footer}
                  />
                ) : (
                  <FlatList
                    ref={listRef as never}
                    key={`grid-${settings.columns}`}
                    data={rows}
                    keyExtractor={(row) => row[0]?.key ?? 'empty'}
                    renderItem={renderRow}
                    contentContainerStyle={{ paddingLeft: H_PADDING, paddingRight: H_PADDING + (showAz ? AZ_WIDTH : 0), paddingBottom: insets.bottom + 32 }}
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode="on-drag"
                    onScroll={onScroll}
                    scrollEventThrottle={16}
                    initialNumToRender={7}
                    maxToRenderPerBatch={5}
                    windowSize={9}
                    removeClippedSubviews
                    ListHeaderComponent={header}
                    ListEmptyComponent={empty}
                    ListFooterComponent={footer}
                  />
                )}
              </GestureDetector>

              {showAz && (
                <GestureDetector gesture={azGesture}>
                  <View
                    style={[styles.az, { bottom: insets.bottom + 24 }]}
                    onLayout={(e) => {
                      azHeight.current = Math.max(1, e.nativeEvent.layout.height);
                    }}
                  >
                    {letters.map((l) => (
                      <Text
                        key={l}
                        style={[styles.azLetter, { color: l === azLetter ? palette.accent : palette.subtext }]}
                      >
                        {l}
                      </Text>
                    ))}
                  </View>
                </GestureDetector>
              )}
              {azLetter ? (
                <View pointerEvents="none" style={styles.azBubbleWrap}>
                  <Glass radius={28} style={styles.azBubble} highlight={false}>
                    <Text style={[styles.azBubbleText, { color: palette.text }]}>{azLetter}</Text>
                  </Glass>
                </View>
              ) : null}
            </View>
          )}
        </View>
      </GestureDetector>
    </Animated.View>
  );
});

function WebAction({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  const { palette } = useLook();
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
  fill: {
    flex: 1,
  },
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
  frequentPaged: {
    marginHorizontal: H_PADDING,
    marginTop: 12,
    paddingVertical: 2,
  },
  frequentRow: {
    flexDirection: 'row',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  listRow: {
    height: LIST_ROW,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 8,
    borderRadius: 16,
  },
  listIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
  },
  listLabel: {
    flex: 1,
    fontSize: 16,
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
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    paddingTop: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  dotActive: {
    width: 16,
  },
  az: {
    position: 'absolute',
    right: 4,
    top: 8,
    width: AZ_WIDTH,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  azLetter: {
    fontSize: 11,
    fontFamily: 'sans-serif-medium',
  },
  azBubbleWrap: {
    position: 'absolute',
    top: '35%',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  azBubble: {
    width: 84,
    height: 84,
    alignItems: 'center',
    justifyContent: 'center',
  },
  azBubbleText: {
    fontSize: 40,
    fontFamily: 'sans-serif-medium',
  },
});
