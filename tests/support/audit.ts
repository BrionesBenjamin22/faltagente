import { expect, type Page } from '@playwright/test';

/** Reservation history remains available; only field-change history is private. */
export function trackChangeHistoryRequests(page: Page) {
  const requests: string[] = [];
  page.on('request', request => {
    const path = new URL(request.url()).pathname;
    if (/\/api\/v1\/(?:users\/me|matches\/[^/]+)\/history$/.test(path)) requests.push(path);
  });
  return requests;
}

export async function expectNoAuditSections(page: Page) {
  await expect(page.getByRole('heading', { name: 'Auditoría', exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Historial de cambios', exact: true })).toHaveCount(0);
}
