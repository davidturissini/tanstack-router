import path from 'node:path'
import { existsSync, readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { tsImport } from 'tsx/esm/api'
import { z } from 'zod'
import { virtualRootRouteSchema } from './filesystem/virtual/config'

const defaultTemplate = {
  routeTemplate: [
    '%%tsrImports%%',
    '\n\n',
    '%%tsrExportStart%%{\n component: RouteComponent\n }%%tsrExportEnd%%\n\n',
    'function RouteComponent() { return <div>Hello "%%tsrPath%%"!</div> };\n',
  ].join(''),
  apiTemplate: [
    'import { json } from "@tanstack/start";\n',
    '%%tsrImports%%',
    '\n\n',
    '%%tsrExportStart%%{ GET: ({ request, params }) => { return json({ message:\'Hello "%%tsrPath%%"!\' }) }}%%tsrExportEnd%%\n',
  ].join(''),
}

export const configSchema = z.object({
  virtualRouteConfig: virtualRootRouteSchema.or(z.string()).optional(),
  routeFilePrefix: z.string().optional(),
  routeFileIgnorePrefix: z.string().optional().default('-'),
  routeFileIgnorePattern: z.string().optional(),
  routesDirectory: z.string().optional().default('./src/routes'),
  generatedRouteTree: z.string().optional().default('./src/routeTree.gen.ts'),
  quoteStyle: z.enum(['single', 'double']).optional().default('single'),
  semicolons: z.boolean().optional().default(false),
  disableTypes: z.boolean().optional().default(false),
  addExtensions: z.boolean().optional().default(false),
  disableLogging: z.boolean().optional().default(false),
  disableManifestGeneration: z.boolean().optional().default(false),
  apiBase: z.string().optional().default('/api'),
  routeTreeFileHeader: z
    .array(z.string())
    .optional()
    .default([
      '/* eslint-disable */',
      '// @ts-nocheck',
      '// noinspection JSUnusedGlobalSymbols',
    ]),
  routeTreeFileFooter: z.array(z.string()).optional().default([]),
  autoCodeSplitting: z.boolean().optional(),
  indexToken: z.string().optional().default('index'),
  routeToken: z.string().optional().default('route'),
  pathParamsAllowedCharacters: z
    .array(z.enum([';', ':', '@', '&', '=', '+', '$', ',']))
    .optional(),
  customScaffolding: z
    .object({
      routeTemplate: z
        .string()
        .optional()
        .default(defaultTemplate.routeTemplate),
      apiTemplate: z.string().optional().default(defaultTemplate.apiTemplate),
    })
    .optional()
    .default(defaultTemplate),
  experimental: z
    .object({
      // TODO: Remove this option in the next major release (v2).
      enableCodeSplitting: z.boolean().optional(),
    })
    .optional(),
})

export type Config = z.infer<typeof configSchema>

type ResolveParams = {
  configDirectory: string
}

export function resolveConfigPath({ configDirectory }: ResolveParams) {
  const jsConfigPath = path.resolve(configDirectory, 'tsr.config.js');
  const jsonConfigPath = path.resolve(configDirectory, 'tsr.config.json');

  if (existsSync(jsonConfigPath) === true) {
    return jsonConfigPath;
  }

  if (existsSync(jsConfigPath) === true) {
    return jsConfigPath;
  }

  return undefined;
}

const readConfig: Record<string, (path: string) => Promise<Config>> = {
  '.json': (configFilePathJson: string) => {
    return JSON.parse(readFileSync(configFilePathJson, 'utf-8'));
  },
  '.js': async (configFilePathJs: string) => {
    const fileURL = pathToFileURL(configFilePathJs).href
    
    const { default: configImport } = await tsImport(fileURL, './');
    return configImport;
  }
};

export async function getConfig(
  inlineConfig: Partial<Config> = {},
  configDirectory?: string,
): Promise<Config> {
  if (configDirectory === undefined) {
    configDirectory = process.cwd()
  }
  const configFilePath = resolveConfigPath({ configDirectory })

  let config: Config | undefined;

  if (configFilePath !== undefined) {
    const extname = path.extname(configFilePath);
    const configLoader = readConfig[extname];
    if (configLoader !== undefined) {
      const fileSystemConfig = await configLoader(configFilePath);

      config = configSchema.parse({
        ...fileSystemConfig,
        ...inlineConfig,
      })
    }
  }

  if (config === undefined) {
    config = configSchema.parse(inlineConfig);
  }

  // If typescript is disabled, make sure the generated route tree is a .js file
  if (config.disableTypes) {
    config.generatedRouteTree = config.generatedRouteTree.replace(
      /\.(ts|tsx)$/,
      '.js',
    )
  }

  // if a configDirectory is used, paths should be relative to that directory
  if (configDirectory) {
    // if absolute configDirectory is provided, use it as the root
    if (path.isAbsolute(configDirectory)) {
      config.routesDirectory = path.resolve(
        configDirectory,
        config.routesDirectory,
      )
      config.generatedRouteTree = path.resolve(
        configDirectory,
        config.generatedRouteTree,
      )
    } else {
      config.routesDirectory = path.resolve(
        process.cwd(),
        configDirectory,
        config.routesDirectory,
      )
      config.generatedRouteTree = path.resolve(
        process.cwd(),
        configDirectory,
        config.generatedRouteTree,
      )
    }
  }

  validateConfig(config)
  return config
}

function validateConfig(config: Config) {
  if (typeof config.experimental?.enableCodeSplitting !== 'undefined') {
    const message = `
------
⚠️ ⚠️ ⚠️
ERROR: The "experimental.enableCodeSplitting" flag has been made stable and is now "autoCodeSplitting". Please update your configuration file to use "autoCodeSplitting" instead of "experimental.enableCodeSplitting".
------
`
    console.error(message)
    throw new Error(message)
  }

  if (config.indexToken === config.routeToken) {
    throw new Error(
      `The "indexToken" and "routeToken" options must be different.`,
    )
  }

  if (
    config.routeFileIgnorePrefix &&
    config.routeFileIgnorePrefix.trim() === '_'
  ) {
    throw new Error(
      `The "routeFileIgnorePrefix" cannot be an underscore ("_"). This is a reserved character used to denote a pathless route. Please use a different prefix.`,
    )
  }

  return config
}
