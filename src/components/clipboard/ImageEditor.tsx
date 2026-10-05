import Ionicons from '@expo/vector-icons/Ionicons';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  ToastAndroid,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { G, Path } from 'react-native-svg';

import * as Launcher from '../../../modules/launcher';
import { contrastOn, type ClipItem } from '../../clipboard';

/*
 * Picture editor for clipboard items: draw, add text, crop. Edits are kept as fractions of the
 * picture (x/widths of its width, y of its height) and drawn onto the full picture natively by
 * ClipEditor.kt when saving, so the result matches this preview. Keep these in sync with it.
 */
const LINE_HEIGHT = 1.25;
const PAD_X = 0.35;
const PAD_Y = 0.18;
const BOX_RADIUS = 0.3;

const COLORS = ['#FFFFFF', '#111111', '#FF453A', '#FF9F0A', '#FFD60A', '#30D158', '#0A84FF', '#BF5AF2'];
const PENS = [0.006, 0.012, 0.024];
const TEXT_SIZES = [0.05, 0.075, 0.11];
const MIN_CROP = 0.08;
/** Finger distance (dp) that counts as grabbing a crop corner. */
const GRAB = 32;

type Tool = 'draw' | 'text' | 'crop';
type Stroke = { color: string; width: number; points: number[] };
type Mark = { id: number; text: string; color: string; size: number; x: number; y: number; box: boolean };
type Crop = { x: number; y: number; w: number; h: number };
type Grab = 'tl' | 'tr' | 'bl' | 'br' | 'move' | null;
type Box = { x: number; y: number; w: number; h: number };
type Step = { kind: 'stroke' } | { kind: 'text'; id: number };

const FULL: Crop = { x: 0, y: 0, w: 1, h: 1 };
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const round = (v: number) => Math.round(v * 10000) / 10000;
const isFull = (c: Crop) => c.x <= 0.001 && c.y <= 0.001 && c.w >= 0.999 && c.h >= 0.999;

/** Quadratic curves through the midpoints of the samples (same as ClipEditor.drawStroke). */
function pathD(p: number[], w: number, h: number): string {
  const n = p.length / 2;
  if (n === 0) return '';
  const x = (i: number) => p[i * 2] * w;
  const y = (i: number) => p[i * 2 + 1] * h;
  if (n === 1) return `M${x(0).toFixed(1)} ${y(0).toFixed(1)} L${(x(0) + 0.1).toFixed(1)} ${y(0).toFixed(1)}`;
  let d = `M${x(0).toFixed(1)} ${y(0).toFixed(1)}`;
  for (let i = 1; i < n - 1; i++) {
    d += ` Q${x(i).toFixed(1)} ${y(i).toFixed(1)} ${((x(i) + x(i + 1)) / 2).toFixed(1)} ${((y(i) + y(i + 1)) / 2).toFixed(1)}`;
  }
  return `${d} L${x(n - 1).toFixed(1)} ${y(n - 1).toFixed(1)}`;
}

function grabAt(c: Crop, x: number, y: number, tx: number, ty: number): Grab {
  const near = (ax: number, ay: number) => Math.abs(x - ax) < tx && Math.abs(y - ay) < ty;
  if (near(c.x, c.y)) return 'tl';
  if (near(c.x + c.w, c.y)) return 'tr';
  if (near(c.x, c.y + c.h)) return 'bl';
  if (near(c.x + c.w, c.y + c.h)) return 'br';
  if (x > c.x && x < c.x + c.w && y > c.y && y < c.y + c.h) return 'move';
  return null;
}

