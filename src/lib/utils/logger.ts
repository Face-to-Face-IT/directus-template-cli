import fs from 'node:fs'
import os from 'node:os'
import path from 'pathe'

class Logger {
  private static instance: Logger
  private logFilePath: string | undefined
  private initialized = false
  private disabled = false

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  private constructor() {}

  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger()
    }

    return Logger.instance
  }

  public log(level: 'error' | 'info' | 'warn', message: string, context?: Record<string, any>): void {
    if (this.disabled) return

    if (!this.initialized) {
      this.initializeLogFile()
    }

    if (this.disabled) return

    const timestamp = new Date().toISOString()
    const contextString = context ? JSON.stringify(this.sanitize(context)) : ''
    const logEntry = `${timestamp} - ${level.toUpperCase()}: ${message}${contextString ? ` Context: ${contextString}` : ''}\n`

    this.writeToFile(logEntry)
  }

  private resolveLogDir(): string {
    // 1. Explicit env var override
    const envDir = process.env.DIRECTUS_TEMPLATE_CLI_LOG_DIR
    if (envDir) return envDir

    // 2. Default: cwd-relative directory
    return path.join(process.cwd(), '.directus-template-cli', 'logs')
  }

  private initializeLogFile(): void {
    this.initialized = true

    // @ts-ignore - ignore
    const timestamp = new Date().toISOString().replaceAll(/[.:]/g, '-')

    let logDir = this.resolveLogDir()

    try {
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, {recursive: true})
      }
    } catch {
      // cwd-relative dir not writable — fall back to os.tmpdir()
      const fallbackDir = path.join(os.tmpdir(), 'directus-template-cli', 'logs')
      try {
        if (!fs.existsSync(fallbackDir)) {
          fs.mkdirSync(fallbackDir, {recursive: true})
        }

        logDir = fallbackDir
      } catch {
        // Neither location is writable — disable file logging silently
        this.disabled = true
        return
      }
    }

    this.logFilePath = path.join(logDir, `run-${timestamp}.log`)

    // Write initial timestamp to the log file
    this.writeToFile(`Log started at ${timestamp}\n`)
  }

  private sanitize(obj: Record<string, any>): Record<string, any> {
    const sensitiveFields = new Set([
      'access_token',
      'authorization',
      'email',
      'key',
      'password',
      'refresh_token',
      'secret',
      'token',
    ])
    return Object.fromEntries(
      Object.entries(obj).map(([key, value]) => {
        if (sensitiveFields.has(key.toLowerCase())) {
          return [key, '********']
        }

        if (typeof value === 'object' && value !== null) {
          return [key, this.sanitize(value)]
        }

        return [key, value]
      }),
    )
  }

  private writeToFile(message: string): void {
    if (!this.logFilePath) return
    try {
      fs.appendFileSync(this.logFilePath, message)
    } catch {
      // File became unwritable after init — disable to avoid repeated errors
      this.disabled = true
    }
  }
}

export const logger = Logger.getInstance()
