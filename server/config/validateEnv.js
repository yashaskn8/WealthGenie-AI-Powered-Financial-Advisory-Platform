/**
 * WealthGenie Environment & Security Configuration Validation
 *
 * Provides fail-closed validation for runtime configuration across
 * development, test, and production environments.
 */

export function validateEnvironmentConfig(env = process.env) {
  const isProduction = env.NODE_ENV === 'production';
  const errors = [];

  if (!env.JWT_SECRET || !env.JWT_SECRET.trim()) {
    errors.push('JWT_SECRET is required');
  }
  if (!env.MONGODB_URI || !env.MONGODB_URI.trim()) {
    errors.push('MONGODB_URI is required');
  }

  const jwtSecret = (env.JWT_SECRET || '').trim();
  const INSECURE_JWT_PLACEHOLDERS = [
    'CHANGE_ME',
    'default_jwt_secret',
    'super_secret_jwt',
    'your_64_char_hex',
    'ci-dev-jwt-secret',
    'secret',
  ];
  const isPlaceholderJwt = INSECURE_JWT_PLACEHOLDERS.some(p => jwtSecret.toLowerCase().includes(p.toLowerCase()));

  if (isProduction) {
    if (jwtSecret.length < 32) {
      errors.push('JWT_SECRET must be at least 32 characters in production');
    }
    if (isPlaceholderJwt) {
      errors.push('Insecure or placeholder JWT_SECRET detected in production environment');
    }
    if (!env.ML_SERVICE_API_KEY || !env.ML_SERVICE_API_KEY.trim()) {
      errors.push('ML_SERVICE_API_KEY is required in production');
    } else if (env.ML_SERVICE_API_KEY.startsWith('CHANGE_ME')) {
      errors.push('Insecure placeholder ML_SERVICE_API_KEY detected in production');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
