import Ionicons from '@expo/vector-icons/Ionicons';
import { Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import * as Launcher from '../../modules/launcher';
import type { App, Layout } from '../store';
import { useStore } from '../store';
import { Glass } from './Glass';
import { EDGE_APP_LIMIT } from './EdgePanel';
import { DOCK_LIMIT } from './HomeParts';

export type ActionTarget = { app: App; source: 'home' | 'dock' | 'drawer' | 'edge' };

type Action = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  run: () => void;
  destructive?: boolean;
};

function move(list: string[], key: string, delta: number): string[] {
  const i = list.indexOf(key);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= list.length) return list;
  const next = [...list];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

export function ActionsSheet({ target, onClose }: { target: ActionTarget | null; onClose: () => void }) {
  const { layout, updateLayout, palette } = useStore();
  const insets = useSafeAreaInsets();
  const app = target?.app;

  const actions: Action[] = [];
  if (app && target) {
    const key = app.key;
    const inHome = layout.home.includes(key);
    const inDock = layout.dock.includes(key);
    const edit = (fn: (l: Layout) => Layout) => () => updateLayout(fn);

    if (target.source === 'home' || target.source === 'dock' || target.source === 'edge') {
      const list = target.source;
      const index = layout[list].indexOf(key);
      if (index > 0) {
        actions.push({ icon: 'chevron-back', label: 'Move left', run: edit((l) => ({ ...l, [list]: move(l[list], key, -1) })) });
      }
      if (index >= 0 && index < layout[list].length - 1) {
        actions.push({ icon: 'chevron-forward', label: 'Move right', run: edit((l) => ({ ...l, [list]: move(l[list], key, 1) })) });
      }
    }

    actions.push(
      inHome
        ? { icon: 'remove-circle-outline', label: 'Remove from home', run: edit((l) => ({ ...l, home: l.home.filter((k) => k !== key) })) }
        : { icon: 'home-outline', label: 'Add to home', run: edit((l) => ({ ...l, home: [...l.home, key] })) }
    );

    if (inDock) {
      actions.push({ icon: 'remove-circle-outline', label: 'Remove from dock', run: edit((l) => ({ ...l, dock: l.dock.filter((k) => k !== key) })) });
    } else if (layout.dock.length < DOCK_LIMIT) {
      actions.push({ icon: 'add-circle-outline', label: 'Add to dock', run: edit((l) => ({ ...l, dock: [...l.dock, key] })) });
    }

    if (layout.edge.includes(key)) {
      actions.push({
        icon: 'remove-circle-outline',
        label: 'Remove from edge panel',
        run: edit((l) => ({ ...l, edge: l.edge.filter((k) => k !== key) })),
      });
    } else if (layout.edge.length < EDGE_APP_LIMIT) {
      actions.push({
        icon: 'albums-outline',
        label: 'Add to edge panel',
        run: edit((l) => ({ ...l, edge: [...l.edge, key] })),
      });
    }

    actions.push(
      {
        icon: 'eye-off-outline',
        label: 'Hide app',
        run: edit((l) => ({
          ...l,
          hidden: l.hidden.includes(key) ? l.hidden : [...l.hidden, key],
          home: l.home.filter((k) => k !== key),
          dock: l.dock.filter((k) => k !== key),
          edge: l.edge.filter((k) => k !== key),
        })),
      },
      { icon: 'information-circle-outline', label: 'App info', run: () => Launcher.openAppInfo(app.packageName) }
    );

    if (!app.isSystem) {
      actions.push({ icon: 'trash-outline', label: 'Uninstall', destructive: true, run: () => Launcher.uninstallApp(app.packageName) });
    }
  }

  return (
    <Modal visible={!!target} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={[styles.backdrop, { paddingBottom: insets.bottom + 16 }]} onPress={onClose}>
        {app && (
          <Pressable onPress={() => {}}>
            <Glass radius={28} style={[styles.sheet, { backgroundColor: palette.sheetBg }]}>
              <View style={styles.header}>
                {app.icon ? <Image source={{ uri: app.icon }} style={styles.icon} /> : null}
                <View style={styles.headerText}>
                  <Text numberOfLines={1} style={[styles.title, { color: palette.text }]}>
                    {app.label}
                  </Text>
                  <Text numberOfLines={1} style={[styles.pkg, { color: palette.subtext }]}>
                    {app.packageName}
                  </Text>
                </View>
              </View>
              {actions.map((a) => (
                <Pressable
                  key={a.label}
                  onPress={() => {
                    a.run();
                    onClose();
                  }}
                  style={({ pressed }) => [
                    styles.action,
                    { borderTopColor: palette.separator },
                    pressed && { backgroundColor: palette.chipBg },
                  ]}
                >
                  <Ionicons name={a.icon} size={20} color={a.destructive ? '#FF453A' : palette.accent} />
                  <Text style={[styles.actionText, { color: a.destructive ? '#FF453A' : palette.text }]}>{a.label}</Text>
                </Pressable>
              ))}
            </Glass>
          </Pressable>
        )}
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: 12,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  sheet: {
    paddingTop: 6,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
  },
  icon: {
    width: 44,
    height: 44,
    borderRadius: 14,
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: 18,
    fontFamily: 'sans-serif-medium',
  },
  pkg: {
    fontSize: 12,
    marginTop: 2,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  actionText: {
    fontSize: 16,
  },
});
