import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  AppState,
  Image,
  Modal,
  PixelRatio,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import * as Launcher from '../../modules/launcher';
import { formatTime, useMinuteClock } from '../hooks';
import type { App } from '../store';
import { useStore } from '../store';
import {
  ACCENTS,
  CLOCK_COLORS,
  CLOCK_FACES,
  GRADIENTS,
  SHAPES,
  shapeStyle,
  THEMES,
  WALLPAPER_IMAGES,
  wallpaperImage,
  type ClockFace as Face,
  type DrawerStyle,
  type EdgeHandle,
  type GlassStyle,
  type Settings,
  type SwipeDownAction,
  type ThemeMode,
  type ThemePreset,
} from '../theme';
import { ClockFace, resolveClockColor } from './ClockFace';
import { Glass, GlassButton } from './Glass';

type Props = { visible: boolean; onClose: () => void };

export function SettingsSheet({ visible, onClose }: Props) {
  const { settings, updateSettings, resetSettings, palette, layout, updateLayout, appsByKey, refreshApps } = useStore();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const now = useMinuteClock();
  const [isDefault, setIsDefault] = useState(true);
  const [clockTarget, setClockTarget] = useState<'home' | 'lock'>('home');
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [lockStatus, setLockStatus] = useState<Launcher.LockScreenStatus | null>(null);
  const refreshLock = useCallback(() => setLockStatus(Launcher.getLockScreenStatus()), []);

  // Lock-screen diagnostics: refresh while Customize is open (e.g. after turning the screen off and on).
  useEffect(() => {
    if (!visible || !settings.lockEnabled) return;
    refreshLock();
    const id = setInterval(refreshLock, 3000);
    return () => clearInterval(id);
  }, [visible, settings.lockEnabled, refreshLock]);

  useEffect(() => {
    if (!visible) return;
    setIsDefault(Launcher.isDefaultLauncher());
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') setIsDefault(Launcher.isDefaultLauncher());
    });
    return () => sub.remove();
  }, [visible]);

  const set = <K extends keyof Settings>(key: K) => (value: Settings[K]) => updateSettings({ [key]: value } as Partial<Settings>);
  const setWallpaper = (wallpaper: string) => updateSettings({ wallpaper, themeId: null });
  const hiddenApps = layout.hidden.map((k) => appsByKey.get(k)).filter((a): a is App => !!a);
  const previewApps = [...layout.home, ...layout.dock].map((k) => appsByKey.get(k)).filter((a): a is App => !!a);
  const contentWidth = width - 32 - 32;
  const pictureWallpaper = wallpaperImage(settings) != null;

  const pickPhoto = async () => {
    setPhotoError(null);
    try {
      const uri = await Launcher.pickWallpaperPhoto(Math.round(PixelRatio.getPixelSizeForLayoutSize(width)));
      if (uri) updateSettings({ wallpaper: 'photo', photoUri: uri, themeId: null });
    } catch (e) {
      setPhotoError(e instanceof Error ? e.message : "Couldn't open your photos");
    }
  };

  const faceKey = clockTarget === 'home' ? settings.clockStyle : settings.lockFace;
  const colorKey = clockTarget === 'home' ? settings.clockColor : settings.lockColor;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={[styles.sheet, { backgroundColor: palette.sheetBg, paddingTop: insets.top + 8 }]}>
        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: palette.text }]}>Customize</Text>
          <Pressable hitSlop={12} onPress={onClose} style={[styles.close, { backgroundColor: palette.chipBg }]}>
            <Ionicons name="close" size={20} color={palette.text} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40, gap: 14 }}>
          {!isDefault && Launcher.isAvailable && (
            <GlassButton radius={22} onPress={Launcher.requestHomeRole}>
              <LinearGradient
                colors={[palette.accent, '#BF5AF2']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.banner}
              >
                <Ionicons name="home-outline" size={22} color="#fff" />
                <View style={styles.flex}>
                  <Text style={styles.bannerTitle}>Make Lumo your home screen</Text>
                  <Text style={styles.bannerText}>Tap, then choose Lumo Launcher as the default home app.</Text>
                </View>
              </LinearGradient>
            </GlassButton>
          )}

          <Section title="Themes" icon="color-palette-outline">
            <Text style={[styles.hint, { marginBottom: 10, color: palette.subtext }]}>
              One tap sets the wallpaper, colors, glass, icons and clocks.
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.themes}>
              {THEMES.map((t) => (
                <ThemeCard
                  key={t.id}
                  preset={t}
                  apps={previewApps}
                  now={now}
                  selected={settings.themeId === t.id}
                  onPress={() => updateSettings({ ...t.patch, themeId: t.id })}
                />
              ))}
            </ScrollView>
          </Section>

          <Section title="Look & feel" icon="sparkles-outline">
            <Label text="Theme" />
            <Choice<ThemeMode>
              value={settings.theme}
              onChange={set('theme')}
              options={[
                { value: 'auto', label: 'Auto' },
                { value: 'dark', label: 'Dark' },
                { value: 'light', label: 'Light' },
              ]}
            />
            <Label text="Glass style" />
            <Choice<GlassStyle>
              value={settings.glass}
              onChange={set('glass')}
              options={[
                { value: 'liquid', label: 'Liquid' },
                { value: 'frosted', label: 'Frosted' },
                { value: 'clear', label: 'Clear' },
                { value: 'solid', label: 'Solid' },
              ]}
            />
            <Label text="Accent color" />
            <View style={styles.swatches}>
              <Pressable
                onPress={() => updateSettings({ accent: 'wallpaper' })}
                style={[styles.swatch, styles.center, { borderColor: settings.accent === 'wallpaper' ? palette.text : 'transparent' }]}
              >
                <Ionicons name="image-outline" size={16} color={palette.text} />
              </Pressable>
              {ACCENTS.map((c) => (
                <Pressable
                  key={c}
                  onPress={() => updateSettings({ accent: c })}
                  style={[styles.swatch, { borderColor: settings.accent === c ? palette.text : 'transparent' }]}
                >
                  <View style={[styles.swatchFill, { backgroundColor: c }]} />
                </Pressable>
              ))}
            </View>
          </Section>

          <Section title="Wallpaper" icon="image-outline">
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.walls}>
              <WallTile selected={settings.wallpaper === 'system'} name="Phone" onPress={() => setWallpaper('system')}>
                <View style={[styles.wallFill, styles.center, { backgroundColor: palette.chipBg }]}>
                  <Ionicons name="phone-portrait-outline" size={22} color={palette.text} />
                </View>
              </WallTile>
              <WallTile selected={settings.wallpaper === 'photo'} name="My photo" onPress={pickPhoto}>
                {settings.photoUri ? (
                  <Image source={{ uri: settings.photoUri }} style={styles.wallFill} resizeMode="cover" resizeMethod="resize" />
                ) : (
                  <View style={[styles.wallFill, styles.center, { backgroundColor: palette.chipBg }]}>
                    <Ionicons name="images-outline" size={22} color={palette.text} />
                  </View>
                )}
              </WallTile>
              {Object.entries(WALLPAPER_IMAGES).map(([key, w]) => (
                <WallTile key={key} selected={settings.wallpaper === `img:${key}`} name={w.name} onPress={() => setWallpaper(`img:${key}`)}>
                  <Image source={w.source} style={styles.wallFill} resizeMode="cover" resizeMethod="resize" />
                </WallTile>
              ))}
              {Object.entries(GRADIENTS).map(([key, g]) => (
                <WallTile key={key} selected={settings.wallpaper === key} name={g.name} onPress={() => setWallpaper(key)}>
                  <LinearGradient colors={g.colors} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} style={styles.wallFill} />
                </WallTile>
              ))}
            </ScrollView>
            {photoError ? <Text style={[styles.hint, { color: '#FF453A' }]}>{photoError}</Text> : null}
            {settings.wallpaper === 'photo' && (
              <Row label="Choose another photo" onPress={pickPhoto} chevron />
            )}
            {settings.wallpaper === 'system' && (
              <Row label="Change phone wallpaper" onPress={Launcher.openWallpaperPicker} chevron />
            )}
            {pictureWallpaper && (
              <>
                <Label text="Blur wallpaper" />
                <Choice<number>
                  value={settings.wallpaperBlur}
                  onChange={set('wallpaperBlur')}
                  options={[
                    { value: 0, label: 'Off' },
                    { value: 6, label: 'Soft' },
                    { value: 14, label: 'Strong' },
                  ]}
                />
              </>
            )}
            <Toggle
              label="Frosted glass"
              hint={
                pictureWallpaper
                  ? 'Blurs the wallpaper behind the drawer, panels, dock and cards'
                  : 'Works with picture wallpapers (themes or your photo)'
              }
              value={settings.panelBlur}
              onChange={set('panelBlur')}
            />
            <Label text="Dim wallpaper" />
            <Choice<number>
              value={settings.dim}
              onChange={set('dim')}
              options={[
                { value: 0, label: 'Off' },
                { value: 0.15, label: 'Low' },
                { value: 0.3, label: 'Medium' },
                { value: 0.45, label: 'High' },
              ]}
            />
          </Section>

          <Section title="Clock" icon="time-outline">
            <Choice<'home' | 'lock'>
              value={clockTarget}
              onChange={setClockTarget}
              options={[
                { value: 'home', label: 'Home screen' },
                { value: 'lock', label: 'Lock screen' },
              ]}
            />
            <View style={styles.faces}>
              {CLOCK_FACES.filter((f) => clockTarget === 'home' || f.key !== 'minimal').map((f) => (
                <ClockTile
                  key={f.key}
                  face={f.key}
                  name={f.name}
                  width={(contentWidth - 10) / 2}
                  now={now}
                  color={colorKey}
                  selected={faceKey === f.key}
                  onPress={() => updateSettings(clockTarget === 'home' ? { clockStyle: f.key } : { lockFace: f.key })}
                />
              ))}
            </View>
            <Label text="Clock color" />
            <View style={styles.swatches}>
              {CLOCK_COLORS.map((c) => {
                const selected = colorKey === c;
                const update = () => updateSettings(clockTarget === 'home' ? { clockColor: c } : { lockColor: c });
                return (
                  <Pressable key={c} onPress={update} style={[styles.swatch, styles.center, { borderColor: selected ? palette.text : 'transparent' }]}>
                    {c === 'auto' ? (
                      <Text style={[styles.swatchText, { color: palette.text }]}>A</Text>
                    ) : (
                      <View style={[styles.swatchFill, styles.swatchBorder, { backgroundColor: c === 'accent' ? palette.accent : c }]} />
                    )}
                  </Pressable>
                );
              })}
            </View>
            <Toggle label="24-hour time" value={settings.clock24h} onChange={set('clock24h')} />
            {clockTarget === 'home' && <Toggle label="Show clock on home" value={settings.showClock} onChange={set('showClock')} />}
          </Section>

          <Section title="Lock screen" icon="lock-closed-outline">
            <Toggle
              label="Lumo lock screen"
              hint="Your clock style over the phone's lock. Swipe up to unlock — your PIN or fingerprint still protects the phone."
              value={settings.lockEnabled}
              onChange={(on) => {
                updateSettings({ lockEnabled: on });
                if (on) Launcher.requestNotificationPermission();
              }}
            />
            {settings.lockEnabled && (
              <>
                {!isDefault && (
                  <Text style={[styles.hint, { color: '#FF9F0A' }]}>Needs Lumo as your default home app to appear.</Text>
                )}
                <LockStatusLine status={lockStatus} use24h={settings.clock24h} />
                <Row label="Test lock screen now" onPress={() => Launcher.testLockScreen()} chevron />
                {lockStatus && !lockStatus.canDrawOverlays && (
                  <Row
                    label="Allow “Display over other apps”"
                    detail="More reliable"
                    onPress={() => Launcher.openOverlaySettings()}
                    chevron
                  />
                )}
                {lockStatus && !lockStatus.notificationsEnabled && (
                  <Text style={[styles.hint, { color: '#FF9F0A' }]}>
                    Lumo notifications are off. Turn them on in Android Settings → Apps → Lumo Launcher → Notifications
                    (used only to open the lock screen).
                  </Text>
                )}
              </>
            )}
            <Toggle label="Torch & camera buttons" value={settings.lockShortcuts} onChange={set('lockShortcuts')} />
            <Row label="Lock screen clock style" detail={CLOCK_FACES.find((f) => f.key === settings.lockFace)?.name} onPress={() => setClockTarget('lock')} chevron />
          </Section>

          <Section title="Gestures & panels" icon="hand-left-outline">
            <Label text="Swipe down on home" />
            <Choice<SwipeDownAction>
              value={settings.swipeDown}
              onChange={set('swipeDown')}
              options={[
                { value: 'controls', label: 'Controls' },
                { value: 'split', label: 'Split' },
                { value: 'notifications', label: 'Alerts' },
              ]}
            />
            <Text style={[styles.hint, { color: palette.subtext }]}>
              {settings.swipeDown === 'split'
                ? 'Left half opens notifications, right half opens the control panel.'
                : settings.swipeDown === 'controls'
                  ? 'Opens the Lumo control panel (it has a Notifications button too).'
                  : 'Opens the phone’s notification shade.'}
            </Text>
            <Toggle label="Edge panel" hint="Swipe the little bar on the right edge" value={settings.edgePanel} onChange={set('edgePanel')} />
            {settings.edgePanel && (
              <>
                <Label text="Edge bar position" />
                <Choice<EdgeHandle>
                  value={settings.edgeHandle}
                  onChange={set('edgeHandle')}
                  options={[
                    { value: 'upper', label: 'Upper' },
                    { value: 'middle', label: 'Middle' },
                    { value: 'lower', label: 'Lower' },
                  ]}
                />
              </>
            )}
          </Section>

          <Section title="Icons" icon="shapes-outline">
            <Label text="Shape" />
            <View style={styles.choiceRow}>
              {SHAPES.map((s) => {
                const active = settings.iconShape === s.key;
                return (
                  <Pressable
                    key={s.key}
                    onPress={() => updateSettings({ iconShape: s.key })}
                    style={[styles.shapeChoice, { backgroundColor: active ? palette.accent : palette.chipBg }]}
                  >
                    <View style={[{ width: 26, height: 26, backgroundColor: active ? '#fff' : palette.accent }, shapeStyle(s.key, 26)]} />
                    <Text style={[styles.shapeLabel, { color: active ? '#fff' : palette.text }]}>{s.name}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Label text="Icon size" />
            <Choice<number>
              value={settings.iconSize}
              onChange={set('iconSize')}
              options={[
                { value: 48, label: 'Small' },
                { value: 56, label: 'Medium' },
                { value: 62, label: 'Large' },
                { value: 68, label: 'Huge' },
              ]}
            />
            <Label text="Columns" />
            <Choice<number>
              value={settings.columns}
              onChange={set('columns')}
              options={[
                { value: 4, label: '4' },
                { value: 5, label: '5' },
                { value: 6, label: '6' },
              ]}
            />
            <Toggle label="App names" value={settings.showLabels} onChange={set('showLabels')} />
            <Toggle label="Glass shine on icons" value={settings.iconShine} onChange={set('iconShine')} />
            <Toggle label="Themed icons" hint="Tints icons with your accent color" value={settings.themedIcons} onChange={set('themedIcons')} />
          </Section>

          <Section title="Home screen" icon="home-outline">
            <Toggle label="Battery & date cards" value={settings.showGlance} onChange={set('showGlance')} />
            <Toggle label="Search bar" value={settings.showSearch} onChange={set('showSearch')} />
          </Section>

          <Section title="App drawer" icon="grid-outline">
            <Label text="Layout" />
            <Choice<DrawerStyle>
              value={settings.drawerStyle}
              onChange={set('drawerStyle')}
              options={[
                { value: 'grid', label: 'Grid' },
                { value: 'pages', label: 'Pages' },
                { value: 'list', label: 'List' },
              ]}
            />
            <Text style={[styles.hint, { color: palette.subtext }]}>
              {settings.drawerStyle === 'pages'
                ? 'Swipe sideways through pages of apps — no endless scrolling.'
                : settings.drawerStyle === 'list'
                  ? 'One app per row, alphabetical.'
                  : 'Scrolling grid of icons.'}
            </Text>
            {settings.drawerStyle !== 'pages' && (
              <Toggle label="A–Z quick scroll" hint="Letters on the right edge jump through your apps" value={settings.azScroller} onChange={set('azScroller')} />
            )}
            <Toggle label="Category tabs" value={settings.drawerCategories} onChange={set('drawerCategories')} />
            <Toggle label="Frequently used row" value={settings.showFrequent} onChange={set('showFrequent')} />
          </Section>

          <Section title={`Hidden apps (${hiddenApps.length})`} icon="eye-off-outline">
            {hiddenApps.length === 0 ? (
              <Text style={[styles.hint, { color: palette.subtext }]}>Long-press an app and choose “Hide app”.</Text>
            ) : (
              hiddenApps.map((app) => (
                <View key={app.key} style={styles.hiddenRow}>
                  {app.icon ? <Image source={{ uri: app.icon }} style={styles.hiddenIcon} /> : null}
                  <Text numberOfLines={1} style={[styles.flex, styles.rowText, { color: palette.text }]}>
                    {app.label}
                  </Text>
                  <Pressable
                    onPress={() => updateLayout((l) => ({ ...l, hidden: l.hidden.filter((k) => k !== app.key) }))}
                    style={[styles.pill, { backgroundColor: palette.chipBg }]}
                  >
                    <Text style={[styles.pillText, { color: palette.accent }]}>Show</Text>
                  </Pressable>
                </View>
              ))
            )}
          </Section>

          <Section title="Launcher" icon="layers-outline">
            <Row label="Default home app" detail={isDefault ? 'Lumo' : 'Not set'} onPress={Launcher.openHomeSettings} chevron />
            <Row label="Refresh app list" onPress={refreshApps} chevron />
            <Row label="Reset look to defaults" onPress={resetSettings} destructive />
          </Section>

          <Text style={[styles.footer, { color: palette.subtext }]}>Lumo Launcher · Everything stays on your phone</Text>
        </ScrollView>
      </View>
    </Modal>
  );
}

function LockStatusLine({ status, use24h }: { status: Launcher.LockScreenStatus | null; use24h: boolean }) {
  const { palette } = useStore();
  if (!status) return null;
  const at = (ms: number) => {
    const { hours, minutes, suffix } = formatTime(new Date(ms), use24h);
    return `${hours}:${minutes}${suffix ? ` ${suffix}` : ''}`;
  };
  let text: string;
  let color = palette.subtext;
  if (!status.listening) {
    text = 'Waiting to start — open the home screen once.';
    color = '#FF9F0A';
  } else if (status.lastAttempt === 0) {
    text = 'Ready. Turn the screen off and on to see it.';
  } else if (status.lastShown >= status.lastAttempt) {
    const via = status.lastVia === 'notification' ? ' (via notification)' : status.lastVia === 'test' ? ' (test)' : '';
    text = `✓ Opened at ${at(status.lastShown)}${via}`;
    color = '#30D158';
  } else {
    text = `✗ Didn't open at ${at(status.lastAttempt)} — Android blocked it. Allow “Display over other apps” below.`;
    color = '#FF453A';
  }
  return <Text style={[styles.hint, { color, marginTop: 6 }]}>{text}</Text>;
}

function ThemeCard({
  preset,
  apps,
  now,
  selected,
  onPress,
}: {
  preset: ThemePreset;
  apps: App[];
  now: Date;
  selected: boolean;
  onPress: () => void;
}) {
  const { palette } = useStore();
  const p = preset.patch;
  const image = p.wallpaper?.startsWith('img:') ? WALLPAPER_IMAGES[p.wallpaper.slice(4)]?.source : undefined;
  const light = p.theme === 'light';
  const clockColor =
    !p.clockColor || p.clockColor === 'auto' ? (light ? '#111114' : '#FFFFFF') : p.clockColor === 'accent' ? p.accent ?? '#fff' : p.clockColor;
  const icon = (app: App | undefined, i: number) => (
    <View key={i} style={[styles.miniIcon, shapeStyle(p.iconShape ?? 'squircle', 15), { backgroundColor: 'rgba(255,255,255,0.75)' }]}>
      {app?.icon ? <Image source={{ uri: app.icon }} style={styles.miniIconImage} fadeDuration={0} /> : null}
    </View>
  );
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.themeCard, pressed && { transform: [{ scale: 0.96 }] }]}>
      <View style={[styles.phone, { borderColor: selected ? palette.accent : palette.separator }]}>
        {image ? <Image source={image} style={StyleSheet.absoluteFill} resizeMode="cover" resizeMethod="resize" /> : null}
        <View style={[styles.miniClock, p.clockStyle === 'giant' && styles.center]}>
          <ClockFace face={p.clockStyle ?? 'large'} color={clockColor} accent={p.accent ?? palette.accent} now={now} use24h={false} scale={0.24} />
        </View>
        <View style={styles.miniGrid}>{Array.from({ length: 8 }, (_, i) => icon(apps[i], i))}</View>
        <View style={styles.miniDock}>{Array.from({ length: 4 }, (_, i) => icon(apps[8 + i] ?? apps[i], i))}</View>
        {selected && (
          <View style={[styles.themeCheck, { backgroundColor: palette.accent }]}>
            <Ionicons name="checkmark" size={12} color="#fff" />
          </View>
        )}
      </View>
      <Text style={[styles.themeName, { color: palette.text }]}>{preset.name}</Text>
      <Text style={[styles.themeSub, { color: palette.subtext }]}>{preset.subtitle}</Text>
    </Pressable>
  );
}

