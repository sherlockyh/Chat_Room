/** 启动时校验必需配置，避免服务带着缺失凭据运行。 */
export function validateEnv(env: Record<string, unknown>) {
  for (const key of [
    'DATABASE_URL',
    'REDIS_URL',
    'JWT_SECRET',
    'MINIO_ENDPOINT',
    'MINIO_ACCESS_KEY',
    'MINIO_SECRET_KEY',
    'MINIO_BUCKET',
    'WEB_ORIGIN',
  ]) {
    if (typeof env[key] !== 'string' || !String(env[key]).trim()) {
      throw new Error('缺少环境变量：' + key);
    }
  }
  if (String(env.JWT_SECRET).length < 32) throw new Error('JWT_SECRET 至少需要 32 个字符');
  for (const key of ['PORT', 'MINIO_PORT']) {
    const value = Number(env[key] ?? (key === 'PORT' ? 3000 : 9000));
    if (!Number.isInteger(value) || value < 1 || value > 65535)
      throw new Error(key + ' 必须是有效端口');
  }
  return env;
}
