import AsyncStorage from '@react-native-async-storage/async-storage';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import * as Launcher from '../../../modules/launcher';
import type { SettingsPanel } from '../../../modules/launcher';
import { formatBytes, greeting, MONTHS, useBattery, useDeviceStats, useMinuteClock } from '../../hooks';
import { useStore } from '../../store';
import { Glass, GlassButton } from '../Glass';
import { batteryIcon } from './GlanceRow';

type Props = {
  width: number;
  bottomInset: number;
  onOpenSettings: () => void;
};

/** Second home page: a scrollable stack of widgets. */
export function WidgetsPage({ width, bottomInset, onOpenSettings }: Props) {
  const { palette } = useStore();
  const insets = useSafeAreaInsets();
  const now = useMinuteClock();
  const shadow = palette.dark ? styles.shadow : null;

  return (
    <ScrollView
      style={{ width }}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 16, paddingBottom: bottomInset + 16 }]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={[styles.title, { color: palette.onWallpaper }, shadow]}>{greeting(now)}</Text>
      <Text style={[styles.subtitle, { color: palette.onWallpaper }, shadow]}>Your widgets</Text>

      <QuickTiles />
      <DeviceCard />
      <CalendarCard />
      <NoteCard />

      <GlassButton radius={20} style={styles.customize} onPress={onOpenSettings}>
        <View style={styles.customizeInner}>
          <Ionicons name="color-palette-outline" size={20} color={palette.accent} />
          <Text style={[styles.customizeText, { color: palette.text }]}>Customize launcher</Text>
        </View>
      </GlassButton>
    </ScrollView>
  );
}

const TILES: { key: string; label: string; icon: keyof typeof Ionicons.glyphMap; panel?: SettingsPanel }[] = [
  { key: 'torch', label: 'Torch', icon: 'flashlight' },
  { key: 'wifi', label: 'Wi‑Fi', icon: 'wifi', panel: 'wifi' },
  { key: 'data', label: 'Data', icon: 'cellular', panel: 'internet' },
  { key: 'bt', label: 'Bluetooth', icon: 'bluetooth', panel: 'bluetooth' },
  { key: 'sound', label: 'Sound', icon: 'volume-high', panel: 'volume' },
  { key: 'display', label: 'Display', icon: 'sunny-outline', panel: 'display' },
];

function QuickTiles() {
  const { palette } = useStore();
  const [torch, setTorch] = useState(false);

  return (
    <Glass style={styles.card}>
      <Text style={[styles.cardTitle, { color: palette.subtext }]}>Quick controls</Text>
      <View style={styles.tiles}>
        {TILES.map((tile) => {
          const active = tile.key === 'torch' && torch;
          return (
            <GlassButton
              key={tile.key}
              radius={18}
              style={styles.tile}
              onPress={() => {
                if (tile.key === 'torch') {
                  if (Launcher.setTorch(!torch)) setTorch(!torch);
                } else if (tile.panel) {
                  Launcher.openSettingsPanel(tile.panel);
                }
              }}
            >
              <View style={[styles.tileInner, active && { backgroundColor: palette.accent }]}>
                <Ionicons name={tile.icon} size={22} color={active ? '#fff' : palette.text} />
                <Text style={[styles.tileLabel, { color: active ? '#fff' : palette.subtext }]}>{tile.label}</Text>
              </View>
            </GlassButton>
          );
        })}
      </View>
    </Glass>
  );
}

