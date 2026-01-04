/**
 * LOCATOR RESOLVER SERVICE (v18)
 * 
 * UiMapBundle içindeki locator_bindings anahtarlarını
 * gerçek CSS/XPath selector'lara çevirir.
 */

import { Injectable, Logger } from '@nestjs/common';

export interface LocatorBindings {
  buttons?: Record<string, string>;
  tables?: Record<string, string>;
  fields?: Record<string, string>;
  links?: Record<string, string>;
  labels?: Record<string, string>;
}

export interface UiMapScreen {
  screen_id: string;
  nav_path?: string[];
  locator_bindings?: LocatorBindings;
  table?: {
    selector: string;
    column_keys?: string[];
  };
}

export interface UiMapContent {
  screens?: UiMapScreen[];
  global_bindings?: LocatorBindings;
}

@Injectable()
export class LocatorResolverService {
  private readonly logger = new Logger(LocatorResolverService.name);

  /**
   * Resolve a button key to its CSS selector
   */
  resolveButton(uiMap: UiMapContent, buttonKey: string, screenId?: string): string | null {
    // Try screen-specific first
    if (screenId) {
      const screen = uiMap.screens?.find(s => s.screen_id === screenId);
      if (screen?.locator_bindings?.buttons?.[buttonKey]) {
        return screen.locator_bindings.buttons[buttonKey];
      }
    }

    // Fall back to global
    return uiMap.global_bindings?.buttons?.[buttonKey] || null;
  }

  /**
   * Resolve a table key to its CSS selector
   */
  resolveTable(uiMap: UiMapContent, tableKey: string, screenId?: string): string | null {
    if (screenId) {
      const screen = uiMap.screens?.find(s => s.screen_id === screenId);
      if (screen?.locator_bindings?.tables?.[tableKey]) {
        return screen.locator_bindings.tables[tableKey];
      }
    }

    return uiMap.global_bindings?.tables?.[tableKey] || null;
  }

  /**
   * Resolve a field key to its CSS selector
   */
  resolveField(uiMap: UiMapContent, fieldKey: string, screenId?: string): string | null {
    if (screenId) {
      const screen = uiMap.screens?.find(s => s.screen_id === screenId);
      if (screen?.locator_bindings?.fields?.[fieldKey]) {
        return screen.locator_bindings.fields[fieldKey];
      }
    }

    return uiMap.global_bindings?.fields?.[fieldKey] || null;
  }

  /**
   * Resolve any locator key by type
   */
  resolve(
    uiMap: UiMapContent,
    type: 'button' | 'table' | 'field' | 'link' | 'label',
    key: string,
    screenId?: string,
  ): string | null {
    switch (type) {
      case 'button':
        return this.resolveButton(uiMap, key, screenId);
      case 'table':
        return this.resolveTable(uiMap, key, screenId);
      case 'field':
        return this.resolveField(uiMap, key, screenId);
      case 'link':
        return this.resolveLink(uiMap, key, screenId);
      case 'label':
        return this.resolveLabel(uiMap, key, screenId);
      default:
        return null;
    }
  }

  private resolveLink(uiMap: UiMapContent, linkKey: string, screenId?: string): string | null {
    if (screenId) {
      const screen = uiMap.screens?.find(s => s.screen_id === screenId);
      if (screen?.locator_bindings?.links?.[linkKey]) {
        return screen.locator_bindings.links[linkKey];
      }
    }
    return uiMap.global_bindings?.links?.[linkKey] || null;
  }

  private resolveLabel(uiMap: UiMapContent, labelKey: string, screenId?: string): string | null {
    if (screenId) {
      const screen = uiMap.screens?.find(s => s.screen_id === screenId);
      if (screen?.locator_bindings?.labels?.[labelKey]) {
        return screen.locator_bindings.labels[labelKey];
      }
    }
    return uiMap.global_bindings?.labels?.[labelKey] || null;
  }

  /**
   * Get table column keys for structured parsing
   */
  getTableColumnKeys(uiMap: UiMapContent, screenId: string): string[] | null {
    const screen = uiMap.screens?.find(s => s.screen_id === screenId);
    return screen?.table?.column_keys || null;
  }

  /**
   * Find screen by navigation path
   */
  findScreenByNavPath(uiMap: UiMapContent, navPath: string[]): UiMapScreen | null {
    const navPathStr = navPath.join(' > ');
    return uiMap.screens?.find(s => s.nav_path?.join(' > ') === navPathStr) || null;
  }
}