function ClockTile({
  face,
  name,
  width,
  now,
  color,
  selected,
  onPress,
}: {
  face: Face;
  name: string;
  width: number;
  now: Date;
  color: string;
  selected: boolean;
  onPress: () => void;
}) {
  const { palette, settings } = useStore();
  const image = wallpaperImage(settings);
  const gradient = GRADIENTS[settings.wallpaper];
  const resolved = resolveClockColor(color, palette);
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [{ width }, pressed && { transform: [{ scale: 0.97 }] }]}>
      <View style={[styles.faceTile, { borderColor: selected ? palette.accent : 'transparent' }]}>
        {image ? (
          <Image source={image} style={StyleSheet.absoluteFill} resizeMode="cover" resizeMethod="resize" />
        ) : gradient ? (
          <LinearGradient colors={gradient.colors} style={StyleSheet.absoluteFill} />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: palette.dark ? '#1B1B24' : '#D9DCE6' }]} />
        )}
        <View style={[styles.facePreview, face === 'giant' && styles.center]}>
          {face === 'minimal' ? (
            <View style={[styles.miniCard, { backgroundColor: palette.glassBg, borderColor: palette.glassBorder }]}>
              <Text style={{ color: palette.text, fontSize: 9 }}>Good day</Text>
              <Text style={{ color: palette.text, fontSize: 14 }}>10:08</Text>
            </View>
          ) : (
            <ClockFace face={face} color={resolved} accent={palette.accent} now={now} use24h={settings.clock24h} scale={0.3} />
          )}
        </View>
      </View>
      <Text style={[styles.faceName, { color: selected ? palette.accent : palette.text }]}>{name}</Text>
    </Pressable>
  );
}

