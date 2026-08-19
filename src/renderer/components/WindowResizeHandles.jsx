import React, { useCallback, useEffect, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { PhysicalSize, PhysicalPosition } from '@tauri-apps/api/dpi';

/**
 * Four corner drag-handles that resize the current Tauri window programmatically.
 *
 * Lets a window stay fully borderless (`resizable: false`) on Windows so the DWM
 * resize frame (the four-side black border) never appears, while still being
 * resizable by dragging the corners — mirroring the native border drag behavior.
 */
export default function WindowResizeHandles({ minWidth = 200, minHeight = 150 }) {
  const [resizeStart, setResizeStart] = useState(null);
  const [isResizing, setIsResizing] = useState(false);

  const handleResizeStart = useCallback(async (e, corner) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const win = getCurrentWindow();
      const startSize = await win.outerSize();
      const startPos = await win.outerPosition();
      setIsResizing(true);
      setResizeStart({
        x: e.clientX,
        y: e.clientY,
        corner,
        width: startSize.width,
        height: startSize.height,
        posX: startPos.x,
        posY: startPos.y,
      });
    } catch (err) {
      console.error('Failed to start resize:', err);
    }
  }, []);

  useEffect(() => {
    if (!isResizing || !resizeStart) return undefined;

    const handleMouseMove = (e) => {
      const dpr = window.devicePixelRatio || 1;
      const dx = (e.clientX - resizeStart.x) * dpr;
      const dy = (e.clientY - resizeStart.y) * dpr;
      const { corner, width, height, posX, posY } = resizeStart;

      let newWidth = width;
      let newHeight = height;
      let newX = posX;
      let newY = posY;

      switch (corner) {
        case 'se':
          newWidth = Math.max(minWidth, width + dx);
          newHeight = Math.max(minHeight, height + dy);
          break;
        case 'sw':
          newWidth = Math.max(minWidth, width - dx);
          newHeight = Math.max(minHeight, height + dy);
          newX = posX + width - newWidth;
          break;
        case 'ne':
          newWidth = Math.max(minWidth, width + dx);
          newHeight = Math.max(minHeight, height - dy);
          newY = posY + height - newHeight;
          break;
        case 'nw':
        default:
          newWidth = Math.max(minWidth, width - dx);
          newHeight = Math.max(minHeight, height - dy);
          newX = posX + width - newWidth;
          newY = posY + height - newHeight;
          break;
      }

      const win = getCurrentWindow();
      Promise.all([
        win.setSize(new PhysicalSize(newWidth, newHeight)),
        win.setPosition(new PhysicalPosition(newX, newY)),
      ]).catch(() => {});
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      setResizeStart(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, resizeStart, minWidth, minHeight]);

  return (
    <>
      <div
        className="absolute top-0 left-0 w-4 h-4 cursor-nw-resize z-40"
        onMouseDown={(e) => handleResizeStart(e, 'nw')}
      />
      <div
        className="absolute top-0 right-0 w-4 h-4 cursor-ne-resize z-40"
        onMouseDown={(e) => handleResizeStart(e, 'ne')}
      />
      <div
        className="absolute bottom-0 left-0 w-4 h-4 cursor-sw-resize z-40"
        onMouseDown={(e) => handleResizeStart(e, 'sw')}
      />
      <div
        className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize z-40"
        onMouseDown={(e) => handleResizeStart(e, 'se')}
      />
    </>
  );
}
