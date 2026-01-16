import { createPlatePlugin } from 'platejs/react';

export const ELEMENT_PAGE_BREAK = 'page_break';

export const PageBreakPlugin = createPlatePlugin({
  key: ELEMENT_PAGE_BREAK,
  isElement: true,
  isVoid: true,
});
