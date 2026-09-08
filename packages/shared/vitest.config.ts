import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        // Where the app is used. Turkey has been on permanent GMT+3 since 2016,
        // which is why it cannot be the zone that proves anything about DST.
        test: {
          name: 'local',
          env: { TZ: 'Europe/Istanbul' },
          include: ['src/**/*.test.ts'],
          exclude: ['src/**/*.dst.test.ts'],
        },
      },
      {
        // A zone that does change its clocks, so the recurrence code can actually
        // be run across one. Recurrence is the part of the app where DST bugs live.
        test: {
          name: 'dst',
          env: { TZ: 'Europe/London' },
          include: ['src/**/*.dst.test.ts'],
        },
      },
    ],
  },
});
