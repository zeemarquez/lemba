'use client';

import { createPlatePlugin } from 'platejs/react';
import { PlaceholderElement } from '@/components/plate-ui/placeholder-node';

export const KEY_PLACEHOLDER = 'placeholder';

export const PlaceholderPlugin = createPlatePlugin({
  key: KEY_PLACEHOLDER,
  node: {
    isElement: true,
    isInline: true,
    isVoid: true,
  },
  render: {
    node: PlaceholderElement,
  },
});
