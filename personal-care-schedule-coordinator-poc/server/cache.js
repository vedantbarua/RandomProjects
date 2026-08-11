export async function createCache() {
  if (!process.env.REDIS_URL) return memoryCache();

  try {
    const { createClient } = await import("redis");
    const client = createClient({ url: process.env.REDIS_URL });
    client.on("error", () => {});
    await client.connect();
    return {
      mode: "redis",
      async get(key) {
        return client.get(key);
      },
      async set(key, value, ttlSeconds = 30) {
        await client.set(key, value, { EX: ttlSeconds });
      },
      async del(key) {
        await client.del(key);
      },
      async close() {
        await client.quit();
      }
    };
  } catch {
    return memoryCache();
  }
}

function memoryCache() {
  const store = new Map();
  return {
    mode: "memory",
    async get(key) {
      const entry = store.get(key);
      if (!entry) return null;
      if (entry.expiresAt <= Date.now()) {
        store.delete(key);
        return null;
      }
      return entry.value;
    },
    async set(key, value, ttlSeconds = 30) {
      store.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
    },
    async del(key) {
      store.delete(key);
    },
    async close() {
      store.clear();
    }
  };
}
