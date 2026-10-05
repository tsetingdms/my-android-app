import Ionicons from '@expo/vector-icons/Ionicons';
import { memo, useRef, type ReactNode } from 'react';
import { Image, Pressable, StyleSheet, Text, View, type GestureResponderEvent } from 'react-native';

import type { ClipItem } from '../../clipboard';
import type { App } from '../../store';
import { useLook } from '../../store';
import { shapeStyle } from '../../theme';

/** Small square preview of a clipboard item: the picture, or the start of the text. */
export const ClipThumb = memo(function ClipThumb({ clip, size, radius = 12 }: { clip: ClipItem; size: number; radius?: number }) {
  const { palette } = useLook();
  return (
    <View style={[styles.thumb, { width: size, height: size, borderRadius: radius, backgroundColor: palette.chipBg }]}>
      {clip.kind === 'image' && clip.uri ? (
        <Image source={{ uri: clip.uri }} style={StyleSheet.absoluteFill} resizeMode="cover" resizeMethod="resize" fadeDuration={0} />
      ) : (
        <Text numberOfLines={3} style={[styles.thumbText, { color: palette.text, fontSize: Math.max(8, size / 6) }]}>
          {clip.text}
        </Text>
      )}
    </View>
  );
});

/** The clipboard corner of the edge panel: the latest few items. Tap to open the full list. */
export const ClipStrip = memo(function ClipStrip({ clips, onPress }: { clips: ClipItem[]; onPress: () => void }) {
  const { palette } = useLook();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.strip, pressed && styles.pressed]}>
      <View style={styles.stripHeader}>
        <Ionicons name="clipboard-outline" size={13} color={palette.subtext} />
        <Text style={[styles.stripTitle, { color: palette.subtext }]}>Clipboard</Text>
        {clips.length > 0 && (
          <View style={[styles.count, { backgroundColor: palette.chipBg }]}>
            <Text style={[styles.countText, { color: palette.text }]}>{clips.length}</Text>
          </View>
        )}
        <Ionicons name="chevron-forward" size={14} color={palette.subtext} style={styles.chevron} />
      </View>
      {clips.length > 0 ? (
        <View style={styles.stripThumbs}>
          {clips.slice(0, 3).map((c) => (
            <ClipThumb key={c.id} clip={c} size={42} />
          ))}
        </View>
      ) : (
        <Text style={[styles.stripHint, { color: palette.subtext }]}>Copy text or a picture, then come back home</Text>
      )}
    </Pressable>
  );
});

type TileProps = {
  clip: ClipItem;
  width: number;
  onOpen: (clip: ClipItem) => void;
  onLift: (clip: ClipItem, x: number, y: number) => void;
  onRelease: () => void;
};

/** One item in the clipboard list. Tap opens it; hold lifts it so it can be dropped on an app. */
export const ClipTile = memo(function ClipTile({ clip, width, onOpen, onLift, onRelease }: TileProps) {
  const { palette } = useLook();
  const imageHeight =
    clip.kind === 'image' && clip.width > 0 ? Math.max(56, Math.min(150, (width * clip.height) / clip.width)) : 0;
  return (
    <Pressable
      onPress={() => onOpen(clip)}
      onLongPress={(e: GestureResponderEvent) => onLift(clip, e.nativeEvent.pageX, e.nativeEvent.pageY)}
      onPressOut={onRelease}
      delayLongPress={300}
      style={({ pressed }) => [styles.tile, { width, backgroundColor: palette.chipBg }, pressed && styles.pressed]}
    >
      {clip.kind === 'image' && clip.uri ? (
        <Image
          source={{ uri: clip.uri }}
          style={{ width, height: imageHeight || 96 }}
          resizeMode="cover"
          resizeMethod="resize"
          fadeDuration={0}
        />
      ) : (
        <Text numberOfLines={5} style={[styles.tileText, { color: palette.text }]}>
          {clip.text}
        </Text>
      )}
      {clip.pinned && (
        <View style={[styles.pin, { backgroundColor: palette.accent }]}>
          <Ionicons name="pin" size={10} color="#fff" />
        </View>
      )}
    </Pressable>
  );
});

export type Rect = { x: number; y: number; w: number; h: number };

