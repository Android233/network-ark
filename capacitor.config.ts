import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.networkark.app',
  appName: '人脉方舟',
  webDir: 'dist',
  // Android 配置
  android: {
    // 允许混合内容（WebView 加载本地资源）
    allowMixedContent: true,
    // 启用 WebView 调试（发布时可关闭）
    webContentsDebuggingEnabled: false,
  },
  server: {
    // 使用本地资源，无需远程服务器
    androidScheme: 'https',
  },
  // 应用图标和启动屏配置
  plugins: {
    SplashScreen: {
      // 原生开屏图显示 3000ms（与 Web 层自定义开屏衔接）
      launchShowDuration: 3000,
      backgroundColor: '#ffffff',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      androidSpinnerStyle: 'large',
      spinnerColor: '#3b82f6',
      // 禁用原生自动淡出，由 Web 层接管
      androidFadeOutDuration: 0,
    },
  },
}

export default config
