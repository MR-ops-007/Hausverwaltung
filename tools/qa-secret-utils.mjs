export function redactSecret(value, secret) {
  const text = String(value ?? '');
  const token = String(secret ?? '');
  return token ? text.split(token).join('[REDACTED]') : text;
}
