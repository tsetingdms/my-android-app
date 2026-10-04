import { Pressable, StyleSheet, Text, View } from 'react-native';

import * as Launcher from '../../../modules/launcher';
import { formatTime, greeting, MONTHS, useMinuteClock, WEEKDAYS } from '../../hooks';
import { useStore } from '../../store';
import { Glass } from '../Glass';

export function ClockWidget() {
  const { settings, palette } = useStore();
  const now = useMinuteClock();
  const { hours, minutes, suffix } = formatTime(now, settings.clock24h);
  const date = `${WEEKDAYS[now.getDay()]}, ${MONTHS[now.getMonth()]} ${now.getDate()}`;
  const color = palette.onWallpaper;
  const shadow = palette.dark ? styles.shadow : null;

  if (settings.clockStyle === 'minimal') {
    return (
      <Pressable onPress={Launcher.openAlarms} style={styles.minimalWrap}>
        <Glass radius={22} style={styles.minimal}>
          <View>
            <Text style={[styles.minimalGreeting, { color: palette.text }]}>{greeting(now)}</Text>
            <Text style={[styles.minimalDate, { color: palette.subtext }]}>{date}</Text>
          </View>
          <Text style={[styles.minimalTime, { color: palette.text }]}>
            {hours}:{minutes}
            {suffix ? <Text style={styles.minimalSuffix}> {suffix}</Text> : null}
          </Text>
        </Glass>
      </Pressable>
    );
  }

  if (settings.clockStyle === 'stacked') {
    return (
      <Pressable onPress={Launcher.openAlarms} style={styles.wrap}>
        <Text style={[styles.stacked, { color }, shadow]}>{hours.padStart(2, '0')}</Text>
        <Text style={[styles.stacked, styles.stackedMinutes, { color: palette.accent }, shadow]}>{minutes}</Text>
        <Text style={[styles.date, { color }, shadow]}>{date}</Text>
      </Pressable>
    );
  }

  const bold = settings.clockStyle === 'bold';
  return (
    <Pressable onPress={Launcher.openAlarms} style={styles.wrap}>
      <Text style={[bold ? styles.bold : styles.large, { color }, shadow]}>
        <Text style={bold ? { color: palette.accent } : undefined}>{hours}</Text>:{minutes}
        {suffix ? <Text style={styles.suffix}> {suffix}</Text> : null}
      </Text>
      <Text style={[styles.date, { color }, shadow]}>{date}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 24,
    paddingTop: 12,
  },
  large: {
    fontSize: 84,
    fontFamily: 'sans-serif-thin',
    letterSpacing: -2,
    includeFontPadding: false,
  },
  bold: {
    fontSize: 76,
    fontFamily: 'sans-serif-black',
    letterSpacing: -2,
    includeFontPadding: false,
  },
  suffix: {
    fontSize: 20,
    fontFamily: 'sans-serif-light',
    letterSpacing: 0,
  },
  stacked: {
    fontSize: 104,
    lineHeight: 100,
    fontFamily: 'sans-serif-light',
    letterSpacing: -4,
    includeFontPadding: false,
  },
  stackedMinutes: {
    fontFamily: 'sans-serif-medium',
  },
  date: {
    fontSize: 17,
    fontFamily: 'sans-serif-medium',
    marginTop: 6,
    opacity: 0.92,
  },
  shadow: {
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  minimalWrap: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  minimal: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  minimalGreeting: {
    fontSize: 18,
    fontFamily: 'sans-serif-medium',
  },
  minimalDate: {
    fontSize: 13,
    marginTop: 2,
  },
  minimalTime: {
    fontSize: 32,
    fontFamily: 'sans-serif-light',
  },
  minimalSuffix: {
    fontSize: 14,
  },
});
