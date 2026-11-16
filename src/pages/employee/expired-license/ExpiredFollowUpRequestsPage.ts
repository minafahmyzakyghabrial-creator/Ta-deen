import { expect } from '@playwright/test';
import { ExpiredFollowUpList } from './ExpiredFollowUpList';
import { ExpiredRequestDetailsPage } from './ExpiredRequestDetailsPage';

/**
 * UC-002 — Request Management → tab "متابعة رخص منتهية" (/Licenses/RequestsManagement).
 * The tab is role="tab" (not a button). Row menu has one item: "استعراض" (view, new tab).
 */
export class ExpiredFollowUpRequestsPage extends ExpiredFollowUpList {
  async open(): Promise<void> {
    if (!/\/Licenses\/RequestsManagement/.test(this.page.url())) {
      await this.page.goto(new URL('/Licenses/RequestsManagement', this.page.url()).toString());
    }
    await this.page.waitForLoadState('networkidle').catch(() => {});
    await this.page.getByRole('tab', { name: 'متابعة رخص منتهية' }).filter({ visible: true }).first().click();
    await expect(this.panel).toBeVisible({ timeout: 150_000 });
    await this.page.waitForTimeout(3_000);
  }

  async view(requestNumber: string): Promise<ExpiredRequestDetailsPage> {
    const actions = await this.menu(requestNumber).actions();
    return this.openInNewTab(requestNumber, actions.find((a) => /^(عرض|استعراض)$/.test(a)) ?? 'استعراض');
  }
}
