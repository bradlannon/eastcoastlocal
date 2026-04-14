import type { Config } from 'jest';

// jose is ESM-only — tell ts-jest to transform it rather than ignore it
const ESM_MODULES = ['jose'];
const transformIgnorePatterns = [
  `/node_modules/(?!(${ESM_MODULES.join('|')})/)`,
];

const config: Config = {
  projects: [
    {
      displayName: 'node',
      preset: 'ts-jest',
      testEnvironment: 'node',
      moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
      testMatch: ['<rootDir>/src/**/*.test.ts'],
      transformIgnorePatterns,
    },
    {
      displayName: 'jsdom',
      preset: 'ts-jest',
      testEnvironment: 'jsdom',
      moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
      testMatch: ['<rootDir>/src/**/*.test.tsx'],
      setupFilesAfterEnv: ['<rootDir>/jest.setup.jsdom.ts'],
    },
  ],
};

export default config;
