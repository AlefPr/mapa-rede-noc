module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.js'],
  collectCoverageFrom: [
    'controllers/**/*.js',
    'middleware/**/*.js',
    'services/**/*.js',
    '!node_modules/**'
  ],
  coverageDirectory: 'coverage',
  verbose: true,
  forceExit: true,
  setupFiles: []
};
