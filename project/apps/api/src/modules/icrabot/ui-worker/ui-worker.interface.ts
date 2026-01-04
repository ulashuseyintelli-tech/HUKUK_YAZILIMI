/**
 * UI WORKER INTERFACE (v17-v18)
 * 
 * UYAP UI otomasyon arayüzü.
 * MockUiWorker: Test için deterministik dummy data
 * RealUiWorker: Playwright/Selenium ile gerçek tarayıcı otomasyonu
 */

export interface UIWorkerResult {
  success: boolean;
  data?: Record<string, any>;
  error?: string;
  screenshot?: string; // Base64 encoded screenshot
}

export interface TableRow {
  [key: string]: string | number | boolean | null;
}

export interface IUIWorker {
  // Navigation
  navigate(navPath: string[]): Promise<UIWorkerResult>;
  
  // Click actions
  click(buttonKey: string): Promise<UIWorkerResult>;
  
  // Read operations
  readTable(tableKey: string, columnKeys?: string[]): Promise<UIWorkerResult>;
  readField(fieldKey: string): Promise<UIWorkerResult>;
  
  // Write operations
  fillForm(fields: Record<string, any>): Promise<UIWorkerResult>;
  selectRow(tableKey: string, rowIndex: number): Promise<UIWorkerResult>;
  
  // DSL v19 extensions
  waitFor(selectorKey: string, timeoutMs?: number): Promise<UIWorkerResult>;
  expectText(selectorKey: string, text: string, timeoutMs?: number): Promise<UIWorkerResult>;
  
  // DSL v20 extensions
  downloadFile(buttonKey: string): Promise<UIWorkerResult>;
  uploadFile(fieldKey: string, filePath: string): Promise<UIWorkerResult>;
  
  // Query operations
  query(input: Record<string, any>): Promise<UIWorkerResult>;
  
  // Screenshot
  captureScreenshot(): Promise<string | null>;
}

/**
 * Mock UI Worker - Test için deterministik dummy data döner
 */
export class MockUIWorker implements IUIWorker {
  async navigate(navPath: string[]): Promise<UIWorkerResult> {
    return { success: true, data: { navigated: navPath } };
  }

  async click(buttonKey: string): Promise<UIWorkerResult> {
    return { success: true, data: { clicked: buttonKey } };
  }

  async readTable(tableKey: string, columnKeys?: string[]): Promise<UIWorkerResult> {
    // Return mock table data
    const mockRows: TableRow[] = [
      { id: '1', dosyaNo: '2024/12345', durum: 'Aktif', tarih: '2024-01-15' },
      { id: '2', dosyaNo: '2024/12346', durum: 'Beklemede', tarih: '2024-01-16' },
    ];
    return { success: true, data: { rows: mockRows, rowCount: mockRows.length } };
  }

  async readField(fieldKey: string): Promise<UIWorkerResult> {
    return { success: true, data: { value: `mock_value_${fieldKey}` } };
  }

  async fillForm(fields: Record<string, any>): Promise<UIWorkerResult> {
    return { success: true, data: { filled: fields } };
  }

  async selectRow(tableKey: string, rowIndex: number): Promise<UIWorkerResult> {
    return { success: true, data: { selected: { table: tableKey, row: rowIndex } } };
  }

  async waitFor(selectorKey: string, timeoutMs = 5000): Promise<UIWorkerResult> {
    return { success: true, data: { waited: selectorKey, timeout: timeoutMs } };
  }

  async expectText(selectorKey: string, text: string, timeoutMs = 5000): Promise<UIWorkerResult> {
    return { success: true, data: { expected: { selector: selectorKey, text, found: true } } };
  }

  async downloadFile(buttonKey: string): Promise<UIWorkerResult> {
    return { success: true, data: { downloaded: buttonKey, path: '/tmp/mock_download.pdf' } };
  }

  async uploadFile(fieldKey: string, filePath: string): Promise<UIWorkerResult> {
    return { success: true, data: { uploaded: { field: fieldKey, file: filePath } } };
  }

  async query(input: Record<string, any>): Promise<UIWorkerResult> {
    return { success: true, data: { queried: input, results: [] } };
  }

  async captureScreenshot(): Promise<string | null> {
    return null; // Mock doesn't capture screenshots
  }
}
