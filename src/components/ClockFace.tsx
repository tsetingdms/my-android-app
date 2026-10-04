import { memo } from 'react';
import { StyleSheet, Text, View, type TextStyle } from 'react-native';

import { formatTime, MONTHS, WEEKDAYS } from '../hooks';
import type { ClockFace as Face, Palette } from '../theme';

/** 'auto' follows the wallpaper text color, 'accent' the accent, anything else is a hex color. */
export function resolveClockColor(setting: string, palette: Palette): string {
  if (setting === 'accent') return palette.accent;
  if (setting === 'auto' || !setting.startsWith('#')) return palette.onWallpaper;
  return setting;
}

type Props = {
  face: Face;
  /** Main text color. */
  color: string;
  /** Used by faces with a second color (bold hours, stacked minutes). */
  accent: string;
  now: Date;
  use24h: boolean;
  /** Shrinks the whole face, e.g. 0.3 for previews. */
  scale?: number;
};

function luminance(hex: string): number {
  const h = hex.replace('#', '');
  if (h.length < 6) return 1;
  const n = parseInt(h.slice(0, 6), 16);
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
}

const shortDate = (d: Date) => `${WEEKDAYS[d.getDay()].slice(0, 3)}, ${MONTHS[d.getMonth()].slice(0, 3)} ${d.getDate()}`;
const longDate = (d: Date) => `${WEEKDAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;

/** Every clock design, shared by the home screen, the lock screen and the pickers. */
export const ClockFace = memo(function ClockFace({ face, color, accent, now, use24h, scale = 1 }: Props) {
  const { hours, minutes, suffix } = formatTime(now, use24h);
  const s = (n: number) => n * scale;
  // Light text gets a soft shadow so it stays readable on bright wallpapers.
  const shadow: TextStyle | null =
    luminance(color) > 0.6 && scale > 0.5
      ? { textShadowColor: 'rgba(0,0,0,0.35)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 8 }
      : null;
  const text = (style: TextStyle) => [styles.base, { color }, shadow, style];
  const ampm = suffix ? <Text style={{ fontSize: s(18), fontFamily: 'sans-serif-medium' }}> {suffix}</Text> : null;

  switch (face) {
    case 'bold':
      return (
        <View>
          <Text style={text({ fontSize: s(76), fontFamily: 'sans-serif-black', letterSpacing: s(-2) })}>
            <Text style={{ color: accent }}>{hours}</Text>:{minutes}
            {ampm}
          </Text>
          <Text style={text({ fontSize: s(17), fontFamily: 'sans-serif-medium', marginTop: s(4) })}>{longDate(now)}</Text>
        </View>
      );

    case 'stacked':
      return (
        <View>
          <Text style={text({ fontSize: s(104), lineHeight: s(100), fontFamily: 'sans-serif-light', letterSpacing: s(-4) })}>
            {hours.padStart(2, '0')}
          </Text>
          <Text
            style={text({ fontSize: s(104), lineHeight: s(100), fontFamily: 'sans-serif-medium', letterSpacing: s(-4), color: accent })}
          >
            {minutes}
          </Text>
          <Text style={text({ fontSize: s(17), fontFamily: 'sans-serif-medium', marginTop: s(6) })}>{longDate(now)}</Text>
        </View>
      );

    case 'divider':
      return (
        <View style={{ width: s(260) }}>
          <Text style={text({ fontSize: s(17), fontFamily: 'sans-serif-medium' })}>{shortDate(now)}</Text>
          <View style={{ height: Math.max(1, s(1.5)), backgroundColor: color, opacity: 0.55, marginVertical: s(8) }} />
          <Text style={text({ fontSize: s(92), lineHeight: s(104), fontFamily: 'Anton' })}>
            {hours}:{minutes}
          </Text>
        </View>
      );

    case 'giant':
      return (
        <View style={{ alignItems: 'center' }}>
          <Text style={text({ fontSize: s(118), lineHeight: s(124), fontFamily: 'Unbounded', textAlign: 'center' })}>
            {hours.padStart(2, '0')}
          </Text>
          <Text style={text({ fontSize: s(118), lineHeight: s(124), fontFamily: 'Unbounded', textAlign: 'center' })}>
            {minutes}
          </Text>
          <Text style={text({ fontSize: s(17), fontFamily: 'sans-serif-medium', marginTop: s(4) })}>{shortDate(now)}</Text>
        </View>
      );

    case 'stencil':
      return (
        <View>
          <Text style={text({ fontSize: s(150), lineHeight: s(136), fontFamily: 'BigShouldersStencil' })}>
            {hours.padStart(2, '0')}
          </Text>
          <Text style={text({ fontSize: s(150), lineHeight: s(136), fontFamily: 'BigShouldersStencil' })}>{minutes}</Text>
          <Text style={text({ fontSize: s(17), fontFamily: 'sans-serif-medium', marginTop: s(4) })}>{shortDate(now)}</Text>
        </View>
      );

    case 'condensed':
      return (
        <View>
          <Text style={text({ fontSize: s(124), lineHeight: s(124), fontFamily: 'BebasNeue', letterSpacing: s(1) })}>
            {hours}:{minutes}
          </Text>
          <Text style={text({ fontSize: s(18), fontFamily: 'sans-serif-medium', marginTop: s(-6) })}>{shortDate(now)}</Text>
        </View>
      );

    case 'rounded':
      return (
        <View>
          <Text style={text({ fontSize: s(84), lineHeight: s(96), fontFamily: 'Fredoka' })}>
            {hours}:{minutes}
          </Text>
          <Text style={text({ fontSize: s(40), lineHeight: s(46), fontFamily: 'Fredoka' })}>
            {MONTHS[now.getMonth()].slice(0, 3)} {now.getDate()}
          </Text>
          <Text style={text({ fontSize: s(18), fontFamily: 'Fredoka', opacity: 0.85 })}>{WEEKDAYS[now.getDay()].slice(0, 3)}</Text>
        </View>
      );

    case 'digital':
      return (
        <View>
          <Text style={text({ fontSize: s(64), lineHeight: s(78), fontFamily: 'Orbitron', letterSpacing: s(2) })}>
            {hours.padStart(2, '0')}:{minutes}
            {suffix ? <Text style={{ fontSize: s(16) }}> {suffix}</Text> : null}
          </Text>
          <Text style={text({ fontSize: s(14), fontFamily: 'Orbitron', letterSpacing: s(3), marginTop: s(2) })}>
            {shortDate(now).toUpperCase()}
          </Text>
        </View>
      );

    case 'retro':
      return (
        <View>
          <Text style={text({ fontSize: s(82), lineHeight: s(96), fontFamily: 'Righteous' })}>
            {hours}:{minutes}
            {suffix ? <Text style={{ fontSize: s(20) }}> {suffix}</Text> : null}
          </Text>
          <Text style={text({ fontSize: s(18), fontFamily: 'Righteous', marginTop: s(2) })}>{longDate(now)}</Text>
        </View>
      );

    case 'minimal':
    case 'large':
    default:
      return (
        <View>
          <Text style={text({ fontSize: s(84), fontFamily: 'sans-serif-thin', letterSpacing: s(-2) })}>
            {hours}:{minutes}
            {ampm}
          </Text>
          <Text style={text({ fontSize: s(17), fontFamily: 'sans-serif-medium', marginTop: s(2) })}>{longDate(now)}</Text>
        </View>
      );
  }
});

const styles = StyleSheet.create({
  base: {
    includeFontPadding: false,
  },
});
