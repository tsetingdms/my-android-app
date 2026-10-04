import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Root } from './src/Root';
import { StoreProvider } from './src/store';

export default function App() {
  return (
    <SafeAreaProvider style={{ backgroundColor: 'transparent' }}>
      <StoreProvider>
        <Root />
      </StoreProvider>
    </SafeAreaProvider>
  );
}
