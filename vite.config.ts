import { rmSync } from 'node:fs';
import { defineConfig } from 'vite';

// GitHub Pages serves the site from /dwarf-sim/; locally it is served from /
export default defineConfig({
  base: process.env.PAGES_BASE || '/',
  plugins: [
    {
      // your own copy of the Dwarf Fortress theme plays in `npm run dev`, but is never published
      name: 'keep-df-theme-local',
      apply: 'build',
      closeBundle() {
        rmSync('dist/music/theme.mp3', { force: true });
      },
    },
  ],
});
