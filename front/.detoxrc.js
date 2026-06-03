/** @type {Detox.DetoxConfig} */
module.exports = {
  testRunner: {
    args: {
      '$0': 'jest',
      config: 'e2e/jest.config.js'
    },
    jest: {
      setupTimeout: 120000
    }
  },
  apps: {
    'ios.debug': {
      type: 'ios.app',
      binaryPath: '/Users/paulshippy/Library/Developer/Xcode/DerivedData/SyftLearning-adljxxppljrhptgqtkepkgveclzf/Build/Products/Debug-iphonesimulator/SyftLearning.app',
      build: 'xcodebuild -project ios/SyftLearning.xcodeproj -scheme SyftLearning -configuration Debug -sdk iphonesimulator -derivedDataPath ~/Library/Developer/Xcode/DerivedData/SyftLearning-adljxxppljrhptgqtkepkgveclzf ARCHS=arm64 ONLY_ACTIVE_ARCH=YES'
    },
    'ios.release': {
      type: 'ios.app',
      binaryPath: '/Users/paulshippy/Library/Developer/Xcode/DerivedData/SyftLearning-adljxxppljrhptgqtkepkgveclzf/Build/Products/Release-iphonesimulator/SyftLearning.app',
      build: 'xcodebuild -project ios/SyftLearning.xcodeproj -scheme SyftLearning -configuration Release -sdk iphonesimulator -derivedDataPath ~/Library/Developer/Xcode/DerivedData/SyftLearning-adljxxppljrhptgqtkepkgveclzf ARCHS=arm64 ONLY_ACTIVE_ARCH=YES'
    },
    'android.debug': {
      type: 'android.apk',
      binaryPath: 'android/app/build/outputs/apk/debug/app-debug.apk',
      build: 'cd android && ./gradlew assembleDebug assembleAndroidTest -DtestBuildType=debug',
      reversePorts: [
        8081
      ]
    },
    'android.release': {
      type: 'android.apk',
      binaryPath: 'android/app/build/outputs/apk/release/app-release.apk',
      build: 'cd android && ./gradlew assembleRelease assembleAndroidTest -DtestBuildType=release'
    }
  },
  devices: {
    simulator: {
      type: 'ios.simulator',
      device: {
        type: 'iPhone 16 Pro'
      }
    },
    attached: {
      type: 'android.attached',
      device: {
        adbName: '.*'
      }
    },
    emulator: {
      type: 'android.emulator',
      device: {
        avdName: 'Pixel_3a_API_30_x86'
      }
    }
  },
  configurations: {
    'ios.sim.debug': {
      device: 'simulator',
      app: 'ios.debug'
    },
    'ios.sim.release': {
      device: 'simulator',
      app: 'ios.release'
    },
    'android.att.debug': {
      device: 'attached',
      app: 'android.debug'
    },
    'android.att.release': {
      device: 'attached',
      app: 'android.release'
    },
    'android.emu.debug': {
      device: 'emulator',
      app: 'android.debug'
    },
    'android.emu.release': {
      device: 'emulator',
      app: 'android.release'
    }
  }
};
