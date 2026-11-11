import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.pikidelivery.partners',
  appName: "PIKI Partner Orders",
  webDir: 'dist',
  server: { androidScheme: 'https', cleartext: false }
};

export default config;
