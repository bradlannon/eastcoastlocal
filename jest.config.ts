import type { Config } from 'jest';

const config: Config = {
  projects: [
    {
      displayName: 'node',
      preset: 'ts-jest',
      testEnvironment: 'node',
      moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
      testMatch: ['<rootDir>/src/**/*.test.ts'],
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
