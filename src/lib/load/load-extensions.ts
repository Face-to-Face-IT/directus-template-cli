import {customEndpoint, readExtensions} from '@directus/sdk'
import {ux} from '@oclif/core'

import type {Extension, InstalledExtension} from '../types/extension.js'

import {DIRECTUS_PINK} from '../constants.js'
import {api} from '../sdk.js'
import catchError from '../utils/catch-error.js'
import readFile from '../utils/read-file.js'

async function installExtension(extension: any): Promise<void> {
  await api.client.request(customEndpoint({
    body: JSON.stringify({
      extension: extension.id,
      version: extension.version,
    }),
    method: 'POST',
    path: '/extensions/registry/install',
  }))
}

export default async function loadExtensions(dir: string): Promise<void> {
  ux.action.start(ux.colorize(DIRECTUS_PINK, 'Loading extensions'))

  try {
    const extensions: Extension[] = readFile('extensions', dir)

    if (extensions && extensions.length > 0) {
      // Cast to InstalledExtension[] since SDK's DirectusExtension type is incomplete
      const installedExtensions = await api.client.request(readExtensions()) as unknown as InstalledExtension[]

      const registryExtensions = extensions.filter(ext => ext.meta?.source === 'registry' && !ext.bundle)
      const bundles = [...new Set(extensions.filter(ext => ext.bundle).map(ext => ext.bundle))]
      const localExtensions = extensions.filter(ext => ext.meta?.source === 'local')

      const extensionsToInstall = extensions.filter(ext => {
        if (ext.meta?.source !== 'registry' || ext.bundle) {
          return false
        }
        // Check if extension is already installed by ID or by schema name
        const alreadyInstalled = installedExtensions.some((installed) => {
          // Match by ID
          if (installed.id === ext.id) return true
          // Match by schema name (for pre-baked extensions in Docker image)
          if (installed.schema?.name && installed.schema.name === ext.schema?.name) return true
          // Match by folder name containing the package name
          if (ext.schema?.name && installed.meta?.folder?.includes(ext.schema.name.replace('/', '__'))) return true
          return false
        })
        return !alreadyInstalled
      })

      ux.stdout(`Found ${extensions.length} extensions total: ${registryExtensions.length} registry extensions (including ${bundles.length} bundles), and ${localExtensions.length} local extensions`)

      if (extensionsToInstall.length > 0) {
        ux.action.start(ux.colorize(DIRECTUS_PINK, `Installing ${extensionsToInstall.length} extensions`))

        // Install extensions sequentially to avoid overwhelming the server
        let installed = 0
        let failed = 0
        for (const ext of extensionsToInstall) {
          try {
            // Use UUID from template as the extension ID (required by directus_extensions table)
            const extensionId = ext.id
            // Construct version_id: @scope__package@version (replace / with __ in package name)
            const versionId = ext.schema?.name && ext.schema?.version
              ? `${ext.schema.name.replace(/\//g, '__')}@${ext.schema.version}`
              : ext.meta?.folder
            await installExtension({
              id: extensionId,
              version: versionId,
            })
            ux.stdout(`-- Installed ${ext.schema?.name}`)
            installed++
          } catch (error) {
            catchError(error, {
              context: {operation: 'load_extensions'},
              fatal: false,
            })
            ux.stdout(`-- Failed to install ${ext.schema?.name}`)
            failed++
          }
        }

        ux.action.stop()
        ux.stdout(`Finished installing extensions: ${installed} succeeded, ${failed} failed`)
      } else {
      // All extensions are already installed
        ux.stdout('All extensions are already installed')
      }

      if (localExtensions.length > 0) {
        ux.stdout(`Note: ${localExtensions.length} local extensions need to be installed manually.`)
      }
    }
  } catch {
    ux.stdout(`${ux.colorize('dim', '--')} No extensions found or extensions file is empty. Skipping extension installation.`)
  }

  ux.action.stop()
}