function moveCrop(c: Crop, grab: Grab, dx: number, dy: number): Crop {
  if (grab === 'move') return { ...c, x: clamp(c.x + dx, 0, 1 - c.w), y: clamp(c.y + dy, 0, 1 - c.h) };
  let left = c.x;
  let top = c.y;
  let right = c.x + c.w;
  let bottom = c.y + c.h;
  if (grab === 'tl' || grab === 'bl') left = clamp(left + dx, 0, right - MIN_CROP);
  if (grab === 'tr' || grab === 'br') right = clamp(right + dx, left + MIN_CROP, 1);
  if (grab === 'tl' || grab === 'tr') top = clamp(top + dy, 0, bottom - MIN_CROP);
  if (grab === 'bl' || grab === 'br') bottom = clamp(bottom + dy, top + MIN_CROP, 1);
  return { x: left, y: top, w: right - left, h: bottom - top };
}

type Props = {
  clip: ClipItem | null;
  onClose: () => void;
  /** Called with the id of the new (edited) clipboard item. */
  onSaved: (id: string) => void;
};

export const ImageEditor = memo(function ImageEditor({ clip, onClose, onSaved }: Props) {
  return (
    <Modal visible={!!clip} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      {clip && <Editor key={clip.id} clip={clip} onClose={onClose} onSaved={onSaved} />}
    </Modal>
  );
});

