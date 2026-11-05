// The API returns account metadata; browser fixtures never need Google tokens.
export async function mockGoogleAccounts(route) {
  if (new URL(route.request().url()).pathname !== '/api/google/accounts'
    || route.request().method() !== 'GET') return false;
  const accounts = await route.request().frame().evaluate(() => {
    const records = JSON.parse(localStorage.getItem('unplan:google-accounts:v2') || '[]');
    return records.map(({ id, email, status = 'active' }) => ({ id, email, status }));
  });
  await route.fulfill({ json: { accounts } });
  return true;
}