type TargetsProps = {
  apps: App[];
  hover: string | null;
  iconShape: ReturnType<typeof shapeStyle>;
  onMeasure: (key: string, rect: Rect) => void;
};

/** Shown while a clip is being dragged: drop it on an app to send it there, or on Copy / Share. */
export const DropTargets = memo(function DropTargets({ apps, hover, iconShape, onMeasure }: TargetsProps) {
  const { palette } = useLook();
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.targets, { backgroundColor: palette.dark ? 'rgba(18,18,26,0.94)' : 'rgba(248,248,252,0.96)' }]}>
      <Text style={[styles.targetsTitle, { color: palette.text }]}>Drop on an app</Text>
      <View style={styles.grid}>
        <Target id="copy" label="Copy" hover={hover === 'copy'} onMeasure={onMeasure}>
          <View style={[styles.round, { backgroundColor: palette.chipBg }]}>
            <Ionicons name="copy-outline" size={20} color={palette.text} />
          </View>
        </Target>
        <Target id="share" label="Share…" hover={hover === 'share'} onMeasure={onMeasure}>
          <View style={[styles.round, { backgroundColor: palette.accent }]}>
            <Ionicons name="share-social-outline" size={20} color="#fff" />
          </View>
        </Target>
        {apps.map((app) => (
          <Target key={app.key} id={app.key} label={app.label} hover={hover === app.key} onMeasure={onMeasure}>
            <View style={[styles.appIcon, iconShape]}>
              {app.icon ? <Image source={{ uri: app.icon }} style={styles.appIcon} fadeDuration={0} /> : null}
            </View>
          </Target>
        ))}
      </View>
    </View>
  );
});

function Target({
  id,
  label,
  hover,
  onMeasure,
  children,
}: {
  id: string;
  label: string;
  hover: boolean;
  onMeasure: (key: string, rect: Rect) => void;
  children: ReactNode;
}) {
  const { palette } = useLook();
  const ref = useRef<View>(null);
  const measure = () => ref.current?.measureInWindow((x, y, w, h) => onMeasure(id, { x, y, w, h }));
  return (
    <View ref={ref} collapsable={false} onLayout={measure} style={styles.target}>
      <View style={[styles.targetIcon, hover && { transform: [{ scale: 1.18 }], borderColor: palette.accent }]}>{children}</View>
      <Text numberOfLines={1} style={[styles.targetLabel, { color: hover ? palette.accent : palette.text }]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pressed: {
    opacity: 0.75,
    transform: [{ scale: 0.97 }],
  },
  thumb: {
    overflow: 'hidden',
    padding: 4,
  },
  thumbText: {
    includeFontPadding: false,
  },
  strip: {
    paddingHorizontal: 8,
    paddingTop: 2,
    paddingBottom: 6,
  },
  stripHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginLeft: 2,
    marginBottom: 6,
  },
  stripTitle: {
    fontSize: 12,
    fontFamily: 'sans-serif-medium',
    letterSpacing: 0.3,
  },
  count: {
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  countText: {
    fontSize: 10,
    fontFamily: 'sans-serif-medium',
  },
  chevron: {
    marginLeft: 'auto',
  },
  stripThumbs: {
    flexDirection: 'row',
    gap: 8,
  },
  stripHint: {
    fontSize: 11,
    lineHeight: 15,
  },
  tile: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  tileText: {
    fontSize: 13,
    lineHeight: 18,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  pin: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  targets: {
    borderRadius: 22,
    paddingTop: 12,
  },
  targetsTitle: {
    fontSize: 13,
    fontFamily: 'sans-serif-medium',
    textAlign: 'center',
    marginBottom: 6,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  target: {
    width: '50%',
    height: 78,
    alignItems: 'center',
    justifyContent: 'center',
  },
  targetIcon: {
    borderRadius: 26,
    borderWidth: 2,
    borderColor: 'transparent',
    padding: 1,
  },
  round: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appIcon: {
    width: 46,
    height: 46,
    overflow: 'hidden',
  },
  targetLabel: {
    fontSize: 11,
    marginTop: 4,
    maxWidth: 76,
    textAlign: 'center',
  },
});
