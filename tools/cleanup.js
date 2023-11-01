/* eslint-disable */
const fs = require('fs')
const Path = require('path')
/* eslint-enable */

const allowedDirectories = [Path.join(__dirname, '../dist')]; // Define allowed directories

const deleteFolderRecursive = (dirPath) => {
  const sanitizedPath = Path.resolve(dirPath);

  if (!allowedDirectories.some(directory => sanitizedPath.includes(directory))) {
    console.error('Invalid path.'); // Input path is not in the allowed directories
    return;
  }

  if (fs.existsSync(sanitizedPath)) {
    fs.readdirSync(sanitizedPath).forEach((file) => {
      const curPath = Path.join(sanitizedPath, file);
      if (fs.lstatSync(curPath).isDirectory()) {
        deleteFolderRecursive(curPath);
      } else {
        fs.unlinkSync(curPath);
      }
    });
    fs.rmdirSync(sanitizedPath);
  }
};

const folder = process.argv.slice(2)[0]

if (folder) {
  deleteFolderRecursive(Path.join(__dirname, '../dist', folder))
} else {
  deleteFolderRecursive(Path.join(__dirname, '../dist/cjs'))
  deleteFolderRecursive(Path.join(__dirname, '../dist/esm'))
  deleteFolderRecursive(Path.join(__dirname, '../dist/umd'))
  deleteFolderRecursive(Path.join(__dirname, '../dist/types'))
}
