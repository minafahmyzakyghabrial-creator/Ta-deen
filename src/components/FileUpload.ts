import { expect, Locator } from '@playwright/test';
import path from 'path';
import { BaseComponent } from './BaseComponent';

/**
 * File upload. OutSystems upload widgets render a (often hidden) <input type="file">;
 * setInputFiles works on hidden inputs, so no clicking on styled buttons is needed.
 *
 * Usage: new FileUpload(page.getByTestId('commercial-register-upload')).upload('test-data/files/cr.pdf')
 */
export class FileUpload extends BaseComponent {
  private get input(): Locator {
    return this.root.locator('input[type="file"]').first();
  }

  async upload(...relativePaths: string[]): Promise<void> {
    const files = relativePaths.map((p) => path.resolve(process.cwd(), p));
    await this.input.setInputFiles(files);
  }

  async clear(): Promise<void> {
    await this.input.setInputFiles([]);
  }

  async expectFileName(name: string | RegExp): Promise<void> {
    await expect(this.root).toContainText(name);
  }
}
