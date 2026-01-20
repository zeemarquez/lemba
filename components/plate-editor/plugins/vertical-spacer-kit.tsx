'use client';

import type { TElement } from 'platejs';
import { createPlatePlugin } from 'platejs/react';

export const KEY_VERTICAL_SPACER = 'vertical_spacer';

export interface TVerticalSpacerElement extends TElement {
  type: typeof KEY_VERTICAL_SPACER;
  height: number; // Height in pixels
}

export const BaseVerticalSpacerPlugin = createPlatePlugin({
  key: KEY_VERTICAL_SPACER,
  node: {
    isElement: true,
    isVoid: true,
  },
});
