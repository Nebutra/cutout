const secretName = /(?:^|_)(?:api_?key|token|secret|password|credential|private_?key)(?:_|$)/i;
export function controlledEnvironment(input: Record<string, string | undefined>, allowedNames: readonly string[]) {
  const output: Record<string, string> = {};
  for (const name of allowedNames) {
    if (secretName.test(name)) throw new Error(`policy-denied: Secret-shaped environment variable is not allowed: ${name}`);
    const value = input[name];
    if (value !== undefined) output[name] = value;
  }
  return Object.freeze(output);
}
