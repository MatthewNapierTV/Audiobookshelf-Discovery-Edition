const axios = require('axios').default
const { LRUCache } = require('lru-cache')
const Logger = require('../Logger')

// Shared response cache for the public book catalogs used by the storefront/home feed
const cache = new LRUCache({ max: 800, ttl: 6 * 60 * 60 * 1000 })

/**
 * GET a JSON document with caching. Errors are logged and resolve to null so that one failing
 * catalog never breaks the whole home screen.
 *
 * @param {string} url
 * @param {{ timeout?: number, ttl?: number, label?: string }} [options]
 * @returns {Promise<any|null>}
 */
async function cachedGetJson(url, options = {}) {
  const cached = cache.get(url)
  if (cached) return cached
  try {
    Logger.debug(`[${options.label || 'Catalog'}] GET ${url}`)
    const response = await axios.get(url, { timeout: options.timeout || 15000, headers: { Accept: 'application/json' } })
    if (response.data) cache.set(url, response.data, options.ttl ? { ttl: options.ttl } : undefined)
    return response.data || null
  } catch (error) {
    Logger.error(`[${options.label || 'Catalog'}] Request failed "${url}": ${error.message}`)
    return null
  }
}

module.exports = { cachedGetJson, cache }
