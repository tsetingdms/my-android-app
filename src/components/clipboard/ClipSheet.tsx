import Ionicons from '@expo/vector-icons/Ionicons';
import { memo, useEffect, useRef, useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  ToastAndroid,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import * as Launcher from '../../../modules/launcher';
import { timeAgo, type ClipItem } from '../../clipboard';
import type { App } from '../../store';
import { useLook } from '../../store';
import { shapeStyle } from '../../theme';
import { Glass } from '../Glass';

type Props = {
  clip: ClipItem | null;
  /** The edge panel's apps, offered as one-tap "Send to" targets. */
  apps: App[];
  onClose: () => void;
  onEdit: (clip: ClipItem) => void;
  /** After the item was handed to another app. */
  onSent: () => void;
};

/** A clipboard item up close: send it to an app, copy it, edit, pin or delete it. */
export const ClipSheet = memo(function ClipSheet({ clip, apps, onClose, onEdit, onSent }: Props) {
  const { palette, settings } = useLook();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [text, setText] = useState('');
  const input = useRef<TextInput>(null);
  const id = clip?.id;
  const original = clip?.text ?? '';

  useEffect(() => {
    setText(original);
  }, [id, original]);

  // Text edits are kept when the sheet closes or the text is used.
  const saveText = () => {
    if (clip?.kind === 'text' && text.trim() && text !== clip.text) Launcher.updateClipText(clip.id, text);
  };
  const close = () => {
    saveText();
    onClose();
  };
  const send = (packageName: string | null) => {
    if (!clip) return;
    saveText();
    Launcher.shareClip(clip.id, packageName);
    onClose();
    onSent();
  };
  const copy = () => {
    if (!clip) return;
    saveText();
    if (Launcher.copyClip(clip.id)) ToastAndroid.show('Copied — paste it anywhere', ToastAndroid.SHORT);
  };
  const edit = () => {
    if (!clip) return;
    if (clip.kind === 'image') onEdit(clip);
    else input.current?.focus();
  };
  const remove = () => {
    if (!clip) return;
    Launcher.deleteClip(clip.id);
    onClose();
  };

  const previewWidth = width - 24 - 32;
  const imageHeight =
    clip?.kind === 'image' && clip.width > 0 ? Math.min(height * 0.4, (previewWidth * clip.height) / clip.width) : 200;
  const iconShape = shapeStyle(settings.iconShape, 44);

  return (
    <Modal visible={!!clip} transparent animationType="fade" onRequestClose={close} statusBarTranslucent>
      <KeyboardAvoidingView behavior="padding" style={styles.flex}>
        <Pressable style={[styles.backdrop, { paddingBottom: insets.bottom + 12 }]} onPress={close}>
          {clip && (
            <Pressable onPress={() => {}}>
              <Glass radius={28} style={[styles.sheet, { backgroundColor: palette.sheetBg }]}>
                <View style={styles.header}>
                  <Ionicons
                    name={clip.kind === 'image' ? 'image-outline' : 'document-text-outline'}
                    size={20}
                    color={palette.accent}
                  />
                  <View style={styles.flex}>
                    <Text style={[styles.title, { color: palette.text }]}>{clip.kind === 'image' ? 'Picture' : 'Text'}</Text>
                    <Text style={[styles.sub, { color: palette.subtext }]}>
                      {timeAgo(clip.time)}
                      {clip.pinned ? ' · Pinned' : ''}
                    </Text>
                  </View>
                  <Pressable hitSlop={10} onPress={close} style={[styles.close, { backgroundColor: palette.chipBg }]}>
                    <Ionicons name="close" size={18} color={palette.text} />
                  </Pressable>
                </View>

                {clip.kind === 'image' && clip.uri ? (
                  <View style={[styles.preview, { backgroundColor: palette.chipBg }]}>
                    <Image
                      source={{ uri: clip.uri }}
                      style={{ width: previewWidth, height: imageHeight }}
                      resizeMode="contain"
                      resizeMethod="resize"
                      fadeDuration={0}
                    />
                  </View>
                ) : (
                  <TextInput
                    ref={input}
                    value={text}
                    onChangeText={setText}
                    multiline
                    textAlignVertical="top"
                    style={[
                      styles.input,
                      { color: palette.text, backgroundColor: palette.chipBg, maxHeight: height * 0.3 },
                    ]}
                  />
                )}

                <Text style={[styles.label, { color: palette.subtext }]}>Send to</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.apps}>
                  {apps.map((app) => (
                    <Pressable key={app.key} onPress={() => send(app.packageName)} style={({ pressed }) => [styles.app, pressed && styles.pressed]}>
                      <View style={[styles.appIcon, iconShape]}>
                        {app.icon ? <Image source={{ uri: app.icon }} style={styles.appIcon} fadeDuration={0} /> : null}
                      </View>
                      <Text numberOfLines={1} style={[styles.appLabel, { color: palette.text }]}>
                        {app.label}
                      </Text>
                    </Pressable>
                  ))}
                  <Pressable onPress={() => send(null)} style={({ pressed }) => [styles.app, pressed && styles.pressed]}>
                    <View style={[styles.appIcon, styles.more, { backgroundColor: palette.accent }]}>
                      <Ionicons name="share-social-outline" size={20} color="#fff" />
                    </View>
                    <Text numberOfLines={1} style={[styles.appLabel, { color: palette.text }]}>
                      More…
                    </Text>
                  </Pressable>
                </ScrollView>

                <View style={[styles.actions, { borderTopColor: palette.separator }]}>
                  <Action icon="copy-outline" label="Copy" onPress={copy} />
                  <Action icon={clip.kind === 'image' ? 'brush-outline' : 'create-outline'} label="Edit" onPress={edit} />
                  <Action
                    icon={clip.pinned ? 'pin' : 'pin-outline'}
                    label={clip.pinned ? 'Unpin' : 'Pin'}
                    onPress={() => Launcher.pinClip(clip.id, !clip.pinned)}
                  />
                  <Action icon="trash-outline" label="Delete" destructive onPress={remove} />
                </View>
              </Glass>
            </Pressable>
          )}
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
});

function Action({
  icon,
  label,
  destructive,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  destructive?: boolean;
  onPress: () => void;
}) {
  const { palette } = useLook();
  const color = destructive ? '#FF453A' : palette.text;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.action, pressed && styles.pressed]}>
      <Ionicons name={icon} size={21} color={color} />
      <Text style={[styles.actionLabel, { color }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: 12,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    paddingTop: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  title: {
    fontSize: 17,
    fontFamily: 'sans-serif-medium',
  },
  sub: {
    fontSize: 12,
    marginTop: 1,
  },
  close: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  preview: {
    marginHorizontal: 16,
    borderRadius: 16,
    overflow: 'hidden',
    alignItems: 'center',
  },
  input: {
    marginHorizontal: 16,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    lineHeight: 21,
    minHeight: 90,
  },
  label: {
    fontSize: 12,
    fontFamily: 'sans-serif-medium',
    letterSpacing: 0.3,
    marginTop: 14,
    marginBottom: 8,
    marginLeft: 18,
  },
  apps: {
    gap: 14,
    paddingHorizontal: 16,
  },
  app: {
    width: 60,
    alignItems: 'center',
  },
  appIcon: {
    width: 44,
    height: 44,
    overflow: 'hidden',
  },
  more: {
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appLabel: {
    fontSize: 11,
    marginTop: 5,
    maxWidth: 60,
    textAlign: 'center',
  },
  actions: {
    flexDirection: 'row',
    marginTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  action: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    gap: 4,
  },
  actionLabel: {
    fontSize: 12,
  },
  pressed: {
    opacity: 0.6,
  },
});
