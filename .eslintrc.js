module.exports = {
  parser: '@typescript-eslint/parser',
  extends: ['plugin:@typescript-eslint/recommended', 'prettier'],
  parserOptions: {
    sourceType: 'module',
  },
  rules: {
    'prettier/prettier': 'error',
    "quotes": [2, "double", { "avoidEscape": true }]
  },
  plugins: ['@typescript-eslint', 'prettier'],
};