function Editor({ clip, onClose, onSaved }: { clip: ClipItem; onClose: () => void; onSaved: (id: string) => void }) {
  const insets = useSafeAreaInsets();
  const [area, setArea] = useState<{ w: number; h: number } | null>(null);
  const [tool, setTool] = useState<Tool>('draw');
  const [color, setColor] = useState('#FF453A');
  const [pen, setPen] = useState(1);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [marks, setMarks] = useState<Mark[]>([]);
  const [crop, setCrop] = useState<Crop>(FULL);
  const [steps, setSteps] = useState<Step[]>([]);
  const [typing, setTyping] = useState<Mark | null>(null);
  const [saving, setSaving] = useState(false);
  const nextId = useRef(1);
  const live = useRef<(d: string) => void>(() => {});
  const points = useRef<number[]>([]);

  const iw = clip.width > 0 ? clip.width : 1;
  const ih = clip.height > 0 ? clip.height : 1;
  const box = useMemo<Box | null>(() => {
    if (!area) return null;
    const s = Math.min(area.w / iw, area.h / ih);
    const w = iw * s;
    const h = ih * s;
    return { x: (area.w - w) / 2, y: (area.h - h) / 2, w, h };
  }, [area, iw, ih]);

  const state = useRef({ tool, color, pen, box, crop });
  state.current = { tool, color, pen, box, crop };

  const changed = strokes.length > 0 || marks.length > 0 || !isFull(crop);

  const startTyping = (at?: { x: number; y: number }) =>
    setTyping({
      id: 0,
      text: '',
      color: state.current.color,
      size: TEXT_SIZES[1],
      x: at ? clamp(at.x, 0, 0.9) : 0.1,
      y: at ? clamp(at.y, 0, 0.92) : 0.4,
      box: false,
    });
  const startTypingRef = useRef(startTyping);
  startTypingRef.current = startTyping;

  // One touch layer over the picture: draws, adjusts the crop, or (text tool) places new text.
  const layer = useMemo(() => {
    let mode: 'draw' | 'crop' | 'tap' | null = null;
    let grab: Grab = null;
    let start: Crop = FULL;
    let sx = 0;
    let sy = 0;
    const finishStroke = () => {
      const p = points.current;
      points.current = [];
      live.current('');
      if (p.length < 2) return;
      const { color: c, pen: size } = state.current;
      setStrokes((s) => [...s, { color: c, width: PENS[size], points: p.map(round) }]);
      setSteps((s) => [...s, { kind: 'stroke' }]);
    };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        const b = state.current.box;
        if (!b) return;
        sx = e.nativeEvent.locationX;
        sy = e.nativeEvent.locationY;
        const t = state.current.tool;
        if (t === 'draw') {
          mode = 'draw';
          points.current = [clamp(sx / b.w, 0, 1), clamp(sy / b.h, 0, 1)];
          live.current(pathD(points.current, b.w, b.h));
        } else if (t === 'crop') {
          start = state.current.crop;
          grab = grabAt(start, sx / b.w, sy / b.h, GRAB / b.w, GRAB / b.h);
          mode = grab ? 'crop' : null;
        } else {
          mode = 'tap';
        }
      },
      onPanResponderMove: (_, g) => {
        const b = state.current.box;
        if (!b) return;
        if (mode === 'draw') {
          const x = clamp((sx + g.dx) / b.w, 0, 1);
          const y = clamp((sy + g.dy) / b.h, 0, 1);
          const p = points.current;
          const lx = p[p.length - 2];
          const ly = p[p.length - 1];
          if (Math.hypot((x - lx) * b.w, (y - ly) * b.h) < 2.5) return;
          p.push(x, y);
          live.current(pathD(p, b.w, b.h));
        } else if (mode === 'crop') {
          setCrop(moveCrop(start, grab, g.dx / b.w, g.dy / b.h));
        }
      },
      onPanResponderRelease: (_, g) => {
        const b = state.current.box;
        if (mode === 'draw') finishStroke();
        else if (mode === 'tap' && b && Math.abs(g.dx) < 6 && Math.abs(g.dy) < 6) {
          startTypingRef.current({ x: sx / b.w, y: sy / b.h });
        }
        mode = null;
      },
      onPanResponderTerminate: () => {
        if (mode === 'draw') finishStroke();
        mode = null;
      },
    });
  }, []);

  const moveMark = (id: number, x: number, y: number) =>
    setMarks((list) => list.map((m) => (m.id === id ? { ...m, x, y } : m)));
  const editMark = (id: number) => {
    const mark = marks.find((m) => m.id === id);
    if (mark) setTyping({ ...mark });
  };

  const commitTyping = () => {
    const t = typing;
    setTyping(null);
    if (!t) return;
    const text = t.text.replace(/\s+$/, '');
    if (t.id === 0) {
      if (!text.trim()) return;
      const id = nextId.current++;
      setMarks((list) => [...list, { ...t, id, text }]);
      setSteps((s) => [...s, { kind: 'text', id }]);
    } else if (!text.trim()) {
      setMarks((list) => list.filter((m) => m.id !== t.id));
      setSteps((s) => s.filter((step) => !(step.kind === 'text' && step.id === t.id)));
    } else {
      setMarks((list) => list.map((m) => (m.id === t.id ? { ...t, text } : m)));
    }
  };

  /** Cancel a new text, or delete the one being edited. */
  const dropTyping = () => {
    const t = typing;
    setTyping(null);
    if (!t || !t.id) return;
    setMarks((list) => list.filter((m) => m.id !== t.id));
    setSteps((s) => s.filter((step) => !(step.kind === 'text' && step.id === t.id)));
  };

  const undo = () => {
    const last = steps[steps.length - 1];
    if (!last) return;
    setSteps((s) => s.slice(0, -1));
    if (last.kind === 'stroke') setStrokes((s) => s.slice(0, -1));
    else setMarks((list) => list.filter((m) => m.id !== last.id));
  };

  const close = () => {
    if (!changed) {
      onClose();
      return;
    }
    Alert.alert('Discard changes?', 'Your drawing, text and crop will be lost.', [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: onClose },
    ]);
  };

  const save = async () => {
    if (!changed) {
      onClose();
      return;
    }
    setSaving(true);
    const edit = {
      strokes,
      texts: marks.map(({ text, color: c, size, x, y, box: boxed }) => ({ text, color: c, size, x: round(x), y: round(y), box: boxed })),
      crop: isFull(crop) ? null : { x: round(crop.x), y: round(crop.y), w: round(crop.w), h: round(crop.h) },
    };
    const id = await Launcher.saveClipEdit(clip.id, JSON.stringify(edit)).catch(() => null);
    setSaving(false);
    if (id) onSaved(id);
    else ToastAndroid.show("Couldn't save the picture", ToastAndroid.SHORT);
  };

  return (
    <View style={styles.root}>
      <View style={[styles.topBar, { paddingTop: insets.top + 6 }]}>
        <Pressable hitSlop={10} onPress={close} style={styles.topButton}>
          <Ionicons name="close" size={24} color="#fff" />
        </Pressable>
        <Pressable hitSlop={10} onPress={undo} disabled={steps.length === 0} style={styles.topButton}>
          <Ionicons name="arrow-undo-outline" size={22} color={steps.length ? '#fff' : 'rgba(255,255,255,0.3)'} />
        </Pressable>
        <View style={styles.flex} />
        <Pressable onPress={save} disabled={saving} style={styles.save}>
          {saving ? <ActivityIndicator size="small" color="#000" /> : <Text style={styles.saveText}>Save</Text>}
        </Pressable>
      </View>

      <View style={styles.area} onLayout={(e) => setArea({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
        {box && clip.uri ? (
          <View style={[styles.canvas, { left: box.x, top: box.y, width: box.w, height: box.h }]}>
            <Image source={{ uri: clip.uri }} style={StyleSheet.absoluteFill} resizeMode="stretch" resizeMethod="resize" fadeDuration={0} />
            <Svg pointerEvents="none" width={box.w} height={box.h} style={StyleSheet.absoluteFill}>
              <StrokePaths strokes={strokes} w={box.w} h={box.h} />
            </Svg>
            <LiveStroke hook={live} color={color} width={PENS[pen] * box.w} w={box.w} h={box.h} />
            <CropShade crop={crop} box={box} active={tool === 'crop'} />
            <View {...layer.panHandlers} style={StyleSheet.absoluteFill} />
            {marks.map((m) => (
              <MarkView key={m.id} mark={m} box={box} active={tool === 'text'} onMove={moveMark} onTap={editMark} />
            ))}
          </View>
        ) : null}
      </View>

      <View style={[styles.bottom, { paddingBottom: insets.bottom + 10 }]}>
        {tool === 'draw' && (
          <>
            <Swatches value={color} onChange={setColor} />
            <View style={styles.optRow}>
              {PENS.map((p, i) => (
                <Pressable key={p} onPress={() => setPen(i)} style={[styles.penChoice, pen === i && styles.penActive]}>
                  <View style={{ width: 6 + i * 6, height: 6 + i * 6, borderRadius: 10, backgroundColor: color }} />
                </Pressable>
              ))}
            </View>
          </>
        )}
        {tool === 'text' && (
          <View style={styles.optRow}>
            <Pressable onPress={() => startTyping()} style={styles.pill}>
              <Ionicons name="add" size={18} color="#000" />
              <Text style={styles.pillText}>Add text</Text>
            </Pressable>
            <Text style={styles.hint}>Tap the picture to place it · drag text to move · tap text to edit</Text>
          </View>
        )}
        {tool === 'crop' && (
          <View style={styles.optRow}>
            <Text style={styles.hint}>Drag the corners, or drag inside to move</Text>
            <Pressable onPress={() => setCrop(FULL)} style={styles.pill}>
              <Text style={styles.pillText}>Reset</Text>
            </Pressable>
          </View>
        )}
        <View style={styles.tools}>
          <ToolButton icon="brush-outline" label="Draw" active={tool === 'draw'} onPress={() => setTool('draw')} />
          <ToolButton icon="text-outline" label="Text" active={tool === 'text'} onPress={() => setTool('text')} />
          <ToolButton icon="crop-outline" label="Crop" active={tool === 'crop'} onPress={() => setTool('crop')} />
        </View>
      </View>

      {typing && (
        <View style={[StyleSheet.absoluteFill, styles.typing, { paddingTop: insets.top + 8 }]}>
          <View style={styles.typingBar}>
            <Pressable onPress={dropTyping} hitSlop={10}>
              <Text style={styles.typingAction}>{typing.id ? 'Delete' : 'Cancel'}</Text>
            </Pressable>
            <Pressable onPress={commitTyping} hitSlop={10}>
              <Text style={[styles.typingAction, styles.typingDone]}>Done</Text>
            </Pressable>
          </View>
          <TextInput
            autoFocus
            multiline
            value={typing.text}
            onChangeText={(text) => setTyping({ ...typing, text })}
            placeholder="Type something"
            placeholderTextColor="rgba(255,255,255,0.45)"
            style={[
              styles.typingInput,
              {
                color: typing.box ? contrastOn(typing.color) : typing.color,
                backgroundColor: typing.box ? typing.color : 'transparent',
              },
            ]}
          />
          <Swatches value={typing.color} onChange={(c) => setTyping({ ...typing, color: c })} />
          <View style={styles.optRow}>
            {TEXT_SIZES.map((s, i) => (
              <Pressable
                key={s}
                onPress={() => setTyping({ ...typing, size: s })}
                style={[styles.sizeChoice, typing.size === s && styles.penActive]}
              >
                <Text style={[styles.sizeText, { fontSize: 13 + i * 5 }]}>A</Text>
              </Pressable>
            ))}
            <Pressable
              onPress={() => setTyping({ ...typing, box: !typing.box })}
              style={[styles.sizeChoice, typing.box && styles.penActive]}
            >
              <Ionicons name="square" size={18} color={typing.box ? typing.color : '#fff'} />
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

const StrokePaths = memo(function StrokePaths({ strokes, w, h }: { strokes: Stroke[]; w: number; h: number }) {
  return (
    <G>
      {strokes.map((s, i) => (
        <Path
          key={i}
          d={pathD(s.points, w, h)}
          stroke={s.color}
          strokeWidth={s.width * w}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      ))}
    </G>
  );
});

/** The stroke being drawn; it re-renders on its own so finished strokes and the UI don't. */
function LiveStroke({
  hook,
  color,
  width,
  w,
  h,
}: {
  hook: { current: (d: string) => void };
  color: string;
  width: number;
  w: number;
  h: number;
}) {
  const [d, setD] = useState('');
  useEffect(() => {
    hook.current = setD;
  }, [hook]);
  if (!d) return null;
  return (
    <Svg pointerEvents="none" width={w} height={h} style={StyleSheet.absoluteFill}>
      <Path d={d} stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

/** Dims everything outside the crop; shows corner handles while cropping. */
function CropShade({ crop, box, active }: { crop: Crop; box: Box; active: boolean }) {
  if (isFull(crop) && !active) return null;
  const left = crop.x * box.w;
  const top = crop.y * box.h;
  const width = crop.w * box.w;
  const height = crop.h * box.h;
  const corner = (x: number, y: number) => (
    <View style={[styles.handle, { left: x - 9, top: y - 9 }]} />
  );
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={[styles.shade, { left: 0, top: 0, right: 0, height: top }]} />
      <View style={[styles.shade, { left: 0, top: top + height, right: 0, bottom: 0 }]} />
      <View style={[styles.shade, { left: 0, top, width: left, height }]} />
      <View style={[styles.shade, { left: left + width, top, right: 0, height }]} />
      {active && (
        <>
          <View style={[styles.cropFrame, { left, top, width, height }]} />
          {corner(left, top)}
          {corner(left + width, top)}
          {corner(left, top + height)}
          {corner(left + width, top + height)}
        </>
      )}
    </View>
  );
}

type MarkProps = {
  mark: Mark;
  box: Box;
  active: boolean;
  onMove: (id: number, x: number, y: number) => void;
  onTap: (id: number) => void;
};

const MarkView = memo(function MarkView({ mark, box, active, onMove, onTap }: MarkProps) {
  const start = useRef({ x: 0, y: 0 });
  const latest = useRef({ mark, box, onMove, onTap });
  latest.current = { mark, box, onMove, onTap };
  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          start.current = { x: latest.current.mark.x, y: latest.current.mark.y };
        },
        onPanResponderMove: (_, g) => {
          const { box: b, mark: m } = latest.current;
          latest.current.onMove(m.id, clamp(start.current.x + g.dx / b.w, -0.3, 0.95), clamp(start.current.y + g.dy / b.h, -0.05, 0.97));
        },
        onPanResponderRelease: (_, g) => {
          if (Math.abs(g.dx) < 5 && Math.abs(g.dy) < 5) latest.current.onTap(latest.current.mark.id);
        },
      }),
    []
  );
  const size = mark.size * box.w;
  return (
    // A very wide wrapper so the text never wraps differently from the saved picture.
    <View pointerEvents="box-none" style={[styles.markWrap, { left: mark.x * box.w, top: mark.y * box.h }]}>
      <View
        {...(active ? pan.panHandlers : {})}
        pointerEvents={active ? 'auto' : 'none'}
        style={{
          paddingHorizontal: size * PAD_X,
          paddingVertical: size * PAD_Y,
          borderRadius: size * BOX_RADIUS,
          backgroundColor: mark.box ? mark.color : 'transparent',
        }}
      >
        <Text
          style={[
            styles.markText,
            { fontSize: size, lineHeight: size * LINE_HEIGHT, color: mark.box ? contrastOn(mark.color) : mark.color },
            !mark.box && { textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 0, height: size * 0.04 }, textShadowRadius: size * 0.12 },
          ]}
        >
          {mark.text}
        </Text>
      </View>
    </View>
  );
});

function Swatches({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  return (
    <View style={styles.optRow}>
      {COLORS.map((c) => (
        <Pressable
          key={c}
          onPress={() => onChange(c)}
          hitSlop={4}
          style={[styles.swatch, { backgroundColor: c }, value === c && styles.swatchActive]}
        />
      ))}
    </View>
  );
}

function ToolButton({
  icon,
  label,
  active,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.tool, active && styles.toolActive]}>
      <Ionicons name={icon} size={20} color={active ? '#000' : '#fff'} />
      <Text style={[styles.toolText, active && styles.toolTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000',
  },
  flex: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 8,
    gap: 8,
  },
  topButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  save: {
    minWidth: 76,
    height: 36,
    borderRadius: 18,
    paddingHorizontal: 18,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveText: {
    color: '#000',
    fontSize: 15,
    fontFamily: 'sans-serif-medium',
  },
  area: {
    flex: 1,
    marginHorizontal: 12,
  },
  canvas: {
    position: 'absolute',
    overflow: 'hidden',
  },
  shade: {
    position: 'absolute',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  cropFrame: {
    position: 'absolute',
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  handle: {
    position: 'absolute',
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#fff',
  },
  markWrap: {
    position: 'absolute',
    width: 4000,
    alignItems: 'flex-start',
  },
  markText: {
    fontWeight: 'bold',
    includeFontPadding: false,
  },
  bottom: {
    paddingTop: 10,
    gap: 10,
  },
  optRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 10,
    paddingHorizontal: 16,
  },
  swatch: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  swatchActive: {
    borderColor: '#fff',
    transform: [{ scale: 1.15 }],
  },
  penChoice: {
    width: 40,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  penActive: {
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 34,
    borderRadius: 17,
    paddingHorizontal: 14,
    backgroundColor: '#fff',
  },
  pillText: {
    color: '#000',
    fontSize: 14,
    fontFamily: 'sans-serif-medium',
  },
  hint: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    textAlign: 'center',
    flexShrink: 1,
  },
  tools: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
  },
  tool: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 40,
    borderRadius: 20,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  toolActive: {
    backgroundColor: '#fff',
  },
  toolText: {
    color: '#fff',
    fontSize: 14,
  },
  toolTextActive: {
    color: '#000',
  },
  typing: {
    backgroundColor: 'rgba(0,0,0,0.75)',
    gap: 14,
  },
  typingBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 6,
  },
  typingAction: {
    color: '#fff',
    fontSize: 16,
  },
  typingDone: {
    fontFamily: 'sans-serif-medium',
  },
  typingInput: {
    marginHorizontal: 24,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
    maxHeight: 220,
  },
  sizeChoice: {
    width: 42,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sizeText: {
    color: '#fff',
    fontWeight: 'bold',
  },
});
