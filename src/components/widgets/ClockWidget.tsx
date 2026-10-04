import { Pressable, StyleSheet, Text, View } from 'react-native';

import * as Launcher from '../../../modules/launcher';
import { formatTime, greeting, MONTHS, useMinuteClock, WEEKDAYS } from '../../hooks';
import { useStore } from '../../store';
import { ClockFace, resolveClockColor } from '../ClockFace';
import { Glass } from '../Glass';

export function ClockWidget() {
  const { settings, palette } = useStore();
  const now = useMinuteClock();

  if (settings.clockStyle === 'minimal') {
    const { hours, minutes, suffix } = formatTime(now, settings.clock24h);
    const date = `${WEEKDAYS[now.getDay()]}, ${MONTHS[now.getMonth()]} ${now.getDate()}`;
    return (
      <Pressable onPress={Launcher.openAlarms} style={styles.minimalWrap}>
        <Glass radius={22} style={styles.minimal} frosted>
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

  return (
    <Pressable onPress={Launcher.openAlarms} style={[styles.wrap, settings.clockStyle === 'giant' && styles.center]}>
      <ClockFace
        face={settings.clockStyle}
        color={resolveClockColor(settings.clockColor, palette)}
        accent={palette.accent}
        now={now}
        use24h={settings.clock24h}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 24,
    paddingTop: 12,
  },
  center: {
    alignItems: 'center',
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
