import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState, type ReactNode } from 'react';
import { AppState, Image, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import * as Launcher from '../../modules/launcher';
import { useStore } from '../store';
import {
  ACCENTS,
  GRADIENTS,
  SHAPES,
  shapeStyle,
  type ClockStyle,
  type GlassStyle,
  type Settings,
  type ThemeMode,
} from '../theme';
import { Glass, GlassButton } from './Glass';

type Props = { visible: boolean; onClose: () => void };

export function SettingsSheet({ visible, onClose }: Props) {
  const { settings, updateSettings, resetSettings, palette, layout, updateLayout, appsByKey, refreshApps } = useStore();
  const insets = useSafeAreaInsets();
  const [isDefault, setIsDefault] = useState(true);

  useEffect(() => {
    if (!visible) return;
    setIsDefault(Launcher.isDefaultLauncher());
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') setIsDefault(Launcher.isDefaultLauncher());
    });
    return () => sub.remove();
  }, [visible]);

  const set = <K extends keyof Settings>(key: K) => (value: Settings[K]) => updateSettings({ [key]: value } as Partial<Settings>);
  const hiddenApps = layout.hidden.map((k) => appsByKey.get(k)).filter((a) => !!a);

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
            <GlassButton radius={22} onPress={Launcher.openHomeSettings}>
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
                style={[styles.swatch, styles.autoSwatch, { borderColor: settings.accent === 'wallpaper' ? palette.text : 'transparent' }]}
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
              <WallTile
                selected={settings.wallpaper === 'system'}
                name="Phone"
                onPress={() => updateSettings({ wallpaper: 'system' })}
              >
                <View style={[styles.wallFill, styles.center, { backgroundColor: palette.chipBg }]}>
                  <Ionicons name="phone-portrait-outline" size={22} color={palette.text} />
                </View>
              </WallTile>
              {Object.entries(GRADIENTS).map(([key, g]) => (
                <WallTile key={key} selected={settings.wallpaper === key} name={g.name} onPress={() => updateSettings({ wallpaper: key })}>
                  <LinearGradient colors={g.colors} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} style={styles.wallFill} />
                </WallTile>
              ))}
            </ScrollView>
            <Row label="Change phone wallpaper" onPress={Launcher.openWallpaperPicker} chevron />
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
            <Toggle
              label="Themed icons"
              hint="Tints icons with your accent color"
              value={settings.themedIcons}
              onChange={set('themedIcons')}
            />
          </Section>

          <Section title="Home screen" icon="home-outline">
            <Toggle label="Clock" value={settings.showClock} onChange={set('showClock')} />
            {settings.showClock && (
              <>
                <Choice<ClockStyle>
                  value={settings.clockStyle}
                  onChange={set('clockStyle')}
                  options={[
                    { value: 'large', label: 'Thin' },
                    { value: 'bold', label: 'Bold' },
                    { value: 'stacked', label: 'Stacked' },
                    { value: 'minimal', label: 'Card' },
                  ]}
                />
                <Toggle label="24-hour time" value={settings.clock24h} onChange={set('clock24h')} />
              </>
            )}
            <Toggle label="Battery & date cards" value={settings.showGlance} onChange={set('showGlance')} />
            <Toggle label="Search bar" value={settings.showSearch} onChange={set('showSearch')} />
            <Toggle
              label="Swipe down for notifications"
              value={settings.swipeDownNotifications}
              onChange={set('swipeDownNotifications')}
            />
          </Section>

          <Section title="App drawer" icon="grid-outline">
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

          <Text style={[styles.footer, { color: palette.subtext }]}>Lumo Launcher 1.0 · Everything stays on your phone</Text>
        </ScrollView>
      </View>
    </Modal>
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
  autoSwatch: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatchFill: {
    flex: 1,
    borderRadius: 14,
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
