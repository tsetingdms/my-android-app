import { registerRootComponent } from 'expo';
import { AppRegistry } from 'react-native';

import App from './App';
import { LockRoot } from './src/lock/LockScreen';
import { EdgeRoot } from './src/overlay/EdgeRoot';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);

// Shown over Android's lock screen by LockScreenActivity (modules/launcher) when enabled in Customize.
AppRegistry.registerComponent('lock', () => LockRoot);

// The edge panel on top of other apps, shown by EdgeActivity when the floating edge bar is used.
AppRegistry.registerComponent('edge', () => EdgeRoot);