function Meter({ label, value, detail, color }: { label: string; value: number; detail: string; color: string }) {
  const { palette } = useStore();
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <View style={styles.meter}>
      <View style={styles.meterHeader}>
        <Text style={[styles.meterLabel, { color: palette.text }]}>{label}</Text>
        <Text style={[styles.meterDetail, { color: palette.subtext }]}>{detail}</Text>
      </View>
      <View style={[styles.track, { backgroundColor: palette.chipBg }]}>
        <View style={[styles.fill, { width: `${pct}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

function DeviceCard() {
  const { palette } = useStore();
  const battery = useBattery();
  const stats = useDeviceStats();
  const ramUsed = stats ? stats.ramTotal - stats.ramAvailable : 0;
  const diskUsed = stats ? stats.storageTotal - stats.storageAvailable : 0;

  return (
    <Glass style={styles.card}>
      <View style={styles.rowBetween}>
        <Text style={[styles.cardTitle, { color: palette.subtext }]}>This phone</Text>
        <View style={styles.inline}>
          <Ionicons
            name={batteryIcon(battery.level, battery.charging)}
            size={16}
            color={battery.charging ? '#30D158' : palette.subtext}
          />
          <Text style={[styles.meterDetail, { color: palette.subtext }]}>
            {battery.level >= 0 ? `${battery.level}%` : '--'}
            {battery.temperature > 0 ? ` · ${battery.temperature.toFixed(0)}°C` : ''}
          </Text>
        </View>
      </View>
      <Meter
        label="Battery"
        value={Math.max(0, battery.level) / 100}
        detail={battery.charging ? 'Charging' : 'On battery'}
        color={battery.charging ? '#30D158' : palette.accent}
      />
      <Meter
        label="Memory"
        value={stats ? ramUsed / stats.ramTotal : 0}
        detail={stats ? `${formatBytes(ramUsed)} of ${formatBytes(stats.ramTotal)}` : '—'}
        color="#BF5AF2"
      />
      <Meter
        label="Storage"
        value={stats ? diskUsed / stats.storageTotal : 0}
        detail={stats ? `${formatBytes(stats.storageAvailable)} free` : '—'}
        color="#FF9F0A"
      />
    </Glass>
  );
}

function CalendarCard() {
  const { palette } = useStore();
  const now = useMinuteClock();
  const year = now.getFullYear();
  const month = now.getMonth();
  const today = now.getDate();

  const weeks = useMemo(() => {
    const first = new Date(year, month, 1).getDay();
    const days = new Date(year, month + 1, 0).getDate();
    const cells: (number | null)[] = Array.from({ length: first }, () => null);
    for (let d = 1; d <= days; d++) cells.push(d);
    while (cells.length % 7) cells.push(null);
    const rows: (number | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
    return rows;
  }, [year, month]);

  return (
    <GlassButton style={styles.cardButton} onPress={Launcher.openCalendar}>
      <View style={styles.cardPadding}>
        <View style={styles.rowBetween}>
          <Text style={[styles.monthTitle, { color: palette.text }]}>{MONTHS[month]}</Text>
          <Text style={[styles.meterDetail, { color: palette.accent }]}>{year}</Text>
        </View>
        <View style={styles.week}>
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
            <Text key={i} style={[styles.dayHead, { color: palette.subtext }]}>
              {d}
            </Text>
          ))}
        </View>
        {weeks.map((week, wi) => (
          <View key={wi} style={styles.week}>
            {week.map((day, di) => {
              const isToday = day === today;
              return (
                <View key={di} style={styles.dayCell}>
                  {day != null && (
                    <View style={[styles.dayBubble, isToday && { backgroundColor: palette.accent }]}>
                      <Text style={[styles.day, { color: isToday ? '#fff' : palette.text }]}>{day}</Text>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        ))}
      </View>
    </GlassButton>
  );
}

const NOTE_KEY = 'lumo.note.v1';

function NoteCard() {
  const { palette } = useStore();
  const [text, setText] = useState('');
  const loaded = useRef(false);

  useEffect(() => {
    AsyncStorage.getItem(NOTE_KEY)
      .then((v) => {
        if (v) setText(v);
      })
      .finally(() => {
        loaded.current = true;
      });
  }, []);

  useEffect(() => {
    if (!loaded.current) return;
    const t = setTimeout(() => AsyncStorage.setItem(NOTE_KEY, text).catch(() => {}), 400);
    return () => clearTimeout(t);
  }, [text]);

  return (
    <Glass style={styles.card}>
      <View style={styles.inline}>
        <Ionicons name="create-outline" size={16} color={palette.accent} />
        <Text style={[styles.cardTitle, { color: palette.subtext, marginBottom: 0 }]}>Quick note</Text>
      </View>
      <TextInput
        value={text}
        onChangeText={setText}
        placeholder="Write something to remember…"
        placeholderTextColor={palette.subtext}
        multiline
        style={[styles.note, { color: palette.text }]}
      />
    </Glass>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 16,
    gap: 14,
  },
  title: {
    fontSize: 30,
    fontFamily: 'sans-serif-light',
    paddingHorizontal: 8,
  },
  subtitle: {
    fontSize: 15,
    opacity: 0.8,
    paddingHorizontal: 8,
    marginTop: -10,
    marginBottom: 4,
  },
  shadow: {
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  card: {
    padding: 16,
  },
  cardButton: {},
  cardPadding: {
    padding: 16,
  },
  cardTitle: {
    fontSize: 13,
    fontFamily: 'sans-serif-medium',
    marginBottom: 12,
    letterSpacing: 0.3,
  },
  tiles: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  tile: {
    width: '30%',
    flexGrow: 1,
  },
  tileInner: {
    alignItems: 'center',
    paddingVertical: 14,
    gap: 6,
  },
  tileLabel: {
    fontSize: 12,
    fontFamily: 'sans-serif-medium',
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  inline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  meter: {
    marginBottom: 12,
  },
  meterHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  meterLabel: {
    fontSize: 14,
    fontFamily: 'sans-serif-medium',
  },
  meterDetail: {
    fontSize: 13,
  },
  track: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  fill: {
    height: 8,
    borderRadius: 4,
  },
  monthTitle: {
    fontSize: 20,
    fontFamily: 'sans-serif-medium',
    marginBottom: 10,
  },
  week: {
    flexDirection: 'row',
  },
  dayHead: {
    flex: 1,
    textAlign: 'center',
    fontSize: 12,
    fontFamily: 'sans-serif-medium',
    marginBottom: 4,
  },
  dayCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 2,
  },
  dayBubble: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  day: {
    fontSize: 14,
  },
  note: {
    minHeight: 80,
    fontSize: 15,
    textAlignVertical: 'top',
    padding: 0,
  },
  customize: {},
  customizeInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
  },
  customizeText: {
    fontSize: 15,
    fontFamily: 'sans-serif-medium',
  },
});
