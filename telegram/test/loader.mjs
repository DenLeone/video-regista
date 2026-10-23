export async function resolve(specifier, context, next) {
  if (specifier.startsWith('.') && !/\.(ts|js|mjs|json|css)$/.test(specifier)) {
    return next(specifier + '.ts', context);
  }
  return next(specifier, context);
}
