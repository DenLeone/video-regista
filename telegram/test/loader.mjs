export async function resolve(specifier, context, next) {
  if (specifier.startsWith('.') && !/\.(ts|js|mjs|json|css)$/.test(specifier)) {
    return next(specifier + '.ts', context);
  }
  // il Worker importa i JSON di scripts/ senza attributi (ci pensa il bundler): Node li vuole
  if (specifier.endsWith('.json')) {
    const r = await next(specifier, context);
    return { ...r, importAttributes: { ...(r.importAttributes || {}), type: 'json' } };
  }
  return next(specifier, context);
}
