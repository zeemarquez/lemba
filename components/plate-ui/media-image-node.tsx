'use client';

import { useDraggable } from '@platejs/dnd';
import { ImagePlugin, useMediaState } from '@platejs/media/react';
import { ResizableProvider, useResizableValue } from '@platejs/resizable';
import type { TImageElement } from 'platejs';
import type { PlateElementProps } from 'platejs/react';
import { PlateElement, withHOC } from 'platejs/react';
import * as React from 'react';

import { cn } from '@/lib/utils';
import { useIndexedDbImage } from '@/hooks/use-indexed-db-image';

import { Caption, CaptionTextarea } from './caption';
import { MediaToolbar } from './media-toolbar';
import {
  mediaResizeHandleVariants,
  Resizable,
  ResizeHandle,
} from './resize-handle';

/**
 * Custom Image component that handles IndexedDB URLs
 */
function IndexedDbImage({
  url,
  alt,
  className,
  imgRef,
}: {
  url: string | undefined;
  alt?: string;
  className?: string;
  imgRef?: React.Ref<HTMLImageElement>;
}) {
  const { resolvedUrl, isLoading, error } = useIndexedDbImage(url);

  if (isLoading) {
    return (
      <div className={cn('flex items-center justify-center bg-muted', className)} style={{ minHeight: 100 }}>
        <div className="animate-pulse text-muted-foreground text-sm">Loading image...</div>
      </div>
    );
  }

  if (error || !resolvedUrl) {
    return (
      <div className={cn('flex flex-col items-center justify-center bg-muted/50 border border-dashed border-muted-foreground/30 rounded-sm', className)} style={{ minHeight: 120, minWidth: 200 }}>
        <svg className="w-10 h-10 text-muted-foreground/40 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <span className="text-muted-foreground/60 text-sm">Could not find image</span>
      </div>
    );
  }

  return (
    <img
      ref={imgRef}
      src={resolvedUrl}
      alt={alt || ''}
      className={className}
      draggable={false}
    />
  );
}

export const ImageElement = withHOC(
  ResizableProvider,
  function ImageElement(props: PlateElementProps<TImageElement>) {
    const { align = 'center', focused, readOnly, selected } = useMediaState();
    const width = useResizableValue('width');

    const { isDragging, handleRef } = useDraggable({
      element: props.element,
    });

    // Get the image URL from the element
    const imageUrl = props.element.url as string | undefined;

    return (
      <MediaToolbar plugin={ImagePlugin}>
        <PlateElement {...props} className="py-2.5">
          <figure className="group relative m-0" contentEditable={false}>
            <Resizable
              align={align}
              options={{
                align,
                readOnly,
              }}
            >
              <ResizeHandle
                className={mediaResizeHandleVariants({ direction: 'left' })}
                options={{ direction: 'left' }}
              />
              <IndexedDbImage
                url={imageUrl}
                alt={props.element.alt as string | undefined}
                className={cn(
                  'block w-full max-w-full cursor-pointer object-cover px-0',
                  'rounded-sm',
                  focused && selected && 'ring-2 ring-ring ring-offset-2',
                  isDragging && 'opacity-50'
                )}
                imgRef={handleRef}
              />
              <ResizeHandle
                className={mediaResizeHandleVariants({
                  direction: 'right',
                })}
                options={{ direction: 'right' }}
              />
            </Resizable>

            <Caption align={align} style={{ width }}>
              <CaptionTextarea
                onFocus={(e) => {
                  e.preventDefault();
                }}
                placeholder="Write a caption..."
                readOnly={readOnly}
              />
            </Caption>
          </figure>

          {props.children}
        </PlateElement>
      </MediaToolbar>
    );
  }
);
