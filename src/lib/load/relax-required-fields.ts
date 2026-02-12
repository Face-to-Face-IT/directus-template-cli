import {updateField} from '@directus/sdk'
import {ux} from '@oclif/core'

import {DIRECTUS_PINK} from '../constants.js'
import {api} from '../sdk.js'
import catchError from '../utils/catch-error.js'
import readFile from '../utils/read-file.js'

export default async function relaxRequiredFields(dir: string) {
  const fieldsToRelax = readFile('fields', dir).filter(
    (field) => field.meta?.required === true || field.schema?.is_nullable === false || field.schema?.is_unique === true,
  )

  ux.action.start(ux.colorize(DIRECTUS_PINK, `Temporarily relaxing constraints on ${fieldsToRelax.length} fields`))

  for await (const field of fieldsToRelax) {
    try {
      const payload: {meta?: Record<string, unknown>; schema?: Record<string, unknown>} = {}

      if (field.meta?.required === true) {
        payload.meta = {...field.meta, required: false}
      }

      if (field.schema?.is_nullable === false || field.schema?.is_unique === true) {
        payload.schema = {
          ...field.schema,
          ...(field.schema.is_nullable === false ? {is_nullable: true} : {}),
          ...(field.schema.is_unique === true ? {is_unique: false} : {}),
        }
      }

      await api.client.request(updateField(field.collection, field.field, payload))
    } catch (error) {
      catchError(error)
    }
  }

  ux.action.stop()
}
