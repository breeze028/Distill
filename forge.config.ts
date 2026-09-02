import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { VitePlugin } from '@electron-forge/plugin-vite';

const config = {
  packagerConfig: {
    asar: false,
    download: {
      mirrorOptions: {
        mirror: 'https://npmmirror.com/mirrors/electron/'
      }
    },
    extraResource: ['./src/main/database/migrations'],
    ignore: [
      /^\/src($|\/)/,
      /^\/tests($|\/)/,
      /^\/docs($|\/)/,
      /^\/python($|\/)/,
      /^\/\.git($|\/)/,
      /^\/coverage($|\/)/,
      /^\/playwright-report($|\/)/,
      /^\/test-results($|\/)/,
      /^\/test-fixtures($|\/)/
    ]
  },
  rebuildConfig: {},
  makers: [
    new MakerSquirrel({}),
    new MakerZIP({}, ['darwin']),
    new MakerRpm({}),
    new MakerDeb({})
  ],
  plugins: [
    new VitePlugin({
      build: [
        {
          entry: 'src/main/index.ts',
          config: 'vite.main.config.ts'
        },
        {
          entry: 'src/preload/index.ts',
          config: 'vite.preload.config.ts'
        }
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.ts'
        }
      ]
    })
  ]
};

export default config;
