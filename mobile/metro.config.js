const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const projectRoot = __dirname;
// The repo's shared/ dir lives OUTSIDE mobile/. Metro can only bundle files it
// watches, and only resolves aliases it's told about — tsconfig paths don't
// reach Metro. So watch shared/ and alias `@shared` → ../shared for runtime
// imports (type-only @shared/types imports were erased before bundling; real
// value modules like @shared/fotmob-player-stats need this).
const sharedRoot = path.resolve(projectRoot, '..', 'shared');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [...(config.watchFolders || []), sharedRoot];
config.resolver = config.resolver || {};
config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules || {}),
  '@shared': sharedRoot,
};

module.exports = withNativeWind(config, { input: './global.css' });
