'use client';

import { createPlatePlugin } from 'platejs/react';
import { KEYS, type TElement } from 'platejs';

// Get the next available figure ID
const getNextFigureId = (editor: any): string => {
  const ids = new Set<string>();
  
  // Traverse all nodes to find existing figure IDs
  try {
    const nodes = editor.api.nodes({
      at: [],
      match: (n: any) => n.type === KEYS.img || n.type === 'img',
    });
    
    for (const [node] of nodes) {
      if (node.id) {
        ids.add(node.id as string);
      }
    }
  } catch (e) {
    // If api.nodes fails, continue with empty set
  }
  
  let index = 1;
  while (ids.has(`fig-${index}`)) {
    index++;
  }
  
  return `fig-${index}`;
};

// Check if a figure ID follows the fig-X format
const isFigureIdFormat = (id: string | undefined): boolean => {
  return !!id && /^fig-\d+$/.test(id);
};

export const FigureIdPlugin = createPlatePlugin({
  key: 'figureId',
  extendEditor: ({ editor }) => {
    const { normalizeNode } = editor;

    editor.normalizeNode = (entry) => {
      const [node, path] = entry;
      
      // Check for image type (handle both KEYS.img and literal 'img')
      const nodeType = (node as any).type;
      const isImageNode = nodeType === KEYS.img || nodeType === 'img';
      
      if (isImageNode) {
        const id = (node as any).id as string | undefined;
        
        // If no ID, or ID is not in fig-X format, assign a new one
        if (!isFigureIdFormat(id)) {
          const newId = getNextFigureId(editor);
          editor.tf.setNodes({ id: newId }, { at: path });
          return;
        }
      }

      normalizeNode(entry);
    };

    return editor;
  },
});
