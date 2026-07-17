const PRIVATE_TOOL_ROUTES = new Set(['palang-ic', 'id-marking']);

export const isPrivateToolPath = (url: string) => {
  const pathname = url.split(/[?#]/, 1)[0];
  const segments = pathname.split('/').filter(Boolean);

  return (
    PRIVATE_TOOL_ROUTES.has(segments.at(-1) || '') ||
    segments.slice(-3).join('/') === 'palang-ic/desktop/success'
  );
};
