import fs from 'fs'
import dotenv from 'dotenv'

export const REFRESH_TOKEN_KEY = 'REFRESH_TOKEN'

/**
 * Reads the refresh token from environment variables
 */
export function getRefreshTokenFromEnv() {
  return process.env[REFRESH_TOKEN_KEY] || ''
}

/**
 * Writes/updates the refresh token in the .env file
 */
export function updateRefreshTokenInEnv(newRefreshToken) {
  const envFilePath = '.env'
  const envVariables = fs.readFileSync(envFilePath, 'utf8').split('\n')
  let replaced = false

  const updatedEnvVariables = envVariables.map((line) => {
    if (line.startsWith(`${REFRESH_TOKEN_KEY}=`)) {
      replaced = true
      return `${REFRESH_TOKEN_KEY}=${newRefreshToken}`
    }
    return line
  })

  if (!replaced) {
    updatedEnvVariables.push(`${REFRESH_TOKEN_KEY}=${newRefreshToken}`)
  }

  fs.writeFileSync(envFilePath, updatedEnvVariables.join('\n'), 'utf8')
  console.log('Updated refresh token in .env file')
}
