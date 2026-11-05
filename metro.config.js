const path = require('path')
const { getDefaultConfig } = require('expo/metro-config')

// The package doesn't export its createLucideIcon helper; find the file beside its main entry.
const lucideMain = require.resolve('lucide-react-native', { paths: [__dirname] })
const createLucideIcon = path.join(path.dirname(lucideMain), '..', 'esm', 'createLucideIcon.mjs')

const config = getDefaultConfig(__dirname)

// Lucide's barrel makes Metro open ~1,700 icon files at once, past the open-file limit on Cloudflare's builder.
const { resolveRequest } = config.resolver
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'lucide-react-native') {
    return { type: 'sourceFile', filePath: path.resolve(__dirname, 'lucide-subset.js') }
  }
  if (moduleName === 'lucide-react-native-create-icon') {
    return { type: 'sourceFile', filePath: path.resolve(createLucideIcon) }
  }
  return (resolveRequest ?? context.resolveRequest)(context, moduleName, platform)
}

module.exports = config
