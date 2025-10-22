// For a detailed explanation regarding each configuration property, visit:
// https://jestjs.io/docs/en/configuration.html

module.exports = {
  // Automatically clear mock calls and instances between every test
  clearMocks: true,

  // Indicates whether the coverage information should be collected while executing the test
  collectCoverage: false,

  // The directory where Jest should output its coverage files
  coverageDirectory: 'coverage',

  // An array of directory names to be searched recursively up from the requiring module's location
  moduleDirectories: [
    "node_modules",
    "<rootDir>/src"
  ],

  // A map from regular expressions to module names that allow to stub out resources with a single module
  moduleNameMapper: {
    '\\.(css|less)$': '<rootDir>/__mocks__/styleMock.js',
    "\\.(jpg|jpeg|png|gif|eot|otf|webp|svg|ttf|woff|woff2|mp4|webm|wav|mp3|m4a|aac|oga)$": "<rootDir>/__mocks__/fileMock.js",
    "@app/(.*)": '<rootDir>/src/app/$1'
  },

  // A preset that is used as a base for Jest's configuration
  preset: "ts-jest/presets/js-with-ts",

  // The test environment that will be used for testing.
  testEnvironment: "jsdom",

  // The root directories that Jest should scan for tests and modules
  roots: ['<rootDir>/src'],

  // Test match patterns
  testMatch: ['**/__tests__/**/*.test.tsx', '**/__tests__/**/*.test.ts'],

  // Setup files to run after test environment is set up
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup.ts'],

  // Collect coverage from these files
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/__tests__/**'
  ],

  // Transform PatternFly modules and ESM-only packages
  transformIgnorePatterns: [
    'node_modules/(?!(@patternfly|p-limit|yocto-queue|uuid)/)'
  ]
};
