import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

/*
 * `globals: true` is deliberately off. `packages/shared` imports `describe`, `it`
 * and `expect` from `vitest` in every file, and one convention across the repo is
 * worth more than three saved import lines — so cleanup is wired up by hand here
 * rather than relying on Testing Library's automatic hook.
 */
afterEach(cleanup);
