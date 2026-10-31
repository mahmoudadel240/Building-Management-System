// Edge Functions answer errors with a non-2xx status and a JSON body { error }.
// supabase-js only says "non-2xx status"; read the real message from the response.
export async function errorText(e) {
  if (!e) return '';
  try {
    if (e.context && typeof e.context.json === 'function') {
      const body = await e.context.clone().json();
      if (body?.error) return body.error;
    }
  } catch { /* fall back to the generic message */ }
  return e.message || '';
}
