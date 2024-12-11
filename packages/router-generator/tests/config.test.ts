import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { getConfig, resolveConfigPath } from '../src'

function makeFolderDir(folder: string) {
  return join(process.cwd(), 'tests', 'config', folder)
}

type TestCases = Array<{
  folder: string;
  configFile: string;
}>

describe('load config tests', () => {
  it.each([
    // {
    //   configFile: 'tsr.config.json',
    //   folder: 'json-config',
    // },
    {
      configFile: 'tsr.config.js',
      folder: 'js-config-module'
    }
  ] satisfies TestCases)(
    'should load config correctly: $folder',
    async ({ configFile, folder }) => {
      const absPath = makeFolderDir(folder)

      expect(resolveConfigPath({ configDirectory: absPath })).toBe(join(absPath, configFile));
      const resolvedConfig = await getConfig({}, absPath)
      expect(resolvedConfig).toEqual(
        expect.objectContaining({
          disableLogging: true,
          routesDirectory: join(absPath, './configured-routes-path'),
          generatedRouteTree: join(absPath, './routeTree.gen.ts'),
        }),
      )
    },
  )
})