function Section({ title, icon, children }: { title: string; icon: keyof typeof Ionicons.glyphMap; children: ReactNode }) {
  const { palette } = useStore();
  return (
    <Glass radius={24} style={styles.section}>
      <View style={styles.sectionHeader}>
        <Ionicons name={icon} size={18} color={palette.accent} />
        <Text style={[styles.sectionTitle, { color: palette.text }]}>{title}</Text>
      </View>
      {children}
    </Glass>
  );
}

function Label({ text }: { text: string }) {
  const { palette } = useStore();
  return <Text style={[styles.label, { color: palette.subtext }]}>{text}</Text>;
}

function Choice<T extends string | number>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  const { palette } = useStore();
  return (
    <View style={[styles.segment, { backgroundColor: palette.chipBg }]}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={String(o.value)}
            onPress={() => onChange(o.value)}
            style={[styles.segmentItem, active && { backgroundColor: palette.accent }]}
          >
            <Text style={[styles.segmentText, { color: active ? '#fff' : palette.text }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function Toggle({ label, hint, value, onChange }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void }) {
  const { palette } = useStore();
  return (
    <Pressable onPress={() => onChange(!value)} style={styles.row}>
      <View style={styles.flex}>
        <Text style={[styles.rowText, { color: palette.text }]}>{label}</Text>
        {hint ? <Text style={[styles.hint, { color: palette.subtext }]}>{hint}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: palette.accent, false: palette.chipBg }}
        thumbColor="#FFFFFF"
      />
    </Pressable>
  );
}

function Row({
  label,
  detail,
  onPress,
  chevron,
  destructive,
}: {
  label: string;
  detail?: string;
  onPress: () => void;
  chevron?: boolean;
  destructive?: boolean;
}) {
  const { palette } = useStore();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}>
      <Text style={[styles.flex, styles.rowText, { color: destructive ? '#FF453A' : palette.text }]}>{label}</Text>
      {detail ? <Text style={[styles.hint, { color: palette.subtext }]}>{detail}</Text> : null}
      {chevron && <Ionicons name="chevron-forward" size={18} color={palette.subtext} />}
    </Pressable>
  );
}

