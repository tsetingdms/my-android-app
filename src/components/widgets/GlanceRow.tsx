import Ionicons from '@expo/vector-icons/Ionicons';
import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import * as Launcher from '../../../modules/launcher';
import { MONTHS, useBattery, useMinuteClock, WEEKDAYS } from '../../hooks';
import { useLook } from '../../store';
import { GlassButton } from '../Glass';

export function batteryIcon(level: number, charging: boolean): keyof typeof Ionicons.glyphMap {
  if (charging) return 'battery-charging';
  if (level >= 70) return 'battery-full';
  if (level >= 25) return 'battery-half';
  return 'battery-dead';
}

/** Two compact glass cards: battery and today's date. */
export const GlanceRow = memo(function GlanceRow() {
  const { palette } = useLook();
  const battery = useBattery();
  const now = useMinuteClock();
  const level = Math.max(0, battery.level);
  const low = battery.level >= 0 && battery.level <= 15 && !battery.charging;
  const barColor = battery.charging ? '#30D158' : low ? '#FF453A' : palette.accent;

  return (
    <View style={styles.row}>
      <GlassButton style={styles.card} radius={24} frosted onPress={() => Launcher.openSettingsPanel('battery')}>
        <View style={styles.inner}>
          <View style={styles.header}>
            <Ionicons name={batteryIcon(level, battery.charging)} size={18} color={barColor} />
            <Text style={[styles.caption, { color: palette.subtext }]}>
              {battery.charging ? 'Charging' : 'Battery'}
            </Text>
          </View>
          <Text style={[styles.big, { color: palette.text }]}>
            {battery.level >= 0 ? battery.level : '--'}
            <Text style={styles.unit}>%</Text>
          </Text>
          <View style={[styles.track, { backgroundColor: palette.chipBg }]}>
            <View style={[styles.fill, { width: `${level}%`, backgroundColor: barColor }]} />
          </View>
        </View>
      </GlassButton>

      <GlassButton style={styles.card} radius={24} frosted onPress={Launcher.openCalendar}>
        <View style={styles.inner}>
          <View style={styles.header}>
            <Ionicons name="calendar-outline" size={16} color={palette.accent} />
            <Text style={[styles.caption, { color: palette.accent }]}>
              {WEEKDAYS[now.getDay()].slice(0, 3).toUpperCase()}
            </Text>
          </View>
          <Text style={[styles.big, { color: palette.text }]}>{now.getDate()}</Text>
          <Text style={[styles.caption, { color: palette.subtext }]}>
            {MONTHS[now.getMonth()]} {now.getFullYear()}
          </Text>
        </View>
      </GlassButton>
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    marginTop: 18,
  },
  card: {
    flex: 1,
  },
  inner: {
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  caption: {
    fontSize: 13,
    fontFamily: 'sans-serif-medium',
  },
  big: {
    fontSize: 36,
    fontFamily: 'sans-serif-light',
    marginTop: 4,
    includeFontPadding: false,
  },
  unit: {
    fontSize: 18,
  },
  track: {
    height: 6,
    borderRadius: 3,
    marginTop: 10,
    overflow: 'hidden',
  },
  fill: {
    height: 6,
    borderRadius: 3,
  },
});
