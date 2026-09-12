import React, { useEffect, useRef, useState } from 'react'
import { renderAsync } from 'docx-preview'
import { translate } from '@/i18n/i18n'

type OfficeDocumentViewerProps = {
  /** DOCX blob delivered as base64 (matching FileContent.content). */
  content: string
  filePath: string
}

type RenderState = 'loading' | 'ready' | 'error'

// Why: docx-preview needs raw bytes; the renderer has no global Buffer, so
// decode base64 with atob (available in the browser and Node >= 16).
function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

export default function OfficeDocumentViewer({
  content,
  filePath
}: OfficeDocumentViewerProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<RenderState>('loading')

  useEffect(() => {
    let cancelled = false
    const container = containerRef.current
    if (!container) {
      return
    }
    container.innerHTML = ''
    setState('loading')
    renderAsync(base64ToBytes(content), container, container, {
      className: 'orca-docx',
      inWrapper: true,
      breakPages: true,
      ignoreLastRenderedPageBreak: true,
      // Why: keep images/fonts inline so nothing dangles as an object URL.
      useBase64URL: true
    })
      .then(() => {
        if (!cancelled) {
          setState('ready')
        }
      })
      .catch((error) => {
        console.error('[office-document] failed to render', error)
        if (!cancelled) {
          setState('error')
        }
      })
    return () => {
      cancelled = true
      container.innerHTML = ''
    }
  }, [content])

  return (
    <div className="relative h-full min-h-0 overflow-auto scrollbar-editor bg-muted/30">
      {state === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
          {translate('auto.components.editor.OfficeDocumentViewer.loading', 'Loading document…')}
        </div>
      )}
      {state === 'error' && (
        <div className="absolute inset-0 flex items-center justify-center p-6 text-sm text-muted-foreground">
          {translate(
            'auto.components.editor.OfficeDocumentViewer.readFailed',
            'The document could not be displayed.'
          )}
        </div>
      )}
      <div
        ref={containerRef}
        data-docx-path={filePath}
        className="mx-auto w-fit py-6"
        style={{ display: state === 'error' ? 'none' : undefined }}
      />
    </div>
  )
}