function WallTile({ selected, name, onPress, children }: { selected: boolean; name: string; onPress: () => void; children: ReactNode }) {
  const { palette } = useStore();
  return (
    <Pressable onPress={onPress} style={styles.wallTile}>
      <View style={[styles.wallFrame, { borderColor: selected ? palette.accent : 'transparent' }]}>
        {children}
        {selected && (
          <View style={[styles.wallCheck, { backgroundColor: palette.accent }]}>
            <Ionicons name="checkmark" size={12} color="#fff" />
          </View>
        )}
      </View>
      <Text style={[styles.wallName, { color: palette.subtext }]}>{name}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sheet: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 4,
  },
  title: {
    fontSize: 30,
    fontFamily: 'sans-serif-medium',
  },
  close: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 18,
  },
  bannerTitle: {
    color: '#fff',
    fontSize: 16,
    fontFamily: 'sans-serif-medium',
  },
  bannerText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 13,
    marginTop: 2,
  },
  section: {
    padding: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  sectionTitle: {
    fontSize: 17,
    fontFamily: 'sans-serif-medium',
  },
  label: {
    fontSize: 13,
    marginTop: 12,
    marginBottom: 8,
  },
  segment: {
    flexDirection: 'row',
    borderRadius: 14,
    padding: 3,
  },
  segmentItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 9,
    borderRadius: 11,
  },
  segmentText: {
    fontSize: 13,
    fontFamily: 'sans-serif-medium',
  },
  swatches: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  swatch: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    padding: 3,
  },
  swatchFill: {
    flex: 1,
    alignSelf: 'stretch',
    borderRadius: 14,
  },
  swatchBorder: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(128,128,128,0.6)',
  },
  swatchText: {
    fontSize: 14,
    fontFamily: 'sans-serif-medium',
  },
  themes: {
    gap: 12,
    paddingVertical: 2,
  },
  themeCard: {
    width: 104,
  },
  phone: {
    width: 104,
    height: 200,
    borderRadius: 18,
    borderWidth: 2,
    overflow: 'hidden',
    padding: 6,
  },
  miniClock: {
    marginTop: 8,
    marginLeft: 2,
  },
  miniGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 'auto',
    paddingHorizontal: 4,
  },
  miniDock: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 10,
    marginBottom: 2,
    paddingHorizontal: 4,
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.28)',
  },
  miniIcon: {
    width: 15,
    height: 15,
    overflow: 'hidden',
  },
  miniIconImage: {
    width: 15,
    height: 15,
  },
  themeCheck: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  themeName: {
    fontSize: 13,
    fontFamily: 'sans-serif-medium',
    marginTop: 6,
  },
  themeSub: {
    fontSize: 11,
  },
  walls: {
    gap: 10,
    paddingVertical: 6,
  },
  wallTile: {
    alignItems: 'center',
  },
  wallFrame: {
    width: 62,
    height: 96,
    borderRadius: 16,
    borderWidth: 2,
    padding: 2,
  },
  wallFill: {
    flex: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  wallCheck: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wallName: {
    fontSize: 11,
    marginTop: 4,
  },
  faces: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 12,
  },
  faceTile: {
    height: 116,
    borderRadius: 18,
    borderWidth: 2,
    overflow: 'hidden',
  },
  facePreview: {
    flex: 1,
    padding: 10,
    justifyContent: 'center',
  },
  faceName: {
    fontSize: 12,
    fontFamily: 'sans-serif-medium',
    marginTop: 4,
    textAlign: 'center',
  },
  miniCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 8,
  },
  choiceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  shapeChoice: {
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 14,
    minWidth: 58,
    flexGrow: 1,
  },
  shapeLabel: {
    fontSize: 11,
    fontFamily: 'sans-serif-medium',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    minHeight: 48,
  },
  rowText: {
    fontSize: 15,
  },
  hint: {
    fontSize: 12,
    marginTop: 2,
  },
  hiddenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  hiddenIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
  },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 14,
  },
  pillText: {
    fontSize: 13,
    fontFamily: 'sans-serif-medium',
  },
  footer: {
    textAlign: 'center',
    fontSize: 12,
    marginTop: 8,
  },
});
