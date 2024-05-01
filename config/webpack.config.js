const path = require('path');

module.exports = {
  mode: 'production',
  entry: './src/index.ts',
  output: {
    path: path.resolve(__dirname, '../dist/umd'),
    filename: 'index.js',
    library: 'mdns-listener-advanced',
    libraryTarget: 'umd',
    globalObject: 'this',
  },
  module: {
    rules: [
      {
        test: /\.ts(x*)?$/,
        exclude: /node_modules/,
        use: {
          loader: 'ts-loader',
          options: {
            configFile: 'config/tsconfig.umd.json',
          },
        },
      },
    ],
  },
  resolve: {
    extensions: ['.ts', '.js', '.tsx', '.jsx'],
    mainFields: ['browser', 'module', 'main'],
    alias: {
      '@mdns-listener': path.resolve(__dirname, '../src/'),
    },
    fallback: {
      util: require.resolve("util/"),
      "path": require.resolve("path-browserify"),
      fs: false,
      os: false,
      buffer: false,
      dgram: false,
    },
  },
};
